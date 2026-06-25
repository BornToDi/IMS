const prisma = require('../prismaClient');
const { isAdminRole, isBankRole, getUser, createNotification, notifyAdmins, nextCode } = require('../utils/workflow');

const userSelect = { id: true, name: true, email: true, userRole: true, bankName: true };

const workspaceInclude = {
  assignedEmployee: { select: { id: true, name: true, email: true } },
  taskUpdates: { include: { employee: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } }
};

const includeTicket = {
  bankUser: { select: userSelect },
  assignedAdmin: { select: userSelect },
  updates: { include: { user: { select: userSelect } }, orderBy: { createdAt: 'desc' } },
  workspaces: { include: workspaceInclude, orderBy: { createdAt: 'desc' } }
};

const DEFAULT_BANKS = ['AB Bank', 'EBL', 'AIBL', 'UCBL', 'DBBL', 'BRAC Bank', 'City Bank'];
const SERVICE_TYPES = ['Installation', 'Maintenance', 'Repair', 'Replacement', 'Network issue', 'POS not working', 'Paper roll issue', 'Settlement issue', 'Others'];

function clean(v) { return String(v || '').trim(); }
function isAssignableEmployee(role) {
  const r = String(role || '').toUpperCase();
  return r === 'EMPLOYEE' || r === 'FIELD_EMPLOYEE';
}
function bankOfUser(user) { return clean(user?.bankName) || (isBankRole(user?.userRole) ? clean(user?.name) : ''); }
function normalizeTicket(ticket) {
  if (!ticket) return ticket;
  const firstWorkspace = Array.isArray(ticket.workspaces) ? ticket.workspaces[0] || null : ticket.workspace || null;
  return { ...ticket, workspace: firstWorkspace };
}

async function currentUser(req, res) {
  const user = await getUser(req.userId);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return user;
}

function canSeeTicket(user, ticket) {
  if (!user || !ticket) return false;
  if (isAdminRole(user.userRole)) return true;
  if (ticket.bankUserId === user.id) return true;
  if (ticket.assignedEmployeeId === user.id) return true;
  const workspaces = ticket.workspaces || (ticket.workspace ? [ticket.workspace] : []);
  return workspaces.some((ws) => ws.ownerId === user.id || ws.assignedEmployeeId === user.id);
}

async function addTimeline(ticketId, userId, type, message) {
  if (!message) return null;
  return prisma.ticketUpdate.create({ data: { ticketId, userId, type, message } });
}

async function listTicketOptions(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const ownBank = bankOfUser(user);
  const bankWhere = isBankRole(user.userRole) ? { bankName: ownBank } : {};
  const [bankMasters, bankUsers, tickets, tasks, hardware, posRows] = await Promise.all([
    prisma.bankMaster.findMany({ select: { name: true }, orderBy: { name: 'asc' } }).catch(() => []),
    prisma.user.findMany({ where: { userRole: 'BANK' }, select: { name: true, bankName: true }, orderBy: { name: 'asc' } }),
    prisma.bankTicket.findMany({ where: bankWhere, select: { bankName: true, posSerial: true }, orderBy: { createdAt: 'desc' } }),
    prisma.workspace.findMany({ where: bankWhere, select: { bankName: true, posSerial: true }, orderBy: { createdAt: 'desc' } }),
    prisma.hardwareBatch.findMany({ where: isBankRole(user.userRole) ? { bankName: ownBank } : {}, select: { bankName: true }, orderBy: { createdAt: 'desc' } }),
    prisma.posSerial.findMany({ where: isBankRole(user.userRole) && ownBank ? { bankName: ownBank, status: 'ACTIVE' } : { status: 'ACTIVE' }, select: { bankName: true, serialNumber: true }, orderBy: [{ bankName: 'asc' }, { serialNumber: 'asc' }], take: 100 })
  ]);
  const bankNames = [...new Set([
    ...DEFAULT_BANKS,
    ...bankMasters.map((r) => clean(r.name)),
    ...posRows.map((r) => clean(r.bankName)),
    ...bankUsers.map((u) => clean(u.bankName) || clean(u.name)),
    ...tickets.map((t) => clean(t.bankName)),
    ...tasks.map((t) => clean(t.bankName)),
    ...hardware.map((h) => clean(h.bankName)),
    ownBank
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const posSerials = [...new Set([
    ...posRows.map((r) => clean(r.serialNumber)),
    ...tickets.map((r) => clean(r.posSerial)),
    ...tasks.map((r) => clean(r.posSerial))
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json({ banks: isBankRole(user.userRole) && ownBank ? [ownBank] : bankNames, posSerials, serviceTypes: SERVICE_TYPES });
}

async function listTickets(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const where = isAdminRole(user.userRole) ? {} : isBankRole(user.userRole) ? { bankUserId: user.id } : { OR: [{ assignedEmployeeId: user.id }, { workspaces: { some: { assignedEmployeeId: user.id } } }] };
  const tickets = await prisma.bankTicket.findMany({ where, include: includeTicket, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
  res.json(tickets.map(normalizeTicket));
}

async function createTicket(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isBankRole(user.userRole) && !isAdminRole(user.userRole)) return res.status(403).json({ error: 'Only bank/admin users can create tickets' });
  const { title, description, tidNumber, posSerial, zoneName, serviceType, merchantAddress, priority } = req.body;
  const bankName = isBankRole(user.userRole) ? (bankOfUser(user) || clean(req.body.bankName)) : clean(req.body.bankName);
  if (!bankName) return res.status(400).json({ error: 'Bank name is required' });
  if (!title && !tidNumber && !posSerial) return res.status(400).json({ error: 'Ticket title, TID or POS serial is required' });
  const ticket = await prisma.bankTicket.create({
    data: {
      ticketNo: nextCode('TKT'),
      title: title || `${tidNumber || posSerial || 'POS issue'}`,
      description: description || null,
      tidNumber: tidNumber || null,
      posSerial: posSerial || null,
      zoneName: zoneName || null,
      serviceType: serviceType || null,
      merchantAddress: merchantAddress || null,
      bankName,
      priority: priority || 'NORMAL',
      status: 'SUBMITTED',
      bankUserId: user.id,
      assignedAdminId: isAdminRole(user.userRole) ? user.id : null,
      updates: { create: { userId: user.id, type: 'SUBMITTED', message: `${user.name || user.email} submitted ticket for ${bankName}` } }
    },
    include: includeTicket
  });
  await notifyAdmins(req, `New bank ticket submitted: ${ticket.ticketNo} (${bankName})`, user.id);
  const io = req.app.locals.io;
  if (io) io.emit('ticket:updated', { ticketId: ticket.id });
  res.status(201).json(normalizeTicket(ticket));
}

async function getTicket(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const ticket = await prisma.bankTicket.findUnique({ where: { id: req.params.id }, include: includeTicket });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (!canSeeTicket(user, ticket)) return res.status(403).json({ error: 'Access denied' });
  res.json(normalizeTicket(ticket));
}

async function assignTicket(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isAdminRole(user.userRole)) return res.status(403).json({ error: 'Only admin can assign tickets' });
  const { employeeId, serviceType, note, isImportant } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'Employee is required' });
  const ticket = await prisma.bankTicket.findUnique({ where: { id: req.params.id }, include: includeTicket });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const employee = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  if (!isAssignableEmployee(employee.userRole)) return res.status(400).json({ error: 'Please assign an internal employee, not a bank/admin user' });

  let workspace = ticket.workspaces?.[0] || null;
  if (!workspace) {
    workspace = await prisma.workspace.create({ data: { name: `${ticket.ticketNo} • ${ticket.title}`, description: note || ticket.description || null, tidNumber: ticket.tidNumber || null, posSerial: ticket.posSerial || null, zoneName: ticket.zoneName || null, serviceType: serviceType || ticket.serviceType || null, merchantAddress: ticket.merchantAddress || null, bankName: ticket.bankName || null, assignedEmployeeId: employee.id, ownerId: user.id, ticketId: ticket.id, taskStatus: 'PENDING', isImportant: Boolean(isImportant || ticket.priority === 'HIGH' || ticket.priority === 'URGENT'), members: { create: [{ userId: user.id, role: 'ADMIN' }, { userId: employee.id, role: 'FIELD_EMPLOYEE' }] } } });
  } else {
    workspace = await prisma.workspace.update({ where: { id: workspace.id }, data: { assignedEmployeeId: employee.id, serviceType: serviceType || workspace.serviceType, bankName: ticket.bankName || workspace.bankName, isImportant: Boolean(isImportant || workspace.isImportant) } });
    await prisma.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: employee.id } }, update: { role: 'FIELD_EMPLOYEE' }, create: { workspaceId: workspace.id, userId: employee.id, role: 'FIELD_EMPLOYEE' } });
  }

  await prisma.bankTicket.update({ where: { id: ticket.id }, data: { status: 'ASSIGNED', assignedAdminId: user.id, assignedEmployeeId: employee.id } });
  await addTimeline(ticket.id, user.id, 'ASSIGNED', `Assigned to ${employee.name || employee.email}${note ? `: ${note}` : ''}`);
  await createNotification(req, { userId: employee.id, workspaceId: workspace.id, type: 'TASK_ASSIGNED', message: `Ticket ${ticket.ticketNo} assigned to you`, targetUrl: `/workspaces/${workspace.id}` });
  await createNotification(req, { userId: ticket.bankUserId, type: 'TICKET_UPDATE', message: `Ticket ${ticket.ticketNo} assigned to engineer ${employee.name || employee.email}`, targetUrl: `/tickets/${ticket.id}` });
  const io = req.app.locals.io;
  if (io) io.emit('ticket:updated', { ticketId: ticket.id });
  const updated = await prisma.bankTicket.findUnique({ where: { id: ticket.id }, include: includeTicket });
  res.json(normalizeTicket(updated));
}

async function addTicketUpdate(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const ticket = await prisma.bankTicket.findUnique({ where: { id: req.params.id }, include: includeTicket });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (!canSeeTicket(user, ticket)) return res.status(403).json({ error: 'Access denied' });
  const { message, type = 'COMMENT', status } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const update = await addTimeline(ticket.id, user.id, type, message);
  const nextData = status ? { status } : {};
  if (Object.keys(nextData).length) await prisma.bankTicket.update({ where: { id: ticket.id }, data: nextData });
  const recipients = [ticket.bankUserId, ticket.assignedAdminId, ticket.assignedEmployeeId].filter(Boolean).filter((id) => id !== user.id);
  await Promise.all([...new Set(recipients)].map((id) => createNotification(req, { userId: id, type: 'TICKET_UPDATE', message: `Ticket ${ticket.ticketNo}: ${message}`, targetUrl: `/tickets/${ticket.id}` })));
  const io = req.app.locals.io;
  if (io) io.emit('ticket:updated', { ticketId: ticket.id });
  res.status(201).json(update);
}

module.exports = { listTicketOptions, listTickets, createTicket, getTicket, assignTicket, addTicketUpdate };
