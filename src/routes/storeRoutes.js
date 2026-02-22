const express = require('express');
const {
  getStoreById,
  listMyStores,
  registerStore,
  searchStores
} = require('../controllers/storeController');
const { authenticate, optionalAuthenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuthenticate, searchStores);
router.get('/mine', authenticate, authorize('owner'), listMyStores);
router.get('/:id', optionalAuthenticate, getStoreById);
router.post('/', authenticate, authorize('owner'), registerStore);

module.exports = router;

