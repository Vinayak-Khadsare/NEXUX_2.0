const express = require('express');
const { sendEmail } = require('./mailer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.EMAIL_SERVICE_API_KEY;

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Authentication middleware for sending emails
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
        if (!API_KEY) {
            console.error('SERVER ERROR: EMAIL_SERVICE_API_KEY is not configured in the environment.');
        }
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

app.post('/send-email', authMiddleware, async (req, res) => {
    const { to, subject, html, text } = req.body;

    if (!to || !subject || (!html && !text)) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: to, subject, and either html or text'
        });
    }

    try {
        await sendEmail({ to, subject, html, text });
        console.log(`Email delivery successful for recipient.`);
        res.json({ success: true, message: 'Email sent' });
    } catch (error) {
        console.error('Email delivery failed:', error.message);
        res.status(500).json({ success: false, message: 'Email delivery failed' });
    }
});

app.listen(PORT, () => {
    console.log(`Email service started on port ${PORT}`);
});
