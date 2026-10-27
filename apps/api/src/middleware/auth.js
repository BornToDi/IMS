const { verify } = require('../utils/jwt');
const prisma = require('../prismaClient');

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing authorization header' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid authorization header' });
  const token = parts[1];
  try {
    const payload = verify(token, 'access');
    req.userId = payload.userId;
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, userRole: true, bankId: true, bankRole: true, bankStatus: true } });
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    req.bankUser = user;
    if (user.userRole === 'BANK' && user.bankRole && !user.bankId && !/^\/api\/(?:auth\/(?:me|profile)|bank-team\/me)(?:\?|$)/.test(req.originalUrl)) return res.status(403).json({ error: 'Your bank membership is no longer linked to an active bank. Contact the IMS admin.' });
    if (user.userRole === 'BANK' && user.bankStatus && user.bankStatus !== 'APPROVED' && !/^\/api\/(?:auth\/(?:me|profile)|bank-team\/me)(?:\?|$)/.test(req.originalUrl)) return res.status(403).json({ error: 'Your bank membership is awaiting approval or has been suspended. Open Bank Team to check your status.' });
    if (user.userRole === 'BANK' && !/^\/api\/(?:auth\/(?:me|profile)(?:\?|$)|bank-team(?:\/|\?|$)|tickets(?:\/|\?|$)|hardware(?:\/|\?|$)|pos-serials(?:\/|\?|$)|direct-messages(?:\/|\?|$)|notifications(?:\/|\?|$))/.test(req.originalUrl)) return res.status(403).json({ error: 'This service is for internal IMS staff. Use your bank workspace instead.' });
    next();
  } catch (error) { next(error); }
}

module.exports = authMiddleware;
