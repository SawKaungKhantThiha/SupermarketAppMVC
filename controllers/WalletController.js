const Wallet = require('../models/Wallet');
const paypal = require('../services/paypal');

const parseAmount = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return Number(num.toFixed(2));
};

const getCaptureAmount = (capture) => {
  const amount = capture
    && capture.purchase_units
    && capture.purchase_units[0]
    && capture.purchase_units[0].payments
    && capture.purchase_units[0].payments.captures
    && capture.purchase_units[0].payments.captures[0]
    && capture.purchase_units[0].payments.captures[0].amount
    && capture.purchase_units[0].payments.captures[0].amount.value;
  return parseAmount(amount);
};

const getCaptureId = (capture) => {
  const captureId = capture
    && capture.purchase_units
    && capture.purchase_units[0]
    && capture.purchase_units[0].payments
    && capture.purchase_units[0].payments.captures
    && capture.purchase_units[0].payments.captures[0]
    && capture.purchase_units[0].payments.captures[0].id;
  return captureId || null;
};

const WalletController = {
  page(req, res) {
    const user = req.session.user;
    Wallet.getBalance(user.id, (err, balance) => {
      if (err) {
        console.error('Error fetching wallet balance:', err);
      }
      res.render('wallet', {
        user,
        walletBalance: err ? 0 : balance,
        paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
        success: req.flash('success'),
        error: req.flash('error')
      });
    });
  },

  async createTopupOrder(req, res) {
    try {
      const amount = parseAmount(req.body.amount);
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid top-up amount.' });
      }
      if (amount > 2000) {
        return res.status(400).json({ error: 'Top-up amount exceeds the limit.' });
      }
      const order = await paypal.createOrder(amount);
      if (order && order.id) {
        return res.json({ id: order.id });
      }
      return res.status(500).json({ error: 'Failed to create PayPal order.', details: order });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create PayPal order.', message: err.message });
    }
  },

  async captureTopup(req, res) {
    const user = req.session.user;
    try {
      const { orderID } = req.body;
      if (!orderID) {
        return res.status(400).json({ error: 'Missing PayPal order ID.' });
      }
      const capture = await paypal.captureOrder(orderID);
      if (capture.status !== 'COMPLETED') {
        return res.status(400).json({ error: 'Payment not completed.', details: capture });
      }
      const amount = getCaptureAmount(capture);
      const captureId = getCaptureId(capture);
      if (!amount || !captureId) {
        return res.status(400).json({ error: 'Unable to confirm capture details.' });
      }
      const reference = `PAYPAL-CAPTURE-${captureId}`;
      Wallet.credit(user.id, amount, reference, 'topup', (err, result) => {
        if (err) {
          console.error('Error crediting wallet:', err);
          return res.status(500).json({ error: 'Failed to credit wallet.' });
        }
        return res.json({ status: 'COMPLETED', balance: result.balance, captureId });
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to capture PayPal order.', message: err.message });
    }
  }
};

module.exports = WalletController;
