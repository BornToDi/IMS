const prisma = require('../prismaClient');

async function getAccessibleWorkspaceIds(userId) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true }
  });
  const owned = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: { id: true }
  });

  return [...new Set([
    ...memberships.map((item) => item.workspaceId),
    ...owned.map((item) => item.id)
  ])];
}

async function dashboardStats(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const workspaceIds = await getAccessibleWorkspaceIds(userId);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const now = new Date();

    const [totalGoals, completedThisWeek, overdueCount] = await Promise.all([
      prisma.goal.count({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.actionItem.count({
        where: {
          workspaceId: { in: workspaceIds },
          status: 'DONE',
          updatedAt: { gte: weekStart }
        }
      }),
      prisma.actionItem.count({
        where: {
          workspaceId: { in: workspaceIds },
          dueDate: { lt: now },
          status: { not: 'DONE' }
        }
      })
    ]);

    res.json({
      totalGoals,
      completedThisWeek,
      overdueCount
    });
  } catch (err) {
    console.error('[stats] dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
}

module.exports = { dashboardStats };