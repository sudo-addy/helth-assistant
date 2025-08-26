const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  macAddress: {
    type: String,
    required: true,
    unique: true
  },
  deviceName: {
    type: String,
    required: true,
    trim: true
  },
  deviceType: {
    type: String,
    enum: ['ESP32-1', 'ESP32-2', 'combined'],
    required: true
  },
  
  // User Information
  owner: {
    fullName: { type: String, required: true, trim: true },
    age: { type: Number, min: 0, max: 150 },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    bloodType: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    medicalConditions: [{ type: String }],
    medications: [{ 
      name: String, 
      dosage: String, 
      frequency: String 
    }],
    emergencyContact: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      relationship: { type: String }
    },
    hospitalContact: {
      name: { type: String },
      phone: { type: String },
      address: { type: String }
    }
  },
  
  // Network Configuration
  networkConfig: {
    homeWifiSSID: { type: String },
    homeWifiPassword: { type: String }, // This should be encrypted in production
    preferredConnection: { type: String, enum: ['wifi', 'gsm'], default: 'wifi' },
    gsmApn: { type: String, default: 'internet' }
  },
  
  // Device Configuration
  configuration: {
    samplingInterval: { type: Number, default: 30 }, // seconds
    alertThresholds: {
      heartRate: {
        min: { type: Number, default: 50 },
        max: { type: Number, default: 120 }
      },
      spO2: {
        min: { type: Number, default: 95 }
      },
      temperature: {
        min: { type: Number, default: 35.5 },
        max: { type: Number, default: 38.5 }
      },
      batteryLevel: {
        min: { type: Number, default: 15 }
      }
    },
    features: {
      fallDetection: { type: Boolean, default: true },
      heartRateMonitoring: { type: Boolean, default: true },
      temperatureMonitoring: { type: Boolean, default: true },
      locationTracking: { type: Boolean, default: true },
      ecgMonitoring: { type: Boolean, default: false },
      dataLogging: { type: Boolean, default: true }
    },
    displaySettings: {
      autoSleep: { type: Number, default: 30 }, // seconds
      brightness: { type: Number, min: 0, max: 100, default: 80 },
      showHeartRate: { type: Boolean, default: true },
      showTemperature: { type: Boolean, default: true },
      showBattery: { type: Boolean, default: true }
    }
  },
  
  // Device Status
  status: {
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    connectionType: { type: String, enum: ['wifi', 'gsm', 'offline'], default: 'offline' },
    firmwareVersion: { type: String },
    batteryLevel: { type: Number, min: 0, max: 100 },
    signalStrength: { type: Number },
    uptime: { type: Number }, // in seconds
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      lastUpdated: { type: Date }
    }
  },
  
  // Device Setup Information
  setupInfo: {
    isSetup: { type: Boolean, default: false },
    setupDate: { type: Date },
    setupBy: { type: String }, // IP address or user ID
    qrCode: { type: String }, // Generated QR code for easy setup
    setupToken: { type: String }, // Temporary token for device setup
    setupTokenExpires: { type: Date }
  },
  
  // Statistics and Usage
  statistics: {
    totalDataPoints: { type: Number, default: 0 },
    totalAlerts: { type: Number, default: 0 },
    lastAlert: { type: Date },
    averageHeartRate: { type: Number },
    averageTemperature: { type: Number },
    totalUptime: { type: Number, default: 0 } // in hours
  },
  
  // Maintenance and Support
  maintenance: {
    lastCalibration: { type: Date },
    nextMaintenanceDue: { type: Date },
    warrantyExpires: { type: Date },
    supportNotes: [{ 
      date: { type: Date, default: Date.now },
      note: { type: String },
      technician: { type: String }
    }]
  }
}, {
  timestamps: true,
  collection: 'devices'
});

// Indexes
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ macAddress: 1 });
deviceSchema.index({ 'owner.emergencyContact.phone': 1 });
deviceSchema.index({ 'status.isOnline': 1 });
deviceSchema.index({ 'status.lastSeen': -1 });

// Virtual for device display name
deviceSchema.virtual('displayName').get(function() {
  return `${this.deviceName} (${this.deviceId})`;
});

// Virtual to check if device is recently active (within 5 minutes)
deviceSchema.virtual('isActive').get(function() {
  if (!this.status.lastSeen) return false;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.status.lastSeen > fiveMinutesAgo;
});

// Method to update device status
deviceSchema.methods.updateStatus = function(statusData) {
  this.status.lastSeen = new Date();
  this.status.isOnline = true;
  
  if (statusData.batteryLevel !== undefined) {
    this.status.batteryLevel = statusData.batteryLevel;
  }
  
  if (statusData.signalStrength !== undefined) {
    this.status.signalStrength = statusData.signalStrength;
  }
  
  if (statusData.connectionType) {
    this.status.connectionType = statusData.connectionType;
  }
  
  if (statusData.firmwareVersion) {
    this.status.firmwareVersion = statusData.firmwareVersion;
  }
  
  if (statusData.uptime !== undefined) {
    this.status.uptime = statusData.uptime;
  }
  
  if (statusData.location) {
    this.status.location = {
      ...statusData.location,
      lastUpdated: new Date()
    };
  }
  
  return this.save();
};

// Method to generate setup QR code data
deviceSchema.methods.generateSetupQR = function() {
  const setupData = {
    deviceId: this.deviceId,
    deviceName: this.deviceName,
    setupUrl: `http://192.168.4.1/setup?device=${this.deviceId}`,
    timestamp: Date.now()
  };
  
  this.setupInfo.qrCode = JSON.stringify(setupData);
  return this.setupInfo.qrCode;
};

// Method to generate setup token
deviceSchema.methods.generateSetupToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.setupInfo.setupToken = token;
  this.setupInfo.setupTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  
  return token;
};

// Method to validate setup token
deviceSchema.methods.validateSetupToken = function(token) {
  return this.setupInfo.setupToken === token && 
         this.setupInfo.setupTokenExpires > new Date();
};

// Method to complete setup
deviceSchema.methods.completeSetup = function(setupData) {
  this.setupInfo.isSetup = true;
  this.setupInfo.setupDate = new Date();
  this.setupInfo.setupBy = setupData.setupBy || 'unknown';
  this.setupInfo.setupToken = undefined;
  this.setupInfo.setupTokenExpires = undefined;
  
  // Update owner information
  if (setupData.owner) {
    this.owner = { ...this.owner, ...setupData.owner };
  }
  
  // Update network configuration
  if (setupData.networkConfig) {
    this.networkConfig = { ...this.networkConfig, ...setupData.networkConfig };
  }
  
  return this.save();
};

// Method to check if device needs maintenance
deviceSchema.methods.needsMaintenance = function() {
  if (!this.maintenance.nextMaintenanceDue) return false;
  return this.maintenance.nextMaintenanceDue < new Date();
};

// Static method to find devices by user
deviceSchema.statics.findByEmergencyContact = function(phoneNumber) {
  return this.find({ 'owner.emergencyContact.phone': phoneNumber });
};

// Static method to get online devices
deviceSchema.statics.getOnlineDevices = function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.find({ 
    'status.lastSeen': { $gte: fiveMinutesAgo },
    'status.isOnline': true 
  });
};

// Pre-save middleware to update statistics
deviceSchema.pre('save', function(next) {
  if (this.isNew) {
    // Set default maintenance schedule for new devices
    this.maintenance.nextMaintenanceDue = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
  }
  next();
});

module.exports = mongoose.model('Device', deviceSchema);
