const mongoose = require('mongoose');

const sensorDataSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  deviceName: {
    type: String,
    default: 'Unknown Device'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Health Monitoring Data
  heartRate: {
    value: { type: Number, min: 0, max: 300 },
    unit: { type: String, default: 'bpm' },
    quality: { type: String, enum: ['good', 'fair', 'poor'], default: 'good' }
  },
  
  spO2: {
    value: { type: Number, min: 0, max: 100 },
    unit: { type: String, default: '%' },
    quality: { type: String, enum: ['good', 'fair', 'poor'], default: 'good' }
  },
  
  bodyTemperature: {
    value: { type: Number, min: 30, max: 45 },
    unit: { type: String, default: '°C' },
    sensorType: { type: String, default: 'DS18B20' }
  },
  
  // ECG Data (optional)
  ecg: {
    rawValue: { type: Number },
    processed: { type: Number },
    rInterval: { type: Number }, // R-R interval in ms
    quality: { type: String, enum: ['good', 'fair', 'poor', 'noisy'] }
  },
  
  // Environmental Data
  environmental: {
    pressure: {
      value: { type: Number },
      unit: { type: String, default: 'Pa' }
    },
    altitude: {
      value: { type: Number },
      unit: { type: String, default: 'm' }
    },
    ambientTemperature: {
      value: { type: Number },
      unit: { type: String, default: '°C' }
    }
  },
  
  // Motion and Fall Detection
  motion: {
    accelerometer: {
      x: { type: Number },
      y: { type: Number },
      z: { type: Number },
      magnitude: { type: Number }
    },
    fallDetected: { type: Boolean, default: false },
    activityLevel: { type: String, enum: ['rest', 'light', 'moderate', 'vigorous'], default: 'rest' }
  },
  
  // Location Data
  location: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    altitude: { type: Number },
    accuracy: { type: Number }, // in meters
    speed: { type: Number }, // in km/h
    heading: { type: Number } // in degrees
  },
  
  // Device Status
  device: {
    batteryLevel: { type: Number, min: 0, max: 100 },
    batteryVoltage: { type: Number },
    signalStrength: { type: Number }, // RSSI for WiFi/GSM
    connectionType: { type: String, enum: ['wifi', 'gsm', 'offline'], default: 'wifi' },
    uptime: { type: Number }, // in seconds
    freeMemory: { type: Number } // in bytes
  },
  
  // Data Quality and Validation
  dataQuality: {
    overall: { type: String, enum: ['excellent', 'good', 'fair', 'poor'], default: 'good' },
    sensorStatus: {
      heartRate: { type: Boolean, default: true },
      spO2: { type: Boolean, default: true },
      temperature: { type: Boolean, default: true },
      accelerometer: { type: Boolean, default: true },
      gps: { type: Boolean, default: true }
    }
  },
  
  // Metadata
  metadata: {
    firmwareVersion: { type: String },
    samplingRate: { type: Number }, // samples per minute
    processingTime: { type: Number }, // ms taken to process data
    dataSize: { type: Number } // size of raw data in bytes
  }
}, {
  timestamps: true,
  collection: 'sensor_data'
});

// Indexes for better query performance
sensorDataSchema.index({ deviceId: 1, timestamp: -1 });
sensorDataSchema.index({ timestamp: -1 });
sensorDataSchema.index({ 'motion.fallDetected': 1 });
sensorDataSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days TTL

// Virtual for formatted timestamp
sensorDataSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toLocaleString();
});

// Method to check if data is recent (within last 5 minutes)
sensorDataSchema.methods.isRecent = function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.timestamp > fiveMinutesAgo;
};

// Method to check for emergency conditions
sensorDataSchema.methods.checkEmergencyConditions = function() {
  const emergencies = [];
  
  // Heart rate emergencies
  if (this.heartRate && this.heartRate.value) {
    if (this.heartRate.value < 50 || this.heartRate.value > 120) {
      emergencies.push({
        type: 'heart_rate_abnormal',
        severity: this.heartRate.value < 40 || this.heartRate.value > 140 ? 'critical' : 'warning',
        value: this.heartRate.value,
        message: `Heart rate ${this.heartRate.value} BPM is ${this.heartRate.value < 50 ? 'too low' : 'too high'}`
      });
    }
  }
  
  // SpO2 emergencies
  if (this.spO2 && this.spO2.value) {
    if (this.spO2.value < 95) {
      emergencies.push({
        type: 'spo2_low',
        severity: this.spO2.value < 90 ? 'critical' : 'warning',
        value: this.spO2.value,
        message: `Blood oxygen level ${this.spO2.value}% is dangerously low`
      });
    }
  }
  
  // Temperature emergencies
  if (this.bodyTemperature && this.bodyTemperature.value) {
    if (this.bodyTemperature.value > 38.5 || this.bodyTemperature.value < 35.5) {
      emergencies.push({
        type: 'temperature_abnormal',
        severity: this.bodyTemperature.value > 40 || this.bodyTemperature.value < 35 ? 'critical' : 'warning',
        value: this.bodyTemperature.value,
        message: `Body temperature ${this.bodyTemperature.value}°C is ${this.bodyTemperature.value > 38.5 ? 'too high' : 'too low'}`
      });
    }
  }
  
  // Fall detection
  if (this.motion && this.motion.fallDetected) {
    emergencies.push({
      type: 'fall_detected',
      severity: 'critical',
      value: true,
      message: 'Fall detected! Immediate attention required.'
    });
  }
  
  // Battery level emergency
  if (this.device && this.device.batteryLevel && this.device.batteryLevel < 10) {
    emergencies.push({
      type: 'battery_low',
      severity: this.device.batteryLevel < 5 ? 'critical' : 'warning',
      value: this.device.batteryLevel,
      message: `Device battery level is critically low: ${this.device.batteryLevel}%`
    });
  }
  
  return emergencies;
};

// Static method to get latest data for a device
sensorDataSchema.statics.getLatestByDevice = function(deviceId) {
  return this.findOne({ deviceId }).sort({ timestamp: -1 });
};

// Static method to get data within time range
sensorDataSchema.statics.getDataInTimeRange = function(deviceId, startTime, endTime) {
  return this.find({
    deviceId,
    timestamp: { $gte: startTime, $lte: endTime }
  }).sort({ timestamp: 1 });
};

module.exports = mongoose.model('SensorData', sensorDataSchema);
