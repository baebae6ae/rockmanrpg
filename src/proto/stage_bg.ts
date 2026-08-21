/**
 * 스테이지 배경 — 록맨X 시리즈 스테이지의 결을 따라간다.
 *
 * X 배경이 다른 도트 배경과 구별되는 지점을 네 가지로 봤다.
 *
 *  1. 굵은 어두운 윤곽으로 덩어리지는 타일. 면이 이어지지 않고 뚝뚝 끊긴다.
 *  2. 바닥 아래로 한 겹 더 있는 구조물. 뚫린 칸으로 비치고 시차로 따로 흐른다.
 *  3. 스테이지마다 확고한 배색. 색만 바꾼 게 아니라 아예 다른 장소다.
 *  4. 멈춰 있지 않다. 배선이 흐르고 쇳물이 내려가고 눈이 날린다.
 *
 * 그래서 테마를 배색 교체가 아니라 "바닥을 어떻게 짓는가"까지 통째로 다르게
 * 짰고, 정지 배경 위에 프레임마다 다시 그리는 얇은 애니메이션 층을 따로 뒀다.
 */

import { Container, Graphics } from 'pixi.js';

export interface ThemeCtx {
  arenaW: number;
  arenaH: number;
  /** 결정적 난수 — 판을 새로 시작해도 같은 모양이 나온다 */
  rnd: () => number;
}

/** 지금 화면에 보이는 월드 좌표 범위 — 애니메이션은 이 안만 그린다 */
export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface StageTheme {
  id: string;
  name: string;
  /** 이 스테이지의 분위기색 */
  accent: number;
  /** 바닥 아래로 비치는 층 */
  far: (g: Graphics, c: ThemeCtx) => void;
  /** 바닥 본체 */
  ground: (g: Graphics, c: ThemeCtx) => void;
  /** 프레임마다 다시 그리는 층 */
  anim?: (g: Graphics, c: ThemeCtx, t: number, v: View) => void;
}

function makeRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

/** 경계벽 — 어느 스테이지든 "여기가 끝"이라는 건 같은 방식으로 알린다 */
function warningBorder(g: Graphics, c: ThemeCtx, stripe: number, base: number): void {
  const { arenaW: W, arenaH: H } = c;
  for (const [bx, by, bw, bh] of [
    [0, 0, W, 8], [0, H - 8, W, 8], [0, 0, 8, H], [W - 8, 0, 8, H],
  ]) {
    g.rect(bx, by, bw, bh).fill({ color: base });
    const along = bw > bh;
    const n = Math.ceil((along ? bw : bh) / 14);
    for (let i = 0; i < n; i += 2) {
      if (along) g.rect(bx + i * 14, by + 1, 14, bh - 2).fill({ color: stripe });
      else g.rect(bx + 1, by + i * 14, bw - 2, 14).fill({ color: stripe });
    }
  }
}

interface PlateOpts {
  tile: number;
  plate: number;
  lit: number;
  dark: number;
  line: number;
  rivet: number;
  /** 이 확률로 칸이 뚫려 아래층이 보인다 */
  holeChance: number;
  /** 뚫린 칸에 얹을 창살 색 */
  grate: number;
}

/**
 * 덩어리진 타일 바닥. 네 테마가 전부 이 골격을 쓰되 배색과 뚫린 칸의
 * 비율만 달리한다 — 그래야 딴 게임이 아니라 같은 게임의 다른 구역으로 읽힌다.
 */
function platedFloor(g: Graphics, c: ThemeCtx, o: PlateOpts): void {
  const cols = Math.ceil(c.arenaW / o.tile);
  const rows = Math.ceil(c.arenaH / o.tile);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * o.tile;
      const y = r * o.tile;
      const roll = c.rnd();

      if (roll < o.holeChance) {
        for (let i = 4; i < o.tile - 2; i += 7) {
          g.rect(x + i, y + 2, 3, o.tile - 4).fill({ color: o.grate, alpha: 0.72 });
        }
        g.rect(x + 1, y + 1, o.tile - 2, 2).fill({ color: o.dark });
        g.rect(x + 1, y + o.tile - 3, o.tile - 2, 2).fill({ color: o.dark });
        continue;
      }

      g.rect(x, y, o.tile, o.tile).fill({ color: o.line });
      g.rect(x + 2, y + 2, o.tile - 4, o.tile - 4).fill({ color: o.plate });
      g.rect(x + 2, y + 2, o.tile - 4, 3).fill({ color: o.lit });
      g.rect(x + 2, y + 2, 3, o.tile - 4).fill({ color: o.lit });
      g.rect(x + 2, y + o.tile - 6, o.tile - 4, 4).fill({ color: o.dark });
      g.rect(x + o.tile - 6, y + 2, 4, o.tile - 4).fill({ color: o.dark });
      if (roll > 0.72) {
        g.rect(x + 7, y + 7, 3, 3).fill({ color: o.rivet });
        g.rect(x + o.tile - 10, y + o.tile - 10, 3, 3).fill({ color: o.rivet });
      }
    }
  }
}

/** 타일 좌표를 시간으로 흐르게 하는 헬퍼 — 화면 밖은 건너뛴다 */
function flowX(v: View, period: number, offset: number, cb: (x: number) => void): void {
  const start = Math.floor(v.x0 / period) * period - period;
  for (let x = start; x < v.x1 + period; x += period) cb(x + offset);
}

function flowY(v: View, period: number, offset: number, cb: (y: number) => void): void {
  const start = Math.floor(v.y0 / period) * period - period;
  for (let y = start; y < v.y1 + period; y += period) cb(y + offset);
}

// ---------------------------------------------------------------- 발전 구획
const powerPlant: StageTheme = {
  id: 'plant',
  name: '발전 구획',
  accent: 0x53d2f5,

  far: (g, c) => {
    g.rect(0, 0, c.arenaW, c.arenaH).fill({ color: 0x05080f });
    for (let x = 20; x < c.arenaW; x += 96) {
      g.rect(x, 0, 14, c.arenaH).fill({ color: 0x101a2e });
      g.rect(x + 2, 0, 3, c.arenaH).fill({ color: 0x1b2b4a });
    }
    for (let y = 40; y < c.arenaH; y += 128) {
      g.rect(0, y, c.arenaW, 10).fill({ color: 0x0c1424 });
      g.rect(0, y + 2, c.arenaW, 2).fill({ color: 0x18263f });
      for (let x = 30; x < c.arenaW; x += 64) {
        g.rect(x, y + 3, 5, 5).fill({ color: c.rnd() > 0.5 ? 0x2f7fd0 : 0x1d3a63 });
      }
    }
  },

  ground: (g, c) => {
    platedFloor(g, c, {
      tile: 40, plate: 0x3c5390, lit: 0x6786c8, dark: 0x22315a,
      line: 0x0d1424, rivet: 0x8aa3dc, holeChance: 0.1, grate: 0x1a2540,
    });
    const rows = Math.ceil(c.arenaH / 40);
    for (let r = 3; r < rows; r += 7) {
      const y = r * 40 + 16;
      g.rect(0, y - 2, c.arenaW, 12).fill({ color: 0x0b1120 });
      g.rect(0, y + 1, c.arenaW, 6).fill({ color: 0x1c4468 });
      for (let x = 24; x < c.arenaW; x += 80) {
        g.rect(x, y - 4, 10, 16).fill({ color: 0x27385f });
      }
    }
    for (let i = 0; i < 5; i++) {
      const gx = 120 + Math.floor(c.rnd() * (c.arenaW - 240));
      const gy = 120 + Math.floor(c.rnd() * (c.arenaH - 240));
      g.circle(gx, gy, 46).fill({ color: 0x121b33 });
      g.circle(gx, gy, 42).fill({ color: 0x2c3f6e });
      g.circle(gx, gy, 30).stroke({ color: 0x4a68ab, width: 3 });
      g.circle(gx, gy, 18).fill({ color: 0x1a3b5e });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.rect(gx + Math.cos(a) * 36 - 2, gy + Math.sin(a) * 36 - 2, 4, 4).fill({ color: 0x7d97d4 });
      }
    }
    warningBorder(g, c, 0xf0c020, 0x10182c);
  },

  anim: (g, c, t, v) => {
    // 배선을 타고 흐르는 전류
    const rows = Math.ceil(c.arenaH / 40);
    for (let r = 3; r < rows; r += 7) {
      const y = r * 40 + 16;
      if (y < v.y0 - 20 || y > v.y1 + 20) continue;
      g.rect(v.x0, y + 2, v.x1 - v.x0, 2).fill({ color: 0x2f7ba0 });
      flowX(v, 260, (t * 150) % 260, (x) => {
        g.rect(x, y, 46, 6).fill({ color: 0x9ff0ff, alpha: 0.85 });
      });
    }
  },
};

// ---------------------------------------------------------------- 냉각 구획
const coolant: StageTheme = {
  id: 'ice',
  name: '냉각 구획',
  accent: 0xa8e8ff,

  far: (g, c) => {
    g.rect(0, 0, c.arenaW, c.arenaH).fill({ color: 0x0a1c33 });
    for (let i = 0; i < 60; i++) {
      const x = c.rnd() * c.arenaW;
      const y = c.rnd() * c.arenaH;
      const w = 30 + c.rnd() * 90;
      g.rect(x, y, w, 6).fill({ color: 0x14375c });
      g.rect(x + 4, y + 1, Math.max(4, w - 12), 2).fill({ color: 0x2f6f9e });
    }
  },

  ground: (g, c) => {
    platedFloor(g, c, {
      tile: 44, plate: 0x8fb9d6, lit: 0xdcf1ff, dark: 0x51789a,
      line: 0x14283f, rivet: 0xf2fbff, holeChance: 0.12, grate: 0x39678c,
    });
    // 바닥에 박힌 얼음덩이
    for (let i = 0; i < 22; i++) {
      const x = 60 + c.rnd() * (c.arenaW - 120);
      const y = 60 + c.rnd() * (c.arenaH - 120);
      const r = 12 + c.rnd() * 16;
      g.moveTo(x, y - r).lineTo(x + r * 0.7, y).lineTo(x, y + r).lineTo(x - r * 0.7, y).closePath();
      g.fill({ color: 0x2b6f9c });
      g.moveTo(x, y - r + 5).lineTo(x + r * 0.38, y).lineTo(x, y + r - 6).lineTo(x - r * 0.38, y).closePath();
      g.fill({ color: 0x86d8f5 });
    }
    warningBorder(g, c, 0x7fd8f5, 0x143049);
  },

  anim: (g, _c, t, v) => {
    // 흩날리는 눈 — 화면 폭 안에서만 순환시킨다
    const w = v.x1 - v.x0;
    const h = v.y1 - v.y0;
    for (let i = 0; i < 70; i++) {
      const sx = ((i * 137.5) % 360) / 360;
      const sy = ((i * 71.3) % 360) / 360;
      const x = v.x0 + ((sx * w + t * (14 + (i % 5) * 7)) % w);
      const y = v.y0 + ((sy * h + t * (26 + (i % 3) * 12)) % h);
      g.rect(Math.round(x), Math.round(y), 2, 2).fill({ color: 0xdff4ff, alpha: 0.5 });
    }
  },
};

// ---------------------------------------------------------------- 용광 구획
const foundry: StageTheme = {
  id: 'foundry',
  name: '용광 구획',
  accent: 0xff9a3c,

  far: (g, c) => {
    // 아래는 쇳물이다 — 뚫린 칸이 밝게 타올라야 한다
    g.rect(0, 0, c.arenaW, c.arenaH).fill({ color: 0x2a0d06 });
    for (let i = 0; i < 90; i++) {
      const x = c.rnd() * c.arenaW;
      const y = c.rnd() * c.arenaH;
      const w = 40 + c.rnd() * 120;
      const h = 16 + c.rnd() * 30;
      g.rect(x, y, w, h).fill({ color: 0x7a2408 });
      g.rect(x + 4, y + 4, Math.max(4, w - 8), Math.max(4, h - 8)).fill({ color: 0xd9531a });
      g.rect(x + 10, y + 7, Math.max(4, w - 20), Math.max(3, h - 14)).fill({ color: 0xffab3d });
    }
  },

  ground: (g, c) => {
    platedFloor(g, c, {
      tile: 40, plate: 0x4a3524, lit: 0x7d5c3c, dark: 0x2b1c11,
      line: 0x120a06, rivet: 0xb0824f, holeChance: 0.14, grate: 0x2b1c11,
    });
    const cols = Math.ceil(c.arenaW / 40);
    for (let col = 3; col < cols; col += 6) {
      const x = col * 40 + 8;
      g.rect(x - 5, 0, 30, c.arenaH).fill({ color: 0x1a0d06 });
      g.rect(x, 0, 20, c.arenaH).fill({ color: 0x8f3410 });
    }
    warningBorder(g, c, 0xf0c020, 0x2b1c11);
  },

  anim: (g, c, t, v) => {
    const cols = Math.ceil(c.arenaW / 40);
    for (let col = 3; col < cols; col += 6) {
      const x = col * 40 + 8;
      if (x < v.x0 - 40 || x > v.x1 + 40) continue;
      g.rect(x + 2, v.y0, 16, v.y1 - v.y0).fill({ color: 0xd9531a });
      flowY(v, 90, (t * 70) % 90, (y) => {
        g.rect(x + 3, y, 14, 38).fill({ color: 0xffc766, alpha: 0.9 });
      });
    }
  },
};

// ---------------------------------------------------------------- 야간 고속도로
const highway: StageTheme = {
  id: 'highway',
  name: '야간 고속도로',
  accent: 0x6fd0ff,

  far: (g, c) => {
    g.rect(0, 0, c.arenaW, c.arenaH).fill({ color: 0x05070f });
    for (let i = 0; i < 70; i++) {
      const x = c.rnd() * c.arenaW;
      const y = c.rnd() * c.arenaH;
      const w = 26 + c.rnd() * 40;
      const h = 40 + c.rnd() * 90;
      g.rect(x, y, w, h).fill({ color: 0x0d1428 });
      for (let wy = y + 5; wy < y + h - 4; wy += 9) {
        for (let wx = x + 4; wx < x + w - 4; wx += 8) {
          if (c.rnd() > 0.55) g.rect(wx, wy, 3, 4).fill({ color: c.rnd() > 0.7 ? 0xffe08a : 0x3f6fb5 });
        }
      }
    }
  },

  ground: (g, c) => {
    platedFloor(g, c, {
      tile: 48, plate: 0x2f3444, lit: 0x4a5164, dark: 0x1b1f2c,
      line: 0x0a0c14, rivet: 0x646c82, holeChance: 0.16, grate: 0x141824,
    });
    const rows = Math.ceil(c.arenaH / 48);
    for (let r = 2; r < rows; r += 5) {
      const y = r * 48 + 20;
      for (let x = 10; x < c.arenaW; x += 64) g.rect(x, y, 34, 5).fill({ color: 0xe8e4d0 });
    }
    warningBorder(g, c, 0xf0c020, 0x1b1f2c);
  },

  anim: (g, c, t, v) => {
    // 도로를 스치는 전조등
    const rows = Math.ceil(c.arenaH / 48);
    for (let r = 2; r < rows; r += 5) {
      const y = r * 48 + 12;
      if (y < v.y0 - 30 || y > v.y1 + 30) continue;
      flowX(v, 520, (t * 320 + r * 130) % 520, (x) => {
        g.rect(x, y, 70, 3).fill({ color: 0x9fdcff, alpha: 0.45 });
        g.rect(x + 50, y - 1, 26, 5).fill({ color: 0xffffff, alpha: 0.7 });
      });
    }
  },
};

export const THEMES: StageTheme[] = [powerPlant, coolant, foundry, highway];

/**
 * 테마 하나를 그려 컨테이너 둘로 돌려준다. 처음 필요할 때만 짓는다 —
 * 넷을 미리 다 지으면 시작이 눈에 띄게 늦어진다.
 */
export function buildTheme(
  theme: StageTheme,
  arenaW: number,
  arenaH: number,
): { far: Container; ground: Container } {
  const c: ThemeCtx = { arenaW, arenaH, rnd: makeRnd(0x9e37 + theme.id.length * 7919) };
  const far = new Container();
  const ground = new Container();
  const fg = new Graphics();
  const gg = new Graphics();
  theme.far(fg, c);
  theme.ground(gg, c);
  far.addChild(fg);
  ground.addChild(gg);
  return { far, ground };
}
