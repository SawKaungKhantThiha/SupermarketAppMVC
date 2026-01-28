const axios = require('axios');
const db = require('../db');
const Order = require('../models/Order');
const OrderPayment = require('../models/OrderPayment');
const { computeTotals } = require('../services/orderTotals');
const netsService = require('../services/nets');

const validatePromo = (code, subtotal, callback) => {
  if (!code) return callback(null, null);
  const sql = `
    SELECT id, code, discountType, discountValue, maxDiscount, minSubtotal, expiresAt, active
    FROM promo_codes
    WHERE code = ?
    LIMIT 1
  `;
  db.query(sql, [code], (err, rows) => {
    if (err) return callback(err);
    const promo = rows && rows[0] ? rows[0] : null;
    if (!promo || !promo.active) return callback(null, null);
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return callback(null, null);
    const minSubtotal = promo.minSubtotal != null ? Number(promo.minSubtotal) : 0;
    if (subtotal < minSubtotal) return callback(null, null);
    const value = Number(promo.discountValue);
    let discount = 0;
    if (promo.discountType === 'percent') {
      discount = subtotal * (value / 100);
    } else {
      discount = value;
    }
    if (promo.maxDiscount != null) {
      discount = Math.min(discount, Number(promo.maxDiscount));
    }
    discount = Math.min(discount, subtotal);
    return callback(null, { code: promo.code, amount: Number(discount.toFixed(2)) });
  });
};

const resolvePromo = (promoCode, subtotal) => new Promise((resolve, reject) => {
  if (!promoCode) return resolve(null);
  validatePromo(promoCode, subtotal, (err, promo) => {
    if (err) return reject(err);
    resolve(promo);
  });
});

const NetsController = {
  async generateQr(req, res) {
    const cart = req.session.cart || [];
    const user = req.session.user;
    if (!user) {
      req.flash('error', 'Please sign in to continue.');
      return res.redirect('/login');
    }
    if (!cart.length) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/shopping');
    }

    const address = (req.body.address || '').trim();
    const promoCode = req.session.promoCode || null;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let promoApplied = null;

    if (promoCode) {
      try {
        promoApplied = await resolvePromo(promoCode, subtotal);
        if (!promoApplied) {
          req.session.promoCode = null;
          req.session.promoAmount = null;
        } else {
          req.session.promoCode = promoApplied.code;
          req.session.promoAmount = promoApplied.amount;
        }
      } catch (err) {
        console.error('Error validating promo for NETS:', err);
        req.flash('error', 'Could not validate promo code.');
        req.session.promoCode = null;
        req.session.promoAmount = null;
      }
    }

    const totals = computeTotals(cart, promoApplied);
    req.session.netsPending = {
      address: address || null,
      promoApplied: promoApplied || null
    };

    req.body.cartTotal = Number(totals.total).toFixed(2);
    return netsService.generateQrCode(req, res);
  },

  async streamPaymentStatus(req, res) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    const txnRetrievalRef = req.params.txnRetrievalRef;
    let pollCount = 0;
    const maxPolls = 60;
    let frontendTimeoutStatus = 0;

    const interval = setInterval(async () => {
      pollCount += 1;

      try {
        const response = await axios.post(
          'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query',
          { txn_retrieval_ref: txnRetrievalRef, frontend_timeout_status: frontendTimeoutStatus },
          {
            headers: {
              'api-key': process.env.API_KEY,
              'project-id': process.env.PROJECT_ID,
              'Content-Type': 'application/json'
            }
          }
        );

        res.write(`data: ${JSON.stringify(response.data)}\n\n`);

        const resData = response.data.result.data;
        if (resData.response_code === '00' && resData.txn_status === 1) {
          res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
          clearInterval(interval);
          res.end();
        } else if (frontendTimeoutStatus === 1 && resData && (resData.response_code !== '00' || resData.txn_status === 2)) {
          res.write(`data: ${JSON.stringify({ fail: true, ...resData })}\n\n`);
          clearInterval(interval);
          res.end();
        }
      } catch (err) {
        clearInterval(interval);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }

      if (pollCount >= maxPolls) {
        clearInterval(interval);
        frontendTimeoutStatus = 1;
        res.write(`data: ${JSON.stringify({ fail: true, error: 'Timeout' })}\n\n`);
        res.end();
      }
    }, 5000);

    req.on('close', () => {
      clearInterval(interval);
    });
  },

  async success(req, res) {
    const user = req.session.user;
    const cart = req.session.cart || [];
    const pending = req.session.netsPending || null;

    if (!user) {
      req.flash('error', 'Please sign in to continue.');
      return res.redirect('/login');
    }

    if (!cart.length) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/shopping');
    }

    const address = pending && pending.address ? pending.address : null;
    const promoCode = req.session.promoCode || null;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let promoApplied = null;

    if (promoCode) {
      try {
        promoApplied = await resolvePromo(promoCode, subtotal);
        if (!promoApplied) {
          req.session.promoCode = null;
          req.session.promoAmount = null;
        } else {
          req.session.promoCode = promoApplied.code;
          req.session.promoAmount = promoApplied.amount;
        }
      } catch (err) {
        console.error('Error validating promo after NETS payment:', err);
        req.flash('error', 'Could not validate promo code.');
        req.session.promoCode = null;
        req.session.promoAmount = null;
      }
    }

    const totals = computeTotals(cart, promoApplied);
    const orderData = { userId: user.id, total: totals.total, address };

    Order.create(orderData, cart, (err, result) => {
      if (err) {
        console.error('Error creating NETS order:', err);
        req.flash('error', err.message || 'Could not place order, please try again.');
        return res.redirect('/checkout');
      }
      const paymentInfo = {
        method: 'NETS QR',
        promo: promoApplied ? { code: promoApplied.code, amount: promoApplied.amount } : null
      };
      req.session.orderPayments = req.session.orderPayments || {};
      req.session.orderPayments[result.orderId] = paymentInfo;

      OrderPayment.create(result.orderId, paymentInfo, (payErr) => {
        if (payErr) console.error('Error saving NETS payment:', payErr);
        req.session.cart = [];
        req.session.promoCode = null;
        req.session.promoAmount = null;
        req.session.netsPending = null;
        return res.redirect(`/orders/${result.orderId}`);
      });
    });
  },

  fail(req, res) {
    req.session.netsPending = null;
    res.render('netsTxnFailStatus', { message: 'Transaction Failed. Please try again.' });
  }
};

module.exports = NetsController;
