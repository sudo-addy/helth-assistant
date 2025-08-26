// Toggle between login and register forms - LifeLink Health Monitor
// Enhanced version of the original addon functionality with LifeLink integration

class AuthToggle {
    constructor() {
        this.container = document.querySelector('.container');
        this.registerBtn = document.querySelector('.register-btn');
        this.loginBtn = document.querySelector('.login-btn');
        
        this.init();
    }

    init() {
        if (this.registerBtn) {
            this.registerBtn.addEventListener('click', () => {
                this.showRegisterForm();
            });
        }

        if (this.loginBtn) {
            this.loginBtn.addEventListener('click', () => {
                this.showLoginForm();
            });
        }

        // Handle URL hash for direct navigation
        this.handleUrlHash();
    }

    showRegisterForm() {
        if (this.container) {
            this.container.classList.add('active');
            window.location.hash = 'register';
        }
    }

    showLoginForm() {
        if (this.container) {
            this.container.classList.remove('active');
            window.location.hash = 'login';
        }
    }

    handleUrlHash() {
        const hash = window.location.hash;
        if (hash === '#register' && this.container) {
            this.container.classList.add('active');
        }
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AuthToggle();
});
