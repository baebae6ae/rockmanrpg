/**
 * 실루엣 검증 — 《균열 회수반》 아홉 대원.
 *
 * 색·명암을 전부 빼고 덩어리만 남겼을 때 아홉이 구분되는지 본다.
 * 여기서 통과 못 하면 아무리 잘 칠해도 40px 인게임에서는 안 읽힌다.
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const CELL = 64;
const SCALE = 6;
const COLS = 3;

class F {
  d = new Uint8Array(CELL * CELL);
  /** x: 중앙 기준, y: 발바닥 기준(위가 양수) */
  set(x: number, y: number): void {
    const cx = 32 + Math.round(x);
    const cy = 63 - Math.round(y);
    if (cx < 0 || cx >= CELL || cy < 0 || cy >= CELL) return;
    this.d[cy * CELL + cx] = 1;
  }
  rect(x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy);
  }
  disc(cx: number, cy: number, r: number): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.set(cx + x, cy + y);
  }
  /** 반달 — 도끼날·낫날처럼 안쪽이 파인 날붙이 */
  crescent(cx: number, cy: number, r: number, inner: number, side: -1 | 1): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (side < 0 && x > 0) continue;
        if (side > 0 && x < 0) continue;
        const d2 = x * x + y * y;
        if (d2 <= r * r && d2 >= inner * inner) this.set(cx + x, cy + y);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const h = Math.floor(w / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let ox = -h; ox <= h; ox++) for (let oy = -h; oy <= h; oy++) this.set(x + ox, y + oy);
    }
  }
}

/** 아홉이 공유하는 사람 몸 — 여기서 갈리면 안 된다 */
function body(f: F): void {
  f.rect(-5, 0, 4, 15);   // 다리
  f.rect(1, 0, 4, 15);
  f.rect(-6, 0, 5, 4);    // 부츠
  f.rect(1, 0, 5, 4);
  f.rect(-6, 14, 12, 13); // 몸통
  f.rect(-8, 23, 16, 5);  // 어깨
  f.rect(-9, 13, 4, 11);  // 팔
  f.rect(5, 13, 4, 11);
  f.rect(-4, 27, 8, 8);   // 머리
}

type Build = (f: F) => void;

/**
 * 1차 검증에서 못·불씨·거울이 탈락했다 — 장비가 머리를 삼켜서
 * 사람이 아니라 덩어리로 읽혔다. 그래서 규칙을 하나 세운다:
 *
 *   장비는 머리 상자(x -4..4, y 27..35)를 침범하지 않는다.
 *
 * 머리가 안 보이면 40px에서 캐릭터로 안 읽힌다. 실루엣이 아무리
 * 특이해도 그건 실패다. 아래 아홉은 전부 이 규칙을 지킨다.
 *
 * 앞쪽 = 오른쪽(+x), 등 = 왼쪽(-x)
 */
const CREW: { name: string; build: Build }[] = [
  {
    // 못 — 어깨에 걸친 굵고 짧은 총신. 앞으로 뻗는 두꺼운 대각선
    name: '못',
    build: (f) => {
      f.line(6, 24, 18, 30, 7); // 머리 오른쪽(x>4)에서 시작해 앞으로
      f.rect(4, 21, 6, 7);      // 개머리
    },
  },
  {
    // 종 — 등에 매단 종. 위는 좁고 아래로 확 벌어진다
    name: '종',
    build: (f) => {
      const bx = -12;
      for (let i = 0; i < 10; i++) {
        const w = 4 + Math.round(i * 0.9);
        f.rect(bx - Math.floor(w / 2), 26 - i, w, 1);
      }
      f.rect(bx - 7, 15, 14, 3); // 종 입 — 두꺼운 테두리
    },
  },
  {
    // 불씨 — 등의 연료통 둘. 머리보다 낮게, 뒤로 물려서
    name: '불씨',
    build: (f) => {
      f.rect(-16, 15, 5, 18);
      f.rect(-11, 17, 5, 15);
      f.rect(-16, 33, 10, 2); // 통 위 마개
      f.rect(6, 22, 11, 4);   // 손의 짧은 노즐
    },
  },
  {
    // 거울 — 등에 진 원형 반사판. 몸통 높이로 내려 머리를 비운다
    name: '거울',
    build: (f) => {
      f.disc(-13, 23, 9);
    },
  },
  {
    // 바늘 — 후드 + 아주 긴 총열. 유일한 긴 가로선
    name: '바늘',
    build: (f) => {
      f.rect(-6, 27, 10, 9);      // 후드로 커진 머리
      f.line(-5, 35, -12, 27, 4); // 후드 뒷자락
      f.rect(5, 21, 25, 2);       // 아주 긴 총열
      f.rect(3, 19, 6, 6);
    },
  },
  {
    // 반딧불 — 어깨 양쪽 발사관. 유일한 좌우대칭 넓은 어깨
    name: '반딧불',
    build: (f) => {
      f.rect(-15, 23, 7, 8);
      f.rect(8, 23, 7, 8);
      f.rect(-15, 32, 7, 2);
      f.rect(8, 32, 7, 2);
    },
  },
  {
    // 도끼 — 등에 걸린 큰 도끼. 위쪽 뒤의 반달 날
    name: '도끼',
    build: (f) => {
      f.line(-11, 31, -5, 13, 3);
      f.crescent(-11, 31, 9, 4, -1);
    },
  },
  {
    // 작살 — 키보다 훨씬 긴 자루. 유일한 긴 세로선
    name: '작살',
    build: (f) => {
      f.rect(8, 4, 3, 42);
      f.rect(7, 46, 5, 5);
      f.rect(5, 43, 2, 5);
      f.rect(12, 43, 2, 5);
    },
  },
  {
    // 사슬 — 한쪽 허리에 감은 사슬 + 낮게 든 낫.
    // 좌우대칭으로 두르면 치마로 읽혀서 뒤쪽 한쪽에만 몰았다
    name: '사슬',
    build: (f) => {
      f.disc(-11, 16, 5);
      f.disc(-13, 11, 4);
      f.rect(-9, 13, 6, 6);
      f.line(9, 17, 15, 23, 3);
      f.crescent(15, 23, 6, 3, 1);
    },
  },
];

// ---------------------------------------------------------------- 출력
const rows = Math.ceil(CREW.length / COLS);
const W = COLS * CELL * SCALE;
const H = rows * CELL * SCALE;
const png = new PNG({ width: W, height: H });

// 밝은 바탕 — 검은 덩어리만 보이게
for (let i = 0; i < W * H; i++) {
  png.data[i * 4] = 0xee;
  png.data[i * 4 + 1] = 0xee;
  png.data[i * 4 + 2] = 0xf0;
  png.data[i * 4 + 3] = 255;
}

CREW.forEach((c, idx) => {
  const f = new F();
  body(f);
  c.build(f);

  const ox = (idx % COLS) * CELL * SCALE;
  const oy = Math.floor(idx / COLS) * CELL * SCALE;

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (!f.d[y * CELL + x]) continue;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const px = ox + x * SCALE + sx;
          const py = oy + y * SCALE + sy;
          const i = (py * W + px) * 4;
          png.data[i] = 0x18;
          png.data[i + 1] = 0x1a;
          png.data[i + 2] = 0x20;
        }
      }
    }
  }

  // 칸 구분선
  for (let x = 0; x < CELL * SCALE; x++) {
    const i = ((oy + CELL * SCALE - 1) * W + (ox + x)) * 4;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = 0xcc;
  }
  for (let y = 0; y < CELL * SCALE; y++) {
    const i = ((oy + y) * W + (ox + CELL * SCALE - 1)) * 4;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = 0xcc;
  }
});

const out = process.argv[2] ?? 'silhouette.png';
writeFileSync(out, PNG.sync.write(png));
console.log('순서:', CREW.map((c, i) => `${i + 1}.${c.name}`).join('  '));
console.log('→', out);
