'use strict';
// Offline renderer: drives render.html in headless Chrome (GPU) and writes PNG frames.
// usage: node render.cjs --frames 0-479 | --times 2,7,11 [--w 1600 --h 900 --spp 16 --strips 24 --out DIR]
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { chromium } = require('C:/Users/mjq/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') && a.push([v.slice(2), arr[i + 1]]), a), []));
const W = +(args.w || 1600), H = +(args.h || 900), SPP = +(args.spp || 16), STRIPS = +(args.strips || 24), FPS = 24;
const OUT = args.out || 'C:/Users/mjq/.claude/jobs/cd806a2f/tmp/frames';
fs.mkdirSync(OUT, { recursive: true });

let jobs = [];
if (args.times) jobs = args.times.split(',').map(s => ({ t: +s, name: 't' + (+s).toFixed(2) }));
else {
  const [a, b] = (args.frames || '0-479').split('-').map(Number);
  for (let f = a; f <= (b ?? a); f++) jobs.push({ t: f / FPS, name: String(f).padStart(4, '0') });
}

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-watchdog', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('file:///C:/Users/mjq/qiao-obs/film/render.html');
  const g = n => fs.readFileSync(path.join(__dirname, 'glsl', n + '.frag'), 'utf8');
  const src = { noise: g('noise'), scene: g('scene'), down: g('down'), up: g('up'), post: g('post') };
  const t0 = Date.now();
  console.log('GL', await page.evaluate(o => window.setup(o), { W, H, src }), ((Date.now() - t0) / 1000).toFixed(1) + 's');
  for (const j of jobs) {
    const s = Date.now();
    const b64 = await page.evaluate(([t, spp, strips, fps]) => window.renderFrame(t, spp, strips, fps), [j.t, SPP, STRIPS, FPS]);
    fs.writeFileSync(path.join(OUT, j.name + '.png'), png(Buffer.from(b64, 'base64'), W, H));
    console.log(j.name, ((Date.now() - s) / 1000).toFixed(2) + 's');
  }
  await browser.close();
})().catch(e => { console.error(e.message || e); process.exit(1); });
