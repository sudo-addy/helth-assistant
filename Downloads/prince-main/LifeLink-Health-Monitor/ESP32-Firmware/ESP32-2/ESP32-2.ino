/*
 * LifeLink Health Monitor - ESP32-2 (Location & Communication)
 * 
 * This firmware handles:
 * - GPS location tracking (NEO-6M-0-001)
 * - GSM communication (SIM800L)
 * - Data logging to SD card (optional)
 * - Backup communication when WiFi is unavailable
 * - Emergency SMS alerts
 * - Coordinates with ESP32-1 for complete health monitoring
 * 
 * Educational purpose only - YCCE Hackathon
 */

#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SoftwareSerial.h>
#include <TinyGPS++.h>
#include <SD.h>
#include <SPI.h>
#include <Preferences.h>
#include <BluetoothSerial.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <esp_sleep.h>

// Version Information
#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_TYPE "ESP32-2"
#define DEVICE_NAME "LifeLink-Communication"

// Pin Definitions
#define GPS_TX_PIN 16
#define GPS_RX_PIN 17
#define GSM_TX_PIN 26
#define GSM_RX_PIN 27
#define SD_CS_PIN 5
#define SD_MOSI_PIN 23
#define SD_MISO_PIN 19
#define SD_SCK_PIN 18
#define BATTERY_PIN 34
#define GPS_POWER_PIN 25
#define GSM_POWER_PIN 33
#define STATUS_LED_PIN 2
#define EMERGENCY_BUTTON_PIN 0

// Communication Settings
#define GPS_BAUD 9600
#define GSM_BAUD 9600
#define SERIAL_BAUD 115200

// Timing Constants
#define GPS_READ_INTERVAL 10000      // 10 seconds
#define SERVER_UPDATE_INTERVAL 30000 // 30 seconds
#define GSM_CHECK_INTERVAL 60000     // 1 minute
#define BATTERY_CHECK_INTERVAL 30000 // 30 seconds
#define EMERGENCY_BUTTON_PRESS_TIME 3000 // 3 seconds
#define MAX_GPS_WAIT_TIME 60000      // 1 minute
#define GSM_INIT_TIMEOUT 30000       // 30 seconds
#define WIFI_RETRY_INTERVAL 300000   // 5 minutes

// GPS and GSM Objects
SoftwareSerial gpsSerial(GPS_RX_PIN, GPS_TX_PIN);
SoftwareSerial gsmSerial(GSM_RX_PIN, GSM_TX_PIN);
TinyGPSPlus gps;
BluetoothSerial SerialBT;
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 19800, 3600000); // UTC+5:30 for India
HTTPClient http;
Preferences preferences;

// Device Configuration
struct DeviceConfig {
  String deviceId;
  String deviceName;
  String macAddress;
  String homeWifiSSID;
  String homeWifiPassword;
  String serverURL;
  String apiKey;
  bool isConfigured;
  
  // User Information
  String fullName;
  String emergencyContactName;
  String emergencyContactPhone;
  String hospitalName;
  String hospitalPhone;
  
  // GSM Configuration
  String gsmAPN;
  String gsmUser;
  String gsmPassword;
  
  // Feature Flags
  bool gpsEnabled;
  bool gsmEnabled;
  bool sdCardEnabled;
  bool bluetoothEnabled;
  bool emergencySMSEnabled;
} config;

// Location Data Structure
struct LocationData {
  double latitude;
  double longitude;
  double altitude;
  float speed;
  float heading;
  int satellites;
  float hdop;
  bool valid;
  unsigned long timestamp;
  String address; // Reverse geocoded address (optional)
} locationData;

// System Status Structure
struct SystemStatus {
  bool wifiConnected;
  bool gsmConnected;
  bool gpsConnected;
  bool sdCardMounted;
  bool serverReachable;
  float batteryVoltage;
  int batteryLevel;
  int wifiRSSI;
  int gsmSignalStrength;
  unsigned long uptime;
  unsigned long freeHeap;
  bool emergencyMode;
} systemStatus;

// State Variables
bool emergencyButtonPressed = false;
unsigned long emergencyButtonPressStart = 0;
unsigned long lastGPSRead = 0;
unsigned long lastServerUpdate = 0;
unsigned long lastGSMCheck = 0;
unsigned long lastBatteryCheck = 0;
unsigned long lastWiFiRetry = 0;
bool setupMode = false;
File dataLogFile;
String currentDate = "";

void setup() {
  Serial.begin(SERIAL_BAUD);
  Serial.println(F("=== LifeLink Health Monitor ESP32-2 Starting ==="));
  Serial.println(F("Firmware Version: " FIRMWARE_VERSION));
  
  // Initialize preferences
  preferences.begin("lifelink2", false);
  
  // Initialize pins
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(GPS_POWER_PIN, OUTPUT);
  pinMode(GSM_POWER_PIN, OUTPUT);
  pinMode(EMERGENCY_BUTTON_PIN, INPUT_PULLUP);
  pinMode(BATTERY_PIN, INPUT);
  
  // Power on GPS and GSM modules
  digitalWrite(GPS_POWER_PIN, HIGH);
  digitalWrite(GSM_POWER_PIN, HIGH);
  delay(2000);
  
  // Load configuration
  loadConfiguration();
  
  // Initialize components
  initializeGPS();
  initializeGSM();
  initializeSDCard();
  initializeBluetooth();
  initializeWiFi();
  
  // Initialize system status
  systemStatus.emergencyMode = false;
  systemStatus.uptime = millis();
  
  Serial.println(F("=== ESP32-2 Initialization Complete ==="));
  
  // Flash status LED to indicate ready
  for (int i = 0; i < 5; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(200);
    digitalWrite(STATUS_LED_PIN, LOW);
    delay(200);
  }
}

void loop() {
  unsigned long currentTime = millis();
  
  // Update system uptime
  systemStatus.uptime = currentTime;
  systemStatus.freeHeap = ESP.getFreeHeap();
  
  // Handle emergency button
  handleEmergencyButton(currentTime);
  
  // Check battery level
  if (currentTime - lastBatteryCheck >= BATTERY_CHECK_INTERVAL) {
    checkBatteryLevel();
    lastBatteryCheck = currentTime;
  }
  
  // Read GPS data
  if (currentTime - lastGPSRead >= GPS_READ_INTERVAL) {
    readGPSData();
    lastGPSRead = currentTime;
  }
  
  // WiFi connection management
  handleWiFiConnection(currentTime);
  
  // Send data to server
  if (currentTime - lastServerUpdate >= SERVER_UPDATE_INTERVAL) {
    if (systemStatus.wifiConnected) {
      sendDataToServer();
    } else if (systemStatus.gsmConnected) {
      sendDataViaGSM();
    }
    lastServerUpdate = currentTime;
  }
  
  // GSM management
  if (currentTime - lastGSMCheck >= GSM_CHECK_INTERVAL) {
    if (!systemStatus.wifiConnected) {
      checkGSMConnection();
    }
    lastGSMCheck = currentTime;
  }
  
  // Log data to SD card
  if (systemStatus.sdCardMounted) {
    logDataToSDCard();
  }
  
  // Status LED heartbeat
  digitalWrite(STATUS_LED_PIN, (currentTime / 1000) % 2);
  
  // Handle Bluetooth commands
  handleBluetoothCommands();
  
  // Emergency mode handling
  if (systemStatus.emergencyMode) {
    handleEmergencyMode();
  }
  
  // Power management - enter light sleep if inactive
  if (!systemStatus.emergencyMode && (currentTime % 60000 < 100)) {
    enterLightSleep(1000); // 1 second light sleep
  }
  
  delay(100);
}

void loadConfiguration() {
  Serial.println(F("Loading configuration..."));
  
  // Load basic config
  config.deviceId = preferences.getString("deviceId", "");
  config.deviceName = preferences.getString("deviceName", DEVICE_NAME);
  config.homeWifiSSID = preferences.getString("wifiSSID", "");
  config.homeWifiPassword = preferences.getString("wifiPass", "");
  config.serverURL = preferences.getString("serverURL", "http://192.168.1.100:3000");
  config.isConfigured = preferences.getBool("configured", false);
  
  // Generate device ID from MAC if not set
  if (config.deviceId.length() == 0) {
    config.macAddress = WiFi.macAddress();
    config.deviceId = "ESP32-2-" + config.macAddress.substring(9);
    config.deviceId.replace(":", "");
    preferences.putString("deviceId", config.deviceId);
  } else {
    config.macAddress = WiFi.macAddress();
  }
  
  config.apiKey = config.macAddress; // Using MAC as API key for simplicity
  
  // Load user info
  config.fullName = preferences.getString("fullName", "");
  config.emergencyContactName = preferences.getString("emergName", "");
  config.emergencyContactPhone = preferences.getString("emergPhone", "");
  config.hospitalName = preferences.getString("hospitalName", "");
  config.hospitalPhone = preferences.getString("hospitalPhone", "");
  
  // Load GSM config
  config.gsmAPN = preferences.getString("gsmAPN", "airtelgprs.com");
  config.gsmUser = preferences.getString("gsmUser", "");
  config.gsmPassword = preferences.getString("gsmPass", "");
  
  // Load feature flags
  config.gpsEnabled = preferences.getBool("gpsEnabled", true);
  config.gsmEnabled = preferences.getBool("gsmEnabled", true);
  config.sdCardEnabled = preferences.getBool("sdEnabled", true);
  config.bluetoothEnabled = preferences.getBool("btEnabled", true);
  config.emergencySMSEnabled = preferences.getBool("emergSMS", true);
  
  Serial.println("Device ID: " + config.deviceId);
  Serial.println("Configured: " + String(config.isConfigured ? "Yes" : "No"));
}

void saveConfiguration() {
  Serial.println(F("Saving configuration..."));
  
  preferences.putString("deviceName", config.deviceName);
  preferences.putString("wifiSSID", config.homeWifiSSID);
  preferences.putString("wifiPass", config.homeWifiPassword);
  preferences.putString("serverURL", config.serverURL);
  preferences.putBool("configured", config.isConfigured);
  
  preferences.putString("fullName", config.fullName);
  preferences.putString("emergName", config.emergencyContactName);
  preferences.putString("emergPhone", config.emergencyContactPhone);
  preferences.putString("hospitalName", config.hospitalName);
  preferences.putString("hospitalPhone", config.hospitalPhone);
  
  preferences.putString("gsmAPN", config.gsmAPN);
  preferences.putString("gsmUser", config.gsmUser);
  preferences.putString("gsmPass", config.gsmPassword);
  
  preferences.putBool("gpsEnabled", config.gpsEnabled);
  preferences.putBool("gsmEnabled", config.gsmEnabled);
  preferences.putBool("sdEnabled", config.sdCardEnabled);
  preferences.putBool("btEnabled", config.bluetoothEnabled);
  preferences.putBool("emergSMS", config.emergencySMSEnabled);
  
  Serial.println(F("Configuration saved."));
}

void initializeGPS() {
  if (!config.gpsEnabled) return;
  
  Serial.println(F("Initializing GPS..."));
  gpsSerial.begin(GPS_BAUD);
  
  // Wait for GPS to initialize
  delay(1000);
  
  // Send configuration commands to GPS module
  gpsSerial.println(F("$PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*28")); // Set output to RMC and GGA only
  delay(100);
  gpsSerial.println(F("$PMTK220,1000*1F")); // Set update rate to 1Hz
  delay(100);
  
  systemStatus.gpsConnected = true;
  Serial.println(F("GPS initialized"));
}

void initializeGSM() {
  if (!config.gsmEnabled) return;
  
  Serial.println(F("Initializing GSM..."));
  gsmSerial.begin(GSM_BAUD);
  
  // Wait for GSM module to initialize
  delay(5000);
  
  // Test AT command
  if (sendGSMCommand("AT", "OK", 5000)) {
    Serial.println(F("GSM module responding"));
    
    // Set text mode for SMS
    sendGSMCommand("AT+CMGF=1", "OK", 2000);
    
    // Enable network registration notifications
    sendGSMCommand("AT+CREG=1", "OK", 2000);
    
    // Check network registration
    checkGSMNetworkRegistration();
    
  } else {
    Serial.println(F("GSM module not responding"));
    systemStatus.gsmConnected = false;
  }
}

void initializeSDCard() {
  if (!config.sdCardEnabled) return;
  
  Serial.println(F("Initializing SD Card..."));
  
  SPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
  
  if (SD.begin(SD_CS_PIN)) {
    systemStatus.sdCardMounted = true;
    Serial.println(F("SD Card initialized"));
    
    // Create data directory if it doesn't exist
    if (!SD.exists("/data")) {
      SD.mkdir("/data");
    }
    
    // Create today's log file
    createDailyLogFile();
    
  } else {
    systemStatus.sdCardMounted = false;
    Serial.println(F("SD Card initialization failed"));
  }
}

void initializeBluetooth() {
  if (!config.bluetoothEnabled) return;
  
  Serial.println(F("Initializing Bluetooth..."));
  SerialBT.begin(config.deviceName);
  Serial.println("Bluetooth device name: " + config.deviceName);
  Serial.println(F("Bluetooth initialized"));
}

void initializeWiFi() {
  Serial.println(F("Initializing WiFi..."));
  
  if (config.isConfigured && config.homeWifiSSID.length() > 0) {
    connectToWiFi();
  } else {
    Serial.println(F("WiFi not configured"));
    systemStatus.wifiConnected = false;
  }
}

void connectToWiFi() {
  Serial.println("Connecting to WiFi: " + config.homeWifiSSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(config.homeWifiSSID.c_str(), config.homeWifiPassword.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 10) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    
    systemStatus.wifiConnected = true;
    systemStatus.wifiRSSI = WiFi.RSSI();
    
    // Initialize NTP
    timeClient.begin();
    timeClient.update();
    
    // Test server connection
    testServerConnection();
    
  } else {
    Serial.println();
    Serial.println(F("WiFi connection failed"));
    systemStatus.wifiConnected = false;
  }
}

void readGPSData() {
  if (!config.gpsEnabled || !systemStatus.gpsConnected) return;
  
  bool dataReceived = false;
  unsigned long startTime = millis();
  
  while (gpsSerial.available() > 0 && (millis() - startTime < 1000)) {
    if (gps.encode(gpsSerial.read())) {
      dataReceived = true;
    }
  }
  
  if (dataReceived && gps.location.isValid()) {
    locationData.latitude = gps.location.lat();
    locationData.longitude = gps.location.lng();
    locationData.altitude = gps.altitude.meters();
    locationData.speed = gps.speed.kmph();
    locationData.heading = gps.course.deg();
    locationData.satellites = gps.satellites.value();
    locationData.hdop = gps.hdop.hdop();
    locationData.valid = true;
    locationData.timestamp = timeClient.getEpochTime();
    
    if (locationData.timestamp == 0) {
      locationData.timestamp = millis() / 1000;
    }
    
    Serial.println(F("GPS data updated:"));
    Serial.println("Location: " + String(locationData.latitude, 6) + ", " + String(locationData.longitude, 6));
    Serial.println("Altitude: " + String(locationData.altitude) + "m");
    Serial.println("Speed: " + String(locationData.speed) + " km/h");
    Serial.println("Satellites: " + String(locationData.satellites));
    Serial.println("HDOP: " + String(locationData.hdop));
  } else {
    Serial.println(F("GPS data not valid"));
  }
}

void checkBatteryLevel() {
  int adcValue = analogRead(BATTERY_PIN);
  systemStatus.batteryVoltage = (adcValue / 4095.0) * 3.3 * 2; // Assuming voltage divider
  
  // Convert to percentage (assuming 3.0V to 4.2V range for Li-Po)
  systemStatus.batteryLevel = map(systemStatus.batteryVoltage * 100, 300, 420, 0, 100);
  systemStatus.batteryLevel = constrain(systemStatus.batteryLevel, 0, 100);
  
  // Low battery alert
  if (systemStatus.batteryLevel < 15 && config.emergencySMSEnabled) {
    sendEmergencySMS("Low battery alert: " + String(systemStatus.batteryLevel) + "%");
  }
}

void handleEmergencyButton(unsigned long currentTime) {
  if (digitalRead(EMERGENCY_BUTTON_PIN) == LOW) {
    if (!emergencyButtonPressed) {
      emergencyButtonPressed = true;
      emergencyButtonPressStart = currentTime;
    } else if (currentTime - emergencyButtonPressStart >= EMERGENCY_BUTTON_PRESS_TIME) {
      // Emergency button held for 3 seconds
      triggerEmergencyMode();
      emergencyButtonPressed = false; // Reset to prevent multiple triggers
    }
  } else {
    emergencyButtonPressed = false;
  }
}

void triggerEmergencyMode() {
  Serial.println(F("🚨 EMERGENCY MODE ACTIVATED 🚨"));
  systemStatus.emergencyMode = true;
  
  // Send emergency alert
  String emergencyMessage = "EMERGENCY ALERT! " + config.fullName + " has triggered emergency mode.";
  
  if (locationData.valid) {
    emergencyMessage += " Location: https://maps.google.com/?q=" + 
                       String(locationData.latitude, 6) + "," + 
                       String(locationData.longitude, 6);
  }
  
  // Send SMS alert
  if (config.emergencySMSEnabled && config.emergencyContactPhone.length() > 0) {
    sendEmergencySMS(emergencyMessage);
  }
  
  // Send to server if connected
  if (systemStatus.wifiConnected || systemStatus.gsmConnected) {
    sendEmergencyAlert(emergencyMessage);
  }
  
  // Log to SD card
  if (systemStatus.sdCardMounted) {
    logEmergencyToSDCard(emergencyMessage);
  }
}

void handleEmergencyMode() {
  // In emergency mode, send location updates every 30 seconds
  static unsigned long lastEmergencyUpdate = 0;
  
  if (millis() - lastEmergencyUpdate >= 30000) {
    if (locationData.valid) {
      String updateMessage = "Emergency location update: " + 
                            String(locationData.latitude, 6) + "," + 
                            String(locationData.longitude, 6);
      
      if (config.emergencySMSEnabled) {
        sendEmergencySMS(updateMessage);
      }
      
      if (systemStatus.wifiConnected || systemStatus.gsmConnected) {
        sendEmergencyAlert(updateMessage);
      }
    }
    
    lastEmergencyUpdate = millis();
  }
  
  // Flash LED rapidly in emergency mode
  digitalWrite(STATUS_LED_PIN, (millis() / 250) % 2);
}

// Continue in next part due to length constraints...
