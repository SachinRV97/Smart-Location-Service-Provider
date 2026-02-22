const express = require('express');
const {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead
} = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/me', listMyNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

module.exports = router;
