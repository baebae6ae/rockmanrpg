/**
 * 《균열 회수반》 아홉 대원 — 채색 프리뷰.
 *
 * 파츠·명암·색은 전부 lib/ 에 있다. 여기는 그것을 격자로 늘어놓고
 * 눈으로 확인하는 용도만 맡는다. 화풍을 고칠 일이 있으면 lib 를 고쳐야
 * 프리뷰와 실제 스프라이트가 같이 바뀐다.
 *
 * 실행: npx tsx tools/crew-preview.ts out.png     (SC=배율 CO=열수 PO=포즈)
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { CELL, F, paint, type RGB } from './lib/crewart.js';
import { CREW, drawCrew, type Pose } from './lib/crew.js';

const SCALE = Number(process.env.SC ?? 6);
const COLS = Number(process.env.CO ?? 3);

/** 확인용 포즈 — 서 있는 자세가 기본이다 */
const POSES: Record<string, Pose> = {
  idle: {},
  run: { hipY: 15, lean: 1, footF: [7, 3], footB: [-7, 0], armWeapon: 'down', armFree: 'forward' },
  jump: { hipY: 19, footF: [5, 4], footB: [-6, 2], armWeapon: 'guard', armFree: 'up' },
  attack: { hipY: 16, lean: 2, armWeapon: 'aim', armFree: 'back' },
};
const pose = POSES[process.env.PO ?? 'idle'] ?? POSES.idle;

const rows = Math.ceil(CREW.length / COLS);
const W = COLS * CELL * SCALE;
const H = rows * CELL * SCALE;
const png = new PNG({ width: W, height: H });
const BG: RGB = [0x18, 0x1c, 0x25];
const SHADOW: RGB = [0x0e, 0x10, 0x17];
for (let i = 0; i < W * H; i++) {
  png.data[i * 4] = BG[0]; png.data[i * 4 + 1] = BG[1]; png.data[i * 4 + 2] = BG[2]; png.data[i * 4 + 3] = 255;
}

CREW.forEach((c, idx) => {
  const f = new F();
  drawCrew(f, c, pose);
  const rgba = paint(f, c);

  const ox = (idx % COLS) * CELL * SCALE;
  const oy = Math.floor(idx / COLS) * CELL * SCALE;
  const put = (x: number, y: number, col: RGB): void => {
    for (let sy = 0; sy < SCALE; sy++) {
      for (let sx = 0; sx < SCALE; sx++) {
        const i = ((oy + y * SCALE + sy) * W + (ox + x * SCALE + sx)) * 4;
        png.data[i] = col[0]; png.data[i + 1] = col[1]; png.data[i + 2] = col[2];
      }
    }
  };

  // 바닥 그림자 — 발밑에 이게 없으면 서 있는 게 아니라 떠 있는 것으로
  // 보인다. 캐릭터보다 먼저 깔아서 발이 그림자를 밟게 한다.
  for (let y = 61; y <= 63; y++) {
    for (let x = 20; x <= 44; x++) {
      const dx = (x - 32) / 12;
      const dy = (y - 63) / 2.2;
      if (dx * dx + dy * dy <= 1) put(x, y, SHADOW);
    }
  }

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = (y * CELL + x) * 4;
      if (rgba[i + 3]) put(x, y, [rgba[i], rgba[i + 1], rgba[i + 2]]);
    }
  }
});

const out = process.argv[2] ?? 'crew.png';
writeFileSync(out, PNG.sync.write(png));
console.log('순서:', CREW.map((c, i) => `${i + 1}.${c.name}`).join('  '));
console.log('→', out);
