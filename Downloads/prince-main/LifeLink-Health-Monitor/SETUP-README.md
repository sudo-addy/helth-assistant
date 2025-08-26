# LifeLink Health Monitor 🏥

A comprehensive IoT-based health monitoring system designed for real-time patient monitoring using ESP32 microcontrollers, multiple health sensors, and a web-based dashboard.

## 🎯 Project Overview

**Educational Purpose**: This project is developed for educational purposes as part of YCCE hackathon, demonstrating IoT integration in healthcare monitoring.

### Key Features
- **Dual ESP32 Setup**: ESP32-1 for health monitoring, ESP32-2 for location and communication
- **Multi-Sensor Monitoring**: Temperature, Heart Rate, SpO2, Fall Detection, GPS tracking
- **Real-time Dashboard**: Web-based monitoring with live charts and alerts
- **Emergency System**: Automatic SMS alerts and emergency response
- **Captive Portal**: Easy device setup and WiFi configuration
- **Responsive Design**: Mobile-friendly dashboard for monitoring on-the-go

## 🛠️ Hardware Requirements

### ESP32-1 (Health Monitoring)
- ESP32 DevKit v1
- DS18B20 Temperature Sensor
- MAX30110 Heart Rate & SpO2 Sensor
- Pulse Sensor (backup)
- MPU6050 Accelerometer (fall detection)
- 0.96" OLED Display (SSD1306)
- Buzzer for local alerts

### ESP32-2 (Location & Communication)
- ESP32 DevKit v1
- SIM800L GSM Module
- NEO-6M GPS Module
- MicroSD Card Module
- Emergency Button
- Status LEDs

### Additional Components
- Breadboards and jumper wires
- Power supplies (5V/3.3V)
- Resistors and capacitors
- MicroSD card

## 🚀 Software Requirements

### Backend
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm packages (see package.json)

### Frontend
- Modern web browser
- Chart.js for data visualization
- Leaflet for maps
- Socket.io for real-time communication

### Arduino IDE Setup
- ESP32 Board Package
- Required libraries (see Arduino section below)

## 📁 Project Structure

```
LifeLink-Health-Monitor/
├── ESP32-Firmware/
│   ├── ESP32-1/                 # Health monitoring device
│   │   ├── ESP32-1.ino
│   │   └── ESP32-1_functions.ino
│   └── ESP32-2/                 # Location & communication device
│       ├── ESP32-2.ino
│       └── ESP32-2_functions.ino
├── Web-Server/
│   ├── config/
│   │   └── config.js            # Environment configuration
│   ├── middleware/
│   │   └── auth.js              # Authentication middleware
│   ├── models/                  # MongoDB schemas
│   │   ├── User.js
│   │   ├── Device.js
│   │   ├── SensorData.js
│   │   └── Alert.js
│   ├── routes/                  # API endpoints
│   │   ├── auth.js
│   │   ├── data.js
│   │   ├── devices.js
│   │   └── alerts.js
│   ├── public/                  # Static web files
│   │   ├── dashboard.html
│   │   ├── login.html
│   │   ├── register.html
│   │   └── js/
│   │       └── dashboard.js
│   ├── package.json
│   ├── server.js               # Main server file
│   └── env-template.txt        # Environment variables template
└── README.md
```

## 🔧 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd LifeLink-Health-Monitor
```

### 2. Backend Setup

#### Install Dependencies
```bash
cd Web-Server
npm install
```

#### Environment Configuration
1. Copy the environment template:
   ```bash
   copy env-template.txt .env
   ```

2. Edit `.env` file with your actual values:
   ```env
   MONGODB_URI=mongodb://localhost:27017/lifelink-health
   JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
   TEXTLOCAL_API_KEY=your-textlocal-api-key
   TEXTLOCAL_USERNAME=your-textlocal-username
   TEXTLOCAL_HASH=your-textlocal-hash
   ```

#### Database Setup
1. Install MongoDB locally or use MongoDB Atlas
2. Create a database named `lifelink-health`
3. The application will auto-create collections on first run

### 3. Arduino IDE Setup

#### Install ESP32 Board Package
1. Open Arduino IDE
2. Go to **File → Preferences**
3. Add this URL to Additional Board Manager URLs:
   ```
   https://dl.espressif.com/dl/package_esp32_index.json
   ```
4. Go to **Tools → Board → Boards Manager**
5. Search "ESP32" and install "ESP32 by Espressif Systems"

#### Install Required Libraries
Install these libraries via **Tools → Manage Libraries**:

**For ESP32-1 (Health Monitoring):**
- OneWire (for DS18B20)
- DallasTemperature (for DS18B20)
- MAX30105lib (for MAX30110)
- MPU6050_tockn (for accelerometer)
- Adafruit SSD1306 (for OLED)
- Adafruit GFX (for OLED)
- WiFiManager (for captive portal)
- ArduinoJson (for data formatting)
- AsyncTCP
- ESPAsyncWebServer

**For ESP32-2 (Location & Communication):**
- SoftwareSerial (for GSM)
- TinyGPS++ (for GPS)
- SD (for SD card)
- WiFiManager
- ArduinoJson
- AsyncTCP
- ESPAsyncWebServer

## 🚀 Running the System

### 1. Start the Web Server
```bash
cd Web-Server
npm start
```
The server will start on http://localhost:3000

### 2. Upload ESP32 Firmware
1. Connect ESP32-1 to your computer
2. Open `ESP32-Firmware/ESP32-1/ESP32-1.ino` in Arduino IDE
3. Select the correct board and port
4. Upload the firmware
5. Repeat for ESP32-2

### 3. Device Setup
1. Power on both ESP32 devices
2. ESP32-1 will create a WiFi hotspot "LifeLink-ESP32-1-Setup"
3. Connect to this hotspot and configure WiFi credentials
4. Repeat for ESP32-2 with hotspot "LifeLink-ESP32-2-Setup"

### 4. Web Dashboard Access
1. Open browser and go to http://localhost:3000
2. Register a new account
3. Login and access the dashboard
4. Devices will appear once they connect successfully

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Token verification

### Devices
- `GET /api/devices` - List user devices
- `POST /api/devices/register` - Register new device
- `GET /api/devices/:deviceId/status` - Get device status
- `PUT /api/devices/:deviceId/setup` - Complete device setup

### Sensor Data
- `POST /api/data` - Submit sensor data (from ESP32)
- `GET /api/data/device/:deviceId/recent` - Get recent data
- `GET /api/data/device/:deviceId/range` - Get data by time range

### Alerts
- `GET /api/alerts` - Get user alerts
- `PUT /api/alerts/:alertId/acknowledge` - Acknowledge alert
- `PUT /api/alerts/:alertId/resolve` - Resolve alert

## 🔧 Configuration

### Health Monitoring Thresholds
Default thresholds can be customized in the environment file:
```env
HEART_RATE_MIN=60
HEART_RATE_MAX=100
TEMPERATURE_MIN=36.0
TEMPERATURE_MAX=37.5
SPO2_MIN=95
```

### SMS Configuration (India - TextLocal)
```env
SMS_PROVIDER=textlocal
TEXTLOCAL_API_KEY=your-api-key
TEXTLOCAL_USERNAME=your-username
TEXTLOCAL_HASH=your-hash
SMS_SENDER=LIFELINK
```

### Alternative SMS (International - Twilio)
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1234567890
```

## 🎨 Dashboard Features

### Real-time Monitoring
- Live vital signs display
- Interactive charts for trends
- Device status indicators
- Location tracking on map

### Alert Management
- Real-time alert notifications
- Alert acknowledgment and resolution
- Emergency alert handling
- Alert history and statistics

### Device Management
- Device registration and setup
- Status monitoring
- Configuration management
- Multi-device support

## 🚨 Emergency Features

### Automatic Alerts
- Heart rate anomalies
- Temperature variations
- Low SpO2 levels
- Fall detection
- Device offline alerts

### Emergency Response
- Automatic SMS to emergency contacts
- Dashboard notifications
- Location sharing
- Manual emergency button (ESP32-2)

## 🔒 Security Features

### Authentication & Authorization
- JWT token-based authentication
- Role-based access control
- Device access validation
- API rate limiting

### Data Security
- Password hashing (bcrypt)
- Input validation and sanitization
- SQL injection prevention
- XSS protection

## 🧪 Testing

### Backend Testing
```bash
cd Web-Server
npm test
```

### Hardware Testing
1. Check sensor readings on OLED display
2. Verify WiFi connectivity
3. Test emergency alerts
4. Validate data transmission to server

## 🚀 Deployment

### Production Deployment
1. Set environment to production:
   ```env
   NODE_ENV=production
   ```

2. Use a production MongoDB instance
3. Configure proper SMS credentials
4. Set up reverse proxy (nginx)
5. Use process manager (PM2)

### Cloud Deployment Options
- **Heroku**: Easy deployment with MongoDB Atlas
- **AWS**: EC2 with RDS/DocumentDB
- **DigitalOcean**: Droplets with managed databases
- **Azure**: App Service with CosmosDB

## 📚 Educational Learning Outcomes

### IoT Concepts
- Sensor integration and data acquisition
- Wireless communication protocols
- Real-time data streaming
- Device management and configuration

### Web Development
- RESTful API design
- Real-time web applications
- Authentication and security
- Responsive web design

### Database Management
- NoSQL database design
- Data modeling and relationships
- Query optimization
- Data aggregation and analytics

### System Integration
- Hardware-software integration
- API design and consumption
- Error handling and logging
- System monitoring and alerts

## 🤝 Contributing

This is an educational project. Contributions are welcome for:
- Additional sensor integrations
- Enhanced dashboard features
- Mobile app development
- Documentation improvements

## ⚠️ Important Notes

### Safety Considerations
- This system is for **educational purposes only**
- Not intended for actual medical diagnosis
- Always consult healthcare professionals
- Test thoroughly before any real-world use

### Legal Compliance
- Ensure compliance with local healthcare regulations
- Respect privacy and data protection laws
- Follow device certification requirements
- Consider medical device regulations

## 📞 Support

For technical questions and support:
- Check the documentation first
- Review error logs in `/logs/app.log`
- Test hardware connections
- Verify environment configuration

## 📄 License

This project is developed for educational purposes. Please respect the educational nature and use responsibly.

---

**Developed for YCCE Hackathon - Educational Purpose Only** 🎓

*Remember: This system is a learning tool and demonstration project. Always prioritize safety and consult medical professionals for actual health monitoring needs.*
