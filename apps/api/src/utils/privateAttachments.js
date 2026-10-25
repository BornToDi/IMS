const path = require('path');
const fs = require('fs/promises');
const DIRECTORY = path.resolve(process.env.PRIVATE_MESSAGE_UPLOAD_DIR || path.join(__dirname, '../../private-uploads'));
const MAX_SIZE = 20 * 1024 * 1024;
async function imageType(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const bytes = Buffer.alloc(12);
    const { bytesRead } = await handle.read(bytes, 0, 12, 0);
    if (bytesRead >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (bytesRead >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (bytesRead >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
    if (bytesRead === 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return 'application/octet-stream';
  } finally { await handle.close(); }
}
module.exports = { DIRECTORY, MAX_SIZE, imageType };
