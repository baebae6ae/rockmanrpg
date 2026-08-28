/**
 * 균열에서 나온 것들 — 개체(보스) 여덟과 잡몹 여섯.
 *
 * 대원과 같은 재질·명암 체계를 쓰되 몸은 공유하지 않는다. 대원은 아홉이
 * 한 골격을 나눠 써야 한 팀으로 보이지만, 개체는 반대로 저마다 달라야
 * 한다 — 실루엣이 겹치면 색만 바꾼 같은 적이 여덟 마리가 된다.
 *
 * 그래서 골격 대신 '연출값'만 공유한다. 웅크렸다 펴는 정도, 앞으로
 * 나가는 정도 같은 것만 공통으로 받고 몸은 각자 그린다.
 */
import { F, M, bevel, type CrewPal } from './crewart.js';

export type FoeAct = 'idle' | 'move' | 'tell' | 'atk1' | 'atk2' | 'hurt';

/**
 * 연출값. 개체마다 쓰는 것만 골라 쓴다.
 *   bob    숨쉬기·걸음의 상하        lean   앞뒤 기울기
 *   wind   예비동작(뒤로 당김) 0~1   strike 타격(앞으로 뻗음) 0~1
 *   spin   회전 위상 0~1             hurt   피격 0~1
 */
export interface Anim {
  bob: number; lean: number; wind: number; strike: number; spin: number; hurt: number;
}

export interface FoeDef extends CrewPal {
  id: string;
  name: string;
  draw: (f: F, a: Anim) => void;
}

// ---------------------------------------------------------------- 공용 조각
/**
 * 눈 — 개체는 얼굴이 없다. 빛나는 눈 하나가 표정의 전부다.
 *
 * 밝은 사각형만 채우면 눈이 아니라 켜진 모니터로 보인다. 어두운 눈구멍을
 * 한 겹 두르고 가운데에 동공을 세워야 이쪽을 보는 것으로 읽힌다.
 */
function eye(f: F, x: number, y: number, w: number, h: number, lid = 0): void {
  f.rect(x - 1, y - 1, w + 2, h + 2, M.trim);
  const hh = h - lid;
  if (hh <= 0) return;
  f.rect(x, y, w, hh, M.glow);
  if (w >= 7 && hh >= 3) f.rect(x + Math.floor(w / 2) - 1, y, 2, hh, M.trim);
  f.rect(x, y, 1, hh, M.accent);
}

/** 관절 다리 — 짧고 굵은 것 하나. 개체 여럿이 돌려 쓴다 */
function legJoint(f: F, hx: number, hy: number, fx: number, w: number): void {
  const kx = (hx + fx) / 2;
  f.line(hx, hy, kx, hy / 2 + 2, w, M.metal);
  f.line(kx, hy / 2 + 2, fx, 1, w - 1, M.metal);
  f.rect(fx - 2, 0, 5, 2, M.trim);
}

// ---------------------------------------------------------------- 개체 여덟
export const FOES: FoeDef[] = [
  {
    // 벼락손 — 몸이 거의 팔이다. 치켜든 주먹을 내리쳐 땅에 전격을 흘린다
    id: 'bolt_hand', name: '벼락손',
    suit: '#6b5a2a', metal: '#c9b45a', glow: '#ffe86b',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      for (const x of [-11, 8]) {                       // 짧고 굵은 두 다리
        f.rect(x, 0, 6, 9, M.trim);
        f.rect(x, 8, 6, 1, M.accent);
        f.rect(x, 3, 6, 1, M.metal);
      }
      f.rect(-15, 9 + b, 30, 15, M.suit);               // 넓게 앉은 몸통
      bevel(f, -15, 9 + b, 30, 15);
      f.rect(-15, 23 + b, 30, 1, M.metal);
      f.rect(-12, 11 + b, 24, 6, M.metal);              // 눈이 박힌 판
      f.rect(-12, 16 + b, 24, 1, M.accent);
      eye(f, -6, 12 + b, 12, 4, Math.round(a.hurt * 3));
      // 치켜든 팔 — 예비동작에 더 높이 올라갔다가 타격에 내리꽂힌다.
      // 이 개체의 실루엣은 사실상 이 주먹 하나로 결정된다
      const up = Math.round(22 + a.wind * 8 - a.strike * 28);
      f.line(10, 20 + b, 16, 10 + up, 6, M.suit);       // 가는 팔 — 굵으면
      f.line(11, 20 + b, 17, 10 + up, 2, M.trim);       // 주먹과 한 덩어리가 된다
      // 주먹은 덩어리로만 두면 목 위에 얹힌 머리로 읽힌다. 아래쪽에
      // 손가락 사이를 실제로 파내야 손으로 보인다 — 40px 에서 손을
      // 손으로 만드는 건 마디선이 아니라 이 홈이다
      f.rect(6, 12 + up, 20, 13, M.metal);
      bevel(f, 6, 12 + up, 20, 13);
      f.rect(6, 12 + up, 20, 1, M.accent);
      f.rect(6, 19 + up, 20, 1, M.trim);
      for (const nx of [11, 16, 21]) {
        f.rect(nx, 12 + up, 1, 6, M.none);
        f.rect(nx - 1, 12 + up, 1, 6, M.trim);
      }
      f.rect(4, 20 + up, 4, 5, M.suit);                 // 엄지
      f.rect(4, 24 + up, 4, 1, M.accent);
      f.line(-12, 20 + b, -18, 10 + b, 6, M.suit);      // 짧은 반대편 팔
      f.rect(-22, 6 + b, 6, 6, M.metal);
    },
  },
  {
    // 물그림자 — 발이 없다. 흘러다니다 사라지고 다른 데서 맺힌다.
    // 위아래로 퍼지고 허리가 잘록해야 물덩이가 아니라 몸으로 읽힌다
    id: 'water_shade', name: '물그림자',
    suit: '#1e4a52', metal: '#5aa8b4', glow: '#8ef0e0',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      for (let i = 0; i <= 34; i++) {                   // 허리가 잘록한 기둥
        const t = i / 34;
        const half = Math.round(6 + 9 * Math.abs(Math.cos(t * Math.PI)) * (t > 0.5 ? 1 : 0.8));
        const sway = Math.round(Math.sin(t * 3.2 + a.spin * 6.28) * 2);
        f.rect(-half + sway, i + 3 + b, half * 2, 1, t > 0.62 ? M.suit : M.metal);
      }
      f.rect(-14, 0, 28, 3, M.trim);                    // 발밑에 고인 물
      f.rect(-10, 2, 20, 1, M.metal);
      const hy = 28 + b;                                // 머리
      f.rect(-13, hy, 26, 1, M.accent);
      eye(f, -9, hy + 3, 7, 5, Math.round(a.hurt * 4));
      eye(f, 3, hy + 3, 7, 5, Math.round(a.hurt * 4));
      // 어깨에서 뻗은 두 갈래 — 타격 때 앞으로 길게 뻗는다
      const reach = Math.round(6 + a.strike * 16);
      f.line(-11, hy - 4, -11 - reach, hy - 10, 4, M.suit);
      f.line(11, hy - 4, 11 + reach, hy - 10, 4, M.suit);
      if (a.strike > 0) f.rect(11 + reach, hy - 12, 3, 4, M.glow);
    },
  },
  {
    // 날톱 — 몸통은 작고 양옆 톱날이 실루엣을 만든다
    id: 'saw_fang', name: '날톱',
    suit: '#43305e', metal: '#a98ad0', glow: '#c98cff',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      const cy = 24 + b;
      const spread = Math.round(a.wind * 4 + a.strike * 9);
      for (const side of [-1, 1] as const) {
        const cx = side * (16 + spread);
        f.disc(cx, cy, 12, M.metal);                    // 원반
        f.disc(cx, cy, 7, M.suit);
        f.disc(cx, cy, 3, M.glow);
        for (let i = 0; i < 12; i++) {                  // 톱니 — 회전을 보인다
          const ang = (i / 12 + a.spin) * Math.PI * 2;
          f.set(cx + Math.cos(ang) * 13, cy + Math.sin(ang) * 13, M.accent);
          f.set(cx + Math.cos(ang) * 12, cy + Math.sin(ang) * 12, M.accent);
        }
      }
      f.rect(-8, cy - 11, 16, 22, M.suit);              // 몸통
      bevel(f, -8, cy - 11, 16, 22);
      f.rect(-8, cy + 10, 16, 1, M.metal);
      f.rect(-6, cy - 2, 12, 7, M.metal);
      eye(f, -5, cy - 1, 10, 5, Math.round(a.hurt * 4));
      legJoint(f, -5, cy - 11, -8, 5);
      legJoint(f, 5, cy - 11, 8, 5);
    },
  },
  {
    // 화로 — 배가 뚫려 있고 안이 벌겋다. 달군 몸으로 들이받는다
    id: 'forge_core', name: '화로',
    suit: '#5e2f1e', metal: '#b07a4a', glow: '#ff8a3c',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      const push = Math.round(a.strike * 6 - a.wind * 4);
      // 앞다리는 앞으로, 뒷다리는 뒤로 벌린다. 넷 다 수직으로 세우면
      // 다리가 아니라 상자 밑에 댄 기둥으로 보인다
      for (const [hx, fx] of [[-11, -15], [10, 15]] as const) {
        legJoint(f, hx + push, 14, fx + push, 6);
      }
      for (const [hx, fx] of [[-4, -6], [4, 7]] as const) {
        legJoint(f, hx + push, 12, fx + push, 4);
      }
      f.rect(-15 + push, 14 + b, 30, 18, M.suit);       // 몸통
      bevel(f, -15 + push, 14 + b, 30, 18);
      f.rect(-15 + push, 31 + b, 30, 1, M.metal);
      f.rect(-10 + push, 15 + b, 20, 11, M.trim);       // 뚫린 배
      f.rect(-9 + push, 16 + b, 18, 9, M.glow);
      f.rect(-6 + push, 19 + b, 12, 3, M.accent);
      eye(f, -7 + push, 27 + b, 14, 3, Math.round(a.hurt * 2));
      for (const x of [3, 9]) {                         // 굴뚝 둘
        f.rect(x + push, 32 + b, 5, 8, M.metal);
        f.rect(x + push, 39 + b, 5, 1, M.accent);
      }
    },
  },
  {
    // 껍데기 — 웅크리면 완전히 닫힌다. 닫힌 동안은 아무것도 안 통한다
    id: 'shell_wall', name: '껍데기',
    suit: '#24455e', metal: '#7fb4d8', glow: '#6ec8ff',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      const open = Math.round((1 - a.wind) * 7);        // wind 1 이면 완전히 닫힘
      for (const [hx, fx] of [[-12, -18], [12, 18]] as const) {
        legJoint(f, hx, 9 - open, fx, 6);      // 껍질 밖으로 뻗은 다리
      }
      if (open > 1) {                          // 열렸을 때만 목이 나온다
        f.rect(13, 6 + b, 9, 7, M.metal);
        f.rect(13, 12 + b, 9, 1, M.accent);
        eye(f, 16, 8 + b, 5, 4, Math.round(a.hurt * 3));
      }
      f.rect(-14, 5 + b, 28, 5, M.metal);               // 아래 껍질
      f.rect(-14, 5 + b, 28, 1, M.accent);
      for (let i = 0; i < 22; i++) {                    // 높이 솟은 등딱지
        const t = i / 21;
        const half = Math.round(14 * Math.sqrt(Math.max(0, 1 - t * t)));
        f.rect(-half, 10 + i + b - open, half * 2, 1, i % 5 === 4 ? M.metal : M.suit);
      }
      f.rect(-14, 10 + b - open, 28, 1, M.accent);
      if (open > 1) f.rect(-9, 9 + b, 18, open, M.trim);
      if (a.strike > 0) f.rect(-5, 10 + b, 10, Math.round(6 + a.strike * 14), M.glow);
    },
  },
  {
    // 칼바람 — 팔이 그대로 칼이다. 다리를 안 준다. 사람 형태를 주면
    // 대원과 헷갈리고, 균열에서 나온 것으로 안 보인다
    id: 'edge_gale', name: '칼바람',
    suit: '#5e2440', metal: '#d88aa8', glow: '#ff5c9c',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      const lean = Math.round(a.lean + a.strike * 6 - a.wind * 4);
      f.rect(-7 + lean, 0, 14, 3, M.trim);              // 바닥에 닿은 꼬리 끝
      for (let i = 0; i < 16; i++) {                    // 아래로 뾰족해지는 하체
        const t = i / 15;
        const half = Math.round(1 + t * 8);
        f.rect(-half + lean, i + 2 + b, half * 2, 1, M.suit);
      }
      f.rect(-9 + lean, 18 + b, 18, 14, M.suit);        // 가슴
      bevel(f, -9 + lean, 18 + b, 18, 14);
      f.rect(-9 + lean, 31 + b, 18, 1, M.metal);
      f.rect(-6 + lean, 21 + b, 12, 7, M.metal);
      eye(f, -5 + lean, 22 + b, 10, 5, Math.round(a.hurt * 4));
      f.rect(-4 + lean, 32 + b, 8, 4, M.metal);         // 뿔 둘
      f.rect(-4 + lean, 35 + b, 2, 5, M.accent);
      f.rect(2 + lean, 35 + b, 2, 5, M.accent);
      // 양팔 칼날 — 예비동작에 벌리고 타격에 모은다
      const sw = Math.round(9 - a.strike * 6 + a.wind * 4);
      for (const side of [-1, 1] as const) {
        const sx = lean + side * 9;
        f.line(sx, 28 + b, sx + side * sw, 24 + b, 5, M.suit);
        // 날은 끝으로 갈수록 얇아져야 칼이다. 굵기가 일정하면 날개가 된다
        for (let i = 0; i < 14; i++) {
          const t = i / 13;
          const bx = sx + side * (sw + i);
          const by = 24 + b + Math.round(i * 0.7);
          const th = Math.max(1, Math.round(4 - t * 3));
          f.rect(side < 0 ? bx - th + 1 : bx, by, th, 1, M.metal);
          if (i < 11) f.set(bx, by + 1, M.glow);
        }
      }
    },
  },
  {
    // 서릿눈 — 몸이 눈알 하나다. 조준선을 긋고 한 발만 쏜다
    id: 'frost_eye', name: '서릿눈',
    suit: '#2e4a6b', metal: '#b8d8ec', glow: '#dcf4ff',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      const cy = 30 + b;
      for (const [hx, fx] of [[-11, -16], [0, 0], [11, 16]] as const) {
        legJoint(f, hx, cy - 13, fx, 4);
      }
      f.disc(0, cy, 16, M.suit);                        // 구체
      f.disc(0, cy, 13, M.metal);
      const shrink = Math.round(a.wind * 4);            // 조준하면 동공이 좁아진다
      f.disc(0, cy, 9 - shrink, M.trim);
      f.disc(0, cy, 6 - shrink, M.glow);
      f.disc(1, cy + 1, 2, M.accent);
      f.rect(-16, cy + 11, 32, 1, M.accent);            // 눈꺼풀 테
      f.rect(-16, cy - 12, 32, 1, M.accent);
      if (a.hurt > 0.5) f.rect(-14, cy - 3, 28, 7, M.trim);
      if (a.strike > 0) f.rect(13, cy - 1, Math.round(a.strike * 18), 3, M.glow);
    },
  },
  {
    // 불고리 — 몸통 주위를 불덩이가 돈다. 예비동작에 고리가 벌어졌다가
    // 타격에 사방으로 튀어나간다
    id: 'flame_ring', name: '불고리',
    suit: '#6b2424', metal: '#d87a5a', glow: '#ff5c5c',
    draw: (f, a) => {
      const b = Math.round(a.bob);
      const cy = 26 + b;
      f.disc(0, cy, 15, M.suit);
      f.disc(0, cy, 11, M.metal);
      f.rect(-15, cy, 30, 1, M.accent);
      f.rect(-11, cy - 11, 22, 1, M.accent);
      eye(f, -7, cy - 3, 14, 7, Math.round(a.hurt * 5));
      const r = 24 + a.wind * 4 + a.strike * 10;
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5 + a.spin) * Math.PI * 2;
        const ox = Math.cos(ang) * r;
        const oy = cy + Math.sin(ang) * r * 0.85;
        f.disc(ox, oy, 5, M.metal);
        f.disc(ox, oy, 3, M.glow);
      }
      f.rect(-8, 0, 16, 2, M.trim);                     // 떠 있는 그림자
    },
  },
];

// ---------------------------------------------------------------- 잡몹 여섯
export type MobKind = 'walker' | 'hover' | 'crawler' | 'turret' | 'hopper' | 'drone' | 'biter';

/**
 * 잡몹은 개체와 달리 한눈에 종류만 구분되면 된다. 화면에 수십 마리가
 * 동시에 나오므로 디테일을 올리면 알아보기 더 어려워진다 — 실루엣과
 * 눈 색만 확실히 다르게 잡는다.
 */
export const MOB_DRAWERS: Record<MobKind, (f: F, phase: number) => void> = {
  walker: (f, ph) => {
    const swing = Math.round(Math.sin(ph * Math.PI * 2) * 3);
    const bob = Math.round(Math.abs(Math.cos(ph * Math.PI * 2)));
    f.rect(-7 + swing, 0, 5, 7, M.trim);
    f.rect(2 - swing, 0, 5, 7, M.trim);
    const by = 6 + bob;
    f.rect(-9, by, 18, 14, M.suit);
    bevel(f, -9, by, 18, 14);
    f.rect(-9, by, 18, 1, M.metal);
    for (let i = -6; i <= 6; i += 4) f.rect(i, by + 2, 1, 2, M.metal);
    eye(f, -4, by + 5, 8, 4);
    f.rect(0, by + 14, 1, 4, M.metal);
    f.rect(-1, by + 18, 3, 2, M.accent);
  },
  hover: (f, ph) => {
    const y = 8 + Math.round(Math.sin(ph * Math.PI * 2) * 2);
    f.disc(0, y + 9, 11, M.suit);
    f.disc(0, y + 9, 8, M.metal);
    eye(f, -5, y + 7, 10, 5);
    f.rect(-13, y + 2, 26, 2, M.metal);
    f.rect(-11, y + 1, 22, 1, M.accent);
    for (let i = 0; i < 3; i++) f.rect(-2 + i * 2, y - 2 - i, 1, 1, M.glow);
  },
  crawler: (f, ph) => {
    // 마디가 떨어져 있으면 벌레가 아니라 흩어진 조각으로 보인다.
    // 겹치게 이어 붙이고 다리를 달아야 한 마리로 읽힌다
    for (let i = 0; i < 6; i++) {
      const x = -13 + i * 5;
      const lift = Math.round(Math.sin(ph * Math.PI * 2 + i * 0.9) * 2);
      f.rect(x, 3 + lift, 6, 7, i === 5 ? M.metal : M.suit);
      f.rect(x, 9 + lift, 6, 1, M.metal);
      f.rect(x + 1, 0, 2, 4 + lift, M.trim);
    }
    eye(f, 10, 5, 5, 4);
    f.rect(13, 8, 3, 1, M.accent);
  },
  turret: (f, ph) => {
    const rec = Math.round(Math.abs(Math.sin(ph * Math.PI * 2)) * 2);
    f.rect(-8, 0, 16, 6, M.trim);
    f.rect(-6, 5, 12, 10, M.suit);
    bevel(f, -6, 5, 12, 10);
    eye(f, -4, 8, 8, 4);
    f.rect(5 - rec, 9, 10, 3, M.metal);
    f.rect(14 - rec, 9, 2, 3, M.glow);
  },
  hopper: (f, ph) => {
    const crouch = Math.round(Math.max(0, Math.sin(ph * Math.PI * 2)) * 3);
    f.rect(-7, 0, 5, 4 + crouch, M.trim);
    f.rect(2, 0, 5, 4 + crouch, M.trim);
    const by = 5 + crouch;
    f.disc(0, by + 6, 8, M.suit);
    f.disc(0, by + 6, 5, M.metal);
    eye(f, -4, by + 5, 8, 4);
    f.rect(-1, by + 13, 2, 4, M.accent);
  },
  drone: (f, ph) => {
    const y = 12 + Math.round(Math.sin(ph * Math.PI * 2) * 2);
    f.rect(-11, y + 9, 22, 2, M.metal);           // 로터
    f.rect(-2, y + 8, 4, 2, M.trim);
    f.rect(-7, y, 14, 9, M.suit);                 // 동체
    bevel(f, -7, y, 14, 9);
    f.rect(-7, y, 14, 1, M.metal);
    eye(f, -5, y + 3, 10, 4);
    f.rect(6, y + 3, 11, 3, M.metal);             // 긴 총열
    f.rect(16, y + 3, 2, 3, M.glow);
    f.rect(-4, y - 3, 3, 3, M.trim);              // 늘어뜨린 다리
    f.rect(2, y - 3, 3, 3, M.trim);
  },
  biter: (f, ph) => {
    // 낮고 빠르다. 무는 놈이라 실루엣의 절반이 턱이다
    const gap = Math.round(Math.max(0, Math.sin(ph * Math.PI * 2)) * 4);
    const step = Math.round(Math.cos(ph * Math.PI * 2) * 2);
    for (const [x, d] of [[-9, 1], [-3, -1], [4, 1], [9, -1]] as const) {
      f.rect(x + step * d, 0, 3, 5, M.trim);
    }
    f.rect(-11, 4, 20, 9, M.suit);
    bevel(f, -11, 4, 20, 9);
    f.rect(-11, 12, 20, 1, M.metal);
    eye(f, -6, 7, 5, 3);
    f.rect(6, 8 + gap, 11, 3, M.metal);          // 윗턱
    f.rect(6, 4 - gap, 11, 3, M.metal);          // 아랫턱
    for (let i = 0; i < 4; i++) {                // 이빨
      f.rect(8 + i * 2, 7 + gap, 1, 1, M.accent);
      f.rect(8 + i * 2, 6 - gap, 1, 1, M.accent);
    }
  },
};

export interface MobDef extends CrewPal { id: string; name: string; kind: MobKind }

export const MOBS: MobDef[] = [
  { id: 'walker', name: '걷는것', kind: 'walker', suit: '#4a4030', metal: '#b0a075', glow: '#ffd06b' },
  { id: 'hover', name: '뜬것', kind: 'hover', suit: '#2f4a5e', metal: '#8ab4cc', glow: '#7cd8ff' },
  { id: 'crawler', name: '기는것', kind: 'crawler', suit: '#3f2f4a', metal: '#9a7fae', glow: '#c98cff' },
  { id: 'wall_turret', name: '박힌것', kind: 'turret', suit: '#4a3030', metal: '#b08080', glow: '#ff7a5a' },
  { id: 'hopper', name: '뛰는것', kind: 'hopper', suit: '#30452f', metal: '#88b080', glow: '#a8ff6b' },
  { id: 'sniper_drone', name: '노리는것', kind: 'drone', suit: '#3a3a4a', metal: '#9a9ab0', glow: '#dcf4ff' },
  { id: 'biter', name: '무는것', kind: 'biter', suit: '#5e3020', metal: '#c08a5a', glow: '#ff8a44' },
];
