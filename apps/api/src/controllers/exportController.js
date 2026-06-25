const prisma = require('../prismaClient');

async function exportWorkspace(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    // ensure user has access
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!member && workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });

    const data = await prisma.$transaction([
      prisma.workspace.findUnique({ where: { id: workspaceId }, include: { members: { include: { user: true } }, goals: true, announcements: true, actionItems: true } }),
      prisma.auditLog.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } })
    ]);

    const payload = { workspace: data[0], auditLogs: data[1] };

    res.setHeader('Content-Disposition', `attachment; filename="workspace-${workspaceId}-export.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[export/workspace]', err);
    res.status(500).json({ error: 'Failed to export workspace' });
  }
}

module.exports = { exportWorkspace };
