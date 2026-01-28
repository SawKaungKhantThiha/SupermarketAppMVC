const crypto = require('crypto');

const generateOtp = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i += 1) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
};

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

module.exports = { generateOtp, hashOtp };
