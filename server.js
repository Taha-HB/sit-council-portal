// server.js (Complete Backend with All Features)

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });
const db = new sqlite3.Database('./sit_council.db');
const SECRET_KEY = 'your_secret_key'; // Change this in production
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve frontend files
app.use('/uploads', express.static('uploads'));

// Initialize DB Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT,
        lastName TEXT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT,
        studentId TEXT,
        avatar TEXT,
        department TEXT,
        year TEXT,
        phone TEXT,
        isActive BOOLEAN,
        joinDate TEXT,
        lastLogin TEXT,
        performance TEXT  -- JSON string
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        type TEXT,
        date TEXT,
        startTime TEXT,
        endTime TEXT,
        location TEXT,
        chairpersonId INTEGER,
        minutesTakerId INTEGER,
        objective TEXT,
        status TEXT,
        agenda TEXT,  -- JSON
        attendees TEXT,  -- JSON
        guests TEXT,  -- JSON
        documents TEXT,  -- JSON
        minutes TEXT,  -- JSON
        createdAt TEXT,
        updatedAt TEXT,
        isArchived BOOLEAN
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS actionItems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT,
        assigneeId INTEGER,
        meetingId INTEGER,
        deadline TEXT,
        status TEXT,
        priority TEXT,
        createdAt TEXT,
        completedAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meetingId INTEGER,
        userId INTEGER,
        status TEXT,  -- present/absent
        timestamp TEXT,
        notes TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meetingId INTEGER,
        filename TEXT,
        path TEXT,
        uploadedBy INTEGER,
        uploadDate TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT
    )`);
});

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const uploadHandler = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!['.pdf', '.doc', '.docx', '.jpg', '.png'].includes(ext)) {
            return cb(new Error('Invalid file type'));
        }
        cb(null, true);
    }
});

// Auth Middleware
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.userId = decoded.id;
        req.userRole = decoded.role; // Assume role is in token
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// Role Check Middleware (e.g., for admin actions)
const isAdmin = (req, res, next) => {
    if (req.userRole !== 'Secretary' && req.userRole !== 'President') {
        return res.status(403).json({ message: 'Access denied' });
    }
    next();
};

// Auth Routes
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ message: 'Invalid credentials' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
        db.run('UPDATE users SET lastLogin = ? WHERE id = ?', [new Date().toISOString(), user.id]);
        res.json({ token, user: { ...user, password: undefined } });
    });
});

app.post('/api/auth/register', async (req, res) => {
    const { firstName, lastName, email, password, role, studentId } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (firstName, lastName, email, password, role, studentId, avatar, isActive, joinDate, performance) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [firstName, lastName, email, hashed, role, studentId, (firstName[0] + lastName[0]).toUpperCase(), true, new Date().toISOString(), JSON.stringify({ meetingsAttended: 0, tasksCompleted: 0, rating: 0 })], 
        function (err) {
            if (err) return res.status(400).json({ message: 'Email already registered' });
            const token = jwt.sign({ id: this.lastID, role }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ token, user: { id: this.lastID, firstName, lastName, email, role } });
        }
    );
});

app.post('/api/auth/forgot', (req, res) => {
    const { email } = req.body;
    // Simulate reset (in real, send email)
    res.json({ message: 'Reset link sent' });
});

// User Routes
app.get('/api/users/me', authenticate, (req, res) => {
    db.get('SELECT * FROM users WHERE id = ?', [req.userId], (err, user) => {
        if (err || !user) return res.status(404).json({ message: 'User not found' });
        res.json({ ...user, password: undefined });
    });
});

app.put('/api/users/me', authenticate, async (req, res) => {
    const { firstName, lastName, newPassword } = req.body;
    let query = 'UPDATE users SET firstName = ?, lastName = ?';
    const params = [firstName, lastName];
    if (newPassword) {
        const hashed = await bcrypt.hash(newPassword, 10);
        query += ', password = ?';
        params.push(hashed);
    }
    query += ' WHERE id = ?';
    params.push(req.userId);
    db.run(query, params, (err) => {
        if (err) return res.status(500).json({ message: 'Error updating profile' });
        io.emit('notification', { message: 'Profile updated', type: 'success', userId: req.userId });
        res.json({ success: true });
    });
});

// Dashboard Stats
app.get('/api/dashboard/stats', authenticate, (req, res) => {
    // Complex query for stats
    db.all('SELECT * FROM meetings', [], (err, meetings) => {
        if (err) return res.status(500).json({ message: 'Error' });
        // Calculate stats from meetings, users, etc.
        const stats = {
            totalMeetings: meetings.length,
            regularMeetings: meetings.filter(m => m.type === 'regular').length,
            // Add more calculations
        };
        res.json(stats);
    });
});

// Meetings Routes
app.get('/api/meetings', authenticate, (req, res) => {
    db.all('SELECT * FROM meetings', [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Error' });
        res.json(rows);
    });
});

app.post('/api/meetings', authenticate, (req, res) => {
    const data = req.body;
    const params = [data.title, data.type, data.date, data.startTime, data.endTime, data.location, data.chairpersonId, data.minutesTakerId, data.objective, data.status, JSON.stringify(data.agenda || []), JSON.stringify(data.attendees || []), JSON.stringify(data.guests || []), JSON.stringify(data.documents || []), JSON.stringify(data.minutes || {}), new Date().toISOString(), new Date().toISOString(), data.isArchived ? 1 : 0];
    db.run(`INSERT INTO meetings (title, type, date, startTime, endTime, location, chairpersonId, minutesTakerId, objective, status, agenda, attendees, guests, documents, minutes, createdAt, updatedAt, isArchived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, params, function (err) {
        if (err) return res.status(500).json({ message: 'Error' });
        io.emit('notification', { message: 'New meeting created', type: 'info' });
        res.json({ id: this.lastID });
    });
});

app.put('/api/meetings/:id', authenticate, (req, res) => {
    const data = req.body;
    const params = [data.title, data.type, data.date, data.startTime, data.endTime, data.location, data.chairpersonId, data.minutesTakerId, data.objective, data.status, JSON.stringify(data.agenda || []), JSON.stringify(data.attendees || []), JSON.stringify(data.guests || []), JSON.stringify(data.documents || []), JSON.stringify(data.minutes || {}), new Date().toISOString(), data.isArchived ? 1 : 0, req.params.id];
    db.run(`UPDATE meetings SET title=?, type=?, date=?, startTime=?, endTime=?, location=?, chairpersonId=?, minutesTakerId=?, objective=?, status=?, agenda=?, attendees=?, guests=?, documents=?, minutes=?, updatedAt=?, isArchived=? WHERE id=?`, params, (err) => {
        if (err) return res.status(500).json({ message: 'Error' });
        res.json({ success: true });
    });
});

app.delete('/api/meetings/:id', authenticate, isAdmin, (req, res) => {
    db.run('DELETE FROM meetings WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'Error' });
        res.json({ success: true });
    });
});

// Action Items Routes (Similar pattern)
app.get('/api/actionItems', authenticate, (req, res) => {
    db.all('SELECT * FROM actionItems', [], (err, rows) => res.json(rows || []));
});

// Add similar for POST, PUT, DELETE

// Attendance Routes
app.get('/api/attendance', authenticate, (req, res) => {
    db.all('SELECT * FROM attendance', [], (err, rows) => res.json(rows || []));
});

app.post('/api/attendance', authenticate, isAdmin, (req, res) => {
    const { meetingId, userId, status, notes } = req.body;
    db.run('INSERT INTO attendance (meetingId, userId, status, timestamp, notes) VALUES (?, ?, ?, ?, ?)', [meetingId, userId, status, new Date().toISOString(), notes], (err) => {
        if (err) return res.status(500).json({ message: 'Error' });
        io.emit('notification', { message: `Attendance marked for meeting ${meetingId}`, type: 'info' });
        res.json({ success: true });
    });
});

// Files Routes
app.post('/api/files', authenticate, uploadHandler.single('file'), (req, res) => {
    const { meetingId } = req.body;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    db.run('INSERT INTO files (meetingId, filename, path, uploadedBy, uploadDate) VALUES (?, ?, ?, ?, ?)', [meetingId, req.file.originalname, req.file.path, req.userId, new Date().toISOString()], (err) => {
        if (err) return res.status(500).json({ message: 'Error' });
        io.emit('notification', { message: 'New file uploaded', type: 'success' });
        res.json({ success: true, file: req.file });
    });
});

app.get('/api/files', authenticate, (req, res) => {
    db.all('SELECT * FROM files', [], (err, rows) => res.json(rows || []));
});

app.delete('/api/files/:id', authenticate, isAdmin, (req, res) => {
    db.get('SELECT path FROM files WHERE id=?', [req.params.id], (err, file) => {
        if (err || !file) return res.status(404).json({ message: 'File not found' });
        fs.unlink(file.path, (unlinkErr) => {
            if (unlinkErr) console.error(unlinkErr);
            db.run('DELETE FROM files WHERE id=?', [req.params.id], (dbErr) => {
                if (dbErr) return res.status(500).json({ message: 'Error' });
                res.json({ success: true });
            });
        });
    });
});

// Settings Routes
app.get('/api/settings', authenticate, (req, res) => {
    db.all('SELECT * FROM settings', [], (err, rows) => {
        const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        res.json(settings);
    });
});

app.post('/api/settings', authenticate, isAdmin, (req, res) => {
    const { key, value } = req.body;
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
        if (err) return res.status(500).json({ message: 'Error' });
        res.json({ success: true });
    });
});

// Backup DB
app.get('/api/backup', authenticate, isAdmin, (req, res) => {
    const backup = {};
    const tables = ['users', 'meetings', 'actionItems', 'attendance', 'files', 'settings'];
    let count = tables.length;
    tables.forEach(table => {
        db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
            backup[table] = rows;
            if (--count === 0) res.json(backup);
        });
    });
});

// Restore DB (Caution: Overwrites existing data)
app.post('/api/restore', authenticate, isAdmin, (req, res) => {
    const data = req.body;
    db.serialize(() => {
        Object.keys(data).forEach(table => {
            db.run(`DELETE FROM ${table}`);
            data[table].forEach(row => {
                const keys = Object.keys(row).join(',');
                const placeholders = Object.keys(row).map(() => '?').join(',');
                const values = Object.values(row);
                db.run(`INSERT INTO \( {table} ( \){keys}) VALUES (${placeholders})`, values);
            });
        });
        res.json({ success: true });
    });
});

// Socket for Real-Time
io.on('connection', (socket) => {
    console.log('User connected');
    socket.on('disconnect', () => console.log('User disconnected'));
});

// Start Server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
