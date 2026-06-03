// Genera icon16.png e icon48.png sin dependencias externas
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// CRC32 lookup table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makePNG(sz, drawFn) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);

  const hdr = Buffer.alloc(13);
  hdr.writeUInt32BE(sz, 0); hdr.writeUInt32BE(sz, 4);
  hdr[8] = 8; hdr[9] = 6; // 8-bit RGBA

  const raw = Buffer.alloc((sz * 4 + 1) * sz);
  let o = 0;
  for (let y = 0; y < sz; y++) {
    raw[o++] = 0; // filter: None
    for (let x = 0; x < sz; x++) {
      const p = drawFn(x, y, sz);
      raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; raw[o++] = p[3];
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const tb = Buffer.from(type, 'ascii');
    const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([lb, tb, data, cb]);
  }

  return Buffer.concat([sig, chunk('IHDR',hdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
}

// Pixel-art letter J — 5 cols × 9 rows
const J = [
  [0,1,1,1,1],
  [0,0,0,1,0],
  [0,0,0,1,0],
  [0,0,0,1,0],
  [0,0,0,1,0],
  [0,0,0,1,0],
  [1,0,0,1,0],
  [1,0,0,1,0],
  [0,1,1,0,0],
];
const JW = 5, JH = 9;

function drawIcon(x, y, sz) {
  const cx = (sz - 1) / 2, cy = (sz - 1) / 2;
  const r  = sz * 0.44;

  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Transparent outside circle
  if (dist > r + 1.2) return [0, 0, 0, 0];

  const DARK  = [7,  9,  15, 255]; // #07090f
  const HOLO  = [0, 212, 255, 255]; // #00d4ff
  const FILL  = [0,  18,  32, 255]; // panel bg

  // Anti-aliased circle border (~2px ring)
  if (dist > r - 2) {
    const alpha = Math.round(Math.max(0, Math.min(1, (r + 1.2 - dist) / 2)) * 255);
    return [0, 212, 255, alpha];
  }

  // Draw J letter (scale to icon size, centered)
  const cell = sz / (JW + 3);                 // cell size
  const jx0  = cx - (JW * cell) / 2;
  const jy0  = cy - (JH * cell) / 2;
  const col  = Math.floor((x - jx0) / cell);
  const row  = Math.floor((y - jy0) / cell);

  if (row >= 0 && row < JH && col >= 0 && col < JW && J[row][col]) {
    return HOLO;
  }

  return FILL;
}

const dir = __dirname;
fs.writeFileSync(path.join(dir, 'icon16.png'), makePNG(16, drawIcon));
fs.writeFileSync(path.join(dir, 'icon48.png'), makePNG(48, drawIcon));
console.log('icon16.png y icon48.png creados.');
