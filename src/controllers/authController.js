const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken } = require('../utils/jwt');

const LOGIN_ROLES = new Set(['customer', 'owner', 'admin']);

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

async function register(req, res) {
  const { name, email, password, phone, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }

  const normalizedRole = role === 'owner' ? 'owner' : 'customer';

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: 'Email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    passwordHash,
    phone,
    role: normalizedRole
  });

  const token = signToken({ id: user._id, role: user.role, email: user.email });
  return res.status(201).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
}

async function login(req, res) {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const requestedRole = normalizeRole(role);
  if (role !== undefined && !LOGIN_ROLES.has(requestedRole)) {
    return res.status(400).json({ message: 'Invalid role. Use customer, owner, or admin' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (user.isBlocked) {
    return res.status(403).json({ message: 'Your account is blocked' });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (requestedRole && user.role !== requestedRole) {
    return res.status(403).json({
      message: `Role mismatch. This account is registered as ${user.role}`
    });
  }

  const token = signToken({ id: user._id, role: user.role, email: user.email });
  return res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
}

module.exports = { register, login };
