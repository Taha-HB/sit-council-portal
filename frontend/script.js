/* Copy all JavaScript from between <script> tags in the HTML */
    
    <script>
        // Main Application JavaScript
        class MeetingMinutesSystem {
            constructor() {
                this.apiBaseUrl = 'https://sit-council-backend.onrender.com/api';
                this.currentUser = null;
                this.token = localStorage.getItem('token');
                this.currentMeeting = null;
                this.performanceChart = null;
                this.detailedChart = null;
                
                // Initialize
                this.init();
            }
            
            init() {
                this.checkAuth();
                this.setupEventListeners();
                this.loadRememberedEmail();
            }
            
            checkAuth() {
                if (this.token) {
                    this.validateToken();
                }
            }
            
            async validateToken() {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/auth/validate`, {
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.currentUser = data.user;
                        this.showApp();
                    } else {
                        this.showAuth();
                    }
                } catch (error) {
                    console.error('Token validation error:', error);
                    this.showAuth();
                }
            }
            
            async login(email, password, rememberMe) {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password, rememberMe })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        this.token = data.token;
                        this.currentUser = data.user;
                        localStorage.setItem('token', this.token);
                        
                        if (rememberMe) {
                            localStorage.setItem('rememberEmail', email);
                        }
                        
                        this.showApp();
                        this.showToast('Login successful!', 'success');
                    } else {
                        throw new Error(data.error || 'Login failed');
                    }
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            }
            
            async register(userData) {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/auth/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(userData)
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        this.showToast('Registration successful! Please wait for admin approval.', 'success');
                        // Switch to login tab
                        document.querySelector('.auth-tab[data-form="login"]').click();
                    } else {
                        throw new Error(data.error || 'Registration failed');
                    }
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            }
            
            logout() {
                this.currentUser = null;
                this.token = null;
                localStorage.removeItem('token');
                this.showAuth();
                this.showToast('Logged out successfully', 'success');
            }
            
            showAuth() {
                document.getElementById('auth-container').style.display = 'flex';
                document.getElementById('app-container').style.display = 'none';
            }
            
            showApp() {
                document.getElementById('auth-container').style.display = 'none';
                document.getElementById('app-container').style.display = 'block';
                
                this.updateUserInfo();
                this.loadDashboard();
                this.loadMeetings();
                this.loadMembers();
                this.loadSettings();
            }
            
            updateUserInfo() {
                if (this.currentUser) {
                    document.getElementById('user-name').textContent = this.currentUser.name;
                    document.getElementById('user-role').textContent = this.currentUser.role;
                    
                    const avatar = document.getElementById('user-avatar');
                    if (this.currentUser.avatar) {
                        avatar.innerHTML = `<img src="${this.currentUser.avatar}" alt="${this.currentUser.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                    } else {
                        const initials = this.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase();
                        avatar.textContent = initials;
                    }
                }
            }
            
            async loadDashboard() {
                try {
                    // Load stats
                    const statsResponse = await fetch(`${this.apiBaseUrl}/dashboard/stats`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (statsResponse.ok) {
                        const stats = await statsResponse.json();
                        this.updateDashboardStats(stats);
                    }
                    
                    // Load performance
                    const perfResponse = await fetch(`${this.apiBaseUrl}/performance`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (perfResponse.ok) {
                        const performance = await perfResponse.json();
                        this.updatePerformance(performance);
                    }
                    
                    // Load activities
                    this.loadActivities();
                } catch (error) {
                    console.error('Dashboard load error:', error);
                }
            }
            
            updateDashboardStats(stats) {
                document.getElementById('total-meetings').textContent = stats.totalMeetings;
                document.getElementById('total-members').textContent = stats.totalMembers;
                document.getElementById('pending-actions').textContent = stats.pendingActions;
                document.getElementById('minutes-published').textContent = stats.totalMinutes;
            }
            
            updatePerformance(performance) {
                // Update man of the month/week
                if (performance.manOfTheMonth) {
                    const monthMember = performance.manOfTheMonth.user;
                    document.getElementById('month-member').textContent = monthMember.name;
                    document.getElementById('month-details').textContent = `${monthMember.role} | Score: ${performance.manOfTheMonth.participationScore.toFixed(1)}`;
                    
                    const monthAvatar = document.getElementById('month-avatar');
                    if (monthMember.avatar) {
                        monthAvatar.innerHTML = `<img src="${monthMember.avatar}" alt="${monthMember.name}">`;
                    }
                }
                
                if (performance.manOfTheWeek) {
                    document.getElementById('week-member').textContent = performance.manOfTheWeek.name;
                    document.getElementById('week-details').textContent = `${performance.manOfTheWeek.role}`;
                    
                    const weekAvatar = document.getElementById('week-avatar');
                    if (performance.manOfTheWeek.avatar) {
                        weekAvatar.innerHTML = `<img src="${performance.manOfTheWeek.avatar}" alt="${performance.manOfTheWeek.name}">`;
                    }
                }
                
                // Update chart
                this.updatePerformanceChart(performance.performances);
            }
            
            updatePerformanceChart(performances) {
                const ctx = document.getElementById('performance-chart').getContext('2d');
                
                if (this.performanceChart) {
                    this.performanceChart.destroy();
                }
                
                const labels = performances.map(p => p.user.name);
                const scores = performances.map(p => p.participationScore);
                const attendance = performances.map(p => p.attendanceRate);
                
                this.performanceChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Performance Score',
                                data: scores,
                                backgroundColor: 'rgba(26, 82, 118, 0.7)',
                                borderColor: 'rgba(26, 82, 118, 1)',
                                borderWidth: 1
                            },
                            {
                                label: 'Attendance Rate',
                                data: attendance,
                                backgroundColor: 'rgba(46, 134, 193, 0.7)',
                                borderColor: 'rgba(46, 134, 193, 1)',
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100
                            }
                        }
                    }
                });
            }
            
            async loadMeetings() {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/meetings`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.displayMeetings(data.meetings);
                    }
                } catch (error) {
                    console.error('Load meetings error:', error);
                }
            }
            
            displayMeetings(meetings) {
                const container = document.getElementById('meetings-list');
                container.innerHTML = '';
                
                meetings.forEach(meeting => {
                    const meetingCard = this.createMeetingCard(meeting);
                    container.appendChild(meetingCard);
                });
            }
            
            createMeetingCard(meeting) {
                const card = document.createElement('div');
                card.className = `meeting-card ${meeting.type}`;
                
                const date = new Date(meeting.date);
                const formattedDate = date.toLocaleDateString();
                const formattedTime = `${meeting.startTime} - ${meeting.endTime}`;
                
                card.innerHTML = `
                    <div class="meeting-type">${meeting.type.toUpperCase()}</div>
                    <div class="meeting-title">${meeting.title}</div>
                    <div class="meeting-details">
                        <div class="meeting-detail">
                            <i class="fas fa-calendar"></i>
                            <span>${formattedDate}</span>
                        </div>
                        <div class="meeting-detail">
                            <i class="fas fa-clock"></i>
                            <span>${formattedTime}</span>
                        </div>
                        <div class="meeting-detail">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${meeting.location}</span>
                        </div>
                    </div>
                    <div class="meeting-actions">
                        <button class="btn" onclick="system.viewMeeting('${meeting._id}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-save" onclick="system.editMeeting('${meeting._id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        ${meeting.status === 'scheduled' ? `
                        <button class="btn" onclick="system.startMeeting('${meeting._id}')">
                            <i class="fas fa-play"></i> Start
                        </button>
                        ` : ''}
                    </div>
                `;
                
                return card;
            }
            
            async loadMembers() {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/users`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const members = await response.json();
                        this.populateMemberSelects(members);
                    }
                } catch (error) {
                    console.error('Load members error:', error);
                }
            }
            
            populateMemberSelects(members) {
                const chairSelect = document.getElementById('meeting-chair');
                const minutesSelect = document.getElementById('meeting-minutes-taker');
                
                chairSelect.innerHTML = '<option value="">Select Chairperson</option>';
                minutesSelect.innerHTML = '<option value="">Select Minutes Taker</option>';
                
                members.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member._id;
                    option.textContent = `${member.name} (${member.role})`;
                    
                    chairSelect.appendChild(option.cloneNode(true));
                    minutesSelect.appendChild(option.cloneNode(true));
                });
            }
            
            async loadSettings() {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/settings`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const settings = await response.json();
                        this.displaySettings(settings);
                    }
                } catch (error) {
                    console.error('Load settings error:', error);
                }
            }
            
            displaySettings(settings) {
                document.getElementById('institution-name').value = settings.institutionName;
                document.getElementById('council-name').value = settings.councilName;
                document.getElementById('meeting-frequency').value = settings.meetingFrequency;
                document.getElementById('default-duration').value = settings.defaultMeetingDuration;
                document.getElementById('auto-archive').value = settings.autoArchiveDays;
                document.getElementById('email-notifications').checked = settings.emailNotifications;
                document.getElementById('google-forms-integration').checked = settings.googleFormsIntegration;
                document.getElementById('primary-color').value = settings.primaryColor;
                
                // Update logo if exists
                if (settings.logo) {
                    const logoPreview = document.getElementById('logo-preview');
                    logoPreview.src = settings.logo;
                    logoPreview.style.display = 'block';
                    
                    const authLogo = document.getElementById('auth-logo');
                    const councilLogo = document.getElementById('council-logo');
                    
                    if (authLogo) authLogo.src = settings.logo;
                    if (councilLogo) councilLogo.src = settings.logo;
                }
            }
            
            async createMeeting(meetingData) {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/meetings`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify(meetingData)
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        this.showToast('Meeting created successfully!', 'success');
                        this.loadMeetings();
                        this.clearMeetingForm();
                    } else {
                        throw new Error(data.error || 'Failed to create meeting');
                    }
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            }
            
            clearMeetingForm() {
                document.getElementById('meeting-title').value = '';
                document.getElementById('meeting-date').value = '';
                document.getElementById('meeting-start-time').value = '';
                document.getElementById('meeting-end-time').value = '';
                document.getElementById('meeting-location').value = '';
                document.getElementById('meeting-description').value = '';
            }
            
            async generateQRCode(meetingId) {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/meetings/${meetingId}/qr`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.displayQRCode(data.qrCode, data.meetingCode);
                    }
                } catch (error) {
                    console.error('QR generation error:', error);
                }
            }
            
            displayQRCode(qrData, meetingCode) {
                const qrSection = document.getElementById('qr-section');
                const qrDisplay = document.getElementById('qr-code-display');
                const meetingCodeSpan = document.getElementById('current-meeting-code');
                
                qrSection.style.display = 'block';
                meetingCodeSpan.textContent = meetingCode;
                
                // Clear previous QR code
                qrDisplay.innerHTML = '';
                
                // Generate new QR code
                new QRCode(qrDisplay, {
                    text: qrData,
                    width: 170,
                    height: 170,
                    colorDark: "#1a5276",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
            
            async generatePDF(meetingId) {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/meetings/${meetingId}/pdf`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `meeting-minutes-${meetingId}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                        
                        this.showToast('PDF generated successfully!', 'success');
                    }
                } catch (error) {
                    console.error('PDF generation error:', error);
                    this.showToast('Failed to generate PDF', 'error');
                }
            }
            
            showToast(message, type = 'info') {
                const toastContainer = document.getElementById('toast-container');
                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                
                const icon = type === 'success' ? 'check-circle' : 
                             type === 'error' ? 'exclamation-circle' : 
                             type === 'warning' ? 'exclamation-triangle' : 'info-circle';
                
                toast.innerHTML = `
                    <div class="toast-icon">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div>${message}</div>
                `;
                
                toastContainer.appendChild(toast);
                
                // Show toast
                setTimeout(() => toast.classList.add('show'), 10);
                
                // Remove toast after 5 seconds
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => {
                        if (toast.parentNode === toastContainer) {
                            toastContainer.removeChild(toast);
                        }
                    }, 300);
                }, 5000);
            }
            
            setupEventListeners() {
                // Auth tabs
                document.querySelectorAll('.auth-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const formId = tab.getAttribute('data-form');
                        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        
                        document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
                        document.getElementById(`${formId}-form`).classList.add('active');
                    });
                });
                
                // Login form
                document.getElementById('login-form').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const email = document.getElementById('login-email').value;
                    const password = document.getElementById('login-password').value;
                    const rememberMe = document.getElementById('remember-me').checked;
                    
                    this.login(email, password, rememberMe);
                });
                
                // Register form
                document.getElementById('register-form').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const userData = {
                        name: document.getElementById('register-name').value,
                        email: document.getElementById('register-email').value,
                        studentId: document.getElementById('register-student-id').value,
                        password: document.getElementById('register-password').value,
                        role: document.getElementById('register-role').value
                    };
                    
                    this.register(userData);
                });
                
                // Password toggle
                document.querySelectorAll('.password-toggle').forEach(toggle => {
                    toggle.addEventListener('click', function() {
                        const input = this.previousElementSibling;
                        const type = input.type === 'password' ? 'text' : 'password';
                        input.type = type;
                        this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
                    });
                });
                
                // Password strength
                const passwordInput = document.getElementById('register-password');
                if (passwordInput) {
                    passwordInput.addEventListener('input', function() {
                        const strengthBar = this.nextElementSibling.querySelector('div > div');
                        const strengthText = this.nextElementSibling.querySelector('small span');
                        const password = this.value;
                        
                        let strength = 0;
                        if (password.length >= 8) strength++;
                        if (/[A-Z]/.test(password)) strength++;
                        if (/[0-9]/.test(password)) strength++;
                        if (/[^A-Za-z0-9]/.test(password)) strength++;
                        
                        const width = strength * 25;
                        strengthBar.style.width = `${width}%`;
                        
                        const colors = ['#dc3545', '#ffc107', '#17a2b8', '#28a745'];
                        const texts = ['Weak', 'Fair', 'Good', 'Strong'];
                        
                        strengthBar.style.background = colors[strength - 1] || '#dc3545';
                        strengthText.textContent = texts[strength - 1] || 'None';
                        strengthText.style.color = colors[strength - 1] || '#dc3545';
                    });
                }
                
                // Navigation tabs
                document.querySelectorAll('.nav-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabId = tab.getAttribute('data-tab');
                        this.switchTab(tabId);
                    });
                });
                
                // Footer links
                document.querySelectorAll('.footer-links a[data-tab]').forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const tabId = link.getAttribute('data-tab');
                        this.switchTab(tabId);
                    });
                });
                
                // Logout
                document.getElementById('logout-btn').addEventListener('click', () => {
                    this.logout();
                });
                
                // Create meeting button
                document.getElementById('create-meeting-btn').addEventListener('click', () => {
                    this.switchTab('meetings');
                });
                
                // Save meeting
                document.getElementById('save-meeting').addEventListener('click', () => {
                    this.saveMeeting();
                });
                
                // Clear meeting form
                document.getElementById('clear-meeting-form').addEventListener('click', () => {
                    this.clearMeetingForm();
                });
                
                // Generate QR code
                document.getElementById('generate-qr-btn').addEventListener('click', () => {
                    if (this.currentMeeting) {
                        this.generateQRCode(this.currentMeeting._id);
                    } else {
                        this.showToast('Please select a meeting first', 'warning');
                    }
                });
                
                // Generate PDF
                document.getElementById('generate-pdf-btn').addEventListener('click', () => {
                    if (this.currentMeeting) {
                        this.generatePDF(this.currentMeeting._id);
                    } else {
                        this.showToast('Please select a meeting first', 'warning');
                    }
                });
                
                // Save settings
                document.getElementById('save-settings-btn').addEventListener('click', () => {
                    this.saveSettings();
                });
                
                // Logo upload
                const logoUpload = document.getElementById('logo-upload');
                const logoUploadArea = document.getElementById('logo-upload-area');
                
                logoUploadArea.addEventListener('click', () => logoUpload.click());
                logoUpload.addEventListener('change', (e) => this.handleLogoUpload(e));
                
                // Modal close
                document.getElementById('close-modal').addEventListener('click', () => {
                    document.getElementById('meeting-modal').classList.remove('active');
                });
                
                // Close modal when clicking outside
                document.getElementById('meeting-modal').addEventListener('click', (e) => {
                    if (e.target === e.currentTarget) {
                        e.currentTarget.classList.remove('active');
                    }
                });
                
                // Refresh activities
                document.getElementById('refresh-activities').addEventListener('click', () => {
                    this.loadActivities();
                });
            }
            
            switchTab(tabId) {
                // Update navigation
                document.querySelectorAll('.nav-tab').forEach(tab => {
                    tab.classList.remove('active');
                    if (tab.getAttribute('data-tab') === tabId) {
                        tab.classList.add('active');
                    }
                });
                
                // Update content
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                    if (content.id === tabId) {
                        content.classList.add('active');
                        
                        // Load tab-specific data
                        this.loadTabData(tabId);
                    }
                });
            }
            
            loadTabData(tabId) {
                switch(tabId) {
                    case 'dashboard':
                        this.loadDashboard();
                        break;
                    case 'meetings':
                        this.loadMeetings();
                        break;
                    case 'attendance':
                        this.loadAttendance();
                        break;
                    case 'performance':
                        this.loadPerformanceDetails();
                        break;
                    case 'archive':
                        this.loadArchive();
                        break;
                    case 'settings':
                        this.loadSettings();
                        break;
                }
            }
            
            async loadAttendance() {
                if (!this.currentMeeting) {
                    this.showToast('Please select a meeting first', 'warning');
                    return;
                }
                
                try {
                    const response = await fetch(`${this.apiBaseUrl}/attendance/${this.currentMeeting._id}`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const attendance = await response.json();
                        this.displayAttendance(attendance);
                    }
                } catch (error) {
                    console.error('Load attendance error:', error);
                }
            }
            
            displayAttendance(attendance) {
                const container = document.getElementById('attendance-list');
                container.innerHTML = '';
                
                let presentCount = 0, absentCount = 0, lateCount = 0;
                
                attendance.forEach(record => {
                    const card = document.createElement('div');
                    card.className = `attendance-card ${record.status}`;
                    
                    card.innerHTML = `
                        <div class="attendance-avatar">
                            ${record.user.avatar ? 
                                `<img src="${record.user.avatar}" alt="${record.user.name}">` : 
                                record.user.name.charAt(0).toUpperCase()}
                        </div>
                        <div class="attendance-info">
                            <h4>${record.user.name}</h4>
                            <p>${record.user.role}</p>
                        </div>
                        <div class="attendance-status status-${record.status}">
                            ${record.status.toUpperCase()}
                        </div>
                    `;
                    
                    container.appendChild(card);
                    
                    // Update counts
                    if (record.status === 'present') presentCount++;
                    else if (record.status === 'absent') absentCount++;
                    else if (record.status === 'late') lateCount++;
                });
                
                // Update counts display
                document.getElementById('present-count').textContent = presentCount;
                document.getElementById('absent-count').textContent = absentCount;
                document.getElementById('late-count').textContent = lateCount;
            }
            
            async loadPerformanceDetails() {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/performance/details`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.displayLeaderboard(data.leaderboard);
                        this.updateDetailedChart(data.chartData);
                    }
                } catch (error) {
                    console.error('Load performance details error:', error);
                }
            }
            
            displayLeaderboard(leaderboard) {
                const tbody = document.getElementById('leaderboard-body');
                tbody.innerHTML = '';
                
                leaderboard.forEach((member, index) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${member.name}</td>
                        <td>${member.role}</td>
                        <td>${member.attendanceRate}%</td>
                        <td>${member.tasksCompleted}</td>
                        <td>${member.score.toFixed(1)}</td>
                    `;
                    tbody.appendChild(row);
                });
            }
            
            updateDetailedChart(chartData) {
                const ctx = document.getElementById('detailed-performance-chart').getContext('2d');
                
                if (this.detailedChart) {
                    this.detailedChart.destroy();
                }
                
                this.detailedChart = new Chart(ctx, {
                    type: 'line',
                    data: chartData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            }
            
            async loadArchive() {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/meetings?archived=true`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.displayArchive(data.meetings);
                    }
                } catch (error) {
                    console.error('Load archive error:', error);
                }
            }
            
            displayArchive(meetings) {
                const tbody = document.getElementById('archive-body');
                tbody.innerHTML = '';
                
                meetings.forEach(meeting => {
                    const date = new Date(meeting.date);
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${date.toLocaleDateString()}</td>
                        <td>${meeting.title}</td>
                        <td>${meeting.type.toUpperCase()}</td>
                        <td>${meeting.attendees.length}</td>
                        <td>
                            <div class="archive-actions">
                                <button class="btn" onclick="system.viewMeeting('${meeting._id}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn" onclick="system.generatePDF('${meeting._id}')">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }
            
            async loadActivities() {
                try {
                    const response = await fetch(`${this.apiBaseUrl}/activities`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    
                    if (response.ok) {
                        const activities = await response.json();
                        this.displayActivities(activities);
                    }
                } catch (error) {
                    console.error('Load activities error:', error);
                }
            }
            
            displayActivities(activities) {
                const container = document.getElementById('activities-list');
                container.innerHTML = '';
                
                activities.forEach(activity => {
                    const activityEl = document.createElement('div');
                    activityEl.className = 'meeting-detail';
                    activityEl.style.marginBottom = '10px';
                    activityEl.style.padding = '10px';
                    activityEl.style.background = 'var(--gray-light)';
                    activityEl.style.borderRadius = '6px';
                    
                    activityEl.innerHTML = `
                        <i class="fas fa-${activity.icon}"></i>
                        <span>${activity.description}</span>
                        <span style="margin-left: auto; font-size: 12px; color: var(--gray);">
                            ${new Date(activity.timestamp).toLocaleTimeString()}
                        </span>
                    `;
                    
                    container.appendChild(activityEl);
                });
            }
            
            async saveMeeting() {
                const meetingData = {
                    title: document.getElementById('meeting-title').value,
                    type: document.getElementById('meeting-type').value,
                    date: document.getElementById('meeting-date').value,
                    startTime: document.getElementById('meeting-start-time').value,
                    endTime: document.getElementById('meeting-end-time').value,
                    location: document.getElementById('meeting-location').value,
                    chairperson: document.getElementById('meeting-chair').value,
                    minutesTaker: document.getElementById('meeting-minutes-taker').value,
                    description: document.getElementById('meeting-description').value,
                    status: 'scheduled'
                };
                
                await this.createMeeting(meetingData);
            }
            
            async saveSettings() {
                const settings = {
                    institutionName: document.getElementById('institution-name').value,
                    councilName: document.getElementById('council-name').value,
                    meetingFrequency: document.getElementById('meeting-frequency').value,
                    defaultMeetingDuration: parseInt(document.getElementById('default-duration').value),
                    autoArchiveDays: parseInt(document.getElementById('auto-archive').value),
                    emailNotifications: document.getElementById('email-notifications').checked,
                    googleFormsIntegration: document.getElementById('google-forms-integration').checked,
                    primaryColor: document.getElementById('primary-color').value
                };
                
                try {
                    const response = await fetch(`${this.apiBaseUrl}/settings`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify(settings)
                    });
                    
                    if (response.ok) {
                        this.showToast('Settings saved successfully!', 'success');
                        this.applyTheme(settings.primaryColor);
                    } else {
                        throw new Error('Failed to save settings');
                    }
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            }
            
            applyTheme(primaryColor) {
                document.documentElement.style.setProperty('--primary', primaryColor);
                
                // Calculate darker and lighter variations
                const darker = this.adjustColor(primaryColor, -30);
                const lighter = this.adjustColor(primaryColor, 30);
                
                document.documentElement.style.setProperty('--primary-dark', darker);
                document.documentElement.style.setProperty('--primary-light', lighter);
            }
            
            adjustColor(color, amount) {
                const hex = color.replace('#', '');
                const num = parseInt(hex, 16);
                
                let r = (num >> 16) + amount;
                let g = ((num >> 8) & 0x00FF) + amount;
                let b = (num & 0x0000FF) + amount;
                
                r = Math.min(Math.max(0, r), 255);
                g = Math.min(Math.max(0, g), 255);
                b = Math.min(Math.max(0, b), 255);
                
                return '#' + (b | (g << 8) | (r << 16)).toString(16).padStart(6, '0');
            }
            
            async handleLogoUpload(event) {
                const file = event.target.files[0];
                if (!file) return;
                
                const formData = new FormData();
                formData.append('file', file);
                
                try {
                    const response = await fetch(`${this.apiBaseUrl}/upload`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: formData
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.showToast('Logo uploaded successfully!', 'success');
                        
                        const logoPreview = document.getElementById('logo-preview');
                        logoPreview.src = data.file.path;
                        logoPreview.style.display = 'block';
                    }
                } catch (error) {
                    this.showToast('Failed to upload logo', 'error');
                }
            }
            
            loadRememberedEmail() {
                const rememberedEmail = localStorage.getItem('rememberEmail');
                if (rememberedEmail) {
                    document.getElementById('login-email').value = rememberedEmail;
                    document.getElementById('remember-me').checked = true;
                }
            }
            
            // Methods for external calls
            viewMeeting(meetingId) {
                console.log('View meeting:', meetingId);
                // Implementation for viewing meeting details
            }
            
            editMeeting(meetingId) {
                console.log('Edit meeting:', meetingId);
                // Implementation for editing meeting
            }
            
            startMeeting(meetingId) {
                console.log('Start meeting:', meetingId);
                // Implementation for starting meeting
            }
        }
        
        // Initialize the system when page loads
        document.addEventListener('DOMContentLoaded', () => {
            window.system = new MeetingMinutesSystem();
            
            // Initialize Google Sign-In
            if (typeof google !== 'undefined') {
                google.accounts.id.initialize({
                    client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
                    callback: handleGoogleSignIn
                });
                
                google.accounts.id.renderButton(
                    document.getElementById('google-login'),
                    { theme: 'outline', size: 'large' }
                );
            }
            
            function handleGoogleSignIn(response) {
                console.log('Google sign-in response:', response);
                // Handle Google sign-in response
            }
        });
    </script>
