const express = require('express');
const AdminController = require('../controllers/AdminController');
const { checkAuthenticated, checkAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/admin/users', checkAuthenticated, checkAdmin, AdminController.listUsers);
router.get('/admin/users/:id/orders', checkAuthenticated, checkAdmin, AdminController.userOrders);
router.post('/admin/users/:id/delete', checkAuthenticated, checkAdmin, AdminController.deleteUser);
router.get('/admin/users/:id/delete', checkAuthenticated, checkAdmin, AdminController.deleteUser);

module.exports = router;
