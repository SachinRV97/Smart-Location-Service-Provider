const Review = require('../models/Review');
const Store = require('../models/Store');

async function refreshStoreRating(storeId) {
  const aggregates = await Review.aggregate([
    { $match: { store: storeId, status: 'Approved' } },
    {
      $group: {
        _id: '$store',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  if (!aggregates.length) {
    await Store.findByIdAndUpdate(storeId, {
      ratingAverage: 0,
      ratingCount: 0
    });
    return;
  }

  await Store.findByIdAndUpdate(storeId, {
    ratingAverage: Number(aggregates[0].averageRating.toFixed(2)),
    ratingCount: aggregates[0].totalReviews
  });
}

module.exports = { refreshStoreRating };
