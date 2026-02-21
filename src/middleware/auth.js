const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function resolveUserFromToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(payload.id).select('role email isBlocked name');

  if (!user) {
    throw new Error('Unauthorized');
  }
  if (user.isBlocked) {
    const error = new Error('Your account is blocked');
    error.status = 403;
    throw error;
  }

  return {
    id: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name
  };
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing bearer token' });
  }

  const token = authHeader.slice(7);
  try {
    req.user = await resolveUserFromToken(token);
    return next();
  } catch (error) {
    if (error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
}

async function optionalAuthenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);
  try {
    req.user = await resolveUserFromToken(token);
  } catch {
    req.user = null;
  }
  return next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
}

module.exports = { authenticate, optionalAuthenticate, authorize };
