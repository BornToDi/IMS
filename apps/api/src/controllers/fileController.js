const prisma = require('../prismaClient');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function uploadFile(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Check if user is member of workspace
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const fileUrl = `/uploads/${file.filename}`;

    const dbFile = await prisma.file.create({
      data: {
        workspaceId,
        userId,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        url: fileUrl
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, members: { select: { userId: true } } }
    });

    const io = req.app && req.app.locals && req.app.locals.io;
    if (workspace) {
      const recipients = workspace.members.map((m) => m.userId).filter((id) => id !== userId);
      const notes = await Promise.all(recipients.map((recipientId) => prisma.notification.create({
        data: {
          userId: recipientId,
          workspaceId,
          type: 'FILE',
          message: `${dbFile.user.name || dbFile.user.email} uploaded ${dbFile.name} in ${workspace.name}`,
          isRead: false
        }
      })));
      if (io) notes.forEach((note) => io.to(`user:${note.userId}`).emit('notification:new', note));
    }

    res.status(201).json(dbFile);
  } catch (err) {
    console.error('[fileController] uploadFile error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
}

async function getFiles(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;

    // Check if user is member of workspace
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const files = await prisma.file.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    res.json(files);
  } catch (err) {
    console.error('[fileController] getFiles error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
}

async function deleteFile(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId, fileId } = req.params;

    const file = await prisma.file.findUnique({
      where: { id: fileId }
    });

    if (!file || file.workspaceId !== workspaceId) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this file' });
    }

    await prisma.file.delete({
      where: { id: fileId }
    });

    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('[fileController] deleteFile error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
}

module.exports = {
  uploadFile,
  getFiles,
  deleteFile
};
