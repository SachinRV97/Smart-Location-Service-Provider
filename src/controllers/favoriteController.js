const Favorite = require('../models/Favorite');
const Store = require('../models/Store');

async function addFavorite(req, res) {
  const store = await Store.findById(req.params.storeId).select('status isBlocked');
  if (!store || store.status !== 'Approved' || store.isBlocked) {
    return res.status(404).json({ message: 'Store not found' });
  }

  await Favorite.updateOne(
    { customer: req.user.id, store: req.params.storeId },
    { $setOnInsert: { customer: req.user.id, store: req.params.storeId } },
    { upsert: true }
  );

  return res.json({ message: 'Added to favorites' });
}

async function removeFavorite(req, res) {
  await Favorite.deleteOne({
    customer: req.user.id,
    store: req.params.storeId
  });
  return res.json({ message: 'Removed from favorites' });
}

async function listMyFavorites(req, res) {
  const favorites = await Favorite.find({ customer: req.user.id })
    .populate({
      path: 'store',
      match: { status: 'Approved', isBlocked: false }
    })
    .sort({ createdAt: -1 });

  const stores = favorites
    .map((item) => item.store)
    .filter(Boolean);

  return res.json(stores);
}

module.exports = {
  addFavorite,
  removeFavorite,
  listMyFavorites
};
