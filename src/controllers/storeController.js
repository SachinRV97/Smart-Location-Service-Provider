const Store = require('../models/Store');

async function registerStore(req, res) {
  const payload = req.body;

  if (!payload.storeName || !payload.city || !payload.state || !payload.category) {
    return res.status(400).json({ message: 'storeName, city, state and category are required' });
  }

  const store = await Store.create({
    ...payload,
    owner: req.user.id,
    status: 'Pending'
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
    limit = 20
  } = req.query;

  const query = { status: 'Approved', isBlocked: false };
  if (state) query.state = state;
  if (city) query.city = city;
  if (category) query.category = category;
  if (q) query.$text = { $search: q };

  const now = new Date();
  if (openNow === 'true') {
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    query.openingTime = { $lte: hhmm };
    query.closingTime = { $gte: hhmm };
  }

  let storeQuery = Store.find(query).limit(Number(limit));

  if (topRated === 'true') {
    storeQuery = storeQuery.sort({ ratingAverage: -1, ratingCount: -1 });
  } else {
    storeQuery = storeQuery.sort({ createdAt: -1 });
  }

  if (nearestLat && nearestLng) {
    storeQuery = Store.find({
      ...query,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [Number(nearestLng), Number(nearestLat)]
          }
        }
      }
    }).limit(Number(limit));
  }

  const stores = await storeQuery;
  return res.json(stores);
}

async function getStoreById(req, res) {
  const store = await Store.findById(req.params.id);
  if (!store || store.status !== 'Approved' || store.isBlocked) {
    return res.status(404).json({ message: 'Store not found' });
  }
  return res.json(store);
}

module.exports = { registerStore, searchStores, getStoreById };
