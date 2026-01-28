const express = require('express');
const WalletController = require('../controllers/WalletController');
const { checkAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/wallet', checkAuthenticated, WalletController.page);
router.post('/api/wallet/topup/create-order', checkAuthenticated, WalletController.createTopupOrder);
router.post('/api/wallet/topup/capture', checkAuthenticated, WalletController.captureTopup);

module.exports = router;
