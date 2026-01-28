const Order = require('../models/Order');
const Product = require('../models/Product');
const db = require('../db');
const { GST_RATE, DELIVERY_RATE, computeTotals } = require('../services/orderTotals');
const OrderPayment = require('../models/OrderPayment');
const Wallet = require('../models/Wallet');
const stripe = require('../services/stripe');

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

const OrderController = {
  checkoutForm(req, res) {
    const cart = req.session.cart || [];
    const user = req.session.user;
    if (!cart.length) return res.redirect('/shopping');
    const promoCode = req.session.promoCode || null;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const renderPage = (promoApplied) => {
      const totals = computeTotals(cart, promoApplied);
      Wallet.getBalance(user.id, (err, walletBalance) => {
        if (err) console.error('Error fetching wallet balance:', err);
        res.render('checkout', {
          cart,
          subtotal: totals.subtotal,
          discount: totals.promoAmount,
          gst: totals.gst,
          deliveryFee: totals.deliveryFee,
          total: totals.total,
          gstRate: GST_RATE,
          deliveryRate: DELIVERY_RATE,
          user,
          messages: req.flash('error'),
          promoApplied,
          walletBalance: err ? 0 : walletBalance,
          paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
          stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
          ethRate: process.env.ETH_SGD_RATE || '',
          metamaskAddress: process.env.METAMASK_MERCHANT_ADDRESS || ''
        });
      });
    };

    if (promoCode) {
      validatePromo(promoCode, subtotal, (err, promo) => {
        if (err) {
          console.error('Error validating promo:', err);
          req.flash('error', 'Could not validate promo code.');
          req.session.promoCode = null;
          return renderPage(null);
        }
        if (!promo) {
          req.flash('error', 'Promo code is invalid or expired.');
          req.session.promoCode = null;
          return renderPage(null);
        }
        req.session.promoCode = promo.code;
        req.session.promoAmount = promo.amount;
        return renderPage(promo);
      });
    } else {
      renderPage(null);
    }
  },

  placeOrder(req, res) {
    const cart = req.session.cart || [];
    const user = req.session.user;
    const address = (req.body.address || '').trim();
    const paymentMethod = req.body.paymentMethod || 'card';
    const cardName = (req.body.cardName || '').trim();
    const cardNumberRaw = (req.body.cardNumber || '').replace(/\D/g, '');
    const cardLast4 = cardNumberRaw ? cardNumberRaw.slice(-4) : null;
    const paypalOrderId = (req.body.paypalOrderId || '').trim();
    const paypalCaptureId = (req.body.paypalCaptureId || '').trim();
    const metamaskTxHash = (req.body.metamaskTxHash || '').trim();
    const metamaskFrom = (req.body.metamaskFrom || '').trim();
    const stripePaymentIntentId = (req.body.stripePaymentIntentId || '').trim();
    if (!cart.length) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/shopping');
    }
    if (paymentMethod === 'metamask' && !metamaskTxHash) {
      req.flash('error', 'Missing MetaMask transaction hash.');
      return res.redirect('/checkout');
    }
    if (paymentMethod === 'stripe-card' && !stripePaymentIntentId) {
      req.flash('error', 'Missing Stripe PaymentIntent.');
      return res.redirect('/checkout');
    }

    const promoCode = req.session.promoCode || null;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const finalizeOrder = async (promoApplied) => {
      const totals = computeTotals(cart, promoApplied);
      const orderData = { userId: user.id, total: totals.total, address: address || null };
      const walletRef = paymentMethod === 'wallet'
        ? `WALLET-CHECKOUT-${user.id}-${Date.now()}`
        : null;

      if (paymentMethod === 'stripe-card') {
        try {
          const intent = await stripe.getPaymentIntent(stripePaymentIntentId);
          const expected = Math.round(Number(totals.total) * 100);
          if (intent.currency !== 'sgd') {
            req.flash('error', 'Stripe payment currency mismatch.');
            return res.redirect('/checkout');
          }
          if (intent.status !== 'succeeded') {
            req.flash('error', 'Stripe payment not completed.');
            return res.redirect('/checkout');
          }
          const received = Number(intent.amount_received || intent.amount || 0);
          if (received < expected) {
            req.flash('error', 'Stripe payment amount is less than required.');
            return res.redirect('/checkout');
          }
        } catch (err) {
          console.error('Stripe verification error:', err);
          req.flash('error', 'Stripe verification failed. Please try again.');
          return res.redirect('/checkout');
        }
      }

      const handleCreate = () => {
        Order.create(orderData, cart, (err, result) => {
          if (err) {
            console.error('Error creating order:', err);
            if (paymentMethod === 'wallet') {
              Wallet.credit(user.id, totals.total, `${walletRef}-REV`, 'refund', (refundErr) => {
                if (refundErr) console.error('Error refunding wallet after failed order:', refundErr);
              });
            }
            req.flash('error', err.message || 'Could not place order, please try again.');
            return res.redirect('/checkout');
          }
          req.session.orderPayments = req.session.orderPayments || {};
          let storedPaymentMethod = 'Card';
        if (paymentMethod === 'cash') {
          storedPaymentMethod = 'Cash on Delivery';
        } else if (paymentMethod === 'paypal') {
          storedPaymentMethod = 'PayPal';
        } else if (paymentMethod === 'wallet') {
          storedPaymentMethod = 'Wallet';
        } else if (paymentMethod === 'metamask') {
          storedPaymentMethod = 'MetaMask (Sepolia)';
        } else if (paymentMethod === 'stripe-card') {
          storedPaymentMethod = 'Stripe Card';
        }
        const paymentInfo = {
          method: storedPaymentMethod,
          cardName: storedPaymentMethod === 'Card' ? cardName || null : null,
          cardLast4: storedPaymentMethod === 'Card' ? cardLast4 : null,
          paypalOrderId: storedPaymentMethod === 'PayPal' ? paypalOrderId || null : null,
          paypalCaptureId: storedPaymentMethod === 'PayPal' ? paypalCaptureId || null : null,
          cryptoTxHash: storedPaymentMethod === 'MetaMask (Sepolia)' ? metamaskTxHash || null : null,
          cryptoFrom: storedPaymentMethod === 'MetaMask (Sepolia)' ? metamaskFrom || null : null,
          cryptoChain: storedPaymentMethod === 'MetaMask (Sepolia)' ? 'sepolia' : null,
          stripePaymentIntentId: storedPaymentMethod === 'Stripe Card' ? stripePaymentIntentId || null : null,
          promo: promoApplied ? { code: promoApplied.code, amount: promoApplied.amount } : null
        };
          req.session.orderPayments[result.orderId] = paymentInfo;
          OrderPayment.create(result.orderId, paymentInfo, (err) => {
            if (err) console.error('Error saving order payment:', err);
            req.session.cart = [];
            req.session.promoCode = null;
            req.session.promoAmount = null;
          return res.redirect(`/orders/${result.orderId}`);
        });
      });
    };

      if (paymentMethod === 'wallet') {
        return Wallet.charge(user.id, totals.total, walletRef, (err) => {
          if (err) {
            if (err.code === 'INSUFFICIENT_FUNDS') {
              req.flash('error', 'Insufficient wallet balance.');
            } else {
              console.error('Wallet payment error:', err);
              req.flash('error', 'Wallet payment failed. Please try again.');
            }
            return res.redirect('/checkout');
          }
          return handleCreate();
        });
      }

      return handleCreate();
    };

    if (promoCode) {
      validatePromo(promoCode, subtotal, (err, promo) => {
        if (err) {
          console.error('Error validating promo during checkout:', err);
          req.flash('error', 'Could not validate promo code.');
          req.session.promoCode = null;
          return finalizeOrder(null).catch((err) => {
            console.error('Error finalizing order:', err);
            req.flash('error', 'Could not place order. Please try again.');
            return res.redirect('/checkout');
          });
        }
        if (!promo) {
          req.flash('error', 'Promo code is invalid or expired.');
          req.session.promoCode = null;
          return finalizeOrder(null).catch((err) => {
            console.error('Error finalizing order:', err);
            req.flash('error', 'Could not place order. Please try again.');
            return res.redirect('/checkout');
          });
        }
        finalizeOrder(promo).catch((err) => {
          console.error('Error finalizing order:', err);
          req.flash('error', 'Could not place order. Please try again.');
          return res.redirect('/checkout');
        });
      });
    } else {
      finalizeOrder(null).catch((err) => {
        console.error('Error finalizing order:', err);
        req.flash('error', 'Could not place order. Please try again.');
        return res.redirect('/checkout');
      });
    }
  },

  list(req, res) {
    const user = req.session.user;
    Order.getByUser(user.id, (err, orders) => {
      if (err) {
        console.error('Error fetching orders:', err);
        return res.status(500).send('Database error');
      }
      const now = Date.now();
      const refundWindowMs = 3 * 24 * 60 * 60 * 1000;
      const decorated = (orders || []).map(order => {
        const createdAt = new Date(order.createdAt);
        const withinWindow = now - createdAt.getTime() <= refundWindowMs;
        const isRefundableMethod = order.paymentMethod === 'PayPal' || order.paymentMethod === 'Wallet';
        return {
          ...order,
          refundEligible: withinWindow && isRefundableMethod,
          refundStatus: order.refundStatus || null
        };
      });
      res.render('orders', {
        orders: decorated,
        user,
        success: req.flash('success'),
        error: req.flash('error')
      });
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
      OrderPayment.getByOrderId(orderId, (err, paymentFromDb) => {
        if (err) console.error('Error fetching order payment:', err);
        const paymentInfo = paymentFromDb || (req.session.orderPayments && req.session.orderPayments[data.order.id]) || null;
        const promoInfo = paymentInfo && paymentInfo.promo ? paymentInfo.promo : null;
        const promoAmount = promoInfo ? Number(promoInfo.amount || 0) : Number(paymentInfo && paymentInfo.promoAmount ? paymentInfo.promoAmount : 0);
        const promoCode = promoInfo ? promoInfo.code : (paymentInfo && paymentInfo.promoCode ? paymentInfo.promoCode : null);
        const subtotal = data.items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0);
        const taxableBase = Math.max(0, subtotal - promoAmount);
        const gstRate = GST_RATE;
        const deliveryRate = DELIVERY_RATE;
        const gst = Number((taxableBase * gstRate).toFixed(2));
        const deliveryFee = Number((taxableBase * deliveryRate).toFixed(2));
        const total = Number((taxableBase + gst + deliveryFee).toFixed(2));
        res.render('orderDetail', {
          order: data.order,
          items: data.items,
          user,
          paymentInfo,
          breakdown: { subtotal, gstRate, deliveryRate, gst, deliveryFee, total, promoAmount, promoCode }
        });
      });
    });
  }
};

module.exports = OrderController;
