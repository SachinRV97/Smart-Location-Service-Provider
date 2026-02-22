require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../config/db');
const User = require('../models/User');
const Store = require('../models/Store');
const Review = require('../models/Review');
const Favorite = require('../models/Favorite');
const SearchLog = require('../models/SearchLog');
const Notification = require('../models/Notification');
const Category = require('../models/Category');
const Location = require('../models/Location');
const { refreshStoreRating } = require('../services/storeRating');

const SEED_TAG = 'demo-seed-v1';

const DEMO_USERS = [
  {
    key: 'admin',
    name: 'System Admin',
    email: 'admin.demo@slsp.local',
    password: 'Admin@123',
    phone: '9000000001',
    role: 'admin',
    isBlocked: false
  },
  {
    key: 'ownerPrimary',
    name: 'Rohan StoreOwner',
    email: 'owner.demo@slsp.local',
    password: 'Owner@123',
    phone: '9000000002',
    role: 'owner',
    isBlocked: false
  },
  {
    key: 'ownerSecondary',
    name: 'Neha Merchant',
    email: 'owner2.demo@slsp.local',
    password: 'Owner2@123',
    phone: '9000000003',
    role: 'owner',
    isBlocked: false
  },
  {
    key: 'customerPrimary',
    name: 'Amit Customer',
    email: 'customer.demo@slsp.local',
    password: 'Customer@123',
    phone: '9000000004',
    role: 'customer',
    isBlocked: false
  },
  {
    key: 'customerSecondary',
    name: 'Priya Customer',
    email: 'customer2.demo@slsp.local',
    password: 'Customer2@123',
    phone: '9000000005',
    role: 'customer',
    isBlocked: false
  }
];

const DEMO_CATEGORIES = [
  'Grocery',
  'Medical',
  'Electronics',
  'Restaurant',
  'Fashion',
  'Salon'
];

const DEMO_LOCATIONS = [
  { state: 'Maharashtra', city: 'Mumbai' },
  { state: 'Maharashtra', city: 'Pune' },
  { state: 'Karnataka', city: 'Bengaluru' },
  { state: 'Delhi', city: 'New Delhi' },
  { state: 'Tamil Nadu', city: 'Chennai' }
];

function buildPoint(latitude, longitude) {
  return {
    type: 'Point',
    coordinates: [longitude, latitude]
  };
}

async function upsertUser(definition) {
  const passwordHash = await bcrypt.hash(definition.password, 12);
  return User.findOneAndUpdate(
    { email: definition.email.toLowerCase() },
    {
      name: definition.name,
      email: definition.email.toLowerCase(),
      passwordHash,
      phone: definition.phone,
      role: definition.role,
      isBlocked: Boolean(definition.isBlocked)
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

async function upsertStore(filter, payload) {
  return Store.findOneAndUpdate(
    filter,
    payload,
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

async function seedMeta() {
  await Promise.all(
    DEMO_CATEGORIES.map((name) =>
      Category.findOneAndUpdate(
        { name },
        { name, isActive: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );

  await Promise.all(
    DEMO_LOCATIONS.map((item) =>
      Location.findOneAndUpdate(
        { state: item.state, city: item.city },
        { state: item.state, city: item.city, isActive: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );
}

async function seedUsers() {
  const output = {};
  for (const definition of DEMO_USERS) {
    output[definition.key] = await upsertUser(definition);
  }
  return output;
}

async function seedStores(users) {
  const stores = {};

  stores.freshBasket = await upsertStore(
    { owner: users.ownerPrimary._id, storeName: 'Fresh Basket Mart' },
    {
      storeName: 'Fresh Basket Mart',
      owner: users.ownerPrimary._id,
      ownerName: users.ownerPrimary.name,
      email: users.ownerPrimary.email,
      phone: '9811111111',
      state: 'Maharashtra',
      city: 'Mumbai',
      fullAddress: 'Shop 12, Market Road, Andheri East, Mumbai',
      location: buildPoint(19.1197, 72.8468),
      category: 'Grocery',
      openingTime: '08:00',
      closingTime: '22:00',
      description: 'Daily groceries, fruits, and organic essentials.',
      images: [
        'https://images.unsplash.com/photo-1542838132-92c53300491e'
      ],
      gst: '27ABCDE1234F1Z5',
      status: 'Approved',
      isBlocked: false,
      viewCount: 96
    }
  );

  stores.cityMedico = await upsertStore(
    { owner: users.ownerPrimary._id, storeName: 'City Medico Plus' },
    {
      storeName: 'City Medico Plus',
      owner: users.ownerPrimary._id,
      ownerName: users.ownerPrimary.name,
      email: users.ownerPrimary.email,
      phone: '9822222222',
      state: 'Maharashtra',
      city: 'Pune',
      fullAddress: 'Near Central Bus Stand, Shivaji Nagar, Pune',
      location: buildPoint(18.5308, 73.8476),
      category: 'Medical',
      openingTime: '07:00',
      closingTime: '23:00',
      description: '24x7 style pharmacy with home delivery support.',
      images: [
        'https://images.unsplash.com/photo-1587854692152-cbe660dbde88'
      ],
      gst: '27PQRSX9876A1Z9',
      status: 'Pending',
      isBlocked: false,
      viewCount: 12
    }
  );

  stores.electroHub = await upsertStore(
    { owner: users.ownerSecondary._id, storeName: 'Electro Hub Prime' },
    {
      storeName: 'Electro Hub Prime',
      owner: users.ownerSecondary._id,
      ownerName: users.ownerSecondary.name,
      email: users.ownerSecondary.email,
      phone: '9833333333',
      state: 'Karnataka',
      city: 'Bengaluru',
      fullAddress: 'Tech Park Circle, Whitefield Main Road, Bengaluru',
      location: buildPoint(12.9698, 77.75),
      category: 'Electronics',
      openingTime: '10:00',
      closingTime: '21:00',
      description: 'Latest gadgets, accessories, and repair support.',
      images: [
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9'
      ],
      gst: '29LMNOP1234Q1Z8',
      status: 'Approved',
      isBlocked: true,
      viewCount: 35
    }
  );

  stores.spiceAvenue = await upsertStore(
    { owner: users.ownerSecondary._id, storeName: 'Spice Avenue Diner' },
    {
      storeName: 'Spice Avenue Diner',
      owner: users.ownerSecondary._id,
      ownerName: users.ownerSecondary.name,
      email: users.ownerSecondary.email,
      phone: '9844444444',
      state: 'Delhi',
      city: 'New Delhi',
      fullAddress: 'Connaught Place Inner Circle, New Delhi',
      location: buildPoint(28.6315, 77.2167),
      category: 'Restaurant',
      openingTime: '11:00',
      closingTime: '23:30',
      description: 'Family dining with North and South Indian menu.',
      images: [
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5'
      ],
      gst: '07WXYZT9876M1Z2',
      status: 'Rejected',
      isBlocked: false,
      viewCount: 18
    }
  );

  stores.styleCorner = await upsertStore(
    { owner: users.ownerPrimary._id, storeName: 'Style Corner Boutique' },
    {
      storeName: 'Style Corner Boutique',
      owner: users.ownerPrimary._id,
      ownerName: users.ownerPrimary.name,
      email: users.ownerPrimary.email,
      phone: '9855555555',
      state: 'Tamil Nadu',
      city: 'Chennai',
      fullAddress: 'T Nagar High Street, Chennai',
      location: buildPoint(13.0418, 80.2341),
      category: 'Fashion',
      openingTime: '10:30',
      closingTime: '21:30',
      description: 'Ethnic and western outfits with in-store tailoring.',
      images: [
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8'
      ],
      gst: '33ABCDE9876L1Z1',
      status: 'Approved',
      isBlocked: false,
      viewCount: 61
    }
  );

  return stores;
}

async function seedReviews(users, stores) {
  const now = new Date();

  await Review.findOneAndUpdate(
    { store: stores.freshBasket._id, customer: users.customerPrimary._id },
    {
      store: stores.freshBasket._id,
      customer: users.customerPrimary._id,
      rating: 5,
      comment: 'Great variety and quick billing.',
      status: 'Approved',
      moderatedBy: users.admin._id,
      moderatedAt: now
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Review.findOneAndUpdate(
    { store: stores.freshBasket._id, customer: users.customerSecondary._id },
    {
      store: stores.freshBasket._id,
      customer: users.customerSecondary._id,
      rating: 3,
      comment: 'Good store but delivery was delayed.',
      status: 'Pending',
      moderatedBy: null,
      moderatedAt: null
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Review.findOneAndUpdate(
    { store: stores.styleCorner._id, customer: users.customerPrimary._id },
    {
      store: stores.styleCorner._id,
      customer: users.customerPrimary._id,
      rating: 4,
      comment: 'Nice collection and helpful staff.',
      status: 'Approved',
      moderatedBy: users.admin._id,
      moderatedAt: now
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Review.findOneAndUpdate(
    { store: stores.styleCorner._id, customer: users.customerSecondary._id },
    {
      store: stores.styleCorner._id,
      customer: users.customerSecondary._id,
      rating: 2,
      comment: 'Pricing felt high for the options.',
      status: 'Rejected',
      moderatedBy: users.admin._id,
      moderatedAt: now
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await refreshStoreRating(stores.freshBasket._id);
  await refreshStoreRating(stores.styleCorner._id);
  await refreshStoreRating(stores.cityMedico._id);
  await refreshStoreRating(stores.electroHub._id);
  await refreshStoreRating(stores.spiceAvenue._id);
}

async function seedFavorites(users, stores) {
  await Favorite.updateOne(
    { customer: users.customerPrimary._id, store: stores.freshBasket._id },
    { $setOnInsert: { customer: users.customerPrimary._id, store: stores.freshBasket._id } },
    { upsert: true }
  );

  await Favorite.updateOne(
    { customer: users.customerPrimary._id, store: stores.styleCorner._id },
    { $setOnInsert: { customer: users.customerPrimary._id, store: stores.styleCorner._id } },
    { upsert: true }
  );
}

async function seedSearchLogs(users) {
  await SearchLog.deleteMany({
    customer: { $in: [users.customerPrimary._id, users.customerSecondary._id] }
  });

  await SearchLog.insertMany([
    {
      customer: users.customerPrimary._id,
      query: 'grocery near me',
      state: 'Maharashtra',
      city: 'Mumbai',
      category: 'Grocery'
    },
    {
      customer: users.customerPrimary._id,
      query: 'medical store',
      state: 'Maharashtra',
      city: 'Pune',
      category: 'Medical'
    },
    {
      customer: users.customerSecondary._id,
      query: 'fashion boutique',
      state: 'Tamil Nadu',
      city: 'Chennai',
      category: 'Fashion'
    },
    {
      customer: users.customerSecondary._id,
      query: 'electronics',
      state: 'Karnataka',
      city: 'Bengaluru',
      category: 'Electronics'
    }
  ]);
}

async function seedNotifications(users, stores) {
  await Notification.deleteMany({ 'metadata.seedTag': SEED_TAG });

  await Notification.insertMany([
    {
      user: users.admin._id,
      type: 'store_submitted',
      title: 'Demo: New store pending approval',
      message: 'City Medico Plus was submitted and is waiting for approval.',
      channel: 'in-app',
      deliveryStatus: 'sent',
      metadata: {
        seedTag: SEED_TAG,
        storeId: String(stores.cityMedico._id)
      }
    },
    {
      user: users.ownerPrimary._id,
      type: 'store_approved',
      title: 'Demo: Store approved',
      message: 'Fresh Basket Mart is approved and visible to customers.',
      channel: 'in-app',
      deliveryStatus: 'sent',
      metadata: {
        seedTag: SEED_TAG,
        storeId: String(stores.freshBasket._id)
      }
    },
    {
      user: users.ownerPrimary._id,
      type: 'review_added',
      title: 'Demo: New review submitted',
      message: 'A new review for Fresh Basket Mart is waiting for moderation.',
      channel: 'in-app',
      deliveryStatus: 'sent',
      metadata: {
        seedTag: SEED_TAG,
        storeId: String(stores.freshBasket._id)
      }
    },
    {
      user: users.customerPrimary._id,
      type: 'review_moderated',
      title: 'Demo: Review approved',
      message: 'Your review for Style Corner Boutique was approved.',
      channel: 'in-app',
      deliveryStatus: 'sent',
      metadata: {
        seedTag: SEED_TAG,
        storeId: String(stores.styleCorner._id)
      }
    }
  ]);
}

function printSummary(users, stores) {
  console.log('\nDemo users created/updated:');
  console.table(
    DEMO_USERS.map((item) => ({
      role: item.role,
      name: item.name,
      email: item.email,
      password: item.password
    }))
  );

  console.log('\nDemo stores created/updated:');
  console.table(
    Object.values(stores).map((store) => ({
      storeName: store.storeName,
      owner: store.ownerName,
      city: store.city,
      status: store.status,
      isBlocked: store.isBlocked
    }))
  );

  console.log('\nNotes:');
  console.log('- Admin login redirects to /admin.html');
  console.log('- Owner and Customer login redirect to /stores.html');
  console.log('- Use Admin Metadata page to test add/edit/delete for category/location');
}

async function main() {
  await connectDB(process.env.MONGODB_URI);

  const users = await seedUsers();
  await seedMeta();
  const stores = await seedStores(users);
  await seedReviews(users, stores);
  await seedFavorites(users, stores);
  await seedSearchLogs(users);
  await seedNotifications(users, stores);

  printSummary(users, stores);
}

main()
  .then(async () => {
    await mongoose.disconnect();
    console.log('\nDemo data seed completed successfully.');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nDemo data seed failed:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
