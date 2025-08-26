const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Import routes
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const dataRoutes = require('./routes/data');
const alertRoutes = require('./routes/alerts');

// Import models
const SensorData = require('./models/SensorData');
const Device = require('./models/Device');
const Alert = require('./models/Alert');

// Import middleware
const { auth: authMiddleware } = require('./middleware/auth');

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lifelink-health-monitor', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', authMiddleware, deviceRoutes);
app.use('/api/data', dataRoutes); // No auth for ESP32 data posting
app.use('/api/alerts', authMiddleware, alertRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/device-setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'device-setup.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join device-specific rooms
  socket.on('join-device', (deviceId) => {
    socket.join(`device-${deviceId}`);
    console.log(`Socket ${socket.id} joined room: device-${deviceId}`);
  });

  // Join user-specific rooms
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`Socket ${socket.id} joined room: user-${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Real-time data broadcasting function
const broadcastSensorData = (deviceId, data) => {
  io.to(`device-${deviceId}`).emit('sensor-data', data);
  io.emit('global-sensor-data', { deviceId, data });
};

// Real-time alert broadcasting function
const broadcastAlert = (alert) => {
  if (alert.userId) {
    io.to(`user-${alert.userId}`).emit('alert', alert);
  }
  io.to(`device-${alert.deviceId}`).emit('device-alert', alert);
  io.emit('global-alert', alert);
};

// Make broadcast functions available globally
app.set('broadcastSensorData', broadcastSensorData);
app.set('broadcastAlert', broadcastAlert);
app.set('io', io);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(error.status || 500).json({
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'Something went wrong!' 
        : error.message,
      status: error.status || 500
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.SERVER_HOST || 'localhost';

server.listen(PORT, HOST, () => {
  console.log(`🚀 LifeLink Health Monitor Server running on http://${HOST}:${PORT}`);
  console.log(`📊 Dashboard: http://${HOST}:${PORT}/dashboard`);
  console.log(`🔐 Login: http://${HOST}:${PORT}/login`);
  console.log(`⚙️  Device Setup: http://${HOST}:${PORT}/device-setup`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await mongoose.connection.close();
  server.close(() => {
    console.log('✅ Server shut down successfully');
    process.exit(0);
  });
});

module.exports = { app, server, io };
