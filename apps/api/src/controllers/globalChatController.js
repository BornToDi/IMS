const prisma = require('../prismaClient');
const path = require('path');
const fs = require('fs');
const { notifyGlobalChatRecipients } = require('../utils/globalChatNotifications');
const publicUser = { id: true, name: true, email: true, avatarUrl: true, userRole: true, bankName: true };
const replyInclude = { select: { id: true, content: true, attachmentName: true, author: { select: publicUser } } };

async function postGlobalMessage(req, res) {
  try {
    const userId = req.userId;
    const { content, latitude, longitude, locationLabel, replyToId } = req.body;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!content) return res.status(400).json({ error: 'Content required' });

    const message = await prisma.globalMessage.create({
      data: {
        authorId: userId,
        content,
        latitude: latitude === undefined || latitude === null || latitude === '' ? null : Number(latitude),
        longitude: longitude === undefined || longitude === null || longitude === '' ? null : Number(longitude),
        locationLabel: locationLabel || null,
        replyToId: replyToId || null
      },
      include: { author: { select: publicUser }, replyTo: replyInclude }
    });

    const io = req.app?.locals?.io;
    if (io) io.to('global-chat-room').emit('new-global-message', message);
    notifyGlobalChatRecipients(req.app, message).catch((error) => {
      console.error('[globalChat] notification error:', error);
    });
    res.status(201).json(message);
  } catch (err) {
    console.error('[globalChat] post error:', err);
    res.status(500).json({ error: 'Failed to post message' });
  }
}

async function getGlobalMessages(req, res) {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    const take = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 100;
    const skip = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
    const messages = await prisma.globalMessage.findMany({
      include: { author: { select: publicUser }, replyTo: replyInclude },
      orderBy: { createdAt: 'desc' },
      take,
      skip
    });
    res.json(messages.reverse());
  } catch (err) {
    console.error('[globalChat] get error:', err);
    res.status(500).json({ error: 'Failed to fetch global messages' });
  }
}

async function uploadGlobalFile(req, res) {
  try {
    const userId = req.userId;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const fileUrl = `/uploads/${file.filename}`;
    const { content, latitude, longitude, locationLabel, replyToId } = req.body || {};

    const fileRecord = await prisma.globalFile.create({
      data: {
        userId,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        url: fileUrl
      }
    });

    const message = await prisma.globalMessage.create({
      data: {
        authorId: userId,
        content: content && String(content).trim() ? String(content).trim() : `📎 Uploaded: ${file.originalname}`,
        attachmentName: file.originalname,
        attachmentType: file.mimetype,
        attachmentSize: file.size,
        attachmentUrl: fileUrl,
        latitude: latitude === undefined || latitude === null || latitude === '' ? null : Number(latitude),
        longitude: longitude === undefined || longitude === null || longitude === '' ? null : Number(longitude),
        locationLabel: locationLabel || null,
        replyToId: replyToId || null
      },
      include: { author: { select: publicUser }, replyTo: replyInclude }
    });

    const io = req.app?.locals?.io;
    if (io) {
      io.to('global-chat-room').emit('new-global-message', message);
    }
    notifyGlobalChatRecipients(req.app, message).catch((error) => {
      console.error('[globalChat] notification error:', error);
    });

    res.status(201).json({ file: fileRecord, message });
  } catch (err) {
    console.error('[globalChat] upload file error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
}

async function getGlobalFiles(req, res) {
  try {
    const files = await prisma.globalFile.findMany({ orderBy: { uploadedAt: 'desc' } });
    res.json(files);
  } catch (err) {
    console.error('[globalChat] get files error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
}

module.exports = { postGlobalMessage, getGlobalMessages, uploadGlobalFile, getGlobalFiles };
