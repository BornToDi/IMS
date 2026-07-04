const prisma = require('../prismaClient');

function isAssignableEmployee(role) {
  const r = String(role || '').toUpperCase();
  return r === 'EMPLOYEE' || r === 'FIELD_EMPLOYEE';
}
function isAdminRole(role) {
  return ['ADMIN', 'MANAGEMENT'].includes(String(role || '').toUpperCase());
}

const workspaceInclude = {
  owner: { select: { id: true, name: true, email: true, bankName: true } },
  assignedEmployee: { select: { id: true, name: true, email: true } },
  members: { include: { user: { select: { id: true, name: true, email: true, userRole: true } } } },
  taskUpdates: {
    include: {
      employee: { select: { id: true, name: true, email: true } },
      attachments: { include: { uploadedBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } }
    },
    orderBy: { createdAt: 'desc' }
  },
  taskAttachments: { include: { uploadedBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
  ticket: { select: { id: true, ticketNo: true, title: true, bankUserId: true, bankName: true, status: true } }
};

function canViewWorkspace(workspace, userId) {
  if (!workspace || !userId) return false;
  if (workspace.ownerId === userId || workspace.assignedEmployeeId === userId) return true;
  return Array.isArray(workspace.members) && workspace.members.some((m) => m.userId === userId);
}

async function ensureWorkspaceAccess(id, userId) {
  const workspace = await prisma.workspace.findUnique({ where: { id }, include: { members: true } });
  if (!workspace) return { error: 'Workspace not found', status: 404 };
  if (!canViewWorkspace(workspace, userId)) return { error: 'Access denied', status: 403 };
  return { workspace };
}

async function emitWorkspaceUpdate(req, workspaceId, payload) {
  const io = req.app && req.app.locals && req.app.locals.io;
  if (io) io.to(`workspace:${workspaceId}`).emit('workspace:task:updated', payload);
}

async function createNotification(req, { userId, workspaceId, type, message, targetUrl = null }) {
  if (!userId) return null;
  const note = await prisma.notification.create({ data: { userId, workspaceId, type, message, targetUrl, isRead: false } });
  const io = req.app && req.app.locals && req.app.locals.io;
  if (io) io.to(`user:${note.userId}`).emit('notification:new', note);
  return note;
}

async function listRegisteredUsers(req, res) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { userRole: true } });
  if (!isAdminRole(current?.userRole)) return res.status(403).json({ error: 'Only admin can list assignable employees' });
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      userRole: { in: ['EMPLOYEE', 'FIELD_EMPLOYEE'] }
    },
    select: { id: true, name: true, email: true, userRole: true },
    orderBy: { name: 'asc' }
  });
  res.json(users);
}

async function listWorkspaces(req, res) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { assignedEmployeeId: userId },
        { members: { some: { userId } } }
      ]
    },
    include: workspaceInclude,
    orderBy: { createdAt: 'desc' }
  });
  res.json(workspaces);
}

async function listMyTasks(req, res) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const tasks = await prisma.workspace.findMany({
    where: { assignedEmployeeId: userId },
    include: workspaceInclude,
    orderBy: [{ taskStatus: 'asc' }, { createdAt: 'desc' }]
  });
  res.json(tasks);
}

async function createWorkspace(req, res) {
  const userId = req.userId;
  const {
    name,
    description,
    accentColor,
    tidNumber,
    posSerial,
    zoneName,
    serviceType,
    merchantAddress,
    bankName,
    assignedEmployeeId,
    assignedEmployeeEmail,
    isImportant
  } = req.body;

  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!tidNumber && !name) return res.status(400).json({ error: 'TID number or task name is required' });

  let assignedEmployee = null;
  if (assignedEmployeeId) {
    assignedEmployee = await prisma.user.findUnique({ where: { id: assignedEmployeeId } });
  } else if (assignedEmployeeEmail) {
    assignedEmployee = await prisma.user.findUnique({ where: { email: String(assignedEmployeeEmail).trim().toLowerCase() } });
  }
  if ((assignedEmployeeId || assignedEmployeeEmail) && !assignedEmployee) return res.status(404).json({ error: 'Assigned employee not found' });
  if (assignedEmployee && !isAssignableEmployee(assignedEmployee.userRole)) return res.status(400).json({ error: 'Please assign an internal employee, not a bank/admin user' });

  const title = name || `${tidNumber || 'Task'} ${serviceType ? `• ${serviceType}` : ''}`.trim();

  const workspace = await prisma.workspace.create({
    data: {
      name: title,
      description: description || null,
      accentColor: accentColor || '#111827',
      tidNumber: tidNumber || null,
      posSerial: posSerial || null,
      zoneName: zoneName || null,
      serviceType: serviceType || null,
      merchantAddress: merchantAddress || null,
      bankName: bankName || null,
      assignedEmployeeId: assignedEmployee?.id || null,
      taskStatus: 'PENDING',
      isImportant: Boolean(isImportant),
      ownerId: userId,
      members: {
        create: [
          { userId, role: 'ADMIN' },
          ...(assignedEmployee && assignedEmployee.id !== userId ? [{ userId: assignedEmployee.id, role: 'FIELD_EMPLOYEE' }] : [])
        ]
      }
    },
    include: workspaceInclude
  });

  if (assignedEmployee && assignedEmployee.id !== userId) {
    await createNotification(req, {
      userId: assignedEmployee.id,
      workspaceId: workspace.id,
      type: 'TASK_ASSIGNED',
      message: `New field task assigned: ${workspace.tidNumber || workspace.name}`,
      targetUrl: `/workspaces/${workspace.id}`
    });
  }

  res.status(201).json(workspace);
}

async function getWorkspace(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, include: workspaceInclude });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (!canViewWorkspace(workspace, userId)) return res.status(403).json({ error: 'Access denied' });
  res.json(workspace);
}

async function updateWorkspace(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const { name, description, accentColor, tidNumber, posSerial, zoneName, serviceType, merchantAddress, bankName, assignedEmployeeId, isImportant } = req.body;
  const workspace = await prisma.workspace.findUnique({ where: { id }, include: { members: true } });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (workspace.ownerId !== userId) return res.status(403).json({ error: 'Only creator can edit this task' });

  let newAssigned = null;
  if (assignedEmployeeId) {
    newAssigned = await prisma.user.findUnique({ where: { id: assignedEmployeeId } });
    if (!newAssigned) return res.status(404).json({ error: 'Assigned employee not found' });
    if (!isAssignableEmployee(newAssigned.userRole)) return res.status(400).json({ error: 'Please assign an internal employee, not a bank/admin user' });
  }

  const updated = await prisma.workspace.update({
    where: { id },
    data: { name, description, accentColor, tidNumber, posSerial, zoneName, serviceType, merchantAddress, bankName, assignedEmployeeId: assignedEmployeeId || null, ...(isImportant !== undefined ? { isImportant: Boolean(isImportant) } : {}) },
    include: workspaceInclude
  });

  if (newAssigned) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: id, userId: newAssigned.id } },
      update: { role: 'FIELD_EMPLOYEE' },
      create: { workspaceId: id, userId: newAssigned.id, role: 'FIELD_EMPLOYEE' }
    });
    if (newAssigned.id !== workspace.assignedEmployeeId) {
      await createNotification(req, { userId: newAssigned.id, workspaceId: id, type: 'TASK_ASSIGNED', message: `Field task assigned: ${updated.tidNumber || updated.name}`, targetUrl: `/workspaces/${id}` });
    }
  }

  await emitWorkspaceUpdate(req, id, updated);
  res.json(updated);
}

async function deleteWorkspace(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const workspace = await prisma.workspace.findUnique({ where: { id } });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (workspace.ownerId !== userId) return res.status(403).json({ error: 'Only owner can delete workspace' });
  await prisma.$transaction(async (tx) => {
    const goals = await tx.goal.findMany({ where: { workspaceId: id }, select: { id: true } });
    const goalIds = goals.map((goal) => goal.id);
    if (goalIds.length) {
      await tx.goalActivity.deleteMany({ where: { goalId: { in: goalIds } } });
      await tx.milestone.deleteMany({ where: { goalId: { in: goalIds } } });
    }
    await tx.workspaceAttachment.deleteMany({ where: { workspaceId: id } });
    await tx.workspaceUpdate.deleteMany({ where: { workspaceId: id } });
    await tx.actionItem.deleteMany({ where: { workspaceId: id } });
    await tx.meetingInvite.deleteMany({ where: { meeting: { workspaceId: id } } });
    await tx.meeting.deleteMany({ where: { workspaceId: id } });
    await tx.announcementReaction.deleteMany({ where: { announcement: { workspaceId: id } } });
    await tx.announcementComment.deleteMany({ where: { announcement: { workspaceId: id } } });
    await tx.announcement.deleteMany({ where: { workspaceId: id } });
    await tx.notification.deleteMany({ where: { workspaceId: id } });
    await tx.auditLog.deleteMany({ where: { workspaceId: id } });
    await tx.message.deleteMany({ where: { workspaceId: id } });
    await tx.file.deleteMany({ where: { workspaceId: id } });
    if (goalIds.length) await tx.goal.deleteMany({ where: { id: { in: goalIds } } });
    await tx.workspaceMember.deleteMany({ where: { workspaceId: id } });
    await tx.workspace.delete({ where: { id } });
  });
  res.json({ ok: true });
}

async function addTaskUpdate(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const { serviceType, remarks, status = 'IN_PROGRESS', latitude, longitude, locationLabel } = req.body;
  const access = await ensureWorkspaceAccess(id, userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const workspace = access.workspace;

  if (workspace.assignedEmployeeId && workspace.assignedEmployeeId !== userId && workspace.ownerId !== userId) {
    return res.status(403).json({ error: 'Only assigned employee or creator can update this task' });
  }

  const nextStatus = status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
  const update = await prisma.workspaceUpdate.create({
    data: {
      workspaceId: id,
      employeeId: userId,
      serviceType: serviceType || null,
      remarks: remarks || null,
      status: nextStatus,
      latitude: latitude === undefined || latitude === null || latitude === '' ? null : Number(latitude),
      longitude: longitude === undefined || longitude === null || longitude === '' ? null : Number(longitude),
      locationLabel: locationLabel || null
    },
    include: { employee: { select: { id: true, name: true, email: true } }, attachments: true }
  });

  const updatedWorkspace = await prisma.workspace.update({
    where: { id },
    data: {
      taskStatus: nextStatus,
      startedAt: workspace.startedAt || new Date(),
      completedAt: nextStatus === 'COMPLETED' ? new Date() : null
    },
    include: workspaceInclude
  });

  if (workspace.ownerId !== userId) {
    await createNotification(req, {
      userId: workspace.ownerId,
      workspaceId: id,
      type: 'TASK_UPDATE',
      message: `${update.employee.name || update.employee.email} updated ${workspace.tidNumber || workspace.name}: ${nextStatus}`, targetUrl: `/workspaces/${id}`
    });
  }

  if (workspace.ticketId) {
    const ticket = await prisma.bankTicket.findUnique({ where: { id: workspace.ticketId } });
    if (ticket) {
      const ticketStatus = nextStatus === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
      await prisma.bankTicket.update({ where: { id: ticket.id }, data: { status: ticketStatus } });
      await prisma.ticketUpdate.create({
        data: { ticketId: ticket.id, userId, type: 'FIELD_UPDATE', message: `${update.employee.name || update.employee.email}: ${serviceType || remarks || nextStatus}` }
      });
      if (ticket.bankUserId !== userId) {
        await createNotification(req, { userId: ticket.bankUserId, type: 'TICKET_UPDATE', message: `Ticket ${ticket.ticketNo}: ${serviceType || remarks || nextStatus}`, targetUrl: `/tickets/${ticket.id}` });
      }
    }
  }

  await emitWorkspaceUpdate(req, id, updatedWorkspace);
  res.status(201).json(update);
}

async function uploadTaskAttachment(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const files = req.files || (req.file ? [req.file] : []);
  const { updateId } = req.body || {};
  if (!files.length) return res.status(400).json({ error: 'No files provided' });
  const access = await ensureWorkspaceAccess(id, userId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const rows = await Promise.all(files.map((file) => prisma.workspaceAttachment.create({
    data: {
      workspaceId: id,
      updateId: updateId || null,
      uploadedById: userId,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`
    },
    include: { uploadedBy: { select: { id: true, name: true, email: true } } }
  })));

  const workspace = await prisma.workspace.findUnique({ where: { id }, include: workspaceInclude });
  await emitWorkspaceUpdate(req, id, workspace);
  if (workspace && workspace.ownerId !== userId) {
    await createNotification(req, { userId: workspace.ownerId, workspaceId: id, type: 'TASK_FILE', message: `${rows.length} field image/file uploaded for ${workspace.tidNumber || workspace.name}`, targetUrl: `/workspaces/${id}` });
  }
  res.status(201).json(rows);
}

async function recomputeWorkspaceTaskState(workspaceId) {
  const updates = await prisma.workspaceUpdate.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  });
  const hasCompleted = updates.some((u) => u.status === 'COMPLETED');
  const nextStatus = hasCompleted ? 'COMPLETED' : (updates.length ? 'IN_PROGRESS' : 'PENDING');
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      taskStatus: nextStatus,
      startedAt: updates.length ? updates[updates.length - 1].createdAt : null,
      completedAt: hasCompleted ? (updates.find((u) => u.status === 'COMPLETED')?.createdAt || new Date()) : null
    },
    include: workspaceInclude
  });
}

async function updateTaskUpdate(req, res) {
  const userId = req.userId;
  const { id, updateId } = req.params;
  const { serviceType, remarks, status, latitude, longitude, locationLabel } = req.body;
  const access = await ensureWorkspaceAccess(id, userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const workspace = access.workspace;
  const existing = await prisma.workspaceUpdate.findUnique({ where: { id: updateId } });
  if (!existing || existing.workspaceId !== id) return res.status(404).json({ error: 'Work update not found' });
  if (existing.employeeId !== userId && workspace.ownerId !== userId) {
    return res.status(403).json({ error: 'Only update author or task creator can edit this update' });
  }
  const nextStatus = status === 'COMPLETED' ? 'COMPLETED' : (status === 'PENDING' ? 'PENDING' : 'IN_PROGRESS');
  const updated = await prisma.workspaceUpdate.update({
    where: { id: updateId },
    data: {
      serviceType: serviceType === undefined ? existing.serviceType : (serviceType || null),
      remarks: remarks === undefined ? existing.remarks : (remarks || null),
      status: nextStatus,
      latitude: latitude === undefined ? existing.latitude : (latitude === null || latitude === '' ? null : Number(latitude)),
      longitude: longitude === undefined ? existing.longitude : (longitude === null || longitude === '' ? null : Number(longitude)),
      locationLabel: locationLabel === undefined ? existing.locationLabel : (locationLabel || null)
    },
    include: { employee: { select: { id: true, name: true, email: true } }, attachments: true }
  });
  const updatedWorkspace = await recomputeWorkspaceTaskState(id);
  await emitWorkspaceUpdate(req, id, updatedWorkspace);
  res.json(updated);
}

async function deleteTaskUpdate(req, res) {
  const userId = req.userId;
  const { id, updateId } = req.params;
  const access = await ensureWorkspaceAccess(id, userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const workspace = access.workspace;
  const existing = await prisma.workspaceUpdate.findUnique({ where: { id: updateId } });
  if (!existing || existing.workspaceId !== id) return res.status(404).json({ error: 'Work update not found' });
  if (existing.employeeId !== userId && workspace.ownerId !== userId) {
    return res.status(403).json({ error: 'Only update author or task creator can delete this update' });
  }
  await prisma.workspaceAttachment.deleteMany({ where: { updateId } });
  await prisma.workspaceUpdate.delete({ where: { id: updateId } });
  const updatedWorkspace = await recomputeWorkspaceTaskState(id);
  await emitWorkspaceUpdate(req, id, updatedWorkspace);
  res.json({ ok: true });
}

async function inviteMember(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const { email, role = 'MEMBER' } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const workspace = await prisma.workspace.findUnique({ where: { id } });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (workspace.ownerId !== userId) return res.status(403).json({ error: 'Only the workspace owner can invite members' });
  const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const member = await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: id, userId: user.id } },
    update: { role },
    create: { workspaceId: id, userId: user.id, role }
  });
  await createNotification(req, { userId: user.id, workspaceId: id, type: 'INVITE', message: `You have been invited to field task: ${workspace.name}` });
  res.status(201).json(member);
}

async function listMembers(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, include: { members: true } });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (!canViewWorkspace(workspace, userId)) return res.status(403).json({ error: 'Access denied' });
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, userRole: true, bankName: true } } }
  });
  res.json(members);
}

async function updateMemberRole(req, res) {
  const userId = req.userId;
  const { id, memberId } = req.params;
  const { role } = req.body;
  const workspace = await prisma.workspace.findUnique({ where: { id } });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
  const existing = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId: id } });
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  if (!String(role || '').trim()) return res.status(400).json({ error: 'Role is required' });
  const member = await prisma.workspaceMember.update({ where: { id: memberId }, data: { role: String(role).trim().toUpperCase() } });
  res.json(member);
}

async function removeMember(req, res) {
  const userId = req.userId;
  const { id, memberId } = req.params;
  const workspace = await prisma.workspace.findUnique({ where: { id } });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  if (workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
  const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId: id } });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (member.userId === workspace.ownerId) return res.status(400).json({ error: 'Workspace owner cannot be removed' });
  await prisma.workspaceMember.delete({ where: { id: memberId } });
  res.json({ ok: true });
}

module.exports = {
  listRegisteredUsers,
  listWorkspaces,
  listMyTasks,
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  addTaskUpdate,
  updateTaskUpdate,
  deleteTaskUpdate,
  uploadTaskAttachment,
  inviteMember,
  listMembers,
  updateMemberRole,
  removeMember,
};
