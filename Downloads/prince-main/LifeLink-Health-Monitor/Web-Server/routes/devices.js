const express = require('express');
const { body, validationResult } = require('express-validator');
const Device = require('../models/Device');
const User = require('../models/User');
const { deviceAccess } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/devices
// @desc    Get all devices for the authenticated user
// @access  Private
router.get('/', async (req, res) => {
  try {
    let devices;
    
    if (req.user.role === 'admin') {
      // Admin can see all devices
      devices = await Device.find().sort({ createdAt: -1 });
    } else {
      // Regular users can only see their associated devices
      const deviceIds = req.user.devices.map(d => d.deviceId);
      devices = await Device.find({ deviceId: { $in: deviceIds } }).sort({ createdAt: -1 });
    }
    
    res.json({
      devices,
      count: devices.length
    });
    
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while retrieving devices',
        status: 500
      }
    });
  }
});

// @route   GET /api/devices/:deviceId
// @desc    Get specific device information
// @access  Private with device access
router.get('/:deviceId', deviceAccess('view_data'), async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    
    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          status: 404
        }
      });
    }
    
    res.json(device);
    
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while retrieving device',
        status: 500
      }
    });
  }
});

// @route   POST /api/devices
// @desc    Register a new device
// @access  Private
router.post('/', [
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required'),
  body('macAddress')
    .notEmpty()
    .withMessage('MAC address is required'),
  body('deviceName')
    .notEmpty()
    .withMessage('Device name is required'),
  body('deviceType')
    .isIn(['ESP32-1', 'ESP32-2', 'combined'])
    .withMessage('Invalid device type')
], async (req, res) => {
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
    
    const { deviceId, macAddress, deviceName, deviceType } = req.body;
    
    // Check if device already exists
    const existingDevice = await Device.findOne({
      $or: [{ deviceId }, { macAddress }]
    });
    
    if (existingDevice) {
      return res.status(409).json({
        error: {
          message: 'Device already registered',
          status: 409
        }
      });
    }
    
    // Create new device
    const device = new Device({
      deviceId,
      macAddress,
      deviceName,
      deviceType,
      owner: {
        fullName: req.user.fullName || `${req.user.profile.firstName} ${req.user.profile.lastName}`,
        emergencyContact: {
          name: req.body.emergencyContactName || '',
          phone: req.body.emergencyContactPhone || '',
          relationship: 'emergency_contact'
        }
      }
    });
    
    await device.save();
    
    // Add device to user's device list
    await req.user.addDevice(deviceId, deviceName, 'owner', [
      'view_data', 'receive_alerts', 'modify_settings', 'emergency_access'
    ]);
    
    res.status(201).json({
      message: 'Device registered successfully',
      device: {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        isSetup: device.setupInfo.isSetup
      }
    });
    
  } catch (error) {
    console.error('Register device error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while registering device',
        status: 500
      }
    });
  }
});

// @route   PUT /api/devices/:deviceId
// @desc    Update device configuration
// @access  Private with device access
router.put('/:deviceId', deviceAccess('modify_settings'), async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    
    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          status: 404
        }
      });
    }
    
    // Update allowed fields
    const allowedUpdates = [
      'deviceName', 'configuration', 'owner'
    ];
    
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        if (key === 'configuration' || key === 'owner') {
          // Merge objects instead of replacing
          device[key] = { ...device[key], ...req.body[key] };
        } else {
          device[key] = req.body[key];
        }
      }
    }
    
    await device.save();
    
    res.json({
      message: 'Device updated successfully',
      device
    });
    
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while updating device',
        status: 500
      }
    });
  }
});

// @route   DELETE /api/devices/:deviceId
// @desc    Delete/unregister device
// @access  Private with device access (owner only)
router.delete('/:deviceId', deviceAccess('modify_settings'), async (req, res) => {
  try {
    // Only device owner or admin can delete
    if (req.user.role !== 'admin') {
      const userDevice = req.user.devices.find(d => d.deviceId === req.params.deviceId);
      if (!userDevice || userDevice.relationship !== 'owner') {
        return res.status(403).json({
          error: {
            message: 'Only device owner can delete the device',
            status: 403
          }
        });
      }
    }
    
    const device = await Device.findOneAndDelete({ deviceId: req.params.deviceId });
    
    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          status: 404
        }
      });
    }
    
    // Remove device from all users
    await User.updateMany(
      { 'devices.deviceId': req.params.deviceId },
      { $pull: { devices: { deviceId: req.params.deviceId } } }
    );
    
    res.json({
      message: 'Device deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while deleting device',
        status: 500
      }
    });
  }
});

// @route   GET /api/devices/:deviceId/status
// @desc    Get device online status and health
// @access  Private with device access
router.get('/:deviceId/status', deviceAccess('view_data'), async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    
    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          status: 404
        }
      });
    }
    
    const status = {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      isOnline: device.isActive,
      lastSeen: device.status.lastSeen,
      batteryLevel: device.status.batteryLevel,
      signalStrength: device.status.signalStrength,
      connectionType: device.status.connectionType,
      firmwareVersion: device.status.firmwareVersion,
      uptime: device.status.uptime,
      location: device.status.location
    };
    
    res.json(status);
    
  } catch (error) {
    console.error('Get device status error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while retrieving device status',
        status: 500
      }
    });
  }
});

// @route   POST /api/devices/:deviceId/setup
// @desc    Complete device setup
// @access  Public (uses setup token)
router.post('/:deviceId/setup', [
  body('setupToken')
    .notEmpty()
    .withMessage('Setup token is required'),
  body('owner.fullName')
    .notEmpty()
    .withMessage('Full name is required'),
  body('owner.emergencyContact.name')
    .notEmpty()
    .withMessage('Emergency contact name is required'),
  body('owner.emergencyContact.phone')
    .notEmpty()
    .withMessage('Emergency contact phone is required')
], async (req, res) => {
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
    
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    
    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          status: 404
        }
      });
    }
    
    // Validate setup token
    if (!device.validateSetupToken(req.body.setupToken)) {
      return res.status(400).json({
        error: {
          message: 'Invalid or expired setup token',
          status: 400
        }
      });
    }
    
    // Complete setup
    await device.completeSetup({
      setupBy: req.ip,
      owner: req.body.owner,
      networkConfig: req.body.networkConfig
    });
    
    res.json({
      message: 'Device setup completed successfully',
      deviceId: device.deviceId
    });
    
  } catch (error) {
    console.error('Device setup error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during device setup',
        status: 500
      }
    });
  }
});

// @route   GET /api/devices/:deviceId/qr
// @desc    Generate QR code for device setup
// @access  Private with device access
router.get('/:deviceId/qr', deviceAccess('modify_settings'), async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    
    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          status: 404
        }
      });
    }
    
    const qrData = device.generateSetupQR();
    
    res.json({
      qrCode: qrData,
      deviceId: device.deviceId,
      setupUrl: `http://192.168.4.1/setup?device=${device.deviceId}`
    });
    
  } catch (error) {
    console.error('Generate QR error:', error);
    res.status(500).json({
      error: {
        message: 'Server error while generating QR code',
        status: 500
      }
    });
  }
});

module.exports = router;
