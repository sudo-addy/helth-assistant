// Enhanced Dashboard JavaScript with Modern UI and Advanced Charts
class HealthDashboard {
    constructor() {
        this.socket = null;
        this.charts = {};
        this.devices = new Map();
        this.alerts = [];
        this.currentUser = null;
        this.refreshInterval = null;
        this.map = null;
        this.activeChart = 'vitals';
        this.timeRange = 'live';
        this.animationFrames = new Map();
        
        this.init();
    }

    async init() {
        try {
            // Check authentication
            await this.checkAuth();
            
            // Initialize Socket.io connection
            this.initSocket();
            
            // Initialize dashboard components
            this.initCharts();
            this.initMap();
            this.initEventListeners();
            this.initAnimations();
            
            // Load initial data
            await this.loadDevices();
            await this.loadAlerts();
            this.generateMockData(); // For demonstration
            
            // Start auto-refresh
            this.startAutoRefresh();
            
            console.log('Enhanced Dashboard initialized successfully');
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            this.showError('Failed to initialize dashboard');
        }
    }

    async checkAuth() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        try {
            const response = await fetch('/api/auth/verify', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('authToken');
                window.location.href = '/login.html';
                return;
            }

            const data = await response.json();
            this.currentUser = data.user;
            
            // Update user info in dashboard
            const userNameEl = document.getElementById('user-name');
            if (userNameEl) {
                userNameEl.textContent = 
                    `${this.currentUser.firstName} ${this.currentUser.lastName}` || this.currentUser.username;
            }
        } catch (error) {
            console.error('Auth verification error:', error);
            // For demo purposes, continue without auth
            this.currentUser = { username: 'Demo User', firstName: 'John', lastName: 'Doe' };
        }
    }

    initSocket() {
        this.socket = io({
            auth: {
                token: localStorage.getItem('authToken')
            }
        });

        this.socket.on('connect', () => {
            console.log('Socket connected:', this.socket.id);
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.updateConnectionStatus(false);
        });

        this.socket.on('sensor-data', (data) => {
            this.handleNewSensorData(data);
        });

        this.socket.on('device-status', (data) => {
            this.updateDeviceStatus(data);
        });

        this.socket.on('new-alert', (alert) => {
            this.handleNewAlert(alert);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showError('Real-time connection error');
        });
    }

    initCharts() {
        // Main Health Chart (Multi-line)
        const healthCtx = document.getElementById('health-chart');
        if (healthCtx) {
            this.charts.health = new Chart(healthCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Heart Rate (BPM)',
                            data: [],
                            borderColor: '#ff6b6b',
                            backgroundColor: 'rgba(255, 107, 107, 0.1)',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 3
                        },
                        {
                            label: 'SpO2 (%)',
                            data: [],
                            borderColor: '#4ecdc4',
                            backgroundColor: 'rgba(78, 205, 196, 0.1)',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 3,
                            yAxisID: 'y1'
                        },
                        {
                            label: 'Temperature (°C)',
                            data: [],
                            borderColor: '#45b7d1',
                            backgroundColor: 'rgba(69, 183, 209, 0.1)',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 3,
                            yAxisID: 'y2'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: '#333',
                                usePointStyle: true,
                                font: {
                                    size: 12,
                                    weight: '500'
                                }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            titleColor: '#333',
                            bodyColor: '#666',
                            borderColor: '#ddd',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#666',
                                maxTicksLimit: 10
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            min: 40,
                            max: 200,
                            ticks: {
                                color: '#ff6b6b'
                            },
                            grid: {
                                color: 'rgba(255, 107, 107, 0.1)'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            min: 85,
                            max: 100,
                            ticks: {
                                color: '#4ecdc4'
                            },
                            grid: {
                                drawOnChartArea: false
                            }
                        },
                        y2: {
                            type: 'linear',
                            display: false,
                            min: 35,
                            max: 42
                        }
                    },
                    animation: {
                        duration: 1000,
                        easing: 'easeInOutQuart'
                    }
                }
            });
        }

        // Activity Chart (Doughnut)
        const activityCtx = document.getElementById('activity-chart');
        if (activityCtx) {
            this.charts.activity = new Chart(activityCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Active', 'Rest', 'Sleep'],
                    datasets: [{
                        data: [8, 10, 6],
                        backgroundColor: [
                            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
                        ],
                        borderWidth: 0,
                        cutout: '70%'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#333',
                                usePointStyle: true,
                                font: {
                                    size: 12,
                                    weight: '500'
                                }
                            }
                        }
                    },
                    animation: {
                        animateRotate: true,
                        animateScale: true,
                        duration: 2000
                    }
                }
            });
        }

        // Sleep Chart (Bar)
        const sleepCtx = document.getElementById('sleep-chart');
        if (sleepCtx) {
            this.charts.sleep = new Chart(sleepCtx, {
                type: 'bar',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                        label: 'Sleep Hours',
                        data: [7.5, 8.2, 6.8, 7.1, 8.5, 9.2, 8.8],
                        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: 8,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 10,
                            ticks: {
                                color: '#666'
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#666'
                            },
                            grid: {
                                display: false
                            }
                        }
                    },
                    animation: {
                        duration: 2000,
                        easing: 'easeInOutBounce'
                    }
                }
            });
        }
    }

    initMap() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        // Initialize Leaflet map
        this.map = L.map('map').setView([21.1458, 79.0882], 13); // Default to Nagpur

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        // Device markers storage
        this.deviceMarkers = new Map();

        // Add a sample device location
        const marker = L.marker([21.1458, 79.0882])
            .addTo(this.map)
            .bindPopup(`
                <strong>Health Monitor Device #1</strong><br>
                Status: Online<br>
                Battery: 85%<br>
                Last Update: ${new Date().toLocaleTimeString()}
            `);
        
        this.deviceMarkers.set('device-1', marker);
    }

    initEventListeners() {
        // Time filter buttons
        document.querySelectorAll('.time-filter button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-filter button').forEach(b => 
                    b.classList.remove('active'));
                e.target.classList.add('active');
                this.timeRange = e.target.dataset.time;
                this.updateChartsForTimeRange();
            });
        });

        // Chart tab buttons
        document.querySelectorAll('.chart-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-tab').forEach(b => 
                    b.classList.remove('active'));
                e.target.classList.add('active');
                this.activeChart = e.target.dataset.chart;
                this.switchChartView();
            });
        });

        // Device tabs
        document.querySelectorAll('.device-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.device-tab').forEach(b => 
                    b.classList.remove('active'));
                e.target.classList.add('active');
                this.switchDevice(e.target.dataset.device);
            });
        });

        // Quick action buttons
        document.getElementById('emergency-contact')?.addEventListener('click', () => {
            this.handleEmergencyContact();
        });

        document.getElementById('export-data')?.addEventListener('click', () => {
            this.handleExportData();
        });

        document.getElementById('device-settings')?.addEventListener('click', () => {
            this.handleDeviceSettings();
        });

        document.getElementById('share-data')?.addEventListener('click', () => {
            this.handleShareData();
        });

        // Map control buttons
        document.getElementById('center-map')?.addEventListener('click', () => {
            this.centerMapOnDevice();
        });

        document.getElementById('share-location')?.addEventListener('click', () => {
            this.shareLocation();
        });

        // Clear alerts
        document.getElementById('clear-alerts')?.addEventListener('click', () => {
            this.clearAlerts();
        });
    }

    initAnimations() {
        // Animate vital signs cards on load
        const vitalCards = document.querySelectorAll('.vital-card');
        vitalCards.forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
        });

        // Animate progress bars
        const progressBars = document.querySelectorAll('.progress-fill');
        progressBars.forEach(bar => {
            const width = bar.style.width;
            bar.style.width = '0%';
            setTimeout(() => {
                bar.style.width = width;
            }, 500);
        });

        // Start heartbeat animation for heart rate card
        this.startHeartbeatAnimation();
    }

    startHeartbeatAnimation() {
        const heartIcon = document.querySelector('[data-type="heart"] .vital-icon');
        if (heartIcon) {
            setInterval(() => {
                heartIcon.style.animation = 'none';
                setTimeout(() => {
                    heartIcon.style.animation = 'heartbeat 2s infinite';
                }, 10);
            }, 5000);
        }
    }

    generateMockData() {
        // Generate sample device tabs
        const deviceTabs = document.getElementById('device-tabs');
        if (deviceTabs) {
            deviceTabs.innerHTML = `
                <div class="device-tab active" data-device="ESP32-01">
                    📱 ESP32-01 (Chest Monitor)
                </div>
                <div class="device-tab" data-device="ESP32-02">
                    ⌚ ESP32-02 (Wrist Monitor)
                </div>
            `;
        }

        // Generate sample vital signs data
        this.updateVitalSigns({
            heartRate: Math.floor(Math.random() * 40) + 60,
            spo2: Math.floor(Math.random() * 10) + 95,
            temperature: (Math.random() * 2 + 36).toFixed(1),
            battery: Math.floor(Math.random() * 30) + 70
        });

        // Generate sample chart data
        this.generateSampleChartData();

        // Update statistics
        this.updateStatistics();
    }

    generateSampleChartData() {
        const now = new Date();
        const labels = [];
        const heartRateData = [];
        const spo2Data = [];
        const temperatureData = [];

        // Generate last 24 data points (hourly)
        for (let i = 23; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 60 * 60 * 1000);
            labels.push(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            
            // Generate realistic data with some variation
            heartRateData.push(Math.floor(Math.random() * 40) + 60 + Math.sin(i * 0.5) * 10);
            spo2Data.push(Math.floor(Math.random() * 5) + 96 + Math.cos(i * 0.3) * 2);
            temperatureData.push(36.5 + Math.sin(i * 0.2) * 0.8 + Math.random() * 0.4);
        }

        if (this.charts.health) {
            this.charts.health.data.labels = labels;
            this.charts.health.data.datasets[0].data = heartRateData;
            this.charts.health.data.datasets[1].data = spo2Data;
            this.charts.health.data.datasets[2].data = temperatureData;
            this.charts.health.update('none');
            
            // Animate in
            setTimeout(() => {
                this.charts.health.update();
            }, 500);
        }
    }

    updateVitalSigns(data) {
        // Update heart rate
        const heartRateEl = document.getElementById('heart-rate');
        if (heartRateEl) {
            heartRateEl.textContent = data.heartRate || '--';
            this.animateValue(heartRateEl, parseInt(heartRateEl.textContent) || 0, data.heartRate);
        }

        // Update SpO2
        const spo2El = document.getElementById('spo2');
        if (spo2El) {
            spo2El.textContent = data.spo2 || '--';
            this.animateValue(spo2El, parseInt(spo2El.textContent) || 0, data.spo2);
        }

        // Update Temperature
        const tempEl = document.getElementById('temperature');
        if (tempEl) {
            tempEl.textContent = data.temperature ? `${data.temperature}` : '--';
        }

        // Update Battery
        const batteryEl = document.getElementById('battery');
        if (batteryEl) {
            batteryEl.textContent = data.battery ? `${data.battery}%` : '--';
        }

        // Update trend indicators
        this.updateTrendIndicators(data);
    }

    updateTrendIndicators(data) {
        // Heart rate trend
        const heartTrend = document.getElementById('heart-rate-trend');
        if (heartTrend && data.heartRate) {
            if (data.heartRate > 100) {
                heartTrend.className = 'vital-trend trend-up';
                heartTrend.textContent = 'High';
            } else if (data.heartRate < 60) {
                heartTrend.className = 'vital-trend trend-down';
                heartTrend.textContent = 'Low';
            } else {
                heartTrend.className = 'vital-trend trend-stable';
                heartTrend.textContent = 'Normal';
            }
        }

        // SpO2 trend
        const spo2Trend = document.getElementById('spo2-trend');
        if (spo2Trend && data.spo2) {
            if (data.spo2 < 95) {
                spo2Trend.className = 'vital-trend trend-down';
                spo2Trend.textContent = 'Low';
            } else {
                spo2Trend.className = 'vital-trend trend-stable';
                spo2Trend.textContent = 'Normal';
            }
        }

        // Temperature trend
        const tempTrend = document.getElementById('temperature-trend');
        if (tempTrend && data.temperature) {
            const temp = parseFloat(data.temperature);
            if (temp > 37.5) {
                tempTrend.className = 'vital-trend trend-up';
                tempTrend.textContent = 'Fever';
            } else if (temp < 36) {
                tempTrend.className = 'vital-trend trend-down';
                tempTrend.textContent = 'Low';
            } else {
                tempTrend.className = 'vital-trend trend-stable';
                tempTrend.textContent = 'Normal';
            }
        }
    }

    updateStatistics() {
        // Update statistics cards
        document.getElementById('avg-heart-rate').textContent = '74';
        document.getElementById('avg-spo2').textContent = '97';
        document.getElementById('avg-temp').textContent = '36.8';
        document.getElementById('daily-steps').textContent = '8,542';

        // Animate progress bars
        setTimeout(() => {
            document.querySelectorAll('.progress-fill').forEach(bar => {
                const width = bar.style.width;
                bar.style.width = '0%';
                setTimeout(() => {
                    bar.style.width = width;
                }, 100);
            });
        }, 500);
    }

    animateValue(element, start, end, duration = 1000) {
        if (isNaN(start) || isNaN(end)) return;
        
        const startTime = performance.now();
        const difference = end - start;

        const step = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = Math.floor(start + difference * this.easeOutQuart(progress));
            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        };

        requestAnimationFrame(step);
    }

    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    switchChartView() {
        // This would switch between different chart views
        // For now, just show a notification
        this.showNotification(`Switched to ${this.activeChart} view`, 'info');
    }

    updateChartsForTimeRange() {
        // This would update charts based on selected time range
        this.showNotification(`Updated view for ${this.timeRange} range`, 'info');
        
        if (this.timeRange !== 'live') {
            // Generate different data based on time range
            this.generateSampleChartData();
        }
    }

    switchDevice(deviceId) {
        this.showNotification(`Switched to device: ${deviceId}`, 'info');
        // Generate new data for the selected device
        this.generateMockData();
    }

    handleEmergencyContact() {
        if (confirm('Are you sure you want to contact emergency services?')) {
            this.showNotification('🚨 Emergency services contacted!', 'error');
            // Simulate emergency alert
            setTimeout(() => {
                document.getElementById('emergency-alert').style.display = 'block';
                document.getElementById('emergency-message').textContent = 
                    'Emergency services have been notified. Help is on the way.';
            }, 1000);
        }
    }

    handleExportData() {
        this.showNotification('📊 Preparing health data export...', 'info');
        // Simulate data export
        setTimeout(() => {
            const data = {
                user: this.currentUser?.username || 'Demo User',
                exportDate: new Date().toISOString(),
                vitals: {
                    averageHeartRate: 74,
                    averageSpO2: 97,
                    averageTemperature: 36.8
                },
                activity: {
                    dailySteps: 8542,
                    activeMinutes: 145,
                    caloriesBurned: 2340
                }
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], 
                { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `health-data-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            this.showNotification('💾 Health data exported successfully!', 'success');
        }, 2000);
    }

    handleDeviceSettings() {
        this.showNotification('⚙️ Opening device settings...', 'info');
        // This would open a settings modal or redirect
    }

    handleShareData() {
        if (confirm('Share your health data with your doctor?')) {
            this.showNotification('📤 Health data shared with Dr. Smith', 'success');
        }
    }

    centerMapOnDevice() {
        if (this.map) {
            this.map.setView([21.1458, 79.0882], 15);
            this.showNotification('📍 Map centered on device location', 'info');
        }
    }

    shareLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const { latitude, longitude } = position.coords;
                this.showNotification(`📍 Location shared: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'success');
            }, () => {
                this.showNotification('❌ Unable to get your location', 'error');
            });
        }
    }

    clearAlerts() {
        if (confirm('Clear all alerts?')) {
            document.getElementById('alert-list').innerHTML = 
                '<div class="no-data">No recent alerts</div>';
            this.showNotification('🧹 All alerts cleared', 'success');
        }
    }

    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('connection-text');
        
        if (statusDot && statusText) {
            statusDot.className = `status-dot ${connected ? '' : 'disconnected'}`;
            statusText.textContent = connected ? 'Connected' : 'Disconnected';
        }

        const offlineBanner = document.getElementById('offline-banner');
        if (offlineBanner) {
            offlineBanner.style.display = connected ? 'none' : 'block';
        }
    }

    handleNewSensorData(data) {
        // Update vital signs with new data
        this.updateVitalSigns(data);
        
        // Add to real-time chart if in live mode
        if (this.timeRange === 'live' && this.charts.health) {
            const now = new Date().toLocaleTimeString();
            
            this.charts.health.data.labels.push(now);
            this.charts.health.data.datasets[0].data.push(data.heartRate);
            this.charts.health.data.datasets[1].data.push(data.spo2);
            this.charts.health.data.datasets[2].data.push(data.temperature);
            
            // Keep only last 20 points for live view
            if (this.charts.health.data.labels.length > 20) {
                this.charts.health.data.labels.shift();
                this.charts.health.data.datasets.forEach(dataset => {
                    dataset.data.shift();
                });
            }
            
            this.charts.health.update('none');
        }
    }

    startAutoRefresh() {
        // Simulate new sensor data every 5 seconds
        this.refreshInterval = setInterval(() => {
            if (this.timeRange === 'live') {
                const mockData = {
                    heartRate: Math.floor(Math.random() * 40) + 60,
                    spo2: Math.floor(Math.random() * 10) + 95,
                    temperature: (Math.random() * 2 + 36).toFixed(1),
                    battery: Math.floor(Math.random() * 30) + 70
                };
                this.handleNewSensorData(mockData);
            }
        }, 5000);
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add styles if not already present
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 1rem 1.5rem;
                    border-radius: 10px;
                    color: white;
                    font-weight: 500;
                    z-index: 1000;
                    transform: translateX(400px);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                    max-width: 350px;
                }
                .notification.show {
                    transform: translateX(0);
                }
                .notification-info { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                .notification-success { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
                .notification-warning { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
                .notification-error { background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); }
                .notification-content {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                }
                .notification-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 1.2rem;
                    cursor: pointer;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
            `;
            document.head.appendChild(styles);
        }
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show with animation
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    destroy() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Destroy charts
        Object.values(this.charts).forEach(chart => chart.destroy());
        
        // Remove map
        if (this.map) {
            this.map.remove();
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new HealthDashboard();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboard) {
        window.dashboard.destroy();
    }
});
