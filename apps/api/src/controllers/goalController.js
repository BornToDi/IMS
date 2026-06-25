const prisma = require('../prismaClient');

async function assertWorkspaceAccess(workspaceId, userId) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return { error: { status: 404, message: 'Workspace not found' } };

  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
  if (!member && workspace.ownerId !== userId) {
    return { error: { status: 403, message: 'Access denied' } };
  }

  return { workspace, member };
}

async function listGoals(req, res) {
  const userId = req.userId;
  const { workspaceId } = req.params;
  const access = await assertWorkspaceAccess(workspaceId, userId);
  if (access.error) return res.status(access.error.status).json({ error: access.error.message });
  try {
    const goals = await prisma.goal.findMany({
      where: { workspaceId },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        milestones: true,
        activities: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        actionItems: { include: { assignee: { select: { id: true, name: true, avatarUrl: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(goals);
  } catch (err) {
    console.error('[listGoals] error', err);
    return res.status(500).json({ error: 'Failed to fetch goals' });
  }
}

async function createGoal(req, res) {
  const userId = req.userId;
  const { workspaceId } = req.params;
  const { title, description, ownerId, dueDate, status } = req.body;
  const access = await assertWorkspaceAccess(workspaceId, userId);
  if (access.error) return res.status(access.error.status).json({ error: access.error.message });
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
    const goal = await prisma.goal.create({
      data: { title, description, ownerId: ownerId || userId, dueDate: due, status: status || 'TODO', workspaceId },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        milestones: true,
        activities: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        actionItems: { include: { assignee: { select: { id: true, name: true, avatarUrl: true } } } }
      }
    })
    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { not: userId } },
      select: { userId: true }
    })
    const notes = await Promise.all(workspaceMembers.map((m) => prisma.notification.create({
      data: {
        userId: m.userId,
        workspaceId,
        type: 'GOAL',
        message: `New goal set in ${access.workspace.name}: ${goal.title}`,
        isRead: false
      }
    })))
    const io = req.app && req.app.locals && req.app.locals.io
    if (io) notes.forEach((note) => io.to(`user:${note.userId}`).emit('notification:new', note))

    res.status(201).json(goal)
  } catch (err) {
    console.error('[createGoal] error', err)
    return res.status(500).json({ error: 'Failed to create goal' })
  }
}

async function getGoal(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const goalRecord = await prisma.goal.findUnique({ where: { id }, include: { workspace: true } });
    if (!goalRecord) return res.status(404).json({ error: 'Goal not found' });
    const access = await assertWorkspaceAccess(goalRecord.workspaceId, userId);
    if (access.error) return res.status(access.error.status).json({ error: access.error.message });
    const goal = await prisma.goal.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        workspace: { select: { id: true, name: true } },
        milestones: true,
        activities: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        actionItems: { include: { assignee: { select: { id: true, name: true, avatarUrl: true } } } }
      }
    });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  } catch (err) {
    console.error('[getGoal] error', err);
    return res.status(500).json({ error: 'Failed to fetch goal' });
  }
}

async function updateGoal(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { title, description, ownerId, dueDate, status } = req.body;
    const goal = await prisma.goal.findUnique({ where: { id }, include: { workspace: true } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: goal.workspaceId, userId } });
    if (!member && goal.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
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
    const updated = await prisma.goal.update({
      where: { id },
      data: { title, description, ownerId, dueDate: due, status },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        milestones: true,
        activities: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        actionItems: { include: { assignee: { select: { id: true, name: true, avatarUrl: true } } } }
      }
    })
    res.json(updated)
  } catch (err) {
    console.error('[updateGoal] error', err)
    return res.status(500).json({ error: 'Failed to update goal' })
  }
}

async function deleteGoal(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const goal = await prisma.goal.findUnique({ where: { id }, include: { workspace: true } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: goal.workspaceId, userId } });
    if (!member && goal.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
    await prisma.$transaction(async (tx) => {
      await tx.goalActivity.deleteMany({ where: { goalId: id } });
      await tx.milestone.deleteMany({ where: { goalId: id } });
      await tx.actionItem.updateMany({ where: { goalId: id }, data: { goalId: null } });
      await tx.goal.delete({ where: { id } });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[deleteGoal] error', err);
    return res.status(500).json({ error: 'Failed to delete goal' });
  }
}

async function addMilestone(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { title, type } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const goal = await prisma.goal.findUnique({ where: { id }, include: { workspace: true } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: goal.workspaceId, userId } });
    if (!member && goal.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
    const milestone = await prisma.milestone.create({
      data: { title, type: type || 'GENERAL', goalId: id, progress: 0 }
    });
    res.status(201).json(milestone);
  } catch (err) {
    console.error('[addMilestone] error', err);
    return res.status(500).json({ error: 'Failed to create milestone' });
  }
}

async function updateMilestone(req, res) {
  const userId = req.userId;
  const milestoneId = req.params.milestoneId || req.params.id;
  const { title, progress, type } = req.body;
  const milestoneRecord = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { goal: { include: { workspace: true } } } });
  if (!milestoneRecord) return res.status(404).json({ error: 'Milestone not found' });
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: milestoneRecord.goal.workspaceId, userId } });
  if (!member && milestoneRecord.goal.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });

  const nextProgress = progress === undefined || progress === null || progress === '' ? milestoneRecord.progress : Number(progress)
  if (Number.isNaN(nextProgress) || nextProgress < 0 || nextProgress > 100) {
    return res.status(400).json({ error: 'Progress must be between 0 and 100' })
  }

  const milestone = await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(type !== undefined ? { type } : {}),
      progress: nextProgress
    }
  });
  res.json(milestone);
}

async function deleteMilestone(req, res) {
  try {
    const userId = req.userId;
    const milestoneId = req.params.milestoneId || req.params.id;
    const milestoneRecord = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { goal: { include: { workspace: true } } } });
    if (!milestoneRecord) return res.status(404).json({ error: 'Milestone not found' });
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: milestoneRecord.goal.workspaceId, userId } });
    if (!member && milestoneRecord.goal.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
    await prisma.milestone.delete({ where: { id: milestoneId } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[deleteMilestone] error', err);
    return res.status(500).json({ error: 'Failed to delete milestone' });
  }
}

async function addActivity(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const goal = await prisma.goal.findUnique({ where: { id }, include: { workspace: true } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: goal.workspaceId, userId } });
    if (!member && goal.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
    const activity = await prisma.goalActivity.create({
      data: { goalId: id, userId, message },
      include: { user: true }
    });
    res.status(201).json(activity);
  } catch (err) {
    console.error('[addActivity] error', err);
    return res.status(500).json({ error: 'Failed to add activity' });
  }
}

async function getActivities(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const goal = await prisma.goal.findUnique({ where: { id }, include: { workspace: true } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: goal.workspaceId, userId } });
    if (!member && goal.workspace.ownerId !== userId) return res.status(403).json({ error: 'Access denied' });
    const activities = await prisma.goalActivity.findMany({
      where: { goalId: id },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(activities);
  } catch (err) {
    console.error('[getActivities] error', err);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }
}

module.exports = {
  listGoals,
  createGoal,
  getGoal,
  updateGoal,
  deleteGoal,
  addMilestone,
  updateMilestone,
  deleteMilestone,
  addActivity,
  getActivities
};
