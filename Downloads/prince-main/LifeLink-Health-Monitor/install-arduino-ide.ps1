# Arduino IDE Installation Script
# This script downloads and installs Arduino IDE 2.0

Write-Host "=== Arduino IDE Installation for LifeLink Health Monitor ===" -ForegroundColor Green
Write-Host "Downloading Arduino IDE 2.3.2..." -ForegroundColor Yellow

# Define URLs and paths
$ArduinoIDEUrl = "https://downloads.arduino.cc/arduino-ide/arduino-ide_2.3.2_Windows_64bit.exe"
$TempPath = $env:TEMP
$InstallerPath = "$TempPath\arduino-ide-installer.exe"

try {
    # Download Arduino IDE
    Write-Host "Downloading from: $ArduinoIDEUrl" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $ArduinoIDEUrl -OutFile $InstallerPath -UseBasicParsing
    Write-Host "Download completed!" -ForegroundColor Green
    
    # Check if file was downloaded
    if (Test-Path $InstallerPath) {
        $FileSize = (Get-Item $InstallerPath).Length / 1MB
        Write-Host "Downloaded file size: $([math]::Round($FileSize, 2)) MB" -ForegroundColor Cyan
        
        Write-Host "Starting Arduino IDE installation..." -ForegroundColor Yellow
        Write-Host "Please follow the installation wizard when it opens." -ForegroundColor Magenta
        
        # Start the installer
        Start-Process -FilePath $InstallerPath -Wait
        
        Write-Host "Arduino IDE installation completed!" -ForegroundColor Green
        
        # Clean up
        if (Test-Path $InstallerPath) {
            Remove-Item $InstallerPath -Force
            Write-Host "Temporary installer file cleaned up." -ForegroundColor Cyan
        }
        
    } else {
        Write-Host "ERROR: Download failed. Installer file not found." -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Manual installation required." -ForegroundColor Yellow
    Write-Host "Please download Arduino IDE from: https://www.arduino.cc/en/software" -ForegroundColor Cyan
    exit 1
}

Write-Host "`n=== Next Steps ===" -ForegroundColor Green
Write-Host "1. Open Arduino IDE" -ForegroundColor White
Write-Host "2. Go to File > Preferences" -ForegroundColor White
Write-Host "3. Add ESP32 board manager URL:" -ForegroundColor White
Write-Host "   https://dl.espressif.com/dl/package_esp32_index.json" -ForegroundColor Cyan
Write-Host "4. Install ESP32 board package via Tools > Board > Boards Manager" -ForegroundColor White
Write-Host "5. Install required libraries for LifeLink Health Monitor" -ForegroundColor White

Write-Host "`n=== Required Libraries for LifeLink Project ===" -ForegroundColor Green
Write-Host "For ESP32-1 (Health Monitoring):" -ForegroundColor Yellow
Write-Host "  - OneWire" -ForegroundColor White
Write-Host "  - DallasTemperature" -ForegroundColor White
Write-Host "  - MAX30105lib" -ForegroundColor White
Write-Host "  - MPU6050_tockn" -ForegroundColor White
Write-Host "  - Adafruit SSD1306" -ForegroundColor White
Write-Host "  - Adafruit GFX" -ForegroundColor White
Write-Host "  - WiFiManager" -ForegroundColor White
Write-Host "  - ArduinoJson" -ForegroundColor White
Write-Host "  - AsyncTCP" -ForegroundColor White
Write-Host "  - ESPAsyncWebServer" -ForegroundColor White

Write-Host "`nFor ESP32-2 (Location & Communication):" -ForegroundColor Yellow
Write-Host "  - SoftwareSerial" -ForegroundColor White
Write-Host "  - TinyGPS++" -ForegroundColor White
Write-Host "  - SD" -ForegroundColor White
Write-Host "  - WiFiManager" -ForegroundColor White
Write-Host "  - ArduinoJson" -ForegroundColor White

Write-Host "`nArduino IDE installation script completed!" -ForegroundColor Green
