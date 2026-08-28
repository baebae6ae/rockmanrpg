/**
 * 《균열 회수반》 아홉 대원 — 채색 프리뷰.
 *
 * 실루엣 검증(tools/crew-silhouette.ts)을 통과한 아홉에 파츠와 명암을 얹는다.
 * 아직 gen-placeholder.ts 와 연결되어 있지 않다 — 화풍이 확정되면
 * 여기 파츠·램프를 그쪽 생성기로 옮기고 애니메이션 프레임을 붙인다.
 *
 * 명암은 손으로 칠하지 않는다. 재질 버퍼를 만들어 두고 가장자리를 읽어서
 * 자동으로 배정한다. 이 방식이라야 파츠를 새로 추가해도 톤이 안 깨진다.
 *
 * 실행: npx tsx tools/crew-preview.ts out.png     (SC=배율 CO=열수)
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const CELL = 64;
const SCALE = Number(process.env.SC ?? 6);
const COLS = Number(process.env.CO ?? 3);

/**
 * 재질 — 같은 재질끼리 같은 램프를 쓴다.
 *   suit  본체 색        trim  부츠·장갑·벨트 (본체에서 어둡게 파생)
 *   metal 장비           accent 밝은 테두리 (강조색을 음영 먹여 쓴다)
 *   glow  발광체         (음영을 안 먹이고 항상 최대 밝기)
 */
const enum M { none = 0, suit = 1, trim = 2, metal = 3, accent = 4, glow = 5 }

// ---------------------------------------------------------------- 색
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
/** 어두운 쪽은 검정이 아니라 차가운 남색으로 민다 — 검정으로 내리면 도트가 죽는다 */
const COOL: RGB = [22, 26, 44];

/** 5단 램프 + 윤곽선 두 단(빛 쪽 / 그늘 쪽) */
interface Ramp { t: RGB[]; edgeLit: RGB; edgeDark: RGB }
function ramp(base: string | RGB): Ramp {
  const b = typeof base === 'string' ? hex(base) : base;
  return {
    t: [
      mix(b, COOL, 0.58),
      mix(b, COOL, 0.30),
      b,
      mix(b, WHITE, 0.24),
      mix(b, WHITE, 0.52),
    ],
    edgeLit: mix(b, COOL, 0.70),
    edgeDark: mix(b, COOL, 0.88),
  };
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
 *
 * 판을 나누는 선(무릎·팔꿈치·벨트·가슴판)이 있어야 한 덩어리가 아니라
 * 조립된 장구로 읽힌다. 다만 1px 선을 남발하면 40px 에서는 노이즈가 된다.
 */
function body(f: F): void {
  // 부츠 — 발이 커야 록맨 계열 실루엣이 선다
  f.rect(-7, 0, 6, 5, M.trim);
  f.rect(1, 0, 6, 5, M.trim);
  f.rect(-7, 4, 6, 1, M.accent);
  f.rect(1, 4, 6, 1, M.accent);

  f.rect(-5, 5, 4, 5, M.suit);   // 정강이
  f.rect(1, 5, 4, 5, M.suit);
  f.rect(-6, 9, 5, 3, M.metal);  // 무릎 판
  f.rect(1, 9, 5, 3, M.metal);
  f.rect(-5, 11, 4, 4, M.suit);  // 허벅지
  f.rect(1, 11, 4, 4, M.suit);

  f.rect(-4, 14, 8, 4, M.suit);  // 허리
  f.rect(-5, 12, 10, 2, M.trim); // 벨트
  f.rect(-1, 12, 2, 2, M.accent);

  f.rect(-6, 17, 12, 8, M.suit); // 가슴
  f.rect(-5, 17, 10, 1, M.trim); // 복부 구분선
  f.rect(-4, 19, 8, 4, M.metal); // 가슴판
  f.rect(-2, 20, 4, 2, M.glow);  // 코어

  f.rect(-10, 15, 4, 8, M.suit); // 팔
  f.rect(6, 15, 4, 8, M.suit);
  f.rect(-10, 18, 4, 1, M.trim); // 팔꿈치
  f.rect(6, 18, 4, 1, M.trim);
  f.rect(-11, 13, 5, 4, M.trim); // 장갑
  f.rect(6, 13, 5, 4, M.trim);
  f.rect(-11, 16, 5, 1, M.accent);
  f.rect(6, 16, 5, 1, M.accent);

  f.rect(-10, 22, 6, 5, M.metal); // 어깨 패드
  f.rect(4, 22, 6, 5, M.metal);
  f.rect(-10, 26, 6, 1, M.accent);
  f.rect(4, 26, 6, 1, M.accent);

  f.rect(-2, 25, 4, 2, M.trim);   // 목
  // 머리는 대원마다 다르다 — HEADS 가 따로 그린다
}

/**
 * 머리 — 아홉을 가르는 제일 중요한 파츠.
 *
 * 얼굴이 전부 같으면 색만 바꾼 같은 사람으로 보인다. 그래서 각자
 * 하는 일에 맞는 머리를 준다. 불을 지르는 놈은 방독면을 쓰고,
 * 제일 시끄러운 무기를 든 놈은 귀를 막고, 저격수는 한쪽 눈만 내놓는다.
 *
 * 다만 셋은 공통으로 지킨다 — 빛나는 눈, 아래쪽 턱 그늘, 폭 8~11px.
 * 이게 있어야 얼굴이 다 달라도 여전히 한 팀으로 읽힌다.
 */
type Head = (f: F) => void;

const HEADS: Record<string, Head> = {
  // 못 — 정면으로 얻어맞는 자리다. 통짜 방호 헬멧에 가로 슬릿 하나
  '못': (f) => {
    f.rect(-5, 27, 11, 9, M.suit);
    f.rect(-5, 34, 11, 2, M.metal);
    f.rect(-2, 36, 5, 2, M.metal);      // 짧은 볏
    f.rect(-4, 30, 9, 2, M.glow);       // 가로 슬릿
    f.rect(-5, 32, 11, 1, M.accent);
    f.rect(-5, 27, 11, 1, M.trim);
  },
  // 종 — 자기 무기가 제일 시끄럽다. 귀를 크게 덮는다
  '종': (f) => {
    f.rect(-4, 28, 9, 8, M.suit);
    f.rect(-7, 29, 3, 5, M.metal);
    f.rect(5, 29, 3, 5, M.metal);
    f.rect(-7, 31, 3, 1, M.accent);
    f.rect(5, 31, 3, 1, M.accent);
    f.rect(-4, 34, 9, 2, M.metal);
    f.rect(-2, 30, 6, 3, M.glow);
    f.rect(-4, 28, 9, 1, M.trim);
  },
  // 불씨 — 불을 지르는 놈이라 방독면. 앞으로 필터통이 튀어나온다.
  // 둥근 고글 둘은 이 크기에서 서로 뭉쳐 지저분해진다 — 네모로 또렷하게 뗀다
  '불씨': (f) => {
    f.rect(-5, 28, 10, 8, M.suit);
    f.rect(-5, 34, 10, 2, M.metal);
    f.rect(-5, 28, 10, 1, M.trim);
    f.rect(-4, 29, 9, 3, M.metal);      // 얼굴 아래를 덮는 마스크
    f.rect(-4, 29, 9, 1, M.trim);
    f.rect(5, 29, 3, 3, M.metal);       // 앞으로 나온 필터통
    f.rect(5, 30, 3, 1, M.accent);
    f.rect(-4, 32, 3, 2, M.glow);       // 고글 둘
    f.rect(1, 32, 3, 2, M.glow);
  },
  // 거울 — 제 빛에 눈이 상한다. 챙을 길게 빼고 바이저를 넓게
  '거울': (f) => {
    f.rect(-5, 28, 10, 8, M.suit);
    f.rect(-7, 33, 14, 2, M.metal);     // 양옆으로 나온 챙
    f.rect(-7, 33, 14, 1, M.accent);
    f.rect(-4, 29, 9, 3, M.glow);
    f.rect(-5, 28, 10, 1, M.trim);
  },
  // 바늘 — 후드에 조준경. 한쪽 눈만 내놓는다
  '바늘': (f) => {
    f.rect(-6, 27, 11, 9, M.suit);
    f.line(-5, 35, -12, 28, 4, M.suit); // 후드 뒷자락
    f.rect(-6, 33, 11, 1, M.accent);
    f.rect(-3, 30, 4, 3, M.glow);
    f.rect(2, 31, 3, 1, M.metal);       // 조준경 팔
    f.rect(-6, 27, 11, 1, M.trim);
  },
  // 반딧불 — 유도탄을 부리려면 안테나가 있어야 한다
  '반딧불': (f) => {
    f.rect(-4, 28, 9, 7, M.suit);
    f.rect(-4, 34, 9, 1, M.metal);
    f.rect(-3, 35, 1, 4, M.metal);
    f.rect(3, 35, 1, 4, M.metal);
    f.rect(-3, 39, 1, 1, M.glow);
    f.rect(3, 39, 1, 1, M.glow);
    f.rect(-3, 30, 7, 3, M.glow);
    f.rect(-4, 28, 9, 1, M.trim);
  },
  // 도끼 — 혼자 헬멧을 안 쓴다. 맨머리에 머리띠 하나, 두 눈이 다 보인다
  '도끼': (f) => {
    f.rect(-4, 28, 8, 7, M.suit);
    f.rect(-4, 33, 8, 2, M.accent);     // 머리띠
    f.rect(-7, 33, 3, 2, M.accent);     // 뒤로 흐르는 자락
    f.rect(-3, 30, 2, 2, M.glow);
    f.rect(1, 30, 2, 2, M.glow);
    f.rect(-4, 28, 8, 1, M.trim);
  },
  // 작살 — 위로 솟은 얇은 볏 + 세로 슬릿
  '작살': (f) => {
    f.rect(-5, 27, 10, 8, M.suit);
    f.rect(-5, 34, 10, 1, M.metal);
    f.rect(-1, 35, 2, 5, M.metal);      // 볏
    f.rect(-1, 40, 2, 1, M.glow);
    f.rect(-1, 29, 2, 5, M.glow);       // 세로 슬릿
    f.rect(-5, 32, 10, 1, M.accent);
    f.rect(-5, 27, 10, 1, M.trim);
  },
  // 사슬 — 아래 얼굴을 천으로 가리고 눈만 내놓는다
  '사슬': (f) => {
    f.rect(-5, 28, 10, 8, M.suit);
    f.rect(-5, 28, 10, 4, M.trim);      // 천 복면
    f.line(-5, 30, -12, 26, 3, M.suit); // 뒤로 흐르는 자락
    f.rect(-3, 32, 7, 2, M.glow);       // 눈
    f.rect(-5, 35, 10, 1, M.accent);
  },
};

type Build = (f: F) => void;
interface Crew { name: string; suit: string; metal: string; glow: string; build: Build }

/** 앞쪽 = 오른쪽(+x), 등 = 왼쪽(-x). 장비는 머리 상자를 침범하지 않는다. */
const CREW: Crew[] = [
  {
    name: '못', suit: '#3f4756', metal: '#aab4c2', glow: '#ff9a4c',
    build: (f) => {
      f.line(9, 23, 20, 29, 7, M.metal);
      f.line(9, 25, 19, 31, 2, M.trim);
      f.rect(7, 20, 6, 7, M.trim);
      f.rect(18, 27, 3, 3, M.accent);
    },
  },
  {
    name: '종', suit: '#6b5a34', metal: '#c9a04a', glow: '#ffe08a',
    build: (f) => {
      // 등에 매달면 무슨 모양이든 망토로 읽힌다 — 손에 들려 낮게 내린다.
      // 위가 통이고 아래만 벌어져야 종이 된다.
      const bx = 15;
      f.rect(bx - 1, 13, 2, 5, M.trim);
      for (let i = 0; i < 9; i++) {
        const w = i < 5 ? 5 : Math.min(9, 5 + (i - 4) * 2);
        f.rect(bx - Math.floor(w / 2), 12 - i, w, 1, M.metal);
      }
      f.rect(bx - 5, 2, 11, 3, M.metal);
      f.rect(bx - 5, 4, 11, 1, M.accent);
      f.rect(bx - 5, 2, 11, 1, M.trim);
      f.rect(bx - 1, 0, 2, 2, M.trim);
    },
  },
  {
    name: '불씨', suit: '#7a3f2e', metal: '#7d858f', glow: '#ff6a2c',
    build: (f) => {
      f.rect(-17, 15, 5, 17, M.metal);
      f.rect(-17, 32, 5, 2, M.trim);
      f.rect(-17, 27, 5, 1, M.accent);
      f.rect(-11, 17, 5, 14, M.metal);
      f.rect(-11, 31, 5, 2, M.trim);
      f.rect(-11, 26, 5, 1, M.accent);
      f.line(-14, 32, -8, 31, 2, M.trim);
      f.rect(7, 21, 11, 4, M.metal);
      f.rect(7, 21, 11, 1, M.trim);
      f.rect(17, 22, 2, 2, M.glow);
    },
  },
  {
    name: '거울', suit: '#49505e', metal: '#d8dfe8', glow: '#eaf6ff',
    build: (f) => {
      f.disc(-13, 23, 9, M.metal);
      f.disc(-13, 23, 7, M.accent);
      f.disc(-13, 23, 5, M.glow);
      f.disc(-13, 23, 2, M.metal);
    },
  },
  {
    name: '바늘', suit: '#25514e', metal: '#8fa8a4', glow: '#5ce0d0',
    build: (f) => {
      f.rect(5, 21, 25, 2, M.metal);       // 아주 긴 총열
      f.rect(3, 19, 6, 6, M.trim);
      f.rect(3, 23, 6, 1, M.accent);
      f.rect(28, 21, 2, 2, M.glow);
    },
  },
  {
    name: '반딧불', suit: '#5b6a2e', metal: '#a3b268', glow: '#c8ff5c',
    build: (f) => {
      f.rect(-15, 23, 7, 8, M.metal);
      f.rect(8, 23, 7, 8, M.metal);
      f.rect(-15, 32, 7, 2, M.trim);
      f.rect(8, 32, 7, 2, M.trim);
      f.rect(-14, 25, 2, 2, M.glow);
      f.rect(-14, 28, 2, 2, M.glow);
      f.rect(12, 25, 2, 2, M.glow);
      f.rect(12, 28, 2, 2, M.glow);
      f.rect(-15, 30, 7, 1, M.accent);
      f.rect(8, 30, 7, 1, M.accent);
    },
  },
  {
    name: '도끼', suit: '#6b4326', metal: '#b3bcc7', glow: '#ff7a5a',
    build: (f) => {
      f.line(-11, 31, -5, 13, 3, M.trim);
      f.crescent(-11, 31, 9, 4, -1, M.metal);
      f.crescent(-11, 31, 6, 4, -1, M.accent);
    },
  },
  {
    name: '작살', suit: '#2f3f6b', metal: '#93a6c8', glow: '#7cc4ff',
    build: (f) => {
      f.rect(11, 3, 3, 42, M.metal);
      f.rect(11, 20, 3, 2, M.accent);
      f.rect(10, 45, 5, 5, M.metal);
      f.rect(8, 42, 2, 5, M.metal);
      f.rect(15, 42, 2, 5, M.metal);
      f.rect(11, 47, 3, 3, M.glow);
    },
  },
  {
    name: '사슬', suit: '#3a3446', metal: '#b3a6ce', glow: '#c79bee',
    build: (f) => {
      f.disc(-11, 16, 5, M.metal);
      f.disc(-11, 16, 2, M.trim);
      f.disc(-13, 11, 4, M.metal);
      f.rect(-9, 13, 6, 6, M.trim);
      f.line(9, 17, 15, 23, 3, M.trim);
      f.crescent(15, 23, 6, 3, 1, M.metal);
      f.crescent(15, 23, 6, 5, 1, M.glow);
    },
  },
];

// ---------------------------------------------------------------- 명암
const at = (m: Uint8Array, x: number, y: number): number =>
  x < 0 || x >= CELL || y < 0 || y >= CELL ? 0 : m[y * CELL + x];

/**
 * 가장자리를 읽어서 톤을 정한다. 빛은 왼쪽 위에서 온다.
 *   위가 비었으면       밝게
 *   위·좌상 둘 다 비면  림라이트
 *   아래가 비었으면     그림자
 * 빛 쪽/그늘 쪽으로 한 칸씩 더 번지게 해야 통이 납작한 판이 아니라
 * 원통으로 읽힌다.
 */
function toneOf(m: Uint8Array, cx: number, cy: number): number {
  const up = at(m, cx, cy - 1);
  const down = at(m, cx, cy + 1);
  const upLeft = at(m, cx - 1, cy - 1);
  const left = at(m, cx - 1, cy);

  if (!up && !upLeft) return 4;
  if (!up) return 3;
  if (!left) return 3;
  if (!down) return 0;
  if (!at(m, cx + 1, cy)) return 1;
  if (!at(m, cx - 2, cy)) return 3;
  if (!at(m, cx + 2, cy)) return 1;
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

CREW.forEach((c, idx) => {
  const f = new F();
  body(f);
  HEADS[c.name](f);
  c.build(f);
  const m = f.m;

  const suit = hex(c.suit);
  const R: Record<number, Ramp> = {
    [M.suit]: ramp(suit),
    [M.trim]: ramp(mix(suit, COOL, 0.42)),
    [M.metal]: ramp(c.metal),
    [M.accent]: ramp(c.glow),
    [M.glow]: ramp(c.glow),
  };

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

  // 윤곽선 — 이웃 재질에서 색을 가져온다. 전부 같은 검정으로 두르면
  // 오려 붙인 스티커처럼 보인다. 빛 쪽 외곽은 조금 덜 어둡게 둔다.
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (m[y * CELL + x]) continue;
      const n = at(m, x, y + 1) || at(m, x + 1, y) || at(m, x, y - 1) || at(m, x - 1, y);
      if (!n) continue;
      const lit = !at(m, x, y - 1) && !at(m, x - 1, y);
      put(x, y, lit ? R[n].edgeLit : R[n].edgeDark);
    }
  }

  // 본체
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const mat = m[y * CELL + x];
      if (!mat) continue;
      if (mat === M.glow) { put(x, y, R[mat].t[4]); continue; } // 발광체는 음영을 안 먹인다
      let tone = toneOf(m, x, y);
      // 접촉 그림자 — 다른 파츠가 위에 얹혀 있으면 한 단 어둡게.
      // 이 한 줄이 있어야 파츠가 겹쳐 놓인 것으로 보인다.
      const above = at(m, x, y - 1);
      if (above && above !== mat) tone = Math.max(0, tone - 1);
      put(x, y, R[mat].t[tone]);
    }
  }
});

const out = process.argv[2] ?? 'crew.png';
writeFileSync(out, PNG.sync.write(png));
console.log('순서:', CREW.map((c, i) => `${i + 1}.${c.name}`).join('  '));
console.log('→', out);
