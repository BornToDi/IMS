const prisma = require('../prismaClient');

async function listActionItems(req, res) {
  const userId = req.userId;
  const { workspaceId } = req.params;
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
  if (!member && workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
  const items = await prisma.actionItem.findMany({
    where: { workspaceId },
    include: { assignee: true }
  });
  res.json(items);
}

async function createActionItem(req, res) {
  const userId = req.userId;
  const { workspaceId } = req.params;
  const { title, description, assigneeId, priority, dueDate, goalId } = req.body;
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
  if (!member && workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
  if (!title) return res.status(400).json({ error: 'Title required' });
  let due = null
  if (dueDate) {
    let isoStr = dueDate
    if (typeof dueDate === 'string' && dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      isoStr = `${dueDate}T00:00:00Z`
    }
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid dueDate format' })
    due = d
  }
  try {
    const item = await prisma.actionItem.create({
      data: { workspaceId, title, description, assigneeId, priority: priority || 'MEDIUM', dueDate: due, goalId, status: 'TODO' },
      include: { assignee: true }
    })
    res.status(201).json(item)
  } catch (err) {
    console.error('[createActionItem] error', err)
    return res.status(500).json({ error: 'Failed to create action item' })
  }
}

async function getActionItem(req, res) {
  const { id } = req.params;
  const item = await prisma.actionItem.findUnique({ where: { id }, include: { assignee: true } });
  if (!item) return res.status(404).json({ error: 'Action item not found' });
  res.json(item);
}

async function updateActionItem(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const { title, description, assigneeId, priority, dueDate } = req.body;
  const item = await prisma.actionItem.findUnique({ where: { id }, include: { workspace: true } });
  if (!item) return res.status(404).json({ error: 'Action item not found' });
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: item.workspaceId, userId }
  });
  if (!member && item.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
  let due = undefined
  if (dueDate !== undefined) {
    if (dueDate === null || dueDate === '') {
      due = null
    } else {
      let isoStr = dueDate
      if (typeof dueDate === 'string' && dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        isoStr = `${dueDate}T00:00:00Z`
      }
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid dueDate format' })
      due = d
    }
  }
  try {
    const updated = await prisma.actionItem.update({
      where: { id },
      data: { title, description, assigneeId, priority, dueDate: due },
      include: { assignee: true }
    })
    res.json(updated)
  } catch (err) {
    console.error('[updateActionItem] error', err)
    return res.status(500).json({ error: 'Failed to update action item' })
  }
}

async function deleteActionItem(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const item = await prisma.actionItem.findUnique({ where: { id }, include: { workspace: true } });
  if (!item) return res.status(404).json({ error: 'Action item not found' });
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: item.workspaceId, userId }
  });
  if (!member && item.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
  await prisma.actionItem.delete({ where: { id } });
  res.json({ ok: true });
}

async function updateStatus(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });
  
  const item = await prisma.actionItem.findUnique({ where: { id }, include: { workspace: true } });
  if (!item) return res.status(404).json({ error: 'Action item not found' });
  
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: item.workspaceId, userId }
  });
  if (!member && item.workspace.ownerId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    const updated = await prisma.actionItem.update({
      where: { id },
      data: { status },
      include: { assignee: true }
    });
    res.json(updated);
  } catch (err) {
    console.error('[updateStatus] error', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
}

module.exports = {
  listActionItems,
  createActionItem,
  getActionItem,
  updateActionItem,
  deleteActionItem,
  updateStatus
};
