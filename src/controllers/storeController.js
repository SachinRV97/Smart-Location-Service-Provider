const Category = require('../models/Category');
const Favorite = require('../models/Favorite');
const Location = require('../models/Location');
const Review = require('../models/Review');
const SearchLog = require('../models/SearchLog');
const Store = require('../models/Store');
const User = require('../models/User');
const { notifyUser } = require('../services/notificationService');

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildGeoPoint(payload) {
  const latitude = Number(payload.latitude ?? payload.lat);
  const longitude = Number(payload.longitude ?? payload.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
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

function toMinutesExpression(fieldPath) {
  return {
    $add: [
      {
        $multiply: [
          { $toInt: { $substrBytes: [fieldPath, 0, 2] } },
          60
        ]
      },
      { $toInt: { $substrBytes: [fieldPath, 3, 2] } }
    ]
  };
}

function buildOpenNowExpression(currentMinutes) {
  const opening = toMinutesExpression('$openingTime');
  const closing = toMinutesExpression('$closingTime');

  return {
    $let: {
      vars: {
        openingMinutes: opening,
        closingMinutes: closing
      },
      in: {
        $cond: [
          { $lte: ['$$openingMinutes', '$$closingMinutes'] },
          {
            $and: [
              { $lte: ['$$openingMinutes', currentMinutes] },
              { $gte: ['$$closingMinutes', currentMinutes] }
            ]
          },
          {
            $or: [
              { $lte: ['$$openingMinutes', currentMinutes] },
              { $gte: ['$$closingMinutes', currentMinutes] }
            ]
          }
        ]
      }
    }
  };
}

function parseLimit(value, fallback = 20) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(numeric), 1), 100);
}

async function notifyAdminsAboutNewStore(store) {
  const admins = await User.find({ role: 'admin', isBlocked: false }).select('_id email');
  if (!admins.length) {
    return;
  }

  await Promise.all(
    admins.map((admin) =>
      notifyUser({
        userId: admin._id,
        email: admin.email,
        type: 'store_submitted',
        title: 'New store registration pending approval',
        message: `${store.storeName} (${store.city}, ${store.state}) was submitted and is waiting for approval.`,
        metadata: {
          storeId: String(store._id)
        },
        sendEmail: true
      })
    )
  ).catch(() => {});
}

async function registerStore(req, res) {
  const payload = req.body || {};
  const requiredFields = [
    'storeName',
    'ownerName',
    'email',
    'phone',
    'state',
    'city',
    'fullAddress',
    'category',
    'openingTime',
    'closingTime',
    'latitude',
    'longitude'
  ];

  const missingFields = requiredFields.filter((field) => !normalizeText(payload[field]));
  if (missingFields.length) {
    return res.status(400).json({
      message: `Missing required fields: ${missingFields.join(', ')}`
    });
  }

  const ownerName = normalizeText(payload.ownerName || req.user.name);
  const email = normalizeText(payload.email || req.user.email).toLowerCase();
  const phone = normalizeText(payload.phone);
  const openingTime = normalizeText(payload.openingTime);
  const closingTime = normalizeText(payload.closingTime);

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }
  if (!TIME_24H_REGEX.test(openingTime) || !TIME_24H_REGEX.test(closingTime)) {
    return res
      .status(400)
      .json({ message: 'openingTime and closingTime must use HH:MM 24-hour format' });
  }
  if (phone.length < 7) {
    return res.status(400).json({ message: 'Invalid phone number' });
  }

  const location = buildGeoPoint(payload);
  if (!location) {
    return res.status(400).json({
      message: 'Valid latitude and longitude are required'
    });
  }

  const store = await Store.create({
    storeName: normalizeText(payload.storeName),
    owner: req.user.id,
    ownerName,
    email,
    phone,
    state: normalizeText(payload.state),
    city: normalizeText(payload.city),
    fullAddress: normalizeText(payload.fullAddress),
    location,
    category: normalizeText(payload.category),
    openingTime,
    closingTime,
    description: normalizeText(payload.description),
    images: parseImages(payload),
    gst: normalizeText(payload.gst),
    status: 'Pending'
  });

  const postSaveTasks = await Promise.allSettled([
    Category.updateOne(
      { name: store.category },
      { $setOnInsert: { name: store.category, isActive: true } },
      { upsert: true }
    ),
    Location.updateOne(
      { state: store.state, city: store.city },
      { $setOnInsert: { state: store.state, city: store.city, isActive: true } },
      { upsert: true }
    ),
    notifyAdminsAboutNewStore(store)
  ]);

  postSaveTasks.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('registerStore post-save task failed:', result.reason?.message || result.reason);
    }
  });

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
    limit
  } = req.query;

  const safeLimit = parseLimit(limit, 20);
  const query = { status: 'Approved', isBlocked: false };

  if (normalizeText(state)) query.state = normalizeText(state);
  if (normalizeText(city)) query.city = normalizeText(city);
  if (normalizeText(category)) query.category = normalizeText(category);

  if (normalizeText(q)) {
    const escapedQuery = escapeRegex(normalizeText(q));
    query.$or = [
      { storeName: { $regex: escapedQuery, $options: 'i' } },
      { ownerName: { $regex: escapedQuery, $options: 'i' } },
      { city: { $regex: escapedQuery, $options: 'i' } },
      { state: { $regex: escapedQuery, $options: 'i' } },
      { category: { $regex: escapedQuery, $options: 'i' } }
    ];
  }

  if (normalizeBoolean(openNow)) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    query.openingTime = { $regex: TIME_24H_REGEX };
    query.closingTime = { $regex: TIME_24H_REGEX };
    query.$expr = buildOpenNowExpression(currentMinutes);
  }

  const parsedLat = Number(nearestLat);
  const parsedLng = Number(nearestLng);
  const hasNearest = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  const shouldSortTopRated = normalizeBoolean(topRated);
  const shouldSortNearest = normalizeBoolean(nearestFirst) || hasNearest;

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
    } else if (shouldSortNearest) {
      pipeline.push({ $sort: { distanceMeters: 1, ratingAverage: -1 } });
    } else {
      pipeline.push({ $sort: { createdAt: -1 } });
    }

    pipeline.push({ $limit: safeLimit });
    stores = await Store.aggregate(pipeline);
  } else {
    let storeQuery = Store.find(query).limit(safeLimit);
    if (shouldSortTopRated) {
      storeQuery = storeQuery.sort({ ratingAverage: -1, ratingCount: -1, createdAt: -1 });
    } else if (shouldSortNearest) {
      storeQuery = storeQuery.sort({ ratingAverage: -1, ratingCount: -1, createdAt: -1 });
    } else {
      storeQuery = storeQuery.sort({ createdAt: -1 });
    }
    stores = await storeQuery;
  }

  SearchLog.create({
    customer: req.user?.id || undefined,
    query: normalizeText(q),
    state: normalizeText(state),
    city: normalizeText(city),
    category: normalizeText(category)
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
