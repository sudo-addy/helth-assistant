const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: {
          message: 'Access denied. No token provided.',
          status: 401
        }
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -security.twoFactorSecret');
    
    if (!user) {
      return res.status(401).json({
        error: {
          message: 'Invalid token. User not found.',
          status: 401
        }
      });
    }

    if (!user.status.isActive) {
      return res.status(403).json({
        error: {
          message: 'Account is deactivated.',
          status: 403
        }
      });
    }

    if (user.isLocked) {
      return res.status(423).json({
        error: {
          message: 'Account is temporarily locked due to too many failed login attempts.',
          status: 423
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          message: 'Token expired. Please login again.',
          status: 401
        }
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: {
          message: 'Invalid token.',
          status: 401
        }
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during authentication.',
        status: 500
      }
    });
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -security.twoFactorSecret');
    
    if (user && user.status.isActive && !user.isLocked) {
      req.user = user;
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Access denied. Authentication required.',
          status: 401
        }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          message: `Access denied. Required role: ${roles.join(' or ')}`,
          status: 403
        }
      });
    }

    next();
  };
};

// Device access middleware
const deviceAccess = (permission = 'view_data') => {
  return async (req, res, next) => {
    try {
      const deviceId = req.params.deviceId || req.body.deviceId || req.query.deviceId;
      
      if (!deviceId) {
        return res.status(400).json({
          error: {
            message: 'Device ID is required.',
            status: 400
          }
        });
      }

      if (!req.user) {
        return res.status(401).json({
          error: {
            message: 'Authentication required.',
            status: 401
          }
        });
      }

      // Admin users have access to all devices
      if (req.user.role === 'admin') {
        req.deviceId = deviceId;
        return next();
      }

      // Check if user has access to this specific device
      const hasAccess = req.user.hasDeviceAccess(deviceId, permission);
      
      if (!hasAccess) {
        return res.status(403).json({
          error: {
            message: 'Access denied. You do not have permission to access this device.',
            status: 403
          }
        });
      }

      req.deviceId = deviceId;
      next();
    } catch (error) {
      console.error('Device access middleware error:', error);
      res.status(500).json({
        error: {
          message: 'Server error during device access check.',
          status: 500
        }
      });
    }
  };
};

// Emergency access middleware (bypasses normal auth for emergency situations)
const emergencyAccess = async (req, res, next) => {
  try {
    const emergencyToken = req.header('Emergency-Token');
    const deviceId = req.params.deviceId || req.body.deviceId;
    
    if (!emergencyToken || !deviceId) {
      return res.status(400).json({
        error: {
          message: 'Emergency token and device ID are required.',
          status: 400
        }
      });
    }

    // Verify emergency token (this could be a special token or device-specific code)
    const Device = require('../models/Device');
    const device = await Device.findOne({ deviceId });
    
    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found.',
          status: 404
        }
      });
    }

    // For emergency situations, we might use a special emergency code
    // This is a simplified version - in production, implement proper emergency authentication
    if (emergencyToken === `emergency-${deviceId}-${process.env.JWT_SECRET}`.slice(0, 16)) {
      req.emergencyAccess = true;
      req.deviceId = deviceId;
      req.device = device;
      return next();
    }

    res.status(403).json({
      error: {
        message: 'Invalid emergency token.',
        status: 403
      }
    });
  } catch (error) {
    console.error('Emergency access middleware error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during emergency access check.',
        status: 500
      }
    });
  }
};

// API key middleware for ESP32 devices
const apiKey = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    const deviceId = req.header('X-Device-ID') || req.body.deviceId;
    
    if (!apiKey || !deviceId) {
      return res.status(400).json({
        error: {
          message: 'API key and device ID are required.',
          status: 400
        }
      });
    }

    // For simplicity, we're using device MAC address as API key
    // In production, implement proper API key management
    const Device = require('../models/Device');
    const device = await Device.findOne({ 
      deviceId,
      macAddress: apiKey // Using MAC address as simple API key
    });
    
    if (!device) {
      return res.status(401).json({
        error: {
          message: 'Invalid API key or device ID.',
          status: 401
        }
      });
    }

    req.device = device;
    req.deviceId = deviceId;
    next();
  } catch (error) {
    console.error('API key middleware error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during API key validation.',
        status: 500
      }
    });
  }
};

// Rate limiting middleware for specific routes
const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: {
      error: {
        message: 'Too many requests, please try again later.',
        status: 429
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Input validation middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: {
          message: error.details[0].message,
          status: 400,
          validation: error.details
        }
      });
    }
    
    next();
  };
};

module.exports = {
  auth,
  optionalAuth,
  authorize,
  deviceAccess,
  emergencyAccess,
  apiKey,
  createRateLimit,
  validateInput
};
