const express = require('express');
const {
  approveStore,
  blockStore,
  dashboard,
  listPendingStores,
  rejectStore
} = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('admin'));
router.get('/dashboard', dashboard);
router.get('/stores/pending', listPendingStores);
router.patch('/stores/:id/approve', approveStore);
router.patch('/stores/:id/reject', rejectStore);
router.patch('/stores/:id/block', blockStore);

module.exports = router;
