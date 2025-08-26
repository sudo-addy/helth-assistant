const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  
  // Personal Information
  profile: {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String, default: 'India' }
    },
    avatar: { type: String }, // URL to profile picture
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] }
  },
  
  // User Role and Permissions
  role: {
    type: String,
    enum: ['patient', 'caregiver', 'doctor', 'admin'],
    default: 'patient'
  },
  permissions: [{
    type: String,
    enum: ['read', 'write', 'admin', 'emergency_contact']
  }],
  
  // Associated Devices
  devices: [{
    deviceId: { type: String, required: true },
    deviceName: { type: String },
    relationship: { 
      type: String, 
      enum: ['owner', 'caregiver', 'emergency_contact', 'doctor'],
      default: 'owner'
    },
    permissions: [{
      type: String,
      enum: ['view_data', 'receive_alerts', 'modify_settings', 'emergency_access']
    }],
    addedDate: { type: Date, default: Date.now }
  }],
  
  // Notification Preferences
  notifications: {
    email: {
      enabled: { type: Boolean, default: true },
      alerts: { type: Boolean, default: true },
      dailyReports: { type: Boolean, default: false },
      weeklyReports: { type: Boolean, default: true },
      systemUpdates: { type: Boolean, default: true }
    },
    sms: {
      enabled: { type: Boolean, default: false },
      emergencyOnly: { type: Boolean, default: true },
      phone: { type: String }
    },
    push: {
      enabled: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
      vibration: { type: Boolean, default: true }
    }
  },
  
  // Security Settings
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    lastPasswordChange: { type: Date, default: Date.now }
  },
  
  // User Preferences
  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    units: {
      temperature: { type: String, enum: ['celsius', 'fahrenheit'], default: 'celsius' },
      weight: { type: String, enum: ['kg', 'lbs'], default: 'kg' },
      height: { type: String, enum: ['cm', 'ft'], default: 'cm' },
      distance: { type: String, enum: ['km', 'miles'], default: 'km' }
    }
  },
  
  // Account Status
  status: {
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationExpires: { type: Date },
    lastLogin: { type: Date },
    loginCount: { type: Number, default: 0 }
  },
  
  // Medical Information (for patients)
  medicalInfo: {
    bloodType: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    height: { type: Number }, // in cm
    weight: { type: Number }, // in kg
    allergies: [{ type: String }],
    medicalConditions: [{ type: String }],
    medications: [{
      name: { type: String },
      dosage: { type: String },
      frequency: { type: String },
      startDate: { type: Date },
      endDate: { type: Date }
    }],
    emergencyContact: {
      name: { type: String },
      phone: { type: String },
      relationship: { type: String }
    },
    doctor: {
      name: { type: String },
      phone: { type: String },
      hospital: { type: String },
      specialization: { type: String }
    }
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'devices.deviceId': 1 });
userSchema.index({ role: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'security.lockUntil': 1 },
      $set: { 'security.loginAttempts': 1 }
    });
  }
  
  const updates = { $inc: { 'security.loginAttempts': 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.security.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { 'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: {
      'security.loginAttempts': 1,
      'security.lockUntil': 1
    }
  });
};

// Method to add device to user
userSchema.methods.addDevice = function(deviceId, deviceName, relationship = 'owner', permissions = []) {
  const existingDevice = this.devices.find(d => d.deviceId === deviceId);
  
  if (existingDevice) {
    existingDevice.deviceName = deviceName;
    existingDevice.relationship = relationship;
    existingDevice.permissions = permissions;
  } else {
    this.devices.push({
      deviceId,
      deviceName,
      relationship,
      permissions
    });
  }
  
  return this.save();
};

// Method to remove device from user
userSchema.methods.removeDevice = function(deviceId) {
  this.devices = this.devices.filter(d => d.deviceId !== deviceId);
  return this.save();
};

// Method to check if user has access to device
userSchema.methods.hasDeviceAccess = function(deviceId, requiredPermission = 'view_data') {
  const device = this.devices.find(d => d.deviceId === deviceId);
  if (!device) return false;
  
  // Admin and owners have full access
  if (this.role === 'admin' || device.relationship === 'owner') {
    return true;
  }
  
  // Check specific permissions
  return device.permissions.includes(requiredPermission);
};

// Method to generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.security.passwordResetToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  this.security.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return token;
};

// Method to generate email verification token
userSchema.methods.generateVerificationToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.status.verificationToken = token;
  this.status.verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return token;
};

// Static method to find user by device
userSchema.statics.findByDevice = function(deviceId) {
  return this.find({ 'devices.deviceId': deviceId });
};

// Static method to find emergency contacts for a device
userSchema.statics.findEmergencyContacts = function(deviceId) {
  return this.find({
    'devices.deviceId': deviceId,
    'devices.relationship': { $in: ['emergency_contact', 'caregiver'] }
  });
};

module.exports = mongoose.model('User', userSchema);
