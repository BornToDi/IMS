const prisma = require('../prismaClient');

async function createAnnouncement(req, res) {
  try {
    const { workspaceId, title, content, isPinned } = req.body;
    const authorId = req.user?.id || req.userId;

    if (!authorId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!title || !content) {
      return res.status(400).json({ error: 'Missing required fields: title and content' });
    }

    // If workspaceId is provided, verify user is member
    if (workspaceId) {
      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: authorId }
      });
      if (!member) {
        return res.status(403).json({ error: 'Not a member of this workspace' });
      }
    }
    // If no workspaceId, it's a global announcement - anyone authenticated can create

    const announcement = await prisma.announcement.create({
      data: { 
        ...(workspaceId && { workspaceId }), 
        authorId, 
        title, 
        content, 
        isPinned: isPinned || false 
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: true,
        comments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } }
      }
    });

    res.status(201).json(announcement);
  } catch (error) {
    console.error('[announcement/create]', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
}

async function listAnnouncements(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id || req.userId;

    let where = {};
    
    if (workspaceId) {
      // Workspace-specific announcements: verify user is a member
      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId }
      });
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }
      });
      
      if (!member && workspace?.ownerId !== userId) {
        return res.status(403).json({ error: 'Not a member of this workspace' });
      }
      
      where = { workspaceId };
    } else {
      // Global announcements: only those with no workspaceId
      where = { workspaceId: null };
    }

    const announcements = await prisma.announcement.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: { include: { user: { select: { id: true } } } },
        comments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } }
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }]
    });

    res.json(announcements);
  } catch (error) {
    console.error('[announcement/list]', error);
    res.status(500).json({ error: 'Failed to list announcements' });
  }
}

async function getAnnouncement(req, res) {
  try {
    const { id } = req.params;

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        comments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } }
      }
    });

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json(announcement);
  } catch (error) {
    console.error('[announcement/get]', error);
    res.status(500).json({ error: 'Failed to get announcement' });
  }
}

async function updateAnnouncement(req, res) {
  try {
    const { id } = req.params;
    const { title, content, isPinned } = req.body;
    const userId = req.user?.id || req.userId;

    const announcement = await prisma.announcement.findUnique({ where: { id } });
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (announcement.authorId !== userId) {
      return res.status(403).json({ error: 'Only author can edit this announcement' });
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(isPinned !== undefined && { isPinned })
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reactions: true,
        comments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('[announcement/update]', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
}

async function deleteAnnouncement(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const announcement = await prisma.announcement.findUnique({ where: { id } });
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (announcement.authorId !== userId) {
      return res.status(403).json({ error: 'Only author can delete this announcement' });
    }

    await prisma.announcement.delete({ where: { id } });
    res.json({ success: true, id });
  } catch (error) {
    console.error('[announcement/delete]', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
}

async function pinAnnouncement(req, res) {
  const userId = req.userId;
  const { id } = req.params;
  const announcement = await prisma.announcement.findUnique({ where: { id }, include: { workspace: true } });
  if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
  
  // For global announcements (no workspace), only author can pin
  if (!announcement.workspaceId) {
    if (announcement.authorId !== userId) {
      return res.status(403).json({ error: 'Only author can pin global announcements' });
    }
  } else {
    // For workspace announcements, only workspace owner/admin can pin
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: announcement.workspaceId, userId }
    });
    if (!member && announcement.workspace.ownerId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (announcement.workspace.ownerId !== userId && member.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can pin' });
    }
  }
  
  const updated = await prisma.announcement.update({
    where: { id },
    data: { isPinned: !announcement.isPinned },
    include: { author: true }
  });
  res.json(updated);
}

async function addReaction(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'emoji required' });
    }

    // Check if user already reacted with this emoji
    const existing = await prisma.announcementReaction.findFirst({
      where: { announcementId: id, userId, emoji }
    });

    if (existing) {
      // Remove reaction
      await prisma.announcementReaction.delete({ where: { id: existing.id } });
      return res.json({ action: 'removed', reaction: existing });
    }

    // Add reaction
    const reaction = await prisma.announcementReaction.create({
      data: { announcementId: id, userId, emoji },
      include: { user: { select: { id: true, name: true } } }
    });

    res.status(201).json({ action: 'added', reaction });
  } catch (error) {
    console.error('[announcement/addReaction]', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
}

async function removeReaction(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'emoji required' });
    }

    await prisma.announcementReaction.deleteMany({
      where: { announcementId: id, userId, emoji }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[announcement/removeReaction]', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
}

async function addComment(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }

    const comment = await prisma.announcementComment.create({
      data: { announcementId: id, userId, content },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } }
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('[announcement/addComment]', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
}

async function getComments(req, res) {
  const { id } = req.params;
  const comments = await prisma.announcementComment.findMany({
    where: { announcementId: id },
    include: { user: true }
  });
  res.json(comments);
}

async function deleteComment(req, res) {
  try {
    const userId = req.userId;
    const { commentId } = req.params;

    const comment = await prisma.announcementComment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.userId !== userId) {
      return res.status(403).json({ error: 'Only author can delete this comment' });
    }

    await prisma.announcementComment.delete({ where: { id: commentId } });
    res.json({ success: true, id: commentId });
  } catch (error) {
    console.error('[announcement/deleteComment]', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}

module.exports = {
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  pinAnnouncement,
  addReaction,
  removeReaction,
  addComment,
  getComments,
  deleteComment
};
