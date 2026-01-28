const db = require('../db');
const { generateOtp, hashOtp } = require('../services/otp');
const { sendOtpEmail } = require('../services/email');

const OTP_EXP_MINUTES = 10;

const UserController = {
  registerForm(req, res) {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
  },

  async register(req, res) {
    const { username, email, password, address, contact } = req.body;
    const role = 'user';

    if (!username || !email || !password || !address || !contact) {
      req.flash('error', 'All fields are required.');
      req.flash('formData', req.body);
      return res.redirect('/register');
    }
    if (password.length < 6) {
      req.flash('error', 'Password should be at least 6 or more characters long');
      req.flash('formData', req.body);
      return res.redirect('/register');
    }

    const otp = generateOtp(6);
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);

    const sql = `
      INSERT INTO users (username, email, password, address, contact, role, is_verified, otp_hash, otp_expires_at)
      VALUES (?, ?, SHA1(?), ?, ?, ?, 0, ?, ?)
    `;
    db.query(sql, [username, email, password, address, contact, role, otpHash, otpExpiresAt], async (err, result) => {
      if (err) {
        console.error('Error registering user:', err);
        req.flash('error', 'Registration failed. Try again.');
        return res.redirect('/register');
      }
      try {
        await sendOtpEmail(email, otp);
      } catch (mailErr) {
        console.error('Error sending OTP email:', mailErr);
      }
      req.session.pendingVerification = { userId: result.insertId, email };
      req.flash('success', 'We sent an OTP to your email. Enter it to verify your account.');
      return res.redirect('/verify-otp');
    });
  },

  loginForm(req, res) {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
  },

  login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
      if (err) {
        console.error('Error logging in:', err);
        req.flash('error', 'Login failed.');
        return res.redirect('/login');
      }
      if (results.length === 0) {
        req.flash('error', 'Invalid email or password.');
        return res.redirect('/login');
      }

      const user = results[0];
      if (user.is_verified === 0 || user.is_verified === '0') {
        req.session.pendingVerification = { userId: user.id, email: user.email };
        req.flash('error', 'Please verify your account with the OTP sent to your email.');
        return res.redirect('/verify-otp');
      }

      req.session.user = user;
      req.flash('success', `Welcome back, ${req.session.user.username}!`);
      return res.redirect('/');
    });
  },

  verifyOtpForm(req, res) {
    res.render('verifyOtp', {
      messages: req.flash('success'),
      errors: req.flash('error'),
      email: req.session.pendingVerification ? req.session.pendingVerification.email : ''
    });
  },

  verifyOtp(req, res) {
    const { otp } = req.body;
    const pending = req.session.pendingVerification;
    if (!pending || !pending.userId) {
      req.flash('error', 'No verification session found. Please log in again.');
      return res.redirect('/login');
    }
    if (!otp || String(otp).trim().length < 4) {
      req.flash('error', 'Please enter a valid OTP.');
      return res.redirect('/verify-otp');
    }

    const otpHash = hashOtp(otp);
    const sql = `
      SELECT id, email, otp_hash, otp_expires_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `;
    db.query(sql, [pending.userId], (err, rows) => {
      if (err) {
        console.error('Error verifying OTP:', err);
        req.flash('error', 'Verification failed. Try again.');
        return res.redirect('/verify-otp');
      }
      const user = rows && rows[0] ? rows[0] : null;
      if (!user || user.email !== pending.email) {
        req.flash('error', 'Verification session mismatch.');
        return res.redirect('/verify-otp');
      }
      if (!user.otp_hash || !user.otp_expires_at) {
        req.flash('error', 'OTP not found. Please request a new code.');
        return res.redirect('/verify-otp');
      }
      const expiresAt = new Date(user.otp_expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        req.flash('error', 'OTP has expired. Please request a new code.');
        return res.redirect('/verify-otp');
      }
      if (user.otp_hash !== otpHash) {
        req.flash('error', 'Incorrect OTP. Please try again.');
        return res.redirect('/verify-otp');
      }

      const updateSql = `
        UPDATE users
        SET is_verified = 1, otp_hash = NULL, otp_expires_at = NULL
        WHERE id = ?
      `;
      db.query(updateSql, [pending.userId], (updateErr) => {
        if (updateErr) {
          console.error('Error updating verification status:', updateErr);
          req.flash('error', 'Verification failed. Try again.');
          return res.redirect('/verify-otp');
        }
        req.session.pendingVerification = null;
        req.flash('success', 'Email verified. Please log in.');
        return res.redirect('/login');
      });
    });
  },

  resendOtp(req, res) {
    const pending = req.session.pendingVerification;
    if (!pending || !pending.userId) {
      req.flash('error', 'No verification session found. Please log in again.');
      return res.redirect('/login');
    }
    const otp = generateOtp(6);
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);
    const updateSql = `
      UPDATE users
      SET otp_hash = ?, otp_expires_at = ?
      WHERE id = ?
    `;
    db.query(updateSql, [otpHash, otpExpiresAt, pending.userId], async (err) => {
      if (err) {
        console.error('Error resending OTP:', err);
        req.flash('error', 'Could not resend OTP. Try again.');
        return res.redirect('/verify-otp');
      }
      try {
        await sendOtpEmail(pending.email, otp);
      } catch (mailErr) {
        console.error('Error sending OTP email:', mailErr);
      }
      req.flash('success', 'A new OTP was sent to your email.');
      return res.redirect('/verify-otp');
    });
  },

  logout(req, res) {
    req.session.destroy(() => res.redirect('/'));
  }
};

module.exports = UserController;
