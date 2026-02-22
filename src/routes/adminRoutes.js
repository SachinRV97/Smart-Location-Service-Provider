const express = require('express');
const {
  approveStore,
  blockUser,
  blockStore,
  createCategory,
  createLocation,
  deleteCategory,
  deleteLocation,
  dashboard,
  listCategories,
  listLocations,
  listPendingReviews,
  listPendingStores,
  listStores,
  listUsers,
  moderateReview,
  resetOwnerPassword,
  rejectStore,
  updateCategory,
  updateLocation,
  unblockStore,
  unblockUser
} = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('admin'));
router.get('/dashboard', dashboard);
router.get('/stores', listStores);
router.get('/stores/pending', listPendingStores);
router.patch('/stores/:id/approve', approveStore);
router.patch('/stores/:id/reject', rejectStore);
router.patch('/stores/:id/block', blockStore);
router.patch('/stores/:id/unblock', unblockStore);

router.get('/users', listUsers);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/unblock', unblockUser);
router.patch('/users/:id/reset-password', resetOwnerPassword);

router.get('/reviews/pending', listPendingReviews);
router.patch('/reviews/:id/moderate', moderateReview);

router.get('/categories', listCategories);
router.post('/categories', createCategory);
router.patch('/categories/:id', updateCategory);
router.put('/categories/:id', updateCategory);
router.post('/categories/:id/update', updateCategory);
router.delete('/categories/:id', deleteCategory);
router.post('/categories/:id/delete', deleteCategory);
router.get('/locations', listLocations);
router.post('/locations', createLocation);
router.patch('/locations/:id', updateLocation);
router.put('/locations/:id', updateLocation);
router.post('/locations/:id/update', updateLocation);
router.delete('/locations/:id', deleteLocation);
router.post('/locations/:id/delete', deleteLocation);

module.exports = router;
