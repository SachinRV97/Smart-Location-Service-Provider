const Review = require('../models/Review');
const Store = require('../models/Store');
const { refreshStoreRating } = require('../services/storeRating');

async function listStoreReviews(req, res) {
  const store = await Store.findById(req.params.storeId).select('status isBlocked');
  if (!store || store.status !== 'Approved' || store.isBlocked) {
    return res.status(404).json({ message: 'Store not found' });
  }

  const reviews = await Review.find({ store: req.params.storeId, status: 'Approved' })
    .populate('customer', 'name')
    .sort({ createdAt: -1 });

  return res.json(reviews);
}

async function addOrUpdateReview(req, res) {
  const { rating, comment } = req.body || {};
  const numericRating = Number(rating);

  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ message: 'rating must be between 1 and 5' });
  }

  const store = await Store.findById(req.params.storeId).select('status isBlocked');
  if (!store || store.status !== 'Approved' || store.isBlocked) {
    return res.status(404).json({ message: 'Store not found' });
  }

  const review = await Review.findOneAndUpdate(
    { store: req.params.storeId, customer: req.user.id },
    {
      store: req.params.storeId,
      customer: req.user.id,
      rating: numericRating,
      comment,
      status: 'Pending',
      moderatedBy: null,
      moderatedAt: null
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await refreshStoreRating(store._id);
  return res.status(201).json(review);
}

module.exports = {
  listStoreReviews,
  addOrUpdateReview
};
