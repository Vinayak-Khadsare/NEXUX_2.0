const nodemailer = require('nodemailer');

const createTransporter = () => {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const user = process.env.SMTP_USERNAME;
    const pass = process.env.SMTP_PASSWORD;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    if (!host || !user || !pass) {
        console.error('SMTP configuration is missing. Nodemailer will not be able to send emails.');
        return null;
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass
        }
    });
};

const sendEmail = async ({ to, subject, html, text }) => {
    const transporter = createTransporter();
    
    if (!transporter) {
        throw new Error('SMTP Transport not configured properly.');
    }

    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME;
    const fromName = process.env.SMTP_FROM_NAME || 'NEXUS';

    const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
        text
    };

    return transporter.sendMail(mailOptions);
};

module.exports = {
    sendEmail
};
