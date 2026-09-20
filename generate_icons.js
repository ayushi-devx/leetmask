const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(size, drawFn) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image scanlines
  const scanlines = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    scanlines[rowOffset] = 0; // filter byte: None
    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, size);
      scanlines[pixelOffset] = r;
      scanlines[pixelOffset + 1] = g;
      scanlines[pixelOffset + 2] = b;
      scanlines[pixelOffset + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Icon design: Rounded square with dark theme (#1e1e1e) and LeetCode orange (#FFA116) mask/slash badge
function drawIcon(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const cornerR = size * 0.22;

  // Background rounded rectangle
  const dx = Math.max(Math.abs(x - cx) - (cx - cornerR), 0);
  const dy = Math.max(Math.abs(y - cy) - (cy - cornerR), 0);
  const distFromCorner = Math.sqrt(dx * dx + dy * dy);

  if (distFromCorner > cornerR) {
    return [0, 0, 0, 0]; // transparent
  }

  // Base dark background
  let r = 32, g = 33, b = 36, a = 255;

  // Inner border
  if (distFromCorner > cornerR - 1.5) {
    return [255, 161, 22, 180]; // Orange accent border
  }

  // Eye outline (ellipse)
  const ex = (x - cx) / (size * 0.32);
  const ey = (y - cy) / (size * 0.18);
  const eyeDist = ex * ex + ey * ey;

  // Diagonal slash (mask / hide effect)
  const slashDist = Math.abs((x - cx) + (y - cy)) / Math.sqrt(2);
  const inSlash = slashDist < Math.max(size * 0.08, 1.2) && (Math.abs(x - cx) < size * 0.35 && Math.abs(y - cy) < size * 0.35);

  if (inSlash) {
    return [255, 107, 107, 255]; // Red/coral slash line
  }

  if (eyeDist <= 1.0 && eyeDist >= 0.55) {
    return [255, 161, 22, 255]; // LeetCode orange eye curve
  }

  // Pupil
  const pupilDist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
  if (pupilDist <= size * 0.1) {
    return [255, 161, 22, 255]; // Orange pupil
  }

  return [r, g, b, a];
}

const iconsDir = path.join(__dirname, 'launches', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach(size => {
  const pngBuffer = createPng(size, drawIcon);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Generated: ${filePath} (${pngBuffer.length} bytes)`);
});
