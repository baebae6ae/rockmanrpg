// 뼈대 캐릭터를 헤드리스 크로미움으로 그려 8배 크기 프레임을 내보낸다.
//   node tools/rig/render.mjs nail <출력 폴더>
// 출력: <anim>_<n>_color.png, <anim>_<n>_ids.png, frames.json
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [id, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.addScriptTag({ content: fs.readFileSync(path.join(here, 'rig.js'), 'utf8') });
await page.addScriptTag({ content: fs.readFileSync(path.join(here, `${id}.js`), 'utf8') });

const result = await page.evaluate(() => {
  const out = { canvas: window.CHAR.canvas, scale: window.Rig.S, anims: {} };
  for (const [name, a] of Object.entries(window.CHAR.anims)) {
    out.anims[name] = {
      ms: a.ms, loop: a.loop,
      frames: a.frames.map((p) => window.Rig.render(window.CHAR, p)),
    };
  }
  return out;
});
await browser.close();

const manifest = { canvas: result.canvas, scale: result.scale, anims: {} };
for (const [name, a] of Object.entries(result.anims)) {
  manifest.anims[name] = { ms: a.ms, loop: a.loop, frames: [] };
  a.frames.forEach((f, i) => {
    const base = `${name}_${i}`;
    fs.writeFileSync(path.join(outDir, `${base}_color.png`), Buffer.from(f.color.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(outDir, `${base}_ids.png`), Buffer.from(f.ids.split(',')[1], 'base64'));
    manifest.anims[name].frames.push({ base, muzzle: f.muzzle });
  });
}
fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify(manifest, null, 2));
console.log(id, Object.entries(manifest.anims).map(([n, a]) => `${n}:${a.frames.length}`).join(' '));
