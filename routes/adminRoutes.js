const express = require('express');
const AdminController = require('../controllers/AdminController');
const RefundController = require('../controllers/RefundController');
const { checkAuthenticated, checkAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/admin/users', checkAuthenticated, checkAdmin, AdminController.listUsers);
router.get('/admin/users/:id/orders', checkAuthenticated, checkAdmin, AdminController.userOrders);
router.get('/admin/users/add', checkAuthenticated, checkAdmin, AdminController.addUserForm);
router.post('/admin/users/add', checkAuthenticated, checkAdmin, AdminController.addUser);
router.get('/admin/users/:id/edit', checkAuthenticated, checkAdmin, AdminController.editUserForm);
router.post('/admin/users/:id/edit', checkAuthenticated, checkAdmin, AdminController.editUser);
router.post('/admin/users/:id/delete', checkAuthenticated, checkAdmin, AdminController.deleteUser);
router.get('/admin/users/:id/delete', checkAuthenticated, checkAdmin, AdminController.deleteUser);
router.get('/admin/audit-log', checkAuthenticated, checkAdmin, AdminController.auditLog);
router.get('/admin/dashboard', checkAuthenticated, checkAdmin, AdminController.dashboard);
router.get('/admin/refund-requests', checkAuthenticated, checkAdmin, RefundController.list);
router.post('/admin/refund-requests/:id/approve', checkAuthenticated, checkAdmin, RefundController.approve);
router.post('/admin/refund-requests/:id/reject', checkAuthenticated, checkAdmin, RefundController.reject);

module.exports = router;
