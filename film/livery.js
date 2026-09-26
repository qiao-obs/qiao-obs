'use strict';
// Unwrapped paint map for the vehicle. u = 0.5 - azimuth/2pi (left→right as seen from outside),
// v = height above nozzle exit / 72 m. RGB = linear albedo, A = roughness.
const LIV = { W: 1024, H: 8192, HM: 72, LOGO_U: 0.225 };

function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

async function makeLivery() {
  const { W, H, HM } = LIV;
  const y = h => (1 - h / HM) * H;          // canvas row for height h
  const pxm = H / HM;                          // pixels per metre along the axis
  const col = document.createElement('canvas'); col.width = W; col.height = H;
  const rough = document.createElement('canvas'); rough.width = W; rough.height = H;
  const c = col.getContext('2d'), r = rough.getContext('2d');
  await document.fonts.load('700 200px Bahnschrift');
  const R = rng(7);

  // base paint
  c.fillStyle = 'rgb(200,201,203)'; c.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(105,105,105)'; r.fillRect(0, 0, W, H);

  // subtle panel-to-panel tone variation on the white skin
  for (let i = 0; i < 900; i++) {
    const x = R() * W, yy = R() * H, w = 20 + R() * 160, hh = 40 + R() * 500, a = R() * 0.035;
    c.fillStyle = `rgba(${R() < 0.5 ? '120,118,112' : '255,255,255'},${a})`; c.fillRect(x, yy, w, hh);
  }

  // soot: flight-proven booster, darker toward the engine section, streaked upward
  const g = c.createLinearGradient(0, y(1.5), 0, y(22));
  g.addColorStop(0, 'rgba(38,34,30,0.55)'); g.addColorStop(0.35, 'rgba(60,55,50,0.22)'); g.addColorStop(1, 'rgba(80,75,70,0)');
  c.fillStyle = g; c.fillRect(0, y(22), W, y(1.5) - y(22));
  for (let i = 0; i < 2600; i++) {
    const x = R() * W, h0 = 1.5 + Math.pow(R(), 2.2) * 30, len = (0.5 + R() * 9) * pxm, w = 0.6 + R() * 5;
    const a = (0.02 + R() * 0.09) * Math.max(0.15, 1 - h0 / 34);
    const sg = c.createLinearGradient(0, y(h0), 0, y(h0) - len);
    sg.addColorStop(0, `rgba(30,27,24,${a})`); sg.addColorStop(1, 'rgba(30,27,24,0)');
    c.fillStyle = sg; c.fillRect(x, y(h0) - len, w, len);
  }
  // soot also a little rougher
  const rg = r.createLinearGradient(0, y(1.5), 0, y(18));
  rg.addColorStop(0, 'rgba(190,190,190,0.8)'); rg.addColorStop(1, 'rgba(190,190,190,0)');
  r.fillStyle = rg; r.fillRect(0, y(18), W, y(1.5) - y(18));

  // interstage: black composite
  c.fillStyle = 'rgb(9,9,10)'; c.fillRect(0, y(50.0), W, y(43.5) - y(50.0));
  r.fillStyle = 'rgb(78,78,78)'; r.fillRect(0, y(50.0), W, y(43.5) - y(50.0));
  for (let i = 0; i < 400; i++) {  // faint scuffs on the composite
    c.fillStyle = `rgba(90,88,85,${R() * 0.05})`;
    c.fillRect(R() * W, y(43.5 + R() * 6.5), 3 + R() * 40, 1 + R() * 6);
  }
  // second stage and fairing are clean white
  c.fillStyle = 'rgb(206,207,209)'; c.fillRect(0, 0, W, y(50.0));
  r.fillStyle = 'rgb(100,100,100)'; r.fillRect(0, 0, W, y(50.0));
  for (let i = 0; i < 300; i++) {
    c.fillStyle = `rgba(150,148,142,${R() * 0.03})`; c.fillRect(R() * W, R() * y(50), 10 + R() * 120, 20 + R() * 200);
  }

  // weld lines / panel seams
  const ring = (h, a, w = 2) => { c.fillStyle = `rgba(40,40,40,${a})`; c.fillRect(0, y(h) - w / 2, W, w); };
  [3.4, 8.2, 13.1, 18.0, 22.4, 26.1, 29.8, 34.6, 39.1, 43.35].forEach(h => ring(h, 0.22));
  [51.2, 54.0, 57.2].forEach(h => ring(h, 0.25));
  ring(58.55, 0.45, 3); ring(64.0, 0.18);

  // fairing separation seam (two halves) and a few access panels / stencils
  for (const du of [0.25, 0.75]) {
    const x = ((LIV.LOGO_U + du) % 1) * W;
    c.fillStyle = 'rgba(30,30,30,0.55)'; c.fillRect(x - 1.5, 0, 3, y(58.5));
  }
  const panel = (u, h, wm, hm, a) => {
    const x = u * W, ww = wm / 11.5 * W, hh = hm * pxm;
    c.strokeStyle = `rgba(40,40,40,${a})`; c.lineWidth = 2; c.strokeRect(x - ww / 2, y(h) - hh / 2, ww, hh);
  };
  for (let i = 0; i < 26; i++) panel(R(), 2 + R() * 40, 0.3 + R() * 0.6, 0.3 + R() * 0.8, 0.25 + R() * 0.2);
  for (let i = 0; i < 8; i++) panel(R(), 51 + R() * 5, 0.3 + R() * 0.4, 0.3 + R() * 0.4, 0.3);
  // tiny stencilled markings (black blocks read as text at a distance)
  for (let i = 0; i < 60; i++) {
    const x = R() * W, h = 2 + R() * 54, n = 3 + (R() * 8 | 0);
    c.fillStyle = 'rgba(25,25,25,0.7)';
    for (let k = 0; k < n; k++) c.fillRect(x + k * 7, y(h), 5, 7);
  }

  // SPACEX wordmark, running up the booster and up the fairing
  const wordmark = (uc, h0, h1, capM, circ) => {
    const cx = uc * W, len = (h1 - h0) * pxm, capPx = capM / circ * W;
    c.save();
    c.translate(cx + capPx / 2, y(h0));
    c.rotate(-Math.PI / 2);                    // text runs toward the nose, glyph tops point left
    c.font = `700 ${capPx * 1.38}px Bahnschrift`;
    const txt = 'SPACE', mw = c.measureText(txt + 'X').width;
    const sx = len / mw;
    c.scale(sx, 1);
    c.fillStyle = 'rgb(10,10,11)';
    c.fillText(txt, 0, 0);
    const xX = c.measureText(txt).width, wX = c.measureText('X').width;
    // X: one full stroke plus the short half, with the swoosh replacing the upper-right arm
    const hX = capPx, th = wX * 0.2;
    c.beginPath();
    c.moveTo(xX + wX * 0.02, 0); c.lineTo(xX + wX * 0.02 + th, 0); c.lineTo(xX + wX * 0.98, -hX); c.lineTo(xX + wX * 0.98 - th, -hX); c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(xX + wX * 0.98, 0); c.lineTo(xX + wX * 0.98 - th, 0); c.lineTo(xX + wX * 0.5 - th * 0.3, -hX * 0.5); c.lineTo(xX + wX * 0.5 + th * 0.4, -hX * 0.42); c.closePath(); c.fill();
    // swoosh: a thin trajectory arc sweeping from under the X up past its top-right
    c.beginPath();
    c.moveTo(xX - wX * 0.55, -hX * 0.02);
    c.quadraticCurveTo(xX + wX * 0.45, -hX * 0.35, xX + wX * 1.55, -hX * 1.28);
    c.quadraticCurveTo(xX + wX * 0.55, -hX * 0.52, xX - wX * 0.55, -hX * 0.02);
    c.closePath(); c.fill();
    c.restore();
    r.fillStyle = 'rgba(80,80,80,0.0)';
  };
  wordmark(LIV.LOGO_U, 13.5, 37.5, 2.35, 11.5);
  wordmark(LIV.LOGO_U, 59.0, 63.6, 0.85, 16.3);

  // merge colour + roughness into one RGBA buffer, rows bottom-up for GL
  const cd = c.getImageData(0, 0, W, H).data, rd = r.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(W * H * 4);
  for (let yy = 0; yy < H; yy++) {
    const si = (H - 1 - yy) * W * 4, di = yy * W * 4;
    for (let x = 0; x < W * 4; x += 4) {
      out[di + x] = cd[si + x]; out[di + x + 1] = cd[si + x + 1]; out[di + x + 2] = cd[si + x + 2]; out[di + x + 3] = rd[si + x];
    }
  }
  window.__liveryCanvas = col;
  return { data: out, width: W, height: H };
}
