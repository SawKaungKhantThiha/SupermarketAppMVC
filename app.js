const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
try { require('dotenv').config(); } catch (err) { console.warn('dotenv not installed, skipping .env load'); }

const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const walletRoutes = require('./routes/walletRoutes');
const netsRoutes = require('./routes/netsRoutes');
const { exposeUser, checkAuthenticated } = require('./middleware/auth');
const paypal = require('./services/paypal');
const stripe = require('./services/stripe');
const { computeTotals } = require('./services/orderTotals');

const app = express();

// View engine and static files
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Session + flash
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());
app.use(exposeUser);

// Routes
app.get('/', (req, res) => {
  const user = req.session.user;
  if (user && user.role === 'admin') {
    return res.redirect('/admin/dashboard');
  }
  const success = req.flash('success');
  return res.render('index', { user, messages: success });
});
app.use(productRoutes);
app.use(userRoutes);
app.use(cartRoutes);
app.use(orderRoutes);
app.use(adminRoutes);
app.use(walletRoutes);
app.use(netsRoutes);

// PayPal: Create Order
app.post('/api/paypal/create-order', checkAuthenticated, async (req, res) => {
  try {
    const cart = req.session.cart || [];
    if (!cart.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    const promoAmount = Number(req.session.promoAmount || 0);
    const promoApplied = promoAmount > 0 ? { amount: promoAmount } : null;
    const totals = computeTotals(cart, promoApplied);
    const order = await paypal.createOrder(totals.total);
    if (order && order.id) {
      return res.json({ id: order.id });
    }
    return res.status(500).json({ error: 'Failed to create PayPal order', details: order });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create PayPal order', message: err.message });
  }
});

// PayPal: Capture Order
app.post('/api/paypal/capture-order', checkAuthenticated, async (req, res) => {
  try {
    const { orderID } = req.body;
    if (!orderID) {
      return res.status(400).json({ error: 'Missing PayPal order ID' });
    }
    const capture = await paypal.captureOrder(orderID);
    if (capture.status === 'COMPLETED') {
      return res.json({ status: 'COMPLETED', details: capture });
    }
    return res.status(400).json({ error: 'Payment not completed', details: capture });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to capture PayPal order', message: err.message });
  }
});

// Stripe: Create PaymentIntent (Card payments)
app.post('/api/stripe/create-payment-intent', checkAuthenticated, async (req, res) => {
  try {
    const cart = req.session.cart || [];
    if (!cart.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    const promoAmount = Number(req.session.promoAmount || 0);
    const promoApplied = promoAmount > 0 ? { amount: promoAmount } : null;
    const totals = computeTotals(cart, promoApplied);
    const intent = await stripe.createPaymentIntent(totals.total);
    return res.json({ clientSecret: intent.client_secret, id: intent.id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create Stripe PaymentIntent', message: err.message });
  }
});

// Fallback
app.use((req, res) => res.status(404).send('Page not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
