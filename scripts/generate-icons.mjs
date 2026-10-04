// Generates the Lumo Launcher icon set as PNGs (no image libraries needed).
// Usage: node scripts/generate-icons.mjs assets
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = process.argv[2];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const STOPS = [hex('#22176B'), hex('#6A3DE8'), hex('#FF5FA2')];

function background(x, y, size) {
  const t = clamp((x + y) / (2 * size));
  const [a, b, u] = t < 0.55 ? [STOPS[0], STOPS[1], t / 0.55] : [STOPS[1], STOPS[2], (t - 0.55) / 0.45];
  let c = a.map((v, i) => lerp(v, b[i], u));
  // Soft light orb top-left.
  const d = Math.hypot(x - size * 0.28, y - size * 0.22) / (size * 0.55);
  const glow = clamp(1 - d) ** 2 * 0.35;
  c = c.map((v) => lerp(v, 255, glow));
  return c;
}

// Signed distance to a rounded rectangle.
function sdRound(px, py, cx, cy, half, r) {
  const qx = Math.abs(px - cx) - half + r;
  const qy = Math.abs(py - cy) - half + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// 2x2 "app grid" of glass tiles; `scale` is the motif size relative to the canvas.
function motif(x, y, size, scale, mono) {
  const tile = size * scale * 0.45;
  const gap = size * scale * 0.1;
  const half = tile / 2;
  const r = tile * 0.32;
  const offs = [-(gap / 2 + half), gap / 2 + half];
  let rgb = [0, 0, 0];
  let alpha = 0;
  let i = 0;
  for (const oy of offs) {
    for (const ox of offs) {
      const cx = size / 2 + ox;
      const cy = size / 2 + oy;
      const d = sdRound(x, y, cx, cy, half, r);
      const cover = clamp(0.5 - d);
      if (cover > 0) {
        let a;
        let col;
        if (mono) {
          a = 1;
          col = [255, 255, 255];
        } else if (i === 0) {
          a = 0.96;
          col = [255, 255, 255];
        } else {
          // Glass tile: translucent body, bright rim and a top sheen.
          const rim = clamp(1 - Math.abs(d + size * 0.006) / (size * 0.006));
          const sheen = clamp(1 - (y - (cy - half)) / tile) * 0.25;
          a = clamp(0.38 + sheen + rim * 0.5);
          col = [255, 255, 255];
        }
        a *= cover;
        rgb = col.map((v, k) => lerp(rgb[k], v, a));
        alpha = alpha + a * (1 - alpha);
      }
      i++;
    }
  }
  return { rgb, alpha };
}

const out = (name, buf) => fs.writeFileSync(path.join(OUT, name), buf);

out(
  'android-icon-background.png',
  png(512, (x, y, s) => [...background(x, y, s).map(Math.round), 255])
);
out(
  'android-icon-foreground.png',
  png(512, (x, y, s) => {
    const { alpha } = motif(x, y, s, 0.5, false);
    return [255, 255, 255, Math.round(alpha * 255)];
  })
);
out(
  'android-icon-monochrome.png',
  png(432, (x, y, s) => {
    const { alpha } = motif(x, y, s, 0.5, true);
    return [255, 255, 255, Math.round(alpha * 255)];
  })
);
for (const name of ['icon.png', 'splash-icon.png']) {
  const transparent = name === 'splash-icon.png';
  out(
    name,
    png(1024, (x, y, s) => {
      const { alpha } = motif(x, y, s, transparent ? 0.5 : 0.6, false);
      if (transparent) return [255, 255, 255, Math.round(alpha * 255)];
      const bg = background(x, y, s);
      return [...bg.map((v) => Math.round(lerp(v, 255, alpha))), 255];
    })
  );
}
out(
  'favicon.png',
  png(48, (x, y, s) => {
    const { alpha } = motif(x, y, s, 0.6, false);
    return [...background(x, y, s).map((v) => Math.round(lerp(v, 255, alpha))), 255];
  })
);
console.log('icons written to', OUT);
