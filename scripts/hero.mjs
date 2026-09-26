// 主视觉：银河下的夜间发射。16 秒循环：倒计时 → 点火 → 升空 → 一级关机分离 → 二级“太空水母” → 入轨
import { rng, anim, timeline, f, clamp, lerp, dataURI, jpegURI, FONT_DISPLAY, FONT_MONO, FONT_CN } from './lib.mjs';
import { skyTexture } from './textures.mjs';

const W = 1280, H = 720, D = 16;
const HORIZON = 604, PAD = { x: 900, y: 618 };
const T_IGN = 2.3, T_LIFT = 3.0, T_MAXQ = 5.5, T_MECO = 8.0, T_SEP = 8.6, T_SECO = 11.5;

// 升空轨迹（重力转弯）
const P = [[900, 618], [900, 500], [900, 340], [975, 190], [1135, 95]];
const TRAJ = `M${P[0]} L${P[1]} C${P[2]} ${P[3]} ${P[4]}`;
function trajSamples(n = 400) {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([900, lerp(618, 500, i / 40)]);
  for (let i = 1; i <= n; i++) {
    const t = i / n, m = 1 - t;
    const [a, b, c, d] = [P[1], P[2], P[3], P[4]];
    pts.push([
      m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t * t * t * d[0],
      m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t * t * t * d[1],
    ]);
  }
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = acc[acc.length - 1];
  return (frac) => {
    const target = frac * L;
    let i = acc.findIndex((v) => v >= target);
    if (i <= 0) i = 1;
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return { x: x1, y: y1, ang: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
  };
}
const at = trajSamples();

// 火箭沿轨迹的进度（与尾迹同步）
const MOTION = [[0, 0], [T_LIFT, 0], [T_MAXQ, 0.2], [T_MECO, 0.62], [T_SECO, 1], [D, 1]];
const SPLINES = ['0 0 1 1', '0.6 0 0.9 0.7', '0.3 0.3 0.8 0.9', '0.2 0.5 0.5 1', '0 0 1 1'].join(';');
const motionKT = MOTION.map(([t]) => f(t / D, 4)).join(';');
const motionKP = MOTION.map(([, v]) => v).join(';');

// 任务时钟（延时摄影）：画面秒 → 任务秒
const CLOCK = [[0, -3], [T_LIFT, 0], [T_MAXQ, 62], [T_MECO, 144], [T_SEP, 150], [T_SECO, 510], [D, 540]];
const PROFILE = [[0, 0, 0], [20, 420, 1.1], [40, 1000, 4.6], [62, 1650, 12], [100, 4200, 32], [144, 8250, 67], [150, 8200, 72], [200, 9800, 105], [300, 14500, 158], [420, 21000, 195], [510, 27400, 210], [540, 27600, 211]];
const interp = (table, x, col = 1) => {
  if (x <= table[0][0]) return table[0][col];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [a, b] = [table[i - 1], table[i]];
      return lerp(a[col], b[col], (x - a[0]) / (b[0] - a[0]));
    }
  }
  return table[table.length - 1][col];
};

const R = rng(2026);
const rand = (a = 0, b = 1) => a + (b - a) * R();

// ———————————————————— defs
function defs(sky) {
  return `
<defs>
  <clipPath id="frame"><rect width="${W}" height="${H}" rx="18"/></clipPath>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0b1626"/><stop offset="1" stop-color="#010308"/>
  </linearGradient>
  <linearGradient id="skyReflFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <mask id="skyReflMask"><rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#skyReflFade)"/></mask>
  <pattern id="ripples" width="64" height="6" patternUnits="userSpaceOnUse">
    <rect width="64" height="6" fill="#000" opacity=".0"/>
    <rect x="0" y="0" width="38" height="1" fill="#000" opacity=".55"/>
    <rect x="22" y="3" width="42" height="1" fill="#000" opacity=".4"/>
  </pattern>
  <pattern id="lattice" width="8" height="10" patternUnits="userSpaceOnUse">
    <rect width="8" height="10" fill="#070a11"/>
    <path d="M0 0L8 10M8 0L0 10M0 0H8" stroke="#1a2231" stroke-width=".8"/>
  </pattern>
  <!-- 箭体材质：圆柱体明暗（左侧天光冷边、右侧高光后收暗） -->
  <linearGradient id="hull" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#394150"/><stop offset=".1" stop-color="#6f7888"/><stop offset=".34" stop-color="#c3cbd6"/>
    <stop offset=".56" stop-color="#f6f8fb"/><stop offset=".68" stop-color="#e2e7ee"/><stop offset=".88" stop-color="#848d9c"/><stop offset="1" stop-color="#434a57"/>
  </linearGradient>
  <linearGradient id="hullDark" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#050608"/><stop offset=".45" stop-color="#1c2027"/><stop offset=".58" stop-color="#3a404b"/><stop offset=".75" stop-color="#1a1d23"/><stop offset="1" stop-color="#07080b"/>
  </linearGradient>
  <linearGradient id="carbon" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#0d0f13"/><stop offset=".55" stop-color="#2b3039"/><stop offset="1" stop-color="#111318"/>
  </linearGradient>
  <linearGradient id="soot" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#2a2320" stop-opacity=".55"/><stop offset=".22" stop-color="#3a332e" stop-opacity=".18"/><stop offset=".5" stop-color="#3a332e" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="fairingShade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".35" stop-color="#000" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="underGlow" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ffb35c" stop-opacity=".95"/><stop offset=".3" stop-color="#ff8a3a" stop-opacity=".35"/><stop offset=".7" stop-color="#ff8a3a" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="bell" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#1a1714"/><stop offset=".5" stop-color="#5a524a"/><stop offset="1" stop-color="#15130f"/>
  </linearGradient>
  <linearGradient id="mvac" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#23262c"/><stop offset=".55" stop-color="#4b3a33"/><stop offset="1" stop-color="#ff6a3a"/>
  </linearGradient>
  <!-- 一级羽流（海平面）：白热核心 → 金 → 橙，边缘软化 -->
  <linearGradient id="plume1" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fffdf4"/><stop offset=".16" stop-color="#fff0c2"/><stop offset=".42" stop-color="#ffc062"/><stop offset=".72" stop-color="#ff7a26" stop-opacity=".6"/><stop offset="1" stop-color="#ff4d10" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="plumeOuter" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffb24d" stop-opacity=".9"/><stop offset=".4" stop-color="#ff7a26" stop-opacity=".55"/><stop offset="1" stop-color="#d9400c" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="plumeGlow"><stop offset="0" stop-color="#ffc56b" stop-opacity=".75"/><stop offset=".5" stop-color="#ff8a2b" stop-opacity=".22"/><stop offset="1" stop-color="#ff6a1f" stop-opacity="0"/></radialGradient>
  <!-- 二级真空羽流：近乎透明的蓝白钟形 -->
  <radialGradient id="plume2" cx=".5" cy="0" r="1" fx=".5" fy="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".12" stop-color="#e2f6ff" stop-opacity=".5"/><stop offset=".45" stop-color="#8fd9ff" stop-opacity=".16"/><stop offset="1" stop-color="#5ab8ff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="plume2Core" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="#d6f2ff" stop-opacity=".5"/><stop offset="1" stop-color="#9fe0ff" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="smoke"><stop offset="0" stop-color="#b3bbc6" stop-opacity=".85"/><stop offset=".5" stop-color="#858f9c" stop-opacity=".5"/><stop offset="1" stop-color="#8a93a1" stop-opacity="0"/></radialGradient>
  <radialGradient id="smokeDark"><stop offset="0" stop-color="#5f6773" stop-opacity=".85"/><stop offset=".6" stop-color="#454c57" stop-opacity=".4"/><stop offset="1" stop-color="#3a414c" stop-opacity="0"/></radialGradient>
  <radialGradient id="smokeWarm"><stop offset="0" stop-color="#f3d2ac" stop-opacity=".9"/><stop offset=".5" stop-color="#b09482" stop-opacity=".5"/><stop offset="1" stop-color="#8a7d74" stop-opacity="0"/></radialGradient>
  <!-- 滤镜：烟雾/尾迹用静态湍流做置换，边缘变成卷曲的絮状 -->
  <filter id="fSmoke" filterUnits="userSpaceOnUse" x="300" y="360" width="980" height="360" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency=".018 .03" numOctaves="3" seed="11" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="46" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="1.6"/>
  </filter>
  <filter id="fTrail" filterUnits="userSpaceOnUse" x="700" y="0" width="580" height="660" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency=".007 .009" numOctaves="2" seed="4" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="2.6"/>
  </filter>
  <filter id="fB05" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".5"/></filter>
  <filter id="fB1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1"/></filter>
  <filter id="fB2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
  <filter id="fB4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="fB8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <radialGradient id="warm"><stop offset="0" stop-color="#ffd08a" stop-opacity=".95"/><stop offset=".35" stop-color="#ff9440" stop-opacity=".45"/><stop offset="1" stop-color="#ff6a1f" stop-opacity="0"/></radialGradient>
  <radialGradient id="flash"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".3" stop-color="#ffe6b0" stop-opacity=".6"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient>
  <radialGradient id="jelly"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".3" stop-color="#bff0ff" stop-opacity=".45"/><stop offset=".7" stop-color="#6fc8ff" stop-opacity=".12"/><stop offset="1" stop-color="#4a7dff" stop-opacity="0"/></radialGradient>
  <radialGradient id="starGlow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="#cfe6ff" stop-opacity=".35"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="glintH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfe6ff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient>
  <linearGradient id="glintV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient>
  <!-- 尾迹：低空在夜色里只是灰烟；越往上越进入阳光，变成金白 → 冰蓝 -->
  <linearGradient id="trailSmoke" gradientUnits="userSpaceOnUse" x1="0" y1="${PAD.y}" x2="0" y2="80">
    <stop offset="0" stop-color="#9aa3b0" stop-opacity=".55"/><stop offset=".22" stop-color="#5f6877" stop-opacity=".3"/>
    <stop offset=".42" stop-color="#b9a48e" stop-opacity=".26"/><stop offset=".62" stop-color="#f3dcc0" stop-opacity=".38"/><stop offset="1" stop-color="#bfe6ff" stop-opacity=".34"/>
  </linearGradient>
  <linearGradient id="trailSun" gradientUnits="userSpaceOnUse" x1="0" y1="${PAD.y}" x2="0" y2="80">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".36" stop-color="#ffd9a6" stop-opacity="0"/>
    <stop offset=".58" stop-color="#ffe8c8" stop-opacity=".55"/><stop offset=".8" stop-color="#fffaf0" stop-opacity=".8"/><stop offset="1" stop-color="#d4f1ff" stop-opacity=".75"/>
  </linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#dfeaff" stop-opacity="0"/><stop offset=".7" stop-color="#dfeaff" stop-opacity=".10"/><stop offset="1" stop-color="#fff" stop-opacity=".28"/>
  </linearGradient>
  <linearGradient id="towerLit" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ffc07a" stop-opacity=".95"/><stop offset=".45" stop-color="#ff9a4a" stop-opacity=".45"/><stop offset="1" stop-color="#ff8a3a" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="reflGlow" cx=".5" cy="0" r=".5"><stop offset="0" stop-color="#ffc47a" stop-opacity=".85"/><stop offset=".45" stop-color="#ff8a3a" stop-opacity=".3"/><stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient>
  <linearGradient id="reflStreak" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffc47a" stop-opacity=".9"/><stop offset=".5" stop-color="#ff8a3a" stop-opacity=".35"/><stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="hudFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#01030a" stop-opacity=".55"/><stop offset="1" stop-color="#01030a" stop-opacity=".85"/>
  </linearGradient>
  <radialGradient id="vignette" cx=".5" cy=".45" r=".75">
    <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/>
  </radialGradient>
  <linearGradient id="titleFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9d3ee"/>
  </linearGradient>
  <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#01030a" stop-opacity=".55"/><stop offset=".6" stop-color="#01030a" stop-opacity="0"/>
  </linearGradient>
  <image id="skyImg" href="${sky}" width="${W}" height="${H}" preserveAspectRatio="none"/>
</defs>`;
}

// ———————————————————— 星空（矢量星点，叠在烘焙纹理之上）
function stars() {
  const A = [1100, 619], B = [230, -36];
  const out = [];
  const colors = ['#ffffff', '#e9f2ff', '#cfe2ff', '#fff4e0', '#ffe2c0', '#ffd0a8'];
  const place = (inBand) => {
    for (let k = 0; k < 20; k++) {
      let x, y;
      if (inBand) {
        const t = R();
        const off = (R() + R() + R() - 1.5) * 90;
        x = lerp(A[0], B[0], t) + off * 0.6;
        y = lerp(A[1], B[1], t) + off * 0.8;
      } else { x = rand(0, W); y = rand(0, HORIZON - 8); }
      if (y < HORIZON - 6 && y > 0 && x > 0 && x < W) return [x, y];
    }
    return null;
  };
  for (let i = 0; i < 380; i++) {
    const p = place(i % 5 < 2);
    if (!p) continue;
    const m = Math.pow(R(), 3.2);
    const r = f(0.3 + m * 0.95);
    const op = f(0.35 + 0.65 * Math.pow(R(), 0.6));
    const c = colors[Math.floor(R() * colors.length)];
    let tw = '';
    if (R() < 0.18) {
      const d = f(rand(2.2, 6.5), 1);
      tw = `<animate attributeName="opacity" values="${op};${f(op * 0.25)};${op}" dur="${d}s" begin="-${f(rand(0, d), 1)}s" repeatCount="indefinite"/>`;
    }
    out.push(`<circle cx="${f(p[0], 1)}" cy="${f(p[1], 1)}" r="${r}" fill="${c}" opacity="${op}">${tw}</circle>`);
  }
  // 少量亮星：光晕 + 衍射星芒
  const bright = [[168, 92], [612, 58], [1022, 214], [352, 238], [1210, 330], [782, 132], [498, 402], [1248, 64]];
  bright.forEach(([x, y], i) => {
    const s = i < 3 ? 1 : 0.7;
    const d = f(rand(3, 7), 1);
    out.push(`<g transform="translate(${x} ${y}) scale(${s})" opacity=".95">
      <animate attributeName="opacity" values=".95;.55;.95" dur="${d}s" begin="-${f(rand(0, d), 1)}s" repeatCount="indefinite"/>
      <circle r="9" fill="url(#starGlow)"/><rect x="-16" y="-.35" width="32" height=".7" fill="url(#glintH)"/><rect x="-.35" y="-16" width=".7" height="32" fill="url(#glintV)"/><circle r="1.5" fill="#fff"/></g>`);
  });
  return out.join('\n');
}

// 远处卫星过境 + 流星
function skyEvents() {
  return `
<g opacity=".8">
  <circle r="1.1" fill="#fff"><animateMotion path="M40,150 L760,40" dur="38s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;.2;1;0" keyTimes="0;.08;.6;.63;.66;1" dur="38s" repeatCount="indefinite"/></circle>
</g>
<g>
  <path d="M0,0 L-120,70" stroke="url(#glintH)" stroke-width="1.4" stroke-linecap="round" transform="translate(470 70)" opacity="0">
    ${anim('opacity', D, [[12.2, 0], [12.3, 0.9], [12.8, 0]])}
    <animateTransform attributeName="transform" type="translate" dur="${D}s" repeatCount="indefinite" keyTimes="0;${f(12.2 / D, 4)};${f(12.8 / D, 4)};1" values="470 70;470 70;360 134;360 134"/>
  </path>
</g>`;
}

// ———————————————————— 地面：海面、发射场剪影
function ground() {
  const N = makeLine();
  return `
<rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#water)"/>
<g mask="url(#skyReflMask)" opacity=".5">
  <use href="#skyImg" transform="translate(0 ${2 * HORIZON}) scale(1 -1)"/>
</g>
<rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#ripples)" opacity=".5"/>
<!-- 远岸：一条低矮林线与零星钠灯，给左侧地平线纵深 -->
<path d="${farShore()}" fill="#060a13"/>
<g fill="#ffc47a">${[34, 71, 118, 186, 214, 297, 352, 410, 468, 503].map((x, i) => `<circle cx="${x}" cy="${f(601.6 + (i % 3) * 0.5, 1)}" r="${i % 4 ? 0.6 : 0.85}" opacity="${f(rand(0.45, 0.9))}"/>`).join('')}</g>
<g fill="#ffc47a" opacity=".22">${[34, 118, 214, 352, 468].map((x) => `<rect x="${x - 0.4}" y="605" width=".8" height="${f(rand(5, 10))}"/>`).join('')}</g>
<ellipse cx="560" cy="${HORIZON + 2}" rx="620" ry="9" fill="#8fa6c6" opacity=".07" filter="url(#fB8)"/>
<!-- 远处：垂直总装大楼、另一座发射塔 -->
<g fill="#0c1321">
  <rect x="1148" y="552" width="78" height="54"/><rect x="1226" y="570" width="26" height="36"/>
  <rect x="640" y="586" width="5" height="20"/><rect x="636" y="594" width="13" height="2"/>
</g>
<g fill="#ff3b30">
  <circle cx="1187" cy="551" r="1.2"><animate attributeName="opacity" values="1;.1;1" dur="2.4s" repeatCount="indefinite"/></circle>
  <circle cx="642.5" cy="585" r="1"><animate attributeName="opacity" values=".1;1;.1" dur="2.1s" repeatCount="indefinite"/></circle>
</g>
<g fill="#ffd9a0" opacity=".7">${[1160, 1172, 1196, 1210, 1236].map((x, i) => `<rect x="${x}" y="${580 + (i % 2) * 9}" width="2" height="1.2"/>`).join('')}</g>
<!-- 发射场所在的陆地 -->
<path d="${N}" fill="#04060b"/>
<!-- 海岸灯火倒影 -->
<g fill="#ffcf8a" opacity=".55">${[590, 700, 760, 1085, 1130, 1255].map((x) => `<rect x="${x}" y="${634 + R() * 4}" width="1.4" height="${f(rand(8, 20))}" opacity="${f(rand(0.3, 0.8))}"/>`).join('')}</g>
<g fill="#ffd9a0">${[590, 700, 760, 1085, 1130, 1255].map((x) => `<circle cx="${x + 0.7}" cy="628" r="1"/>`).join('')}</g>`;
}
function farShore() {
  const pts = [[0, 604]];
  for (let x = 0; x <= 600; x += 8) pts.push([x, f(601.5 - 0.9 * Math.sin(x / 23) - rand(0, 1.1) - (x > 560 ? (x - 560) * -0.05 : 0), 1)]);
  pts.push([600, 604]);
  return 'M' + pts.map((p) => p.join(',')).join(' L') + ' Z';
}
function makeLine() {
  const pts = [];
  pts.push([520, 632]);
  for (let x = 540; x <= 1280; x += 6) {
    let y = 613 - 1.6 * Math.sin(x / 41) - 1.1 * Math.sin(x / 13.7) - rand(0, 1.4);
    if (Math.abs(x - PAD.x) < 70) y = 616; // 发射台平整区
    if (x < 580) y = lerp(630, y, (x - 540) / 40);
    pts.push([x, f(y, 1)]);
  }
  pts.push([1280, 636], [520, 636]);
  return 'M' + pts.map((p) => p.join(',')).join(' L') + ' Z';
}

// 固定服务塔、避雷塔、水塔、探照灯
function padStructures() {
  const towerX = 913, towerTop = 438;
  const masts = [[848, 392], [986, 400], [1036, 450]];
  const wires = [
    `M848,392 Q880,470 913,${towerTop - 30}`, `M913,${towerTop - 30} Q950,470 986,400`,
    `M848,392 Q820,520 780,616`, `M986,400 Q1020,520 1060,616`, `M1036,450 Q1000,540 986,616`,
  ];
  const beams = [[790, 624], [1004, 624], [1090, 622]].map(([x, y], i) => {
    const tx = PAD.x + (i - 1) * 3, ty = 470 + i * 18;
    const ang = Math.atan2(ty - y, tx - x);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const w0 = 1.2, w1 = 18;
    const L = Math.hypot(tx - x, ty - y) * 1.35;
    const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
    return `<path d="M${f(x + nx * w0)},${f(y + ny * w0)} L${f(ex + nx * w1)},${f(ey + ny * w1)} L${f(ex - nx * w1)},${f(ey - ny * w1)} L${f(x - nx * w0)},${f(y - ny * w0)} Z" fill="url(#beam)" transform="rotate(0)" opacity=".9"
      style="mix-blend-mode:screen"><animate attributeName="opacity" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[0, 0.9], [T_LIFT, 0.9], [T_LIFT + 3, 0.35], [14.5, 0.35], [D, 0.9]]))}/></path>`;
  });
  return `
<g id="beams" filter="url(#fB1)">${beams.join('')}</g>
<g stroke="#0b0f18" stroke-width=".7" fill="none" opacity=".9">${wires.map((d) => `<path d="${d}"/>`).join('')}</g>
<g fill="#06080e">
  ${masts.map(([x, y]) => `<rect x="${x - 1.2}" y="${y}" width="2.4" height="${PAD.y - y}"/><rect x="${x - 3}" y="${PAD.y - 26}" width="6" height="26"/>`).join('')}
  <!-- 水塔 -->
  <rect x="1098" y="588" width="1.5" height="28"/><rect x="1110" y="588" width="1.5" height="28"/><rect x="1104" y="588" width="1.2" height="28"/>
  <circle cx="1105" cy="584" r="9"/>
</g>
<!-- 服务塔 -->
<rect x="${towerX}" y="${towerTop}" width="22" height="${PAD.y - towerTop}" fill="url(#lattice)"/>
<rect x="${towerX + 2}" y="${towerTop - 30}" width="2" height="30" fill="#06080e"/>
<rect x="${towerX - 3}" y="${towerTop - 4}" width="30" height="5" fill="#06080e"/>
<rect x="${towerX - 7}" y="472" width="8" height="3" fill="#0b0f18"/>
<rect x="${towerX - 7}" y="552" width="8" height="2.5" fill="#0b0f18"/>
<rect x="${PAD.x - 40}" y="${PAD.y - 4}" width="110" height="6" fill="#05070c"/>
<!-- 塔身分层平台、航标灯、乘员通道臂 -->
<g fill="#0a0e16">${[460, 482, 504, 526, 548, 570, 592].map((y) => `<rect x="${towerX - 1.5}" y="${y}" width="25" height="1.6"/>`).join('')}</g>
<g fill="#ffd9a0">${[[towerX + 20.5, 482], [towerX + 1.5, 526], [towerX + 20.5, 570], [towerX + 1.5, 592]].map(([x, y]) => `<circle cx="${x}" cy="${y - 1}" r=".75"/><circle cx="${x}" cy="${y - 1}" r="3" fill="url(#warm)" opacity=".5"/>`).join('')}</g>
<rect x="${towerX - 12}" y="466" width="12" height="7.5" rx=".8" fill="#0b0f18"/><rect x="${towerX - 9.5}" y="468.4" width="3.2" height="1.6" fill="#ffe2b0" opacity=".75"/>
<!-- 塔身被火焰照亮的边缘 -->
<rect x="${towerX}" y="${towerTop}" width="1.6" height="${PAD.y - towerTop}" fill="url(#towerLit)" opacity="0" style="mix-blend-mode:screen">
  ${anim('opacity', D, [[T_IGN, 0], [T_LIFT, 0.85], [5, 0.7], [8, 0]])}
</rect>
<g fill="#ff3b30">
  ${[...masts.map(([x, y]) => [x, y]), [towerX + 3, towerTop - 30]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.4"><animate attributeName="opacity" values="1;.15;1" dur="${2 + i * 0.3}s" repeatCount="indefinite"/></circle>`).join('')}
</g>
<g fill="#ffe2b0">${[860, 880, 950, 975, 1010].map((x) => `<circle cx="${x}" cy="${PAD.y - 1}" r=".9"/>`).join('')}</g>`;
}
const attrs = ({ keyTimes, values }) => `keyTimes="${keyTimes}" values="${values}"`;

// ———————————————————— 火箭
// 局部坐标：发动机喷口平面 y=0，箭头朝 −y。一级 −108…0，二级 −126…−108，整流罩 −167.5…−126
function rocket() {
  const flame1 = `
<g>
  ${anim('opacity', D, [[0, 0], [T_IGN, 0], [T_IGN + 0.15, 0.8], [T_IGN + 0.3, 0.5], [T_LIFT, 1], [T_MECO, 1], [T_MECO + 0.08, 0]])}
  <g>
    <animateTransform attributeName="transform" type="scale" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[0, '0.6 0.3'], [T_IGN, '0.6 0.3'], [T_LIFT, '1.2 1.15'], [T_MAXQ, '1.45 1.5'], [T_MECO, '2.3 2']]))}/>
    <ellipse cy="44" rx="78" ry="104" fill="url(#plumeGlow)" opacity=".42"/>
    <ellipse cy="40" rx="24" ry="58" fill="url(#plumeGlow)" opacity=".9"/>
    <g>
      <animateTransform attributeName="transform" type="scale" values="1 1;1.05 1.1;.97 .93;1.03 1.06;.98 .97;1 1" dur=".23s" repeatCount="indefinite"/>
      <g>
        <animateTransform attributeName="transform" type="skewX" values="0;1.8;-1.2;.9;-1.6;0" dur=".41s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;.88;1;.93;.97;1" dur=".13s" repeatCount="indefinite"/>
        <path d="M-6.6,0 C-11.5,22 -9,66 0,106 C9,66 11.5,22 6.6,0 Z" fill="url(#plumeOuter)" filter="url(#fB2)"/>
        <path d="M-5.6,0 C-7.8,16 -4.8,48 0,80 C4.8,48 7.8,16 5.6,0 Z" fill="url(#plume1)" filter="url(#fB1)"/>
        <g fill="#fffef8" filter="url(#fB05)">${[-3.8, 0, 3.8].map((x) => `<path d="M${f(x - 1.5, 1)},0 C${f(x - 1.7, 1)},6 ${f(x - 0.7, 1)},13 ${x},19 C${f(x + 0.7, 1)},13 ${f(x + 1.7, 1)},6 ${f(x + 1.5, 1)},0 Z"/>`).join('')}</g>
        <path d="M-3,6 C-3,16 -1.4,30 0,42 C1.4,30 3,16 3,6 Z" fill="#fff4d6" opacity=".8" filter="url(#fB1)"/>
        <g fill="#fff" opacity=".75" filter="url(#fB05)"><path d="M0,24 l1.4,2.6 -1.4,2.6 -1.4,-2.6z"/><path d="M0,34 l1.1,2.3 -1.1,2.3 -1.1,-2.3z"/><path d="M0,43 l.8,2 -.8,2 -.8,-2z"/></g>
      </g>
    </g>
  </g>
</g>`;
  // 冷气推进器：分离后一级翻转时的白色短促喷气
  const rcs = [0.15, 0.55, 1.0, 1.45].map((d, i) => {
    const t0 = T_SEP + d, s = i % 2 ? 1 : -1;
    return `<circle cx="${s * 6.5}" cy="-103" r="0" fill="#eef8ff" filter="url(#fB1)">
      <animate attributeName="r" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[t0, 0.4], [t0 + 0.5, 7]]))}/>
      <animate attributeName="cx" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[t0, s * 6.5], [t0 + 0.5, s * 15]]))}/>
      <animate attributeName="opacity" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[0, 0], [t0, 0], [t0 + 0.04, 0.9], [t0 + 0.5, 0]]))}/></circle>`;
  }).join('');
  const gridFin = (s) => `<g transform="translate(${s * 7.6} -103.4)" fill="none" stroke-width=".32">
    <rect x="-1.6" y="-2.5" width="3.2" height="5" fill="#15181e" stroke="#3a414c" stroke-width=".45"/>
    <path d="M-1.6,-.85H1.6M-1.6,.85H1.6M-.55,-2.5V2.5M.55,-2.5V2.5" stroke="#4a525f"/></g>`;
  const leg = (s) => `<path d="M${s * 6},-5.6 L${s * 7.5},-6.2 L${s * 7.15},-40 L${s * 6},-42.6 Z" fill="url(#carbon)"/>
    <path d="M${s * 7.05},-9 L${s * 6.8},-39" stroke="#5a6270" stroke-width=".25" fill="none"/>
    <rect x="${s > 0 ? 6 : -7.9}" y="-8.4" width="1.9" height="1.4" fill="#0b0d11"/>`;
  const booster = `
<g>
  <animateTransform attributeName="transform" type="translate" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[T_MECO + 0.35, '0 0'], [T_MECO + 0.45, '0 3'], [T_MECO + 2.6, '-8 132'], [T_MECO + 2.61, '0 0']]))}/>
  ${anim('opacity', D, [[T_MECO + 0.35, 1], [T_MECO + 1.5, 1], [T_MECO + 2.55, 0], [D - 0.01, 0], [D, 1]])}
  <g>
    <animateTransform attributeName="transform" type="rotate" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[T_SEP, '0 0 -56'], [T_MECO + 2.6, '-165 0 -56'], [T_MECO + 2.61, '0 0 -56']]))}/>
    ${flame1}
    <g fill="url(#bell)">${[-3.9, 0, 3.9].map((x) => `<path d="M${f(x - 1.3, 1)},-3 L${f(x - 1.9, 1)},1.6 L${f(x + 1.9, 1)},1.6 L${f(x + 1.3, 1)},-3 Z"/>`).join('')}</g>
    <rect x="-6.4" y="-6.4" width="12.8" height="3.8" rx=".6" fill="url(#hullDark)"/>
    <rect x="-6" y="-108" width="12" height="102" fill="url(#hull)"/>
    <rect x="-6" y="-108" width="12" height="102" fill="url(#soot)"/>
    <g fill="#0b0f18" opacity=".22"><rect x="-6" y="-47.4" width="12" height=".45"/><rect x="-6" y="-78.4" width="12" height=".45"/></g>
    <g fill="#fff" opacity=".4"><rect x="-6" y="-46.9" width="12" height=".3"/><rect x="-6" y="-77.9" width="12" height=".3"/></g>
    <rect x="3" y="-94" width="1.1" height="86" fill="#98a1ae" opacity=".6"/><rect x="4.05" y="-94" width=".35" height="86" fill="#262b33" opacity=".45"/>
    ${leg(-1)}${leg(1)}
    <text transform="translate(1.9 -31) rotate(-90)" font-family="${FONT_DISPLAY}" font-size="6.2" font-weight="700" letter-spacing="2.3" fill="#1b2030" opacity=".82">QIAO</text>
    <circle cx="-.35" cy="-27.2" r=".9" fill="#5cc8ff"/>
    <rect x="-6" y="-108" width="12" height="13" fill="url(#hullDark)"/>
    <rect x="-6" y="-95.4" width="12" height=".4" fill="#6b7482" opacity=".7"/>
    ${gridFin(-1)}${gridFin(1)}
    <rect x="-6" y="-95" width=".7" height="89" fill="#a9c8ff" opacity=".26"/>
    <rect x="-6.4" y="-64" width="12.8" height="60" fill="url(#underGlow)" opacity="0" style="mix-blend-mode:screen">
      ${anim('opacity', D, [[T_IGN, 0], [T_IGN + 0.15, 0.9], [T_LIFT, 1], [T_LIFT + 1.2, 0.85], [T_MAXQ, 0.5], [T_MECO, 0.45], [T_MECO + 0.1, 0]])}</rect>
    ${rcs}
  </g>
</g>`;
  const flame2 = `
<g opacity="0" transform="translate(0 -96)">
  ${anim('opacity', D, [[T_SEP, 0], [T_SEP + 0.5, 0.95], [T_SECO + 0.6, 0.9], [T_SECO + 1.6, 0]])}
  <g>
    <animateTransform attributeName="transform" type="scale" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[T_SEP, '0.3 0.3'], [T_SECO, '1.6 1.5'], [D, '2 1.8']]))}/>
    <ellipse cy="16" rx="40" ry="52" fill="url(#jelly)" opacity=".5" filter="url(#fB4)"/>
    <path d="M-5,0 C-26,50 -62,130 -92,196 C-40,234 40,234 92,196 C62,130 26,50 5,0 Z" fill="url(#plume2)" filter="url(#fB4)"/>
    <g fill="none" stroke="#cdf2ff" stroke-width="1.2" filter="url(#fB2)">
      <path d="M-4.5,2 C-24,56 -58,132 -88,194 M4.5,2 C24,56 58,132 88,194" opacity=".2"/>
      <path d="M-3.5,2 C-14,60 -30,130 -46,208 M3.5,2 C14,60 30,130 46,208" opacity=".12"/>
    </g>
    <path d="M-4.2,0 C-4.6,12 -2.2,34 0,60 C2.2,34 4.6,12 4.2,0 Z" fill="url(#plume2Core)" filter="url(#fB1)"/>
    <ellipse cy="1.5" rx="4.6" ry="2" fill="#fff" filter="url(#fB05)"/>
  </g>
</g>`;
  const upper = `
<g>
  ${flame2}
  <path d="M-2.3,-108 L2.3,-108 L5.2,-96 L-5.2,-96 Z" fill="url(#mvac)"/>
  <path d="M-2.3,-108 L2.3,-108 L5.2,-96 L-5.2,-96 Z" fill="#ff5a2a" opacity="0" filter="url(#fB05)" style="mix-blend-mode:screen">
    ${anim('opacity', D, [[T_SEP + 0.5, 0], [T_SEP + 2, 0.5], [T_SECO, 0.7], [T_SECO + 2, 0]])}</path>
  <rect x="-6" y="-126" width="12" height="18" fill="url(#hull)"/>
  <rect x="-6" y="-110.4" width="12" height="2.4" fill="url(#hullDark)"/>
  <path d="M-6,-126 L-7.4,-131.5 L-7.4,-147 C-7.4,-157.5 -3.4,-165.5 0,-167.5 C3.4,-165.5 7.4,-157.5 7.4,-147 L7.4,-131.5 L6,-126 Z" fill="url(#hull)"/>
  <path d="M-7.4,-131.5 L-7.4,-147 C-7.4,-157.5 -3.4,-165.5 0,-167.5 C3.4,-165.5 7.4,-157.5 7.4,-147 L7.4,-131.5 Z" fill="url(#fairingShade)"/>
  <rect x="-7.4" y="-131.9" width="14.8" height=".5" fill="#56606e"/>
  <path d="M1,-131.5 L1,-150 C1,-158 .6,-164 .2,-167" stroke="#7f8896" stroke-width=".35" fill="none" opacity=".8"/>
  <path d="M-7.4,-131.5 L-7.4,-147 C-7.4,-157.5 -3.4,-165.5 0,-167.5" stroke="#bcd6ff" stroke-width=".5" fill="none" opacity=".32"/>
  <path d="M2.4,-133 L2.4,-148 C2.4,-155 1.6,-160 .9,-163" stroke="#fff" stroke-width=".7" fill="none" opacity=".5"/>
</g>`;
  // 火箭整体：沿轨迹运动 + 远去缩小
  return `
<g opacity="1">
  ${anim('opacity', D, [[0, 0], [0.6, 1], [T_SECO + 0.8, 1], [T_SECO + 1.8, 0]])}
  <animateMotion path="${TRAJ}" rotate="auto" dur="${D}s" repeatCount="indefinite" calcMode="spline" keyTimes="${motionKT}" keyPoints="${motionKP}" keySplines="${SPLINES}"/>
  <g transform="rotate(90)">
    <g>
      <animateTransform attributeName="transform" type="scale" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[T_LIFT, 1], [T_MAXQ, 0.82], [T_MECO, 0.52], [T_SECO, 0.3]]))}/>
      ${upper}
      ${booster}
    </g>
  </g>
</g>`;
}

// 尾迹：与火箭同步“画出”。低空是被湍流撕开的灰烟柱，高空进入阳光；火箭身后跟一段短的炽热余辉
function trail() {
  const kp = MOTION.map(([, v]) => v);
  const dashTo = (fn) => `<animate attributeName="stroke-dashoffset" dur="${D}s" repeatCount="indefinite" calcMode="spline" keyTimes="${motionKT}" values="${kp.map((v) => f(fn(v), 4)).join(';')}" keySplines="${SPLINES}"/>`;
  const drawn = dashTo((v) => 1 - v);
  const head = (L, w, c, op) => `<path d="${TRAJ}" pathLength="1" stroke-dasharray="${L} 3" stroke-dashoffset="${L}" fill="none" stroke="${c}" stroke-width="${w}" opacity="${op}">${dashTo((v) => L - v)}</path>`;
  return `
<g>
  ${anim('opacity', D, [[0, 1], [12.4, 1], [15.6, 0], [D, 0]])}
  <g filter="url(#fTrail)">
    <path d="${TRAJ}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" fill="none" stroke="url(#trailSmoke)" stroke-width="12" stroke-linecap="round">${drawn}
      ${anim('stroke-width', D, [[T_LIFT, 8], [9, 16], [15.6, 34]])}</path>
    <path d="${TRAJ}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" fill="none" stroke="url(#trailSun)" stroke-width="4" stroke-linecap="round">${drawn}
      ${anim('stroke-width', D, [[T_LIFT, 3], [10, 5], [15.6, 13]])}</path>
  </g>
  <g filter="url(#fB1)" style="mix-blend-mode:screen" opacity="0">
    ${anim('opacity', D, [[T_IGN, 0], [T_LIFT + 0.3, 1], [T_MECO, 1], [T_MECO + 0.3, 0.25], [T_SEP + 0.6, 0.7], [T_SECO, 0.7], [T_SECO + 0.8, 0]])}
    ${head(0.1, 2.6, '#ffc98a', 0.35)}
    ${head(0.04, 1.6, '#fff2da', 0.75)}
  </g>
</g>`;
}

// 高空“太空水母”：二级羽流被地平线下的阳光照亮
function jellyfish() {
  const blobs = [0.66, 0.76, 0.86, 0.95].map((fr, i) => {
    const p = at(fr);
    const s = 0.7 + i * 0.28;
    return `<g transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.ang)})">
      <g>
        <animateTransform attributeName="transform" type="scale" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[T_SEP + i * 0.6, '0.2 0.2'], [T_SECO + 1 + i * 0.3, `${f(s)} ${f(s)}`], [15.8, `${f(s * 1.35)} ${f(s * 1.5)}`]]))}/>
        <ellipse cx="-30" rx="90" ry="44" fill="url(#jelly)" opacity=".7"/>
        <path d="M40,0 C0,-66 -118,-70 -160,-8 M40,0 C0,66 -118,70 -160,8" fill="none" stroke="#ffd9c8" stroke-width="2.4" opacity=".16"/>
        <path d="M40,0 C0,-60 -110,-64 -150,-6 M40,0 C0,60 -110,64 -150,6" fill="none" stroke="#c9f1ff" stroke-width="1.1" opacity=".42"/>
        <path d="M34,0 C4,-34 -70,-38 -110,-4 M34,0 C4,34 -70,38 -110,4" fill="none" stroke="#e6f8ff" stroke-width=".7" opacity=".26"/>
      </g>
    </g>`;
  });
  return `
<g opacity="0" style="mix-blend-mode:screen" filter="url(#fB2)">
  ${anim('opacity', D, [[T_SEP, 0], [T_SECO, 0.8], [14, 0.65], [15.8, 0], [D, 0]])}
  ${blobs.join('\n')}
</g>`;
}

// 发射台烟雾、闪光、照明
function padFx() {
  // 烟团：k 为 0→1 的扩散进度，1 之后缓慢漂散；越靠近火焰越暖
  const puffs = [];
  const puff = ({ t0, x0, y0, dx, dy, r1, flat = 1, rise = 18, peak = 0.85, fill }) => {
    const kf = (fn) => timeline(D, [[0, fn(0)], [t0, fn(0)], [t0 + 0.9, fn(0.55)], [t0 + 4, fn(1)], [15.6, fn(1.25)], [D - 0.01, fn(1.25)], [D, fn(0)]]);
    const cx = kf((k) => f(x0 + dx * k, 1));
    const cy = kf((k) => f(y0 + dy * k - (k > 1 ? rise : 0), 1));
    const rad = (k) => (k === 0 ? 2 : r1 * (0.35 + 0.65 * Math.min(k, 1)) * (k > 1 ? 1.35 : 1));
    const rx = kf((k) => f(rad(k), 1)), ry = kf((k) => f(rad(k) * flat, 1));
    const op = timeline(D, [[0, 0], [t0, 0], [t0 + 0.35, peak], [t0 + 4, peak * 0.7], [12, peak * 0.38], [15.6, 0], [D, 0]]);
    puffs.push({ d: Math.abs(dx), s: `<ellipse fill="${fill}" cx="${x0}" cy="${y0}" rx="0" ry="0" opacity="0">
      <animate attributeName="cx" dur="${D}s" repeatCount="indefinite" ${attrs(cx)}/>
      <animate attributeName="cy" dur="${D}s" repeatCount="indefinite" ${attrs(cy)}/>
      <animate attributeName="rx" dur="${D}s" repeatCount="indefinite" ${attrs(rx)}/>
      <animate attributeName="ry" dur="${D}s" repeatCount="indefinite" ${attrs(ry)}/>
      <animate attributeName="opacity" dur="${D}s" repeatCount="indefinite" ${attrs(op)}/></ellipse>` });
  };
  // 主烟团：从导流槽两侧涌出，左侧更大
  for (let i = 0; i < 40; i++) {
    const side = R() < 0.62 ? -1 : 1;
    const dx = side * (30 + (side < 0 ? 260 : 200) * Math.pow(R(), 0.8));
    const near = Math.abs(dx) < 110;
    puff({
      t0: T_IGN + Math.pow(R(), 1.4) * 2.2, x0: PAD.x + side * rand(4, 16), y0: PAD.y + 2,
      dx, dy: -(4 + 50 * Math.pow(R(), 1.5)), r1: 14 + 46 * R(), flat: rand(0.62, 0.9),
      fill: near && R() < 0.7 ? 'url(#smokeWarm)' : R() < 0.3 ? 'url(#smokeDark)' : 'url(#smoke)',
    });
  }
  // 贴地铺开的低层烟：扁、宽、淡
  for (let i = 0; i < 10; i++) {
    const side = i % 3 === 0 ? 1 : -1;
    puff({
      t0: T_IGN + 0.4 + R() * 1.6, x0: PAD.x + side * 12, y0: PAD.y + 4,
      dx: side * rand(120, 330), dy: -rand(0, 6), r1: rand(50, 80), flat: 0.28, rise: 4, peak: 0.55, fill: 'url(#smoke)',
    });
  }
  // 升空瞬间的蒸汽柱（喷水降噪系统），被火焰从下方照亮
  for (let i = 0; i < 9; i++) {
    puff({
      t0: T_LIFT - 0.2 + i * 0.16, x0: PAD.x + rand(-6, 6), y0: PAD.y - 6,
      dx: rand(-26, 18), dy: -rand(40, 110), r1: rand(16, 28), flat: 1.1, rise: 30, peak: 0.6,
      fill: i < 5 ? 'url(#smokeWarm)' : 'url(#smoke)',
    });
  }
  puffs.sort((a, b) => b.d - a.d);
  // 点火前液氧排气
  const vents = [];
  for (let i = 0; i < 7; i++) {
    const t0 = i * 0.32;
    const y = PAD.y - rand(96, 120);
    vents.push(`<circle fill="url(#smoke)" cx="${PAD.x + 6}" cy="${f(y)}" r="2" opacity="0">
      <animate attributeName="cx" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[t0, PAD.x + 6], [t0 + 1.8, PAD.x + 44 + i * 3]]))}/>
      <animate attributeName="cy" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[t0, f(y)], [t0 + 1.8, f(y - 16)]]))}/>
      <animate attributeName="r" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[t0, 2], [t0 + 1.8, 13]]))}/>
      <animate attributeName="opacity" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, [[t0, 0], [t0 + 0.2, 0.55], [t0 + 1.8, 0]]))}/></circle>`);
  }
  const glowTL = [[0, 0], [T_IGN, 0], [T_IGN + 0.15, 0.7], [T_IGN + 0.4, 0.5], [T_LIFT, 1], [4.4, 1], [T_MAXQ, 0.6], [7.5, 0.15], [9, 0], [D, 0]];
  return {
    back: `
<ellipse cx="${PAD.x}" cy="${PAD.y}" rx="520" ry="330" fill="url(#warm)" opacity="0">${anim('opacity', D, glowTL.map(([t, v]) => [t, f(v * 0.32)]))}</ellipse>`,
    front: `
<g filter="url(#fB2)">${vents.join('\n')}</g>
<g filter="url(#fSmoke)">${puffs.map((p) => p.s).join('\n')}</g>
<ellipse cx="${PAD.x - 40}" cy="${PAD.y - 10}" rx="300" ry="80" fill="url(#warm)" opacity="0" style="mix-blend-mode:screen">${anim('opacity', D, glowTL)}</ellipse>
<circle cx="${PAD.x}" cy="${PAD.y - 6}" r="140" fill="url(#flash)" opacity="0">${anim('opacity', D, [[T_IGN, 0], [T_IGN + 0.08, 0.95], [T_IGN + 0.6, 0.2], [T_LIFT, 0.5], [T_LIFT + 0.8, 0]])}</circle>
<g opacity="0">
  ${anim('opacity', D, glowTL)}
  <rect x="${PAD.x - 80}" y="632" width="160" height="88" fill="url(#reflGlow)" opacity=".5"/>
  <g fill="#ffc98a">${reflDashes()}</g>
</g>`,
  };
}

function reflDashes() {
  const out = [];
  for (let i = 0; i < 26; i++) {
    const y = 638 + Math.pow(R(), 0.8) * 76;
    const spread = 10 + (y - 636) * 0.45;
    const w = rand(4, 16 + (y - 636) * 0.35);
    const x = PAD.x + rand(-spread, spread) - w / 2;
    out.push(`<rect x="${f(x, 1)}" y="${f(y, 1)}" width="${f(w, 1)}" height="${f(rand(0.8, 1.8), 1)}" opacity="${f(0.9 - (y - 636) / 110, 2)}"/>`);
  }
  return out.join("");
}

// ———————————————————— HUD（SpaceX 直播风格遥测）
function hud() {
  const step = 0.25;
  const frames = [];
  for (let t = 0; t < D; t += step) frames.push(t);
  const fmtClock = (m) => {
    const neg = m < 0;
    const s = Math.abs(neg ? Math.floor(m) : Math.floor(m));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${neg ? 'T−' : 'T+'} ${hh}:${mm}:${ss}`;
  };
  const vis = (t0, t1) => {
    const a = f(t0 / D, 4), b = f(Math.min(t1, D) / D, 4);
    if (a === 0) return `values="visible;hidden" keyTimes="0;${b}"`;
    return `values="hidden;visible;hidden" keyTimes="0;${a};${b}"`;
  };
  const seq = (x, y, fn, cls, anchor = 'start') => {
    const out = [];
    let prev = null, start = 0;
    const flush = (end) => prev !== null && out.push(`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" visibility="hidden"><animate attributeName="visibility" dur="${D}s" repeatCount="indefinite" calcMode="discrete" ${vis(start, end)}/>${prev}</text>`);
    for (const t of frames) {
      const v = fn(t);
      if (v !== prev) { flush(t); prev = v; start = t; }
    }
    flush(D);
    return out.join('\n');
  };
  const mission = (t) => interp(CLOCK, t);
  const clock = seq(56, 688, (t) => fmtClock(t < T_LIFT ? Math.floor(t) - 3 : mission(t)), 'clock');
  const stage = seq(57, 656, (t) => (t < T_IGN ? 'TERMINAL COUNT' : t < T_LIFT ? 'ENGINE IGNITION' : t < 5 ? 'LIFTOFF' : t < 6.6 ? 'MAX-Q' : t < T_MECO ? 'ASCENT' : t < T_SEP ? 'MECO · STAGE SEP' : t < T_SECO ? 'SECOND STAGE · MVAC' : 'ORBIT ACHIEVED'), 'stage');
  const speedAt = (t) => (t < T_LIFT ? 0 : interp(PROFILE, mission(t), 1));
  const altAt = (t) => (t < T_LIFT ? 0 : interp(PROFILE, mission(t), 2));
  const G1 = 1010, G2 = 1138, GY = 670, GR = 30;
  const speed = seq(G1, GY + 5, (t) => Math.round(speedAt(t)).toLocaleString('en-US'), 'gnum', 'middle');
  const alt = seq(G2, GY + 5, (t) => (altAt(t) < 10 ? altAt(t).toFixed(1) : Math.round(altAt(t))), 'gnum', 'middle');
  const circ = 2 * Math.PI * GR * 0.75;
  const gaugeArc = (cx, fn, max) => {
    const tl = [];
    for (let t = 0; t <= D + 0.001; t += 0.5) tl.push([Math.min(t, D), f(circ * (1 - clamp(fn(Math.min(t, D - 0.01)) / max)), 1)]);
    return `<circle cx="${cx}" cy="${GY}" r="${GR}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="3" stroke-dasharray="${f(circ, 1)} 999" transform="rotate(135 ${cx} ${GY})"/>
    <circle cx="${cx}" cy="${GY}" r="${GR}" fill="none" stroke="#e8f4ff" stroke-width="3" stroke-linecap="round" stroke-dasharray="${f(circ, 1)} 999" stroke-dashoffset="${f(circ, 1)}" transform="rotate(135 ${cx} ${GY})">
      <animate attributeName="stroke-dashoffset" dur="${D}s" repeatCount="indefinite" ${attrs(timeline(D, tl))}/></circle>`;
  };
  // 时间线
  const X0 = 410, X1 = 890, TY = 684;
  const tx = (t) => f(X0 + ((t - 1) / (T_SECO + 0.5 - 1)) * (X1 - X0), 1);
  const events = [[T_LIFT, 'LIFTOFF'], [T_MAXQ, 'MAX-Q'], [T_MECO + 0.3, 'MECO · SEP'], [T_SECO, 'SECO']];
  const ev = events.map(([t, label], i) => {
    const x = tx(t);
    const on = `<animate attributeName="fill" dur="${D}s" repeatCount="indefinite" calcMode="discrete" values="#5b6b80;#ffffff;#5b6b80" keyTimes="0;${f(t / D, 4)};${f(15.5 / D, 4)}"/>`;
    const ly = TY - 13;
    return `<circle cx="${x}" cy="${TY}" r="3.2" fill="#01030a" stroke="#8fa3bb" stroke-width="1"/>
      <circle cx="${x}" cy="${TY}" r="1.6" fill="#5b6b80">${on}</circle>
      <text x="${x}" y="${ly}" class="ev" text-anchor="middle" fill="#5b6b80">${on}${label}</text>`;
  }).join('\n');
  const prog = timeline(D, [[0, X0], [1, X0], ...[1.5, 3, 4, 5.5, 7, 8, 9, 10, 11.5, 12].map((t) => [t, tx(Math.min(t, T_SECO + 0.5))]), [15.5, X1], [D, X0]]);
  return `
<rect y="560" width="${W}" height="160" fill="url(#hudFade)"/>
<g class="hud">
  ${stage}
  ${clock}
  <text x="57" y="706" class="tiny">TIMELAPSE · FALCON-CLASS ASCENT PROFILE</text>
  <line x1="${X0}" y1="${TY}" x2="${X1}" y2="${TY}" stroke="#fff" stroke-opacity=".18" stroke-width="1"/>
  <line x1="${X0}" y1="${TY}" x2="${X0}" y2="${TY}" stroke="#dff1ff" stroke-width="1.4">
    <animate attributeName="x2" dur="${D}s" repeatCount="indefinite" ${attrs(prog)}/></line>
  ${ev}
  <circle cx="${X0}" cy="${TY}" r="4.5" fill="#dff1ff" opacity=".9"><animate attributeName="cx" dur="${D}s" repeatCount="indefinite" ${attrs(prog)}/></circle>
  <g>
    ${gaugeArc(G1, speedAt, 30000)}
    ${gaugeArc(G2, altAt, 250)}
    ${speed}
    ${alt}
    <text x="${G1}" y="${GY + 40}" class="glabel" text-anchor="middle">SPEED · KM/H</text>
    <text x="${G2}" y="${GY + 40}" class="glabel" text-anchor="middle">ALTITUDE · KM</text>
  </g>
</g>`;
}

function frameUI() {
  const c = 22, m = 26;
  const br = (x, y, sx, sy) => `<path d="M${x},${y + sy * c} L${x},${y} L${x + sx * c},${y}" />`;
  return `
<g fill="none" stroke="#e6f0ff" stroke-opacity=".38" stroke-width="1.2">
  ${br(m, m, 1, 1)}${br(W - m, m, -1, 1)}${br(m, H - m, 1, -1)}${br(W - m, H - m, -1, -1)}
</g>
<g class="hud">
  <circle cx="58" cy="52" r="3.4" fill="#ff453a"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle>
  <text x="70" y="56" class="top"><tspan fill="#fff">LIVE</tspan>  ·  MISSION QB-01  ·  桥obs</text>
  <text x="${W - 56}" y="56" class="top" text-anchor="end">LC-39Q  ·  28.6°N  80.6°W  ·  <tspan fill="#fff">GO FOR LAUNCH</tspan></text>
</g>`;
}

function title() {
  const rise = (delay, dy = 16) => `
    <animate attributeName="opacity" dur="${f(delay + 1.4, 2)}s" fill="freeze" values="0;0;1" keyTimes="0;${f(delay / (delay + 1.4), 3)};1" calcMode="spline" keySplines="0 0 1 1;.2 .6 .3 1"/>
    <animateTransform attributeName="transform" type="translate" dur="${f(delay + 1.4, 2)}s" fill="freeze" values="0 ${dy};0 ${dy};0 0" keyTimes="0;${f(delay / (delay + 1.4), 3)};1" calcMode="spline" keySplines="0 0 1 1;.2 .6 .3 1"/>`;
  return `
<rect width="760" height="${H}" fill="url(#leftShade)"/>
<g>
  <g>${rise(0.2)}
    <text x="84" y="316" class="kicker">◆  QB-01  /  NEXT DESTINATION — THE UNKNOWN</text>
  </g>
  <g>${rise(0.45, 22)}
    <text x="78" y="422" class="title">QIAO<tspan fill="#7fd6ff">·</tspan>OBS</text>
  </g>
  <g>${rise(0.8)}
    <text x="86" y="474" class="cn">向未知架桥，然后跨过去</text>
  </g>
  <g>${rise(1.05)}
    <rect x="86" y="505" width="44" height="1.2" fill="#7fd6ff"/>
    <text x="146" y="510" class="sub">BUILD THE BRIDGE  ·  CROSS THE UNKNOWN</text>
  </g>
</g>`;
}

export function buildHero() {
  const sky = jpegURI(skyTexture());
  const fx = padFx();
  const shake = timeline(D, [[T_LIFT - 0.1, '0 0'], ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => [T_LIFT + i * 0.14, i === 10 ? '0 0' : `${f(rand(-1.6, 1.6) * (1 - i / 10), 2)} ${f(rand(-1.2, 1.2) * (1 - i / 10), 2)}`])]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="QIAO·OBS — 银河下的夜间火箭发射动画">
<title>QIAO·OBS — 向未知架桥，然后跨过去</title>
${defs(sky)}
<style>
  .hud text{font-family:${FONT_MONO};}
  .top{font-size:13px;letter-spacing:2.6px;fill:#9fb3cc}
  .clock{font-size:30px;font-weight:300;letter-spacing:1.5px;fill:#fff}
  .stage{font-size:12.5px;letter-spacing:3px;fill:#7fd6ff}
  .tiny{font-size:10.5px;letter-spacing:1.8px;fill:#6a7b92}
  .ev{font-size:10.5px;letter-spacing:1.6px}
  .gnum{font-size:14px;fill:#fff;letter-spacing:.3px}
  .glabel{font-size:10px;letter-spacing:1.6px;fill:#8596ad}
  .kicker{font-family:${FONT_MONO};font-size:13.5px;letter-spacing:3.6px;fill:#8fb8e6}
  .title{font-family:${FONT_DISPLAY};font-size:112px;font-weight:200;letter-spacing:16px;fill:url(#titleFill)}
  .cn{font-family:${FONT_CN};font-size:27px;font-weight:300;letter-spacing:8px;fill:#e6eef8}
  .sub{font-family:${FONT_MONO};font-size:13px;letter-spacing:3.2px;fill:#a9bdd6}
</style>
<g clip-path="url(#frame)">
  <rect width="${W}" height="${H}" fill="#01030a"/>
  <g>
    <animateTransform attributeName="transform" type="translate" dur="${D}s" repeatCount="indefinite" ${attrs(shake)}/>
    <use href="#skyImg"/>
    ${stars()}
    ${skyEvents()}
    ${fx.back}
    ${jellyfish()}
    ${trail()}
    ${ground()}
    ${padStructures()}
    ${rocket()}
    ${fx.front}
  </g>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  ${title()}
  ${hud()}
  ${frameUI()}
</g>
</svg>`;
}
