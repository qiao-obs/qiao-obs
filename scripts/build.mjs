// 生成 assets/ 下全部 SVG：node scripts/build.mjs [name...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHero } from './hero.mjs';
import { divider, payloadCard, systemsPanel, footer } from './sections.mjs';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const jobs = {
  hero: () => ({ 'hero.svg': buildHero() }),
  dividers: () => {
    const list = [
      [1, 'MISSION BRIEF', '任务简报', 'SECTOR 01 / 03'],
      [2, 'FLAGSHIP PAYLOAD', '旗舰载荷', 'SECTOR 02 / 03'],
      [3, 'FLIGHT SYSTEMS', '飞行系统', 'SECTOR 03 / 03'],
    ];
    const files = {};
    for (const [n, en, cn, tag] of list)
      for (const theme of ['dark', 'light']) files[`divider-0${n}-${theme}.svg`] = divider(n, en, cn, tag, theme);
    return files;
  },
  payload: () => ({ 'payload.svg': payloadCard() }),
  systems: () => ({ 'systems.svg': systemsPanel() }),
  footer: () => ({ 'footer.svg': footer() }),
};
const want = process.argv.slice(2);
for (const [name, job] of Object.entries(jobs)) {
  if (want.length && !want.includes(name)) continue;
  for (const [file, svg] of Object.entries(job())) {
    fs.writeFileSync(path.join(out, file), svg);
    console.log(file.padEnd(28), (Buffer.byteLength(svg) / 1024).toFixed(0) + ' KB');
  }
}
