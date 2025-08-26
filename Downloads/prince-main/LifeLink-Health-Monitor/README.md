
# LOGIC-LEGION-YCC_22
**IoT-Based Portable Health Monitoring System**

This project focuses on building a compact, portable **health monitoring box** that can measure and display a patient's vital signs. Designed for quick and reliable health assessments, the device is ideal for clinics, homes, and emergency scenarios.

---

## Components
### Microcontroller:
- **ESP32 x2**: Dual microcontrollers for multitasking and efficient communication.

### Sensors:
1. **DS18B20**: Waterproof temperature sensor for body temperature monitoring.
2. **MAX30110**: Heart rate and SpO2 sensor for oxygen saturation and pulse tracking.
3. **Pulse Sensor XD-58C**: Additional heart rate monitoring for redundancy.
4. **BMP180**: Barometric pressure, temperature, and altitude sensor for environmental monitoring.
5. **AD8232** (Optional): ECG monitoring for advanced cardiac health analysis.

### Display and Alerts:
6. **HW-239A OLED Display**: Real-time data visualization on the device.
7. **Buzzer**: Audio alerts for critical health conditions.

### Communication and Storage:
8. **NEO-6M GPS Module**: Real-time location tracking for emergencies.
9. **SIM800L GSM Module**: SMS notifications for remote alerts.
10. **Micro SD Card Module**: Local data storage for historical analysis.

### Power Supply:
11. **Power Bank (5V 2A)**: Portable power source for uninterrupted operation.

---

## Features
1. **Real-Time Monitoring**:
   - Measure temperature, heart rate, SpO2, and ECG (if AD8232 is used).
   - Display all data on the OLED screen for immediate feedback.

2. **Emergency Alerts**:
   - Buzzer alerts for critical health conditions.
   - SMS notifications via the GSM module to notify caregivers or healthcare providers.

3. **Location Tracking**:
   - GPS module provides real-time location data, useful in emergencies.

4. **Data Logging**:
   - Store health data on the Micro SD card for long-term analysis.

5. **Compact and Portable**:
   - Small box design powered by a portable power bank, making it easy to carry and use anywhere.

---

# Connection

ESP32 #1 (Sensor Controller)
This ESP32 is responsible for reading data from the sensors.

1) DS18B20 (Temperature Sensor):
Data Pin → GPIO4
VCC → 3.3V
GND → GND

2) MAX30110 (Heart Rate and SpO2 Sensor):
SDA → GPIO21
SCL → GPIO22
VCC → 3.3V
GND → GND

3) Pulse Sensor XD-58C (Heart Rate Sensor):
Signal Pin → GPIO34 (Analog Input)
VCC → 3.3V
GND → GND

4) BMP180 (Barometric Pressure Sensor):
SDA → GPIO21
SCL → GPIO22
VCC → 3.3V
GND → GND

5) AD8232 (ECG Sensor) (Optional):
Output Pin → GPIO35 (Analog Input)
VCC → 3.3V
GND → GND

6) UART Communication with ESP32 #2:
TX → GPIO17
RX → GPIO16

ESP32 #2 (Display and Communication Controller)
This ESP32 handles the display, communication modules, and data logging.

1) HW-239A OLED Display:
SDA → GPIO21
SCL → GPIO22
VCC → 3.3V
GND → GND

2) NEO-6M GPS Module:
TX → GPIO16
RX → GPIO17
VCC → 3.3V
GND → GND

3) SIM800L GSM Module:
TX → GPIO26
RX → GPIO27
VCC → 3.3V (Use a stable power source, as SIM800L can draw high current.)
GND → GND

4) Micro SD Card Module:
MISO → GPIO19
MOSI → GPIO23
SCK → GPIO18
CS → GPIO5
VCC → 3.3V
GND → GND

5) UART Communication with ESP32 #1:
RX → GPIO16
TX → GPIO17
