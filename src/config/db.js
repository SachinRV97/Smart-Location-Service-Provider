const mongoose = require('mongoose');

async function connectDB(uri) {
  console.log("Connecting to MongoDB...");

  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);

  console.log("MongoDB Connected ✅");
  return mongoose.connection;
}

module.exports = connectDB;