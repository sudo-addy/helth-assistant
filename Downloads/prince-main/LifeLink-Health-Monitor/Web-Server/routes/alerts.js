const express = require('express');
const { query } = require('express-validator');
const Alert = require('../models/Alert');
const { deviceAccess } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/alerts
// @desc    Get alerts for user's devices
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { 
      status = 'all',
      severity = 'all',
      limit = 50,
      page = 1,
      startDate,
      endDate
    } = req.query;

    // Build query based on user's device access
    let deviceIds;
    if (req.user.role === 'admin') {
      // Admin can see all alerts
      deviceIds = null;
    } else {
      // Regular users can only see alerts from their devices
      deviceIds = req.user.devices.map(d => d.deviceId);
    }

    const query = deviceIds ? { deviceId: { $in: deviceIds } } : {};

    // Add filters
    if (status !== 'all') {
      query.status = status;
    }

    if (severity !== 'all') {
      query.severity = severity;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('data.sensorData', 'timestamp');

    const totalCount = await Alert.countDocuments(query);

    res.json({
      alerts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + alerts.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while retrieving alerts',
        status: 500
      }
    });
  }
});

// @route   GET /api/alerts/:alertId
// @desc    Get specific alert details
// @access  Private with device access
router.get('/:alertId', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId)
      .populate('data.sensorData');

    if (!alert) {
      return res.status(404).json({
        error: {
          message: 'Alert not found',
          status: 404
        }
      });
    }

    // Check if user has access to this device
    if (req.user.role !== 'admin') {
      const hasAccess = req.user.devices.some(d => d.deviceId === alert.deviceId);
      if (!hasAccess) {
        return res.status(403).json({
          error: {
            message: 'Access denied to this alert',
            status: 403
          }
        });
      }
    }

    res.json(alert);

  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while retrieving alert',
        status: 500
      }
    });
  }
});

// @route   PUT /api/alerts/:alertId/acknowledge
// @desc    Acknowledge an alert
// @access  Private
router.put('/:alertId/acknowledge', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId);

    if (!alert) {
      return res.status(404).json({
        error: {
          message: 'Alert not found',
          status: 404
        }
      });
    }

    // Check if user has access to this device
    if (req.user.role !== 'admin') {
      const hasAccess = req.user.devices.some(d => d.deviceId === alert.deviceId);
      if (!hasAccess) {
        return res.status(403).json({
          error: {
            message: 'Access denied to this alert',
            status: 403
          }
        });
      }
    }

    if (alert.status !== 'active') {
      return res.status(400).json({
        error: {
          message: 'Alert is not in active status',
          status: 400
        }
      });
    }

    const { notes } = req.body;
    await alert.acknowledge(req.user.id, notes);

    // Broadcast alert update
    const io = req.app.get('io');
    if (io) {
      io.emit('alert-updated', {
        alertId: alert._id,
        status: 'acknowledged',
        acknowledgedBy: req.user.fullName || req.user.username
      });
    }

    res.json({
      message: 'Alert acknowledged successfully',
      alert
    });

  } catch (error) {
    console.error('Acknowledge alert error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while acknowledging alert',
        status: 500
      }
    });
  }
});

// @route   PUT /api/alerts/:alertId/resolve
// @desc    Resolve an alert
// @access  Private
router.put('/:alertId/resolve', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId);

    if (!alert) {
      return res.status(404).json({
        error: {
          message: 'Alert not found',
          status: 404
        }
      });
    }

    // Check if user has access to this device
    if (req.user.role !== 'admin') {
      const hasAccess = req.user.devices.some(d => d.deviceId === alert.deviceId);
      if (!hasAccess) {
        return res.status(403).json({
          error: {
            message: 'Access denied to this alert',
            status: 403
          }
        });
      }
    }

    const { notes } = req.body;
    await alert.resolve(req.user.id, notes);

    // Broadcast alert update
    const io = req.app.get('io');
    if (io) {
      io.emit('alert-updated', {
        alertId: alert._id,
        status: 'resolved',
        resolvedBy: req.user.fullName || req.user.username
      });
    }

    res.json({
      message: 'Alert resolved successfully',
      alert
    });

  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while resolving alert',
        status: 500
      }
    });
  }
});

// @route   PUT /api/alerts/:alertId/false-positive
// @desc    Mark alert as false positive
// @access  Private
router.put('/:alertId/false-positive', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId);

    if (!alert) {
      return res.status(404).json({
        error: {
          message: 'Alert not found',
          status: 404
        }
      });
    }

    // Check if user has access to this device
    if (req.user.role !== 'admin') {
      const hasAccess = req.user.devices.some(d => d.deviceId === alert.deviceId);
      if (!hasAccess) {
        return res.status(403).json({
          error: {
            message: 'Access denied to this alert',
            status: 403
          }
        });
      }
    }

    const { notes } = req.body;
    await alert.markAsFalsePositive(req.user.id, notes);

    // Broadcast alert update
    const io = req.app.get('io');
    if (io) {
      io.emit('alert-updated', {
        alertId: alert._id,
        status: 'false_positive',
        markedBy: req.user.fullName || req.user.username
      });
    }

    res.json({
      message: 'Alert marked as false positive',
      alert
    });

  } catch (error) {
    console.error('Mark false positive error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while marking alert as false positive',
        status: 500
      }
    });
  }
});

// @route   GET /api/alerts/device/:deviceId
// @desc    Get alerts for specific device
// @access  Private with device access
router.get('/device/:deviceId', deviceAccess('view_data'), async (req, res) => {
  try {
    const { 
      status = 'all',
      severity = 'all',
      limit = 50,
      page = 1 
    } = req.query;

    const query = { deviceId: req.params.deviceId };

    // Add filters
    if (status !== 'all') {
      query.status = status;
    }

    if (severity !== 'all') {
      query.severity = severity;
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalCount = await Alert.countDocuments(query);

    res.json({
      alerts,
      deviceId: req.params.deviceId,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + alerts.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get device alerts error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while retrieving device alerts',
        status: 500
      }
    });
  }
});

// @route   GET /api/alerts/active/count
// @desc    Get count of active alerts
// @access  Private
router.get('/active/count', async (req, res) => {
  try {
    let query = { status: 'active' };

    // Filter by user's devices if not admin
    if (req.user.role !== 'admin') {
      const deviceIds = req.user.devices.map(d => d.deviceId);
      query.deviceId = { $in: deviceIds };
    }

    const count = await Alert.countDocuments(query);

    res.json({ activeAlertsCount: count });

  } catch (error) {
    console.error('Get active alerts count error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while counting active alerts',
        status: 500
      }
    });
  }
});

// @route   GET /api/alerts/statistics
// @desc    Get alert statistics
// @access  Private
router.get('/statistics/summary', async (req, res) => {
  try {
    const { deviceId, startDate, endDate } = req.query;
    
    let matchStage = {};

    // Filter by user's devices if not admin
    if (req.user.role !== 'admin') {
      const deviceIds = req.user.devices.map(d => d.deviceId);
      matchStage.deviceId = { $in: deviceIds };
    }

    // Filter by specific device if requested
    if (deviceId) {
      matchStage.deviceId = deviceId;
    }

    // Filter by date range
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const statistics = await Alert.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalAlerts: { $sum: 1 },
          activeAlerts: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          acknowledgedAlerts: {
            $sum: { $cond: [{ $eq: ['$status', 'acknowledged'] }, 1, 0] }
          },
          resolvedAlerts: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          },
          falsePositiveAlerts: {
            $sum: { $cond: [{ $eq: ['$status', 'false_positive'] }, 1, 0] }
          },
          criticalAlerts: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
          },
          warningAlerts: {
            $sum: { $cond: [{ $eq: ['$severity', 'warning'] }, 1, 0] }
          },
          emergencyAlerts: {
            $sum: { $cond: [{ $eq: ['$severity', 'emergency'] }, 1, 0] }
          },
          avgResponseTime: { $avg: '$response.responseTime' }
        }
      }
    ]);

    // Get alert type breakdown
    const alertTypes = await Alert.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$response.responseTime' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      summary: statistics[0] || {
        totalAlerts: 0,
        activeAlerts: 0,
        acknowledgedAlerts: 0,
        resolvedAlerts: 0,
        falsePositiveAlerts: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
        emergencyAlerts: 0,
        avgResponseTime: 0
      },
      alertTypes,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Get alert statistics error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while generating alert statistics',
        status: 500
      }
    });
  }
});

// @route   DELETE /api/alerts/bulk
// @desc    Bulk delete resolved/false positive alerts
// @access  Private (admin only)
router.delete('/bulk', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          message: 'Admin access required',
          status: 403
        }
      });
    }

    const { status, olderThan } = req.query;

    let deleteQuery = {};

    if (status) {
      deleteQuery.status = { $in: status.split(',') };
    } else {
      // Default: only delete resolved or false positive alerts
      deleteQuery.status = { $in: ['resolved', 'false_positive'] };
    }

    if (olderThan) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThan));
      deleteQuery.createdAt = { $lt: cutoffDate };
    }

    const result = await Alert.deleteMany(deleteQuery);

    res.json({
      message: `Successfully deleted ${result.deletedCount} alerts`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Bulk delete alerts error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while deleting alerts',
        status: 500
      }
    });
  }
});

module.exports = router;
