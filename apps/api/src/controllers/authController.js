const prisma = require('../prismaClient');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { signAccess, signRefresh, verify } = require('../utils/jwt');

function sendTokens(res, user) {
  const access = signAccess({ userId: user.id });
  const refresh = signRefresh({ userId: user.id });
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', refresh, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/api',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  return access;
}

async function register(req, res) {
  const { name, email, password, bankName } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: 'Email already exists' });
  const requestedRole = String(req.body.userRole || 'EMPLOYEE').toUpperCase();
  const allowedRoles = ['BANK', 'ADMIN', 'EMPLOYEE'];
  let userRole = allowedRoles.includes(requestedRole) ? requestedRole : 'EMPLOYEE';
  if (userRole === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { userRole: { in: ['ADMIN', 'MANAGEMENT'] } } });
    if (adminCount > 0) return res.status(403).json({ error: 'Admin registration is disabled after initial setup' });
  }
  if (userRole === 'BANK' && !String(bankName || '').trim()) return res.status(400).json({ error: 'Bank name is required' });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { name: String(name).trim(), email: normalizedEmail, passwordHash, userRole, bankName: String(bankName || '').trim() || null } });
  const access = sendTokens(res, user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, userRole: user.userRole, bankName: user.bankName }, accessToken: access });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const access = sendTokens(res, user);
  return res.json({ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, userRole: user.userRole, bankName: user.bankName }, accessToken: access });
}

async function logout(req, res) {
  res.clearCookie('refreshToken', { path: '/api' });
  res.json({ ok: true });
}

async function refresh(req, res) {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: 'No refresh token' });
  try {
    const payload = verify(token, 'refresh');
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid token user' });
    const access = sendTokens(res, user);
    res.json({ accessToken: access });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
}

async function me(req, res) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, userRole: user.userRole, bankName: user.bankName } });
}

async function listUsers(req, res) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const users = await prisma.user.findMany({
    where: { id: { not: userId } },
    select: { id: true, name: true, email: true, avatarUrl: true, userRole: true, bankName: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }]
  });

  res.json(users);
}

async function updateProfile(req, res) {
  const userId = req.userId;
  const { name } = req.body;
  const updated = await prisma.user.update({ where: { id: userId }, data: { name } });
  res.json({ user: { id: updated.id, name: updated.name, email: updated.email, avatarUrl: updated.avatarUrl, bankName: updated.bankName } });
}

module.exports = { register, login, logout, refresh, me, updateProfile, listUsers };
