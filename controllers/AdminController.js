const db = require('../db');
const Order = require('../models/Order');

const AdminController = {
  listUsers(req, res) {
    const sql = 'SELECT id, username, email, role, contact, address FROM users ORDER BY id DESC';
    db.query(sql, (err, users) => {
      if (err) {
        console.error('Error fetching users:', err);
        return res.status(500).send('Database error');
      }
      res.render('adminUsers', { users, user: req.session.user });
    });
  },

  userOrders(req, res) {
    const userId = req.params.id;
    const userSql = 'SELECT id, username, email FROM users WHERE id = ?';
    db.query(userSql, [userId], (err, result) => {
      if (err) {
        console.error('Error fetching user:', err);
        return res.status(500).send('Database error');
      }
      if (!result || !result.length) return res.status(404).send('User not found');
      const targetUser = result[0];
      Order.getByUser(userId, (err, orders) => {
        if (err) {
          console.error('Error fetching orders:', err);
          return res.status(500).send('Database error');
        }
        res.render('adminUserOrders', { targetUser, orders, user: req.session.user });
      });
    });
  },

  deleteUser(req, res) {
    const userId = req.params.id;
    const sql = 'DELETE FROM users WHERE id = ?';
    db.query(sql, [userId], (err) => {
      if (err) {
        console.error('Error deleting user:', err);
        req.flash('error', 'Could not delete user.');
      }
      res.redirect('/admin/users');
    });
  }
};

module.exports = AdminController;
