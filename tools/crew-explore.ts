/**
 * 비례·얼굴 탐색용 렌더러. 시안을 고르기 위한 임시 도구이고,
 * 결정되면 그 수치를 lib/crew.ts 에 옮긴 뒤 지운다.
 *
 * 실행: npx tsx tools/crew-explore.ts <출력디렉터리>
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { CELL, F, M, paint, type RGB } from './lib/crewart.js';
import { CREW } from './lib/crew.js';

// ---------------------------------------------------------------- 비례
interface Look {
  id: string; name: string;
  hip: number;        // 골반 높이 = 다리 길이
  torso: number;      // 골반 → 어깨
  neck: number;       // 어깨 → 턱
  skullW: number;     // 두개골 반너비
  skullH: number;     // 두개골 반높이
  jawW: number;       // 턱선 폭
  eyeW: number; eyeH: number; eyeGap: number;
  softEye: boolean;   // 속눈썹을 얇고 무르게
  boldBrow: boolean;
  shoulder: number; chestW: number; waistW: number; hipW: number;
  limb: number;       // 팔다리 반지름
}

const LOOKS: Look[] = [
  {
    id: 'A', name: '지금',
    hip: 16, torso: 8, neck: 5,
    skullW: 7, skullH: 9, jawW: 13,
    eyeW: 4, eyeH: 4, eyeGap: 3, softEye: false, boldBrow: true,
    shoulder: 8, chestW: 13, waistW: 10, hipW: 12, limb: 2,
  },
  {
    id: 'B', name: '얼굴만 순하게',
    hip: 16, torso: 8, neck: 5,
    skullW: 6, skullH: 8, jawW: 11,
    eyeW: 2, eyeH: 3, eyeGap: 3, softEye: true, boldBrow: false,
    shoulder: 7, chestW: 12, waistW: 9, hipW: 11, limb: 2,
  },
  {
    id: 'C', name: '슬림 3등신',
    hip: 21, torso: 9, neck: 5,
    skullW: 6, skullH: 7, jawW: 10,
    eyeW: 2, eyeH: 3, eyeGap: 3, softEye: true, boldBrow: false,
    shoulder: 6, chestW: 11, waistW: 8, hipW: 10, limb: 2,
  },
  {
    id: 'D', name: '4등신',
    hip: 27, torso: 10, neck: 4,
    skullW: 5, skullH: 6, jawW: 9,
    eyeW: 2, eyeH: 2, eyeGap: 3, softEye: true, boldBrow: false,
    shoulder: 6, chestW: 10, waistW: 7, hipW: 9, limb: 2,
  },
];

// ---------------------------------------------------------------- 얼굴
/**
 * 이 크기(얼굴 너비 10~13px)에서 흰자·홍채·속눈썹·눈꼬리를 다 갖춘
 * 눈을 그리면 무조건 부릅뜬 눈이 된다. 흰자가 1~2px 슬리버로 남아
 * 흰 테두리처럼 번쩍이기 때문이다.
 *
 * 그래서 눈은 어두운 덩이 하나 + 빛 한 점으로 줄인다. 도트로 사람을
 * 순하게 그리는 거의 모든 게임이 이 방식이다.
 */
function drawFace(f: F, c: number, L: Look): void {
  // 턱 → 광대 → 둥근 두개골
  f.taper(0, c, c + 4, Math.max(3, Math.round(L.jawW * 0.4)), L.jawW, M.skin);
  f.blob(0, c + 1 + L.skullH, L.skullW, L.skullH, M.skin);
  const jh = L.jawW >> 1;
  f.set(-jh + 1, c + 1, M.skinS);
  f.set(jh - 1, c + 1, M.skinS);
  f.rect(L.skullW - 1, c + 4, 2, L.skullH - 2, M.skinS);   // 그늘 쪽 볼
  f.rect(-L.skullW, c + 5, 1, L.skullH - 3, M.skinH);      // 빛 쪽 볼

  const ey = c + 4;
  const rx0 = Math.ceil(L.eyeGap / 2);
  const lx0 = -rx0 - L.eyeW + 1;
  for (const x0 of [lx0, rx0]) {
    if (L.softEye) {
      f.rect(x0, ey, L.eyeW, L.eyeH, M.iris);
      f.rect(x0, ey + L.eyeH - 1, L.eyeW, 1, M.eye);       // 윗선만 진하게
      f.set(x0, ey + L.eyeH - 2, M.white);                 // 빛 한 점
      f.set(x0 + L.eyeW - 1, ey, M.eye);                   // 아래 바깥 그늘
    } else {
      f.rect(x0, ey, L.eyeW, L.eyeH, M.white);
      f.set(x0, ey, M.skin); f.set(x0 + L.eyeW - 1, ey, M.skin);
      f.set(x0, ey + L.eyeH - 1, M.skin); f.set(x0 + L.eyeW - 1, ey + L.eyeH - 1, M.skin);
      f.rect(x0 + 1, ey + L.eyeH - 1, L.eyeW - 2, 1, M.eye);
      f.set(x0 < 0 ? x0 : x0 + L.eyeW - 1, ey + L.eyeH - 2, M.eye);
      f.rect(x0 + 1, ey, Math.max(1, L.eyeW - 2), L.eyeH - 1, M.iris);
      f.set(x0 + 1, ey + L.eyeH - 2, M.white);
    }
  }

  // 눈썹 — 얇게, 수평으로, 눈에서 두 줄 띄운다. 기울이면 그것만으로
  // 화난 얼굴이 되고, 붙이면 노려보는 얼굴이 된다
  const bw = L.eyeW + 1;
  const by = ey + L.eyeH + 2;
  if (L.boldBrow) {
    f.rect(lx0, by - 2, bw, 2, M.brow);
    f.rect(rx0, by - 2, bw, 2, M.brow);
  } else {
    f.rect(lx0, by, bw, 1, M.brow);
    f.rect(rx0 - 1, by, bw, 1, M.brow);
  }

  f.set(lx0 - 1, c + 3, M.blush);
  f.set(rx0 + L.eyeW, c + 3, M.blush);
  f.set(0, c + 2, M.mouth);                 // 입 — 점 하나면 족하다
  f.set(-1, c + 2, M.mouth);

  // 머리카락 — 헤어라인 위만 덮는다. 한 칸이라도 내려오면 눈썹을 먹어
  // 표정이 사라진다
  // 이마는 두 줄이면 족하다. 앞머리를 눈썹 가까이 내려야 얼굴이
  // 아래로 모여 사람으로 읽힌다. 정수리만 덮으면 이마가 넓어지고,
  // 그 넓은 이마가 곧 프랑켄슈타인이다.
  const hl = by + 2;
  const top = c + 1 + L.skullH * 2;
  const hc = Math.round((hl + top) / 2);
  const hr = Math.max(2, Math.ceil((top - hl) / 2) + 1);
  f.blob(0, hc, L.skullW + 1, hr, M.hair);
  f.blob(0, hc + 1, L.skullW - 1, hr - 1, M.hairS);
  // 옆머리 — 헤어라인에서 볼을 따라 내려온다. 머리 위로 삐쳐 나가면
  // 뿔로 보인다
  f.rect(-L.skullW - 1, c + 7, 2, hl - c - 6, M.hair);
  f.rect(L.skullW - 1, c + 7, 2, hl - c - 6, M.hair);
  f.set(-L.skullW - 1, c + 6, M.hairS);
  f.set(L.skullW, c + 6, M.hairS);
  // 앞머리 — 이마를 덮고 눈썹 바로 위에서 끝난다
  for (const x of [-L.skullW + 1, -2, 1, L.skullW - 2]) {
    f.rect(x, by + 1, 1, hl - by, M.hair);
    f.set(x, by + 1, M.hairS);
  }
}

// ---------------------------------------------------------------- 몸
function limb(f: F, x0: number, y0: number, x1: number, y1: number, r: number): void {
  const ex = Math.round((x0 + x1) / 2), ey = Math.round((y0 + y1) / 2);
  const dir = x0 < 0 ? -1 : 1;
  f.capsule(x0, y0, ex, ey, r, M.cloth);
  f.capsule(ex, ey, x1, y1, r, M.cloth);
  f.line(x0 - dir * r, y0, ex - dir * r, ey, 1, M.clothS);
  f.blob(x1, y1, r, r, M.skin);
  f.blob(x1, y1 + r, r, 1, M.clothS);
}

function drawLook(f: F, ci: number, L: Look): void {
  const shY = L.hip + L.torso;
  const chin = shY + L.neck;

  // 다리
  f.backside(true);
  legOf(f, -3, L, -5);
  f.backside(false);

  // 몸통
  f.taper(0, L.hip - 4, L.hip + 1, L.hipW, L.waistW, M.cloth);
  f.taper(0, L.hip + 1, shY, L.waistW, L.chestW, M.cloth);
  f.blob(0, shY, L.chestW >> 1, 2, M.cloth);
  f.blob(-L.shoulder, shY, 3, 3, M.cloth);
  f.blob(L.shoulder, shY - 1, 3, 3, M.cloth);
  f.blob(-L.shoulder, shY + 1, 3, 1, M.clothH);
  f.blob(L.shoulder, shY, 3, 1, M.clothH);

  f.rect(-3, shY, 3, 1, M.clothH);                     // 벌어진 옷깃
  f.rect(1, shY, 3, 1, M.clothH);
  f.line(0, shY - 2, 0, L.hip + 3, 1, M.clothS);       // 앞섶
  f.rect(-(L.waistW >> 1), L.hip, L.waistW, 2, M.clothS);
  f.rect(-(L.waistW >> 1), L.hip + 1, L.waistW, 1, M.clothH);
  f.rect(-1, L.hip, 3, 2, M.accent);
  f.soft(-(L.chestW >> 1) + 1, shY - 6, 5, 4, 1, M.metal);
  f.rect(-(L.chestW >> 1) + 1, shY - 3, 5, 1, M.accent);
  f.rect(-(L.chestW >> 1) + 2, shY - 5, 2, 1, M.glow);

  f.rect(-2, shY, 4, L.neck + 1, M.skin);              // 목
  f.rect(-2, chin, 4, 1, M.skinS);

  legOf(f, 2, L, 4);
  f.backside(true);
  limb(f, -L.shoulder, shY, -L.shoulder - 2, shY - 10, L.limb);
  f.backside(false);
  limb(f, L.shoulder, shY, L.shoulder + 1, shY - 9, L.limb);

  f.origin(0, 0);
  drawFace(f, chin, L);
}

function legOf(f: F, hipX: number, L: Look, footX: number): void {
  const fy = 0;
  const ky = Math.round(L.hip / 2) + 1;
  const kx = Math.round((hipX + footX) / 2);
  f.taper(hipX, ky, L.hip, 5, 6, M.cloth);
  f.taper(kx, fy + 3, ky, 4, 5, M.cloth);
  f.blob(kx, ky, 2, 2, M.cloth);
  f.line(hipX - 2, L.hip - 1, kx - 2, ky + 1, 1, M.clothH);
  f.rect(kx - 1, ky - 1, 3, 1, M.clothS);
  f.blob(footX, fy + 2, 3, 3, M.clothS);
  f.blob(footX + 1, fy + 1, 3, 2, M.clothS);
  f.rect(footX - 2, fy + 3, 3, 1, M.clothH);
  f.rect(footX - 3, fy, 6, 1, M.metal);
}

// ---------------------------------------------------------------- 출력
const OUT = process.argv[2] ?? '.';
const PICK = [0, 5, 8];                                  // 못 / 반딧불 / 사슬
const BG: RGB = [0x18, 0x1c, 0x25];

for (const L of LOOKS) {
  for (const SCALE of [7, 3]) {
    const W = PICK.length * CELL * SCALE;
    const H = CELL * SCALE;
    const png = new PNG({ width: W, height: H });
    for (let i = 0; i < W * H; i++) {
      png.data[i * 4] = BG[0]; png.data[i * 4 + 1] = BG[1];
      png.data[i * 4 + 2] = BG[2]; png.data[i * 4 + 3] = 255;
    }
    PICK.forEach((ci, n) => {
      const f = new F();
      drawLook(f, ci, L);
      const rgba = paint(f, CREW[ci]);
      const ox = n * CELL * SCALE;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const i = (y * CELL + x) * 4;
        if (!rgba[i + 3]) continue;
        for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
          const j = ((y * SCALE + sy) * W + (ox + x * SCALE + sx)) * 4;
          png.data[j] = rgba[i]; png.data[j + 1] = rgba[i + 1]; png.data[j + 2] = rgba[i + 2];
        }
      }
    });
    const tall = 63 - Math.max(0, 0);
    writeFileSync(`${OUT}/look-${L.id}-${SCALE}.png`, PNG.sync.write(png));
  }
  const shY = L.hip + L.torso;
  const chin = shY + L.neck;
  const top = chin + 2 + L.skullH * 2;
  console.log(`${L.id} ${L.name}: 전체 ${top}px, 머리 ${top - chin}px → ${(top / (top - chin)).toFixed(1)}등신`);
}
