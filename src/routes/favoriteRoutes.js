const express = require('express');
const {
  addFavorite,
  removeFavorite,
  listMyFavorites
} = require('../controllers/favoriteController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('customer'));
router.get('/me', listMyFavorites);
router.post('/:storeId', addFavorite);
router.delete('/:storeId', removeFavorite);

module.exports = router;
