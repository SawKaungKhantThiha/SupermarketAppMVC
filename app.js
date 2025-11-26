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
const { exposeUser } = require('./middleware/auth');

const app = express();

// View engine and static files
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

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
app.get('/', (req, res) => res.render('index', { user: req.session.user }));
app.use(productRoutes);
app.use(userRoutes);
app.use(cartRoutes);
app.use(orderRoutes);
app.use(adminRoutes);

// Fallback
app.use((req, res) => res.status(404).send('Page not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
