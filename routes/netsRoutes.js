const express = require('express');
const NetsController = require('../controllers/NetsController');
const { checkAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.post('/nets/qr', checkAuthenticated, NetsController.generateQr);
router.get('/sse/payment-status/:txnRetrievalRef', checkAuthenticated, NetsController.streamPaymentStatus);
router.get('/nets-qr/success', checkAuthenticated, NetsController.success);
router.get('/nets-qr/fail', checkAuthenticated, NetsController.fail);

module.exports = router;
