const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'store_submitted',
        'store_approved',
        'store_rejected',
        'store_blocked',
        'store_unblocked',
        'review_added',
        'review_moderated',
        'system'
      ],
      default: 'system'
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    channel: { type: String, enum: ['in-app', 'email'], default: 'in-app' },
    email: { type: String, lowercase: true, trim: true },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending'
    },
    deliveryError: { type: String, trim: true, maxlength: 300 },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
