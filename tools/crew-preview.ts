/**
 * 《균열 회수반》 아홉 대원 — 채색 프리뷰.
 *
 * 실루엣 검증을 통과한 아홉에 파츠 시스템과 명암 램프를 얹는다.
 * 게임에 넣기 전에 화풍부터 확정하는 단계라, 아직 서 있는 자세 한 장만 뽑는다.
 * 아직 gen-placeholder.ts 와 연결되어 있지 않다 — 화풍이 확정되면
 * 여기 파츠·램프를 그쪽 생성기로 옮기고 애니메이션 프레임을 붙인다.
 *
 * 실행: npx tsx tools/crew-preview.ts out.png     (SC=배율 CO=열수)
 *
 * 명암은 손으로 칠하지 않는다 — 재질 버퍼를 만들어 두고 가장자리를 읽어서
 * 자동으로 올린다. 이 방식이라야 파츠를 새로 추가해도 톤이 안 깨진다.
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const CELL = 64;
const SCALE = Number(process.env.SC ?? 6);
const COLS = Number(process.env.CO ?? 3);

/** 재질 — 같은 재질끼리는 같은 램프를 쓴다 */
const enum M { none = 0, suit = 1, metal = 2, skin = 3, glow = 4, dark = 5 }

// ---------------------------------------------------------------- 색 유틸
type RGB = [number, number, number];
const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const WHITE: RGB = [255, 255, 255];

/**
 * 5단 램프 — 어두운 쪽은 순수 검정이 아니라 차가운 남색으로 민다.
 * 검정으로 내리면 도트가 죽고, 남색으로 내리면 금속처럼 보인다.
 */
const COOL: RGB = [24, 28, 46];
function ramp(base: string): RGB[] {
  const b = hex(base);
  return [
    mix(b, COOL, 0.55),  // 0 그림자
    mix(b, COOL, 0.28),  // 1 어두움
    b,                   // 2 기본
    mix(b, WHITE, 0.26), // 3 밝음
    mix(b, WHITE, 0.55), // 4 림라이트
  ];
}

// ---------------------------------------------------------------- 버퍼
class F {
  m = new Uint8Array(CELL * CELL);
  /** x: 중앙 기준, y: 발바닥 기준(위가 양수) */
  set(x: number, y: number, mat: M): void {
    const cx = 32 + Math.round(x);
    const cy = 63 - Math.round(y);
    if (cx < 0 || cx >= CELL || cy < 0 || cy >= CELL) return;
    this.m[cy * CELL + cx] = mat;
  }
  rect(x: number, y: number, w: number, h: number, mat: M): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, mat);
  }
  disc(cx: number, cy: number, r: number, mat: M): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.set(cx + x, cy + y, mat);
  }
  crescent(cx: number, cy: number, r: number, inner: number, side: -1 | 1, mat: M): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (side < 0 && x > 0) continue;
        if (side > 0 && x < 0) continue;
        const d2 = x * x + y * y;
        if (d2 <= r * r && d2 >= inner * inner) this.set(cx + x, cy + y, mat);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, mat: M): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const h = Math.floor(w / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let ox = -h; ox <= h; ox++) for (let oy = -h; oy <= h; oy++) this.set(x + ox, y + oy, mat);
    }
  }
}

// ---------------------------------------------------------------- 공용 몸
/**
 * 아홉이 공유하는 사람 몸. 여기가 갈리면 한 팀으로 안 보인다.
 * 개성은 전부 장비(build)가 낸다.
 */
function body(f: F): void {
  // 다리 — 무릎을 끊어줘야 막대가 아니라 다리로 보인다
  f.rect(-5, 4, 4, 11, M.suit);
  f.rect(1, 4, 4, 11, M.suit);
  f.rect(-5, 9, 4, 1, M.dark);
  f.rect(1, 9, 4, 1, M.dark);
  // 부츠 — 크게. 록맨 계열 실루엣의 핵심이 발이다
  f.rect(-7, 0, 6, 5, M.dark);
  f.rect(1, 0, 6, 5, M.dark);
  f.rect(-7, 4, 6, 1, M.metal);
  f.rect(1, 4, 6, 1, M.metal);

  // 허리 — 좁혀야 가슴이 넓어 보인다
  f.rect(-4, 14, 8, 4, M.suit);
  f.rect(-5, 12, 10, 2, M.dark);

  // 가슴
  f.rect(-6, 17, 12, 8, M.suit);
  f.rect(-4, 19, 8, 4, M.metal);
  f.rect(-2, 20, 4, 2, M.glow);

  // 팔 — 몸통보다 뒤에서 시작해 실루엣이 겹치지 않게
  f.rect(-10, 15, 4, 8, M.suit);
  f.rect(6, 15, 4, 8, M.suit);
  f.rect(-11, 13, 5, 4, M.dark);  // 장갑
  f.rect(6, 13, 5, 4, M.dark);

  // 어깨 패드 — 몸통 밖으로 튀어나온다
  f.rect(-10, 22, 6, 5, M.metal);
  f.rect(4, 22, 6, 5, M.metal);

  f.rect(-2, 25, 4, 2, M.dark);   // 목

  // 머리 — 헬멧 + 바이저. 얼굴 자리가 있어야 사람으로 읽힌다
  f.rect(-5, 27, 10, 8, M.suit);
  f.rect(-5, 33, 10, 2, M.metal); // 헬멧 능선
  f.rect(-6, 29, 1, 4, M.metal);  // 귀 덮개
  f.rect(5, 29, 1, 4, M.metal);
  f.rect(-3, 29, 7, 3, M.glow);   // 바이저
  f.rect(-3, 28, 7, 1, M.dark);   // 턱 그늘
}

type Build = (f: F) => void;

interface Crew { name: string; suit: string; metal: string; glow: string; build: Build }

/** 앞쪽 = 오른쪽(+x), 등 = 왼쪽(-x). 장비는 머리 상자(x -4..4, y 27..35)를 침범하지 않는다. */
const CREW: Crew[] = [
  {
    name: '못', suit: '#5b6472', metal: '#8f98a6', glow: '#ff8a3c',
    build: (f) => {
      f.line(9, 23, 20, 29, 7, M.metal);
      f.line(9, 25, 19, 31, 2, M.dark);
      f.rect(7, 20, 6, 7, M.dark);
    },
  },
  {
    name: '종', suit: '#6b5a34', metal: '#c9a04a', glow: '#ffe08a',
    build: (f) => {
      // 등에 매달면 무슨 모양이든 망토로 읽힌다 — 손에 들려 낮게 내린다.
      // 위가 통이고 아래만 벌어져야 종이 된다.
      const bx = 15;
      f.rect(bx - 1, 13, 2, 5, M.dark);      // 손에서 내려온 고리
      for (let i = 0; i < 9; i++) {
        const w = i < 5 ? 5 : Math.min(9, 5 + (i - 4) * 2);
        f.rect(bx - Math.floor(w / 2), 12 - i, w, 1, M.metal);
      }
      f.rect(bx - 5, 2, 11, 3, M.metal);     // 종 입
      f.rect(bx - 5, 2, 11, 1, M.dark);      // 입 안쪽 그늘
      f.rect(bx - 1, 0, 2, 2, M.dark);       // 추
    },
  },
  {
    name: '불씨', suit: '#6e3a2c', metal: '#98a0aa', glow: '#ff6a2c',
    build: (f) => {
      f.rect(-18, 15, 6, 18, M.metal);
      f.rect(-18, 33, 6, 2, M.dark);
      f.rect(-11, 17, 6, 15, M.metal);
      f.rect(-11, 32, 6, 2, M.dark);
      f.line(-15, 33, -8, 32, 2, M.dark);   // 두 통을 잇는 관
      f.rect(7, 21, 11, 4, M.metal);        // 손의 노즐
      f.rect(7, 21, 11, 1, M.dark);
      f.rect(17, 22, 2, 2, M.glow);
    },
  },
  {
    name: '거울', suit: '#7d8592', metal: '#cfd6e0', glow: '#eaf6ff',
    build: (f) => {
      f.disc(-13, 23, 9, M.metal);
      f.disc(-13, 23, 6, M.glow);
      f.disc(-13, 23, 3, M.metal);
    },
  },
  {
    name: '바늘', suit: '#25514e', metal: '#7f9a96', glow: '#5ce0d0',
    build: (f) => {
      f.rect(-6, 27, 10, 9, M.suit);       // 후드
      f.line(-5, 35, -12, 27, 4, M.suit);
      f.rect(-4, 29, 6, 3, M.glow);        // 후드 안쪽 바이저
      f.rect(5, 21, 25, 2, M.metal);       // 아주 긴 총열
      f.rect(3, 19, 6, 6, M.dark);
      f.rect(28, 21, 2, 2, M.glow);
    },
  },
  {
    name: '반딧불', suit: '#5b6a2e', metal: '#93a35c', glow: '#c8ff5c',
    build: (f) => {
      f.rect(-15, 23, 7, 8, M.metal);
      f.rect(8, 23, 7, 8, M.metal);
      f.rect(-15, 32, 7, 2, M.dark);
      f.rect(8, 32, 7, 2, M.dark);
      f.rect(-14, 25, 2, 2, M.glow);
      f.rect(-14, 28, 2, 2, M.glow);
      f.rect(12, 25, 2, 2, M.glow);
      f.rect(12, 28, 2, 2, M.glow);
    },
  },
  {
    name: '도끼', suit: '#6b4326', metal: '#a9b2bd', glow: '#ff5a4a',
    build: (f) => {
      f.line(-11, 31, -5, 13, 3, M.dark);
      f.crescent(-11, 31, 9, 4, -1, M.metal);
    },
  },
  {
    name: '작살', suit: '#2f3f6b', metal: '#8fa2c4', glow: '#7cc4ff',
    build: (f) => {
      f.rect(11, 3, 3, 42, M.metal);
      f.rect(10, 45, 5, 5, M.metal);
      f.rect(8, 42, 2, 5, M.metal);
      f.rect(15, 42, 2, 5, M.metal);
      f.rect(11, 47, 3, 3, M.glow);
    },
  },
  {
    name: '사슬', suit: '#2b2b33', metal: '#a99cc4', glow: '#c79bee',
    build: (f) => {
      f.disc(-11, 16, 5, M.metal);
      f.disc(-11, 16, 2, M.dark);
      f.disc(-13, 11, 4, M.metal);
      f.rect(-9, 13, 6, 6, M.dark);
      f.line(9, 17, 15, 23, 3, M.dark);
      f.crescent(15, 23, 6, 3, 1, M.metal);
      f.crescent(15, 23, 6, 5, 1, M.glow);
    },
  },
];

// ---------------------------------------------------------------- 명암
/**
 * 가장자리를 읽어서 톤을 정한다.
 *   위가 비었으면      밝게   (빛은 위에서 온다)
 *   왼쪽 위가 비었으면 림라이트
 *   아래가 비었으면    그림자
 * 손으로 칠하는 게 아니라 규칙이라, 파츠를 새로 넣어도 톤이 안 깨진다.
 */
function toneOf(m: Uint8Array, cx: number, cy: number): number {
  const at = (x: number, y: number): number =>
    x < 0 || x >= CELL || y < 0 || y >= CELL ? 0 : m[y * CELL + x];
  const up = at(cx, cy - 1);
  const down = at(cx, cy + 1);
  const upLeft = at(cx - 1, cy - 1);
  const left = at(cx - 1, cy);

  if (!up && !upLeft) return 4;      // 위·좌상 둘 다 트임 → 가장 밝은 모서리
  if (!up) return 3;                 // 윗면
  if (!left) return 3;               // 빛 쪽 옆면
  if (!down) return 0;               // 바닥면
  if (!at(cx + 1, cy)) return 1;     // 그늘 쪽 옆면
  // 빛 쪽으로 한 칸 더 밝게, 그늘 쪽으로 한 칸 더 어둡게.
  // 이 두 줄이 있어야 통이 납작한 판이 아니라 원통으로 보인다.
  if (!at(cx - 2, cy)) return 3;
  if (!at(cx + 2, cy)) return 1;
  return 2;
}

// ---------------------------------------------------------------- 출력
const rows = Math.ceil(CREW.length / COLS);
const W = COLS * CELL * SCALE;
const H = rows * CELL * SCALE;
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  png.data[i * 4] = 0x14; png.data[i * 4 + 1] = 0x16; png.data[i * 4 + 2] = 0x1b; png.data[i * 4 + 3] = 255;
}

const OUTLINE: RGB = [10, 10, 18];

CREW.forEach((c, idx) => {
  const f = new F();
  body(f);
  c.build(f);

  const ramps: Record<number, RGB[]> = {
    [M.suit]: ramp(c.suit),
    [M.metal]: ramp(c.metal),
    [M.skin]: ramp('#e8b48c'),
    [M.glow]: ramp(c.glow),
    [M.dark]: ramp('#2a2f3c'),
  };

  const ox = (idx % COLS) * CELL * SCALE;
  const oy = Math.floor(idx / COLS) * CELL * SCALE;

  const put = (x: number, y: number, col: RGB): void => {
    for (let sy = 0; sy < SCALE; sy++) {
      for (let sx = 0; sx < SCALE; sx++) {
        const px = ox + x * SCALE + sx;
        const py = oy + y * SCALE + sy;
        const i = (py * W + px) * 4;
        png.data[i] = col[0]; png.data[i + 1] = col[1]; png.data[i + 2] = col[2];
      }
    }
  };

  // 윤곽선 — 실루엣 바깥 한 겹
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (f.m[y * CELL + x]) continue;
      const solid = (xx: number, yy: number): boolean =>
        xx >= 0 && xx < CELL && yy >= 0 && yy < CELL && f.m[yy * CELL + xx] > 0;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) put(x, y, OUTLINE);
    }
  }

  // 본체
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const mat = f.m[y * CELL + x];
      if (!mat) continue;
      // 표시등은 발광체라 음영을 안 먹인다 — 항상 제일 밝게
      const tone = mat === M.glow ? 4 : toneOf(f.m, x, y);
      put(x, y, ramps[mat][tone]);
    }
  }
});

const out = process.argv[2] ?? 'crew.png';
writeFileSync(out, PNG.sync.write(png));
console.log('순서:', CREW.map((c, i) => `${i + 1}.${c.name}`).join('  '));
console.log('→', out);
