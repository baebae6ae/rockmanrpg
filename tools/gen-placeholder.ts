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
import { F, M, paint } from './lib/crewart.js';
import { CREW, drawCrew } from './lib/crew.js';
import { crewTags } from './lib/crewanim.js';
import { FOES, MOBS, MOB_DRAWERS, type Anim, type FoeAct } from './lib/foe.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_CHARS = resolve(ROOT, 'assets/generated/characters');
const OUT_ENEMIES = resolve(ROOT, 'assets/generated/enemies');

const CANVAS = 64;
const COLUMNS = 8;
const ORIGIN_X = 32; // 캔버스 중앙
const ORIGIN_Y = 63; // 캔버스 하단 = 발바닥

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

/**
 * 개체·잡몹의 연출값. 한 태그 안에서 프레임 번호를 0~1 로 정규화해 쓴다.
 *
 * 개체마다 몸이 다르므로 자세를 공유할 수 없다. 대신 "얼마나 웅크렸나,
 * 얼마나 뻗었나" 같은 값만 공유하고 그걸 어떻게 쓸지는 각자 정한다.
 */
function animOf(act: FoeAct, t: number): Anim {
  const wave = Math.sin(t * Math.PI * 2);
  const base: Anim = { bob: wave, lean: 0, wind: 0, strike: 0, spin: t, hurt: 0 };
  switch (act) {
    case 'move': return { ...base, lean: 2, bob: Math.abs(wave) * 2 };
    // 예비동작은 끝까지 당겼다가 멈춘다 — 여기서 흔들리면 예고가 안 읽힌다
    case 'tell': return { ...base, wind: 0.6 + t * 0.4, bob: 0 };
    case 'atk1': return { ...base, wind: Math.max(0, 0.4 - t), strike: Math.min(1, t * 1.6) };
    case 'atk2': return { ...base, strike: 0.5 + t * 0.5, lean: 3 };
    case 'hurt': return { ...base, hurt: 1, lean: -3, bob: -1 };
    default: return base;
  }
}

/** 개체 — 대원과 같은 7태그 27프레임 구성이다 */
function bossSheet(def: typeof FOES[number]): { png: Buffer; meta: SheetMeta } {
  const frames: Frame[] = [];
  const tags: SheetMeta['tags'] = {};

  const push = (name: string, act: FoeAct, count: number, duration: number, loop: boolean): void => {
    const from = frames.length;
    for (let i = 0; i < count; i++) {
      const buf = new F();
      def.draw(buf, animOf(act, count === 1 ? 0 : i / count));
      const frame = new Frame();
      frame.data.set(paint(buf, def));
      frames.push(frame);
    }
    tags[name] = { from, to: frames.length - 1, duration, loop };
  };

  push('idle', 'idle', 4, 170, true);
  push('move', 'move', 8, 70, true);
  push('telegraph', 'tell', 2, 130, false);
  push('attack_1', 'atk1', 3, 80, false);
  push('attack_2', 'atk2', 2, 90, false);
  push('hurt', 'hurt', 2, 100, false);

  // 사망 — 개체는 터진다. 대원과 반대다
  const from = frames.length;
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const buf = new F();
    def.draw(buf, animOf('hurt', t));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + t * 0.7;
      const dist = t * 26;
      const r = Math.max(1, Math.round(5 * (1 - t)));
      buf.disc(Math.cos(a) * dist, 18 + Math.sin(a) * dist, r, M.glow);
    }
    const frame = new Frame();
    frame.data.set(paint(buf, def, Math.round(255 * (1 - t * 0.7))));
    frames.push(frame);
  }
  tags.death = { from, to: frames.length - 1, duration: 90, loop: false };

  return { png: packFrames(frames), meta: { canvas: { w: CANVAS, h: CANVAS }, columns: COLUMNS, tags } };
}

/** 잡몹 — 화면에 수십 마리가 동시에 나오므로 프레임을 아낀다 */
function mobSheet(def: typeof MOBS[number]): { png: Buffer; meta: SheetMeta } {
  const frames: Frame[] = [];
  const tags: SheetMeta['tags'] = {};
  const draw = MOB_DRAWERS[def.kind];

  const push = (name: string, count: number, duration: number, loop: boolean, hurt = false): void => {
    const from = frames.length;
    for (let i = 0; i < count; i++) {
      const buf = new F();
      draw(buf, i / count);
      const frame = new Frame();
      // 피격은 발광색을 몸에 덮어써서 눈에 띄게 한다
      frame.data.set(paint(buf, hurt ? { ...def, suit: def.glow, metal: def.glow } : def));
      frames.push(frame);
    }
    tags[name] = { from, to: frames.length - 1, duration, loop };
  };

  push('idle', 2, 220, true);
  push('move', 4, 120, true);
  push('hurt', 2, 90, false, true);

  const from = frames.length;
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const buf = new F();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + t * 0.6;
      const dist = t * 16;
      buf.disc(Math.cos(a) * dist, 10 + Math.sin(a) * dist, Math.max(1, Math.round(4 * (1 - t))), M.glow);
    }
    const frame = new Frame();
    frame.data.set(paint(buf, def, Math.round(255 * (1 - t * 0.7))));
    frames.push(frame);
  }
  tags.death = { from, to: frames.length - 1, duration: 90, loop: false };

  return { png: packFrames(frames), meta: { canvas: { w: CANVAS, h: CANVAS }, columns: COLUMNS, tags } };
}

// ---------------------------------------------------------------- 실행

let total = 0;

for (const crew of CREW) {
  const { png, meta } = buildCrewSheet(crew);
  writeSheet(OUT_CHARS, crew.id, png, meta);
  total++;
}

for (const mob of MOBS) {
  const { png, meta } = mobSheet(mob);
  writeSheet(OUT_ENEMIES, mob.id, png, meta);
  total++;
}

for (const foe of FOES) {
  const { png, meta } = bossSheet(foe);
  writeSheet(OUT_ENEMIES, foe.id, png, meta);
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
