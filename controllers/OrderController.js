const Order = require('../models/Order');
const Product = require('../models/Product');

const OrderController = {
  checkoutForm(req, res) {
    const cart = req.session.cart || [];
    const user = req.session.user;
    if (!cart.length) return res.redirect('/shopping');
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    res.render('checkout', { cart, total, user, messages: req.flash('error') });
  },

  placeOrder(req, res) {
    const cart = req.session.cart || [];
    const user = req.session.user;
    const address = (req.body.address || '').trim();
    if (!cart.length) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/shopping');
    }

    // Optionally validate stock: keep simple here
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderData = { userId: user.id, total, address: address || null };

    Order.create(orderData, cart, (err, result) => {
      if (err) {
        console.error('Error creating order:', err);
        req.flash('error', err.message || 'Could not place order, please try again.');
        return res.redirect('/checkout');
      }
      // Clear cart after successful order
      req.session.cart = [];
      return res.redirect(`/orders/${result.orderId}`);
    });
  },

  list(req, res) {
    const user = req.session.user;
    Order.getByUser(user.id, (err, orders) => {
      if (err) {
        console.error('Error fetching orders:', err);
        return res.status(500).send('Database error');
      }
      res.render('orders', { orders, user });
    });
  },

  detail(req, res) {
    const user = req.session.user;
    const orderId = req.params.id;
    Order.getWithItems(orderId, (err, data) => {
      if (err) {
        console.error('Error fetching order detail:', err);
        return res.status(500).send('Database error');
      }
      if (!data) return res.status(404).send('Order not found');
      // Ensure user owns the order (simple check)
      if (data.order.userId !== user.id && user.role !== 'admin') {
        req.flash('error', 'Access denied');
        return res.redirect('/orders');
      }
      res.render('orderDetail', { order: data.order, items: data.items, user });
    });
  }
};

module.exports = OrderController;
