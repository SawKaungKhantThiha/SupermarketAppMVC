const Order = require('../models/Order');
const OrderPayment = require('../models/OrderPayment');
const RefundRequest = require('../models/RefundRequest');
const paypal = require('../services/paypal');

const REFUND_WINDOW_DAYS = 3;
const refundWindowMs = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const RefundController = {
  request(req, res) {
    const user = req.session.user;
    const orderId = Number(req.params.id);
    const reason = (req.body.reason || '').trim();
    if (!orderId) {
      req.flash('error', 'Invalid order.');
      return res.redirect('/orders');
    }

    Order.getById(orderId, (err, order) => {
      if (err) {
        console.error('Error fetching order:', err);
        req.flash('error', 'Could not load order.');
        return res.redirect('/orders');
      }
      if (!order || order.userId !== user.id) {
        req.flash('error', 'Order not found.');
        return res.redirect('/orders');
      }
      const createdAt = new Date(order.createdAt);
      if (Date.now() - createdAt.getTime() > refundWindowMs) {
        req.flash('error', 'Refund window has expired (3 days).');
        return res.redirect('/orders');
      }

      RefundRequest.getByOrderId(orderId, (err, existing) => {
        if (err) {
          console.error('Error checking refund request:', err);
          req.flash('error', 'Could not request refund.');
          return res.redirect('/orders');
        }
        if (existing) {
          req.flash('error', 'Refund already requested for this order.');
          return res.redirect('/orders');
        }

        OrderPayment.getByOrderId(orderId, (err, paymentInfo) => {
          if (err) console.error('Error checking payment info:', err);
          if (!paymentInfo || paymentInfo.method !== 'PayPal' || !paymentInfo.paypalCaptureId) {
            req.flash('error', 'Refunds are only available for PayPal payments.');
            return res.redirect('/orders');
          }

          RefundRequest.create(orderId, user.id, reason, (err) => {
            if (err) {
              console.error('Error creating refund request:', err);
              req.flash('error', 'Could not submit refund request.');
              return res.redirect('/orders');
            }
            req.flash('success', 'Refund request submitted.');
            return res.redirect('/orders');
          });
        });
      });
    });
  },

  list(req, res) {
    RefundRequest.getAllWithDetails((err, requests) => {
      if (err) {
        console.error('Error fetching refund requests:', err);
        return res.status(500).send('Database error');
      }
      res.render('adminRefundRequests', {
        user: req.session.user,
        requests,
        success: req.flash('success'),
        error: req.flash('error')
      });
    });
  },

  approve(req, res) {
    const admin = req.session.user;
    const requestId = Number(req.params.id);
    if (!requestId) {
      req.flash('error', 'Invalid refund request.');
      return res.redirect('/admin/refund-requests');
    }
    RefundRequest.getByIdWithDetails(requestId, async (err, request) => {
      if (err) {
        console.error('Error fetching refund request:', err);
        req.flash('error', 'Could not load refund request.');
        return res.redirect('/admin/refund-requests');
      }
      if (!request || request.status !== 'pending') {
        req.flash('error', 'Refund request is not pending.');
        return res.redirect('/admin/refund-requests');
      }

      try {
        let refundId = null;
        let refundedAmount = null;
        if (request.method === 'PayPal' && !request.paypalCaptureId) {
          req.flash('error', 'Missing PayPal capture ID for this order.');
          return res.redirect('/admin/refund-requests');
        }
        if (request.method === 'PayPal' && request.paypalCaptureId) {
          const refund = await paypal.refundCapture(request.paypalCaptureId, request.total);
          refundId = refund && refund.id ? refund.id : null;
          refundedAmount = request.total;
        }
        RefundRequest.updateStatus(requestId, 'approved', admin.id, { paypalRefundId: refundId, refundedAmount }, (err) => {
          if (err) {
            console.error('Error updating refund request:', err);
            req.flash('error', 'Could not approve refund request.');
            return res.redirect('/admin/refund-requests');
          }
          req.flash('success', `Refund approved for order #${request.orderId}.`);
          return res.redirect('/admin/refund-requests');
        });
      } catch (err) {
        console.error('Error processing PayPal refund:', err);
        req.flash('error', 'PayPal refund failed. Please try again.');
        return res.redirect('/admin/refund-requests');
      }
    });
  },

  reject(req, res) {
    const admin = req.session.user;
    const requestId = Number(req.params.id);
    if (!requestId) {
      req.flash('error', 'Invalid refund request.');
      return res.redirect('/admin/refund-requests');
    }
    RefundRequest.getByIdWithDetails(requestId, (err, request) => {
      if (err) {
        console.error('Error fetching refund request:', err);
        req.flash('error', 'Could not load refund request.');
        return res.redirect('/admin/refund-requests');
      }
      if (!request || request.status !== 'pending') {
        req.flash('error', 'Refund request is not pending.');
        return res.redirect('/admin/refund-requests');
      }
      RefundRequest.updateStatus(requestId, 'rejected', admin.id, { paypalRefundId: null, refundedAmount: null }, (err) => {
        if (err) {
          console.error('Error updating refund request:', err);
          req.flash('error', 'Could not reject refund request.');
          return res.redirect('/admin/refund-requests');
        }
        req.flash('success', `Refund rejected for order #${request.orderId}.`);
        return res.redirect('/admin/refund-requests');
      });
    });
  }
};

module.exports = RefundController;
