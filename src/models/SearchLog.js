const mongoose = require('mongoose');

const searchLogSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    query: { type: String, trim: true },
    state: { type: String, trim: true },
    city: { type: String, trim: true },
    category: { type: String, trim: true }
  },
  { timestamps: true }
);

searchLogSchema.index({ createdAt: -1 });
searchLogSchema.index({ city: 1 });

module.exports = mongoose.model('SearchLog', searchLogSchema);
