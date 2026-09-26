'use strict';
// Shot list and per-frame parameters. Global time t in seconds, 0..DUR.
const DUR = 20, FPS = 24;
const T_IGN = 6.4, T_LIFT = 8.6;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mixv = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scl = (a, s) => a.map(v => v * s);
const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ease = x => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };

// smooth 1D value noise for handheld drift and shake
function vnoise(x, seed) {
  const h = i => { let s = Math.sin((i + seed * 17.31) * 127.1 + seed * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return mix(h(i), h(i + 1), u);
}
function shake(t, freq, seed) {
  return [0, 1, 2].map(k => vnoise(t * freq, seed + k) * 0.6 + vnoise(t * freq * 2.3, seed + k + 9) * 0.3 + vnoise(t * freq * 5.1, seed + k + 19) * 0.1);
}

const rocketY = tL => tL > 0 ? 1.5 * tL * tL + 0.1 * tL * tL * tL : 0;

function camBasis(pos, target, roll, fovDeg) {
  const f = norm(sub(target, pos));
  let r = norm(cross(f, [0, 1, 0]));
  let u = cross(r, f);
  const c = Math.cos(roll), s = Math.sin(roll);
  const r2 = add(scl(r, c), scl(u, s)), u2 = add(scl(u, c), scl(r, -s));
  return { uCamPos: pos, uCamFwd: f, uCamRight: r2, uCamUp: u2, uTanHalf: Math.tan(fovDeg * Math.PI / 360) };
}

function frameParams(t) {
  const tI = t - T_IGN, tL = t - T_LIFT;
  const rY = rocketY(tL);
  const thrust = tI > 0 ? sstep(0.15, 1.1, tI) : 0;
  const green = tI > 0 ? Math.exp(-Math.pow((tI - 0.18) / 0.22, 2)) : 0;
  const trench = tI > 0 ? sstep(0.3, 1.2, tI) * (1 - 0.8 * sstep(1, 7, tL)) : 0;
  const u = {
    uShot: 0, uTIgn: tI, uTLift: tL, uRocketY: rY, uThrust: thrust, uTime: t,
    uFlood: 1.0, uGreen: green, uTrench: trench, uAlt: 0, uSunDir: [0, -0.13, -1], uPlumeX: 0, uPitch: 0,
  };
  const post = { uExposure: 1, uBloomAmt: 0.06, uFade: 1, uGrain: 0.035, uVignette: 0.35, uFlash: 0 };
  let cam;
  const noseY = 5 + rY + 70;

  if (t < 5.2) {
    // 1. blue hour on the pad: low, slow dolly past the engines, tilting up the vehicle
    const k = ease(t / 5.2);
    const pos = mixv([7, 1.7, 24], [-15, 1.5, 40], k);
    const tgt = mixv([0, 9, 0], [0, 40, 0], ease(clamp((t - 0.4) / 4.8, 0, 1)));
    const d = shake(t, 0.35, 1);
    cam = camBasis(add(pos, scl(d, 0.06)), tgt, 0.01 * d[0], mix(56, 62, k));
    post.uExposure = 2.2;
    post.uFade = sstep(0, 1.4, t);
  } else if (t < 10) {
    // 2. long lens from across the flame trench: ignition, the cloud, the first metres
    const k = (t - 5.2) / 4.8;
    const pos = mixv([150, 6, 330], [146, 6, 322], k);
    const follow = sstep(0, 1.5, tL);
    const tgt = [12, mix(34, 34 + rY * 0.7, follow), 0];
    const tS = tI - 0.45;                            // sound and pressure wave arrive ~0.4 s later
    const amp = tS > 0 ? sstep(0, 0.5, tS) * (0.9 - 0.3 * sstep(1, 4, tS)) : 0;
    const d = shake(t, 11, 3), dd = shake(t, 0.5, 5);
    const sk = add(scl(d, amp * 0.25), scl(dd, 0.05));
    cam = camBasis(add(pos, sk), add(tgt, scl(d, amp * 0.3)), d[0] * amp * 0.004, mix(23, 21.5, k));
    // camera iris reacting to the fire
    post.uExposure = mix(3.6, 0.55, sstep(0.1, 1.3, tI)) * mix(1, 0.8, sstep(0, 3, tL));
    post.uFlash = green * 0.0;
    post.uBloomAmt = mix(0.06, 0.1, thrust);
  } else if (t < 14) {
    // 3. low beside the transporter-erector: the vehicle rises past the tower, camera tilts to hold it
    const k = (t - 10) / 4;
    const pos = mixv([-44, 2.0, 52], [-47, 1.8, 55], k);
    const aim = clamp(5 + rY + 18, 22, 1e9);
    const tgt = [0, aim, 0];
    const d = shake(t, 13, 7), dd = shake(t, 0.7, 8);
    const amp = 1.0 - 0.4 * k;
    cam = camBasis(add(pos, add(scl(d, 0.12 * amp), scl(dd, 0.08))), add(tgt, scl(d, 0.6 * amp)), d[1] * 0.01 * amp, mix(64, 60, k));
    post.uExposure = 0.42;
    post.uBloomAmt = 0.1;
  } else {
    // 4. high altitude, first light: the sun clears the limb, the vehicle and its exhaust light up
    const k = (t - 14) / 6, ke = ease(k);
    const P = 0.6;                                   // pitch from vertical, downrange toward +x
    u.uShot = 1; u.uFlood = 0; u.uGreen = 0; u.uTrench = 0; u.uThrust = 1; u.uPitch = P;
    u.uAlt = mix(64, 76, k);
    u.uPlumeX = mix(0.55, 0.9, k);
    const el = mix(-9.4, -4.5, sstep(0.0, 0.8, k)) * Math.PI / 180;
    const sh = norm([0.895, 0, -0.446]);
    u.uSunDir = [sh[0] * Math.cos(el), Math.sin(el), sh[2] * Math.cos(el)];
    // camera built in the local-horizon frame, then expressed in the rocket frame
    const A = [Math.sin(P), Math.cos(P), 0];
    const tgt = scl(A, mix(30, 16, ke));
    const look = norm(mixv(norm([0.42, -0.07, -0.9]), norm([0.08, -0.12, -0.99]), ke));
    const dist = mix(85, 200, ease(clamp(k * 1.15 - 0.05, 0, 1)));
    const d = shake(t, 0.5, 11);
    const posW = add(sub(tgt, scl(look, dist)), scl(d, 0.25 + dist * 0.004));
    const cw = camBasis(posW, tgt, mix(0.015, -0.02, k), mix(40, 50, ke));
    const rz = v => { const c = Math.cos(P), sn = Math.sin(P); return [c * v[0] - sn * v[1], sn * v[0] + c * v[1], v[2]]; };
    cam = { uCamPos: rz(cw.uCamPos), uCamFwd: rz(cw.uCamFwd), uCamRight: rz(cw.uCamRight), uCamUp: rz(cw.uCamUp), uTanHalf: cw.uTanHalf };
    post.uExposure = 1.3;
    post.uBloomAmt = 0.08;
    post.uFade = 1 - sstep(18.8, 20, t);
  }
  // fade through black at the hard cuts is not wanted: cuts are straight cuts
  Object.assign(u, cam);
  return { u, post };
}
if (typeof module !== 'undefined') module.exports = { frameParams, DUR, FPS };
