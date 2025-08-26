const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { createRateLimit } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = createRateLimit(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
const registrationLimiter = createRateLimit(60 * 60 * 1000, 3); // 3 registrations per hour

// Validation rules
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),
  
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters'),
  
  body('phone')
    .optional()
    .matches(/^\+91\d{10}$/)
    .withMessage('Please provide a valid phone number in format +91XXXXXXXXXX'),
  
  body('age')
    .isInt({ min: 1, max: 120 })
    .withMessage('Age must be between 1 and 120'),
    
  body('gender')
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),
    
  body('emergencyContact.phone')
    .matches(/^\+91\d{10}$/)
    .withMessage('Emergency contact phone must be in format +91XXXXXXXXXX'),
    
  body('emergencyContact.name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Emergency contact name is required')
];

const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username or email is required'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', registrationLimiter, registerValidation, async (req, res) => {
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

    const { username, email, password, firstName, lastName, phone, age, gender, emergencyContact, role = 'patient' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(409).json({
        error: {
          message: existingUser.email === email 
            ? 'User with this email already exists' 
            : 'Username is already taken',
          status: 409
        }
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      profile: {
        firstName,
        lastName,
        phone,
        dateOfBirth: age ? new Date(new Date().getFullYear() - age, 0, 1) : undefined,
        gender
      },
      medicalInfo: {
        emergencyContact: {
          name: emergencyContact?.name,
          phone: emergencyContact?.phone
        }
      },
      role: ['patient', 'caregiver', 'doctor'].includes(role) ? role : 'patient'
    });

    // Generate verification token
    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    // Send verification email (in production)
    // await sendVerificationEmail(user.email, verificationToken);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        role: user.role,
        isVerified: user.status.isVerified
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during registration',
        status: 500
      }
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, loginValidation, async (req, res) => {
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

    const { username, password, rememberMe = false } = req.body;

    // Find user by username or email
    const user = await User.findOne({
      $or: [
        { username: username },
        { email: username }
      ]
    });
    
    if (!user) {
      return res.status(401).json({
        error: {
          message: 'Invalid username/email or password',
          status: 401
        }
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        error: {
          message: 'Account is temporarily locked due to too many failed login attempts',
          status: 423
        }
      });
    }

    // Check if account is active
    if (!user.status.isActive) {
      return res.status(403).json({
        error: {
          message: 'Account is deactivated',
          status: 403
        }
      });
    }

    // Validate password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      // Increment failed login attempts
      await user.incLoginAttempts();
      
      return res.status(401).json({
        error: {
          message: 'Invalid username/email or password',
          status: 401
        }
      });
    }

    // Reset login attempts on successful login
    if (user.security.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update login statistics
    user.status.lastLogin = new Date();
    user.status.loginCount += 1;
    await user.save();

    // Generate JWT token
    const tokenExpiry = rememberMe ? '30d' : (process.env.JWT_EXPIRE || '24h');
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: tokenExpiry }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        role: user.role,
        isVerified: user.status.isVerified,
        lastLogin: user.status.lastLogin,
        devices: user.devices
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during login',
        status: 500
      }
    });
  }
});

// @route   GET /api/auth/verify
// @desc    Verify JWT token
// @access  Private
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: {
          message: 'No token provided',
          status: 401
        }
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.status.isActive) {
      return res.status(401).json({
        error: {
          message: 'Invalid token or inactive user',
          status: 401
        }
      });
    }

    res.json({
      valid: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        role: user.role,
        isVerified: user.status.isVerified
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          message: 'Token expired',
          status: 401
        }
      });
    }

    console.error('Token verification error:', error);
    res.status(401).json({
      error: {
        message: 'Invalid token',
        status: 401
      }
    });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email address
// @access  Public
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: {
          message: 'Verification token is required',
          status: 400
        }
      });
    }

    const user = await User.findOne({
      'status.verificationToken': token,
      'status.verificationExpires': { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        error: {
          message: 'Invalid or expired verification token',
          status: 400
        }
      });
    }

    user.status.isVerified = true;
    user.status.verificationToken = undefined;
    user.status.verificationExpires = undefined;
    await user.save();

    res.json({
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during email verification',
        status: 500
      }
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', createRateLimit(60 * 60 * 1000, 3), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: {
          message: 'Email is required',
          status: 400
        }
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // Send password reset email (in production)
    // await sendPasswordResetEmail(user.email, resetToken);

    res.json({
      message: 'If an account with that email exists, a password reset link has been sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during password reset request',
        status: 500
      }
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: {
          message: 'Token and new password are required',
          status: 400
        }
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: {
          message: 'Password must be at least 6 characters long',
          status: 400
        }
      });
    }

    const crypto = require('crypto');
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      'security.passwordResetToken': hashedToken,
      'security.passwordResetExpires': { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        error: {
          message: 'Invalid or expired password reset token',
          status: 400
        }
      });
    }

    user.password = password;
    user.security.passwordResetToken = undefined;
    user.security.passwordResetExpires = undefined;
    user.security.lastPasswordChange = new Date();
    await user.save();

    res.json({
      message: 'Password reset successful'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during password reset',
        status: 500
      }
    });
  }
});

// @route   POST /api/auth/refresh-token
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: {
          message: 'Token is required',
          status: 400
        }
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.status.isActive) {
      return res.status(401).json({
        error: {
          message: 'Invalid token or inactive user',
          status: 401
        }
      });
    }

    const newToken = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    res.json({
      token: newToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        role: user.role
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          message: 'Token expired',
          status: 401
        }
      });
    }

    console.error('Token refresh error:', error);
    res.status(500).json({
      error: {
        message: 'Server error during token refresh',
        status: 500
      }
    });
  }
});

module.exports = router;
