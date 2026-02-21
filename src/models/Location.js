const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

locationSchema.index({ state: 1, city: 1 }, { unique: true });
locationSchema.index({ state: 1, isActive: 1 });

module.exports = mongoose.model('Location', locationSchema);
