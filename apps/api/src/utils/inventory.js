const STATUSES = ['RECEIVED', 'IN_STOCK', 'RESERVED', 'DELIVERED', 'DEPLOYED', 'FAULTY', 'UNDER_REPAIR', 'REPAIRED', 'REPLACED', 'RETURNED', 'WITHDRAWN', 'SCRAPPED'];
const TRANSITIONS = {
  RESTOCK: { from: ['RECEIVED', 'RETURNED', 'REPAIRED'], to: 'IN_STOCK' },
  RESERVE: { from: ['IN_STOCK'], to: 'RESERVED', required: ['bankId', 'dueDate'] },
  DELIVER: { from: ['IN_STOCK', 'RESERVED', 'REPAIRED'], to: 'DELIVERED', required: ['bankId', 'location', 'reference', 'deliveredBy', 'receivedBy', 'dueDate'] },
  DEPLOY: { from: ['DELIVERED', 'REPAIRED', 'WITHDRAWN'], to: 'DEPLOYED', required: ['bankId', 'location', 'merchant', 'tid', 'mid', 'address', 'engineer'] },
  WITHDRAWAL: { from: ['RESERVED', 'DELIVERED', 'DEPLOYED', 'FAULTY', 'UNDER_REPAIR', 'REPAIRED', 'REPLACED', 'RETURNED'], to: 'WITHDRAWN', required: ['receivedBy', 'remarks'] },
  TRANSFER: { from: ['IN_STOCK', 'RESERVED', 'DELIVERED', 'DEPLOYED', 'REPAIRED'], required: ['location', 'remarks'] },
  FAULT: { from: ['DELIVERED', 'DEPLOYED', 'IN_STOCK', 'REPAIRED'], to: 'FAULTY', required: ['faultType'] },
  REPAIR: { from: ['FAULTY', 'REPLACED', 'RETURNED'], to: 'UNDER_REPAIR', required: ['technician', 'location'] },
  REPAIR_UPDATE: { from: ['UNDER_REPAIR'], required: ['repairStatus', 'technician'] },
  REPAIR_COMPLETE: { from: ['UNDER_REPAIR'], to: 'REPAIRED', required: ['remarks'] },
  RETURN: { from: ['RESERVED', 'DELIVERED', 'DEPLOYED', 'FAULTY', 'UNDER_REPAIR', 'REPAIRED', 'REPLACED'], to: 'RETURNED', required: ['location', 'receivedBy', 'remarks'] },
  REPLACE: { from: ['FAULTY', 'UNDER_REPAIR'], to: 'REPLACED', required: ['replacementSerial', 'location', 'engineer', 'remarks', 'dueDate'] },
  CONFIRM_RETURN: { from: ['REPLACED'], required: ['location', 'receivedBy'] },
  SCRAP: { from: ['IN_STOCK', 'FAULTY', 'REPAIRED', 'RETURNED', 'REPLACED'], to: 'SCRAPPED', required: ['remarks'] },
  EDIT: { from: STATUSES },
  EDIT_ASSIGNMENT: { from: STATUSES, required: ['location'] },
  ARCHIVE: { from: ['SCRAPPED'], required: ['remarks'] }
};
const ROLE_ACTIONS = {
  ADMIN: ['STOCK_IN', 'BANK', 'SETTINGS', ...Object.keys(TRANSITIONS), 'DOCUMENT'],
  STORE: ['STOCK_IN', 'RESTOCK', 'RESERVE', 'DELIVER', 'TRANSFER', 'RETURN', 'WITHDRAWAL', 'CONFIRM_RETURN', 'EDIT', 'EDIT_ASSIGNMENT', 'DOCUMENT'],
  OPERATIONS: ['RESERVE', 'DELIVER', 'DEPLOY', 'TRANSFER', 'DOCUMENT'],
  TECHNICIAN: ['DEPLOY', 'FAULT', 'REPAIR', 'REPAIR_UPDATE', 'REPAIR_COMPLETE', 'REPLACE', 'CONFIRM_RETURN', 'DOCUMENT'],
  MANAGEMENT: [], BANK: []
};
function inventoryRole(user) {
  if (user.userRole === 'ADMIN' || user.userRole === 'BANK' || user.userRole === 'MANAGEMENT') return user.userRole;
  return user.inventoryRole || ({ ASSISTANT: 'STORE', EMPLOYEE: 'TECHNICIAN' }[user.userRole]) || 'MANAGEMENT';
}
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function clean(value, max = 500) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail('Text fields must contain text');
  const result = value.trim();
  if (result.length > max) fail(`Text must be ${max} characters or fewer`);
  return result;
}
function date(value, field) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) fail(`Invalid ${field}`);
  const result = new Date(value);
  if (result.toISOString().slice(0, 10) !== value.slice(0, 10)) fail(`Invalid ${field}`);
  return result;
}
function assertAction(role, action, device, body = {}) {
  if (!ROLE_ACTIONS[role]?.includes(action)) fail('Your inventory role cannot perform this action', 403);
  if (!device) return;
  if (device.archived) fail('Archived devices are read-only', 409);
  const rule = TRANSITIONS[action];
  if (!rule || !rule.from.includes(device.status)) fail(`${action.replaceAll('_', ' ')} is not available for ${device.status.replaceAll('_', ' ')}`, 409);
  if (!Number.isInteger(body.version) || body.version !== device.version) fail('This device changed. Refresh and try again.', 409);
  for (const field of rule.required || []) if (!clean(body[field])) fail(`${field.replace(/([A-Z])/g, ' $1')} is required`);
  if (device.pendingReturn && ['SCRAP', 'REPAIR', 'ARCHIVE'].includes(action)) fail('Confirm the old device has been returned first', 409);
}
const TEXT_FIELDS = ['brand', 'model', 'deviceType', 'supplier', 'location', 'merchant', 'branch', 'tid', 'mid', 'address', 'telco', 'simEi', 'engineer', 'remarks', 'reference', 'faultType', 'technician', 'repairStatus'];
function fields(body, allowed = TEXT_FIELDS) {
  const result = {};
  for (const key of allowed) if (body[key] !== undefined) result[key] = clean(body[key], key === 'remarks' ? 2000 : 500) || null;
  return result;
}
function snapshot(device) {
  const { events, documents, bank, ...data } = device;
  return { ...data, bankName: bank?.name || null };
}
module.exports = { STATUSES, TRANSITIONS, ROLE_ACTIONS, inventoryRole, fail, clean, date, assertAction, fields, snapshot };
