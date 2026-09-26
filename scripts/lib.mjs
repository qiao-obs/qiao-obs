// 零依赖工具：确定性随机、梯度噪声、PNG 编码、SVG 小助手
import zlib from 'node:zlib';

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed = 7) {
  const r = rng(seed);
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = [];
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2;
    g.push([Math.cos(a), Math.sin(a)]);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (h, x, y) => g[h][0] * x + g[h][1] * y;
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const u = fade(xf), v = fade(yf);
    const x1 = dot(aa, xf, yf) + u * (dot(ba, xf - 1, yf) - dot(aa, xf, yf));
    const x2 = dot(ab, xf, yf - 1) + u * (dot(bb, xf - 1, yf - 1) - dot(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 1.4; // ~[-1,1]
  }
  function fbm(x, y, oct = 5, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * noise(x * f, y * f);
      n += a;
      a *= gain;
      f *= lac;
    }
    return s / n;
  }
  function ridged(x, y, oct = 5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * (1 - Math.abs(noise(x * f, y * f)));
      n += a;
      a *= 0.5;
      f *= 2;
    }
    return s / n;
  }
  return { noise, fbm, ridged };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// pixels: Uint8Array，RGB 或 RGBA
export function encodePNG(w, h, pixels, channels = 3) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const stride = w * channels;
  const raw = Buffer.alloc((stride + 1) * h);
  // Paeth 滤波，平滑渐变压缩更好
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 4;
    for (let x = 0; x < stride; x++) {
      const cur = pixels[y * stride + x];
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[y * (stride + 1) + 1 + x] = (cur - pr) & 255;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9, memLevel: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const dataURI = (png) => 'data:image/png;base64,' + png.toString('base64');

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const f = (n, d = 2) => +n.toFixed(d);

// 以秒描述的时间轴 → SMIL keyTimes（0..1）
export function timeline(dur, frames) {
  const kt = frames.map(([t]) => f(t / dur, 4));
  const vals = frames.map(([, v]) => v);
  if (kt[0] !== 0) { kt.unshift(0); vals.unshift(vals[0]); }
  if (kt[kt.length - 1] !== 1) { kt.push(1); vals.push(vals[vals.length - 1]); }
  return { keyTimes: kt.join(';'), values: vals.join(';') };
}

export function anim(attr, dur, frames, extra = '') {
  const { keyTimes, values } = timeline(dur, frames);
  return `<animate attributeName="${attr}" dur="${dur}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}" ${extra}/>`;
}

export const FONT_DISPLAY = `'Segoe UI Variable Display','Segoe UI','SF Pro Display','Helvetica Neue',-apple-system,'PingFang SC','Microsoft YaHei',Arial,sans-serif`;
export const FONT_MONO = `'SF Mono','JetBrains Mono','Cascadia Mono',Consolas,'Roboto Mono',Menlo,monospace`;
export const FONT_CN = `'PingFang SC','Microsoft YaHei UI','Microsoft YaHei','Noto Sans SC','Source Han Sans SC',sans-serif`;

// ———————————————————— baseline JPEG（4:2:0，零依赖）：用于大尺寸不透明纹理
const ZZ = (() => {
  const out = [];
  for (let s = 0; s < 15; s++) {
    const cells = [];
    for (let y = 0; y < 8; y++) { const x = s - y; if (x >= 0 && x < 8) cells.push(y * 8 + x); }
    out.push(...(s % 2 ? cells : cells.reverse()));
  }
  return out; // zigzag 序号 → 自然序号
})();
const Q_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const Q_CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...Array(32).fill(99)];
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_VALS = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
function huffCodes(bits, vals) {
  const table = {};
  let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++) table[vals[k++]] = [code++, len];
    code <<= 1;
  }
  return table;
}
const DC_H = huffCodes(DC_BITS, DC_VALS), AC_H = huffCodes(AC_BITS, AC_VALS);
const COS = Array.from({ length: 64 }, (_, i) => Math.cos(((2 * (i % 8) + 1) * Math.floor(i / 8) * Math.PI) / 16));

export function encodeJPEG(w, h, rgb, quality = 88) {
  const scaleQ = (base) => {
    const s = quality < 50 ? 5000 / quality : 200 - quality * 2;
    return base.map((q) => clamp(Math.floor((q * s + 50) / 100), 1, 255));
  };
  const QL = scaleQ(Q_LUMA), QC = scaleQ(Q_CHROMA);
  const bytes = [];
  let acc = 0, nbits = 0;
  const put = (code, len) => {
    acc = (acc << len) | code; nbits += len;
    while (nbits >= 8) {
      const b = (acc >>> (nbits - 8)) & 255;
      bytes.push(b); if (b === 255) bytes.push(0);
      nbits -= 8; acc &= (1 << nbits) - 1;
    }
  };
  const tmp = new Float64Array(64), coef = new Float64Array(64);
  const block = (data, Q, prevDC) => {
    // 可分离 DCT：先行后列
    for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {
      let s = 0; for (let x = 0; x < 8; x++) s += data[y * 8 + x] * COS[u * 8 + x]; tmp[y * 8 + u] = s;
    }
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
      let s = 0; for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[v * 8 + y];
      coef[v * 8 + u] = s * 0.25 * (u ? 1 : Math.SQRT1_2) * (v ? 1 : Math.SQRT1_2);
    }
    const q = ZZ.map((n, i) => Math.round(coef[n] / Q[i]));
    const cat = (v) => { let a = Math.abs(v), n = 0; while (a) { n++; a >>= 1; } return n; };
    const bitsOf = (v, n) => (v < 0 ? v + (1 << n) - 1 : v);
    const diff = q[0] - prevDC, dn = cat(diff);
    put(...DC_H[dn]); if (dn) put(bitsOf(diff, dn), dn);
    let run = 0;
    for (let i = 1; i < 64; i++) {
      if (!q[i]) { run++; continue; }
      while (run > 15) { put(...AC_H[0xf0]); run -= 16; }
      const n = cat(q[i]);
      put(...AC_H[(run << 4) | n]); put(bitsOf(q[i], n), n); run = 0;
    }
    if (run) put(...AC_H[0]);
    return q[0];
  };
  const px = (x, y) => { x = Math.min(x, w - 1); y = Math.min(y, h - 1); return (y * w + x) * 3; };
  const Yb = new Float64Array(64), Cb = new Float64Array(64), Cr = new Float64Array(64);
  let dY = 0, dCb = 0, dCr = 0;
  for (let my = 0; my < h; my += 16) for (let mx = 0; mx < w; mx += 16) {
    for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
      for (let k = 0; k < 64; k++) {
        const o = px(mx + ox + (k % 8), my + oy + (k >> 3));
        Yb[k] = 0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2] - 128;
      }
      dY = block(Yb, QL, dY);
    }
    for (let k = 0; k < 64; k++) {
      let cb = 0, cr = 0;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const o = px(mx + (k % 8) * 2 + ox, my + (k >> 3) * 2 + oy);
        const r = rgb[o], g = rgb[o + 1], b = rgb[o + 2];
        cb += -0.168736 * r - 0.331264 * g + 0.5 * b;
        cr += 0.5 * r - 0.418688 * g - 0.081312 * b;
      }
      Cb[k] = cb / 4; Cr[k] = cr / 4;
    }
    dCb = block(Cb, QC, dCb);
    dCr = block(Cr, QC, dCr);
  }
  if (nbits) put((1 << (8 - nbits)) - 1, 8 - nbits);
  const seg = (marker, body) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  const head = [
    0xff, 0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...seg(0xdb, [0, ...QL, 1, ...QC]),
    ...seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...seg(0xc4, [0x00, ...DC_BITS, ...DC_VALS, 0x10, ...AC_BITS, ...AC_VALS]),
    ...seg(0xda, [3, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0]),
  ];
  return Buffer.concat([Buffer.from(head), Buffer.from(bytes), Buffer.from([0xff, 0xd9])]);
}
export const jpegURI = (jpg) => 'data:image/jpeg;base64,' + jpg.toString('base64');
