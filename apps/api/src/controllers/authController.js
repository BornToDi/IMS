const prisma = require('../prismaClient');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { signAccess, signRefresh, verify } = require('../utils/jwt');

const publicUserSelect = {
  id: true,
  employeeCode: true,
  name: true,
  email: true,
  avatarUrl: true,
  userRole: true,
  bankName: true,
  createdAt: true,
  updatedAt: true
};

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

function serializeUser(user) {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    userRole: user.userRole,
    bankName: user.bankName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function getActor(req) {
  if (!req.userId) return null;
  return prisma.user.findUnique({ where: { id: req.userId }, select: publicUserSelect });
}

function requireAdmin(user) {
  const role = String(user?.userRole || '').toUpperCase();
  if (!['ADMIN', 'MANAGEMENT'].includes(role)) {
    const error = new Error('Admin access required');
    error.status = 403;
    throw error;
  }
}

function trimOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

async function register(req, res) {
  const { name, email, password, bankName } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: 'Email already exists' });
  const requestedRole = String(req.body.userRole || 'EMPLOYEE').toUpperCase();
  const allowedRoles = ['BANK', 'ADMIN', 'EMPLOYEE', 'ASSISTANT'];
  const userRole = allowedRoles.includes(requestedRole) ? requestedRole : 'EMPLOYEE';
  if (userRole === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { userRole: { in: ['ADMIN', 'MANAGEMENT'] } } });
    if (adminCount > 0) return res.status(403).json({ error: 'Admin registration is disabled after initial setup' });
  }
  if (userRole === 'BANK' && !String(bankName || '').trim()) return res.status(400).json({ error: 'Bank name is required' });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { name: String(name).trim(), email: normalizedEmail, passwordHash, userRole, bankName: trimOrNull(bankName) } });
  const access = sendTokens(res, user);
  res.json({ user: serializeUser(user), accessToken: access });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const access = sendTokens(res, user);
  return res.json({ user: serializeUser(user), accessToken: access });
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
  res.json({ user: serializeUser(user) });
}

async function listUsers(req, res) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const users = await prisma.user.findMany({
    where: { id: { not: userId } },
    select: publicUserSelect,
    orderBy: [{ name: 'asc' }, { email: 'asc' }]
  });

  res.json(users.map(serializeUser));
}

async function updateProfile(req, res) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { name, currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const data = {};
  if (name !== undefined) {
    const trimmedName = String(name).trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });
    data.name = trimmedName;
  }

  if (newPassword !== undefined && String(newPassword).trim()) {
    if (!currentPassword) return res.status(400).json({ error: 'Current password is required to change password' });
    const passwordOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!passwordOk) return res.status(400).json({ error: 'Current password is incorrect' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    data.passwordHash = await hashPassword(String(newPassword));
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const updated = await prisma.user.update({ where: { id: userId }, data });
  res.json({ user: serializeUser(updated) });
}

async function adminListUsers(req, res) {
  const actor = await getActor(req);
  if (!actor) return res.status(401).json({ error: 'Not authenticated' });
  requireAdmin(actor);

  const users = await prisma.user.findMany({
    select: publicUserSelect,
    orderBy: [{ userRole: 'asc' }, { name: 'asc' }, { email: 'asc' }]
  });

  res.json(users.map(serializeUser));
}

async function adminUpdateUser(req, res) {
  const actor = await getActor(req);
  if (!actor) return res.status(401).json({ error: 'Not authenticated' });
  requireAdmin(actor);

  const targetId = req.params.id;
  if (!targetId) return res.status(400).json({ error: 'Missing user id' });
  const { name, email, employeeCode, bankName, userRole } = req.body;
  const data = {};
  if (name !== undefined) {
    const trimmedName = String(name).trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });
    data.name = trimmedName;
  }
  if (email !== undefined) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
    data.email = normalizedEmail;
  }
  if (employeeCode !== undefined) data.employeeCode = trimOrNull(employeeCode);
  if (bankName !== undefined) data.bankName = trimOrNull(bankName);
  if (userRole !== undefined) {
    const normalizedRole = String(userRole).trim().toUpperCase();
    const allowedRoles = ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE', 'FIELD_EMPLOYEE', 'BANK'];
    if (!allowedRoles.includes(normalizedRole)) return res.status(400).json({ error: 'Invalid user role' });
    data.userRole = normalizedRole;
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  try {
    const updated = await prisma.user.update({ where: { id: targetId }, data, select: publicUserSelect });
    res.json({ user: serializeUser(updated) });
  } catch (error) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Email or employee ID is already in use' });
    throw error;
  }
}

async function adminResetPassword(req, res) {
  const actor = await getActor(req);
  if (!actor) return res.status(401).json({ error: 'Not authenticated' });
  requireAdmin(actor);

  const targetId = req.params.id;
  const password = String(req.body.password || '').trim();
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  await prisma.user.update({ where: { id: targetId }, data: { passwordHash: await hashPassword(password) } });
  res.json({ ok: true });
}

async function adminDeleteUser(req, res) {
  const actor = await getActor(req);
  if (!actor) return res.status(401).json({ error: 'Not authenticated' });
  requireAdmin(actor);

  const targetId = req.params.id;
  if (!targetId) return res.status(400).json({ error: 'Missing user id' });
  if (targetId === actor.id) return res.status(400).json({ error: 'You cannot delete your own account from the admin panel' });

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: publicUserSelect });
  if (!target) return res.status(404).json({ error: 'User not found' });

  await prisma.$transaction([
    prisma.workspaceMember.deleteMany({ where: { userId: targetId } }),
    prisma.goalActivity.deleteMany({ where: { userId: targetId } }),
    prisma.announcementReaction.deleteMany({ where: { userId: targetId } }),
    prisma.announcementComment.deleteMany({ where: { userId: targetId } }),
    prisma.meetingInvite.deleteMany({ where: { userId: targetId } }),
    prisma.notification.deleteMany({ where: { userId: targetId } }),
    prisma.pushSubscription.deleteMany({ where: { userId: targetId } }),
    prisma.auditLog.deleteMany({ where: { userId: targetId } }),
    prisma.ticketUpdate.updateMany({ where: { userId: targetId }, data: { userId: actor.id } }),
    prisma.hardwareUpdate.updateMany({ where: { userId: targetId }, data: { userId: actor.id } }),
    prisma.workspaceAttachment.updateMany({ where: { uploadedById: targetId }, data: { uploadedById: actor.id } }),
    prisma.globalMessage.updateMany({ where: { authorId: targetId }, data: { authorId: actor.id } }),
    prisma.globalFile.updateMany({ where: { userId: targetId }, data: { userId: actor.id } }),
    prisma.message.updateMany({ where: { authorId: targetId }, data: { authorId: actor.id } }),
    prisma.file.updateMany({ where: { userId: targetId }, data: { userId: actor.id } }),
    prisma.announcement.updateMany({ where: { authorId: targetId }, data: { authorId: actor.id } }),
    prisma.meeting.updateMany({ where: { organizerId: targetId }, data: { organizerId: actor.id } }),
    prisma.workspace.updateMany({ where: { assignedEmployeeId: targetId }, data: { assignedEmployeeId: null } }),
    prisma.workspace.updateMany({ where: { ownerId: targetId }, data: { ownerId: actor.id } }),
    prisma.goal.updateMany({ where: { ownerId: targetId }, data: { ownerId: null } }),
    prisma.actionItem.updateMany({ where: { assigneeId: targetId }, data: { assigneeId: null } }),
    prisma.hardwareBatch.updateMany({ where: { assignedToId: targetId }, data: { assignedToId: null } }),
    prisma.hardwareBatch.updateMany({ where: { createdById: targetId }, data: { createdById: actor.id } }),
    prisma.bankTicket.updateMany({ where: { assignedAdminId: targetId }, data: { assignedAdminId: null } }),
    prisma.bankTicket.updateMany({ where: { assignedEmployeeId: targetId }, data: { assignedEmployeeId: null } }),
    prisma.bankTicket.updateMany({ where: { bankUserId: targetId }, data: { bankUserId: actor.id } }),
    prisma.workspaceUpdate.updateMany({ where: { employeeId: targetId }, data: { employeeId: actor.id } }),
    prisma.user.delete({ where: { id: targetId } })
  ]);

  res.json({ ok: true, deletedUser: serializeUser(target) });
}

module.exports = {
  register,
  login,
  logout,
  refresh,
  me,
  updateProfile,
  listUsers,
  adminListUsers,
  adminUpdateUser,
  adminResetPassword,
  adminDeleteUser
};
