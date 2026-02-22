const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Category = require('../models/Category');
const Location = require('../models/Location');
const Review = require('../models/Review');
const SearchLog = require('../models/SearchLog');
const Store = require('../models/Store');
const User = require('../models/User');
const { notifyUser } = require('../services/notificationService');
const { refreshStoreRating } = require('../services/storeRating');

function normalizeText(value) {
  return String(value || '').trim();
}

function createTemporaryOwnerPassword() {
  const randomPart = crypto.randomBytes(8).toString('hex').slice(0, 8);
  return `Owner@${randomPart}`;
}

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

async function notifyStoreOwner(store, details) {
  if (!store?.owner?._id) {
    return;
  }

  await notifyUser({
    userId: store.owner._id,
    email: store.owner.email,
    type: details.type,
    title: details.title,
    message: details.message,
    metadata: {
      storeId: String(store._id)
    },
    sendEmail: true
  }).catch(() => {});
}

async function listPendingStores(req, res) {
  const stores = await Store.find({ status: 'Pending' })
    .populate('owner', 'name email')
    .sort({ createdAt: 1 });
  return res.json(stores);
}

async function listStores(req, res) {
  const query = {};
  if (normalizeText(req.query.status)) {
    query.status = normalizeText(req.query.status);
  }
  if (req.query.isBlocked === 'true') {
    query.isBlocked = true;
  } else if (req.query.isBlocked === 'false') {
    query.isBlocked = false;
  }

  const stores = await Store.find(query)
    .populate('owner', 'name email')
    .sort({ createdAt: -1 })
    .limit(300);
  return res.json(stores);
}

async function approveStore(req, res) {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    {
      status: 'Approved',
      isBlocked: false
    },
    { new: true }
  ).populate('owner', 'name email');

  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }

  await notifyStoreOwner(store, {
    type: 'store_approved',
    title: 'Store approved',
    message: `${store.storeName} has been approved and is now visible to customers.`
  });

  return res.json(store);
}

async function rejectStore(req, res) {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'Rejected' },
    { new: true }
  ).populate('owner', 'name email');

  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }

  await notifyStoreOwner(store, {
    type: 'store_rejected',
    title: 'Store rejected',
    message: `${store.storeName} was rejected by admin. Please review details and resubmit if needed.`
  });

  return res.json(store);
}

async function blockStore(req, res) {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { isBlocked: true },
    { new: true }
  ).populate('owner', 'name email');

  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }

  await notifyStoreOwner(store, {
    type: 'store_blocked',
    title: 'Store blocked',
    message: `${store.storeName} has been blocked by admin and is hidden from customers.`
  });

  return res.json(store);
}

async function unblockStore(req, res) {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { isBlocked: false },
    { new: true }
  ).populate('owner', 'name email');

  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }

  await notifyStoreOwner(store, {
    type: 'store_unblocked',
    title: 'Store unblocked',
    message: `${store.storeName} has been unblocked by admin.`
  });

  return res.json(store);
}

async function listUsers(req, res) {
  const query = {};
  if (normalizeText(req.query.role)) {
    query.role = normalizeText(req.query.role);
  }

  const users = await User.find(query)
    .select('name email role phone isBlocked createdAt')
    .sort({ createdAt: -1 })
    .limit(300);
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

async function resetOwnerPassword(req, res) {
  const user = await User.findById(req.params.id).select('name email role isBlocked passwordHash');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (user.role !== 'owner') {
    return res.status(400).json({ message: 'Password reset is allowed only for owner accounts' });
  }

  const temporaryPassword = createTemporaryOwnerPassword();
  user.passwordHash = await bcrypt.hash(temporaryPassword, 12);
  await user.save();

  await notifyUser({
    userId: user._id,
    email: user.email,
    type: 'system',
    title: 'Password reset by admin',
    message: 'Your account password was reset by admin. Contact admin for your temporary password.',
    metadata: {
      reason: 'admin_password_reset'
    },
    sendEmail: true
  }).catch(() => {});

  return res.json({
    message: 'Owner password reset successfully',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    temporaryPassword
  });
}

async function listPendingReviews(req, res) {
  const reviews = await Review.find({ status: 'Pending' })
    .populate('customer', 'name email')
    .populate('store', 'storeName city state owner')
    .sort({ createdAt: 1 })
    .limit(250);
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
  )
    .populate('customer', 'name email')
    .populate({
      path: 'store',
      select: 'storeName owner',
      populate: {
        path: 'owner',
        select: 'name email'
      }
    });

  if (!review) {
    return res.status(404).json({ message: 'Review not found' });
  }

  const resolvedStoreId =
    review.store && typeof review.store === 'object' && review.store._id
      ? review.store._id
      : review.store;
  await refreshStoreRating(resolvedStoreId);

  if (review.customer?._id) {
    await notifyUser({
      userId: review.customer._id,
      email: review.customer.email,
      type: 'review_moderated',
      title: `Review ${status.toLowerCase()}`,
      message: `Your review for ${review.store?.storeName || 'the store'} was ${status.toLowerCase()} by admin.`,
      metadata: {
        reviewId: String(review._id),
        storeId: String(resolvedStoreId)
      },
      sendEmail: true
    }).catch(() => {});
  }

  if (review.store?.owner?._id) {
    await notifyUser({
      userId: review.store.owner._id,
      email: review.store.owner.email,
      type: 'review_moderated',
      title: `Review ${status.toLowerCase()} for your store`,
      message: `A review for ${review.store.storeName} was ${status.toLowerCase()} by admin.`,
      metadata: {
        reviewId: String(review._id),
        storeId: String(resolvedStoreId)
      },
      sendEmail: status === 'Approved'
    }).catch(() => {});
  }

  return res.json(review);
}

async function listCategories(req, res) {
  const categories = await Category.find().sort({ name: 1 });
  return res.json(categories);
}

async function createCategory(req, res) {
  const name = normalizeText(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  const category = await Category.findOneAndUpdate(
    { name },
    { $setOnInsert: { name, isActive: true } },
    { upsert: true, new: true }
  );
  return res.status(201).json(category);
}

async function updateCategory(req, res) {
  const name = normalizeText(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  const existingByName = await Category.findOne({ name }).select('_id');
  if (existingByName && String(existingByName._id) !== req.params.id) {
    return res.status(409).json({ message: 'Category name already exists' });
  }

  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { name, isActive: true },
    { new: true, runValidators: true }
  );

  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }

  return res.json(category);
}

async function deleteCategory(req, res) {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }
  return res.json({ message: 'Category deleted' });
}

async function listLocations(req, res) {
  const locations = await Location.find().sort({ state: 1, city: 1 });
  return res.json(locations);
}

async function createLocation(req, res) {
  const state = normalizeText(req.body?.state);
  const city = normalizeText(req.body?.city);
  if (!state || !city) {
    return res.status(400).json({ message: 'state and city are required' });
  }

  const location = await Location.findOneAndUpdate(
    { state, city },
    {
      $setOnInsert: {
        state,
        city,
        isActive: true
      }
    },
    { upsert: true, new: true }
  );
  return res.status(201).json(location);
}

async function updateLocation(req, res) {
  const state = normalizeText(req.body?.state);
  const city = normalizeText(req.body?.city);
  if (!state || !city) {
    return res.status(400).json({ message: 'state and city are required' });
  }

  const existing = await Location.findOne({ state, city }).select('_id');
  if (existing && String(existing._id) !== req.params.id) {
    return res.status(409).json({ message: 'Location already exists' });
  }

  const location = await Location.findByIdAndUpdate(
    req.params.id,
    { state, city, isActive: true },
    { new: true, runValidators: true }
  );

  if (!location) {
    return res.status(404).json({ message: 'Location not found' });
  }

  return res.json(location);
}

async function deleteLocation(req, res) {
  const location = await Location.findByIdAndDelete(req.params.id);
  if (!location) {
    return res.status(404).json({ message: 'Location not found' });
  }
  return res.json({ message: 'Location deleted' });
}

async function dashboard(req, res) {
  const months = buildLastSixMonths();

  const [
    totalStores,
    activeStores,
    pendingStores,
    totalCustomers,
    totalOwners,
    searchesCount,
    approvedReviews,
    pendingReviews,
    blockedStores,
    blockedUsers,
    mostSearchedCityAgg,
    mostViewedStore,
    storeGrowthAgg,
    customerGrowthAgg,
    topCategoriesAgg
  ] = await Promise.all([
    Store.countDocuments(),
    Store.countDocuments({ status: 'Approved', isBlocked: false }),
    Store.countDocuments({ status: 'Pending' }),
    User.countDocuments({ role: 'customer' }),
    User.countDocuments({ role: 'owner' }),
    SearchLog.countDocuments(),
    Review.countDocuments({ status: 'Approved' }),
    Review.countDocuments({ status: 'Pending' }),
    Store.countDocuments({ isBlocked: true }),
    User.countDocuments({ isBlocked: true }),
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
    ]),
    Store.aggregate([
      { $match: { status: 'Approved', isBlocked: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ])
  ]);

  const storeGrowthMap = new Map(storeGrowthAgg.map((item) => [item._id, item.count]));
  const customerGrowthMap = new Map(customerGrowthAgg.map((item) => [item._id, item.count]));

  const monthlyGrowth = months.map((month) => ({
    month,
    stores: storeGrowthMap.get(month) || 0,
    customers: customerGrowthMap.get(month) || 0
  }));

  const mostSearchedCity = mostSearchedCityAgg[0]
    ? { city: mostSearchedCityAgg[0]._id, count: mostSearchedCityAgg[0].count }
    : null;
  const resolvedMostViewedStore = mostViewedStore
    ? {
        storeName: mostViewedStore.storeName,
        city: mostViewedStore.city,
        state: mostViewedStore.state,
        viewCount: mostViewedStore.viewCount
      }
    : null;

  return res.json({
    totalStores,
    activeStores,
    pendingStores,
    totalCustomers,
    totalOwners,
    searchesCount,
    totalReviews: approvedReviews,
    approvedReviews,
    pendingReviews,
    blockedStores,
    blockedUsers,
    mostSearchedCity,
    mostViewedStore: resolvedMostViewedStore,
    monthlyGrowth,
    topCategories: topCategoriesAgg.map((item) => ({
      category: item._id || 'Uncategorized',
      count: item.count
    })),
    totals: {
      stores: totalStores,
      activeStores,
      pendingStores,
      customers: totalCustomers,
      owners: totalOwners,
      searches: searchesCount,
      approvedReviews,
      pendingReviews,
      blockedStores,
      blockedUsers
    },
    highlights: {
      mostSearchedCity,
      mostViewedStore: resolvedMostViewedStore
    }
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
  resetOwnerPassword,
  listPendingReviews,
  moderateReview,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  dashboard
};
