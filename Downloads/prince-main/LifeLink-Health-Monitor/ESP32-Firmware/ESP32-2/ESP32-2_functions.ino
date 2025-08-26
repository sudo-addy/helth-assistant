// Continuation of ESP32-2 firmware functions

bool sendGSMCommand(String command, String expectedResponse, unsigned long timeout) {
  gsmSerial.println(command);
  
  String response = "";
  unsigned long startTime = millis();
  
  while (millis() - startTime < timeout) {
    while (gsmSerial.available()) {
      char c = gsmSerial.read();
      response += c;
      
      if (response.indexOf(expectedResponse) != -1) {
        return true;
      }
    }
    delay(10);
  }
  
  Serial.println("GSM Command failed: " + command);
  Serial.println("Response: " + response);
  return false;
}

void checkGSMNetworkRegistration() {
  if (sendGSMCommand("AT+CREG?", "+CREG:", 10000)) {
    // Parse registration status
    String response = getGSMResponse("AT+CREG?", 5000);
    
    if (response.indexOf("0,1") != -1 || response.indexOf("0,5") != -1) {
      Serial.println(F("GSM registered on network"));
      systemStatus.gsmConnected = true;
      
      // Get signal strength
      getGSMSignalStrength();
      
    } else {
      Serial.println(F("GSM not registered on network"));
      systemStatus.gsmConnected = false;
    }
  }
}

void getGSMSignalStrength() {
  String response = getGSMResponse("AT+CSQ", 5000);
  
  if (response.length() > 0) {
    int startIndex = response.indexOf("+CSQ: ");
    if (startIndex != -1) {
      startIndex += 6;
      int commaIndex = response.indexOf(",", startIndex);
      if (commaIndex != -1) {
        String rssiStr = response.substring(startIndex, commaIndex);
        int rssi = rssiStr.toInt();
        
        // Convert RSSI to signal strength percentage
        systemStatus.gsmSignalStrength = map(rssi, 0, 31, 0, 100);
        Serial.println("GSM Signal Strength: " + String(systemStatus.gsmSignalStrength) + "%");
      }
    }
  }
}

String getGSMResponse(String command, unsigned long timeout) {
  gsmSerial.println(command);
  
  String response = "";
  unsigned long startTime = millis();
  
  while (millis() - startTime < timeout) {
    while (gsmSerial.available()) {
      response += (char)gsmSerial.read();
    }
    delay(10);
  }
  
  return response;
}

void checkGSMConnection() {
  if (!config.gsmEnabled) return;
  
  if (sendGSMCommand("AT", "OK", 5000)) {
    if (!systemStatus.gsmConnected) {
      checkGSMNetworkRegistration();
    }
  } else {
    systemStatus.gsmConnected = false;
  }
}

bool sendEmergencySMS(String message) {
  if (!systemStatus.gsmConnected || config.emergencyContactPhone.length() == 0) {
    return false;
  }
  
  Serial.println("Sending SMS: " + message);
  
  // Set text mode
  if (!sendGSMCommand("AT+CMGF=1", "OK", 2000)) {
    return false;
  }
  
  // Set recipient
  String cmd = "AT+CMGS=\"" + config.emergencyContactPhone + "\"";
  gsmSerial.println(cmd);
  delay(1000);
  
  // Send message
  gsmSerial.print(message);
  delay(100);
  gsmSerial.write(26); // Ctrl+Z to send
  
  // Wait for confirmation
  return waitForGSMResponse("OK", 30000);
}

bool waitForGSMResponse(String expectedResponse, unsigned long timeout) {
  String response = "";
  unsigned long startTime = millis();
  
  while (millis() - startTime < timeout) {
    while (gsmSerial.available()) {
      response += (char)gsmSerial.read();
    }
    
    if (response.indexOf(expectedResponse) != -1) {
      return true;
    }
    delay(10);
  }
  
  return false;
}

void handleWiFiConnection(unsigned long currentTime) {
  if (!systemStatus.wifiConnected && config.isConfigured && 
      currentTime - lastWiFiRetry >= WIFI_RETRY_INTERVAL) {
    
    Serial.println(F("Retrying WiFi connection..."));
    connectToWiFi();
    lastWiFiRetry = currentTime;
  }
  
  if (systemStatus.wifiConnected && WiFi.status() != WL_CONNECTED) {
    systemStatus.wifiConnected = false;
    Serial.println(F("WiFi connection lost"));
  }
  
  if (systemStatus.wifiConnected) {
    systemStatus.wifiRSSI = WiFi.RSSI();
  }
}

void sendDataToServer() {
  if (!systemStatus.wifiConnected) return;
  
  Serial.println(F("Sending location data to server..."));
  
  // Create JSON payload
  DynamicJsonDocument doc(1024);
  
  doc["deviceId"] = config.deviceId;
  doc["deviceName"] = config.deviceName;
  doc["timestamp"] = locationData.timestamp;
  
  // Location data
  if (locationData.valid) {
    doc["location"]["latitude"] = locationData.latitude;
    doc["location"]["longitude"] = locationData.longitude;
    doc["location"]["altitude"] = locationData.altitude;
    doc["location"]["accuracy"] = locationData.hdop;
    doc["location"]["speed"] = locationData.speed;
    doc["location"]["heading"] = locationData.heading;
  }
  
  // Device status
  doc["device"]["batteryLevel"] = systemStatus.batteryLevel;
  doc["device"]["batteryVoltage"] = systemStatus.batteryVoltage;
  doc["device"]["signalStrength"] = systemStatus.wifiRSSI;
  doc["device"]["connectionType"] = "wifi";
  doc["device"]["uptime"] = systemStatus.uptime / 1000;
  doc["device"]["freeMemory"] = systemStatus.freeHeap;
  
  // GPS status
  doc["gps"]["satellites"] = locationData.satellites;
  doc["gps"]["hdop"] = locationData.hdop;
  doc["gps"]["valid"] = locationData.valid;
  
  // System status
  doc["systemStatus"]["gsmConnected"] = systemStatus.gsmConnected;
  doc["systemStatus"]["sdCardMounted"] = systemStatus.sdCardMounted;
  doc["systemStatus"]["emergencyMode"] = systemStatus.emergencyMode;
  
  // Metadata
  doc["metadata"]["firmwareVersion"] = FIRMWARE_VERSION;
  doc["metadata"]["deviceType"] = DEVICE_TYPE;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Send HTTP POST request
  http.begin(config.serverURL + "/api/data/sensor");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", config.apiKey);
  http.addHeader("X-Device-ID", config.deviceId);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Server response: " + String(httpResponseCode));
    systemStatus.serverReachable = true;
  } else {
    Serial.println("Error sending data: " + String(httpResponseCode));
    systemStatus.serverReachable = false;
  }
  
  http.end();
}

void sendDataViaGSM() {
  if (!systemStatus.gsmConnected) return;
  
  Serial.println(F("Sending data via GSM..."));
  
  // Initialize GPRS connection
  if (initializeGPRSConnection()) {
    // Create simplified JSON payload for GSM transmission
    DynamicJsonDocument doc(512);
    
    doc["deviceId"] = config.deviceId;
    doc["timestamp"] = locationData.timestamp;
    doc["battery"] = systemStatus.batteryLevel;
    
    if (locationData.valid) {
      doc["lat"] = locationData.latitude;
      doc["lon"] = locationData.longitude;
      doc["emergency"] = systemStatus.emergencyMode;
    }
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Send data via HTTP POST over GPRS
    sendHTTPPostViaGSM(jsonString);
  }
}

bool initializeGPRSConnection() {
  Serial.println(F("Initializing GPRS connection..."));
  
  // Attach to GPRS
  if (!sendGSMCommand("AT+CGATT=1", "OK", 10000)) {
    return false;
  }
  
  // Set APN
  String apnCmd = "AT+CSTT=\"" + config.gsmAPN + "\",\"" + config.gsmUser + "\",\"" + config.gsmPassword + "\"";
  if (!sendGSMCommand(apnCmd, "OK", 5000)) {
    return false;
  }
  
  // Bring up wireless connection
  if (!sendGSMCommand("AT+CIICR", "OK", 30000)) {
    return false;
  }
  
  // Get local IP address
  if (!sendGSMCommand("AT+CIFSR", ".", 5000)) {
    return false;
  }
  
  Serial.println(F("GPRS connection established"));
  return true;
}

void sendHTTPPostViaGSM(String jsonData) {
  // Start TCP connection
  String server = config.serverURL;
  server.replace("http://", "");
  int portIndex = server.indexOf(":");
  String host = server.substring(0, portIndex);
  String port = server.substring(portIndex + 1);
  
  String connectCmd = "AT+CIPSTART=\"TCP\",\"" + host + "\"," + port;
  if (!sendGSMCommand(connectCmd, "CONNECT OK", 15000)) {
    return;
  }
  
  // Prepare HTTP request
  String httpRequest = "POST /api/data/sensor HTTP/1.1\r\n";
  httpRequest += "Host: " + host + "\r\n";
  httpRequest += "Content-Type: application/json\r\n";
  httpRequest += "X-API-Key: " + config.apiKey + "\r\n";
  httpRequest += "X-Device-ID: " + config.deviceId + "\r\n";
  httpRequest += "Content-Length: " + String(jsonData.length()) + "\r\n\r\n";
  httpRequest += jsonData;
  
  // Send data length
  String sendCmd = "AT+CIPSEND=" + String(httpRequest.length());
  if (sendGSMCommand(sendCmd, ">", 5000)) {
    // Send HTTP request
    gsmSerial.print(httpRequest);
    
    if (waitForGSMResponse("SEND OK", 10000)) {
      Serial.println(F("Data sent via GSM successfully"));
    }
  }
  
  // Close connection
  sendGSMCommand("AT+CIPCLOSE", "OK", 5000);
}

void sendEmergencyAlert(String message) {
  Serial.println(F("Sending emergency alert to server..."));
  
  DynamicJsonDocument doc(512);
  doc["deviceId"] = config.deviceId;
  doc["type"] = "emergency_alert";
  doc["message"] = message;
  doc["timestamp"] = timeClient.getEpochTime();
  doc["priority"] = "critical";
  
  if (locationData.valid) {
    doc["location"]["latitude"] = locationData.latitude;
    doc["location"]["longitude"] = locationData.longitude;
  }
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Send via available connection
  if (systemStatus.wifiConnected) {
    http.begin(config.serverURL + "/api/alerts");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", config.apiKey);
    http.addHeader("X-Device-ID", config.deviceId);
    
    int httpResponseCode = http.POST(jsonString);
    Serial.println("Emergency alert response: " + String(httpResponseCode));
    http.end();
  }
}

void testServerConnection() {
  Serial.println(F("Testing server connection..."));
  
  http.begin(config.serverURL + "/api/health");
  http.addHeader("X-API-Key", config.apiKey);
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    Serial.println(F("Server connection test successful"));
    systemStatus.serverReachable = true;
  } else {
    Serial.println("Server connection test failed: " + String(httpResponseCode));
    systemStatus.serverReachable = false;
  }
  
  http.end();
}

void createDailyLogFile() {
  if (!systemStatus.sdCardMounted) return;
  
  // Get current date
  timeClient.update();
  time_t epochTime = timeClient.getEpochTime();
  struct tm *ptm = gmtime((time_t *)&epochTime);
  
  char dateStr[20];
  sprintf(dateStr, "%04d-%02d-%02d", ptm->tm_year + 1900, ptm->tm_mon + 1, ptm->tm_mday);
  currentDate = String(dateStr);
  
  String fileName = "/data/log_" + currentDate + ".csv";
  
  // Check if file exists, if not create with headers
  if (!SD.exists(fileName)) {
    dataLogFile = SD.open(fileName, FILE_WRITE);
    if (dataLogFile) {
      dataLogFile.println("timestamp,device_id,latitude,longitude,altitude,speed,satellites,battery_level,wifi_rssi,gsm_signal,emergency_mode");
      dataLogFile.close();
      Serial.println("Created log file: " + fileName);
    }
  }
}

void logDataToSDCard() {
  if (!systemStatus.sdCardMounted) return;
  
  // Check if we need to create a new daily file
  timeClient.update();
  time_t epochTime = timeClient.getEpochTime();
  struct tm *ptm = gmtime((time_t *)&epochTime);
  
  char dateStr[20];
  sprintf(dateStr, "%04d-%02d-%02d", ptm->tm_year + 1900, ptm->tm_mon + 1, ptm->tm_mday);
  String newDate = String(dateStr);
  
  if (newDate != currentDate) {
    createDailyLogFile();
  }
  
  String fileName = "/data/log_" + currentDate + ".csv";
  dataLogFile = SD.open(fileName, FILE_APPEND);
  
  if (dataLogFile) {
    String logEntry = String(locationData.timestamp) + ",";
    logEntry += config.deviceId + ",";
    logEntry += String(locationData.latitude, 6) + ",";
    logEntry += String(locationData.longitude, 6) + ",";
    logEntry += String(locationData.altitude, 2) + ",";
    logEntry += String(locationData.speed, 2) + ",";
    logEntry += String(locationData.satellites) + ",";
    logEntry += String(systemStatus.batteryLevel) + ",";
    logEntry += String(systemStatus.wifiRSSI) + ",";
    logEntry += String(systemStatus.gsmSignalStrength) + ",";
    logEntry += String(systemStatus.emergencyMode ? "1" : "0");
    
    dataLogFile.println(logEntry);
    dataLogFile.close();
  }
}

void logEmergencyToSDCard(String message) {
  if (!systemStatus.sdCardMounted) return;
  
  String fileName = "/data/emergency_log.txt";
  File emergencyFile = SD.open(fileName, FILE_APPEND);
  
  if (emergencyFile) {
    emergencyFile.print(timeClient.getFormattedTime());
    emergencyFile.print(" - ");
    emergencyFile.println(message);
    emergencyFile.close();
    
    Serial.println("Emergency logged to SD card");
  }
}

void handleBluetoothCommands() {
  if (!config.bluetoothEnabled || !SerialBT.available()) return;
  
  String command = SerialBT.readString();
  command.trim();
  
  Serial.println("Bluetooth command: " + command);
  
  if (command == "STATUS") {
    sendBluetoothStatus();
  } else if (command == "LOCATION") {
    sendBluetoothLocation();
  } else if (command == "EMERGENCY") {
    triggerEmergencyMode();
    SerialBT.println("Emergency mode activated!");
  } else if (command == "RESET_EMERGENCY") {
    systemStatus.emergencyMode = false;
    SerialBT.println("Emergency mode deactivated");
  } else if (command == "RESTART") {
    SerialBT.println("Restarting device...");
    delay(1000);
    ESP.restart();
  } else {
    SerialBT.println("Unknown command. Available: STATUS, LOCATION, EMERGENCY, RESET_EMERGENCY, RESTART");
  }
}

void sendBluetoothStatus() {
  DynamicJsonDocument doc(1024);
  
  doc["deviceId"] = config.deviceId;
  doc["uptime"] = systemStatus.uptime / 1000;
  doc["battery"] = systemStatus.batteryLevel;
  doc["wifi"] = systemStatus.wifiConnected;
  doc["gsm"] = systemStatus.gsmConnected;
  doc["gps"] = systemStatus.gpsConnected;
  doc["emergency"] = systemStatus.emergencyMode;
  doc["freeHeap"] = systemStatus.freeHeap;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  SerialBT.println(jsonString);
}

void sendBluetoothLocation() {
  if (locationData.valid) {
    String locationStr = "Lat: " + String(locationData.latitude, 6) + 
                        ", Lon: " + String(locationData.longitude, 6) + 
                        ", Alt: " + String(locationData.altitude) + "m" +
                        ", Sat: " + String(locationData.satellites);
    SerialBT.println(locationStr);
  } else {
    SerialBT.println("GPS location not available");
  }
}

void enterLightSleep(unsigned long duration) {
  // Configure wake up sources
  esp_sleep_enable_timer_wakeup(duration * 1000); // Convert to microseconds
  esp_sleep_enable_ext0_wakeup(GPIO_NUM_0, 0); // Wake up on emergency button
  
  // Enter light sleep
  esp_light_sleep_start();
}

void printSystemStatus() {
  Serial.println(F("=== System Status ==="));
  Serial.println("Device ID: " + config.deviceId);
  Serial.println("Uptime: " + String(systemStatus.uptime / 1000) + " seconds");
  Serial.println("Free Heap: " + String(systemStatus.freeHeap) + " bytes");
  Serial.println("Battery: " + String(systemStatus.batteryLevel) + "% (" + String(systemStatus.batteryVoltage) + "V)");
  Serial.println("WiFi: " + String(systemStatus.wifiConnected ? "Connected" : "Disconnected") + 
                 " RSSI: " + String(systemStatus.wifiRSSI) + " dBm");
  Serial.println("GSM: " + String(systemStatus.gsmConnected ? "Connected" : "Disconnected") + 
                 " Signal: " + String(systemStatus.gsmSignalStrength) + "%");
  Serial.println("GPS: " + String(systemStatus.gpsConnected ? "Connected" : "Disconnected"));
  Serial.println("SD Card: " + String(systemStatus.sdCardMounted ? "Mounted" : "Not Mounted"));
  Serial.println("Emergency Mode: " + String(systemStatus.emergencyMode ? "ACTIVE" : "Inactive"));
  
  if (locationData.valid) {
    Serial.println("Location: " + String(locationData.latitude, 6) + ", " + String(locationData.longitude, 6));
    Serial.println("Satellites: " + String(locationData.satellites) + ", HDOP: " + String(locationData.hdop));
  } else {
    Serial.println("Location: Not Available");
  }
  Serial.println(F("===================="));
}
