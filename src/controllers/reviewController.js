const Review = require('../models/Review');
const Store = require('../models/Store');
const { refreshStoreRating } = require('../services/storeRating');
const { notifyUser } = require('../services/notificationService');

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

  const store = await Store.findById(req.params.storeId)
    .populate('owner', 'name email')
    .select('status isBlocked owner storeName city state');
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

  if (store.owner?._id) {
    await notifyUser({
      userId: store.owner._id,
      email: store.owner.email,
      type: 'review_added',
      title: 'New store review submitted',
      message: `A customer submitted a ${numericRating.toFixed(1)}/5 review for ${store.storeName}. It is waiting for admin moderation.`,
      metadata: {
        storeId: String(store._id),
        reviewId: String(review._id)
      },
      sendEmail: true
    }).catch(() => {});
  }

  return res.status(201).json(review);
}

module.exports = {
  listStoreReviews,
  addOrUpdateReview
};
