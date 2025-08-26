// Continuation of ESP32-1 firmware

void setupWebServer() {
  // Captive portal redirect
  server.onNotFound([]() {
    server.sendHeader("Location", "/setup", true);
    server.send(302, "text/plain", "");
  });
  
  // Setup page
  server.on("/", handleRoot);
  server.on("/setup", handleSetup);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/status", handleStatus);
  server.on("/restart", handleRestart);
  
  Serial.println(F("Web server routes configured"));
}

void handleRoot() {
  String html = generateSetupHTML();
  server.send(200, "text/html", html);
}

void handleSetup() {
  String html = generateSetupHTML();
  server.send(200, "text/html", html);
}

void handleSave() {
  Serial.println(F("Received configuration data"));
  
  // Parse form data
  config.deviceName = server.arg("deviceName");
  config.fullName = server.arg("fullName");
  config.emergencyContactName = server.arg("emergencyContactName");
  config.emergencyContactPhone = server.arg("emergencyContactPhone");
  config.hospitalName = server.arg("hospitalName");
  config.hospitalPhone = server.arg("hospitalPhone");
  config.homeWifiSSID = server.arg("wifiSSID");
  config.homeWifiPassword = server.arg("wifiPassword");
  config.serverURL = server.arg("serverURL");
  
  // Parse thresholds
  if (server.arg("minHeartRate").length() > 0) {
    config.minHeartRate = server.arg("minHeartRate").toFloat();
  }
  if (server.arg("maxHeartRate").length() > 0) {
    config.maxHeartRate = server.arg("maxHeartRate").toFloat();
  }
  if (server.arg("minSpO2").length() > 0) {
    config.minSpO2 = server.arg("minSpO2").toFloat();
  }
  if (server.arg("minTemperature").length() > 0) {
    config.minTemperature = server.arg("minTemperature").toFloat();
  }
  if (server.arg("maxTemperature").length() > 0) {
    config.maxTemperature = server.arg("maxTemperature").toFloat();
  }
  
  // Parse feature flags
  config.fallDetectionEnabled = server.arg("fallDetection") == "on";
  config.heartRateMonitoringEnabled = server.arg("heartRateMonitoring") == "on";
  config.temperatureMonitoringEnabled = server.arg("temperatureMonitoring") == "on";
  config.ecgMonitoringEnabled = server.arg("ecgMonitoring") == "on";
  config.buzzerEnabled = server.arg("buzzer") == "on";
  config.vibratorEnabled = server.arg("vibrator") == "on";
  
  config.isConfigured = true;
  
  // Save configuration
  saveConfiguration();
  
  // Send success response
  String response = "<!DOCTYPE html><html><head><title>LifeLink Setup</title></head><body>";
  response += "<h1>Configuration Saved!</h1>";
  response += "<p>Device will restart and connect to your WiFi network.</p>";
  response += "<p>Device ID: " + config.deviceId + "</p>";
  response += "<p>Please add this device to your dashboard using the Device ID above.</p>";
  response += "<script>setTimeout(function(){window.location.href='/status';}, 3000);</script>";
  response += "</body></html>";
  
  server.send(200, "text/html", response);
  
  // Restart device after a delay
  delay(2000);
  ESP.restart();
}

void handleStatus() {
  DynamicJsonDocument doc(1024);
  
  doc["deviceId"] = config.deviceId;
  doc["deviceName"] = config.deviceName;
  doc["macAddress"] = config.macAddress;
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["isConfigured"] = config.isConfigured;
  doc["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  doc["serverConnected"] = serverConnected;
  doc["uptime"] = millis() / 1000;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["batteryLevel"] = sensorData.batteryLevel;
  doc["timestamp"] = timeClient.getEpochTime();
  
  String response;
  serializeJson(doc, response);
  
  server.send(200, "application/json", response);
}

void handleRestart() {
  server.send(200, "text/plain", "Restarting device...");
  delay(1000);
  ESP.restart();
}

String generateSetupHTML() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<title>LifeLink Device Setup</title>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>";
  html += "body { font-family: Arial, sans-serif; margin: 20px; background: #f0f0f0; }";
  html += ".container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }";
  html += "h1 { color: #2c3e50; text-align: center; }";
  html += ".form-group { margin: 15px 0; }";
  html += "label { display: block; font-weight: bold; margin-bottom: 5px; color: #34495e; }";
  html += "input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }";
  html += "button { background: #3498db; color: white; padding: 12px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; width: 100%; }";
  html += "button:hover { background: #2980b9; }";
  html += ".info-box { background: #e8f4fd; padding: 10px; border-left: 4px solid #3498db; margin: 10px 0; }";
  html += ".checkbox-group { display: flex; align-items: center; margin: 10px 0; }";
  html += ".checkbox-group input { width: auto; margin-right: 10px; }";
  html += "</style></head><body>";
  
  html += "<div class='container'>";
  html += "<h1>🩺 LifeLink Device Setup</h1>";
  
  html += "<div class='info-box'>";
  html += "<strong>Device Information:</strong><br>";
  html += "Device ID: " + config.deviceId + "<br>";
  html += "MAC Address: " + config.macAddress + "<br>";
  html += "Firmware Version: " + String(FIRMWARE_VERSION);
  html += "</div>";
  
  html += "<form action='/save' method='post'>";
  
  // Personal Information
  html += "<h3>👤 Personal Information</h3>";
  html += "<div class='form-group'>";
  html += "<label for='deviceName'>Device Name:</label>";
  html += "<input type='text' name='deviceName' value='" + config.deviceName + "' placeholder='My LifeLink Device'>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='fullName'>Full Name:</label>";
  html += "<input type='text' name='fullName' value='" + config.fullName + "' placeholder='Your full name' required>";
  html += "</div>";
  
  // Emergency Contact
  html += "<h3>🚨 Emergency Contact</h3>";
  html += "<div class='form-group'>";
  html += "<label for='emergencyContactName'>Emergency Contact Name:</label>";
  html += "<input type='text' name='emergencyContactName' value='" + config.emergencyContactName + "' placeholder='Emergency contact name' required>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='emergencyContactPhone'>Emergency Contact Phone:</label>";
  html += "<input type='tel' name='emergencyContactPhone' value='" + config.emergencyContactPhone + "' placeholder='+91-XXXXXXXXXX' required>";
  html += "</div>";
  
  // Hospital Information
  html += "<h3>🏥 Hospital Information</h3>";
  html += "<div class='form-group'>";
  html += "<label for='hospitalName'>Hospital Name:</label>";
  html += "<input type='text' name='hospitalName' value='" + config.hospitalName + "' placeholder='Preferred hospital'>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='hospitalPhone'>Hospital Phone:</label>";
  html += "<input type='tel' name='hospitalPhone' value='" + config.hospitalPhone + "' placeholder='Hospital phone number'>";
  html += "</div>";
  
  // WiFi Configuration
  html += "<h3>📶 WiFi Configuration</h3>";
  html += "<div class='form-group'>";
  html += "<label for='wifiSSID'>Home WiFi SSID:</label>";
  html += "<input type='text' name='wifiSSID' value='" + config.homeWifiSSID + "' placeholder='Your WiFi network name' required>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='wifiPassword'>WiFi Password:</label>";
  html += "<input type='password' name='wifiPassword' value='" + config.homeWifiPassword + "' placeholder='WiFi password' required>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='serverURL'>Server URL:</label>";
  html += "<input type='text' name='serverURL' value='" + config.serverURL + "' placeholder='http://192.168.1.100:3000' required>";
  html += "</div>";
  
  // Health Thresholds
  html += "<h3>⚕️ Health Monitoring Thresholds</h3>";
  html += "<div class='form-group'>";
  html += "<label for='minHeartRate'>Minimum Heart Rate (BPM):</label>";
  html += "<input type='number' name='minHeartRate' value='" + String(config.minHeartRate) + "' min='30' max='80' step='1'>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='maxHeartRate'>Maximum Heart Rate (BPM):</label>";
  html += "<input type='number' name='maxHeartRate' value='" + String(config.maxHeartRate) + "' min='100' max='200' step='1'>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='minSpO2'>Minimum SpO2 (%):</label>";
  html += "<input type='number' name='minSpO2' value='" + String(config.minSpO2) + "' min='80' max='100' step='1'>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='minTemperature'>Minimum Temperature (°C):</label>";
  html += "<input type='number' name='minTemperature' value='" + String(config.minTemperature) + "' min='30' max='40' step='0.1'>";
  html += "</div>";
  
  html += "<div class='form-group'>";
  html += "<label for='maxTemperature'>Maximum Temperature (°C):</label>";
  html += "<input type='number' name='maxTemperature' value='" + String(config.maxTemperature) + "' min='35' max='45' step='0.1'>";
  html += "</div>";
  
  // Feature Settings
  html += "<h3>⚙️ Feature Settings</h3>";
  
  html += "<div class='checkbox-group'>";
  html += "<input type='checkbox' name='fallDetection' id='fallDetection'" + String(config.fallDetectionEnabled ? " checked" : "") + ">";
  html += "<label for='fallDetection'>Fall Detection</label>";
  html += "</div>";
  
  html += "<div class='checkbox-group'>";
  html += "<input type='checkbox' name='heartRateMonitoring' id='heartRateMonitoring'" + String(config.heartRateMonitoringEnabled ? " checked" : "") + ">";
  html += "<label for='heartRateMonitoring'>Heart Rate Monitoring</label>";
  html += "</div>";
  
  html += "<div class='checkbox-group'>";
  html += "<input type='checkbox' name='temperatureMonitoring' id='temperatureMonitoring'" + String(config.temperatureMonitoringEnabled ? " checked" : "") + ">";
  html += "<label for='temperatureMonitoring'>Temperature Monitoring</label>";
  html += "</div>";
  
  html += "<div class='checkbox-group'>";
  html += "<input type='checkbox' name='ecgMonitoring' id='ecgMonitoring'" + String(config.ecgMonitoringEnabled ? " checked" : "") + ">";
  html += "<label for='ecgMonitoring'>ECG Monitoring (Optional)</label>";
  html += "</div>";
  
  html += "<div class='checkbox-group'>";
  html += "<input type='checkbox' name='buzzer' id='buzzer'" + String(config.buzzerEnabled ? " checked" : "") + ">";
  html += "<label for='buzzer'>Buzzer Alerts</label>";
  html += "</div>";
  
  html += "<div class='checkbox-group'>";
  html += "<input type='checkbox' name='vibrator' id='vibrator'" + String(config.vibratorEnabled ? " checked" : "") + ">";
  html += "<label for='vibrator'>Vibrator Alerts</label>";
  html += "</div>";
  
  html += "<button type='submit'>💾 Save Configuration</button>";
  html += "</form>";
  
  html += "</div></body></html>";
  
  return html;
}

void readAllSensors() {
  Serial.println(F("Reading all sensors..."));
  
  // Read battery voltage
  readBatteryLevel();
  
  // Read temperature
  if (config.temperatureMonitoringEnabled) {
    readTemperature();
  }
  
  // Read heart rate and SpO2
  if (config.heartRateMonitoringEnabled) {
    readHeartRateAndSpO2();
  }
  
  // Read pulse sensor
  readPulseSensor();
  
  // Read accelerometer
  readAccelerometer();
  
  // Read environmental data
  readEnvironmentalData();
  
  // Read ECG if enabled
  if (config.ecgMonitoringEnabled) {
    readECG();
  }
  
  // Update WiFi signal strength
  if (WiFi.status() == WL_CONNECTED) {
    sensorData.signalStrength = WiFi.RSSI();
  }
  
  // Set timestamp
  sensorData.timestamp = timeClient.getEpochTime();
  if (sensorData.timestamp == 0) {
    sensorData.timestamp = millis() / 1000;
  }
  
  sensorData.dataValid = true;
  
  // Check for alerts
  checkForAlerts();
  
  Serial.println(F("Sensor reading complete"));
  printSensorData();
}

void readBatteryLevel() {
  // Read battery voltage (assuming voltage divider on A0)
  int adcValue = analogRead(A0);
  sensorData.batteryVoltage = (adcValue / 4095.0) * 3.3 * 2; // Assuming voltage divider
  
  // Convert to percentage (assuming 3.0V to 4.2V range for Li-Po)
  sensorData.batteryLevel = map(sensorData.batteryVoltage * 100, 300, 420, 0, 100);
  sensorData.batteryLevel = constrain(sensorData.batteryLevel, 0, 100);
}

void readTemperature() {
  tempSensor.requestTemperatures();
  delay(100);
  
  float temperature = tempSensor.getTempCByIndex(0);
  if (temperature != DEVICE_DISCONNECTED_C) {
    sensorData.bodyTemperature = temperature;
  } else {
    Serial.println(F("DS18B20 sensor disconnected"));
  }
}

void readHeartRateAndSpO2() {
  if (!particleSensor.available()) {
    return;
  }
  
  // Read samples for SpO2 calculation
  for (byte i = 0; i < bufferLength; i++) {
    while (particleSensor.available() == false) {
      delay(1);
    }
    
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();
    particleSensor.nextSample();
  }
  
  // Calculate SpO2 and heart rate
  maxim_heart_rate_and_oxygen_saturation(irBuffer, bufferLength, redBuffer, &spo2, &validSPO2, &heartRateFromSpO2, &validHeartRate);
  
  if (validSPO2 == 1 && spo2 > 0 && spo2 <= 100) {
    sensorData.spO2 = spo2;
  }
  
  if (validHeartRate == 1 && heartRateFromSpO2 > 0 && heartRateFromSpO2 < 300) {
    sensorData.heartRate = heartRateFromSpO2;
  }
  
  // Simple heart rate detection from IR signal
  long irValue = particleSensor.getIR();
  if (checkForBeat(irValue)) {
    fingerDetected = true;
    
    // Calculate time between beats
    long delta = millis() - lastBeat;
    lastBeat = millis();
    
    // Calculate BPM
    beatsPerMinute = 60 / (delta / 1000.0);
    
    if (beatsPerMinute < 255 && beatsPerMinute > 20) {
      // Store valid heart rate
      rateValues[rateIndex++] = delta;
      rateIndex %= RATE_ARRAY_SIZE;
      
      // Take average of readings
      long total = 0;
      for (byte i = 0; i < RATE_ARRAY_SIZE; i++) {
        total += rateValues[i];
      }
      long average = total / RATE_ARRAY_SIZE;
      
      beatsPerMinute = 60 / (average / 1000.0);
      sensorData.heartRate = beatsPerMinute;
    }
  }
  
  fingerDetected = (irValue > 50000);
}

void readPulseSensor() {
  int pulseValue = analogRead(PULSE_INPUT);
  sensorData.pulseValue = pulseValue;
}

void readAccelerometer() {
  int xValue = analogRead(ACCELEROMETER_X);
  int yValue = analogRead(ACCELEROMETER_Y);
  int zValue = analogRead(ACCELEROMETER_Z);
  
  // Convert to G-force (assuming 3.3V supply and 1.5V center)
  sensorData.accelerometerX = (xValue - 2048) * 3.3 / 4095.0;
  sensorData.accelerometerY = (yValue - 2048) * 3.3 / 4095.0;
  sensorData.accelerometerZ = (zValue - 2048) * 3.3 / 4095.0;
  
  // Calculate magnitude
  sensorData.accelerometerMagnitude = sqrt(
    sensorData.accelerometerX * sensorData.accelerometerX +
    sensorData.accelerometerY * sensorData.accelerometerY +
    sensorData.accelerometerZ * sensorData.accelerometerZ
  );
  
  // Fall detection
  if (config.fallDetectionEnabled) {
    if (sensorData.accelerometerMagnitude > FALL_THRESHOLD) {
      sensorData.fallDetected = true;
      Serial.println(F("🚨 FALL DETECTED! 🚨"));
    } else {
      sensorData.fallDetected = false;
    }
  }
}

void readEnvironmentalData() {
  sensorData.envTemperature = bmp.readTemperature();
  sensorData.pressure = bmp.readPressure();
  sensorData.altitude = bmp.readAltitude();
}

void readECG() {
  if (digitalRead(ECG_LO_PLUS) == 1 || digitalRead(ECG_LO_MINUS) == 1) {
    // Leads off detected
    sensorData.ecgValue = 0;
  } else {
    // Read ECG signal
    sensorData.ecgValue = analogRead(ECG_INPUT);
  }
}

void checkForAlerts() {
  bool alertTriggered = false;
  String alertMessage = "";
  
  // Heart rate alerts
  if (sensorData.heartRate > 0) {
    if (sensorData.heartRate < config.minHeartRate || sensorData.heartRate > config.maxHeartRate) {
      alertTriggered = true;
      alertMessage += "Heart Rate: " + String(sensorData.heartRate) + " BPM ";
    }
  }
  
  // SpO2 alerts
  if (sensorData.spO2 > 0 && sensorData.spO2 < config.minSpO2) {
    alertTriggered = true;
    alertMessage += "SpO2: " + String(sensorData.spO2) + "% ";
  }
  
  // Temperature alerts
  if (sensorData.bodyTemperature > 0) {
    if (sensorData.bodyTemperature < config.minTemperature || sensorData.bodyTemperature > config.maxTemperature) {
      alertTriggered = true;
      alertMessage += "Temp: " + String(sensorData.bodyTemperature) + "°C ";
    }
  }
  
  // Fall detection alert
  if (sensorData.fallDetected) {
    alertTriggered = true;
    alertMessage += "FALL DETECTED ";
  }
  
  // Battery alert
  if (sensorData.batteryLevel < config.batteryLowThreshold) {
    alertTriggered = true;
    alertMessage += "Low Battery: " + String(sensorData.batteryLevel) + "% ";
  }
  
  if (alertTriggered) {
    triggerAlert(alertMessage);
  }
}

void triggerAlert(String message) {
  Serial.println("🚨 ALERT: " + message);
  
  // Buzzer alert
  if (config.buzzerEnabled) {
    for (int i = 0; i < 3; i++) {
      digitalWrite(BUZZER_PIN, HIGH);
      delay(200);
      digitalWrite(BUZZER_PIN, LOW);
      delay(100);
    }
  }
  
  // Vibrator alert
  if (config.vibratorEnabled) {
    digitalWrite(VIBRATOR_PIN, HIGH);
    delay(1000);
    digitalWrite(VIBRATOR_PIN, LOW);
  }
  
  // Turn on display to show alert
  displayOn = true;
  displayOffTime = millis() + DISPLAY_TIMEOUT;
}

// Continue with remaining functions...
void handleButton() {
  if (digitalRead(BUTTON_PIN) == LOW && !buttonPressed) {
    buttonPressed = true;
    buttonPressTime = millis();
    
    // Turn on display
    displayOn = true;
    displayOffTime = millis() + DISPLAY_TIMEOUT;
    
    Serial.println(F("Button pressed - Display activated"));
  } else if (digitalRead(BUTTON_PIN) == HIGH && buttonPressed) {
    buttonPressed = false;
  }
}

void handleDisplayTimeout(unsigned long currentTime) {
  if (displayOn && currentTime > displayOffTime) {
    displayOn = false;
    display.clearBuffer();
    display.sendBuffer();
    Serial.println(F("Display turned off"));
  }
}

void handleWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED && !setupMode && config.isConfigured) {
    Serial.println(F("WiFi disconnected, attempting reconnection..."));
    WiFi.reconnect();
    delay(5000);
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println(F("WiFi reconnected"));
      serverConnected = true;
      timeClient.update();
    }
  }
}

void updateDisplay() {
  if (!displayOn) return;
  
  display.clearBuffer();
  display.setFont(u8g2_font_ncenB08_tr);
  
  // Show device status
  display.drawStr(0, 10, ("LifeLink " + config.deviceId.substring(7)).c_str());
  
  // Show WiFi status
  if (WiFi.status() == WL_CONNECTED) {
    display.drawStr(90, 10, "WiFi");
  } else if (setupMode) {
    display.drawStr(90, 10, "SETUP");
  } else {
    display.drawStr(90, 10, "NO WiFi");
  }
  
  // Show health data
  if (sensorData.heartRate > 0) {
    display.drawStr(0, 25, ("HR: " + String((int)sensorData.heartRate) + " bpm").c_str());
  }
  
  if (sensorData.spO2 > 0) {
    display.drawStr(0, 37, ("SpO2: " + String((int)sensorData.spO2) + "%").c_str());
  }
  
  if (sensorData.bodyTemperature > 0) {
    display.drawStr(0, 49, ("Temp: " + String(sensorData.bodyTemperature, 1) + "C").c_str());
  }
  
  // Show battery level
  display.drawStr(0, 61, ("Batt: " + String(sensorData.batteryLevel) + "%").c_str());
  
  // Show alerts
  if (sensorData.fallDetected) {
    display.setFont(u8g2_font_ncenB10_tr);
    display.drawStr(65, 40, "FALL!");
    display.setFont(u8g2_font_ncenB08_tr);
  }
  
  display.sendBuffer();
}

void sendDataToServer() {
  if (!serverConnected || WiFi.status() != WL_CONNECTED) {
    Serial.println(F("No server connection"));
    return;
  }
  
  Serial.println(F("Sending data to server..."));
  
  // Create JSON payload
  DynamicJsonDocument doc(2048);
  
  doc["deviceId"] = config.deviceId;
  doc["deviceName"] = config.deviceName;
  doc["timestamp"] = sensorData.timestamp;
  
  // Health data
  if (sensorData.heartRate > 0) {
    doc["heartRate"]["value"] = sensorData.heartRate;
    doc["heartRate"]["unit"] = "bpm";
    doc["heartRate"]["quality"] = fingerDetected ? "good" : "poor";
  }
  
  if (sensorData.spO2 > 0) {
    doc["spO2"]["value"] = sensorData.spO2;
    doc["spO2"]["unit"] = "%";
    doc["spO2"]["quality"] = validSPO2 ? "good" : "poor";
  }
  
  if (sensorData.bodyTemperature > 0) {
    doc["bodyTemperature"]["value"] = sensorData.bodyTemperature;
    doc["bodyTemperature"]["unit"] = "°C";
    doc["bodyTemperature"]["sensorType"] = "DS18B20";
  }
  
  // Environmental data
  doc["environmental"]["pressure"]["value"] = sensorData.pressure;
  doc["environmental"]["pressure"]["unit"] = "Pa";
  doc["environmental"]["altitude"]["value"] = sensorData.altitude;
  doc["environmental"]["altitude"]["unit"] = "m";
  doc["environmental"]["ambientTemperature"]["value"] = sensorData.envTemperature;
  doc["environmental"]["ambientTemperature"]["unit"] = "°C";
  
  // Motion data
  doc["motion"]["accelerometer"]["x"] = sensorData.accelerometerX;
  doc["motion"]["accelerometer"]["y"] = sensorData.accelerometerY;
  doc["motion"]["accelerometer"]["z"] = sensorData.accelerometerZ;
  doc["motion"]["accelerometer"]["magnitude"] = sensorData.accelerometerMagnitude;
  doc["motion"]["fallDetected"] = sensorData.fallDetected;
  
  // Device status
  doc["device"]["batteryLevel"] = sensorData.batteryLevel;
  doc["device"]["batteryVoltage"] = sensorData.batteryVoltage;
  doc["device"]["signalStrength"] = sensorData.signalStrength;
  doc["device"]["connectionType"] = "wifi";
  doc["device"]["uptime"] = millis() / 1000;
  doc["device"]["freeMemory"] = ESP.getFreeHeap();
  
  // Data quality
  doc["dataQuality"]["overall"] = "good";
  doc["dataQuality"]["sensorStatus"]["heartRate"] = sensorData.heartRate > 0;
  doc["dataQuality"]["sensorStatus"]["spO2"] = sensorData.spO2 > 0;
  doc["dataQuality"]["sensorStatus"]["temperature"] = sensorData.bodyTemperature > 0;
  doc["dataQuality"]["sensorStatus"]["accelerometer"] = true;
  
  // Metadata
  doc["metadata"]["firmwareVersion"] = FIRMWARE_VERSION;
  doc["metadata"]["samplingRate"] = 60 / (SENSOR_READ_INTERVAL / 1000);
  
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
    Serial.println("Response: " + response);
  } else {
    Serial.println("Error sending data: " + String(httpResponseCode));
    serverConnected = false;
  }
  
  http.end();
}

void testServerConnection() {
  Serial.println(F("Testing server connection..."));
  
  http.begin(config.serverURL + "/api/health");
  http.addHeader("X-API-Key", config.apiKey);
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    Serial.println(F("Server connection test successful"));
    serverConnected = true;
  } else {
    Serial.println("Server connection test failed: " + String(httpResponseCode));
    serverConnected = false;
  }
  
  http.end();
}

void printSensorData() {
  Serial.println(F("=== Sensor Data ==="));
  Serial.println("Heart Rate: " + String(sensorData.heartRate) + " BPM");
  Serial.println("SpO2: " + String(sensorData.spO2) + "%");
  Serial.println("Body Temperature: " + String(sensorData.bodyTemperature) + "°C");
  Serial.println("Environment Temperature: " + String(sensorData.envTemperature) + "°C");
  Serial.println("Pressure: " + String(sensorData.pressure) + " Pa");
  Serial.println("Altitude: " + String(sensorData.altitude) + " m");
  Serial.println("Accelerometer: X=" + String(sensorData.accelerometerX) + 
                 " Y=" + String(sensorData.accelerometerY) + 
                 " Z=" + String(sensorData.accelerometerZ));
  Serial.println("Fall Detected: " + String(sensorData.fallDetected ? "YES" : "NO"));
  Serial.println("Battery Level: " + String(sensorData.batteryLevel) + "%");
  Serial.println("Signal Strength: " + String(sensorData.signalStrength) + " dBm");
  Serial.println(F("=================="));
}

void showStartupComplete() {
  display.clearBuffer();
  display.setFont(u8g2_font_ncenB10_tr);
  display.drawStr(0, 15, "LifeLink");
  display.drawStr(0, 35, "Ready!");
  display.setFont(u8g2_font_ncenB08_tr);
  display.drawStr(0, 50, config.deviceId.c_str());
  display.sendBuffer();
  
  delay(2000);
  
  displayOn = true;
  displayOffTime = millis() + DISPLAY_TIMEOUT;
}

void showSetupInstructions() {
  display.clearBuffer();
  display.setFont(u8g2_font_ncenB08_tr);
  display.drawStr(0, 10, "SETUP MODE");
  display.drawStr(0, 22, "Connect to WiFi:");
  display.drawStr(0, 34, AP_SSID);
  display.drawStr(0, 46, "Password:");
  display.drawStr(0, 58, AP_PASSWORD);
  display.sendBuffer();
}
