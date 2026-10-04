// Generates the theme wallpapers in assets/wallpapers (soft blobs, waves and dots — no photos, no network).
// Usage: node scripts/generate-wallpapers.mjs [outDir]
// Writes PNG, then converts to JPEG with ffmpeg when it is installed (much smaller files).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = process.argv[2] ?? 'assets/wallpapers';
const W = 720;
const H = 1600;

// ---------- PNG writer (RGB) ----------
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
function png(rgb) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- helpers ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function gradientAt(stops, t) {
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i - 1];
    const [p2, c2] = stops[i];
    if (t <= p2) {
      const u = clamp((t - p1) / (p2 - p1 || 1));
      return c1.map((v, k) => v + (c2[k] - v) * u);
    }
  }
  return stops[stops.length - 1][1].slice();
}

/**
 * spec: {
 *   base: [[stop, '#hex'], ...], angle (deg, 0 = top→bottom),
 *   blobs: [{ x, y, rx, ry, color, a }]            // positions/radii as fractions of width
 *   waves: [{ y, amp, freq, phase, width, color, a }]
 *   dots:  [{ x, y, r, color, a, shade }]
 *   stars: count, grain: amplitude in 0..255
 * }
 */
function render(spec, seed) {
  const rand = rng(seed);
  const base = spec.base.map(([p, c]) => [p, hex(c)]);
  const ang = ((spec.angle ?? 0) * Math.PI) / 180;
  const dirX = Math.sin(ang);
  const dirY = Math.cos(ang);
  const blobs = (spec.blobs ?? []).map((b) => ({ ...b, c: hex(b.color) }));
  const waves = (spec.waves ?? []).map((w) => ({ ...w, c: hex(w.color) }));
  const dots = (spec.dots ?? []).map((d) => ({ ...d, c: hex(d.color) }));
  const stars = Array.from({ length: spec.stars ?? 0 }, () => ({
    x: rand() * W,
    y: rand() * H * 0.7,
    r: 0.6 + rand() * 1.3,
    a: 0.35 + rand() * 0.6,
  }));
  const out = Buffer.alloc(W * H * 3);
  const grain = spec.grain ?? 0;

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const nx = px / W;
      const ny = py / H;
      const t = clamp(((nx - 0.5) * dirX + (ny - 0.5) * dirY) * (W / H < 1 ? 1 : 1) + 0.5);
      let c = gradientAt(base, t);

      for (const b of blobs) {
        const dx = (px - b.x * W) / (b.rx * W);
        const dy = (py - b.y * H) / (b.ry * W);
        const k = Math.exp(-(dx * dx + dy * dy)) * b.a;
        if (k > 0.002) c = c.map((v, i) => v + (b.c[i] - v) * k);
      }
      for (const w of waves) {
        const yc = w.y * H + w.amp * W * Math.sin(2 * Math.PI * w.freq * nx + w.phase);
        const d = (py - yc) / (w.width * W);
        const k = Math.exp(-d * d) * w.a;
        if (k > 0.002) c = c.map((v, i) => v + (w.c[i] - v) * k);
      }
      for (const d of dots) {
        const cx = d.x * W;
        const cy = d.y * H;
        const r = d.r * W;
        const dist = Math.hypot(px - cx, py - cy);
        const cover = clamp((r - dist) / 2 + 0.5);
        if (cover > 0) {
          // Simple spherical shading: lighter top-left, darker bottom-right.
          const lx = (px - cx) / r;
          const ly = (py - cy) / r;
          const shade = 1 + (d.shade ?? 0.25) * (-0.6 * lx - 0.8 * ly);
          const col = d.c.map((v) => clamp(v * shade, 0, 255));
          const k = cover * d.a;
          c = c.map((v, i) => v + (col[i] - v) * k);
        }
      }
      for (const s of stars) {
        const dist = Math.hypot(px - s.x, py - s.y);
        if (dist < s.r + 1) {
          const k = clamp(s.r + 0.5 - dist) * s.a;
          c = c.map((v) => v + (255 - v) * k);
        }
      }
      const n = grain ? (rand() - 0.5) * 2 * grain : 0;
      const o = (py * W + px) * 3;
      out[o] = clamp(Math.round(c[0] + n), 0, 255);
      out[o + 1] = clamp(Math.round(c[1] + n), 0, 255);
      out[o + 2] = clamp(Math.round(c[2] + n), 0, 255);
    }
  }
  return out;
}

const SPECS = {
  // Warm, fluffy and playful (inspired by "Colorful and adorable").
  colorful: {
    base: [[0, '#FFF3C4'], [0.5, '#FFE08A'], [1, '#FFD27A']],
    angle: 20,
    blobs: [
      { x: 0.15, y: 0.18, rx: 0.55, ry: 0.4, color: '#FFC93C', a: 0.85 },
      { x: 0.85, y: 0.3, rx: 0.5, ry: 0.35, color: '#FFB547', a: 0.7 },
      { x: 0.55, y: 0.42, rx: 0.45, ry: 0.28, color: '#FFF7D6', a: 0.75 },
      { x: 0.2, y: 0.72, rx: 0.5, ry: 0.3, color: '#FF8FC0', a: 0.75 },
      { x: 0.9, y: 0.8, rx: 0.45, ry: 0.3, color: '#FF7A59', a: 0.6 },
      { x: 0.7, y: 0.95, rx: 0.6, ry: 0.25, color: '#F25F4C', a: 0.55 },
    ],
    waves: [
      { y: 0.6, amp: 0.08, freq: 0.9, phase: 0.4, width: 0.07, color: '#46D3E6', a: 0.85 },
      { y: 0.66, amp: 0.07, freq: 0.9, phase: 0.9, width: 0.06, color: '#FF7EB6', a: 0.8 },
      { y: 0.54, amp: 0.06, freq: 1.1, phase: 2.2, width: 0.05, color: '#A3E635', a: 0.45 },
    ],
    grain: 3,
  },
  // Calm aqua waves (inspired by "Seek · light (dynamic)").
  seek: {
    base: [[0, '#E9FBF6'], [0.45, '#BDEFEA'], [1, '#5CC4D6']],
    angle: -15,
    blobs: [
      { x: 0.85, y: 0.15, rx: 0.5, ry: 0.35, color: '#F3FFD8', a: 0.75 },
      { x: 0.1, y: 0.4, rx: 0.5, ry: 0.4, color: '#7FE3D3', a: 0.6 },
      { x: 0.8, y: 0.85, rx: 0.7, ry: 0.45, color: '#1594B0', a: 0.75 },
    ],
    waves: [
      { y: 0.55, amp: 0.18, freq: 0.6, phase: 1.2, width: 0.16, color: '#2BB3C8', a: 0.55 },
      { y: 0.48, amp: 0.15, freq: 0.6, phase: 1.6, width: 0.05, color: '#E8FFFB', a: 0.6 },
      { y: 0.72, amp: 0.12, freq: 0.7, phase: 0.4, width: 0.1, color: '#0E7E9C', a: 0.45 },
    ],
  },
  aurora: {
    base: [[0, '#040A1C'], [0.6, '#0A1A38'], [1, '#0E2747']],
    blobs: [{ x: 0.5, y: 1.0, rx: 0.9, ry: 0.4, color: '#123E73', a: 0.7 }],
    waves: [
      { y: 0.33, amp: 0.12, freq: 0.8, phase: 0.3, width: 0.09, color: '#3BF5B0', a: 0.55 },
      { y: 0.38, amp: 0.1, freq: 0.9, phase: 1.1, width: 0.05, color: '#B7FFE3', a: 0.35 },
      { y: 0.47, amp: 0.14, freq: 0.6, phase: 2.0, width: 0.1, color: '#8B5CF6', a: 0.45 },
      { y: 0.58, amp: 0.1, freq: 0.7, phase: 0.8, width: 0.08, color: '#22D3EE', a: 0.25 },
    ],
    stars: 140,
  },
  sunset: {
    base: [[0, '#1E0B3B'], [0.45, '#7B2D8E'], [0.75, '#E0457B'], [1, '#FF9F45']],
    blobs: [
      { x: 0.5, y: 0.98, rx: 0.8, ry: 0.35, color: '#FFC46B', a: 0.8 },
      { x: 0.15, y: 0.6, rx: 0.45, ry: 0.3, color: '#FF6F91', a: 0.4 },
      { x: 0.9, y: 0.35, rx: 0.4, ry: 0.3, color: '#5B2A86', a: 0.5 },
    ],
    waves: [{ y: 0.82, amp: 0.05, freq: 0.8, phase: 0.6, width: 0.05, color: '#FFD9A0', a: 0.35 }],
  },
  mint: {
    base: [[0, '#EFFFF8'], [0.5, '#E4F7FF'], [1, '#ECE6FF']],
    angle: 30,
    blobs: [
      { x: 0.2, y: 0.2, rx: 0.55, ry: 0.4, color: '#8EF2CC', a: 0.65 },
      { x: 0.85, y: 0.45, rx: 0.5, ry: 0.35, color: '#C9B8FF', a: 0.6 },
      { x: 0.3, y: 0.85, rx: 0.6, ry: 0.35, color: '#A6E6FF', a: 0.6 },
    ],
    grain: 1.5,
  },
  midnight: {
    base: [[0, '#040406'], [1, '#0B0B14']],
    blobs: [
      { x: 0.85, y: 0.15, rx: 0.55, ry: 0.4, color: '#2B4BFF', a: 0.5 },
      { x: 0.1, y: 0.75, rx: 0.6, ry: 0.45, color: '#8A3CFF', a: 0.45 },
      { x: 0.7, y: 0.6, rx: 0.3, ry: 0.2, color: '#FF3D9A', a: 0.2 },
    ],
  },
  blossom: {
    base: [[0, '#FFF0F5'], [0.6, '#FFE0E9'], [1, '#FFD3C4']],
    angle: -20,
    blobs: [
      { x: 0.8, y: 0.2, rx: 0.5, ry: 0.35, color: '#FF9DBB', a: 0.6 },
      { x: 0.15, y: 0.55, rx: 0.5, ry: 0.35, color: '#FFFFFF', a: 0.7 },
      { x: 0.55, y: 0.9, rx: 0.6, ry: 0.35, color: '#FFAE8A', a: 0.6 },
    ],
    waves: [{ y: 0.42, amp: 0.1, freq: 0.7, phase: 1.0, width: 0.07, color: '#FF7FA8', a: 0.3 }],
    grain: 1.5,
  },
  // Green court with pink balls (inspired by the tennis clock style).
  court: {
    base: [[0, '#5CBF3A'], [1, '#2E8F22']],
    angle: 10,
    blobs: [{ x: 0.5, y: 0.5, rx: 0.9, ry: 0.7, color: '#6FD14A', a: 0.25 }],
    waves: [{ y: 0.86, amp: 0.0, freq: 0, phase: 0, width: 0.004, color: '#F4FFF0', a: 0.6 }],
    dots: [
      { x: 0.12, y: 0.12, r: 0.13, color: '#FF9CC4', a: 1, shade: 0.35 },
      { x: 0.92, y: 0.08, r: 0.1, color: '#FF9CC4', a: 1, shade: 0.35 },
      { x: 0.78, y: 0.36, r: 0.12, color: '#FF9CC4', a: 1, shade: 0.35 },
      { x: 0.55, y: 0.66, r: 0.11, color: '#FF9CC4', a: 1, shade: 0.35 },
      { x: 0.08, y: 0.9, r: 0.14, color: '#FF9CC4', a: 1, shade: 0.35 },
    ],
  },
};

fs.mkdirSync(OUT, { recursive: true });
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
let seed = 7;
for (const [id, spec] of Object.entries(SPECS)) {
  const file = path.join(OUT, `${id}.png`);
  fs.writeFileSync(file, png(render(spec, seed++)));
  if (hasFfmpeg) {
    const jpg = path.join(OUT, `${id}.jpg`);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-q:v', '3', jpg]);
    if (r.status === 0) fs.unlinkSync(file);
  }
  console.log('wrote', id);
}
