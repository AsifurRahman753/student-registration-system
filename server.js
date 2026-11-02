const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// MySQL Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'student_registration_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Initialize Tables on Startup
async function initDB() {
    try {
        const connection = await pool.getConnection();
        await connection.query(`
            CREATE TABLE IF NOT EXISTS students (
                student_id VARCHAR(50) PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                department VARCHAR(50) NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS courses (
                course_code VARCHAR(20) PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                credits DECIMAL(3,1) NOT NULL,
                category_type VARCHAR(50) NOT NULL
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS registrations (
                registration_id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(50),
                course_code VARCHAR(20),
                category VARCHAR(50) NOT NULL,
                FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
                FOREIGN KEY (course_code) REFERENCES courses(course_code) ON DELETE CASCADE
            )
        `);
        
        // Seed initial courses if empty
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM courses');
        if (rows[0].count === 0) {
            await connection.query(`
                INSERT INTO courses (course_code, title, credits, category_type) VALUES 
                ('CSE 221', 'Database Management Systems', 3.0, 'regular'),
                ('CSE 222', 'Database Management Systems Sessional', 1.5, 'regular'),
                ('CSE 315', 'System Analysis Design', 3.0, 'regular'),
                ('CSE 413', 'Microprocessor and Assembly Programming', 3.0, 'regular'),
                ('CSE 414', 'Microprocessor and Assembly Programming Sessional', 1.5, 'regular'),
                ('MATH 415', 'Numerical Methods', 3.0, 'regular'),
                ('STAT 235', 'Statistics', 3.0, 'regular')
            `);
        }
        connection.release();
        console.log('Database connected and initialized successfully!');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}
initDB();

// API: Register Student
app.post('/api/register', async (req, res) => {
    try {
        const { studentId, fullName, department, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await pool.query(
            'INSERT INTO students (student_id, full_name, department, password) VALUES (?, ?, ?, ?)',
            [studentId, fullName, department, hashedPassword]
        );
        res.json({ success: true, message: 'Account created successfully!' });
    } catch (err) {
        res.status(400).json({ success: false, message: 'Student ID already exists or invalid data.' });
    }
});

// API: Login Student
app.post('/api/login', async (req, res) => {
    try {
        const { studentId, password } = req.body;
        const [rows] = await pool.query('SELECT * FROM students WHERE student_id = ?', [studentId]);
        
        if (rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid Student ID or Password.' });

        const student = rows[0];
        const match = await bcrypt.compare(password, student.password);
        if (!match) return res.status(401).json({ success: false, message: 'Invalid Student ID or Password.' });

        res.json({ success: true, student: { studentId: student.student_id, fullName: student.full_name, department: student.department } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API: Get Courses by Category
app.get('/api/courses/:category', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM courses WHERE category_type = ?', [req.params.category]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get Registered Courses for Student
app.get('/api/registrations/:studentId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT R.registration_id, C.course_code, C.title, C.credits, R.category 
            FROM registrations R 
            JOIN courses C ON R.course_code = C.course_code 
            WHERE R.student_id = ?
        `, [req.params.studentId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Save Registration
app.post('/api/registrations', async (req, res) => {
    try {
        const { studentId, courseCode, category } = req.body;
        await pool.query(
            'INSERT INTO registrations (student_id, course_code, category) VALUES (?, ?, ?)',
            [studentId, courseCode, category]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Drop Registration
app.delete('/api/registrations/:studentId/:courseCode', async (req, res) => {
    try {
        await pool.query('DELETE FROM registrations WHERE student_id = ? AND course_code = ?', [req.params.studentId, req.params.courseCode]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));