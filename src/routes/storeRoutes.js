const express = require('express');
const { getStoreById, registerStore, searchStores } = require('../controllers/storeController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', searchStores);
router.get('/:id', getStoreById);
router.post('/', authenticate, authorize('owner', 'admin'), registerStore);

module.exports = router;
