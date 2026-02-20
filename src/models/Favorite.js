const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true }
  },
  { timestamps: true }
);

favoriteSchema.index({ customer: 1, store: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);
