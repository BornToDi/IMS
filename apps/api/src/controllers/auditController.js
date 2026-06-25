const prisma = require('../prismaClient');

async function listAuditLogs(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    // only owner or admin can view audit logs
    if (workspace.ownerId !== userId) {
      const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
      if (!member || member.role !== 'ADMIN') return res.status(403).json({ error: 'Access denied' });
    }
    const logs = await prisma.auditLog.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
    res.json(logs);
  } catch (err) {
    console.error('[audit/list]', err);
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
}

module.exports = { listAuditLogs };
