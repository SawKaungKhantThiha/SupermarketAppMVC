const db = require('../db');

const OrderPayment = {
  create(orderId, paymentInfo, callback) {
    if (!paymentInfo) return callback(null);
    const sql = `
      INSERT INTO order_payments
        (orderId, method, cardName, cardLast4, paypalOrderId, paypalCaptureId, cryptoTxHash, cryptoChain, cryptoFrom, stripePaymentIntentId, promoCode, promoAmount, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const params = [
      orderId,
      paymentInfo.method,
      paymentInfo.cardName || null,
      paymentInfo.cardLast4 || null,
      paymentInfo.paypalOrderId || null,
      paymentInfo.paypalCaptureId || null,
      paymentInfo.cryptoTxHash || null,
      paymentInfo.cryptoChain || null,
      paymentInfo.cryptoFrom || null,
      paymentInfo.stripePaymentIntentId || null,
      paymentInfo.promo && paymentInfo.promo.code ? paymentInfo.promo.code : null,
      paymentInfo.promo && paymentInfo.promo.amount != null ? paymentInfo.promo.amount : null
    ];
    db.query(sql, params, callback);
  },

  getByOrderId(orderId, callback) {
    const sql = `
      SELECT id, orderId, method, cardName, cardLast4, paypalOrderId, paypalCaptureId, cryptoTxHash, cryptoChain, cryptoFrom, stripePaymentIntentId, promoCode, promoAmount, createdAt
      FROM order_payments
      WHERE orderId = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows && rows[0] ? rows[0] : null);
    });
  }
};

module.exports = OrderPayment;
