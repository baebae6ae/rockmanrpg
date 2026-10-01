// HD 캐릭터 SVG 를 크로미움으로 렌더해 투명 PNG 로 저장한다.
//   node tools/rig/hd/render.mjs nail <출력 폴더> [배율=4] [자세이름,...]
// 자세 이름을 안 주면 HD.anims 전체(없으면 HD.poses)를 그린다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [id, outDir, scaleArg, only] = process.argv.slice(2);
const scale = Number(scaleArg ?? 4);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.setContent('<!doctype html><body style="margin:0;background:transparent"><div id="s"></div></body>');
await page.addScriptTag({ content: fs.readFileSync(path.join(here, `${id}.js`), 'utf8') });

const jobs = await page.evaluate(({ scale, only }) => {
  const H = window.HD;
  const view = { ...H.view, s: scale };
  const list = [];
  if (H.anims && !only) {
    for (const [name, a] of Object.entries(H.anims)) {
      a.frames.forEach((p, i) => list.push({ name: `${name}_${i}`, anim: name, ms: a.ms, loop: a.loop, ...H.svg(p, view) }));
    }
  } else {
    const names = only ? only.split(',') : Object.keys(H.poses);
    for (const n of names) list.push({ name: n, ...H.svg(H.poses[n], view) });
  }
  return list;
}, { scale, only });

const manifest = { scale, view: await page.evaluate(() => window.HD.view), frames: [] };
for (const j of jobs) {
  await page.evaluate((s) => { document.getElementById('s').innerHTML = s; }, j.svg);
  const el = await page.$('#s svg');
  await el.screenshot({ path: path.join(outDir, `${j.name}.png`), omitBackground: true });
  manifest.frames.push({ name: j.name, anim: j.anim, ms: j.ms, loop: j.loop, muzzle: j.muzzle });
}
fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify(manifest, null, 2));
await browser.close();
console.log(id, jobs.length, 'frames →', outDir);
