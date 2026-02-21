const express = require('express');
const { addOrUpdateReview, listStoreReviews } = require('../controllers/reviewController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/:storeId', listStoreReviews);
router.post('/:storeId', authenticate, authorize('customer'), addOrUpdateReview);

module.exports = router;
