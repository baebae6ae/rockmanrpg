/**
 * 개체·잡몹 채색 프리뷰 — crew-preview.ts 의 적 버전.
 * 실행: npx tsx tools/foe-preview.ts out.png     (SC=배율 AC=동작)
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { CELL, F, paint, type RGB } from './lib/crewart.js';
import { FOES, MOBS, MOB_DRAWERS, type Anim, type FoeAct } from './lib/foe.js';

const SCALE = Number(process.env.SC ?? 5);
const COLS = 4;
const act = (process.env.AC ?? 'idle') as FoeAct;

function animOf(a: FoeAct, ph: number): Anim {
  const base: Anim = { bob: Math.sin(ph * Math.PI * 2), lean: 0, wind: 0, strike: 0, spin: ph, hurt: 0 };
  if (a === 'move') return { ...base, lean: 2, bob: Math.abs(Math.sin(ph * Math.PI * 2)) * 2 };
  if (a === 'tell') return { ...base, wind: 1 };
  if (a === 'atk1') return { ...base, wind: 0.3, strike: 1 };
  if (a === 'atk2') return { ...base, wind: 0.1, strike: 0.6, lean: 3 };
  if (a === 'hurt') return { ...base, hurt: 1, lean: -3 };
  return base;
}

const items = [
  ...FOES.map((d) => ({ pal: d, name: d.name, draw: (f: F) => d.draw(f, animOf(act, 0.25)) })),
  ...MOBS.map((d) => ({ pal: d, name: d.name, draw: (f: F) => MOB_DRAWERS[d.kind](f, 0.25) })),
];

const rows = Math.ceil(items.length / COLS);
const W = COLS * CELL * SCALE;
const H = rows * CELL * SCALE;
const png = new PNG({ width: W, height: H });
const BG: RGB = [0x18, 0x1c, 0x25];
for (let i = 0; i < W * H; i++) {
  png.data[i * 4] = BG[0]; png.data[i * 4 + 1] = BG[1]; png.data[i * 4 + 2] = BG[2]; png.data[i * 4 + 3] = 255;
}

items.forEach((it, idx) => {
  const f = new F();
  it.draw(f);
  const rgba = paint(f, it.pal);
  const ox = (idx % COLS) * CELL * SCALE;
  const oy = Math.floor(idx / COLS) * CELL * SCALE;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = (y * CELL + x) * 4;
      if (!rgba[i + 3]) continue;
      for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
        const d = ((oy + y * SCALE + sy) * W + (ox + x * SCALE + sx)) * 4;
        png.data[d] = rgba[i]; png.data[d + 1] = rgba[i + 1]; png.data[d + 2] = rgba[i + 2];
      }
    }
  }
});

const out = process.argv[2] ?? 'foes.png';
writeFileSync(out, PNG.sync.write(png));
console.log(items.map((i, n) => `${n + 1}.${i.name}`).join('  '));
console.log('→', out);
