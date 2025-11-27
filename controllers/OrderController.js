const Order = require('../models/Order');
const Product = require('../models/Product');

const OrderController = {
  checkoutForm(req, res) {
    const cart = req.session.cart || [];
    const user = req.session.user;
    if (!cart.length) return res.redirect('/shopping');
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const gstRate = 0.09;
    const deliveryRate = 0.15;
    const gst = Number((subtotal * gstRate).toFixed(2));
    const deliveryFee = Number((subtotal * deliveryRate).toFixed(2));
    const total = Number((subtotal + gst + deliveryFee).toFixed(2));
    res.render('checkout', {
      cart,
      subtotal,
      gst,
      deliveryFee,
      total,
      gstRate,
      deliveryRate,
      user,
      messages: req.flash('error')
    });
  },

  placeOrder(req, res) {
    const cart = req.session.cart || [];
    const user = req.session.user;
    const address = (req.body.address || '').trim();
    const paymentMethod = req.body.paymentMethod || 'card';
    const cardName = (req.body.cardName || '').trim();
    const cardNumberRaw = (req.body.cardNumber || '').replace(/\D/g, '');
    const cardLast4 = cardNumberRaw ? cardNumberRaw.slice(-4) : null;
    if (!cart.length) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/shopping');
    }

    // Optionally validate stock: keep simple here
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const gstRate = 0.09;
    const deliveryRate = 0.15;
    const gst = Number((subtotal * gstRate).toFixed(2));
    const deliveryFee = Number((subtotal * deliveryRate).toFixed(2));
    const total = Number((subtotal + gst + deliveryFee).toFixed(2));
    const orderData = { userId: user.id, total, address: address || null };

    Order.create(orderData, cart, (err, result) => {
      if (err) {
        console.error('Error creating order:', err);
        req.flash('error', err.message || 'Could not place order, please try again.');
        return res.redirect('/checkout');
      }
      // Stash minimal, non-sensitive payment info in-session for invoice display
      req.session.orderPayments = req.session.orderPayments || {};
      req.session.orderPayments[result.orderId] = {
        method: paymentMethod === 'cash' ? 'Cash on Delivery' : 'Card',
        cardName: cardName || null,
        cardLast4: paymentMethod === 'card' ? cardLast4 : null
      };
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
      const paymentInfo = (req.session.orderPayments && req.session.orderPayments[data.order.id]) || null;
      const subtotal = data.items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0);
      const gstRate = 0.09;
      const deliveryRate = 0.15;
      const gst = Number((subtotal * gstRate).toFixed(2));
      const deliveryFee = Number((subtotal * deliveryRate).toFixed(2));
      const total = Number((subtotal + gst + deliveryFee).toFixed(2));
      res.render('orderDetail', {
        order: data.order,
        items: data.items,
        user,
        paymentInfo,
        breakdown: { subtotal, gstRate, deliveryRate, gst, deliveryFee, total }
      });
    });
  }
};

module.exports = OrderController;
