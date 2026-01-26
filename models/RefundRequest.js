const db = require('../db');

const RefundRequest = {
  create(orderId, userId, reason, callback) {
    const sql = `
      INSERT INTO refund_requests (orderId, userId, reason, status, requestedAt)
      VALUES (?, ?, ?, 'pending', NOW())
    `;
    db.query(sql, [orderId, userId, reason || null], callback);
  },

  getByOrderId(orderId, callback) {
    const sql = `
      SELECT id, orderId, userId, reason, status, requestedAt, resolvedAt, adminId, paypalRefundId, refundedAmount
      FROM refund_requests
      WHERE orderId = ?
      LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows && rows[0] ? rows[0] : null);
    });
  },

  getAllWithDetails(callback) {
    const sql = `
      SELECT rr.id, rr.orderId, rr.userId, rr.reason, rr.status, rr.requestedAt, rr.resolvedAt,
             rr.adminId, rr.paypalRefundId, rr.refundedAmount,
             o.total, o.createdAt,
             u.username, u.email,
             op.method, op.paypalCaptureId
      FROM refund_requests rr
      JOIN orders o ON o.id = rr.orderId
      JOIN users u ON u.id = rr.userId
      LEFT JOIN order_payments op ON op.orderId = rr.orderId
      ORDER BY rr.requestedAt DESC
    `;
    db.query(sql, callback);
  },

  getByIdWithDetails(id, callback) {
    const sql = `
      SELECT rr.id, rr.orderId, rr.userId, rr.reason, rr.status, rr.requestedAt, rr.resolvedAt,
             rr.adminId, rr.paypalRefundId, rr.refundedAmount,
             o.total, o.createdAt,
             u.username, u.email,
             op.method, op.paypalCaptureId
      FROM refund_requests rr
      JOIN orders o ON o.id = rr.orderId
      JOIN users u ON u.id = rr.userId
      LEFT JOIN order_payments op ON op.orderId = rr.orderId
      WHERE rr.id = ?
      LIMIT 1
    `;
    db.query(sql, [id], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows && rows[0] ? rows[0] : null);
    });
  },

  updateStatus(id, status, adminId, updateFields, callback) {
    const sql = `
      UPDATE refund_requests
      SET status = ?, adminId = ?, resolvedAt = NOW(),
          paypalRefundId = ?, refundedAmount = ?
      WHERE id = ?
    `;
    const params = [
      status,
      adminId || null,
      updateFields.paypalRefundId || null,
      updateFields.refundedAmount != null ? updateFields.refundedAmount : null,
      id
    ];
    db.query(sql, params, callback);
  }
};

module.exports = RefundRequest;
