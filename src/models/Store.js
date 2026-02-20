const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema(
  {
    storeName: { type: String, required: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    fullAddress: { type: String, required: true, trim: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: (arr) => arr.length === 2,
          message: 'Coordinates must be [longitude, latitude]'
        }
      }
    },
    category: { type: String, required: true, trim: true },
    openingTime: { type: String, trim: true },
    closingTime: { type: String, trim: true },
    description: { type: String, trim: true },
    images: [{ type: String, trim: true }],
    gst: { type: String, trim: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    isBlocked: { type: Boolean, default: false },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

storeSchema.index({ location: '2dsphere' });
storeSchema.index({ state: 1, city: 1, category: 1, status: 1 });
storeSchema.index({ storeName: 'text', city: 'text', state: 'text' });

module.exports = mongoose.model('Store', storeSchema);
