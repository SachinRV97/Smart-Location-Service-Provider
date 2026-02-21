const Category = require('../models/Category');
const Location = require('../models/Location');
const Store = require('../models/Store');

const DEFAULT_CATEGORIES = [
  'Grocery',
  'Medical',
  'Electronics',
  'Restaurant',
  'Fashion',
  'Salon'
];

const DEFAULT_LOCATIONS = [
  { state: 'Maharashtra', city: 'Mumbai' },
  { state: 'Maharashtra', city: 'Pune' },
  { state: 'Karnataka', city: 'Bengaluru' },
  { state: 'Delhi', city: 'New Delhi' },
  { state: 'Tamil Nadu', city: 'Chennai' },
  { state: 'Gujarat', city: 'Ahmedabad' }
];

async function ensureSeedMeta() {
  const [categoryCount, locationCount] = await Promise.all([
    Category.countDocuments(),
    Location.countDocuments()
  ]);

  if (categoryCount === 0) {
    await Promise.all(
      DEFAULT_CATEGORIES.map((name) =>
        Category.updateOne({ name }, { $setOnInsert: { name, isActive: true } }, { upsert: true })
      )
    );
  }
  if (locationCount === 0) {
    await Promise.all(
      DEFAULT_LOCATIONS.map((item) =>
        Location.updateOne(
          { state: item.state, city: item.city },
          { $setOnInsert: { state: item.state, city: item.city, isActive: true } },
          { upsert: true }
        )
      )
    );
  }
}

async function listStates(req, res) {
  await ensureSeedMeta();
  const states = await Location.distinct('state', { isActive: true });

  if (!states.length) {
    const fallbackStates = await Store.distinct('state', { status: 'Approved', isBlocked: false });
    return res.json(fallbackStates.sort());
  }
  return res.json(states.sort());
}

async function listCities(req, res) {
  const { state } = req.query;
  const query = { isActive: true };
  if (state) {
    query.state = state;
  }

  let cities = await Location.distinct('city', query);
  if (!cities.length && state) {
    cities = await Store.distinct('city', { state, status: 'Approved', isBlocked: false });
  }

  return res.json(cities.sort());
}

async function listCategories(req, res) {
  await ensureSeedMeta();
  let categories = await Category.find({ isActive: true }).sort({ name: 1 }).select('name');
  if (!categories.length) {
    const fallbackCategories = await Store.distinct('category', { status: 'Approved', isBlocked: false });
    categories = fallbackCategories.map((name) => ({ name }));
  }

  return res.json(categories.map((item) => item.name).sort());
}

module.exports = {
  listStates,
  listCities,
  listCategories
};
