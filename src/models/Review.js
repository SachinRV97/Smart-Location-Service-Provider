const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true },
    isModerated: { type: Boolean, default: false }
  },
  { timestamps: true }
);

reviewSchema.index({ store: 1, customer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
