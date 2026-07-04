const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const { verify } = require('./utils/jwt');

const app = express();
const server = http.createServer(app);

const DEFAULT_CLIENT_URLS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3002'
];

const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || DEFAULT_CLIENT_URLS.join(','))
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production') {
    return /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
  }
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn('[cors] blocked origin:', origin);
    return callback(new Error(`CORS not allowed by server: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

const io = new Server(server, { cors: corsOptions });
app.locals.io = io;

app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
app.use(cors(corsOptions));
app.options('/{*splat}', cors(corsOptions));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const prisma = require('./prismaClient');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/pos-serials', require('./routes/posSerials'));
app.use('/api/hardware', require('./routes/hardware'));
app.use('/api/workspaces/:workspaceId/goals', require('./routes/goals'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/workspaces/:workspaceId/announcements', require('./routes/announcements'));
app.use('/api/workspaces/:workspaceId/action-items', require('./routes/actionItems'));
app.use('/api/workspaces/:workspaceId/notifications', require('./routes/notifications'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/workspaces/:workspaceId/audit', require('./routes/audit'));
app.use('/api/workspaces/:workspaceId/export', require('./routes/export'));
app.use('/api/workspaces/:workspaceId/messages', require('./routes/messages'));
app.use('/api/workspaces/:workspaceId/files', require('./routes/files'));
app.use('/api/workspaces/:workspaceId/meetings', require('./routes/meetings'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/chat', require('./routes/globalChat'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', allowedOrigins }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (err && String(err.message || '').includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

function getSocketToken(socket) {
  const headerAuth = socket.handshake.headers.authorization;
  const authToken = socket.handshake.auth && socket.handshake.auth.token;
  const queryToken = socket.handshake.query && socket.handshake.query.token;
  if (headerAuth && headerAuth.startsWith('Bearer ')) return headerAuth.replace('Bearer ', '').trim();
  if (authToken) return String(authToken).trim();
  if (queryToken) return String(queryToken).trim();
  return null;
}

io.on('connection', async (socket) => {
  const token = getSocketToken(socket);
  let userId = null;

  try {
    const payload = token ? verify(token, 'access') : null;
    userId = payload && payload.userId;
  } catch (err) {
    console.warn('[socket] invalid token:', err.message);
  }

  if (!userId) {
    socket.disconnect(true);
    return;
  }

  socket.userId = userId;
  socket.join(`user:${userId}`);
  console.log('[socket] connected:', socket.id, 'userId:', userId);

  socket.on('join-workspace', async (workspaceId) => {
    if (!workspaceId) return;
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (member) socket.join(`workspace:${workspaceId}`);
  });

  socket.on('join-global-chat', () => socket.join('global-chat-room'));

  socket.on('send-global-message', async (data = {}) => {
    try {
      const { content, attachmentUrl, attachmentType, attachmentName, attachmentSize, latitude, longitude, locationLabel } = data;
      if (!content && !attachmentUrl) return socket.emit('global-message-error', { message: 'Content required' });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return socket.emit('global-message-error', { message: 'User not found' });

      const message = await prisma.globalMessage.create({
        data: {
          authorId: userId,
          content: content || (attachmentName ? `📎 ${attachmentName}` : 'Attachment'),
          attachmentUrl: attachmentUrl || null,
          attachmentType: attachmentType || null,
          attachmentName: attachmentName || null,
          attachmentSize: attachmentSize || null,
          latitude: latitude === undefined || latitude === null || latitude === '' ? null : Number(latitude),
          longitude: longitude === undefined || longitude === null || longitude === '' ? null : Number(longitude),
          locationLabel: locationLabel || null
        },
        include: { author: { select: { id: true, name: true, email: true, avatarUrl: true, userRole: true, bankName: true } } }
      });

      io.to('global-chat-room').emit('new-global-message', message);
    } catch (err) {
      console.error('[socket] send-global-message error:', err);
      socket.emit('global-message-error', { message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', (reason) => console.log('[socket] disconnected:', socket.id, reason));
});

app.use((err, req, res, next) => {
  console.error('[api error]', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`API server listening on ${HOST}:${PORT}`);
  console.log('[cors] allowed origins:', allowedOrigins.join(', '));
});

module.exports = { app, server, io };
