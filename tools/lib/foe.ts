/**
 * 균열에서 나온 것들 — 개체(보스) 여덟과 잡몹 일곱.
 *
 * 대원과 같은 재질·명암 체계를 쓰되 몸은 공유하지 않는다. 대원은 아홉이
 * 한 골격을 나눠 써야 한 팀으로 보이지만, 개체는 반대로 저마다 달라야
 * 한다 — 실루엣이 겹치면 색만 바꾼 같은 적이 여덟 마리가 된다.
 *
 * 이번 조정의 기준은 하나다: 적은 디테일보다 실루엣과 발광점이 먼저 보여야 한다.
 */
import { F, M, bevel, type CrewPal } from './crewart.js';

export type FoeAct = 'idle' | 'move' | 'tell' | 'atk1' | 'atk2' | 'hurt';

export interface Anim {
  bob: number; lean: number; wind: number; strike: number; spin: number; hurt: number;
}

export interface FoeDef extends CrewPal {
  id: string;
  name: string;
  draw: (f: F, a: Anim) => void;
}

/** 발광 눈은 어두운 소켓 → 색면 → 1px 하이라이트 순서로 읽힌다. */
function eye(f: F, x: number, y: number, w: number, h: number, lid = 0): void {
  f.rect(x - 1, y - 1, w + 2, h + 2, M.trim);
  const hh = h - lid;
  if (hh <= 0) return;
  f.rect(x, y, w, hh, M.glow);
  if (w >= 7 && hh >= 3) f.rect(x + Math.floor(w / 2) - 1, y, 2, hh, M.trim);
  f.rect(x, y, 1, hh, M.accent);
  f.set(x + w - 1, y, M.spec);
}

function legJoint(f: F, hx: number, hy: number, fx: number, w: number): void {
  const kx = (hx + fx) / 2;
  f.line(hx, hy, kx, hy / 2 + 2, w, M.metal);
  f.line(kx, hy / 2 + 2, fx, 1, w - 1, M.metal);
  f.rect(fx - 2, 0, 5, 2, M.trim);
}

export const FOES: FoeDef[] = [
  {
    id: 'bolt_hand', name: '벼락손', suit: '#6b5a2a', metal: '#c9b45a', glow: '#ffe86b',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      for (const x of [-11, 8]) {
        f.rect(x, 0, 6, 9, M.trim); f.rect(x, 8, 6, 1, M.accent); f.rect(x, 3, 6, 1, M.metal);
      }
      f.rect(-15, 9 + b, 30, 15, M.suit); bevel(f, -15, 9 + b, 30, 15);
      f.rect(-15, 23 + b, 30, 1, M.metal);
      f.rect(-12, 11 + b, 24, 6, M.metal); f.rect(-12, 16 + b, 24, 1, M.accent);
      eye(f, -6, 12 + b, 12, 4, Math.round(a.hurt * 3));
      const up = Math.round(22 + a.wind * 8 - a.strike * 28);
      f.line(10, 20 + b, 16, 10 + up, 6, M.suit); f.line(11, 20 + b, 17, 10 + up, 2, M.trim);
      f.rect(6, 12 + up, 20, 13, M.metal); bevel(f, 6, 12 + up, 20, 13);
      f.rect(6, 12 + up, 20, 1, M.accent); f.rect(6, 19 + up, 20, 1, M.trim);
      for (const nx of [11, 16, 21]) { f.rect(nx, 12 + up, 1, 6, M.none); f.rect(nx - 1, 12 + up, 1, 6, M.trim); }
      f.rect(4, 20 + up, 4, 5, M.suit); f.rect(4, 24 + up, 4, 1, M.accent);
      f.line(-12, 20 + b, -18, 10 + b, 6, M.suit); f.rect(-22, 6 + b, 6, 6, M.metal);
    },
  },
  {
    id: 'water_shade', name: '물그림자', suit: '#17465b', metal: '#55b3c8', glow: '#8ef0e0',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      for (let i = 0; i <= 34; i++) {
        const t = i / 34;
        const half = Math.round(6 + 9 * Math.abs(Math.cos(t * Math.PI)) * (t > 0.5 ? 1 : 0.8));
        const sway = Math.round(Math.sin(t * 3.2 + a.spin * 6.28) * 2);
        f.rect(-half + sway, i + 3 + b, half * 2, 1, t > 0.62 ? M.suit : M.metal);
      }
      f.rect(-14, 0, 28, 3, M.trim); f.rect(-10, 2, 20, 1, M.metal);
      const hy = 28 + b;
      f.rect(-13, hy, 26, 1, M.accent); eye(f, -9, hy + 3, 7, 5, Math.round(a.hurt * 4)); eye(f, 3, hy + 3, 7, 5, Math.round(a.hurt * 4));
      const reach = Math.round(6 + a.strike * 16);
      f.line(-11, hy - 4, -11 - reach, hy - 10, 4, M.suit); f.line(11, hy - 4, 11 + reach, hy - 10, 4, M.suit);
      if (a.strike > 0) f.rect(11 + reach, hy - 12, 3, 4, M.glow);
    },
  },
  {
    id: 'saw_fang', name: '날톱', suit: '#3b2b58', metal: '#ae8ddd', glow: '#d09bff',
    draw: (f, a) => {
      const b = Math.round(a.bob), cy = 24 + b;
      const spread = Math.round(a.wind * 4 + a.strike * 9);
      for (const side of [-1, 1] as const) {
        const cx = side * (16 + spread);
        f.disc(cx, cy, 12, M.metal); f.disc(cx, cy, 7, M.suit); f.disc(cx, cy, 3, M.glow);
        for (let i = 0; i < 12; i++) { const ang = (i / 12 + a.spin) * Math.PI * 2; f.set(cx + Math.cos(ang) * 13, cy + Math.sin(ang) * 13, M.accent); f.set(cx + Math.cos(ang) * 12, cy + Math.sin(ang) * 12, M.accent); }
      }
      f.rect(-8, cy - 11, 16, 22, M.suit); bevel(f, -8, cy - 11, 16, 22); f.rect(-8, cy + 10, 16, 1, M.metal);
      f.rect(-6, cy - 2, 12, 7, M.metal); eye(f, -5, cy - 1, 10, 5, Math.round(a.hurt * 4));
      legJoint(f, -5, cy - 11, -8, 5); legJoint(f, 5, cy - 11, 8, 5);
    },
  },
  {
    id: 'forge_core', name: '화로', suit: '#5e2b1a', metal: '#b87945', glow: '#ff8a3c',
    draw: (f, a) => {
      const b = Math.round(a.bob), push = Math.round(a.strike * 6 - a.wind * 4);
      for (const [hx, fx] of [[-11, -15], [10, 15]] as const) legJoint(f, hx + push, 14, fx + push, 6);
      for (const [hx, fx] of [[-4, -6], [4, 7]] as const) legJoint(f, hx + push, 12, fx + push, 4);
      f.rect(-15 + push, 14 + b, 30, 18, M.suit); bevel(f, -15 + push, 14 + b, 30, 18);
      f.rect(-15 + push, 31 + b, 30, 1, M.metal); f.rect(-10 + push, 15 + b, 20, 11, M.trim);
      f.rect(-9 + push, 16 + b, 18, 9, M.glow); f.rect(-6 + push, 19 + b, 12, 3, M.accent);
      eye(f, -7 + push, 27 + b, 14, 3, Math.round(a.hurt * 2));
      for (const x of [3, 9]) { f.rect(x + push, 32 + b, 5, 8, M.metal); f.rect(x + push, 39 + b, 5, 1, M.accent); }
    },
  },
  {
    id: 'shell_wall', name: '껍데기', suit: '#1f4764', metal: '#78b9e0', glow: '#70d4ff',
    draw: (f, a) => {
      const b = Math.round(a.bob), open = Math.round((1 - a.wind) * 7);
      for (const [hx, fx] of [[-12, -18], [12, 18]] as const) legJoint(f, hx, 9 - open, fx, 6);
      if (open > 1) { f.rect(13, 6 + b, 9, 7, M.metal); f.rect(13, 12 + b, 9, 1, M.accent); eye(f, 16, 8 + b, 5, 4, Math.round(a.hurt * 3)); }
      f.rect(-14, 5 + b, 28, 5, M.metal); f.rect(-14, 5 + b, 28, 1, M.accent);
      for (let i = 0; i < 22; i++) { const t = i / 21; const half = Math.round(14 * Math.sqrt(Math.max(0, 1 - t * t))); f.rect(-half, 10 + i + b - open, half * 2, 1, i % 5 === 4 ? M.metal : M.suit); }
      f.rect(-14, 10 + b - open, 28, 1, M.accent);
      if (open > 1) f.rect(-9, 9 + b, 18, open, M.trim);
      if (a.strike > 0) f.rect(-5, 10 + b, 10, Math.round(6 + a.strike * 14), M.glow);
    },
  },
  {
    id: 'edge_gale', name: '칼바람', suit: '#5e2040', metal: '#df8bad', glow: '#ff5c9c',
    draw: (f, a) => {
      const b = Math.round(a.bob), lean = Math.round(a.lean + a.strike * 6 - a.wind * 4);
      f.rect(-7 + lean, 0, 14, 3, M.trim);
      for (let i = 0; i < 16; i++) { const t = i / 15; const half = Math.round(1 + t * 8); f.rect(-half + lean, i + 2 + b, half * 2, 1, M.suit); }
      f.rect(-9 + lean, 18 + b, 18, 14, M.suit); bevel(f, -9 + lean, 18 + b, 18, 14); f.rect(-9 + lean, 31 + b, 18, 1, M.metal);
      f.rect(-6 + lean, 21 + b, 12, 7, M.metal); eye(f, -5 + lean, 22 + b, 10, 5, Math.round(a.hurt * 4));
      f.rect(-4 + lean, 32 + b, 8, 4, M.metal); f.rect(-4 + lean, 35 + b, 2, 5, M.accent); f.rect(2 + lean, 35 + b, 2, 5, M.accent);
      const sw = Math.round(9 - a.strike * 6 + a.wind * 4);
      for (const side of [-1, 1] as const) {
        const sx = lean + side * 9;
        f.line(sx, 28 + b, sx + side * sw, 24 + b, 5, M.suit);
        for (let i = 0; i < 14; i++) { const t = i / 13; const bx = sx + side * (sw + i); const by = 24 + b + Math.round(i * 0.7); const th = Math.max(1, Math.round(4 - t * 3)); f.rect(side < 0 ? bx - th + 1 : bx, by, th, 1, M.metal); if (i < 11) f.set(bx, by + 1, M.glow); }
      }
    },
  },
  {
    id: 'frost_eye', name: '서릿눈', suit: '#294b70', metal: '#b8deef', glow: '#e1f7ff',
    draw: (f, a) => {
      const b = Math.round(a.bob), cy = 30 + b;
      for (const [hx, fx] of [[-11, -16], [0, 0], [11, 16]] as const) legJoint(f, hx, cy - 13, fx, 4);
      f.disc(0, cy, 16, M.suit); f.disc(0, cy, 13, M.metal);
      const shrink = Math.round(a.wind * 4); f.disc(0, cy, 9 - shrink, M.trim); f.disc(0, cy, 6 - shrink, M.glow); f.disc(1, cy + 1, 2, M.accent);
      f.rect(-16, cy + 11, 32, 1, M.accent); f.rect(-16, cy - 12, 32, 1, M.accent);
      if (a.hurt > 0.5) f.rect(-14, cy - 3, 28, 7, M.trim);
      if (a.strike > 0) f.rect(13, cy - 1, Math.round(a.strike * 18), 3, M.glow);
    },
  },
  {
    id: 'flame_ring', name: '불고리', suit: '#6b2226', metal: '#d97b5c', glow: '#ff6260',
    draw: (f, a) => {
      const b = Math.round(a.bob), cy = 26 + b;
      f.disc(0, cy, 15, M.suit); f.disc(0, cy, 11, M.metal); f.rect(-15, cy, 30, 1, M.accent); f.rect(-11, cy - 11, 22, 1, M.accent);
      eye(f, -7, cy - 3, 14, 7, Math.round(a.hurt * 5));
      const r = 24 + a.wind * 4 + a.strike * 10;
      for (let i = 0; i < 5; i++) { const ang = (i / 5 + a.spin) * Math.PI * 2; const ox = Math.cos(ang) * r; const oy = cy + Math.sin(ang) * r * 0.85; f.disc(ox, oy, 5, M.metal); f.disc(ox, oy, 3, M.glow); }
      f.rect(-8, 0, 16, 2, M.trim);
    },
  },
];

export type MobKind = 'walker' | 'hover' | 'crawler' | 'turret' | 'hopper' | 'drone' | 'biter';

export const MOB_DRAWERS: Record<MobKind, (f: F, phase: number) => void> = {
  walker: (f, ph) => {
    const swing = Math.round(Math.sin(ph * Math.PI * 2) * 3), bob = Math.round(Math.abs(Math.cos(ph * Math.PI * 2)));
    f.rect(-7 + swing, 0, 5, 7, M.trim); f.rect(2 - swing, 0, 5, 7, M.trim);
    const by = 6 + bob; f.rect(-9, by, 18, 14, M.suit); bevel(f, -9, by, 18, 14); f.rect(-9, by, 18, 1, M.metal);
    for (let i = -6; i <= 6; i += 4) f.rect(i, by + 2, 1, 2, M.metal); eye(f, -4, by + 5, 8, 4);
    f.rect(0, by + 14, 1, 4, M.metal); f.rect(-1, by + 18, 3, 2, M.accent);
  },
  hover: (f, ph) => {
    const y = 8 + Math.round(Math.sin(ph * Math.PI * 2) * 2); f.disc(0, y + 9, 11, M.suit); f.disc(0, y + 9, 8, M.metal); eye(f, -5, y + 7, 10, 5);
    f.rect(-13, y + 2, 26, 2, M.metal); f.rect(-11, y + 1, 22, 1, M.accent); for (let i = 0; i < 3; i++) f.rect(-2 + i * 2, y - 2 - i, 1, 1, M.glow);
  },
  crawler: (f, ph) => {
    for (let i = 0; i < 6; i++) { const x = -13 + i * 5; const lift = Math.round(Math.sin(ph * Math.PI * 2 + i * 0.9) * 2); f.rect(x, 3 + lift, 6, 7, i === 5 ? M.metal : M.suit); f.rect(x, 9 + lift, 6, 1, M.metal); f.rect(x + 1, 0, 2, 4 + lift, M.trim); }
    eye(f, 10, 5, 5, 4); f.rect(13, 8, 3, 1, M.accent);
  },
  turret: (f, ph) => {
    const rec = Math.round(Math.abs(Math.sin(ph * Math.PI * 2)) * 2); f.rect(-8, 0, 16, 6, M.trim); f.rect(-6, 5, 12, 10, M.suit); bevel(f, -6, 5, 12, 10); eye(f, -4, 8, 8, 4); f.rect(5 - rec, 9, 10, 3, M.metal); f.rect(14 - rec, 9, 2, 3, M.glow);
  },
  hopper: (f, ph) => {
    const crouch = Math.round(Math.max(0, Math.sin(ph * Math.PI * 2)) * 3); f.rect(-7, 0, 5, 4 + crouch, M.trim); f.rect(2, 0, 5, 4 + crouch, M.trim);
    const by = 5 + crouch; f.disc(0, by + 6, 8, M.suit); f.disc(0, by + 6, 5, M.metal); eye(f, -4, by + 5, 8, 4); f.rect(-1, by + 13, 2, 4, M.accent);
  },
  drone: (f, ph) => {
    const y = 12 + Math.round(Math.sin(ph * Math.PI * 2) * 2); f.rect(-11, y + 9, 22, 2, M.metal); f.rect(-2, y + 8, 4, 2, M.trim); f.rect(-7, y, 14, 9, M.suit); bevel(f, -7, y, 14, 9); f.rect(-7, y, 14, 1, M.metal); eye(f, -5, y + 3, 10, 4); f.rect(6, y + 3, 11, 3, M.metal); f.rect(16, y + 3, 2, 3, M.glow); f.rect(-4, y - 3, 3, 3, M.trim); f.rect(2, y - 3, 3, 3, M.trim);
  },
  biter: (f, ph) => {
    const gap = Math.round(Math.max(0, Math.sin(ph * Math.PI * 2)) * 4), step = Math.round(Math.cos(ph * Math.PI * 2) * 2);
    for (const [x, d] of [[-9, 1], [-3, -1], [4, 1], [9, -1]] as const) f.rect(x + step * d, 0, 3, 5, M.trim);
    f.rect(-11, 4, 20, 9, M.suit); bevel(f, -11, 4, 20, 9); f.rect(-11, 12, 20, 1, M.metal); eye(f, -6, 7, 5, 3);
    f.rect(6, 8 + gap, 11, 3, M.metal); f.rect(6, 4 - gap, 11, 3, M.metal);
    for (let i = 0; i < 4; i++) { f.rect(8 + i * 2, 7 + gap, 1, 1, M.accent); f.rect(8 + i * 2, 6 - gap, 1, 1, M.accent); }
  },
};

export interface MobDef extends CrewPal { id: string; name: string; kind: MobKind }

export const MOBS: MobDef[] = [
  { id: 'walker', name: '걷는것', kind: 'walker', suit: '#4d4026', metal: '#b9a56e', glow: '#ffd86b' },
  { id: 'hover', name: '뜬것', kind: 'hover', suit: '#244b63', metal: '#83c2df', glow: '#7fe2ff' },
  { id: 'crawler', name: '기는것', kind: 'crawler', suit: '#3b2b4e', metal: '#a184ba', glow: '#d09bff' },
  { id: 'wall_turret', name: '박힌것', kind: 'turret', suit: '#4d292d', metal: '#bd858a', glow: '#ff806a' },
  { id: 'hopper', name: '뛰는것', kind: 'hopper', suit: '#2f472e', metal: '#91bc86', glow: '#adff72' },
  { id: 'sniper_drone', name: '노리는것', kind: 'drone', suit: '#34394c', metal: '#a2a8c0', glow: '#e3f7ff' },
  { id: 'biter', name: '무는것', kind: 'biter', suit: '#5d2d1e', metal: '#c78f5e', glow: '#ff9a55' },
];
