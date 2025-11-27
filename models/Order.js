const db = require('../db');

const Order = {
  // Create an order with items: orderData { userId, total }, items [{productId, productName, category, price, quantity, image}]
  create(orderData, items, callback) {
    const normalizedItems = (items || [])
      .map(it => ({
        productId: it.productId || it.id,
        productName: it.productName,
        category: it.category || null,
        price: it.price,
        quantity: Number(it.quantity) || 0,
        image: it.image || null
      }))
      .filter(it => it.productId && it.quantity > 0);

    if (!normalizedItems.length) {
      return callback(new Error('No items to place in order'));
    }

    const rollback = (err) => db.rollback(() => callback(err));

    db.beginTransaction(err => {
      if (err) return callback(err);

      // Lock relevant product rows to ensure stock consistency
      const lockSql = 'SELECT id, quantity, productName FROM products WHERE id IN (?) FOR UPDATE';
      const ids = normalizedItems.map(it => it.productId);

      db.query(lockSql, [ids], (err, rows) => {
        if (err) return rollback(err);

        const stockById = new Map(rows.map(r => [r.id, r.quantity]));
        const missing = normalizedItems.find(it => !stockById.has(it.productId));
        if (missing) return rollback(new Error(`Product not found: ${missing.productName || missing.productId}`));

        const insufficient = normalizedItems.find(it => stockById.get(it.productId) < it.quantity);
        if (insufficient) return rollback(new Error(`Not enough stock for ${insufficient.productName}`));

        const orderSql = 'INSERT INTO orders (userId, total, address, createdAt) VALUES (?, ?, ?, NOW())';
        db.query(orderSql, [orderData.userId, orderData.total, orderData.address || null], (err, orderResult) => {
          if (err) return rollback(err);
          const orderId = orderResult.insertId;

          const values = normalizedItems.map(it => [
            orderId,
            it.productId,
            it.productName,
            it.category,
            it.price,
            it.quantity,
            it.image
          ]);
          const itemsSql = 'INSERT INTO order_items (orderId, productId, productName, category, price, quantity, image) VALUES ?';

          db.query(itemsSql, [values], err => {
            if (err) return rollback(err);

            // Deduct stock sequentially to stay inside transaction
            const updateStock = (index) => {
              if (index >= normalizedItems.length) {
                return db.commit(err => {
                  if (err) return rollback(err);
                  callback(null, { orderId });
                });
              }
              const item = normalizedItems[index];
              const updateSql = 'UPDATE products SET quantity = quantity - ? WHERE id = ?';
              db.query(updateSql, [item.quantity, item.productId], (err) => {
                if (err) return rollback(err);
                updateStock(index + 1);
              });
            };

            updateStock(0);
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
