/**
 * 스테이지 배경 — 록맨X 계열의 기계적 구조와 강한 색면을 기준으로 잡는다.
 *
 * 목표는 "예쁜 배경"이 아니라 전투가 올라가도 캐릭터와 탄이 묻히지 않는
 * 배경이다. 그래서 공통 규칙을 세 가지로 고정한다.
 *
 *  1. 바닥은 큰 패널 단위로 읽히고, 패널 사이의 어두운 선이 전투 공간을 만든다.
 *  2. 먼 배경은 낮은 대비, 바닥은 중간 대비, 애니메이션 층은 높은 대비로
 *     분리해 시차와 깊이를 만든다.
 *  3. 테마색은 전체를 칠하지 않고 "빛나는 설비"에 집중한다. 적과 플레이어의
 *     실루엣이 항상 가장 먼저 읽혀야 하기 때문이다.
 */

import { Container, Graphics } from 'pixi.js';

export interface ThemeCtx {
  arenaW: number;
  arenaH: number;
  /** 결정적 난수 — 판을 새로 시작해도 같은 모양이 나온다 */
  rnd: () => number;
}

export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface StageTheme {
  id: string;
  name: string;
  accent: number;
  far: (g: Graphics, c: ThemeCtx) => void;
  ground: (g: Graphics, c: ThemeCtx) => void;
  anim?: (g: Graphics, c: ThemeCtx, t: number, v: View) => void;
}

function makeRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

/** 경계벽 — 플레이 공간을 한눈에 고정하는 공통 프레임 */
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
  // 네 모서리에만 밝은 "조립 브라켓"을 넣는다. 화면 전체를 둘러 밝게 하면
  // 전투 오브젝트와 경쟁하므로 프레임의 시작점만 표시한다.
  const corners: [number, number][] = [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8]];
  for (const [x, y] of corners) {
    g.rect(x - 3, y - 3, 6, 6).fill({ color: stripe });
    g.rect(x - 1, y - 1, 2, 2).fill({ color: base });
  }
}

interface PlateOpts {
  tile: number;
  plate: number;
  lit: number;
  dark: number;
  line: number;
  rivet: number;
  holeChance: number;
  grate: number;
}

/**
 * 공통 패널 바닥. 패널마다 얇은 인셋을 하나 더 넣어 "타일"이 아니라
 * 조립된 장갑판으로 읽히게 한다. 작은 도트 화면에서도 밝은 면/어두운
 * 면/구조선의 3단이 유지된다.
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
        g.rect(x, y, o.tile, o.tile).fill({ color: o.line });
        for (let i = 4; i < o.tile - 2; i += 7) {
          g.rect(x + i, y + 2, 3, o.tile - 4).fill({ color: o.grate, alpha: 0.82 });
        }
        g.rect(x + 1, y + 1, o.tile - 2, 2).fill({ color: o.dark });
        g.rect(x + 1, y + o.tile - 3, o.tile - 2, 2).fill({ color: o.dark });
        g.rect(x + 3, y + 5, o.tile - 6, 1).fill({ color: o.lit, alpha: 0.28 });
        continue;
      }

      g.rect(x, y, o.tile, o.tile).fill({ color: o.line });
      g.rect(x + 2, y + 2, o.tile - 4, o.tile - 4).fill({ color: o.plate });
      g.rect(x + 2, y + 2, o.tile - 4, 3).fill({ color: o.lit });
      g.rect(x + 2, y + 2, 3, o.tile - 4).fill({ color: o.lit });
      g.rect(x + 2, y + o.tile - 6, o.tile - 4, 4).fill({ color: o.dark });
      g.rect(x + o.tile - 6, y + 2, 4, o.tile - 4).fill({ color: o.dark });
      // 내부 인셋 — 큰 면이 너무 평평하게 보이지 않으면서도 캐릭터 대비를 해치지 않는다.
      g.rect(x + 7, y + 7, o.tile - 14, 1).fill({ color: o.lit, alpha: 0.28 });
      g.rect(x + 7, y + o.tile - 8, o.tile - 14, 1).fill({ color: o.dark, alpha: 0.55 });
      if (roll > 0.72) {
        g.rect(x + 7, y + 7, 3, 3).fill({ color: o.rivet });
        g.rect(x + o.tile - 10, y + o.tile - 10, 3, 3).fill({ color: o.rivet });
      }
    }
  }
}

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
  accent: 0x54dcff,

  far: (g, c) => {
    g.rect(0, 0, c.arenaW, c.arenaH).fill({ color: 0x050a16 });
    for (let x = 20; x < c.arenaW; x += 96) {
      g.rect(x, 0, 14, c.arenaH).fill({ color: 0x0c1930 });
      g.rect(x + 2, 0, 3, c.arenaH).fill({ color: 0x17355a });
    }
    for (let y = 40; y < c.arenaH; y += 128) {
      g.rect(0, y, c.arenaW, 10).fill({ color: 0x091426 });
      g.rect(0, y + 2, c.arenaW, 2).fill({ color: 0x153052 });
      for (let x = 30; x < c.arenaW; x += 64) {
        g.rect(x, y + 3, 5, 5).fill({ color: c.rnd() > 0.5 ? 0x2e83d5 : 0x173b68 });
      }
    }
    // 멀리 있는 냉각탑 실루엣. 세부를 넣지 않고 덩어리만 만들어 깊이를 준다.
    for (let i = 0; i < 6; i++) {
      const x = 90 + i * 240;
      g.rect(x, 150, 70, 300).fill({ color: 0x081225 });
      g.rect(x + 8, 170, 54, 2).fill({ color: 0x21476f });
    }
  },

  ground: (g, c) => {
    platedFloor(g, c, {
      tile: 40, plate: 0x334f86, lit: 0x5e91d4, dark: 0x1b2d53,
      line: 0x080f20, rivet: 0x86b7f0, holeChance: 0.1, grate: 0x15233d,
    });
    const rows = Math.ceil(c.arenaH / 40);
    for (let r = 3; r < rows; r += 7) {
      const y = r * 40 + 16;
      g.rect(0, y - 2, c.arenaW, 12).fill({ color: 0x080f1e });
      g.rect(0, y + 1, c.arenaW, 6).fill({ color: 0x1b4d73 });
      for (let x = 24; x < c.arenaW; x += 80) g.rect(x, y - 4, 10, 16).fill({ color: 0x253d68 });
    }
    for (let i = 0; i < 5; i++) {
      const gx = 120 + Math.floor(c.rnd() * (c.arenaW - 240));
      const gy = 120 + Math.floor(c.rnd() * (c.arenaH - 240));
      g.circle(gx, gy, 46).fill({ color: 0x0b1428 });
      g.circle(gx, gy, 42).fill({ color: 0x294676 });
      g.circle(gx, gy, 30).stroke({ color: 0x4d75bb, width: 3 });
      g.circle(gx, gy, 18).fill({ color: 0x153657 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.rect(gx + Math.cos(a) * 36 - 2, gy + Math.sin(a) * 36 - 2, 4, 4).fill({ color: 0x8ab9ee });
      }
    }
    warningBorder(g, c, 0xf2c63d, 0x0c1428);
  },

  anim: (g, c, t, v) => {
    const rows = Math.ceil(c.arenaH / 40);
    for (let r = 3; r < rows; r += 7) {
      const y = r * 40 + 16;
      if (y < v.y0 - 20 || y > v.y1 + 20) continue;
      g.rect(v.x0, y + 2, v.x1 - v.x0, 2).fill({ color: 0x276e96 });
      flowX(v, 260, (t * 150) % 260, (x) => g.rect(x, y, 46, 6).fill({ color: 0xa7f3ff, alpha: 0.9 }));
    }
  },
};

// ---------------------------------------------------------------- 냉각 구획
const coolant: StageTheme = {
  id: 'ice',
  name: '냉각 구획',
  accent: 0x9fe7ff,

  far: (g, c) => {
    g.rect(0, 0, c.arenaW, c.arenaH).fill({ color: 0x08182d });
    for (let i = 0; i < 60; i++) {
      const x = c.rnd() * c.arenaW;
      const y = c.rnd() * c.arenaH;
      const w = 30 + c.rnd() * 90;
      g.rect(x, y, w, 6).fill({ color: 0x103154 });
      g.rect(x + 4, y + 1, Math.max(4, w - 12), 2).fill({ color: 0x286a98 });
    }
  },

  ground: (g, c) => {
    platedFloor(g, c, {
      tile: 44, plate: 0x76a9c7, lit: 0xc8ecff, dark: 0x3e6587,
      line: 0x102239, rivet: 0xeaf9ff, holeChance: 0.12, grate: 0x2a5677,
    });
    for (let i = 0; i < 22; i++) {
      const x = 60 + c.rnd() * (c.arenaW - 120);
      const y = 60 + c.rnd() * (c.arenaH - 120);
      const r = 12 + c.rnd() * 16;
      g.moveTo(x, y - r).lineTo(x + r * 0.7, y).lineTo(x, y + r).lineTo(x - r * 0.7, y).closePath();
      g.fill({ color: 0x25658f });
      g.moveTo(x, y - r + 5).lineTo(x + r * 0.38, y).lineTo(x, y + r - 6).lineTo(x - r * 0.38, y).closePath();
      g.fill({ color: 0x83d8f4 });
    }
    warningBorder(g, c, 0x73d6f6, 0x102b46);
  },

  anim: (g, _c, t, v) => {
    const w = v.x1 - v.x0;
    const h = v.y1 - v.y0;
    for (let i = 0; i < 70; i++) {
      const sx = ((i * 137.5) % 360) / 360;
      const sy = ((i * 71.3) % 360) / 360;
      const x = v.x0 + ((sx * w + t * (14 + (i % 5) * 7)) % w);
      const y = v.y0 + ((sy * h + t * (26 + (i % 3) * 12)) % h);
      g.rect(Math.round(x), Math.round(y), 2, 2).fill({ color: 0xe4f7ff, alpha: 0.52 });
    }
  },
};

// ---------------------------------------------------------------- 용광 구획
const foundry: StageTheme = {
  id: 'foundry',
  name: '용광 구획',
  accent: 0xff9a3c,

  far: (g, c) => {
    g.rect(0, 0, c.arenaW, c.arenaH).fill({ color: 0x240b06 });
    for (let i = 0; i < 90; i++) {
      const x = c.rnd() * c.arenaW;
      const y = c.rnd() * c.arenaH;
      const w = 40 + c.rnd() * 120;
      const h = 16 + c.rnd() * 30;
      g.rect(x, y, w, h).fill({ color: 0x6f2109 });
      g.rect(x + 4, y + 4, Math.max(4, w - 8), Math.max(4, h - 8)).fill({ color: 0xc74716 });
      g.rect(x + 10, y + 7, Math.max(4, w - 20), Math.max(3, h - 14)).fill({ color: 0xff9f32 });
    }
  },

  ground: (g, c) => {
    platedFloor(g, c, {
      tile: 40, plate: 0x513522, lit: 0x8b6340, dark: 0x2d1b10,
      line: 0x100805, rivet: 0xc28b52, holeChance: 0.14, grate: 0x28170e,
    });
    const cols = Math.ceil(c.arenaW / 40);
    for (let col = 3; col < cols; col += 6) {
      const x = col * 40 + 8;
      g.rect(x - 5, 0, 30, c.arenaH).fill({ color: 0x160b06 });
      g.rect(x, 0, 20, c.arenaH).fill({ color: 0x83300e });
    }
    warningBorder(g, c, 0xf1c33b, 0x28170e);
  },

  anim: (g, c, t, v) => {
    const cols = Math.ceil(c.arenaW / 40);
    for (let col = 3; col < cols; col += 6) {
      const x = col * 40 + 8;
      if (x < v.x0 - 40 || x > v.x1 + 40) continue;
      g.rect(x + 2, v.y0, 16, v.y1 - v.y0).fill({ color: 0xc94b17 });
      flowY(v, 90, (t * 70) % 90, (y) => g.rect(x + 3, y, 14, 38).fill({ color: 0xffc35d, alpha: 0.92 }));
    }
  },
};

// ---------------------------------------------------------------- 야간 고속도로
const highway: StageTheme = {
  id: 'highway',
  name: '야간 고속도로',
  accent: 0x70d4ff,

  far: (g, c) => {
    g.rect(0, 0, c.arenaW, c.arenaH).fill({ color: 0x040811 });
    for (let i = 0; i < 70; i++) {
      const x = c.rnd() * c.arenaW;
      const y = c.rnd() * c.arenaH;
      const w = 26 + c.rnd() * 40;
      const h = 40 + c.rnd() * 90;
      g.rect(x, y, w, h).fill({ color: 0x0b1428 });
      for (let wy = y + 5; wy < y + h - 4; wy += 9) {
        for (let wx = x + 4; wx < x + w - 4; wx += 8) {
          if (c.rnd() > 0.55) g.rect(wx, wy, 3, 4).fill({ color: c.rnd() > 0.7 ? 0xffe08a : 0x3e72b8 });
        }
      }
    }
  },

  ground: (g, c) => {
    platedFloor(g, c, {
      tile: 48, plate: 0x2b3245, lit: 0x515d74, dark: 0x171d2c,
      line: 0x080b13, rivet: 0x69748b, holeChance: 0.16, grate: 0x121824,
    });
    const rows = Math.ceil(c.arenaH / 48);
    for (let r = 2; r < rows; r += 5) {
      const y = r * 48 + 20;
      for (let x = 10; x < c.arenaW; x += 64) g.rect(x, y, 34, 5).fill({ color: 0xdedbc9 });
    }
    warningBorder(g, c, 0xe7bd46, 0x171d2c);
  },

  anim: (g, c, t, v) => {
    const rows = Math.ceil(c.arenaH / 48);
    for (let r = 2; r < rows; r += 5) {
      const y = r * 48 + 12;
      if (y < v.y0 - 30 || y > v.y1 + 30) continue;
      flowX(v, 520, (t * 320 + r * 130) % 520, (x) => {
        g.rect(x, y, 70, 3).fill({ color: 0x8fdcff, alpha: 0.42 });
        g.rect(x + 50, y - 1, 26, 5).fill({ color: 0xf4fbff, alpha: 0.72 });
      });
    }
  },
};

export const THEMES: StageTheme[] = [powerPlant, coolant, foundry, highway];

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
