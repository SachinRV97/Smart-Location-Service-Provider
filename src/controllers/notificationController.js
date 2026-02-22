const Notification = require('../models/Notification');

async function listMyNotifications(req, res) {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;
  const unreadOnly = req.query.unreadOnly === 'true';

  const query = { user: req.user.id };
  if (unreadOnly) {
    query.isRead = false;
  }

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);

  return res.json(notifications);
}

async function markNotificationRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    {
      isRead: true,
      readAt: new Date()
    },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  return res.json(notification);
}

async function markAllNotificationsRead(req, res) {
  const result = await Notification.updateMany(
    { user: req.user.id, isRead: false },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );

  return res.json({
    updated: result.modifiedCount || 0
  });
}

module.exports = {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead
};
