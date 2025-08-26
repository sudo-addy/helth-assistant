const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  deviceName: {
    type: String,
    required: true
  },
  
  // Alert Classification
  type: {
    type: String,
    required: true,
    enum: [
      'heart_rate_abnormal',
      'spo2_low',
      'temperature_abnormal',
      'fall_detected',
      'battery_low',
      'device_offline',
      'sensor_malfunction',
      'emergency_button',
      'location_outside_safe_zone',
      'medication_reminder',
      'inactivity_detected',
      'panic_alert'
    ]
  },
  
  severity: {
    type: String,
    required: true,
    enum: ['info', 'warning', 'critical', 'emergency'],
    default: 'warning'
  },
  
  // Alert Content
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  
  // Alert Data
  data: {
    value: mongoose.Schema.Types.Mixed, // The actual value that triggered the alert
    threshold: mongoose.Schema.Types.Mixed, // The threshold that was exceeded
    unit: { type: String },
    sensorData: { type: mongoose.Schema.Types.ObjectId, ref: 'SensorData' }
  },
  
  // Location Information
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String },
    accuracy: { type: Number }
  },
  
  // Alert Status
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved', 'false_positive'],
    default: 'active'
  },
  
  // Response Information
  response: {
    acknowledgedBy: { type: String }, // User ID or contact info
    acknowledgedAt: { type: Date },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
    responseTime: { type: Number }, // Time to acknowledgment in seconds
    notes: { type: String }
  },
  
  // Notification Status
  notifications: {
    sent: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
      webhook: { type: Boolean, default: false }
    },
    attempts: {
      email: { type: Number, default: 0 },
      sms: { type: Number, default: 0 },
      push: { type: Number, default: 0 },
      webhook: { type: Number, default: 0 }
    },
    lastAttempt: {
      email: { type: Date },
      sms: { type: Date },
      push: { type: Date },
      webhook: { type: Date }
    },
    recipients: [{
      type: { type: String, enum: ['email', 'sms', 'push'] },
      address: { type: String }, // email or phone number
      name: { type: String },
      relationship: { type: String },
      delivered: { type: Boolean, default: false },
      deliveredAt: { type: Date }
    }]
  },
  
  // Alert Context
  context: {
    patientName: { type: String },
    patientAge: { type: Number },
    emergencyContact: {
      name: { type: String },
      phone: { type: String },
      relationship: { type: String }
    },
    medicalHistory: [{ type: String }],
    currentMedications: [{ type: String }],
    doctorContact: {
      name: { type: String },
      phone: { type: String },
      hospital: { type: String }
    }
  },
  
  // Technical Information
  technical: {
    triggeredBy: { type: String }, // Algorithm or sensor name
    confidence: { type: Number, min: 0, max: 1 }, // Confidence level (0-1)
    falsePositiveProbability: { type: Number, min: 0, max: 1 },
    relatedAlerts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alert' }],
    deviceStatus: {
      batteryLevel: { type: Number },
      signalStrength: { type: Number },
      lastSeen: { type: Date }
    }
  },
  
  // Escalation Information
  escalation: {
    level: { type: Number, default: 1 },
    escalatedAt: { type: Date },
    escalationRules: [{
      level: { type: Number },
      timeThreshold: { type: Number }, // minutes before escalation
      contacts: [{ type: String }] // phone numbers or emails
    }],
    maxEscalationLevel: { type: Number, default: 3 }
  },
  
  // Metadata
  metadata: {
    source: { type: String, default: 'device' },
    version: { type: String },
    tags: [{ type: String }],
    category: { type: String },
    priority: { type: Number, min: 1, max: 5, default: 3 }
  }
}, {
  timestamps: true,
  collection: 'alerts'
});

// Indexes
alertSchema.index({ deviceId: 1, createdAt: -1 });
alertSchema.index({ status: 1 });
alertSchema.index({ severity: 1 });
alertSchema.index({ type: 1 });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ 'escalation.escalatedAt': 1 });

// TTL index to automatically delete resolved alerts older than 90 days
alertSchema.index(
  { createdAt: 1 }, 
  { 
    expireAfterSeconds: 7776000, // 90 days
    partialFilterExpression: { status: { $in: ['resolved', 'false_positive'] } }
  }
);

// Virtual for alert age
alertSchema.virtual('ageInMinutes').get(function() {
  return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60));
});

// Virtual for response time
alertSchema.virtual('responseTimeMinutes').get(function() {
  if (!this.response.acknowledgedAt) return null;
  return Math.floor((this.response.acknowledgedAt.getTime() - this.createdAt.getTime()) / (1000 * 60));
});

// Method to acknowledge alert
alertSchema.methods.acknowledge = function(acknowledgedBy, notes = '') {
  this.status = 'acknowledged';
  this.response.acknowledgedBy = acknowledgedBy;
  this.response.acknowledgedAt = new Date();
  this.response.responseTime = Math.floor((Date.now() - this.createdAt.getTime()) / 1000);
  
  if (notes) {
    this.response.notes = notes;
  }
  
  return this.save();
};

// Method to resolve alert
alertSchema.methods.resolve = function(resolvedBy, notes = '') {
  this.status = 'resolved';
  this.response.resolvedBy = resolvedBy;
  this.response.resolvedAt = new Date();
  
  if (notes) {
    this.response.notes = (this.response.notes || '') + '\n' + notes;
  }
  
  return this.save();
};

// Method to mark as false positive
alertSchema.methods.markAsFalsePositive = function(markedBy, notes = '') {
  this.status = 'false_positive';
  this.response.resolvedBy = markedBy;
  this.response.resolvedAt = new Date();
  this.response.notes = (this.response.notes || '') + '\nMarked as false positive: ' + notes;
  
  return this.save();
};

// Method to escalate alert
alertSchema.methods.escalate = function() {
  if (this.escalation.level < this.escalation.maxEscalationLevel) {
    this.escalation.level += 1;
    this.escalation.escalatedAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to check if alert needs escalation
alertSchema.methods.needsEscalation = function() {
  if (this.status !== 'active') return false;
  
  const currentLevel = this.escalation.level;
  const escalationRule = this.escalation.escalationRules.find(rule => rule.level === currentLevel + 1);
  
  if (!escalationRule) return false;
  
  const minutesSinceCreated = this.ageInMinutes;
  return minutesSinceCreated >= escalationRule.timeThreshold;
};

// Method to update notification status
alertSchema.methods.updateNotificationStatus = function(type, success, recipient = null) {
  this.notifications.attempts[type] = (this.notifications.attempts[type] || 0) + 1;
  this.notifications.lastAttempt[type] = new Date();
  
  if (success) {
    this.notifications.sent[type] = true;
    
    if (recipient) {
      const existingRecipient = this.notifications.recipients.find(r => r.address === recipient.address);
      if (existingRecipient) {
        existingRecipient.delivered = true;
        existingRecipient.deliveredAt = new Date();
      } else {
        this.notifications.recipients.push({
          type,
          address: recipient.address,
          name: recipient.name,
          relationship: recipient.relationship,
          delivered: true,
          deliveredAt: new Date()
        });
      }
    }
  }
  
  return this.save();
};

// Static method to get active alerts for a device
alertSchema.statics.getActiveAlerts = function(deviceId) {
  return this.find({
    deviceId,
    status: 'active'
  }).sort({ createdAt: -1 });
};

// Static method to get alerts that need escalation
alertSchema.statics.getAlertsNeedingEscalation = function() {
  return this.find({
    status: 'active',
    'escalation.level': { $lt: '$escalation.maxEscalationLevel' }
  });
};

// Static method to get alert statistics
alertSchema.statics.getStatistics = function(deviceId, startDate, endDate) {
  const matchStage = { deviceId };
  
  if (startDate && endDate) {
    matchStage.createdAt = { $gte: startDate, $lte: endDate };
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          type: '$type',
          severity: '$severity'
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$response.responseTime' },
        resolved: {
          $sum: {
            $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0]
          }
        },
        falsePositives: {
          $sum: {
            $cond: [{ $eq: ['$status', 'false_positive'] }, 1, 0]
          }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Pre-save middleware to set default escalation rules
alertSchema.pre('save', function(next) {
  if (this.isNew && this.escalation.escalationRules.length === 0) {
    // Set default escalation rules based on severity
    switch (this.severity) {
      case 'emergency':
        this.escalation.escalationRules = [
          { level: 1, timeThreshold: 0, contacts: [] },
          { level: 2, timeThreshold: 2, contacts: [] },
          { level: 3, timeThreshold: 5, contacts: [] }
        ];
        break;
      case 'critical':
        this.escalation.escalationRules = [
          { level: 1, timeThreshold: 0, contacts: [] },
          { level: 2, timeThreshold: 5, contacts: [] },
          { level: 3, timeThreshold: 15, contacts: [] }
        ];
        break;
      case 'warning':
        this.escalation.escalationRules = [
          { level: 1, timeThreshold: 0, contacts: [] },
          { level: 2, timeThreshold: 15, contacts: [] },
          { level: 3, timeThreshold: 60, contacts: [] }
        ];
        break;
      default:
        this.escalation.escalationRules = [
          { level: 1, timeThreshold: 0, contacts: [] },
          { level: 2, timeThreshold: 60, contacts: [] }
        ];
        this.escalation.maxEscalationLevel = 2;
    }
  }
  next();
});

module.exports = mongoose.model('Alert', alertSchema);
