const express = require('express');
const { body, validationResult, query } = require('express-validator');
const SensorData = require('../models/SensorData');
const Device = require('../models/Device');
const Alert = require('../models/Alert');
const { apiKey, auth, deviceAccess, createRateLimit } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for data routes
const dataPostLimiter = createRateLimit(1 * 60 * 1000, 60); // 60 requests per minute for ESP32
const dataGetLimiter = createRateLimit(1 * 60 * 1000, 100); // 100 requests per minute for dashboard

// Validation rules for sensor data
const sensorDataValidation = [
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required'),
  
  body('heartRate.value')
    .optional()
    .isFloat({ min: 0, max: 300 })
    .withMessage('Heart rate must be between 0 and 300 BPM'),
  
  body('spO2.value')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('SpO2 must be between 0 and 100%'),
  
  body('bodyTemperature.value')
    .optional()
    .isFloat({ min: 30, max: 45 })
    .withMessage('Body temperature must be between 30 and 45°C'),
  
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  body('device.batteryLevel')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Battery level must be between 0 and 100%')
];

// @route   POST /api/data/sensor
// @desc    Receive sensor data from ESP32 devices
// @access  ESP32 devices with API key
router.post('/sensor', dataPostLimiter, apiKey, sensorDataValidation, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          status: 400,
          details: errors.array()
        }
      });
    }

    const sensorData = new SensorData({
      ...req.body,
      deviceId: req.device.deviceId,
      deviceName: req.device.deviceName,
      timestamp: new Date()
    });

    // Update device status
    await req.device.updateStatus({
      batteryLevel: req.body.device?.batteryLevel,
      signalStrength: req.body.device?.signalStrength,
      connectionType: req.body.device?.connectionType || 'wifi',
      firmwareVersion: req.body.metadata?.firmwareVersion,
      uptime: req.body.device?.uptime,
      location: req.body.location
    });

    // Save sensor data
    await sensorData.save();

    // Check for emergency conditions
    const emergencies = sensorData.checkEmergencyConditions();
    
    // Create alerts for emergency conditions
    for (const emergency of emergencies) {
      const alert = new Alert({
        deviceId: sensorData.deviceId,
        deviceName: sensorData.deviceName,
        type: emergency.type,
        severity: emergency.severity,
        title: `${emergency.type.replace('_', ' ').toUpperCase()}`,
        message: emergency.message,
        data: {
          value: emergency.value,
          threshold: getThresholdForAlert(emergency.type),
          unit: getUnitForAlert(emergency.type),
          sensorData: sensorData._id
        },
        location: sensorData.location,
        context: await getDeviceContext(req.device)
      });

      await alert.save();

      // Broadcast alert in real-time
      const broadcastAlert = req.app.get('broadcastAlert');
      if (broadcastAlert) {
        broadcastAlert(alert);
      }

      // Send notifications (implement based on requirements)
      await sendAlertNotifications(alert, req.device);
    }

    // Broadcast sensor data in real-time
    const broadcastSensorData = req.app.get('broadcastSensorData');
    if (broadcastSensorData) {
      broadcastSensorData(sensorData.deviceId, sensorData);
    }

    res.status(201).json({
      message: 'Sensor data received successfully',
      dataId: sensorData._id,
      alertsGenerated: emergencies.length,
      timestamp: sensorData.timestamp
    });

  } catch (error) {
    console.error('Sensor data error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while processing sensor data',
        status: 500
      }
    });
  }
});

// @route   GET /api/data/sensor/:deviceId
// @desc    Get sensor data for a device
// @access  Private with device access
router.get('/sensor/:deviceId', dataGetLimiter, auth, deviceAccess('view_data'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { 
      limit = 50, 
      page = 1, 
      startDate, 
      endDate, 
      dataType,
      latest = false 
    } = req.query;

    // Build query
    const query = { deviceId };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    let result;

    if (latest === 'true') {
      // Get latest data point
      result = await SensorData.findOne(query)
        .sort({ timestamp: -1 })
        .limit(1);
        
      return res.json({
        data: result,
        count: result ? 1 : 0
      });
    }

    // Get paginated data
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const data = await SensorData.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalCount = await SensorData.countDocuments(query);

    res.json({
      data,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + data.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get sensor data error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while retrieving sensor data',
        status: 500
      }
    });
  }
});

// @route   GET /api/data/sensor/:deviceId/analytics
// @desc    Get analytics for device sensor data
// @access  Private with device access
router.get('/sensor/:deviceId/analytics', auth, deviceAccess('view_data'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { timeRange = '24h' } = req.query;

    // Calculate time range
    const endTime = new Date();
    let startTime = new Date();
    
    switch (timeRange) {
      case '1h':
        startTime.setHours(endTime.getHours() - 1);
        break;
      case '6h':
        startTime.setHours(endTime.getHours() - 6);
        break;
      case '24h':
        startTime.setDate(endTime.getDate() - 1);
        break;
      case '7d':
        startTime.setDate(endTime.getDate() - 7);
        break;
      case '30d':
        startTime.setDate(endTime.getDate() - 30);
        break;
      default:
        startTime.setDate(endTime.getDate() - 1);
    }

    // Aggregation pipeline
    const analytics = await SensorData.aggregate([
      {
        $match: {
          deviceId,
          timestamp: { $gte: startTime, $lte: endTime }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgHeartRate: { $avg: '$heartRate.value' },
          minHeartRate: { $min: '$heartRate.value' },
          maxHeartRate: { $max: '$heartRate.value' },
          avgSpO2: { $avg: '$spO2.value' },
          minSpO2: { $min: '$spO2.value' },
          avgTemperature: { $avg: '$bodyTemperature.value' },
          minTemperature: { $min: '$bodyTemperature.value' },
          maxTemperature: { $max: '$bodyTemperature.value' },
          avgBatteryLevel: { $avg: '$device.batteryLevel' },
          minBatteryLevel: { $min: '$device.batteryLevel' },
          fallDetections: {
            $sum: {
              $cond: [{ $eq: ['$motion.fallDetected', true] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Get hourly trends
    const trends = await SensorData.aggregate([
      {
        $match: {
          deviceId,
          timestamp: { $gte: startTime, $lte: endTime }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d %H:00',
              date: '$timestamp'
            }
          },
          avgHeartRate: { $avg: '$heartRate.value' },
          avgSpO2: { $avg: '$spO2.value' },
          avgTemperature: { $avg: '$bodyTemperature.value' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const result = {
      summary: analytics[0] || {
        count: 0,
        avgHeartRate: null,
        avgSpO2: null,
        avgTemperature: null
      },
      trends,
      timeRange,
      generatedAt: new Date()
    };

    res.json(result);

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while generating analytics',
        status: 500
      }
    });
  }
});

// @route   DELETE /api/data/sensor/:deviceId
// @desc    Delete sensor data (admin only)
// @access  Private admin
router.delete('/sensor/:deviceId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          message: 'Admin access required',
          status: 403
        }
      });
    }

    const { deviceId } = req.params;
    const { olderThan } = req.query;

    let deleteQuery = { deviceId };
    
    if (olderThan) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThan));
      deleteQuery.timestamp = { $lt: cutoffDate };
    }

    const result = await SensorData.deleteMany(deleteQuery);

    res.json({
      message: `Successfully deleted ${result.deletedCount} sensor data records`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Delete sensor data error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while deleting sensor data',
        status: 500
      }
    });
  }
});

// Helper functions
function getThresholdForAlert(alertType) {
  const thresholds = {
    'heart_rate_abnormal': { min: 50, max: 120 },
    'spo2_low': { min: 95 },
    'temperature_abnormal': { min: 35.5, max: 38.5 },
    'battery_low': { min: 15 }
  };
  
  return thresholds[alertType] || null;
}

function getUnitForAlert(alertType) {
  const units = {
    'heart_rate_abnormal': 'bpm',
    'spo2_low': '%',
    'temperature_abnormal': '°C',
    'battery_low': '%'
  };
  
  return units[alertType] || '';
}

async function getDeviceContext(device) {
  return {
    patientName: device.owner.fullName,
    patientAge: device.owner.age,
    emergencyContact: device.owner.emergencyContact,
    medicalHistory: device.owner.medicalConditions || [],
    currentMedications: device.owner.medications?.map(med => med.name) || [],
    doctorContact: device.owner.hospitalContact
  };
}

async function sendAlertNotifications(alert, device) {
  try {
    // This is where you would integrate with email/SMS services
    // For now, we'll just log the alert
    console.log(`🚨 ALERT: ${alert.severity.toUpperCase()} - ${alert.message}`);
    console.log(`📱 Device: ${device.deviceName} (${device.deviceId})`);
    console.log(`👤 Patient: ${device.owner.fullName}`);
    
    if (device.owner.emergencyContact) {
      console.log(`📞 Emergency Contact: ${device.owner.emergencyContact.name} - ${device.owner.emergencyContact.phone}`);
    }

    // TODO: Implement actual notification services
    // - Email notifications using Nodemailer
    // - SMS notifications using Twilio
    // - Push notifications
    
    return true;
  } catch (error) {
    console.error('Error sending alert notifications:', error);
    return false;
  }
}

module.exports = router;
