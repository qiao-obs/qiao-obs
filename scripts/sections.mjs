// 分隔标题、旗舰载荷卡、飞行系统面板、页脚星系
import { rng, f, lerp, dataURI, jpegURI, FONT_DISPLAY, FONT_MONO, FONT_CN } from './lib.mjs';
import { galaxyTexture, planetTexture } from './textures.mjs';

const THEMES = {
  dark: { text: '#e6edf3', muted: '#7d8590', accent: '#7fd6ff', line: '#e6edf3', lineOp: 0.16 },
  light: { text: '#1f2328', muted: '#656d76', accent: '#0969da', line: '#1f2328', lineOp: 0.16 },
};

function starfield(seed, w, h, n, { maxY = h, twinkle = 0.15, avoid = null } = {}) {
  const R = rng(seed);
  const cols = ['#ffffff', '#e4efff', '#cfe0ff', '#fff2dc', '#ffdcb8'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * maxY;
    if (avoid && avoid(x, y)) continue;
    const m = Math.pow(R(), 3.4);
    const r = f(0.3 + m * 1.3), op = f(0.25 + 0.75 * Math.pow(R(), 0.7));
    let a = '';
    if (R() < twinkle) {
      const d = f(2 + R() * 5, 1);
      a = `<animate attributeName="opacity" values="${op};${f(op * 0.2)};${op}" dur="${d}s" begin="-${f(R() * d, 1)}s" repeatCount="indefinite"/>`;
    }
    out.push(`<circle cx="${f(x, 1)}" cy="${f(y, 1)}" r="${r}" fill="${cols[Math.floor(R() * cols.length)]}" opacity="${op}">${a}</circle>`);
  }
  return out.join('');
}

const glintDefs = `
  <radialGradient id="sg"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".3" stop-color="#cfe6ff" stop-opacity=".3"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="gh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfe6ff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient>
  <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient>`;
const glint = (x, y, s = 1, d = 5) => `<g transform="translate(${x} ${y}) scale(${s})"><animate attributeName="opacity" values="1;.5;1" dur="${d}s" repeatCount="indefinite"/><circle r="8" fill="url(#sg)"/><rect x="-14" y="-.3" width="28" height=".6" fill="url(#gh)"/><rect x="-.3" y="-14" width=".6" height="28" fill="url(#gv)"/><circle r="1.3" fill="#fff"/></g>`;

// ———————————————————— 分隔标题 800×96
export function divider(n, en, cn, tag, themeName) {
  const t = THEMES[themeName];
  const W = 800, H = 96, Y = 50;
  const x0 = 430, x1 = 780;
  const ticks = [];
  for (let x = x0; x <= x1; x += 10) {
    const major = (x - x0) % 50 === 0;
    ticks.push(`<line x1="${x}" y1="${Y + (major ? -6 : -3)}" x2="${x}" y2="${Y}" stroke="${t.line}" stroke-opacity="${major ? 0.45 : 0.22}"/>`);
  }
  const dur = 7 + n * 1.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${n} ${en} ${cn}">
<title>${String(n).padStart(2, '0')} · ${en} · ${cn}</title>
<defs>
  <linearGradient id="tr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.accent}" stop-opacity="0"/><stop offset="1" stop-color="${t.accent}" stop-opacity=".9"/></linearGradient>
</defs>
<style>
  .num{font-family:${FONT_DISPLAY};font-size:44px;font-weight:200;fill:${t.accent}}
  .en{font-family:${FONT_DISPLAY};font-size:21px;font-weight:500;letter-spacing:7px;fill:${t.text}}
  .cn{font-family:${FONT_CN};font-size:15px;letter-spacing:5px;fill:${t.muted}}
  .tag{font-family:${FONT_MONO};font-size:11.5px;letter-spacing:2.4px;fill:${t.muted}}
</style>
<text x="3" y="${Y + 15}" class="num">${String(n).padStart(2, '0')}</text>
<line x1="70" y1="${Y - 22}" x2="68" y2="${Y + 22}" stroke="${t.line}" stroke-opacity=".3"/>
<text x="88" y="${Y - 2}" class="en">${en}</text>
<text x="89" y="${Y + 22}" class="cn">${cn}</text>
<g>${ticks.join('')}</g>
<line x1="${x0}" y1="${Y}" x2="${x1}" y2="${Y}" stroke="${t.line}" stroke-opacity="${t.lineOp + 0.12}"/>
<text x="${x1}" y="${Y + 22}" class="tag" text-anchor="end">${tag}</text>
<g>
  <animateTransform attributeName="transform" type="translate" values="${x0} ${Y};${x1} ${Y}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1"/>
  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur="${dur}s" repeatCount="indefinite"/>
  <rect x="-60" y="-.75" width="60" height="1.5" fill="url(#tr)"/>
  <circle r="3" fill="${t.accent}"/>
  <circle r="7" fill="none" stroke="${t.accent}" stroke-opacity=".45"/>
</g>
<circle cx="${x1 + 12}" cy="${Y}" r="5" fill="none" stroke="${t.line}" stroke-opacity=".5"/>
<circle cx="${x1 + 12}" cy="${Y}" r="1.6" fill="${t.text}"/>
</svg>`;
}

// ———————————————————— 旗舰载荷：qiaobs-skills 1280×600
export function payloadCard() {
  const W = 1280, H = 600;
  const planet = jpegURI(planetTexture());
  const C = { x: 930, y: 205 };
  const orbits = [
    { key: 'TRACE', cn: '首个偏差链路追踪', rx: 118, ry: 34, dur: 14, phase: 0.1 },
    { key: 'EXECUTE', cn: '有界自主工作包', rx: 196, ry: 58, dur: 22, phase: 0.55 },
    { key: 'UPDATE', cn: '让现实修正判断', rx: 280, ry: 84, dur: 32, phase: 0.3 },
  ];
  const ell = (o) => `M${C.x + o.rx},${C.y} A${o.rx},${o.ry} 0 1 1 ${C.x - o.rx},${C.y} A${o.rx},${o.ry} 0 1 1 ${C.x + o.rx},${C.y}`;
  const sats = orbits.map((o, i) => `
  <path d="${ell(o)}" fill="none" stroke="#bfe4ff" stroke-opacity="${0.16 + i * 0.03}" stroke-width="1" ${i === 1 ? 'stroke-dasharray="2 5"' : ''}/>
  <g>
    <animateMotion path="${ell(o)}" dur="${o.dur}s" begin="-${f(o.dur * o.phase, 1)}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values=".85;1;.85;.45;.85" keyTimes="0;.25;.5;.75;1" dur="${o.dur}s" begin="-${f(o.dur * o.phase, 1)}s" repeatCount="indefinite"/>
    <circle r="14" fill="url(#satGlow)"/>
    <circle r="3.4" fill="#fff"/>
    <line x1="4" y1="-4" x2="22" y2="-22" stroke="#bfe4ff" stroke-opacity=".5"/>
    <text x="26" y="-24" class="sat">${o.key}</text>
    <text x="26" y="-8" class="satcn">${o.cn}</text>
  </g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="旗舰项目 qiaobs-skills：TRACE、EXECUTE、UPDATE 三颗卫星环绕“现实”运行">
<title>qiaobs-skills — Flagship Payload</title>
<defs>
  <clipPath id="fr"><rect width="${W}" height="${H}" rx="20"/></clipPath>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02040b"/><stop offset="1" stop-color="#050b18"/></linearGradient>
  <radialGradient id="core"><stop offset="0" stop-color="#fff"/><stop offset=".12" stop-color="#fff6e0" stop-opacity=".95"/><stop offset=".35" stop-color="#ffcf8a" stop-opacity=".35"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>
  <radialGradient id="satGlow"><stop offset="0" stop-color="#bfe8ff" stop-opacity=".8"/><stop offset="1" stop-color="#7fd6ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="sun"><stop offset="0" stop-color="#fff"/><stop offset=".08" stop-color="#fffaf0" stop-opacity=".9"/><stop offset=".3" stop-color="#ffd9a0" stop-opacity=".14"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>
  <radialGradient id="sunCore"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#fff3da" stop-opacity=".7"/><stop offset="1" stop-color="#ffc27a" stop-opacity="0"/></radialGradient>
  <radialGradient id="flare"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff4e0" stop-opacity=".6"/><stop offset=".6" stop-color="#9fdcff" stop-opacity=".15"/><stop offset="1" stop-color="#9fdcff" stop-opacity="0"/></radialGradient>
  <linearGradient id="textShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#02040b" stop-opacity=".55"/><stop offset="1" stop-color="#02040b" stop-opacity="0"/></linearGradient>
  ${glintDefs}
</defs>
<style>
  .k{font-family:${FONT_MONO};font-size:14px;letter-spacing:3.6px;fill:#7fd6ff}
  .t{font-family:${FONT_DISPLAY};font-size:66px;font-weight:300;letter-spacing:1px;fill:#fff}
  .d{font-family:${FONT_CN};font-size:23px;font-weight:400;letter-spacing:1.5px;fill:#e6edf3}
  .d2{font-family:${FONT_CN};font-size:16px;letter-spacing:1.2px;fill:#93a4ba}
  .pill{font-family:${FONT_MONO};font-size:12.5px;letter-spacing:2px;fill:#c9d6e6}
  .cta{font-family:${FONT_MONO};font-size:14.5px;letter-spacing:3.2px;fill:#fff}
  .sat{font-family:${FONT_MONO};font-size:15px;letter-spacing:3px;fill:#fff;paint-order:stroke;stroke:#02040b;stroke-width:4px;stroke-linejoin:round}
  .satcn{font-family:${FONT_CN};font-size:13.5px;letter-spacing:1.5px;fill:#a9bdd6;paint-order:stroke;stroke:#02040b;stroke-width:4px;stroke-linejoin:round}
  .corel{font-family:${FONT_MONO};font-size:12px;letter-spacing:3px;fill:#ffdcae}
  .foot{font-family:${FONT_MONO};font-size:12px;letter-spacing:2.4px;fill:#6a7b92}
</style>
<g clip-path="url(#fr)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${starfield(77, W, H, 260, { maxY: 470 })}
  ${glint(1180, 70, 0.9, 6)}${glint(560, 46, 0.7, 4)}
  <circle cx="640" cy="1392" r="1061.5" fill="#000"/>
  <image href="${planet}" x="0" y="240" width="${W}" height="360" preserveAspectRatio="none" style="mix-blend-mode:screen"/>
  <!-- 轨道日出 -->
  <g transform="translate(1082 424)">
    <animate attributeName="opacity" values="1;.78;1" dur="7s" repeatCount="indefinite"/>
    <mask id="sky" maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400"><rect x="-200" y="-200" width="400" height="400" fill="#fff"/><circle cx="-442" cy="968" r="1062.5" fill="#000"/></mask>
    <circle r="150" fill="url(#sun)"/>
    <g mask="url(#sky)"><circle cy="-2" r="26" fill="url(#sunCore)"/><circle cy="-2" r="8" fill="#fff"/></g>
    <ellipse rx="260" ry="5" fill="url(#flare)" opacity=".5"/>
    <ellipse rx="120" ry="1" fill="url(#flare)" opacity=".9"/>
    <circle cx="-150" cy="-34" r="16" fill="#9fdcff" opacity=".06"/><circle cx="-240" cy="-55" r="9" fill="#ffd9a0" opacity=".07"/>
  </g>
  <rect width="700" height="${H}" fill="url(#textShade)"/>
  <!-- 轨道系统 -->
  <circle cx="${C.x}" cy="${C.y}" r="60" fill="url(#core)"/>
  <circle cx="${C.x}" cy="${C.y}" r="4" fill="#fff"/>
  <circle cx="${C.x}" cy="${C.y}" r="10" fill="none" stroke="#ffdcae" stroke-opacity=".5">
    <animate attributeName="r" values="10;46" dur="4s" repeatCount="indefinite"/>
    <animate attributeName="stroke-opacity" values=".55;0" dur="4s" repeatCount="indefinite"/>
  </circle>
  <text x="${C.x}" y="${C.y + 30}" class="corel" text-anchor="middle">REALITY</text>
  ${sats}
  <!-- 文案 -->
  <text x="72" y="118" class="k">FLAGSHIP PAYLOAD  ·  01</text>
  <text x="66" y="196" class="t">qiaobs-skills</text>
  <text x="72" y="250" class="d">从真实项目中长出来的三套 Agent Skills</text>
  <text x="72" y="286" class="d2">找到第一处偏差 · 连续完成已授权工作 · 让现实修正判断</text>
  <g transform="translate(72 322)">
    ${[['PYTHON', 96], ['MIT LICENSE', 140], ['AGENT SKILLS', 150]].reduce((acc, [label, w]) => {
      acc.s += `<rect x="${acc.x}" y="0" width="${w}" height="30" rx="15" fill="#03060e" fill-opacity=".78"/><rect x="${acc.x}" y="0" width="${w}" height="30" rx="15" fill="#fff" fill-opacity=".04" stroke="#c9d6e6" stroke-opacity=".28"/><text x="${acc.x + w / 2}" y="19.5" class="pill" text-anchor="middle">${label}</text>`;
      acc.x += w + 10;
      return acc;
    }, { s: '', x: 0 }).s}
  </g>
  <g transform="translate(72 392)">
    <rect width="304" height="50" rx="25" fill="#03060e" fill-opacity=".82"/>
    <rect width="304" height="50" rx="25" fill="#7fd6ff" fill-opacity=".1" stroke="#7fd6ff" stroke-opacity=".7"/>
    <text x="30" y="30" class="cta">OPEN MISSION FILE</text>
    <g transform="translate(266 25)">
      <animateTransform attributeName="transform" type="translate" values="266 25;273 25;266 25" dur="2.4s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".4 0 .6 1;.4 0 .6 1"/>
      <path d="M-6,0 H6 M1,-5 L6,0 L1,5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
  <text x="72" y="560" class="foot">ORBIT  QB-01  ·  THREE INDEPENDENT MODULES  ·  COMPOSE ON DEMAND</text>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
</g>
</svg>`;
}

// ———————————————————— 飞行系统（技术栈）1280×470
export function systemsPanel() {
  const W = 1280, H = 470;
  const mods = [
    ['PROPULSION', '语言', ['TypeScript', 'Python'], '主推进 · 类型安全与快速验证'],
    ['GUIDANCE', '服务端', ['NestJS', 'Prisma', 'BullMQ'], '制导 · 模块化单体与队列'],
    ['PAYLOAD BAY', '数据', ['PostgreSQL', 'Redis'], '载荷舱 · 关系数据与高速缓存'],
    ['GROUND SYSTEMS', '工程', ['Docker', 'OpenAPI', 'Vitest'], '地面系统 · 可复现与可验证'],
    ['CREW INTERFACE', '客户端', ['微信小程序'], '乘员界面 · 原生小程序'],
    ['MISSION OPS', '智能体', ['Agent Skills', 'Claude Code', 'Obsidian'], '任务运控 · 证据驱动的工作流'],
  ];
  const X0 = 40, Y0 = 40, CW = 400, CH = 195;
  const cells = mods.map(([sys, cn, techs, desc], i) => {
    const cx = X0 + (i % 3) * CW, cy = Y0 + Math.floor(i / 3) * CH;
    const big = techs.join('  ·  ');
    const fs = big.length > 30 ? 22 : 28;
    const blink = f(1.6 + (i % 3) * 0.45 + Math.floor(i / 3) * 0.3, 2);
    return `<g transform="translate(${cx} ${cy})">
      <text x="28" y="44" class="sys">${String(i + 1).padStart(2, '0')}  ${sys}</text>
      <text x="${400 - 28}" y="44" class="syscn" text-anchor="end">${cn}</text>
      <text x="28" y="${fs > 24 ? 104 : 102}" class="tech" style="font-size:${fs}px">${big}</text>
      <text x="28" y="140" class="desc">${desc}</text>
      <circle cx="33" cy="172" r="3.2" fill="#3ddc97"><animate attributeName="opacity" values="1;.3;1" dur="${blink}s" repeatCount="indefinite"/></circle>
      <text x="45" y="176.5" class="ok">NOMINAL</text>
      <g transform="translate(${400 - 28} 171)">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect x="${-k * 8 - 5}" y="-4" width="5" height="9" rx=".5" fill="#7fd6ff" opacity="${k < 8 - (i % 4) ? 0.55 : 0.12}"/>`).join('')}</g>
    </g>`;
  }).join('');
  const grid = [];
  for (let c = 1; c < 3; c++) grid.push(`<line x1="${X0 + c * CW}" y1="${Y0 + 16}" x2="${X0 + c * CW}" y2="${Y0 + 2 * CH - 16}"/>`);
  grid.push(`<line x1="${X0 + 16}" y1="${Y0 + CH}" x2="${X0 + 3 * CW - 16}" y2="${Y0 + CH}"/>`);
  const cross = [];
  for (let c = 0; c <= 3; c++) for (let r = 0; r <= 2; r++) {
    const x = X0 + c * CW, y = Y0 + r * CH;
    cross.push(`<path d="M${x - 6},${y} H${x + 6} M${x},${y - 6} V${y + 6}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="技术栈：TypeScript、Python、NestJS、Prisma、BullMQ、PostgreSQL、Redis、Docker、OpenAPI、Vitest、微信小程序、Agent Skills、Claude Code、Obsidian">
<title>Flight Systems — 技术栈</title>
<defs>
  <clipPath id="fr"><rect width="${W}" height="${H}" rx="20"/></clipPath>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#040812"/><stop offset="1" stop-color="#02040b"/></linearGradient>
  <linearGradient id="scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd6ff" stop-opacity="0"/><stop offset=".92" stop-color="#7fd6ff" stop-opacity=".05"/><stop offset="1" stop-color="#7fd6ff" stop-opacity="0"/></linearGradient>
  <radialGradient id="haze" cx=".85" cy="0" r=".9"><stop offset="0" stop-color="#1b3a66" stop-opacity=".45"/><stop offset="1" stop-color="#1b3a66" stop-opacity="0"/></radialGradient>
</defs>
<style>
  .sys{font-family:${FONT_MONO};font-size:13.5px;letter-spacing:2.8px;fill:#7fd6ff}
  .syscn{font-family:${FONT_CN};font-size:13.5px;letter-spacing:3px;fill:#6a7b92}
  .tech{font-family:${FONT_DISPLAY};font-weight:300;letter-spacing:.5px;fill:#fff}
  .desc{font-family:${FONT_CN};font-size:16px;letter-spacing:1px;fill:#93a4ba}
  .ok{font-family:${FONT_MONO};font-size:12px;letter-spacing:2.4px;fill:#3ddc97}
</style>
<g clip-path="url(#fr)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#haze)"/>
  ${starfield(303, W, H, 90, { twinkle: 0.25 })}
  <g stroke="#bfe4ff" stroke-opacity=".12">${grid.join('')}</g>
  <g stroke="#bfe4ff" stroke-opacity=".35" stroke-width="1">${cross.join('')}</g>
  ${cells}
  <g>
    <animateTransform attributeName="transform" type="translate" values="0 -90;0 ${H + 10}" dur="7s" repeatCount="indefinite"/>
    <rect y="0" width="${W}" height="80" fill="url(#scan)"/>
    <rect y="73" width="${W}" height="1" fill="#7fd6ff" opacity=".18"/>
  </g>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
</g>
</svg>`;
}

// ———————————————————— 页脚：缓慢旋转的旋涡星系 1280×540
export function footer() {
  const W = 1280, H = 540;
  const gal = jpegURI(galaxyTexture(800));
  const R = rng(808);
  const far = [];
  for (let i = 0; i < 9; i++) {
    const x = R() * W, y = R() * 330;
    if (Math.abs(x - 640) < 330 && y > 60) continue;
    far.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(3 + R() * 5)}" ry="${f(1 + R() * 2)}" transform="rotate(${f(R() * 180)} ${f(x)} ${f(y)})" fill="url(#farGal)" opacity="${f(0.4 + R() * 0.4)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="缓慢旋转的旋涡星系 — SEE YOU IN ORBIT · 轨道上见">
<title>SEE YOU IN ORBIT · 轨道上见</title>
<defs>
  <clipPath id="fr"><rect width="${W}" height="${H}" rx="20"/></clipPath>
  <radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#0a1226"/><stop offset=".6" stop-color="#03060f"/><stop offset="1" stop-color="#010207"/></radialGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="#ffe2b8" stop-opacity=".35"/><stop offset=".4" stop-color="#8fb4ff" stop-opacity=".08"/><stop offset="1" stop-color="#8fb4ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="farGal"><stop offset="0" stop-color="#fff2dc"/><stop offset="1" stop-color="#9fc2ff" stop-opacity="0"/></radialGradient>
  ${glintDefs}
</defs>
<style>
  .end{font-family:${FONT_DISPLAY};font-size:34px;font-weight:200;letter-spacing:14px;fill:#fff}
  .cn{font-family:${FONT_CN};font-size:18px;letter-spacing:9px;fill:#a9bdd6}
  .m{font-family:${FONT_MONO};font-size:12.5px;letter-spacing:3px;fill:#6a7b92}
</style>
<g clip-path="url(#fr)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${starfield(515, W, H, 300, { twinkle: 0.2 })}
  ${far.join('')}
  ${glint(212, 96, 0.9, 5)}${glint(1096, 150, 0.75, 7)}${glint(980, 402, 0.6, 4)}
  <ellipse cx="640" cy="214" rx="380" ry="180" fill="url(#halo)"/>
  <g transform="translate(640 214) rotate(-24) scale(1 .4)">
    <g>
      <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="180s" repeatCount="indefinite"/>
      <image href="${gal}" x="-340" y="-340" width="680" height="680" style="mix-blend-mode:screen"/>
    </g>
  </g>
  <!-- 远方的探测器 -->
  <g>
    <animateMotion path="M-20,470 L1300,410" dur="70s" repeatCount="indefinite"/>
    <circle r="1.4" fill="#fff"/><rect x="-5" y="-.3" width="10" height=".6" fill="#fff" opacity=".6"/>
  </g>
  <text x="640" y="424" class="end" text-anchor="middle">SEE YOU IN ORBIT</text>
  <text x="646" y="462" class="cn" text-anchor="middle">轨道上见</text>
  <text x="640" y="506" class="m" text-anchor="middle">END OF TRANSMISSION  ·  QB-01  ·  SIGNAL ORIGIN: EARTH</text>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
</g>
</svg>`;
}
