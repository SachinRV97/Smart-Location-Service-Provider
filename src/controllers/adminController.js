const Store = require('../models/Store');

async function listPendingStores(req, res) {
  const stores = await Store.find({ status: 'Pending' }).sort({ createdAt: 1 });
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

async function dashboard(req, res) {
  const [totalStores, activeStores, pendingStores] = await Promise.all([
    Store.countDocuments(),
    Store.countDocuments({ status: 'Approved', isBlocked: false }),
    Store.countDocuments({ status: 'Pending' })
  ]);

  return res.json({
    totalStores,
    activeStores,
    pendingStores
  });
}

module.exports = {
  listPendingStores,
  approveStore,
  rejectStore,
  blockStore,
  dashboard
};
