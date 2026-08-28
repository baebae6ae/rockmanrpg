/**
 * 임시 도트 생성기 — docs/DESIGN.md §5.2 정규화 규격에 맞는 스프라이트 시트를 만든다.
 *
 * 진짜 스프라이트가 준비되기 전까지 개발을 진행하기 위한 것이며,
 * 출력 규격이 임포터의 출력과 동일하므로 나중에 파일 교체만으로 대체된다.
 *
 *   - 캔버스        64×64 고정
 *   - 정렬 기준     발바닥 하단 중앙 (32, 63)
 *   - 배치          균일 격자, 8열
 *
 * 실행: npm run gen:placeholder
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { F, paint } from './lib/crewart.js';
import { CREW, drawCrew } from './lib/crew.js';
import { crewTags } from './lib/crewanim.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_CHARS = resolve(ROOT, 'assets/generated/characters');
const OUT_ENEMIES = resolve(ROOT, 'assets/generated/enemies');

const CANVAS = 64;
const COLUMNS = 8;
const ORIGIN_X = 32; // 캔버스 중앙
const ORIGIN_Y = 63; // 캔버스 하단 = 발바닥

interface Palette {
  main: string;
  light: string;
  dark: string;
  skin: string;
  eye: string;
  accent: string;
  weapon: string;
  glow: string;
}

// ---------------------------------------------------------------- 픽셀 버퍼

class Frame {
  readonly data = new Uint8Array(CANVAS * CANVAS * 4);

  /** x: 중앙 기준, y: 지면 기준(위쪽이 양수) */
  set(x: number, y: number, hex: string, alpha = 255): void {
    const cx = ORIGIN_X + Math.round(x);
    const cy = ORIGIN_Y - Math.round(y);
    if (cx < 0 || cx >= CANVAS || cy < 0 || cy >= CANVAS) return;

    const i = (cy * CANVAS + cx) * 4;
    this.data[i] = parseInt(hex.slice(1, 3), 16);
    this.data[i + 1] = parseInt(hex.slice(3, 5), 16);
    this.data[i + 2] = parseInt(hex.slice(5, 7), 16);
    this.data[i + 3] = alpha;
  }

  rect(x: number, y: number, w: number, h: number, hex: string, alpha = 255): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, hex, alpha);
      }
    }
  }

  /** 좌우 대칭 중앙 정렬 가로줄 */
  row(y: number, halfWidth: number, hex: string, alpha = 255): void {
    for (let x = -halfWidth; x <= halfWidth; x++) this.set(x, y, hex, alpha);
  }

  ring(cx: number, cy: number, radius: number, hex: string, alpha = 255): void {
    const steps = Math.max(8, Math.round(radius * 8));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.set(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, hex, alpha);
    }
  }
}

// ---------------------------------------------------------------- 신체 파츠

type ArmPose = 'down' | 'forward' | 'back' | 'up' | 'guard' | 'slash_high' | 'slash_low';

interface Pose {
  /** 엉덩이 높이. 기본 14 */
  hipY?: number;
  /** 상체 좌우 기울기 */
  lean?: number;
  /** 앞발 / 뒷발 위치 [x, y] */
  footFront?: [number, number];
  footBack?: [number, number];
  /** 앞팔(무기 팔) / 뒷팔 */
  armFront?: ArmPose;
  armBack?: ArmPose;
  /** 머리 상하 미세 조정 */
  headY?: number;
  /** 버스터를 겨눈 상태인지 (총구 표시) */
  buster?: boolean;
  /** 세이버 궤적 */
  saber?: 'high' | 'low' | null;
  /** 차지 이펙트 세기 0~1 */
  charge?: number;
  /** 전체 투명도 */
  alpha?: number;
  /** 몸집 보정 — 보스처럼 덩치가 큰 대상에 쓴다 */
  bulk?: number;
}

function drawLeg(f: Frame, palette: Palette, hipX: number, hipY: number, foot: [number, number]): void {
  const [fx, fy] = foot;
  const kneeX = (hipX + fx) / 2;
  const kneeY = (hipY + fy) / 2 + 1;

  limb(f, palette.main, palette.dark, hipX, hipY, kneeX, kneeY, 4);
  limb(f, palette.main, palette.dark, kneeX, kneeY, fx, fy + 3, 3);

  // 부츠 — 록맨 계열 특유의 큼직한 실루엣
  f.rect(fx - 4, fy, 8, 5, palette.main);
  f.rect(fx - 4, fy, 8, 1, palette.dark);
  f.rect(fx - 4, fy + 4, 8, 1, palette.light);
  f.rect(fx - 4, fy + 1, 1, 3, palette.light);
  f.rect(fx + 3, fy + 1, 1, 3, palette.dark);
}

/** 두 점을 잇는 굵은 선 */
function limb(
  f: Frame,
  hex: string,
  edge: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const half = Math.floor(width / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (let dx = -half; dx <= half; dx++) {
      f.set(x + dx, y, dx === half ? edge : hex);
    }
  }
}

function drawArm(
  f: Frame,
  palette: Palette,
  pose: ArmPose,
  shoulderX: number,
  shoulderY: number,
  isWeaponArm: boolean,
  buster: boolean,
): void {
  const targets: Record<ArmPose, [number, number]> = {
    down: [shoulderX + 1, shoulderY - 10],
    forward: [shoulderX + 10, shoulderY - 2],
    back: [shoulderX - 6, shoulderY - 7],
    up: [shoulderX + 3, shoulderY + 8],
    guard: [shoulderX + 5, shoulderY - 4],
    slash_high: [shoulderX + 9, shoulderY + 5],
    slash_low: [shoulderX + 9, shoulderY - 8],
  };
  const [hx, hy] = targets[pose];
  const elbowX = (shoulderX + hx) / 2 + 1;
  const elbowY = (shoulderY + hy) / 2;

  limb(f, palette.main, palette.dark, shoulderX, shoulderY, elbowX, elbowY, 3);
  limb(f, palette.main, palette.dark, elbowX, elbowY, hx, hy, 3);

  if (isWeaponArm && buster) {
    // 버스터 포신
    f.rect(hx - 1, hy - 2, 5, 5, palette.weapon);
    f.rect(hx + 3, hy - 1, 1, 3, palette.light);
    f.rect(hx - 1, hy - 2, 5, 1, palette.dark);
  } else {
    // 주먹
    f.rect(hx - 1, hy - 2, 3, 3, palette.accent);
  }
}

function drawFigure(f: Frame, palette: Palette, pose: Pose): void {
  const hipY = pose.hipY ?? 14;
  const lean = pose.lean ?? 0;
  const headY = pose.headY ?? 0;
  const footFront = pose.footFront ?? [2, 0];
  const footBack = pose.footBack ?? [-2, 0];

  const shoulderY = hipY + 12 + headY;
  const chestX = lean;

  // 뒷다리·뒷팔 먼저 (겹침 순서)
  drawLeg(f, { ...palette, main: palette.dark, light: palette.main }, lean - 1, hipY, footBack);
  drawArm(f, { ...palette, main: palette.dark }, pose.armBack ?? 'down', chestX - 3, shoulderY, false, false);

  const bulk = pose.bulk ?? 0;

  // 몸통
  for (let y = 0; y < 13; y++) {
    const t = y / 12;
    const halfW = Math.round(5 + t * 1.5) + bulk;
    const cx = Math.round(chestX * t);
    for (let x = -halfW; x <= halfW; x++) {
      const isEdgeL = x === -halfW;
      const isEdgeR = x === halfW;
      f.set(cx + x, hipY + y, isEdgeL ? palette.light : isEdgeR ? palette.dark : palette.main);
    }
  }
  // 가슴 장식
  f.rect(chestX - 2, hipY + 8, 5, 3, palette.accent);
  f.rect(chestX - 1, hipY + 9, 3, 1, palette.glow);

  // 머리
  const headBase = shoulderY + 1;
  const headCx = Math.round(chestX * 1.2);
  // 얼굴
  f.rect(headCx - 4, headBase, 9, 5, palette.skin);
  // 눈
  f.rect(headCx - 3, headBase + 2, 2, 2, palette.eye);
  f.rect(headCx + 2, headBase + 2, 2, 2, palette.eye);
  // 헬멧
  f.rect(headCx - 5, headBase + 4, 11, 4, palette.main);
  f.row(headBase + 8, 4, palette.main);
  f.row(headBase + 9, 2, palette.light);
  f.rect(headCx - 5, headBase + 4, 1, 4, palette.light);
  f.rect(headCx + 5, headBase + 4, 1, 4, palette.dark);
  // 헬멧 앞챙
  f.rect(headCx - 5, headBase + 3, 11, 1, palette.dark);
  // 이마 보석
  f.rect(headCx - 1, headBase + 6, 3, 2, palette.glow);
  f.rect(headCx, headBase + 7, 1, 1, palette.accent);
  // 귀 유닛과 측면 핀
  f.rect(headCx - 7, headBase + 1, 3, 4, palette.accent);
  f.rect(headCx + 5, headBase + 1, 3, 4, palette.accent);
  f.rect(headCx - 8, headBase + 2, 1, 2, palette.light);
  f.rect(headCx + 8, headBase + 2, 1, 2, palette.light);

  // 어깨 아머 — 팔보다 뒤, 앞팔보다 앞에 그린다
  const padY = shoulderY - 4;
  f.rect(chestX - 10 - bulk, padY, 5 + bulk, 6, palette.main);
  f.rect(chestX - 10 - bulk, padY + 5, 5 + bulk, 1, palette.light);
  f.rect(chestX - 10 - bulk, padY, 1, 6, palette.light);
  f.rect(chestX + 6, padY, 5 + bulk, 6, palette.main);
  f.rect(chestX + 6, padY + 5, 5 + bulk, 1, palette.light);
  f.rect(chestX + 10 + bulk, padY, 1, 6, palette.dark);

  // 앞다리·앞팔
  drawLeg(f, palette, lean + 1, hipY, footFront);
  drawArm(f, palette, pose.armFront ?? 'down', chestX + 4, shoulderY, true, pose.buster ?? false);

  // 세이버 궤적
  if (pose.saber) {
    const cy = pose.saber === 'high' ? shoulderY + 4 : shoulderY - 6;
    for (let i = 0; i < 16; i++) {
      const a = (-0.7 + (i / 15) * 1.4) * (pose.saber === 'high' ? 1 : -1);
      const r = 13;
      f.set(chestX + 6 + Math.cos(a) * r, cy + Math.sin(a) * r, palette.weapon);
      f.set(chestX + 6 + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), palette.glow);
    }
  }

  // 차지 이펙트
  if (pose.charge) {
    const r = 4 + pose.charge * 5;
    f.ring(chestX + 13, shoulderY - 2, r, palette.glow, 160 + pose.charge * 95);
    f.ring(chestX + 13, shoulderY - 2, r * 0.55, palette.accent, 220);
  }
}

// ---------------------------------------------------------------- 포즈 정의

interface Tag {
  name: string;
  duration: number;
  loop: boolean;
  poses: Pose[];
}

function runCycle(): Pose[] {
  const frames: Pose[] = [];
  for (let i = 0; i < 8; i++) {
    const p = (i / 8) * Math.PI * 2;
    const swing = Math.sin(p) * 6;
    const lift = Math.max(0, Math.cos(p)) * 4;
    const liftBack = Math.max(0, -Math.cos(p)) * 4;
    frames.push({
      hipY: 14 - Math.abs(Math.sin(p * 2)),
      lean: 1,
      footFront: [swing, lift],
      footBack: [-swing, liftBack],
      armFront: swing > 0 ? 'back' : 'forward',
      armBack: swing > 0 ? 'forward' : 'back',
    });
  }
  return frames;
}

function characterTags(): Tag[] {
  return [
    {
      name: 'idle',
      duration: 160,
      loop: true,
      poses: [
        { hipY: 14, armFront: 'down', armBack: 'down' },
        { hipY: 13, armFront: 'down', armBack: 'down' },
        { hipY: 14, armFront: 'down', armBack: 'down' },
        { hipY: 13, headY: -1, armFront: 'down', armBack: 'down' },
      ],
    },
    { name: 'run', duration: 60, loop: true, poses: runCycle() },
    {
      name: 'jump_rise',
      duration: 90,
      loop: false,
      poses: [
        { hipY: 16, lean: 1, footFront: [4, 5], footBack: [-3, 3], armFront: 'up', armBack: 'back' },
        { hipY: 17, lean: 1, footFront: [5, 6], footBack: [-4, 4], armFront: 'up', armBack: 'back' },
      ],
    },
    {
      name: 'jump_fall',
      duration: 90,
      loop: true,
      poses: [
        { hipY: 16, lean: -1, footFront: [3, 2], footBack: [-4, 5], armFront: 'guard', armBack: 'up' },
        { hipY: 15, lean: -1, footFront: [4, 1], footBack: [-4, 4], armFront: 'guard', armBack: 'up' },
      ],
    },
    {
      name: 'jump_land',
      duration: 70,
      loop: false,
      poses: [
        { hipY: 10, footFront: [4, 0], footBack: [-4, 0], armFront: 'guard', armBack: 'guard' },
        { hipY: 12, footFront: [3, 0], footBack: [-3, 0], armFront: 'down', armBack: 'down' },
      ],
    },
    {
      name: 'dash',
      duration: 80,
      loop: true,
      poses: [
        { hipY: 11, lean: 3, footFront: [7, 1], footBack: [-6, 0], armFront: 'back', armBack: 'back' },
        { hipY: 11, lean: 3, footFront: [8, 0], footBack: [-5, 1], armFront: 'back', armBack: 'back' },
      ],
    },
    {
      name: 'wall_slide',
      duration: 120,
      loop: true,
      poses: [
        { hipY: 15, lean: -2, footFront: [-2, 3], footBack: [1, 6], armFront: 'guard', armBack: 'up' },
        { hipY: 15, lean: -2, footFront: [-3, 4], footBack: [1, 5], armFront: 'guard', armBack: 'up' },
      ],
    },
    {
      name: 'wall_kick',
      duration: 80,
      loop: false,
      poses: [
        { hipY: 16, lean: 2, footFront: [6, 6], footBack: [-5, 2], armFront: 'up', armBack: 'forward' },
        { hipY: 17, lean: 1, footFront: [4, 7], footBack: [-4, 3], armFront: 'up', armBack: 'forward' },
      ],
    },
    {
      name: 'attack_main',
      duration: 70,
      loop: false,
      poses: [
        { hipY: 14, lean: -1, armFront: 'forward', armBack: 'back', buster: true },
        { hipY: 14, lean: -2, armFront: 'forward', armBack: 'back', buster: true, saber: 'high' },
        { hipY: 14, lean: 0, armFront: 'forward', armBack: 'down', buster: true },
      ],
    },
    {
      name: 'attack_air',
      duration: 70,
      loop: false,
      poses: [
        { hipY: 16, lean: -1, footFront: [3, 4], footBack: [-3, 5], armFront: 'forward', buster: true },
        { hipY: 16, lean: -1, footFront: [3, 4], footBack: [-3, 5], armFront: 'forward', buster: true, saber: 'low' },
      ],
    },
    {
      name: 'charge_loop',
      duration: 90,
      loop: true,
      poses: [
        { hipY: 14, armFront: 'forward', buster: true, charge: 0.2 },
        { hipY: 13, armFront: 'forward', buster: true, charge: 0.6 },
        { hipY: 14, armFront: 'forward', buster: true, charge: 1.0 },
        { hipY: 13, armFront: 'forward', buster: true, charge: 0.6 },
      ],
    },
    {
      name: 'hurt',
      duration: 90,
      loop: false,
      poses: [
        { hipY: 15, lean: -3, footFront: [-1, 2], footBack: [-6, 1], armFront: 'up', armBack: 'up' },
        { hipY: 14, lean: -2, footFront: [-2, 0], footBack: [-5, 0], armFront: 'up', armBack: 'up' },
      ],
    },
  ];
}

/** 폭발 — 록맨 전통의 원형 확산 */
function deathTag(palette: Palette): { tag: Omit<Tag, 'poses'>; frames: Frame[] } {
  const frames: Frame[] = [];
  const COUNT = 6;
  for (let i = 0; i < COUNT; i++) {
    const f = new Frame();
    const t = i / (COUNT - 1);
    const cy = 18;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + t * 0.6;
      const dist = t * 20;
      const r = 4 * (1 - t) + 1;
      f.ring(Math.cos(a) * dist, cy + Math.sin(a) * dist, r, palette.glow, 255 * (1 - t * 0.6));
      f.ring(Math.cos(a) * dist, cy + Math.sin(a) * dist, r * 0.5, palette.accent, 255 * (1 - t * 0.4));
    }
    frames.push(f);
  }
  return { tag: { name: 'death', duration: 90, loop: false }, frames };
}

// ---------------------------------------------------------------- 시트 생성

interface SheetMeta {
  canvas: { w: number; h: number };
  columns: number;
  tags: Record<string, { from: number; to: number; duration: number; loop: boolean }>;
}

/**
 * 대원 한 명의 스프라이트 시트.
 *
 * 그림과 자세는 tools/lib 에 있다 — 프리뷰와 같은 것을 쓴다. 여기서
 * 하는 일은 프레임을 격자에 붙이고 태그 범위를 적어 두는 것뿐이다.
 */
function buildCrewSheet(crew: typeof CREW[number]): { png: Buffer; meta: SheetMeta } {
  const frames: Frame[] = [];
  const tags: SheetMeta['tags'] = {};

  const bake = (buf: F, alpha = 255): Frame => {
    const rgba = paint(buf, crew, alpha);
    const frame = new Frame();
    frame.data.set(rgba);
    return frame;
  };

  for (const tag of crewTags()) {
    const from = frames.length;
    for (const pose of tag.poses) {
      const buf = new F();
      drawCrew(buf, crew, pose);
      frames.push(bake(buf));
    }
    tags[tag.name] = { from, to: frames.length - 1, duration: tag.duration, loop: tag.loop };
  }

  // 사망 — 쓰러지면서 흐려진다. 록맨식 원형 폭발은 개체(적)의 몫이고,
  // 대원은 사람이라 터지지 않는다.
  const deathFrom = frames.length;
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const buf = new F();
    drawCrew(buf, crew, {
      hipY: 14 - Math.round(t * 9),
      lean: -Math.round(t * 5),
      footF: [4 + Math.round(t * 3), 0],
      footB: [-4 - Math.round(t * 4), 0],
      armWeapon: 'up', armFree: 'up',
      weapon: false,
    });
    frames.push(bake(buf, Math.round(255 * (1 - t * 0.75))));
  }
  tags.death = { from: deathFrom, to: frames.length - 1, duration: 90, loop: false };

  return { png: packFrames(frames), meta: { canvas: { w: CANVAS, h: CANVAS }, columns: COLUMNS, tags } };
}

/**
 * 실루엣 바깥쪽에 어두운 테두리를 한 겹 두른다 — 색만 칠해진 덩어리와
 * "완성된 스프라이트"를 가르는 가장 싼 방법이 이거다. 이미 칠해진
 * 픽셀(몸통 안쪽 경계)은 안 건드리고, 배경과 맞닿는 가장자리에만 그린다.
 */
function outlineFrame(frame: Frame, hex = '#0a0a12'): void {
  const src = frame.data.slice();
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const isOpaque = (x: number, y: number): boolean => {
    if (x < 0 || x >= CANVAS || y < 0 || y >= CANVAS) return false;
    return src[(y * CANVAS + x) * 4 + 3] > 0;
  };
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      const i = (y * CANVAS + x) * 4;
      if (src[i + 3] > 0) continue;
      if (isOpaque(x - 1, y) || isOpaque(x + 1, y) || isOpaque(x, y - 1) || isOpaque(x, y + 1)) {
        frame.data[i] = r;
        frame.data[i + 1] = g;
        frame.data[i + 2] = b;
        frame.data[i + 3] = 255;
      }
    }
  }
}

/** 프레임들을 균일 격자 PNG 로 묶는다 */
function packFrames(frames: Frame[]): Buffer {
  for (const frame of frames) outlineFrame(frame);
  const rows = Math.ceil(frames.length / COLUMNS);
  const png = new PNG({ width: COLUMNS * CANVAS, height: rows * CANVAS });
  png.data.fill(0);

  frames.forEach((frame, index) => {
    const ox = (index % COLUMNS) * CANVAS;
    const oy = Math.floor(index / COLUMNS) * CANVAS;
    for (let y = 0; y < CANVAS; y++) {
      for (let x = 0; x < CANVAS; x++) {
        const src = (y * CANVAS + x) * 4;
        if (frame.data[src + 3] === 0) continue;
        const dst = ((oy + y) * png.width + (ox + x)) * 4;
        png.data[dst] = frame.data[src];
        png.data[dst + 1] = frame.data[src + 1];
        png.data[dst + 2] = frame.data[src + 2];
        png.data[dst + 3] = frame.data[src + 3];
      }
    }
  });

  return PNG.sync.write(png);
}

// ---------------------------------------------------------------- 적

const ENEMY_PALETTES: Record<string, Palette> = {
  walker: {
    main: '#7a6a4e', light: '#c4ad7f', dark: '#3f3626',
    skin: '#c9b48c', eye: '#2a1a10', accent: '#ffb545', weapon: '#c4ad7f', glow: '#ff8a3c',
  },
  hover: {
    main: '#4a5f8c', light: '#96b0e0', dark: '#22304f',
    skin: '#96b0e0', eye: '#101a30', accent: '#cfe0ff', weapon: '#96b0e0', glow: '#7fd8ff',
  },
  crawler: {
    main: '#5a2e6a', light: '#a870c0', dark: '#28123a',
    skin: '#a870c0', eye: '#1a0824', accent: '#a8ff5c', weapon: '#a870c0', glow: '#c8ff70',
  },
  wall_turret: {
    main: '#6a3a2a', light: '#c07850', dark: '#301810',
    skin: '#c07850', eye: '#200a04', accent: '#ffcf4a', weapon: '#ff6a3c', glow: '#ff9050',
  },
  hopper: {
    main: '#3a7a4a', light: '#8ee6a0', dark: '#1a3a22',
    skin: '#8ee6a0', eye: '#0e1e12', accent: '#dfffe0', weapon: '#8ee6a0', glow: '#c8f0a0',
  },
  sniper_drone: {
    main: '#3a6a7a', light: '#8ee0f0', dark: '#1a333a',
    skin: '#8ee0f0', eye: '#0c1c20', accent: '#ffffff', weapon: '#d8faff', glow: '#d8faff',
  },
  sting_chameleon: {
    main: '#3f9c58', light: '#8ee59a', dark: '#1d4d2c',
    skin: '#e8d9a8', eye: '#12301c', accent: '#ffd85c', weapon: '#b6ff8e', glow: '#b6ff8e',
  },
  spark_mandriller: {
    main: '#c8a020', light: '#ffe890', dark: '#6a5008',
    skin: '#f0dcb0', eye: '#301a08', accent: '#fff0a0', weapon: '#ffee88', glow: '#ffee88',
  },
  boomer_kuwanger: {
    main: '#7a5ec8', light: '#c0a8ff', dark: '#3a2a70',
    skin: '#e0d0f0', eye: '#1a1030', accent: '#a8f0ff', weapon: '#a8f0ff', glow: '#a8f0ff',
  },
  guard_turtlan: {
    main: '#6a7a4a', light: '#a8c078', dark: '#333f1e',
    skin: '#e8dcb0', eye: '#1c2410', accent: '#ffcf4a', weapon: '#8ea058', glow: '#c8e070',
  },
  rapier_phantom: {
    main: '#7ea8c8', light: '#d0eaff', dark: '#33506a',
    skin: '#e8f0ff', eye: '#173040', accent: '#ffffff', weapon: '#bfe8ff', glow: '#dff4ff',
  },
  crimson_barrier: {
    main: '#a02824', light: '#ff8060', dark: '#4a0e0c',
    skin: '#f0c8a8', eye: '#2a0605', accent: '#ffcf4a', weapon: '#ff5a3c', glow: '#ff9050',
  },
  fang_rusher: {
    main: '#6a2e8c', light: '#c080e8', dark: '#2e1248',
    skin: '#d8c0f0', eye: '#180824', accent: '#a8ff5c', weapon: '#c080e8', glow: '#c8ff70',
  },
  longshot_eaglet: {
    main: '#3a7ca8', light: '#bfe8ff', dark: '#173a54',
    skin: '#e8f4ff', eye: '#0c1e2c', accent: '#ffffff', weapon: '#dff4ff', glow: '#eaffff',
  },
  titan_breaker: {
    main: '#1e4a7a', light: '#5ea8d8', dark: '#0c223f',
    skin: '#c8d8e8', eye: '#06111f', accent: '#ffcf4a', weapon: '#7fc8ff', glow: '#9fe0ff',
  },
};

/** 지상 잡몹 — 다리 달린 메카니로이드 */
function drawWalker(f: Frame, p: Palette, phase: number): void {
  const swing = Math.round(Math.sin(phase * Math.PI * 2) * 3);
  const bob = Math.round(Math.abs(Math.cos(phase * Math.PI * 2)));

  f.rect(-7 + swing, 0, 5, 7, p.dark);
  f.rect(2 - swing, 0, 5, 7, p.dark);
  f.rect(-7 + swing, 0, 5, 1, p.eye);
  f.rect(2 - swing, 0, 5, 1, p.eye);

  const by = 6 + bob;
  f.rect(-9, by, 18, 14, p.main);
  f.rect(-9, by, 18, 1, p.dark);
  f.rect(-9, by + 13, 18, 1, p.light);
  f.rect(-9, by, 1, 14, p.light);
  f.rect(8, by, 1, 14, p.dark);
  for (let i = -6; i <= 6; i += 4) f.rect(i, by + 2, 1, 2, p.dark);

  f.rect(-4, by + 5, 8, 5, p.eye);
  f.rect(-3, by + 6, 6, 3, p.glow);
  f.rect(-1, by + 7, 2, 1, p.accent);

  f.rect(0, by + 14, 1, 4, p.dark);
  f.rect(-1, by + 18, 3, 2, p.accent);
}

/** 비행 잡몹 — 부유 드론 */
function drawHover(f: Frame, p: Palette, phase: number): void {
  const cy = 24 + Math.round(Math.sin(phase * Math.PI * 2) * 2);

  for (let y = -9; y <= 9; y++) {
    for (let x = -10; x <= 10; x++) {
      if ((x * x) / 100 + (y * y) / 81 > 1) continue;
      const edge = (x * x) / 100 + (y * y) / 81 > 0.72;
      f.set(x, cy + y, edge ? (x < 0 ? p.light : p.dark) : p.main);
    }
  }

  f.rect(-5, cy - 2, 10, 6, p.eye);
  f.rect(-4, cy - 1, 8, 4, p.glow);
  f.rect(-2, cy, 3, 2, p.accent);

  const fin = Math.round(Math.sin(phase * Math.PI * 4) * 1);
  f.rect(-14, cy + 1 + fin, 4, 2, p.accent);
  f.rect(10, cy + 1 - fin, 4, 2, p.accent);
}

/** 지상 돌진형 잡몹 — 낮게 웅크린 채 빠르게 달려드는 벌레형 */
function drawCrawler(f: Frame, p: Palette, phase: number): void {
  const scurry = Math.round(Math.sin(phase * Math.PI * 4) * 2);
  const by = 2;

  const legPhase = Math.round(Math.sin(phase * Math.PI * 6) * 1);
  f.rect(-7, 0, 2, 3 + legPhase, p.dark);
  f.rect(-3, 0, 2, 3 - legPhase, p.dark);
  f.rect(1, 0, 2, 3 + legPhase, p.dark);
  f.rect(5, 0, 2, 3 - legPhase, p.dark);

  f.rect(-8 + scurry, by, 16, 6, p.main);
  f.rect(-8 + scurry, by, 16, 1, p.light);
  f.rect(-8 + scurry, by + 5, 16, 1, p.dark);

  f.rect(-5 + scurry, by + 6, 2, 3, p.dark);
  f.rect(0 + scurry, by + 7, 2, 4, p.dark);
  f.rect(4 + scurry, by + 6, 2, 3, p.dark);

  f.rect(5 + scurry, by + 1, 3, 3, p.eye);
  f.rect(6 + scurry, by + 2, 1, 1, p.glow);
}

/** 고정 포탑형 잡몹 — 다리 없이 제자리에서 조준 사격만 한다 */
function drawTurret(f: Frame, p: Palette, phase: number): void {
  const pulse = Math.round(Math.sin(phase * Math.PI * 2) * 1);

  f.rect(-9, 0, 18, 4, p.dark);
  f.rect(-9, 3, 18, 1, p.light);

  f.rect(-7, 4, 14, 12, p.main);
  f.rect(-7, 4, 14, 1, p.dark);
  f.rect(-7, 15, 14, 1, p.light);
  f.rect(-7, 4, 1, 12, p.light);
  f.rect(6, 4, 1, 12, p.dark);

  f.rect(-3, 8, 6, 4, p.eye);
  f.rect(-2, 9, 4, 2 + pulse, p.glow);

  f.rect(6, 8, 7, 3, p.weapon);
  f.rect(12, 8, 2, 3, p.accent);
}

/** 도약형 잡몹 — 짧게 뛰어오르며 착지할 때마다 조준 사격한다 */
function drawHopper(f: Frame, p: Palette, phase: number): void {
  const squash = Math.abs(Math.sin(phase * Math.PI * 2));
  const bodyH = Math.max(5, 9 - Math.round(squash * 3));
  const by = 3;

  f.rect(-9, 0, 3, 4, p.dark);
  f.rect(6, 0, 3, 4, p.dark);

  f.rect(-7, by, 14, bodyH, p.main);
  f.rect(-7, by, 14, 1, p.light);
  f.rect(-7, by + bodyH - 1, 14, 1, p.dark);

  f.rect(-5, by + bodyH - 3, 3, 3, p.eye);
  f.rect(2, by + bodyH - 3, 3, 3, p.eye);
  f.rect(-4, by + bodyH - 2, 1, 1, p.glow);
  f.rect(3, by + bodyH - 2, 1, 1, p.glow);

  f.rect(-3, by + bodyH, 1, 3, p.accent);
  f.rect(3, by + bodyH, 1, 3, p.accent);
}

type MobKind = 'walker' | 'hover' | 'crawler' | 'turret' | 'hopper';

interface EnemySpec {
  id: string;
  kind: MobKind | 'boss';
}

const MOB_DRAWERS: Record<MobKind, (f: Frame, p: Palette, phase: number) => void> = {
  walker: drawWalker,
  hover: drawHover,
  crawler: drawCrawler,
  turret: drawTurret,
  hopper: drawHopper,
};

const ENEMIES: EnemySpec[] = [
  { id: 'walker', kind: 'walker' },
  { id: 'hover', kind: 'hover' },
  { id: 'crawler', kind: 'crawler' },
  { id: 'wall_turret', kind: 'turret' },
  { id: 'hopper', kind: 'hopper' },
  { id: 'sniper_drone', kind: 'hover' },
  { id: 'sting_chameleon', kind: 'boss' },
  { id: 'spark_mandriller', kind: 'boss' },
  { id: 'boomer_kuwanger', kind: 'boss' },
  { id: 'guard_turtlan', kind: 'boss' },
  { id: 'rapier_phantom', kind: 'boss' },
  { id: 'crimson_barrier', kind: 'boss' },
  { id: 'fang_rusher', kind: 'boss' },
  { id: 'longshot_eaglet', kind: 'boss' },
  { id: 'titan_breaker', kind: 'boss' },
];

function mobFrames(kind: MobKind, palette: Palette): { frames: Frame[]; tags: SheetMeta['tags'] } {
  const frames: Frame[] = [];
  const tags: SheetMeta['tags'] = {};
  const draw = MOB_DRAWERS[kind];

  const push = (name: string, count: number, duration: number, loop: boolean, pal: Palette): void => {
    const from = frames.length;
    for (let i = 0; i < count; i++) {
      const f = new Frame();
      draw(f, pal, i / count);
      frames.push(f);
    }
    tags[name] = { from, to: frames.length - 1, duration, loop };
  };

  push('idle', 2, 220, true, palette);
  push('move', 4, 120, true, palette);
  // 피격은 밝은 팔레트로 대체해 눈에 띄게 한다
  push('hurt', 2, 90, false, { ...palette, main: palette.light, dark: palette.main });
  return { frames, tags };
}

function bossFrames(palette: Palette): { frames: Frame[]; tags: SheetMeta['tags'] } {
  const frames: Frame[] = [];
  const tags: SheetMeta['tags'] = {};
  const BULK = 2;

  const push = (name: string, poses: Pose[], duration: number, loop: boolean): void => {
    const from = frames.length;
    for (const pose of poses) {
      const f = new Frame();
      drawFigure(f, palette, { ...pose, bulk: BULK });
      frames.push(f);
    }
    tags[name] = { from, to: frames.length - 1, duration, loop };
  };

  const byName = new Map(characterTags().map((t) => [t.name, t.poses]));
  push('idle', byName.get('idle')!, 170, true);
  push('move', byName.get('run')!, 70, true);
  push('telegraph', [
    { hipY: 11, lean: -2, armFront: 'back', armBack: 'back' },
    { hipY: 10, lean: -3, armFront: 'back', armBack: 'back', headY: -1 },
  ], 130, false);
  push('attack_1', byName.get('attack_main')!, 80, false);
  push('attack_2', [
    { hipY: 13, lean: 2, armFront: 'slash_high', saber: 'high' },
    { hipY: 13, lean: 3, armFront: 'slash_low', saber: 'low' },
  ], 90, false);
  push('hurt', byName.get('hurt')!, 100, false);
  return { frames, tags };
}

function buildEnemySheet(spec: EnemySpec): { png: Buffer; meta: SheetMeta } {
  const palette = ENEMY_PALETTES[spec.id];
  const built = spec.kind === 'boss' ? bossFrames(palette) : mobFrames(spec.kind, palette);
  const frames = built.frames;
  const tags = built.tags;

  const death = deathTag(palette);
  const from = frames.length;
  frames.push(...death.frames);
  tags.death = { from, to: frames.length - 1, duration: death.tag.duration, loop: false };

  return { png: packFrames(frames), meta: { canvas: { w: CANVAS, h: CANVAS }, columns: COLUMNS, tags } };
}

// ---------------------------------------------------------------- 실행

let total = 0;

for (const crew of CREW) {
  const { png, meta } = buildCrewSheet(crew);
  writeSheet(OUT_CHARS, crew.id, png, meta);
  total++;
}

for (const spec of ENEMIES) {
  const { png, meta } = buildEnemySheet(spec);
  writeSheet(OUT_ENEMIES, spec.id, png, meta);
  total++;
}

console.log(`임시 도트 ${total}개 생성 → assets/generated/`);

function writeSheet(dirBase: string, id: string, png: Buffer, meta: SheetMeta): void {
  const dir = resolve(dirBase, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${id}.png`), png);
  writeFileSync(resolve(dir, `${id}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  const frameCount = Math.max(...Object.values(meta.tags).map((t) => t.to)) + 1;
  console.log(`  ${id.padEnd(18)} ${frameCount}프레임 ${Object.keys(meta.tags).length}태그`);
}
