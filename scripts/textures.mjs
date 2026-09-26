// 程序化烘焙的光栅纹理：银河夜空、旋涡星系、行星
import { makeNoise, encodePNG, encodeJPEG, clamp, smooth, lerp, rng } from './lib.mjs';

const toByte = (v) => Math.max(0, Math.min(255, Math.round(v)));

// 夜空 + 银河（hero 背景），原生 1280×720，JPEG 输出（天空不需要透明）
export function skyTexture(w = 1280, h = 720) {
  const { fbm, ridged } = makeNoise(11);
  const R = rng(5);
  const px = new Uint8Array(w * h * 3);
  const AR = w / h;
  const A = { x: 0.86 * AR, y: 0.9 };   // 银心（靠近地平线，右侧）
  const B = { x: 0.16 * AR, y: -0.08 }; // 银河另一端（左上）
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const gauss = () => (R() + R() + R() + R() - 2) * 0.87;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = i / w, v = j / h;
      const X = u * AR, Y = v;
      const hv = smooth(0, 0.84, v);
      // 天空底色：天顶近黑 → 地平线深蓝
      let r = lerp(1.2, 7, hv * hv), g = lerp(2, 14, hv * hv), b = lerp(6, 30, hv * hv);
      // 地平线：冷色暮光 + 远处城镇的钠灯光污染（左侧偏暖）
      const hz = Math.exp(-(((v - 0.842) / 0.06) ** 2));
      r += 10 * hz; g += 22 * hz; b += 36 * hz;
      const sodium = Math.exp(-(((v - 0.845) / 0.03) ** 2)) * Math.exp(-(((u - 0.2) / 0.22) ** 2));
      r += 22 * sodium; g += 12 * sodium; b += 4 * sodium;
      const warm = Math.exp(-(((v - 0.845) / 0.028) ** 2)) * Math.exp(-(((u - 0.74) / 0.16) ** 2));
      r += 34 * warm; g += 17 * warm; b += 6 * warm;
      // 气辉：地平线上方极淡的绿带与更高处的暗红带
      const ag = Math.exp(-(((v - 0.74) / 0.07) ** 2)) * (0.55 + 0.45 * fbm(u * 4, v * 9, 3));
      r += 1.5 * ag; g += 7 * ag; b += 3 * ag;
      const ar = Math.exp(-(((v - 0.6) / 0.1) ** 2)) * (0.5 + 0.5 * fbm(u * 3 + 7, v * 5, 3));
      r += 3 * ar; b += 1.5 * ar;

      // 银河坐标
      const qx = X - A.x, qy = Y - A.y;
      const sAlong = qx * ux + qy * uy, d = -qx * uy + qy * ux;
      const sn = sAlong / L;
      const width = 0.11 + 0.055 * sn + 0.03 * fbm(sn * 3, 1.7, 3);
      // 域扭曲，让星云有流动的纤维感
      const wx = X + 0.07 * fbm(X * 2.4, Y * 2.4, 4), wy = Y + 0.07 * fbm(X * 2.4 + 9, Y * 2.4 + 3, 4);
      const tex = 0.5 + 0.5 * fbm(wx * 7, wy * 7, 7);
      const clouds = Math.pow(clamp(0.5 + 0.85 * fbm(wx * 15 + 3, wy * 15, 5)), 1.7);
      const fine = 0.5 + 0.5 * fbm(wx * 40, wy * 40, 3);
      const fadeEnd = smooth(1.1, 0.7, sn) * smooth(-0.14, 0.03, sn);
      const halo = Math.exp(-((d / (width * 2.4)) ** 2)) * 0.22;
      let band = Math.exp(-((d / width) ** 2));
      band *= 0.14 + 1.55 * Math.pow(tex, 2.6) + 0.75 * clouds * (0.65 + 0.35 * fine);
      const core = Math.exp(-(((sn - 0.05) / 0.16) ** 2)) * Math.exp(-((d / (width * 1.5)) ** 2)) * (0.7 + 0.55 * tex);
      // 暗尘：沿中线的大裂缝 + 成片暗星云 + 局部细丝
      const laneOff = d - 0.014 - 0.024 * fbm(sn * 4, 4, 3);
      const riftLine = Math.exp(-((laneOff / (width * (0.3 + 0.12 * fbm(sn * 6, 2, 3)))) ** 2));
      const riftBody = smooth(0.25, 0.6, 0.55 + 0.9 * fbm(wx * 6 + 2, wy * 6, 6));
      const dust = riftLine * riftBody * smooth(1.0, 0.25, sn) * smooth(-0.1, 0.12, sn);
      const patches = smooth(0.18, 0.5, fbm(wx * 4.2 + 11, wy * 4.2, 6)) * Math.exp(-((d / (width * 1.6)) ** 2));
      const filMask = clamp(fbm(wx * 2 + 30, wy * 2, 3) * 3);
      const fil = clamp(Math.pow(ridged(wx * 9, wy * 9 + 5, 5), 5) * 1.6 - 0.35) * filMask * Math.exp(-((d / (width * 1.3)) ** 2));
      let I = (band * 0.6 + core * 1.3 + halo) * fadeEnd;
      const ext = clamp(0.85 * dust + 0.55 * patches + 0.35 * fil);
      I *= 1 - ext;
      const warmth = clamp(core * 1.35 + 0.22 * (1 - sn));
      let cr = lerp(150, 255, warmth), cg = lerp(172, 208, warmth), cb = lerp(238, 158, warmth);
      // 尘埃边缘的红化：蓝光被吸收得更多
      const redden = clamp(ext * 2.2) * (1 - ext);
      cb *= 1 - 0.4 * redden; cg *= 1 - 0.15 * redden;
      r += cr * I * 0.46; g += cg * I * 0.46; b += cb * I * 0.46;
      // 电离氢区：零星粉红结
      const ha = clamp(fbm(wx * 11 + 20, wy * 11, 4) * 2.6 - 0.95) * band * fadeEnd * (1 - ext);
      r += 34 * ha; g += 5 * ha; b += 18 * ha;
      // 未分辨的星点：原生分辨率下的单像素，密度随银河变化
      const mw = clamp(band * fadeEnd * (1 - ext) * 0.7 + core * 0.35 * (1 - ext));
      const dens = 0.004 + 0.2 * mw * mw + 0.05 * mw;
      if (R() < dens * smooth(0.86, 0.72, v)) {
        const k = (5 + 120 * Math.pow(R(), 4.5)) * (0.55 + 0.45 * (1 - ext));
        const t = R();
        r += k * (t < 0.3 ? 1.08 : 0.95); g += k; b += k * (t < 0.3 ? 0.85 : 1.08);
      }
      // 胶片颗粒，消除色带
      const n = gauss() * 1.3;
      const o = (j * w + i) * 3;
      px[o] = toByte(r + n); px[o + 1] = toByte(g + n); px[o + 2] = toByte(b + n * 1.1);
    }
  }
  return encodeJPEG(w, h, px, 90);
}

// 旋涡星系（正面视角，外部再做倾斜）：RGB JPEG，黑底，外部以 screen 混合
export function galaxyTexture(size = 800) {
  const { fbm } = makeNoise(23);
  const n2 = makeNoise(61);
  const R = rng(9);
  const px = new Float32Array(size * size * 3);
  const pitch = Math.tan((15 * Math.PI) / 180);
  const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / size) * 2 - 1, y = (j / size) * 2 - 1;
      const rr = Math.hypot(x, y);
      if (rr > 1) continue;
      const th = Math.atan2(y, x);
      const lr = Math.log(rr + 0.02) / pitch;
      const wob = 0.35 * fbm(x * 2.5, y * 2.5, 3);
      // 两条主旋臂 + 较弱的分支
      const ph = 2 * th - lr + wob * 2;
      const armMain = Math.exp(-((wrap(ph) / 0.55) ** 2));
      const armSpur = Math.exp(-((wrap(2 * th - lr * 1.12 + 2.1 + wob * 3) / 0.4) ** 2)) * 0.45 * smooth(0.3, 0.55, rr);
      const armFade = smooth(0.1, 0.25, rr) * smooth(1.0, 0.55, rr);
      const arm = Math.max(armMain, armSpur) * armFade;
      // 尘埃带位于旋臂内侧（前缘），带丝状结构
      const lane = Math.exp(-((wrap(ph + 0.62) / 0.22) ** 2)) * smooth(0.1, 0.22, rr) * smooth(0.9, 0.45, rr);
      const fil = clamp(0.55 + n2.fbm(x * 14, y * 14, 5) * 1.4);
      const dust = clamp(lane * fil * 1.35 + 0.2 * smooth(0.15, 0.35, rr) * clamp(n2.fbm(x * 22 + 5, y * 22, 4) * 2));
      const clump = clamp(0.45 + fbm(x * 16, y * 16, 5) * 1.3);
      const disk = Math.exp(-rr / 0.24);
      const bulge = Math.exp(-Math.pow(rr / 0.075, 0.9));
      const bar = Math.exp(-(((x * Math.cos(0.4) + y * Math.sin(0.4)) / 0.16) ** 2 + ((-x * Math.sin(0.4) + y * Math.cos(0.4)) / 0.05) ** 2));
      // 光：老年恒星（暖）+ 年轻星团（蓝白）
      const old = disk * 0.55 + bulge * 2.6 + bar * 0.5;
      const young = arm * (disk * 2.2 + 0.1) * (0.4 + clump * 1.1);
      const att = 1 - 0.9 * dust;
      let r = (old * 1.0 + young * 0.5) * att;
      let g = (old * 0.84 + young * 0.76) * att;
      let b = (old * 0.62 + young * 1.18) * att;
      // HII 区：臂上稀疏的粉色小点
      const hii = clamp((fbm(x * 55 + 3, y * 55, 2) - 0.34) * 9) * armMain * armFade * smooth(0.2, 0.4, rr);
      r += hii * 0.55; g += hii * 0.18; b += hii * 0.34;
      const o = (j * size + i) * 3;
      px[o] = r; px[o + 1] = g; px[o + 2] = b;
    }
  }
  // 分辨出的亮星与蓝色星团（沿旋臂分布）
  const splat = (cx, cy, rad, cr, cg, cb) => {
    const x0 = Math.max(0, Math.floor(cx - rad * 3)), x1 = Math.min(size - 1, Math.ceil(cx + rad * 3));
    const y0 = Math.max(0, Math.floor(cy - rad * 3)), y1 = Math.min(size - 1, Math.ceil(cy + rad * 3));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const k = Math.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * rad * rad));
      const o = (yy * size + xx) * 3;
      px[o] += cr * k; px[o + 1] += cg * k; px[o + 2] += cb * k;
    }
  };
  for (let n = 0; n < 1500; n++) {
    const rr = 0.12 + Math.pow(R(), 0.8) * 0.85;
    const th = R() * Math.PI * 2;
    const x = rr * Math.cos(th), y = rr * Math.sin(th);
    const ph = 2 * th - Math.log(rr + 0.02) / pitch + 0.7 * fbm(x * 2.5, y * 2.5, 3);
    const onArm = Math.exp(-((wrap(ph) / 0.5) ** 2));
    if (R() > 0.15 + 0.85 * onArm) continue;
    const cx = (x + 1) * size / 2, cy = (y + 1) * size / 2;
    const m = Math.pow(R(), 3) * smooth(1, 0.5, rr);
    if (R() < 0.5) splat(cx, cy, 0.7 + m * 0.8, 0.18 + m * 1.1, 0.24 + m * 1.2, 0.42 + m * 1.3);
    else splat(cx, cy, 0.55, 0.45 * m + 0.06, 0.42 * m + 0.06, 0.38 * m + 0.06);
  }
  const out = new Uint8Array(size * size * 3);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i / size) * 2 - 1, y = (j / size) * 2 - 1;
    const edge = smooth(1, 0.8, Math.hypot(x, y));
    const o = (j * size + i) * 3;
    // 1-exp 色调映射，核心保持层次而不死白
    for (let c = 0; c < 3; c++) out[o + c] = toByte(255 * (1 - Math.exp(-px[o + c] * 1.25)) * edge);
  }
  return encodeJPEG(size, size, out, 90);
}

// 轨道视角的行星（仅上缘弧可见）：夜面为主，太阳即将从右侧临边升起。
// 以 SVG 坐标描述几何：图像覆盖 (X0,Y0)–(X0+SW,Y0+SH)，球心 (cx,cy)，半径 R，太阳位于 sun。
// 输出 RGB JPEG，太空部分为纯黑，外部以 screen 混合叠在不透明圆盘之上。
export function planetTexture({ w = 1600, h = 450, X0 = 0, Y0 = 240, SW = 1280, SH = 360, cx = 640, cy = 1392, R = 1062, sun = [1082, 424] } = {}) {
  const { fbm } = makeNoise(41);
  const nz2 = makeNoise(97);
  const px = new Uint8Array(w * h * 3);
  const pxs = SW / w; // 一个像素的 SVG 尺寸
  // 光从行星背后的右上方射来（z 朝向观者）
  const L = (() => { const v = [0.66, 0.16, -0.74], n = Math.hypot(...v); return v.map((c) => c / n); })();
  const H = (() => { const v = [L[0], L[1], L[2] + 1], n = Math.hypot(...v); return v.map((c) => c / n); })();
  const tilt = 1.05, ct = Math.cos(tilt), st = Math.sin(tilt);
  const sunAng = Math.atan2(-(sun[1] - cy), sun[0] - cx);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = X0 + (i + 0.5) * pxs, y = Y0 + (j + 0.5) * (SH / h);
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      const e = d - R; // 离地高度（SVG 单位），<0 在球内
      const cover = clamp(0.5 - e / pxs);
      // 沿临边与太阳的角距离：决定前向散射亮度
      const ang = Math.atan2(-dy, dx);
      const da = ang - sunAng;
      const fwd = Math.exp(-((da / 0.16) ** 2)) * 1.0 + Math.exp(-((da / 0.5) ** 2)) * 0.45 + Math.exp(-((da / 1.2) ** 2)) * 0.12;
      let r = 0, g = 0, b = 0;
      if (cover > 0) {
        const nx = dx / R, ny = -dy / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        // 旋转后求经纬度，避免极点落在可见区
        const py = ny * ct - nz * st, pz = ny * st + nz * ct;
        const lat = Math.asin(clamp(py, -1, 1)), lon = Math.atan2(nx, pz);
        const u = lon * 3.1, v = lat * 3.1;
        // 大陆：域扭曲 fbm
        const qx = fbm(u * 0.9 + 3.1, v * 0.9 - 1.7, 4), qy = fbm(u * 0.9 - 5.2, v * 0.9 + 2.3, 4);
        const landN = fbm(u * 1.3 + qx * 1.6, v * 1.3 + qy * 1.6, 7);
        const land = smooth(0.04, 0.1, landN);
        const coast = Math.exp(-(((landN - 0.07) / 0.05) ** 2));
        // 云：沿纬度拉长的云带
        const cq = nz2.fbm(u * 1.5, v * 3.2, 3);
        const cloud = smooth(0.02, 0.42, nz2.fbm(u * 2.4 + cq * 2.2, v * 4.6 + cq * 1.4, 6)) * 0.9;
        // 光照
        const NL = nx * L[0] + ny * L[1] + nz * L[2];
        const lit = smooth(-0.02, 0.3, NL);
        const spec = Math.pow(Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]), 90) * (1 - land) * (1 - cloud);
        // 夜面底色（月光 + 大气微光）
        let sr = lerp(2.2, 5.5, land), sg = lerp(4.5, 6.5, land), sb = lerp(11, 8, land);
        sr += 9 * cloud; sg += 12 * cloud; sb += 18 * cloud;
        // 城市灯光：沿海岸与内陆城市群成簇，高频点状
        const cluster = smooth(0.02, 0.32, fbm(u * 5 + 11, v * 5 - 7, 4));
        const dens = land * clamp(0.25 * cluster + 0.9 * coast * (0.3 + cluster)) * (1 - lit);
        const p1 = clamp((nz2.fbm(u * 150, v * 150, 2) - 0.22) * 4.5);
        const p2 = clamp((fbm(u * 60 + 40, v * 60, 2) - 0.2) * 3.2);
        const city = (p1 * p1 * 1.1 + p2 * p2 * 0.55) * dens * (1 - cloud * 0.85);
        const haze = dens * 0.16 * (1 - cloud * 0.5);
        sr += 255 * city + 190 * haze; sg += 178 * city + 110 * haze; sb += 92 * city + 50 * haze;
        // 日面
        const tone = smooth(-0.2, 0.3, nz2.fbm(u * 2 + 9, v * 2, 4));
        const dayOcean = [8, 30, 72], dayLand = [lerp(46, 104, tone), lerp(58, 84, tone), lerp(40, 58, tone)];
        let dr = lerp(dayOcean[0], dayLand[0], land), dg = lerp(dayOcean[1], dayLand[1], land), db = lerp(dayOcean[2], dayLand[2], land);
        dr = lerp(dr, 236, cloud); dg = lerp(dg, 238, cloud); db = lerp(db, 242, cloud);
        // 晨昏线：暖色低角度光
        const tw = Math.exp(-(((NL - 0.02) / 0.09) ** 2));
        dr = lerp(dr, dr * 1.25 + 30, tw); dg = lerp(dg, dg * 0.8, tw); db = lerp(db, db * 0.55, tw);
        r = lerp(sr, dr, lit) + 255 * spec; g = lerp(sg, dg, lit) + 236 * spec; b = lerp(sb, db, lit) + 205 * spec;
        // 临边大气：视线路径越长越蓝，受光一侧更亮
        const path = Math.exp(-nz / 0.07);
        const skyLit = smooth(-0.4, 0.25, NL);
        const hz = path * (0.25 + 0.75 * skyLit);
        r = lerp(r, 70, hz * 0.55); g = lerp(g, 150, hz * 0.6); b = lerp(b, 255, hz * 0.7);
        r += 120 * path * fwd; g += 90 * path * fwd; b += 60 * path * fwd;
        r *= cover; g *= cover; b *= cover;
      }
      if (cover < 1) {
        const a = Math.max(e, 0);
        const side = 0.18 + 0.82 * smooth(-0.3, 0.9, Math.cos(da));
        // 分层大气：低层暖、高层蓝，另加一道夜侧绿色气辉
        const low = Math.exp(-a / 3.4), mid = Math.exp(-a / 7), high = Math.exp(-a / 22);
        let or = 255 * low * 0.8 * fwd + 80 * mid * 0.8 * side + 40 * high * 0.3 * side;
        let og = 150 * low * 0.8 * fwd + 160 * mid * 0.8 * side + 110 * high * 0.3 * side;
        let ob = 70 * low * 0.8 * fwd + 255 * mid * 0.8 * side + 255 * high * 0.3 * side;
        const air = Math.exp(-(((a - 9) / 1.6) ** 2)) * (1 - smooth(0.2, 0.8, Math.cos(da))) * 0.22;
        or += 50 * air; og += 190 * air; ob += 110 * air;
        const k = 1 - cover;
        r += or * k; g += og * k; b += ob * k;
      }
      // 轻微抖动，消除暗部色带
      const dith = (((i * 7 + j * 13) % 5) - 2) * 0.35;
      const o = (j * w + i) * 3;
      px[o] = toByte(r + dith); px[o + 1] = toByte(g + dith); px[o + 2] = toByte(b + dith);
    }
  }
  return encodeJPEG(w, h, px, 90);
}
