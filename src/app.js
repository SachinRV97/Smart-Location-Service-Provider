const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const storeRoutes = require('./routes/storeRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-unused-vars
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
