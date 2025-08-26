// Environment configuration
const config = {
  development: {
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lifelink-health-dev',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        retryWrites: true,
        w: 'majority'
      }
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'lifelink-dev-secret-key-change-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    server: {
      port: process.env.PORT || 3000,
      host: process.env.HOST || 'localhost'
    },
    cors: {
      origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:8080'],
      credentials: true
    },
    security: {
      bcryptRounds: 12,
      rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
      rateLimitMax: 100 // requests per windowMs
    },
    sms: {
      provider: 'textlocal', // or 'twilio'
      textlocal: {
        apikey: process.env.TEXTLOCAL_API_KEY || 'your-textlocal-api-key',
        username: process.env.TEXTLOCAL_USERNAME || 'your-textlocal-username',
        hash: process.env.TEXTLOCAL_HASH || 'your-textlocal-hash',
        sender: process.env.SMS_SENDER || 'LIFELINK'
      },
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER
      }
    },
    logging: {
      level: 'debug',
      file: './logs/app.log',
      maxFiles: 5,
      maxsize: '10m'
    }
  },

  production: {
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lifelink-health',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        retryWrites: true,
        w: 'majority',
        ssl: process.env.MONGODB_SSL === 'true',
        replicaSet: process.env.MONGODB_REPLICA_SET
      }
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    },
    server: {
      port: process.env.PORT || 3000,
      host: process.env.HOST || '0.0.0.0'
    },
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
      credentials: true
    },
    security: {
      bcryptRounds: 14,
      rateLimitWindowMs: 15 * 60 * 1000,
      rateLimitMax: 50
    },
    sms: {
      provider: process.env.SMS_PROVIDER || 'textlocal',
      textlocal: {
        apikey: process.env.TEXTLOCAL_API_KEY,
        username: process.env.TEXTLOCAL_USERNAME,
        hash: process.env.TEXTLOCAL_HASH,
        sender: process.env.SMS_SENDER || 'LIFELINK'
      },
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER
      }
    },
    logging: {
      level: 'info',
      file: './logs/app.log',
      maxFiles: 10,
      maxsize: '50m'
    }
  },

  test: {
    mongodb: {
      uri: process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/lifelink-health-test',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    },
    jwt: {
      secret: 'test-secret-key',
      expiresIn: '1h'
    },
    server: {
      port: process.env.TEST_PORT || 3001,
      host: 'localhost'
    },
    cors: {
      origin: true,
      credentials: true
    },
    security: {
      bcryptRounds: 4, // Faster for testing
      rateLimitWindowMs: 1 * 60 * 1000,
      rateLimitMax: 1000
    },
    sms: {
      provider: 'mock'
    },
    logging: {
      level: 'error'
    }
  }
};

const environment = process.env.NODE_ENV || 'development';
const currentConfig = config[environment];

if (!currentConfig) {
  throw new Error(`Configuration for environment "${environment}" not found`);
}

// Validation for production
if (environment === 'production') {
  const requiredEnvVars = [
    'MONGODB_URI',
    'JWT_SECRET'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Warn about SMS configuration
  if (!process.env.TEXTLOCAL_API_KEY && !process.env.TWILIO_ACCOUNT_SID) {
    console.warn('Warning: No SMS provider configured. Emergency alerts will not be sent via SMS.');
  }
}

// Export configuration with additional helper functions
module.exports = {
  ...currentConfig,
  
  // Helper functions
  isProduction: () => environment === 'production',
  isDevelopment: () => environment === 'development',
  isTest: () => environment === 'test',
  
  // Get current environment
  getEnvironment: () => environment,
  
  // Database connection string with fallback
  getDatabaseUri: () => {
    return currentConfig.mongodb.uri;
  },
  
  // Validate required configuration
  validate: () => {
    const errors = [];
    
    if (!currentConfig.jwt.secret) {
      errors.push('JWT secret is required');
    }
    
    if (!currentConfig.mongodb.uri) {
      errors.push('MongoDB URI is required');
    }
    
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
    
    return true;
  },
  
  // SMS configuration helper
  getSMSConfig: () => {
    const smsConfig = currentConfig.sms;
    
    if (smsConfig.provider === 'textlocal') {
      return {
        provider: 'textlocal',
        config: smsConfig.textlocal
      };
    } else if (smsConfig.provider === 'twilio') {
      return {
        provider: 'twilio',
        config: smsConfig.twilio
      };
    } else {
      return {
        provider: 'mock',
        config: {}
      };
    }
  }
};

// Log current configuration (without sensitive data)
console.log(`Application starting in ${environment} mode`);
console.log(`Database: ${currentConfig.mongodb.uri.replace(/\/\/.*@/, '//***:***@')}`);
console.log(`Server: ${currentConfig.server.host}:${currentConfig.server.port}`);
console.log(`SMS Provider: ${currentConfig.sms.provider}`);
