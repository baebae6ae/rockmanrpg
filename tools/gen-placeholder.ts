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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'assets/generated/characters');

const CANVAS = 64;
const COLUMNS = 8;
const ORIGIN_X = 32; // 캔버스 중앙
const ORIGIN_Y = 63; // 캔버스 하단 = 발바닥

// ---------------------------------------------------------------- 팔레트

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

const PALETTES: Record<string, Palette> = {
  x: {
    main: '#2f6fd0',
    light: '#7fc4ff',
    dark: '#183d80',
    skin: '#f6c9a0',
    eye: '#12305c',
    accent: '#e8f4ff',
    weapon: '#9fb8d8',
    glow: '#7fe4ff',
  },
  zero: {
    main: '#d02f3a',
    light: '#ff8b7c',
    dark: '#7a1520',
    skin: '#f6c9a0',
    eye: '#2a1030',
    accent: '#ffd85c',
    weapon: '#8ef0d8',
    glow: '#8ef0d8',
  },
};

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

  // 몸통
  for (let y = 0; y < 13; y++) {
    const t = y / 12;
    const halfW = Math.round(5 + t * 1.5);
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
  f.rect(chestX - 10, padY, 5, 6, palette.main);
  f.rect(chestX - 10, padY + 5, 5, 1, palette.light);
  f.rect(chestX - 10, padY, 1, 6, palette.light);
  f.rect(chestX + 6, padY, 5, 6, palette.main);
  f.rect(chestX + 6, padY + 5, 5, 1, palette.light);
  f.rect(chestX + 10, padY, 1, 6, palette.dark);

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

function buildSheet(palette: Palette): { png: Buffer; meta: SheetMeta } {
  const frames: Frame[] = [];
  const tags: SheetMeta['tags'] = {};

  for (const tag of characterTags()) {
    const from = frames.length;
    for (const pose of tag.poses) {
      const f = new Frame();
      drawFigure(f, palette, pose);
      frames.push(f);
    }
    tags[tag.name] = { from, to: frames.length - 1, duration: tag.duration, loop: tag.loop };
  }

  const death = deathTag(palette);
  const deathFrom = frames.length;
  frames.push(...death.frames);
  tags.death = {
    from: deathFrom,
    to: frames.length - 1,
    duration: death.tag.duration,
    loop: death.tag.loop,
  };

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

  return {
    png: PNG.sync.write(png),
    meta: { canvas: { w: CANVAS, h: CANVAS }, columns: COLUMNS, tags },
  };
}

// ---------------------------------------------------------------- 실행

let total = 0;
for (const [id, palette] of Object.entries(PALETTES)) {
  const { png, meta } = buildSheet(palette);
  const dir = resolve(OUT_DIR, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${id}.png`), png);
  writeFileSync(resolve(dir, `${id}.json`), `${JSON.stringify(meta, null, 2)}\n`);

  const frameCount = Math.max(...Object.values(meta.tags).map((t) => t.to)) + 1;
  console.log(`  ${id.padEnd(6)} ${frameCount}프레임 ${Object.keys(meta.tags).length}태그`);
  total++;
}
console.log(`임시 도트 ${total}개 생성 → assets/generated/characters/`);
