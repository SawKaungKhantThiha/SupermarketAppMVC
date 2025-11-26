const db = require('../db');

const Order = {
  // Create an order with items: orderData { userId, total }, items [{productId, productName, category, price, quantity, image}]
  create(orderData, items, callback) {
    db.beginTransaction(err => {
      if (err) return callback(err);

      const orderSql = 'INSERT INTO orders (userId, total, address, createdAt) VALUES (?, ?, ?, NOW())';
      db.query(orderSql, [orderData.userId, orderData.total, orderData.address || null], (err, orderResult) => {
        if (err) return db.rollback(() => callback(err));
        const orderId = orderResult.insertId;

        const values = items.map(it => [orderId, it.productId, it.productName, it.category || null, it.price, it.quantity, it.image || null]);
        const itemsSql = 'INSERT INTO order_items (orderId, productId, productName, category, price, quantity, image) VALUES ?';
        db.query(itemsSql, [values], err => {
          if (err) return db.rollback(() => callback(err));
          db.commit(err => {
            if (err) return db.rollback(() => callback(err));
            callback(null, { orderId });
          });
        });
      });
    });
  },

  getByUser(userId, callback) {
    const sql = 'SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC';
    db.query(sql, [userId], callback);
  },

  getWithItems(orderId, callback) {
    const orderSql = 'SELECT * FROM orders WHERE id = ?';
    const itemsSql = 'SELECT * FROM order_items WHERE orderId = ?';
    db.query(orderSql, [orderId], (err, orders) => {
      if (err) return callback(err);
      if (!orders || orders.length === 0) return callback(null, null);
      db.query(itemsSql, [orderId], (err, items) => {
        if (err) return callback(err);
        callback(null, { order: orders[0], items });
      });
    });
  }
};

module.exports = Order;
