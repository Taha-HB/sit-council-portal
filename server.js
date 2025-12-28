require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://your-frontend-domain.com'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sit-council', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Connection Error:', err));

// Models
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    studentId: { type: String, unique: true },
    password: { type: String },
    googleId: { type: String },
    role: { 
        type: String, 
        enum: ['President', 'Vice President', 'Secretary', 'Treasurer', 'PRO', 'Club Coordinator', 'Member', 'Guest'],
        default: 'Member'
    },
    avatar: { type: String },
    avatarUrl: { type: String },
    department: { type: String },
    year: { type: String },
    phone: { type: String },
    permissions: {
        canEdit: { type: Boolean, default: false },
        canCreateMeetings: { type: Boolean, default: false },
        canManageMembers: { type: Boolean, default: false },
        canViewReports: { type: Boolean, default: true }
    },
    performance: {
        attendanceRate: { type: Number, default: 0 },
        tasksCompleted: { type: Number, default: 0 },
        tasksAssigned: { type: Number, default: 0 },
        participationScore: { type: Number, default: 0 },
        awards: [{ type: String }]
    },
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const MeetingSchema = new mongoose.Schema({
    title: { type: String, required: true },
    meetingCode: { type: String, unique: true },
    type: { 
        type: String, 
        enum: ['regular', 'emergency', 'planning', 'review', 'special'],
        default: 'regular'
    },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    location: { type: String, required: true },
    chairperson: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    minutesTaker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attendees: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['present', 'absent', 'late', 'excused'], default: 'absent' },
        checkInTime: { type: Date },
        checkOutTime: { type: Date }
    }],
    agenda: [{
        title: { type: String, required: true },
        description: { type: String },
        presenter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        duration: { type: Number }, // in minutes
        status: { type: String, enum: ['pending', 'in-progress', 'completed', 'postponed'], default: 'pending' },
        notes: { type: String }
    }],
    studentQuestions: [{
        question: { type: String, required: true },
        askedBy: { type: String },
        askedByEmail: { type: String },
        status: { type: String, enum: ['pending', 'addressed', 'deferred'], default: 'pending' },
        response: { type: String },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
    }],
    minutes: {
        summary: { type: String },
        discussionPoints: { type: String },
        decisions: { type: String },
        actionItems: [{
            task: { type: String },
            assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            deadline: { type: Date },
            status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' }
        }],
        nextMeeting: {
            date: { type: Date },
            time: { type: String },
            agenda: { type: String }
        }
    },
    attachments: [{ type: String }],
    status: { type: String, enum: ['draft', 'scheduled', 'in-progress', 'completed', 'cancelled'], default: 'draft' },
    isArchived: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const AttendanceSchema = new mongoose.Schema({
    meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true },
    checkInTime: { type: Date },
    checkOutTime: { type: Date },
    notes: { type: String }
});

const TaskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deadline: { type: Date },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    status: { type: String, enum: ['pending', 'in-progress', 'completed', 'overdue'], default: 'pending' },
    completionDate: { type: Date },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const SettingSchema = new mongoose.Schema({
    institutionName: { type: String, default: 'SIT International University' },
    councilName: { type: String, default: 'SIT Student Council' },
    logo: { type: String },
    primaryColor: { type: String, default: '#1a5276' },
    secondaryColor: { type: String, default: '#2e86c1' },
    meetingFrequency: { type: String, default: 'biweekly' },
    defaultMeetingDuration: { type: Number, default: 60 }, // minutes
    autoArchiveDays: { type: Number, default: 30 },
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
    googleFormsIntegration: { type: Boolean, default: false },
    googleFormsLink: { type: String },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
});

const PerformanceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true }, // Format: YYYY-MM
    attendanceRate: { type: Number, default: 0 },
    tasksCompleted: { type: Number, default: 0 },
    tasksAssigned: { type: Number, default: 0 },
    participationScore: { type: Number, default: 0 },
    awards: [{ type: String }],
    notes: { type: String },
    manOfTheMonth: { type: Boolean, default: false },
    manOfTheWeek: { type: Boolean, default: false }
});

const Models = {
    User: mongoose.model('User', UserSchema),
    Meeting: mongoose.model('Meeting', MeetingSchema),
    Attendance: mongoose.model('Attendance', AttendanceSchema),
    Task: mongoose.model('Task', TaskSchema),
    Setting: mongoose.model('Setting', SettingSchema),
    Performance: mongoose.model('Performance', PerformanceSchema)
};

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access token required' });
    
    jwt.verify(token, process.env.JWT_SECRET || 'sit-council-secret-key-2025', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

const authorizeRole = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// File Upload Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image, PDF, and document files are allowed'));
    }
});

// Helper Functions
const generateMeetingCode = () => {
    return 'SIT-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 3).toUpperCase();
};

const calculatePerformance = async (userId) => {
    const user = await Models.User.findById(userId);
    if (!user) return null;
    
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Calculate attendance rate
    const meetingsThisMonth = await Models.Meeting.countDocuments({
        date: { 
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
        },
        status: 'completed'
    });
    
    const attendances = await Models.Attendance.countDocuments({
        user: userId,
        status: 'present',
        createdAt: { 
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
        }
    });
    
    const attendanceRate = meetingsThisMonth > 0 ? (attendances / meetingsThisMonth) * 100 : 0;
    
    // Calculate task completion
    const tasks = await Models.Task.find({
        assignedTo: userId,
        createdAt: { 
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
        }
    });
    
    const tasksCompleted = tasks.filter(t => t.status === 'completed').length;
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0;
    
    // Save performance data
    await Models.Performance.findOneAndUpdate(
        { user: userId, month: month },
        {
            attendanceRate,
            tasksCompleted,
            tasksAssigned: totalTasks,
            participationScore: (attendanceRate * 0.4) + (completionRate * 0.6)
        },
        { upsert: true, new: true }
    );
    
    return {
        attendanceRate,
        tasksCompleted,
        tasksAssigned: totalTasks,
        participationScore: (attendanceRate * 0.4) + (completionRate * 0.6)
    };
};

// API Routes

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, studentId, role, department, year, phone } = req.body;
        
        // Check if user exists
        const existingUser = await Models.User.findOne({ 
            $or: [{ email }, { studentId }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email or student ID already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = new Models.User({
            name,
            email,
            studentId,
            password: hashedPassword,
            role,
            department,
            year,
            phone,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a5276&color=fff`,
            permissions: {
                canEdit: role === 'Secretary',
                canCreateMeetings: ['President', 'Vice President', 'Secretary'].includes(role),
                canManageMembers: ['President', 'Vice President'].includes(role),
                canViewReports: true
            }
        });
        
        await user.save();
        
        // Create token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'sit-council-secret-key-2025',
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                permissions: user.permissions
            },
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        
        // Find user
        const user = await Models.User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        // Create token with longer expiry if remember me is checked
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'sit-council-secret-key-2025',
            { expiresIn: rememberMe ? '30d' : '7d' }
        );
        
        res.json({
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                permissions: user.permissions
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Google OAuth
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.post('/api/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        
        // Verify Google token
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;
        
        // Find or create user
        let user = await Models.User.findOne({ email });
        
        if (!user) {
            // Check if this is an institutional email
            if (!email.endsWith('@sit.edu')) {
                return res.status(403).json({ error: 'Please use your institutional email' });
            }
            
            user = new Models.User({
                name,
                email,
                googleId,
                avatar: picture,
                role: 'Member', // Default role, can be changed by admin
                permissions: {
                    canEdit: false,
                    canCreateMeetings: false,
                    canManageMembers: false,
                    canViewReports: true
                }
            });
            await user.save();
        } else {
            // Update Google ID if not set
            if (!user.googleId) {
                user.googleId = googleId;
                user.avatar = picture;
                await user.save();
            }
        }
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        // Create token
        const jwtToken = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'sit-council-secret-key-2025',
            { expiresIn: '7d' }
        );
        
        res.json({
            message: 'Google login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                permissions: user.permissions
            },
            token: jwtToken
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({ error: 'Google authentication failed' });
    }
});

// User Routes
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await Models.User.find({ status: 'active' })
            .select('-password -googleId')
            .sort({ role: 1, name: 1 });
        
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/users/:id', authenticateToken, authorizeRole('President', 'Vice President'), async (req, res) => {
    try {
        const { role, permissions, status } = req.body;
        const user = await Models.User.findByIdAndUpdate(
            req.params.id,
            { role, permissions, status },
            { new: true }
        ).select('-password -googleId');
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json({ message: 'User updated successfully', user });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Meeting Routes
app.get('/api/meetings', authenticateToken, async (req, res) => {
    try {
        const { status, type, archived, limit = 20, page = 1 } = req.query;
        
        const query = {};
        if (status) query.status = status;
        if (type) query.type = type;
        if (archived !== undefined) query.isArchived = archived === 'true';
        
        const skip = (page - 1) * limit;
        
        const meetings = await Models.Meeting.find(query)
            .populate('chairperson minutesTaker', 'name email role avatar')
            .populate('attendees.user', 'name role avatar')
            .populate('agenda.presenter', 'name role')
            .populate('studentQuestions.assignedTo', 'name')
            .populate('minutes.actionItems.assignedTo', 'name')
            .sort({ date: -1, createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Models.Meeting.countDocuments(query);
        
        res.json({
            meetings,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get meetings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/meetings', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        
        // Check permissions
        const dbUser = await Models.User.findById(user.id);
        if (!dbUser.permissions.canCreateMeetings && dbUser.role !== 'Secretary') {
            return res.status(403).json({ error: 'You do not have permission to create meetings' });
        }
        
        const meetingData = {
            ...req.body,
            meetingCode: generateMeetingCode(),
            chairperson: req.body.chairperson || user.id,
            minutesTaker: req.body.minutesTaker || user.id,
            createdBy: user.id
        };
        
        const meeting = new Models.Meeting(meetingData);
        await meeting.save();
        
        // Populate references
        await meeting.populate([
            { path: 'chairperson minutesTaker', select: 'name email role avatar' },
            { path: 'attendees.user', select: 'name role avatar' }
        ]);
        
        res.status(201).json({
            message: 'Meeting created successfully',
            meeting
        });
    } catch (error) {
        console.error('Create meeting error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/meetings/:id', authenticateToken, async (req, res) => {
    try {
        const meeting = await Models.Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        
        // Check permissions
        const user = await Models.User.findById(req.user.id);
        if (!user.permissions.canEdit && user.role !== 'Secretary') {
            return res.status(403).json({ error: 'You do not have permission to edit meetings' });
        }
        
        Object.assign(meeting, req.body);
        meeting.updatedAt = new Date();
        
        await meeting.save();
        
        res.json({
            message: 'Meeting updated successfully',
            meeting
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/meetings/:id/archive', authenticateToken, authorizeRole('Secretary', 'President'), async (req, res) => {
    try {
        const meeting = await Models.Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        
        meeting.isArchived = true;
        meeting.status = 'completed';
        await meeting.save();
        
        res.json({ message: 'Meeting archived successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Attendance Routes
app.post('/api/attendance', authenticateToken, async (req, res) => {
    try {
        const { meetingId, userId, status } = req.body;
        
        let attendance = await Models.Attendance.findOne({
            meeting: meetingId,
            user: userId
        });
        
        if (attendance) {
            attendance.status = status;
            attendance.updatedAt = new Date();
        } else {
            attendance = new Models.Attendance({
                meeting: meetingId,
                user: userId,
                status,
                checkInTime: status === 'present' || status === 'late' ? new Date() : null
            });
        }
        
        await attendance.save();
        
        // Update meeting attendees
        await Models.Meeting.findByIdAndUpdate(meetingId, {
            $pull: { attendees: { user: userId } }
        });
        
        await Models.Meeting.findByIdAndUpdate(meetingId, {
            $push: { 
                attendees: { 
                    user: userId, 
                    status,
                    checkInTime: status === 'present' || status === 'late' ? new Date() : null
                }
            }
        });
        
        // Update user performance
        await calculatePerformance(userId);
        
        res.json({ message: 'Attendance recorded successfully', attendance });
    } catch (error) {
        console.error('Attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/attendance/:meetingId', authenticateToken, async (req, res) => {
    try {
        const attendance = await Models.Attendance.find({ meeting: req.params.meetingId })
            .populate('user', 'name email role avatar department')
            .sort({ createdAt: -1 });
        
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Performance Routes
app.get('/api/performance', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const performances = await Models.Performance.find({ month })
            .populate('user', 'name email role avatar')
            .sort({ participationScore: -1 })
            .limit(10);
        
        // Get man of the month
        const manOfTheMonth = performances.length > 0 ? performances[0] : null;
        
        // Get man of the week (last 7 days)
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const tasksThisWeek = await Models.Task.aggregate([
            {
                $match: {
                    createdAt: { $gte: weekAgo },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$assignedTo',
                    tasksCompleted: { $sum: 1 }
                }
            },
            { $sort: { tasksCompleted: -1 } },
            { $limit: 1 }
        ]);
        
        let manOfTheWeek = null;
        if (tasksThisWeek.length > 0) {
            manOfTheWeek = await Models.User.findById(tasksThisWeek[0]._id)
                .select('name email role avatar');
        }
        
        res.json({
            performances,
            manOfTheMonth,
            manOfTheWeek
        });
    } catch (error) {
        console.error('Performance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PDF Generation
app.get('/api/meetings/:id/pdf', authenticateToken, async (req, res) => {
    try {
        const meeting = await Models.Meeting.findById(req.params.id)
            .populate('chairperson minutesTaker', 'name email role')
            .populate('attendees.user', 'name role')
            .populate('agenda.presenter', 'name')
            .populate('minutes.actionItems.assignedTo', 'name');
        
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=meeting-${meeting.meetingCode}.pdf`);
        
        doc.pipe(res);
        
        // Header
        doc.font('Times-Bold').fontSize(20).text('SIT INTERNATIONAL UNIVERSITY', { align: 'center' });
        doc.moveDown(0.5);
        doc.font('Times-Bold').fontSize(16).text('STUDENT COUNCIL MEETING MINUTES', { align: 'center' });
        doc.moveDown(1);
        
        // Meeting Details
        doc.font('Times-Bold').fontSize(12).text('MEETING DETAILS');
        doc.moveDown(0.5);
        
        const details = [
            ['Meeting Title:', meeting.title],
            ['Meeting Code:', meeting.meetingCode],
            ['Date:', new Date(meeting.date).toLocaleDateString()],
            ['Time:', `${meeting.startTime} - ${meeting.endTime}`],
            ['Location:', meeting.location],
            ['Meeting Type:', meeting.type.charAt(0).toUpperCase() + meeting.type.slice(1)],
            ['Chairperson:', meeting.chairperson?.name || 'N/A'],
            ['Minutes Taker:', meeting.minutesTaker?.name || 'N/A'],
            ['Status:', meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)]
        ];
        
        doc.font('Times-Roman').fontSize(10);
        details.forEach(([label, value]) => {
            doc.text(`${label} ${value}`);
        });
        
        doc.moveDown(1);
        
        // Attendees
        doc.font('Times-Bold').fontSize(12).text('ATTENDEES');
        doc.moveDown(0.5);
        
        if (meeting.attendees.length > 0) {
            meeting.attendees.forEach((att, index) => {
                const statusText = att.status ? ` (${att.status.charAt(0).toUpperCase() + att.status.slice(1)})` : '';
                doc.font('Times-Roman').fontSize(10)
                   .text(`${index + 1}. ${att.user?.name || 'Unknown'} - ${att.user?.role || 'Member'}${statusText}`);
            });
        } else {
            doc.font('Times-Roman').fontSize(10).text('No attendees recorded');
        }
        
        doc.moveDown(1);
        
        // Agenda
        if (meeting.agenda.length > 0) {
            doc.font('Times-Bold').fontSize(12).text('AGENDA ITEMS');
            doc.moveDown(0.5);
            
            meeting.agenda.forEach((item, index) => {
                doc.font('Times-Bold').fontSize(10).text(`${index + 1}. ${item.title}`);
                doc.font('Times-Roman').fontSize(9)
                   .text(`   Presenter: ${item.presenter?.name || 'N/A'}`);
                doc.font('Times-Roman').fontSize(9)
                   .text(`   Duration: ${item.duration || 0} minutes`);
                doc.font('Times-Roman').fontSize(9)
                   .text(`   Status: ${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`);
                if (item.description) {
                    doc.font('Times-Roman').fontSize(9)
                       .text(`   Description: ${item.description}`);
                }
                doc.moveDown(0.5);
            });
        }
        
        // Minutes
        if (meeting.minutes?.summary) {
            doc.addPage();
            doc.font('Times-Bold').fontSize(12).text('MEETING MINUTES');
            doc.moveDown(0.5);
            
            doc.font('Times-Bold').fontSize(11).text('Summary:');
            doc.font('Times-Roman').fontSize(10).text(meeting.minutes.summary || 'N/A');
            doc.moveDown(0.5);
            
            if (meeting.minutes.discussionPoints) {
                doc.font('Times-Bold').fontSize(11).text('Discussion Points:');
                doc.font('Times-Roman').fontSize(10).text(meeting.minutes.discussionPoints);
                doc.moveDown(0.5);
            }
            
            if (meeting.minutes.decisions) {
                doc.font('Times-Bold').fontSize(11).text('Decisions Made:');
                doc.font('Times-Roman').fontSize(10).text(meeting.minutes.decisions);
                doc.moveDown(0.5);
            }
            
            if (meeting.minutes.actionItems && meeting.minutes.actionItems.length > 0) {
                doc.font('Times-Bold').fontSize(11).text('Action Items:');
                meeting.minutes.actionItems.forEach((item, index) => {
                    doc.font('Times-Roman').fontSize(10)
                       .text(`${index + 1}. ${item.task}`);
                    doc.font('Times-Roman').fontSize(9)
                       .text(`   Assigned to: ${item.assignedTo?.name || 'N/A'}`);
                    doc.font('Times-Roman').fontSize(9)
                       .text(`   Deadline: ${item.deadline ? new Date(item.deadline).toLocaleDateString() : 'N/A'}`);
                    doc.font('Times-Roman').fontSize(9)
                       .text(`   Status: ${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`);
                    doc.moveDown(0.3);
                });
            }
        }
        
        // Footer
        doc.moveDown(2);
        doc.font('Times-Roman').fontSize(10).text('Prepared by:', 50, doc.y);
        doc.moveDown(1);
        doc.text('_________________________', 50, doc.y);
        doc.moveDown(0.5);
        doc.text(meeting.minutesTaker?.name || 'N/A', 50, doc.y);
        doc.text('Minutes Taker', 50, doc.y + 15);
        
        doc.moveDown(2);
        doc.text('Approved by:', 300, doc.y);
        doc.moveDown(1);
        doc.text('_________________________', 300, doc.y);
        doc.moveDown(0.5);
        doc.text(meeting.chairperson?.name || 'N/A', 300, doc.y);
        doc.text('Chairperson', 300, doc.y + 15);
        
        doc.end();
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

// Settings Routes
app.get('/api/settings', authenticateToken, async (req, res) => {
    try {
        let settings = await Models.Setting.findOne();
        if (!settings) {
            settings = new Models.Setting();
            await settings.save();
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/settings', authenticateToken, authorizeRole('Secretary', 'President'), async (req, res) => {
    try {
        let settings = await Models.Setting.findOne();
        if (!settings) {
            settings = new Models.Setting();
        }
        
        Object.assign(settings, req.body);
        settings.updatedBy = req.user.id;
        settings.updatedAt = new Date();
        
        await settings.save();
        res.json({ message: 'Settings updated successfully', settings });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// QR Code Generation
app.get('/api/meetings/:id/qr', authenticateToken, async (req, res) => {
    try {
        const meeting = await Models.Meeting.findById(req.params.id);
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        
        const qrData = {
            meetingId: meeting._id,
            meetingCode: meeting.meetingCode,
            title: meeting.title,
            date: meeting.date,
            checkInUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkin/${meeting.meetingCode}`
        };
        
        const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
        res.json({ qrCode, meetingCode: meeting.meetingCode });
    } catch (error) {
        console.error('QR generation error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Dashboard Statistics
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const [
            totalMeetings,
            totalMembers,
            meetingsThisMonth,
            pendingActions,
            totalMinutes,
            archivedMeetings
        ] = await Promise.all([
            Models.Meeting.countDocuments(),
            Models.User.countDocuments({ status: 'active' }),
            Models.Meeting.countDocuments({ date: { $gte: startOfMonth } }),
            Models.Task.countDocuments({ status: 'pending' }),
            Models.Meeting.countDocuments({ status: 'completed' }),
            Models.Meeting.countDocuments({ isArchived: true })
        ]);
        
        res.json({
            totalMeetings,
            totalMembers,
            meetingsThisMonth,
            pendingActions,
            totalMinutes,
            archivedMeetings,
            storageUsed: '24.5 MB' // This would be calculated from actual file sizes
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// File Upload
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        res.json({
            message: 'File uploaded successfully',
            file: {
                filename: req.file.filename,
                originalname: req.file.originalname,
                path: `/uploads/${req.file.filename}`,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

// Initialize default admin user
const initializeAdmin = async () => {
    try {
        const adminExists = await Models.User.findOne({ email: 'admin@sit.edu' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('Admin@123', 10);
            const admin = new Models.User({
                name: 'System Administrator',
                email: 'admin@sit.edu',
                password: hashedPassword,
                role: 'Secretary',
                studentId: 'SIT/ADMIN/001',
                permissions: {
                    canEdit: true,
                    canCreateMeetings: true,
                    canManageMembers: true,
                    canViewReports: true
                },
                avatar: 'https://ui-avatars.com/api/?name=Admin&background=1a5276&color=fff'
            });
            await admin.save();
            console.log('Default admin user created');
        }
        
        // Initialize settings
        const settingsExist = await Models.Setting.findOne();
        if (!settingsExist) {
            const settings = new Models.Setting();
            await settings.save();
            console.log('Default settings initialized');
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
};

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await initializeAdmin();
    console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
});
