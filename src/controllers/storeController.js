const Category = require('../models/Category');
const Favorite = require('../models/Favorite');
const Location = require('../models/Location');
const Review = require('../models/Review');
const SearchLog = require('../models/SearchLog');
const Store = require('../models/Store');

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function buildGeoPoint(payload) {
  const latitude = Number(payload.latitude ?? payload.lat);
  const longitude = Number(payload.longitude ?? payload.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    type: 'Point',
    coordinates: [longitude, latitude]
  };
}

function parseImages(payload) {
  if (Array.isArray(payload.images)) {
    return payload.images.filter(Boolean).map((item) => String(item).trim());
  }
  if (typeof payload.images === 'string') {
    return payload.images
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

async function registerStore(req, res) {
  const payload = req.body || {};
  const requiredFields = ['storeName', 'city', 'state', 'category', 'fullAddress', 'phone'];
  const missingFields = requiredFields.filter((field) => !payload[field]);

  if (missingFields.length) {
    return res.status(400).json({
      message: `Missing required fields: ${missingFields.join(', ')}`
    });
  }

  const location = buildGeoPoint(payload);
  const ownerName = payload.ownerName || req.user.name;
  const email = (payload.email || req.user.email || '').toLowerCase();

  const store = await Store.create({
    storeName: payload.storeName,
    owner: req.user.id,
    ownerName,
    email,
    phone: payload.phone,
    state: payload.state,
    city: payload.city,
    fullAddress: payload.fullAddress,
    location,
    category: payload.category,
    openingTime: payload.openingTime,
    closingTime: payload.closingTime,
    description: payload.description,
    images: parseImages(payload),
    gst: payload.gst,
    status: 'Pending'
  });

  await Promise.all([
    Category.updateOne(
      { name: store.category },
      { $setOnInsert: { name: store.category } },
      { upsert: true }
    ),
    Location.updateOne(
      { state: store.state, city: store.city },
      { $setOnInsert: { state: store.state, city: store.city } },
      { upsert: true }
    )
  ]);

  return res.status(201).json(store);
}

async function searchStores(req, res) {
  const {
    state,
    city,
    q,
    category,
    openNow,
    topRated,
    nearestLat,
    nearestLng,
    nearestFirst,
    limit = 20
  } = req.query;

  const safeLimit = Math.min(Number(limit) || 20, 100);
  const query = { status: 'Approved', isBlocked: false };

  if (state) query.state = state;
  if (city) query.city = city;
  if (category) query.category = category;
  if (q) {
    query.$or = [
      { storeName: { $regex: q, $options: 'i' } },
      { city: { $regex: q, $options: 'i' } },
      { state: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } }
    ];
  }

  if (normalizeBoolean(openNow)) {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    query.openingTime = { $lte: hhmm };
    query.closingTime = { $gte: hhmm };
  }

  const parsedLat = Number(nearestLat);
  const parsedLng = Number(nearestLng);
  const hasNearest = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  const shouldSortTopRated = normalizeBoolean(topRated);

  let stores;
  if (hasNearest) {
    const pipeline = [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [parsedLng, parsedLat]
          },
          distanceField: 'distanceMeters',
          query,
          spherical: true
        }
      }
    ];

    if (shouldSortTopRated) {
      pipeline.push({
        $sort: {
          ratingAverage: -1,
          ratingCount: -1,
          distanceMeters: 1
        }
      });
    } else if (normalizeBoolean(nearestFirst) || hasNearest) {
      pipeline.push({ $sort: { distanceMeters: 1 } });
    } else {
      pipeline.push({ $sort: { createdAt: -1 } });
    }

    pipeline.push({ $limit: safeLimit });
    stores = await Store.aggregate(pipeline);
  } else {
    let storeQuery = Store.find(query).limit(safeLimit);
    if (shouldSortTopRated) {
      storeQuery = storeQuery.sort({ ratingAverage: -1, ratingCount: -1 });
    } else {
      storeQuery = storeQuery.sort({ createdAt: -1 });
    }
    stores = await storeQuery;
  }

  SearchLog.create({
    customer: req.user?.id || undefined,
    query: q,
    state,
    city,
    category
  }).catch(() => {});

  return res.json(stores);
}

async function listMyStores(req, res) {
  const query = req.user.role === 'admin' ? {} : { owner: req.user.id };
  const stores = await Store.find(query).sort({ createdAt: -1 });
  return res.json(stores);
}

async function getStoreById(req, res) {
  const baseQuery = { _id: req.params.id };

  if (!req.user || req.user.role === 'customer') {
    baseQuery.status = 'Approved';
    baseQuery.isBlocked = false;
  } else if (req.user.role === 'owner') {
    baseQuery.$or = [
      { status: 'Approved', isBlocked: false },
      { owner: req.user.id }
    ];
  }

  const store = await Store.findOne(baseQuery).lean();
  if (!store) {
    return res.status(404).json({ message: 'Store not found' });
  }

  if (store.status === 'Approved' && !store.isBlocked) {
    await Store.findByIdAndUpdate(store._id, { $inc: { viewCount: 1 } });
    store.viewCount = (store.viewCount || 0) + 1;
  }

  const reviews = await Review.find({ store: store._id, status: 'Approved' })
    .populate('customer', 'name')
    .sort({ createdAt: -1 })
    .lean();

  let isFavorite = false;
  if (req.user && req.user.role === 'customer') {
    const favorite = await Favorite.findOne({
      customer: req.user.id,
      store: store._id
    }).lean();
    isFavorite = Boolean(favorite);
  }

  return res.json({
    ...store,
    isFavorite,
    reviews
  });
}

module.exports = {
  registerStore,
  searchStores,
  listMyStores,
  getStoreById
};
