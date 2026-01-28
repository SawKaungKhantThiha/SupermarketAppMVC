const nodemailer = require('nodemailer');

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
};

const sendOtpEmail = async (to, otp) => {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('SMTP not configured. OTP for', to, 'is', otp);
    return;
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from,
    to,
    subject: 'Your Supermarket OTP Code',
    text: `Your OTP code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your OTP code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`
  });
};

module.exports = { sendOtpEmail };
