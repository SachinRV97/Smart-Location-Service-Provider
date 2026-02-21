const Category = require('../models/Category');
const Location = require('../models/Location');
const Review = require('../models/Review');
const SearchLog = require('../models/SearchLog');
const Store = require('../models/Store');
const User = require('../models/User');
const { refreshStoreRating } = require('../services/storeRating');

function buildLastSixMonths() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = date.toISOString().slice(0, 7);
    months.push(month);
  }
  return months;
}

async function listPendingStores(req, res) {
  const stores = await Store.find({ status: 'Pending' }).sort({ createdAt: 1 });
  return res.json(stores);
}

async function listStores(req, res) {
  const stores = await Store.find().sort({ createdAt: -1 }).limit(200);
  return res.json(stores);
}

async function approveStore(req, res) {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'Approved' },
    { new: true }
  );
  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }
  return res.json(store);
}

async function rejectStore(req, res) {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'Rejected' },
    { new: true }
  );
  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }
  return res.json(store);
}

async function blockStore(req, res) {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { isBlocked: true },
    { new: true }
  );
  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }
  return res.json(store);
}

async function unblockStore(req, res) {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { isBlocked: false },
    { new: true }
  );
  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }
  return res.json(store);
}

async function listUsers(req, res) {
  const users = await User.find()
    .select('name email role phone isBlocked createdAt')
    .sort({ createdAt: -1 })
    .limit(250);
  return res.json(users);
}

async function blockUser(req, res) {
  const user = await User.findByIdAndUpdate(req.params.id, { isBlocked: true }, { new: true })
    .select('name email role phone isBlocked createdAt');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json(user);
}

async function unblockUser(req, res) {
  const user = await User.findByIdAndUpdate(req.params.id, { isBlocked: false }, { new: true })
    .select('name email role phone isBlocked createdAt');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json(user);
}

async function listPendingReviews(req, res) {
  const reviews = await Review.find({ status: 'Pending' })
    .populate('customer', 'name email')
    .populate('store', 'storeName city state')
    .sort({ createdAt: 1 })
    .limit(200);
  return res.json(reviews);
}

async function moderateReview(req, res) {
  const { status } = req.body || {};
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'status must be Approved or Rejected' });
  }

  const review = await Review.findByIdAndUpdate(
    req.params.id,
    {
      status,
      moderatedBy: req.user.id,
      moderatedAt: new Date()
    },
    { new: true }
  );
  if (!review) {
    return res.status(404).json({ message: 'Review not found' });
  }

  await refreshStoreRating(review.store);
  return res.json(review);
}

async function listCategories(req, res) {
  const categories = await Category.find().sort({ name: 1 });
  return res.json(categories);
}

async function createCategory(req, res) {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  const category = await Category.findOneAndUpdate(
    { name: String(name).trim() },
    { $setOnInsert: { name: String(name).trim(), isActive: true } },
    { upsert: true, new: true }
  );
  return res.status(201).json(category);
}

async function listLocations(req, res) {
  const locations = await Location.find().sort({ state: 1, city: 1 });
  return res.json(locations);
}

async function createLocation(req, res) {
  const { state, city } = req.body || {};
  if (!state || !city) {
    return res.status(400).json({ message: 'state and city are required' });
  }

  const location = await Location.findOneAndUpdate(
    { state: String(state).trim(), city: String(city).trim() },
    {
      $setOnInsert: {
        state: String(state).trim(),
        city: String(city).trim(),
        isActive: true
      }
    },
    { upsert: true, new: true }
  );
  return res.status(201).json(location);
}

async function dashboard(req, res) {
  const months = buildLastSixMonths();

  const [
    totalStores,
    activeStores,
    pendingStores,
    totalCustomers,
    searchesCount,
    totalReviews,
    mostSearchedCityAgg,
    mostViewedStore,
    storeGrowthAgg,
    customerGrowthAgg
  ] = await Promise.all([
    Store.countDocuments(),
    Store.countDocuments({ status: 'Approved', isBlocked: false }),
    Store.countDocuments({ status: 'Pending' }),
    User.countDocuments({ role: 'customer' }),
    SearchLog.countDocuments(),
    Review.countDocuments({ status: 'Approved' }),
    SearchLog.aggregate([
      { $match: { city: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]),
    Store.findOne({ status: 'Approved', isBlocked: false })
      .sort({ viewCount: -1 })
      .select('storeName city state viewCount'),
    Store.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      }
    ]),
    User.aggregate([
      { $match: { role: 'customer' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const storeGrowthMap = new Map(storeGrowthAgg.map((item) => [item._id, item.count]));
  const customerGrowthMap = new Map(customerGrowthAgg.map((item) => [item._id, item.count]));

  const monthlyGrowth = months.map((month) => ({
    month,
    stores: storeGrowthMap.get(month) || 0,
    customers: customerGrowthMap.get(month) || 0
  }));

  return res.json({
    totalStores,
    activeStores,
    pendingStores,
    totalCustomers,
    searchesCount,
    totalReviews,
    mostSearchedCity: mostSearchedCityAgg[0]
      ? { city: mostSearchedCityAgg[0]._id, count: mostSearchedCityAgg[0].count }
      : null,
    mostViewedStore: mostViewedStore
      ? {
          storeName: mostViewedStore.storeName,
          city: mostViewedStore.city,
          state: mostViewedStore.state,
          viewCount: mostViewedStore.viewCount
        }
      : null,
    monthlyGrowth
  });
}

module.exports = {
  listPendingStores,
  listStores,
  approveStore,
  rejectStore,
  blockStore,
  unblockStore,
  listUsers,
  blockUser,
  unblockUser,
  listPendingReviews,
  moderateReview,
  listCategories,
  createCategory,
  listLocations,
  createLocation,
  dashboard
};
