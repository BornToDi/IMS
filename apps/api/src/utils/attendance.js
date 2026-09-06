const TIME_ZONE = 'Asia/Dhaka';
function command(content) {
  const match = String(content || '').trim().match(/^sign[\s-]*(in|out)[.!]?(?:\nReason: ([\s\S]+))?$/i);
  return match ? match[1].toLowerCase() : null;
}
function dateKey(value) {
  return new Date(new Date(value).getTime() + 6 * 3600000).toISOString().slice(0, 10);
}
function reportRange(period = 'daily', date = dateKey(new Date())) {
  if (!['daily', 'weekly', 'monthly'].includes(period) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid report period or date');
  const start = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date) throw new Error('Invalid date');
  if (period === 'weekly') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (period === 'monthly') start.setUTCDate(1);
  const end = new Date(start);
  if (period === 'monthly') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (period === 'weekly' ? 7 : 1));
  return { from: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10), start: new Date(start.getTime() - 21600000), end: new Date(end.getTime() - 21600000) };
}
function buildReport(messages) {
  const rows = new Map();
  const events = [];
  for (const message of [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id.localeCompare(b.id))) {
    const action = !message.attachmentType && !message.replyToId && command(message.content);
    if (!action) continue;
    const date = dateKey(message.createdAt);
    const key = `${message.authorId}:${date}`;
    if (!rows.has(key)) rows.set(key, { date, employeeId: message.authorId, name: message.author.name, employeeCode: message.author.employeeCode || '', signIn: null, signOut: null, minutes: 0, signIns: 0, signOuts: 0, issues: [], open: null });
    const row = rows.get(key);
    const reason = String(message.content).match(/\nReason: ([\s\S]+)$/i)?.[1]?.trim() || '';
    if (!row.reasons) row.reasons = [];
    if (reason) row.reasons.push(reason);
    const hasLocation = typeof message.latitude === 'number' && Number.isFinite(message.latitude) && Math.abs(message.latitude) <= 90 && typeof message.longitude === 'number' && Number.isFinite(message.longitude) && Math.abs(message.longitude) <= 180;
    const location = hasLocation ? { latitude: message.latitude, longitude: message.longitude, locationLabel: message.locationLabel || '', mapUrl: `https://www.google.com/maps?q=${message.latitude},${message.longitude}` } : { latitude: null, longitude: null, locationLabel: '', mapUrl: '' };
    events.push({ date, name: row.name, employeeCode: row.employeeCode, action, reason, ...location, time: message.createdAt, messageId: message.id });
    if (action === 'in') {
      row.signIns++;
      if (!row.signIn) { row.signIn = message.createdAt; row.signInLocation = location; }
      if (row.open) row.issues.push('Repeated sign in');
      else row.open = message.createdAt;
    } else {
      row.signOuts++;
      row.signOut = message.createdAt;
      row.signOutLocation = location;
      if (row.open) { row.minutes += (new Date(message.createdAt) - new Date(row.open)) / 60000; row.open = null; }
      else row.issues.push('Sign out without sign in');
    }
  }
  return { rows: [...rows.values()].map(({ open, ...row }) => ({ ...row, minutes: Math.round(row.minutes), status: open ? 'Missing sign out' : row.issues.length ? 'Needs review' : 'Complete', issues: [...new Set(row.issues)] })), events };
}
module.exports = { command, dateKey, reportRange, buildReport, TIME_ZONE };
