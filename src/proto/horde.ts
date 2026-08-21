/**
 * 기획 프로토타입 — 몰려오는 적을 자동사격으로 갈아버리는 생존 모드.
 * 본편과 완전히 분리돼 있고 ?horde 로만 들어간다.
 *
 * 검증하려는 것은 딱 하나다: "정신없이 총알 갈기는 손맛"이 실제로 나는가.
 * 그래서 조작은 이동/대시뿐이고 사격은 전부 자동이다.
 *
 * 다만 그 상태는 출발점이 아니라 도달점이다. 1발에서 시작해 레벨업으로
 * 쌓아 올려야 "확 늘었다"는 순간이 생기고, 처음부터 화면을 덮어버리면
 * 가만히 서 있어도 사방이 정리돼 긴장이 사라진다.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Input } from '../input/input';
import { AnimView, loadSheet, type Sheet } from '../anim/sheet';

/**
 * 이 모드는 본편(560×240 가로)과 화면 비율 자체가 다르다.
 * 사방에서 몰려오는 걸 보여줘야 하는데 가로로 납작하면 위아래가 너무
 * 좁고, 한 손으로 쥔 세로 화면이 이 장르에 훨씬 맞는다.
 * 보이는 넓이는 본편과 거의 같아서(129,600 vs 134,400px²) 적 밀도
 * 수치는 그대로 쓸 수 있다.
 */
const W = 270;
const H = 480;

const ARENA_W = 1400;
const ARENA_H = 900;

const PLAYER_R = 7;
const BASE_SPEED = 108;
const DASH_SPEED = 300;
const DASH_TIME = 0.16;
const DASH_CD = 0.55;

const MAX_BULLETS = 700;
const MAX_FOES = 170;
const MAX_PARTS = 460;
const MAX_GEMS = 80;

type FoeKind = 'crawler' | 'walker' | 'hopper' | 'fang_rusher' | 'sniper_drone';

interface KindDef {
  hp: number;
  speed: number;
  r: number;
  touch: number;
  xp: number;
  scale: number;
}

const KINDS: Record<FoeKind, KindDef> = {
  crawler: { hp: 6, speed: 34, r: 9, touch: 7, xp: 1, scale: 0.9 },
  walker: { hp: 10, speed: 44, r: 10, touch: 9, xp: 1, scale: 1 },
  hopper: { hp: 5, speed: 62, r: 8, touch: 7, xp: 1, scale: 0.85 },
  fang_rusher: { hp: 14, speed: 78, r: 10, touch: 12, xp: 2, scale: 1 },
  sniper_drone: { hp: 8, speed: 50, r: 9, touch: 8, xp: 2, scale: 0.9 },
};

const KIND_LIST = Object.keys(KINDS) as FoeKind[];

interface Foe {
  kind: FoeKind;
  x: number;
  y: number;
  kx: number;
  ky: number;
  hp: number;
  def: KindDef;
  scale: number;
  elite: boolean;
  flash: number;
  view: AnimView;
  alive: boolean;
}

/** 궤적선(버스터) / 회전 날(메탈 블레이드) / 구체(토네이도·미사일·폭탄) */
type Shape = 'tracer' | 'blade' | 'orb';

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  pierce: number;
  lastHit: Foe | null;
  alive: boolean;
  shape: Shape;
  color: number;
  /** 피격 반경 */
  r: number;
  /** 초당 회전 라디안 — 보이는 용도 */
  spin: number;
  angle: number;
  /** 0보다 크면 매 프레임 가장 가까운 적 쪽으로 이 각속도만큼 튼다 */
  homing: number;
  /** 0보다 크면 사라질 때 이 반경으로 터진다 */
  boomR: number;
  boomDmg: number;
}

/** 번개 — 즉발이라 탄이 아니고, 잠깐 보이는 선으로만 남는다 */
interface Bolt {
  x: number;
  y: number;
  life: number;
  color: number;
}

/** 폭발·타격 표시용으로 퍼지는 원 */
interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: number;
}

/** 플레이어 주위를 도는 실드 구슬 */
interface Orb {
  angle: number;
  cd: number;
}

interface Gem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  val: number;
  alive: boolean;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

interface Weapon {
  interval: number;
  shots: number;
  spread: number;
  dmg: number;
  speed: number;
  pierce: number;
  drones: number;
  magnet: number;
}

interface Upgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  apply: () => void;
}

/** 파티클은 이 색들만 쓴다 — 색이 고정이라야 색깔별 배치 그리기가 가능하다 */
const PART_COLORS = [0xfff0a0, 0xff9a4c, 0xffc45c, 0xfff2c0, 0xff5c5c, 0x8ef0ff, 0xffffff];

/** 특수무기 탄 색. 같은 이유로 고정이다 (SPECIALS 의 color 와 맞춰 둘 것) */
const SPECIAL_COLORS = [0xd8e2f0, 0xffa8dc, 0x9fe8ff, 0xff8a5c];

const GRID_CELL = 34;
const GRID_W = Math.ceil(ARENA_W / GRID_CELL);
const GRID_H = Math.ceil(ARENA_H / GRID_CELL);

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 색을 흰색 쪽으로 amount 만큼 민다 — 탄 심지를 캐릭터 색의 밝은 판으로 쓴다 */
function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const up = (c: number): number => Math.round(c + (255 - c) * amount);
  return (up(r) << 16) | (up(g) << 8) | up(b);
}

/** 캐릭터 선택에 필요한 것만 추린 형태 — 본편 CharacterDef 의 부분집합이다 */
interface HordeChar {
  id: string;
  name: string;
  sprite_scale?: number;
  base_stats: { hp: number };
  /** X·제로만 갖고 있다. 나머지는 시작 스킬에서 탄을 가져온다 */
  shot?: { speed: number; color: string; power: number };
  starting_skills?: string[];
}

interface SkillLite {
  id: string;
  effects?: { type: string; speed?: number; color?: number; power?: number }[];
}

const CHAR_DEFS = Object.values(
  import.meta.glob('/data/characters/*.json', { eager: true, import: 'default' }) as Record<string, HordeChar>,
).sort((a, b) => a.id.localeCompare(b.id));

const SKILLS: Record<string, SkillLite> = {};
for (const s of Object.values(
  import.meta.glob('/data/skills/*.json', { eager: true, import: 'default' }) as Record<string, SkillLite>,
)) {
  SKILLS[s.id] = s;
}

interface ShotInfo {
  speed: number;
  color: number;
  power: number;
}

/**
 * 캐릭터의 탄 성질을 뽑는다. shot 블록이 있으면 그걸 쓰고, 없으면 시작
 * 스킬의 projectile 효과에서 가져온다 — 9명 중 7명이 후자다.
 * color 는 데이터마다 "0x..." 문자열이거나 십진수라 Number() 로 통일한다.
 */
function resolveShot(c: HordeChar): ShotInfo {
  if (c.shot) return { speed: c.shot.speed, color: Number(c.shot.color), power: c.shot.power };
  const sk = SKILLS[c.starting_skills?.[0] ?? ''];
  const proj = sk?.effects?.find((e) => e.type === 'projectile');
  const dmg = sk?.effects?.find((e) => e.type === 'damage');
  return { speed: proj?.speed ?? 300, color: Number(proj?.color ?? 0x9fe8ff), power: dmg?.power ?? 8 };
}

const SHOTS = new Map<string, ShotInfo>(CHAR_DEFS.map((c) => [c.id, resolveShot(c)]));

/**
 * 선택 화면 한 칸이 62px 뿐이라 긴 이름은 옆 칸을 침범한다.
 * 괄호 설명을 떼고, 그래서 이름이 겹치면 id 꼬리를 붙여 구분한다
 * ("제로(제로 시리즈)" → "제로Z").
 */
const SHORT_NAMES = new Map<string, string>();
{
  const base = CHAR_DEFS.map((c) => c.name.replace(/\s*[(（].*$/, '').trim() || c.id);
  for (let i = 0; i < CHAR_DEFS.length; i++) {
    const dup = base.some((n, j) => j !== i && n === base[i]);
    const tail = CHAR_DEFS[i].id.split('_')[1];
    SHORT_NAMES.set(CHAR_DEFS[i].id, dup && tail ? base[i] + tail.toUpperCase() : base[i]);
  }
}

export async function runHordeProto(app: Application, input: Input): Promise<void> {
  // 백버퍼를 세로로 다시 잡고 확대는 CSS 가 맡는다 — 본편과 같은 방식이라
  // 어느 배율에서도 도트가 보간되지 않는다.
  app.renderer.resize(W, H);
  const canvas = app.canvas as HTMLCanvasElement;
  const fit = (): void => {
    const raw = Math.min(window.innerWidth / W, window.innerHeight / H);
    const scale = raw >= 2 ? Math.floor(raw) : raw;
    canvas.style.width = `${Math.round(W * scale)}px`;
    canvas.style.height = `${Math.round(H * scale)}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${Math.round((window.innerWidth - W * scale) / 2)}px`;
    canvas.style.top = `${Math.round((window.innerHeight - H * scale) / 2)}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 100));

  const sheets = new Map<FoeKind, Sheet>();
  await Promise.all(
    KIND_LIST.map(async (k) => {
      sheets.set(k, await loadSheet('enemies', k));
    }),
  );
  // 고를 수 있는 캐릭터의 시트를 전부 미리 받아둔다 — 선택 화면에서
  // 9명을 동시에 세워 보여줘야 하므로 어차피 다 필요하다.
  const charSheets = new Map<string, Sheet>();
  await Promise.all(
    CHAR_DEFS.map(async (c) => {
      charSheets.set(c.id, await loadSheet('characters', c.id));
    }),
  );

  // ------------------------------------------------------------ 레이어
  const world = new Container();
  const ui = new Container();
  app.stage.addChild(world, ui);

  // 바닥보다 느리게 흐르는 아래층 — 뚫린 격자망 칸으로 비친다.
  // 시차가 있어야 바닥이 판때기가 아니라 위에 얹힌 층으로 읽힌다.
  const farLayer = new Container();
  const farG = new Graphics();
  farLayer.addChild(farG);
  app.stage.addChildAt(farLayer, 0);

  const groundG = new Graphics();
  const gemG = new Graphics();
  const foeLayer = new Container();
  const bulletG = new Graphics();
  const specialG = new Graphics();
  const partG = new Graphics();
  world.addChild(groundG, gemG, foeLayer, bulletG, specialG, partG);

  // 배경 — 록맨X 발전소 스테이지풍 바닥. 한 번만 그린다.
  //
  // 전에 쓰던 단색 파란 패널 벽은 밝기만 했지 깊이가 없었다. X 시리즈
  // 배경의 핵심은 (1) 굵은 어두운 윤곽으로 끊어지는 덩어리진 타일,
  // (2) 그 사이로 안쪽 구조물이 비쳐 보이는 층, (3) 발광 배선 몇 줄이다.
  // 그래서 바닥을 통짜로 칠하지 않고, 일부 칸을 격자망으로 뚫어 그
  // 아래 기계층(farLayer)이 시차를 두고 보이게 했다.
  const rnd = (() => {
    let s = 0x9e37 >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
  })();

  // --- 아래층: 뚫린 칸으로 보이는 기계실
  farG.rect(0, 0, ARENA_W, ARENA_H).fill({ color: 0x05080f });
  for (let x = 20; x < ARENA_W; x += 96) {
    farG.rect(x, 0, 14, ARENA_H).fill({ color: 0x101a2e });
    farG.rect(x + 2, 0, 3, ARENA_H).fill({ color: 0x1b2b4a });
  }
  for (let y = 40; y < ARENA_H; y += 128) {
    farG.rect(0, y, ARENA_W, 10).fill({ color: 0x0c1424 });
    farG.rect(0, y + 2, ARENA_W, 2).fill({ color: 0x18263f });
    for (let x = 30; x < ARENA_W; x += 64) {
      farG.rect(x, y + 3, 5, 5).fill({ color: rnd() > 0.5 ? 0x2f7fd0 : 0x1d3a63 });
    }
  }

  // --- 바닥층
  const TILE = 40;
  const P = { plate: 0x3c5390, lit: 0x6786c8, dark: 0x22315a, line: 0x0d1424, rivet: 0x8aa3dc };
  const COLS = Math.ceil(ARENA_W / TILE);
  const ROWS = Math.ceil(ARENA_H / TILE);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = r * TILE;
      const roll = rnd();

      if (roll > 0.9) {
        // 격자망 — 아래 기계실이 비친다. 창살만 얹는다.
        for (let i = 4; i < TILE - 2; i += 7) {
          groundG.rect(x + i, y + 2, 3, TILE - 4).fill({ color: 0x1a2540, alpha: 0.92 });
        }
        groundG.rect(x + 1, y + 1, TILE - 2, 2).fill({ color: P.dark });
        groundG.rect(x + 1, y + TILE - 3, TILE - 2, 2).fill({ color: P.dark });
        continue;
      }

      // 덩어리진 타일 — 굵은 어두운 윤곽이 X 배경의 인상을 만든다
      groundG.rect(x, y, TILE, TILE).fill({ color: P.line });
      groundG.rect(x + 2, y + 2, TILE - 4, TILE - 4).fill({ color: P.plate });
      groundG.rect(x + 2, y + 2, TILE - 4, 3).fill({ color: P.lit });
      groundG.rect(x + 2, y + 2, 3, TILE - 4).fill({ color: P.lit });
      groundG.rect(x + 2, y + TILE - 6, TILE - 4, 4).fill({ color: P.dark });
      groundG.rect(x + TILE - 6, y + 2, 4, TILE - 4).fill({ color: P.dark });
      if (roll > 0.72) {
        groundG.rect(x + 7, y + 7, 3, 3).fill({ color: P.rivet });
        groundG.rect(x + TILE - 10, y + TILE - 10, 3, 3).fill({ color: P.rivet });
      }
    }
  }

  // --- 발광 배선 — 바닥을 가로지르는 에너지관
  for (let r = 3; r < ROWS; r += 7) {
    const y = r * TILE + TILE / 2 - 4;
    groundG.rect(0, y - 2, ARENA_W, 12).fill({ color: 0x0b1120 });
    groundG.rect(0, y + 1, ARENA_W, 6).fill({ color: 0x1c4468 });
    groundG.rect(0, y + 2, ARENA_W, 2).fill({ color: 0x2f7ba0 });
    for (let x = 24; x < ARENA_W; x += 80) {
      groundG.rect(x, y - 4, 10, 16).fill({ color: 0x27385f });
      groundG.rect(x + 3, y - 1, 4, 10).fill({ color: 0x4ea6c8 });
    }
  }

  // --- 대형 발전기
  for (let i = 0; i < 5; i++) {
    const gx = 120 + Math.floor(rnd() * (ARENA_W - 240));
    const gy = 120 + Math.floor(rnd() * (ARENA_H - 240));
    groundG.circle(gx, gy, 46).fill({ color: 0x121b33 });
    groundG.circle(gx, gy, 42).fill({ color: 0x2c3f6e });
    groundG.circle(gx, gy, 30).stroke({ color: 0x4a68ab, width: 3 });
    groundG.circle(gx, gy, 18).fill({ color: 0x1a3b5e });
    groundG.circle(gx, gy, 12).fill({ color: 0x2f7ba0 });
    groundG.circle(gx, gy, 6).fill({ color: 0x7fc9e0 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      groundG.rect(gx + Math.cos(a) * 36 - 2, gy + Math.sin(a) * 36 - 2, 4, 4).fill({ color: 0x7d97d4 });
    }
  }

  // --- 경계벽 — 노란 경고띠
  for (const [bx, by, bw, bh] of [
    [0, 0, ARENA_W, 8], [0, ARENA_H - 8, ARENA_W, 8],
    [0, 0, 8, ARENA_H], [ARENA_W - 8, 0, 8, ARENA_H],
  ]) {
    groundG.rect(bx, by, bw, bh).fill({ color: 0x10182c });
    const along = bw > bh;
    const n = Math.ceil((along ? bw : bh) / 14);
    for (let i = 0; i < n; i += 2) {
      if (along) groundG.rect(bx + i * 14, by + 1, 14, bh - 2).fill({ color: 0xf0c020 });
      else groundG.rect(bx + 1, by + i * 14, bw - 2, 14).fill({ color: 0xf0c020 });
    }
  }

  foeLayer.sortableChildren = true;
  let hero: AnimView | null = null;
  let heroScale = 1;
  let charDef: HordeChar = CHAR_DEFS[0];
  let shotColor = 0xff8a2c;
  let shotCore = 0xfff0b0;

  const droneG = new Graphics();
  world.addChild(droneG);

  // ------------------------------------------------------------ HUD
  const hudBar = new Graphics();
  ui.addChild(hudBar);
  const mono = { fontFamily: 'monospace', fontSize: 9, fill: 0xcfe0ff } as const;

  const timeLabel = new Text({ text: '', style: { ...mono, fontSize: 13, fill: 0xffffff } });
  timeLabel.anchor.set(0.5, 0);
  timeLabel.position.set(W / 2, 1);
  const killLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0xffd85c } });
  killLabel.anchor.set(1, 0);
  killLabel.position.set(W - 6, 3);
  const lvLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0x8ef0ff } });
  lvLabel.position.set(6, 3);
  const hintLabel = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8a97c4 } });
  hintLabel.anchor.set(0.5, 1);
  hintLabel.position.set(W / 2, H - 3);
  ui.addChild(timeLabel, killLabel, lvLabel, hintLabel);

  const centerLabel = new Text({ text: '', style: { ...mono, fontSize: 15, fill: 0xffffff } });
  centerLabel.anchor.set(0.5);
  centerLabel.position.set(W / 2, H / 2 - 14);
  const subLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0xc9d6ff } });
  subLabel.anchor.set(0.5);
  subLabel.position.set(W / 2, H / 2 + 8);
  ui.addChild(centerLabel, subLabel);

  const cardG = new Graphics();
  const cardTexts: Text[] = [];
  const cardBadges: Text[] = [];
  ui.addChild(cardG);
  const charBtnLabel = new Text({ text: '다른 캐릭터로', style: { ...mono, fontSize: 9, fill: 0xc9d6ff } });
  charBtnLabel.anchor.set(0.5);
  charBtnLabel.visible = false;
  charBtnLabel.position.set(W / 2, H - 33);
  ui.addChild(charBtnLabel);
  for (let i = 0; i < 3; i++) {
    const name = new Text({ text: '', style: { ...mono, fontSize: 11, fill: 0xffffff } });
    name.anchor.set(0.5);
    const desc = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0xa8b6e0 } });
    desc.anchor.set(0.5);
    cardTexts.push(name, desc);
    const badge = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0xffd85c } });
    badge.anchor.set(0.5);
    badge.visible = false;
    cardBadges.push(badge);
    ui.addChild(name, desc, badge);
  }
  // cardG 는 이 둘보다 뒤에 붙었으므로 그대로 두면 어두운 판이 글자를 덮는다.
  // 다시 addChild 해서 맨 위로 올린다.
  ui.addChild(centerLabel, subLabel);

  // 본편 가상패드(JUMP/FIRE/WPN)는 이 모드에 안 맞는다 — 여기선 점프도
  // 수동사격도 없어서 버튼 넷 중 셋이 아무것도 안 하고, 그러면서 레벨업
  // 카드 위를 덮는다. 이 모드에 필요한 것만 직접 그린다: 이동 + 대시.
  input.disableTouch();
  const padG = new Graphics();
  const dashLabel = new Text({ text: 'DASH', style: { fontFamily: 'monospace', fontSize: 8, fill: 0x8ef0ff } });
  dashLabel.anchor.set(0.5);
  dashLabel.visible = false;
  ui.addChild(padG, dashLabel);

  // ------------------------------------------------------------ 상태
  const foes: Foe[] = [];
  const bullets: Bullet[] = [];
  const gems: Gem[] = [];
  const parts: Part[] = [];
  const rings: Ring[] = [];
  const bolts: Bolt[] = [];
  const pools = new Map<FoeKind, AnimView[]>();
  const grid: Foe[][] = Array.from({ length: GRID_W * GRID_H }, () => []);
  const cellIndex = (x: number, y: number): number => {
    const cx = Math.floor(x / GRID_CELL);
    const cy = Math.floor(y / GRID_CELL);
    if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) return -1;
    return cy * GRID_W + cx;
  };

  let px = ARENA_W / 2;
  let py = ARENA_H / 2;
  let facing = 1;
  let hp = 100;
  let maxHp = 100;
  let iframe = 0;
  let dashTimer = 0;
  let dashCd = 0;
  let dashDx = 1;
  let dashDy = 0;

  let time = 0;
  let kills = 0;
  let level = 1;
  let xp = 0;
  let xpNeed = 4;
  let spawnAcc = 0;
  let fireAcc = 0;
  let surgeAt = 32;
  let shake = 0;
  let hitstop = 0;
  let phase: 'select' | 'play' | 'pick' | 'dead' = 'select';
  let selIndex = 0;
  /** 사격 자세를 유지하는 남은 시간 — 0보다 크면 공격 모션을 재생한다 */
  let attackHold = 0;
  let attackBeat = 0;
  /** 콤보 태그를 가진 시트(제로)에서 몇 단째를 틀 차례인지 */
  let comboStep = 0;
  /** 이동 표시용 — 몸 방향(facing)과 별개로 실제 진행 방향을 들고 있는다 */
  let moveDirX = 0;
  let moveDirY = 0;
  let dustAcc = 0;
  /** run_attack 이 없는 시트에서 걷기와 휘두르기를 번갈아 쓰기 위한 간격 */
  let swingGap = 0;
  /** 레벨업 카드 한 장 — 능력치이거나 특수무기(신규/강화)다 */
  type PickOption =
    | { kind: 'stat'; up: Upgrade }
    | { kind: 'weapon'; def: SpecialDef; lv: number };

  let pickIndex = 0;
  let pickList: PickOption[] = [];
  let deadTimer = 0;

  // 레벨업 카드는 손가락으로 직접 짚는 게 맞다. 가상 스틱으로 커서를 옮겨
  // 버튼으로 확정하는 방식은 눈앞에 카드가 세 장 떠 있는데도 조작이
  // 한 단계 겉돌아서 안 맞는다. 키보드 ←→/Z 도 그대로 둔다.
  const cardRects: { x: number; y: number; w: number; h: number }[] = [];
  /** 사망 화면의 "캐릭터 변경" 영역 — 그 밖을 누르면 같은 캐릭터로 재시도한다 */
  const BTN_CHAR = { x: W / 2 - 62, y: H - 44, w: 124, h: 22 };
  /** 캔버스 좌표 → 게임 좌표. 백버퍼가 W×H 고정이라 비율만 맞추면 된다 */
  const toGame = (e: PointerEvent): { x: number; y: number } => {
    const r = app.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  };
  // 이동은 왼쪽 어디를 짚어도 그 자리가 원점이 되는 스틱이다. 고정 위치
  // 패드는 손가락이 조금만 미끄러져도 입력이 끊긴다.
  const STICK = { dead: 5, radius: 24, drag: 28 };
  const DASH_BTN = { x: W - 44, y: H - 44, r: 27 };
  let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  let dashId: number | null = null;
  let touchDash = false;
  let touchMode = false;

  // 브라우저가 드래그를 스크롤/확대 제스처로 가져가면 pointercancel 이 나거나
  // move 가 끊긴다. 그러면 스틱이 마지막 방향에 붙박인다 — touch-action 을
  // 꺼서 제스처 자체가 시작되지 않게 하는 게 근본 처방이다.
  app.canvas.style.touchAction = 'none';

  app.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'touch') touchMode = true;
    e.preventDefault();
    const p = toGame(e);

    const inside = (r: { x: number; y: number; w: number; h: number }): boolean =>
      p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

    if (phase === 'select') {
      for (let i = 0; i < selRects.length; i++) {
        if (!inside(selRects[i])) continue;
        // 짚은 캐릭터로 바로 시작한다 — 골랐다가 다시 확정하는 두 단계는
        // 손가락으로 하면 번거롭기만 하다.
        selIndex = i;
        startRun();
        break;
      }
      return;
    }
    if (phase === 'pick') {
      for (let i = 0; i < cardRects.length && i < pickList.length; i++) {
        if (!inside(cardRects[i])) continue;
        pickIndex = i;
        choosePick();
        break;
      }
      return;
    }
    if (phase === 'dead') {
      if (deadTimer <= 0.5) return;
      if (inside(BTN_CHAR)) { phase = 'select'; return; }
      reset();
      return;
    }

    if (Math.hypot(p.x - DASH_BTN.x, p.y - DASH_BTN.y) <= DASH_BTN.r * 1.25) {
      dashId = e.pointerId;
      touchDash = true;
    } else if (stick === null) {
      stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    }
    try {
      app.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 캡처 실패는 무시 — 경계 밖 추적만 약해질 뿐 나머지는 그대로 동작한다
    }
  });

  app.canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!stick || e.pointerId !== stick.id) return;
    e.preventDefault();
    const p = toGame(e);
    let dx = p.x - stick.ox;
    let dy = p.y - stick.oy;
    // 너무 멀어지면 원점을 손가락 쪽으로 끌어당긴다 — 미끄러져도 계속 조작된다
    const d = Math.hypot(dx, dy);
    if (d > STICK.drag) {
      const pull = (d - STICK.drag) / d;
      stick.ox += dx * pull;
      stick.oy += dy * pull;
    }
    stick.x = p.x;
    stick.y = p.y;
  });

  const endPointer = (e: PointerEvent): void => {
    if (stick && e.pointerId === stick.id) stick = null;
    if (dashId === e.pointerId) dashId = null;
  };
  const releaseAll = (): void => {
    stick = null;
    dashId = null;
    touchDash = false;
  };
  // 손가락을 놓친 경로가 하나라도 새면 그 방향으로 영구히 밀리므로
  // 끝날 수 있는 모든 경로를 다 잡는다. 이미 지워진 손가락이면 조용히 무시된다.
  for (const target of [app.canvas, window] as (HTMLCanvasElement | Window)[]) {
    target.addEventListener('pointerup', endPointer as EventListener);
    target.addEventListener('pointercancel', endPointer as EventListener);
  }
  app.canvas.addEventListener('lostpointercapture', endPointer);
  // 화면이 가려지거나 포커스를 잃으면 up 이 아예 안 오는 경우가 있다
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });

  // 시작은 1발이다. 처음부터 화면을 덮으면 도달점이 없어서 "확 늘었다"는
  // 순간이 안 생기고, 가만히 있어도 사방이 정리돼 버린다.
  // 탄이 화면을 덮는 상태는 여기서 쌓아 올려 도달하는 곳이지 출발점이 아니다.
  const w: Weapon = {
    interval: 0.16,
    shots: 1,
    spread: 0.06,
    dmg: 6,
    speed: 330,
    // 시작부터 관통 1을 준다. 1발이 한 마리에서 멈추면 어느 방향도 못 뚫어
    // 적이 무조건 쌓이고, 20초 안에 사방이 막혀 손쓸 수가 없다.
    pierce: 1,
    drones: 0,
    magnet: 40,
  };

  const taken: Record<string, number> = {};

  const UPGRADES: Upgrade[] = [
    {
      id: 'rapid', name: '연사 강화', desc: '발사 간격 -20%', max: 9,
      apply: () => { w.interval = Math.max(0.026, w.interval * 0.8); },
    },
    {
      id: 'spread', name: '확산탄', desc: '동시 발사 +2', max: 9,
      apply: () => { w.shots += 2; w.spread = Math.min(1.6, w.spread + 0.09); },
    },
    {
      id: 'power', name: '위력 증폭', desc: '탄 위력 +3', max: 9,
      apply: () => { w.dmg += 3; },
    },
    {
      id: 'pierce', name: '관통 탄자', desc: '관통 +1', max: 5,
      apply: () => { w.pierce += 1; },
    },
    {
      id: 'velo', name: '가속 장전', desc: '탄속 +70', max: 4,
      apply: () => { w.speed += 70; },
    },
    {
      id: 'drone', name: '옵션 유닛', desc: '주위를 도는 포탑 +1', max: 4,
      apply: () => { w.drones += 1; },
    },
    {
      id: 'legs', name: '부스터 다리', desc: '이동속도 +12%', max: 5,
      apply: () => { speedMul += 0.12; },
    },
    {
      id: 'magnet', name: '자력 코어', desc: '경험치 흡수 범위 +40', max: 4,
      apply: () => { w.magnet += 40; },
    },
    {
      id: 'armor', name: '수리 팩', desc: '최대체력 +20, 전량 회복', max: 99,
      apply: () => { maxHp += 20; hp = maxHp; },
    },
  ];

  let speedMul = 1;

  // ------------------------------------------------------------ 헬퍼
  function spawnPart(x: number, y: number, n: number, color: number, power: number): void {
    if (parts.length + n > MAX_PARTS) parts.splice(0, parts.length + n - MAX_PARTS);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.35 + Math.random() * 0.9);
      const life = 0.16 + Math.random() * 0.26;
      parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, max: life,
        color,
        size: 1 + Math.floor(Math.random() * 2),
      });
    }
  }

  function takeView(kind: FoeKind): AnimView {
    const pool = pools.get(kind);
    const v = pool?.pop();
    if (v) {
      v.visible = true;
      return v;
    }
    const nv = new AnimView(sheets.get(kind)!);
    nv.play('move');
    return nv;
  }

  function spawnFoe(elite: boolean): void {
    if (foes.length >= MAX_FOES) return;
    const kind = KIND_LIST[Math.floor(Math.random() * KIND_LIST.length)];
    const def = KINDS[kind];
    // 원형으로 뿌리면 화면 비율이 안 맞는 축의 개체가 한참을 걸어온다.
    // 화면(세로) 비율에 맞춘 타원 바로 바깥에 뿌려야 스폰 즉시 압박이 된다.
    const a = Math.random() * Math.PI * 2;
    const far = 1 + Math.random() * 0.22;
    const x = clamp(px + Math.cos(a) * 175 * far, 14, ARENA_W - 14);
    const y = clamp(py + Math.sin(a) * 290 * far, 14, ARENA_H - 14);

    // 화력이 지수로 커지므로 적 체력도 그렇게 따라가야 한다.
    // 선형으로 두면 30초 넘어가는 순간 스폰 즉시 증발해서 화면이 텅 빈다.
    // 난이도는 체력이 아니라 머릿수가 끌고 간다. 체력을 가파르게 올리면
    // 킬 수가 줄고 → 레벨이 안 오르고 → 화력이 멈춰서 교착에 빠진다.
    const grow = 1 + time * 0.05 + time * time * 0.0012;
    const view = takeView(kind);
    const scale = def.scale * (elite ? 1.6 : 1);
    view.scale.set(scale, scale);
    view.tint = elite ? 0xffb0b0 : 0xffffff;
    view.alpha = 1;
    foeLayer.addChild(view);

    foes.push({
      kind, x, y, kx: 0, ky: 0,
      hp: def.hp * grow * (elite ? 7 : 1),
      def, scale, elite, flash: 0, view, alive: true,
    });
  }

  /**
   * 경험치를 떨군다. 상한을 넘으면 가장 오래된 것을 새 것에 합친다 —
   * 그냥 쌓아두면 초당 수십 개가 안 주워진 채 남아 후반에 바닥이 온통
   * 경험치로 덮여서 적도 탄도 안 보인다. 버리지 않고 합치므로 총량은 같다.
   */
  function pushGem(x: number, y: number, val: number): void {
    let v = val;
    while (gems.length >= MAX_GEMS) v += gems.shift()!.val;
    const a = Math.random() * Math.PI * 2;
    gems.push({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, val: v, alive: true });
  }

  /** 화면에서 치우고 뷰를 재사용 풀로 돌려보낸다 */
  function retire(f: Foe): void {
    foeLayer.removeChild(f.view);
    f.view.visible = false;
    let pool = pools.get(f.kind);
    if (!pool) pools.set(f.kind, (pool = []));
    pool.push(f.view);
    const idx = foes.indexOf(f);
    if (idx >= 0) foes.splice(idx, 1);
  }

  function killFoe(f: Foe): void {
    if (!f.alive) return;
    f.alive = false;
    kills++;
    spawnPart(f.x, f.y - 8, f.elite ? 26 : 9, f.elite ? 0xffc45c : 0xff9a4c, f.elite ? 190 : 130);
    const drops = f.elite ? 8 : 1;
    for (let i = 0; i < drops; i++) {
      pushGem(f.x, f.y - 6, f.def.xp * (f.elite ? 3 : 1));
    }
    shake = Math.max(shake, f.elite ? 6 : 1.2);
    retire(f);
  }

  function fireOne(ax: number, ay: number, ox: number, oy: number, dmg: number): void {
    if (bullets.length >= MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS + 1);
    bullets.push({
      x: ox, y: oy,
      vx: Math.cos(ax) * w.speed,
      vy: Math.sin(ax) * w.speed * 0.82,
      life: ay,
      dmg,
      pierce: w.pierce,
      lastHit: null,
      alive: true,
      shape: 'tracer',
      color: shotColor,
      r: 3,
      spin: 0,
      angle: 0,
      homing: 0,
      boomR: 0,
      boomDmg: 0,
    });
  }

  /** 특수무기 탄 — 버스터와 달리 무기마다 모양·색·거동이 다르다 */
  function addBullet(b: Partial<Bullet> & { x: number; y: number; vx: number; vy: number; dmg: number }): void {
    if (bullets.length >= MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS + 1);
    bullets.push({
      life: 1, pierce: 0, lastHit: null, alive: true,
      shape: 'orb', color: 0xffffff, r: 4, spin: 0, angle: 0,
      homing: 0, boomR: 0, boomDmg: 0,
      ...b,
    } as Bullet);
  }

  /** 반경 안의 적을 한꺼번에 때린다 (크래시 봄버·번개) */
  function blast(x: number, y: number, radius: number, dmg: number, color: number): void {
    rings.push({ x, y, r: radius, life: 0.24, max: 0.24, color });
    spawnPart(x, y, 12, 0xff9a4c, 150);
    shake = Math.max(shake, 3);
    for (let j = foes.length - 1; j >= 0; j--) {
      const f = foes[j];
      const dx = f.x - x;
      const dy = (f.y - 8 - y) * 1.2;
      if (dx * dx + dy * dy > radius * radius) continue;
      f.hp -= dmg;
      f.flash = 0.07;
      f.view.tint = 0xff5c5c;
      if (f.hp <= 0) killFoe(f);
    }
  }

  function nearestFoe(fx: number, fy: number): Foe | null {
    let best: Foe | null = null;
    let bd = Infinity;
    for (const f of foes) {
      const dx = f.x - fx;
      const dy = (f.y - fy) * 1.25;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  function shoot(): void {
    const target = nearestFoe(px, py);
    const base = target ? Math.atan2((target.y - 8) - (py - 10), target.x - px) : facing > 0 ? 0 : Math.PI;
    attackHold = 0.2;
    const muzX = px + facing * 9;
    const muzY = py - 10;
    for (let i = 0; i < w.shots; i++) {
      const t = w.shots === 1 ? 0 : i / (w.shots - 1) - 0.5;
      fireOne(base + t * w.spread, 0.6, muzX, muzY, w.dmg);
    }
    spawnPart(muzX + Math.cos(base) * 5, muzY + Math.sin(base) * 5, 2, 0xfff2c0, 60);

    for (let d = 0; d < w.drones; d++) {
      const ang = droneAngle + (d / w.drones) * Math.PI * 2;
      const dx = px + Math.cos(ang) * 30;
      const dy = py - 12 + Math.sin(ang) * 20;
      const dt2 = nearestFoe(dx, dy);
      const da = dt2 ? Math.atan2((dt2.y - 8) - dy, dt2.x - dx) : base;
      fireOne(da, 0.5, dx, dy, Math.max(2, Math.round(w.dmg * 0.6)));
    }
  }

  let droneAngle = 0;

  // ------------------------------------------------------------ 특수무기
  //
  // 이 장르의 뽑기는 능력치가 아니라 "무기가 하나 더 붙는" 데서 온다.
  // 전부 록맨 시리즈에 실제로 나왔던 특수무기이고, 수치가 아니라 거동이
  // 서로 다르게 잡았다 — 전방위/추적/관통/폭발/즉발/근접.
  //
  // 위력은 레벨업 카드 한 장 값에 맞췄다. 카드는 레벨당 한 장뿐이라
  // 무기를 집으면 능력치를 못 집으므로, 둘의 값이 비슷해야 곡선이 안 깨진다.
  interface SpecialDef {
    id: string;
    name: string;
    /** 레벨을 받아 카드에 쓸 설명을 만든다 */
    desc: (lv: number) => string;
    color: number;
    max: number;
    /** 재사용 대기시간. passive 무기는 안 쓴다 */
    interval?: (lv: number) => number;
    fire?: (lv: number) => void;
  }

  const SPECIALS: SpecialDef[] = [
    {
      id: 'metal_blade',
      name: '메탈 블레이드',
      color: 0xd8e2f0,
      max: 5,
      desc: (lv) => (lv === 0 ? '전방위로 관통하는 톱날' : `날 ${4 + lv + 1}개 · 위력 ${8 + 4 * (lv + 1)}`),
      interval: (lv) => 0.55 - 0.05 * lv,
      fire: (lv) => {
        const n = 4 + lv;
        const dmg = 8 + 4 * lv;
        for (let i = 0; i < n; i++) {
          const a = bladeSpin + (i / n) * Math.PI * 2;
          addBullet({
            x: px, y: py - 10,
            vx: Math.cos(a) * 260, vy: Math.sin(a) * 260 * 0.8,
            life: 0.9, dmg, pierce: 2 + lv,
            shape: 'blade', color: 0xd8e2f0, r: 5, spin: 16,
          });
        }
        bladeSpin += 0.5;
      },
    },
    {
      id: 'rolling_shield',
      name: '롤링 실드',
      color: 0x6ec8ff,
      max: 5,
      desc: (lv) => (lv === 0 ? '몸을 도는 방어막' : `구슬 ${lv + 2}개 · 접촉 ${6 + 4 * (lv + 1)}`),
      // passive — interval/fire 없음. 아래 updateOrbs() 가 처리한다.
    },
    {
      id: 'homing_torpedo',
      name: '홈잉 토피도',
      color: 0xffa8dc,
      max: 5,
      desc: (lv) => (lv === 0 ? '알아서 쫓아가는 유도탄' : `유도탄 ${1 + Math.floor((lv + 1) / 2)}발 · 위력 ${26 + 12 * (lv + 1)}`),
      interval: (lv) => 0.85 - 0.08 * lv,
      fire: (lv) => {
        const n = 1 + Math.floor(lv / 2);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          addBullet({
            x: px, y: py - 10,
            vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 * 0.8,
            life: 2.4, dmg: 26 + 12 * lv, pierce: 0,
            shape: 'orb', color: 0xffa8dc, r: 5, homing: 5.5,
          });
        }
      },
    },
    {
      id: 'storm_tornado',
      name: '스톰 토네이도',
      color: 0x9fe8ff,
      max: 5,
      desc: (lv) => (lv === 0 ? '앞을 쓸어버리는 회오리' : `크기 ${18 + 3 * (lv + 1)} · 위력 ${7 + 4 * (lv + 1)}`),
      interval: (lv) => 1.5 - 0.14 * lv,
      fire: (lv) => {
        const t = nearestFoe(px, py);
        const a = t ? Math.atan2(t.y - 8 - (py - 10), t.x - px) : facing > 0 ? 0 : Math.PI;
        addBullet({
          x: px, y: py - 10,
          vx: Math.cos(a) * 95, vy: Math.sin(a) * 95 * 0.8,
          life: 1.7, dmg: 7 + 4 * lv, pierce: 999,
          shape: 'orb', color: 0x9fe8ff, r: 18 + 3 * lv, spin: 9,
        });
      },
    },
    {
      id: 'crash_bomber',
      name: '크래시 봄버',
      color: 0xff8a5c,
      max: 5,
      desc: (lv) => (lv === 0 ? '박히고 터지는 폭탄' : `폭발 ${34 + 7 * (lv + 1)} · 위력 ${22 + 11 * (lv + 1)}`),
      interval: (lv) => 1.25 - 0.11 * lv,
      fire: (lv) => {
        const t = nearestFoe(px, py);
        const a = t ? Math.atan2(t.y - 8 - (py - 10), t.x - px) : facing > 0 ? 0 : Math.PI;
        addBullet({
          x: px, y: py - 10,
          vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 * 0.8,
          life: 1.1, dmg: 0, pierce: 0,
          shape: 'orb', color: 0xff8a5c, r: 5, spin: 7,
          boomR: 34 + 7 * lv, boomDmg: 22 + 11 * lv,
        });
      },
    },
    {
      id: 'triad_thunder',
      name: '트라이어드 썬더',
      color: 0xffe86b,
      max: 5,
      desc: (lv) => (lv === 0 ? '주변을 내리치는 번개' : `${2 + lv + 1}발 · 위력 ${18 + 10 * (lv + 1)}`),
      interval: (lv) => 1.8 - 0.16 * lv,
      fire: (lv) => {
        const n = 2 + lv;
        const dmg = 18 + 10 * lv;
        // 가까운 적부터 골라 때린다 — 무작위로 흩뿌리면 허공을 치는 일이 잦다
        const near = foes
          .filter((f) => Math.abs(f.x - px) < 200 && Math.abs(f.y - py) < 130)
          .slice(0, n * 3);
        for (let i = 0; i < n && near.length; i++) {
          const f = near.splice(Math.floor(Math.random() * near.length), 1)[0];
          bolts.push({ x: f.x, y: f.y - 8, life: 0.14, color: 0xffe86b });
          blast(f.x, f.y - 8, 20, dmg, 0xffe86b);
        }
      },
    },
  ];

  const MAX_SPECIALS = 4;
  /** 보유 무기 id → 레벨(1부터) */
  const owned = new Map<string, number>();
  const cooldowns = new Map<string, number>();
  const orbs: Orb[] = [];
  let bladeSpin = 0;

  function syncOrbs(): void {
    const lv = owned.get('rolling_shield') ?? 0;
    orbs.length = 0;
    const n = lv ? lv + 1 : 0;
    for (let i = 0; i < n; i++) orbs.push({ angle: (i / n) * Math.PI * 2, cd: 0 });
  }

  /** 실드 구슬 — 돌면서 닿는 적을 계속 깎는다 */
  function updateOrbs(dt: number): void {
    const lv = owned.get('rolling_shield') ?? 0;
    if (!lv) return;
    const dmg = 6 + 4 * lv;
    for (const o of orbs) {
      o.angle += dt * 2.6;
      o.cd -= dt;
      if (o.cd > 0) continue;
      const ox = px + Math.cos(o.angle) * 36;
      const oy = py - 12 + Math.sin(o.angle) * 24;
      const ci = cellIndex(ox, oy);
      if (ci < 0) continue;
      const cx = Math.floor(ox / GRID_CELL);
      const cy = Math.floor(oy / GRID_CELL);
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        if (gy < 0 || gy >= GRID_H) continue;
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          if (gx < 0 || gx >= GRID_W) continue;
          for (const f of grid[gy * GRID_W + gx]) {
            if (!f.alive) continue;
            const dx = f.x - ox;
            const dy = f.y - 8 - oy;
            const rr = f.def.r * f.scale + 6;
            if (dx * dx + dy * dy > rr * rr) continue;
            f.hp -= dmg;
            f.flash = 0.07;
            f.view.tint = 0xff5c5c;
            spawnPart(ox, oy, 2, 0x8ef0ff, 90);
            if (f.hp <= 0) killFoe(f);
            o.cd = 0.12;
            gy = cy + 2;
            gx = cx + 2;
            break;
          }
        }
      }
    }
  }

  /** 시간이 된 무기를 쏜다 */
  function fireSpecials(dt: number): void {
    for (const def of SPECIALS) {
      const lv = owned.get(def.id) ?? 0;
      if (!lv || !def.fire || !def.interval) continue;
      const left = (cooldowns.get(def.id) ?? 0) - dt;
      if (left > 0) {
        cooldowns.set(def.id, left);
        continue;
      }
      cooldowns.set(def.id, Math.max(0.08, def.interval(lv)));
      def.fire(lv);
    }
  }

  function levelUp(): void {
    level++;
    xp -= xpNeed;
    // 2차식으로 올린다. 선형이면 킬 수가 초당 수십으로 불어나는 순간
    // 레벨이 초당 하나씩 올라 1분 만에 화력이 화면을 다 태워버린다.
    // 계수를 키워 후반 한 레벨이 10초 이상 걸리게 잡았다.
    xpNeed = Math.round(4 + level * 3 + level * level * 0.8);

    // 뽑기 후보 = 새 특수무기 + 보유 무기 강화 + 능력치.
    // 무기 쪽에 가중치를 크게 줘서 뽑기가 이 게임의 중심으로 읽히게 한다.
    const pool: { opt: PickOption; weight: number }[] = [];
    for (const def of SPECIALS) {
      const lv = owned.get(def.id) ?? 0;
      if (lv === 0) {
        if (owned.size < MAX_SPECIALS) pool.push({ opt: { kind: 'weapon', def, lv: 0 }, weight: 4 });
      } else if (lv < def.max) {
        pool.push({ opt: { kind: 'weapon', def, lv }, weight: 3 });
      }
    }
    for (const u of UPGRADES) {
      if ((taken[u.id] ?? 0) < u.max) pool.push({ opt: { kind: 'stat', up: u }, weight: 3 });
    }

    pickList = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      let total = 0;
      for (const p of pool) total += p.weight;
      let r = Math.random() * total;
      let idx = 0;
      for (let j = 0; j < pool.length; j++) {
        r -= pool[j].weight;
        if (r <= 0) { idx = j; break; }
      }
      pickList.push(pool.splice(idx, 1)[0].opt);
    }
    if (!pickList.length) return;
    pickIndex = 0;
    phase = 'pick';
  }

  /** 고른 캐릭터로 갈아끼운다 — 시트·색·기본 능력치가 전부 여기서 정해진다 */
  function setCharacter(def: HordeChar): void {
    charDef = def;
    if (hero) foeLayer.removeChild(hero);
    hero = new AnimView(charSheets.get(def.id)!);
    hero.play('idle');
    heroScale = def.sprite_scale ?? 1;
    hero.scale.set(heroScale, heroScale);
    foeLayer.addChild(hero);

    const si = SHOTS.get(def.id)!;
    shotColor = si.color;
    shotCore = lighten(shotColor, 0.55);
  }

  function startRun(): void {
    setCharacter(CHAR_DEFS[selIndex]);
    reset();
  }

  function choosePick(): void {
    if (phase !== 'pick') return;
    const o = pickList[pickIndex];
    if (!o) return;
    if (o.kind === 'stat') {
      taken[o.up.id] = (taken[o.up.id] ?? 0) + 1;
      o.up.apply();
    } else {
      owned.set(o.def.id, (owned.get(o.def.id) ?? 0) + 1);
      if (o.def.id === 'rolling_shield') syncOrbs();
      // 새로 얻은 무기는 바로 한 번 쏴준다 — 뽑은 게 뭔지 즉시 보여야 한다
      if (o.lv === 0) cooldowns.set(o.def.id, 0);
    }
    phase = 'play';
  }

  function reset(): void {
    for (let i = foes.length - 1; i >= 0; i--) {
      foeLayer.removeChild(foes[i].view);
      foes[i].view.visible = false;
      let pool = pools.get(foes[i].kind);
      if (!pool) pools.set(foes[i].kind, (pool = []));
      pool.push(foes[i].view);
    }
    foes.length = 0;
    bullets.length = 0;
    gems.length = 0;
    parts.length = 0;
    rings.length = 0;
    bolts.length = 0;
    owned.clear();
    cooldowns.clear();
    orbs.length = 0;
    bladeSpin = 0;
    comboStep = 0;
    px = ARENA_W / 2; py = ARENA_H / 2;
    // 캐릭터마다 체력과 탄이 다르다. 검증해 둔 곡선에서 크게 벗어나지 않도록
    // 원본 수치를 그대로 쓰지 않고 좁은 폭으로만 반영한다.
    maxHp = Math.round(charDef.base_stats.hp * 1.2);
    hp = maxHp;
    iframe = 0;
    dashTimer = 0; dashCd = 0;
    attackHold = 0; attackBeat = 0;
    time = 0; kills = 0; level = 1; xp = 0; xpNeed = 4;
    spawnAcc = 0; fireAcc = 0; surgeAt = 32; shake = 0; hitstop = 0;
    speedMul = 1;
    w.interval = 0.16; w.shots = 1; w.spread = 0.06;
    const si = SHOTS.get(charDef.id)!;
    w.dmg = 5 + Math.round(si.power * 0.15);
    w.speed = Math.round(si.speed * 1.25);
    w.pierce = 1; w.drones = 0; w.magnet = 40;
    for (const k of Object.keys(taken)) delete taken[k];
    phase = 'play';
    deadTimer = 0;
  }

  // ------------------------------------------------------------ 캐릭터 선택
  const selLayer = new Container();
  ui.addChild(selLayer);
  const selG = new Graphics();
  selLayer.addChild(selG);
  // 세로 화면이라 9명을 한 줄로 못 세운다 — 3×3 격자로 놓는다
  const SEL_COLS = 3;
  const CELL_W = Math.floor(W / SEL_COLS);
  const CELL_H = 108;
  const SEL_TOP = 62;
  const selViews: AnimView[] = [];
  const selNames: Text[] = [];
  const selRects: { x: number; y: number; w: number; h: number }[] = [];

  for (let i = 0; i < CHAR_DEFS.length; i++) {
    const def = CHAR_DEFS[i];
    const col = i % SEL_COLS;
    const row = Math.floor(i / SEL_COLS);
    const cx = col * CELL_W + CELL_W / 2;
    const cyTop = SEL_TOP + row * CELL_H;
    const foot = cyTop + CELL_H - 26;

    const v = new AnimView(charSheets.get(def.id)!);
    v.play('idle');
    const s = def.sprite_scale ?? 1;
    v.scale.set(s, s);
    v.position.set(cx, foot);
    selLayer.addChild(v);
    selViews.push(v);

    const n = new Text({ text: SHORT_NAMES.get(def.id) ?? def.name, style: { ...mono, fontSize: 9, fill: 0x9fb0dd } });
    n.anchor.set(0.5, 0);
    n.position.set(cx, foot + 4);
    selLayer.addChild(n);
    selNames.push(n);

    selRects.push({ x: col * CELL_W, y: cyTop, w: CELL_W, h: CELL_H - 4 });
  }

  const selTitle = new Text({ text: '캐릭터 선택', style: { ...mono, fontSize: 14, fill: 0xffffff } });
  selTitle.anchor.set(0.5);
  selTitle.position.set(W / 2, 28);
  const selHint = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8a97c4 } });
  selHint.anchor.set(0.5);
  selHint.position.set(W / 2, H - 46);
  selHint.style.align = 'center';
  selLayer.addChild(selTitle, selHint);

  function drawSelect(dtMs: number): void {
    selG.clear();
    selG.rect(0, 0, W, H).fill({ color: 0x070a16 });
    for (let i = 0; i < selRects.length; i++) {
      const r = selRects[i];
      const on = i === selIndex;
      selG.roundRect(r.x + 2, r.y, r.w - 4, r.h, 4).fill({ color: on ? 0x1e3266 : 0x0e1428 });
      selG.roundRect(r.x + 2, r.y, r.w - 4, r.h, 4).stroke({ color: on ? 0x8ef0ff : 0x222c52, width: on ? 2 : 1 });
      selViews[i].update(dtMs);
      selViews[i].alpha = on ? 1 : 0.5;
      selNames[i].style.fill = on ? 0xffffff : 0x7d8cb8;
    }
    const d = CHAR_DEFS[selIndex];
    const si = SHOTS.get(d.id)!;
    selHint.text =
      `${d.name}\n체력 ${Math.round(d.base_stats.hp * 1.2)} · 위력 ${5 + Math.round(si.power * 0.15)} · 탄속 ${Math.round(si.speed * 1.25)}\n▸ 눌러서 시작`;
  }

  // ------------------------------------------------------------ 루프
  app.ticker.add(() => {
    const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 30);

    if (phase === 'select') {
      if (input.pressed('left')) selIndex = (selIndex + CHAR_DEFS.length - 1) % CHAR_DEFS.length;
      if (input.pressed('right')) selIndex = (selIndex + 1) % CHAR_DEFS.length;
      if (input.pressed('up')) selIndex = (selIndex + CHAR_DEFS.length - SEL_COLS) % CHAR_DEFS.length;
      if (input.pressed('down')) selIndex = (selIndex + SEL_COLS) % CHAR_DEFS.length;
      if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) startRun();
      selLayer.visible = phase === 'select';
      if (selLayer.visible) drawSelect(app.ticker.deltaMS);
      input.endFrame();
      return;
    }
    selLayer.visible = false;
    // 캐릭터를 고르기 전에는 아래 로직이 돌 일이 없다
    const hv = hero;
    if (!hv) { input.endFrame(); return; }

    if (phase === 'pick') {
      if (input.pressed('left')) pickIndex = (pickIndex + pickList.length - 1) % pickList.length;
      if (input.pressed('right')) pickIndex = (pickIndex + 1) % pickList.length;
      if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) choosePick();
      drawPick();
      draw(dt);
      input.endFrame();
      return;
    }

    if (phase === 'dead') {
      deadTimer += dt;
      if (deadTimer > 0.5) {
        if (input.pressed('menu') || input.pressed('weapon')) phase = 'select';
        else if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) reset();
      }
      draw(dt);
      input.endFrame();
      return;
    }

    if (hitstop > 0) {
      hitstop -= dt;
      draw(dt);
      input.endFrame();
      return;
    }

    time += dt;
    droneAngle += dt * 2.4;

    // ---- 이동
    let ix = input.axisX;
    let iy = (input.down('down') ? 1 : 0) - (input.down('up') ? 1 : 0);
    if (stick) {
      const sdx = stick.x - stick.ox;
      const sdy = stick.y - stick.oy;
      if (Math.hypot(sdx, sdy) > STICK.dead) { ix = sdx; iy = sdy; }
    }
    const len = Math.hypot(ix, iy);
    if (len > 0) { ix /= len; iy /= len; }

    // 몸은 쏘는 쪽을 본다 — 이동 방향을 따르면 등에서 탄이 나가는 그림이 된다.
    //
    // 대신 그러면 어디로 가는지가 안 읽힌다. 그건 몸 방향으로 풀지 않고
    // 따로 표시한다: 진행 방향 반대쪽으로 발밑 먼지를 뿌리고, 바닥에 방향
    // 화살표를 깐다. 몸은 조준, 발밑은 이동 — 둘이 안 싸운다.
    const aim = nearestFoe(px, py);
    if (aim) facing = aim.x >= px ? 1 : -1;
    else if (ix !== 0) facing = ix > 0 ? 1 : -1;

    moveDirX = ix;
    moveDirY = iy;
    if (len > 0) {
      dustAcc -= dt;
      if (dustAcc <= 0) {
        dustAcc = 0.045;
        parts.push({
          x: px - ix * 7, y: py - 1 - iy * 5,
          vx: -ix * 34 + (Math.random() - 0.5) * 14,
          vy: -iy * 26 + (Math.random() - 0.5) * 10,
          life: 0.3, max: 0.3, color: 0x8ef0ff, size: 2,
        });
      }
    }

    const wantDash = input.pressed('dash') || touchDash;
    touchDash = false;
    dashCd -= dt;
    if (dashTimer > 0) dashTimer -= dt;
    else if (wantDash && dashCd <= 0) {
      dashTimer = DASH_TIME;
      dashCd = DASH_CD;
      dashDx = len > 0 ? ix : facing;
      dashDy = len > 0 ? iy : 0;
      iframe = Math.max(iframe, DASH_TIME + 0.08);
      spawnPart(px, py - 10, 8, 0x8ef0ff, 90);
    }

    if (dashTimer > 0) {
      px += dashDx * DASH_SPEED * dt;
      py += dashDy * DASH_SPEED * 0.78 * dt;
    } else {
      px += ix * BASE_SPEED * speedMul * dt;
      py += iy * BASE_SPEED * speedMul * 0.78 * dt;
    }
    px = clamp(px, 10, ARENA_W - 10);
    py = clamp(py, 20, ARENA_H - 8);

    // 사격 모션. 시트마다 가진 태그가 달라 (임시 도트는 run_attack 이 없다)
    // play() 의 fallback 으로 흘려보낸다.
    if (attackHold > 0) attackHold -= dt;
    attackBeat -= dt;
    const firing = attackHold > 0;
    const moving = len > 0;
    const idleTag = dashTimer > 0 ? 'dash' : moving ? 'run' : 'idle';
    let wantTag = idleTag;
    swingGap -= dt;
    // 콤보 태그가 있는 시트(제로)는 지금 몇 단째인지에 따라 태그가 달라진다
    const comboTag = (): string => {
      const t = comboStep === 0 ? 'attack_main' : `attack_main${comboStep + 1}`;
      return hv.has(t) ? t : 'attack_main';
    };
    if (firing) {
      const moveTag = dashTimer > 0 ? 'dash_attack' : 'run_attack';
      if (!(dashTimer > 0 || moving)) {
        wantTag = comboTag();
      } else if (hv.has(moveTag)) {
        // 이동 전용 공격 태그가 있으면(엑스) 그대로 쓴다 — 걷기와 사격이
        // 한 태그에 들어 있어 고민할 게 없다.
        wantTag = moveTag;
      } else if (hv.has('attack_main')) {
        // 없으면(제로) 걷기와 휘두르기를 번갈아 쓴다. 계속 휘두르게 두면
        // 다리가 한 번도 안 움직여서 미끄러지듯 떠다니는 그림이 된다.
        const swinging = hv.current.startsWith('attack_main') && !hv.finished;
        wantTag = swinging || swingGap <= 0 ? comboTag() : idleTag;
      } else {
        wantTag = idleTag;
      }
    }
    // 콤보 중간 단(attack_main2/3)이 재생 중이면 끊지 않는다 — 매 프레임
    // attack_main 으로 되돌리면 2단 이후가 첫 프레임에서 잘려 안 보인다.
    const inCombo = hv.current.startsWith('attack_main') && !hv.finished;
    if (!(firing && wantTag === 'attack_main' && inCombo)) hv.play(wantTag, idleTag);
    // 공격 태그는 한 번 재생하고 끝나는 것들이라 계속 쏘는 동안에는 다시
    // 틀어줘야 이어져 보인다. 발사 간격(후반 0.027초)에 맞추면 첫 프레임에서
    // 부들거리기만 하므로, 한 번 끝까지 재생된 뒤에만 다시 튼다.
    if (firing && hv.finished && attackBeat <= 0 && wantTag !== idleTag) {
      attackBeat = 0.05;
      // 제로처럼 콤보 태그를 가진 시트는 돌려가며 틀어 같은 동작만
      // 반복되지 않게 한다.
      if (hv.current.startsWith('attack_main')) {
        comboStep = (comboStep + 1) % 3;
        if (moving && !hv.has('run_attack')) {
          // 한 번 휘두르고 나면 걷기를 보여준 뒤 다음 단을 낸다.
          // 여기서 바로 다음 스윙을 틀면 다리가 한 번도 안 움직인다.
          swingGap = 0.3;
          hv.play(idleTag, idleTag);
        } else {
          hv.play(comboTag(), 'attack_main');
        }
      } else {
        hv.restart();
      }
    }
    hv.scale.x = facing * heroScale;
    hv.scale.y = heroScale;
    hv.update(app.ticker.deltaMS);
    hv.position.set(Math.round(px), Math.round(py));
    hv.alpha = iframe > 0 && Math.floor(iframe * 24) % 2 === 0 ? 0.4 : 1;

    // ---- 스폰
    const rate = Math.min(55, 1.6 + time * 0.3);
    spawnAcc += rate * dt;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawnFoe(false); }

    if (time >= surgeAt) {
      surgeAt += 24;
      const elites = 1 + Math.floor(time / 50);
      for (let i = 0; i < elites; i++) spawnFoe(true);
      for (let i = 0; i < 10 + Math.floor(time / 4); i++) spawnFoe(false);
      shake = 7;
    }

    // ---- 자동사격
    fireAcc += dt;
    let guard = 0;
    while (fireAcc >= w.interval && guard++ < 6) {
      fireAcc -= w.interval;
      shoot();
    }
    fireSpecials(dt);

    // ---- 적
    if (iframe > 0) iframe -= dt;

    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      const dx = px - f.x;
      const dy = py - f.y;

      // 뒤처진 개체는 조용히 치운다. 안 치우면 못 죽인 적이 영원히 따라와
      // 쌓이기만 해서, 한 번 밀리는 순간 회복이 불가능한 죽음의 나선이 된다.
      // 스폰 반경보다 넉넉히 바깥이라 화면에서 사라지는 게 보이지는 않는다.
      if (!f.elite && (Math.abs(dx) > 360 || Math.abs(dy) > 620)) {
        retire(f);
        continue;
      }

      const d = Math.hypot(dx, dy) || 1;
      // 초반 접근을 느리게 잡는다 — 화력이 1발일 때 정속으로 몰려오면
      // 포위가 끝나는 데 20초도 안 걸린다.
      const sp = f.def.speed * (f.elite ? 0.8 : 1) * Math.min(1.2, 0.78 + time * 0.0045);
      f.x += (dx / d) * sp * dt + f.kx * dt;
      f.y += (dy / d) * sp * 0.78 * dt + f.ky * dt;
      f.kx *= 0.86;
      f.ky *= 0.86;

      if (f.flash > 0) {
        f.flash -= dt;
        if (f.flash <= 0) f.view.tint = f.elite ? 0xffb0b0 : 0xffffff;
      }

      f.view.scale.x = dx < 0 ? -f.scale : f.scale;
      f.view.update(app.ticker.deltaMS);
      f.view.position.set(Math.round(f.x), Math.round(f.y));
      f.view.zIndex = f.y;

      const rr = f.def.r * f.scale + PLAYER_R;
      if (iframe <= 0 && dx * dx + dy * dy < rr * rr) {
        hp -= f.def.touch * (f.elite ? 2 : 1);
        iframe = 0.72;
        hitstop = 0.055;
        shake = 8;
        spawnPart(px, py - 10, 14, 0xff5c5c, 150);
        f.kx = -(dx / d) * 260;
        f.ky = -(dy / d) * 260;
        if (hp <= 0) {
          hp = 0;
          phase = 'dead';
          deadTimer = 0;
          spawnPart(px, py - 10, 40, 0xffffff, 220);
          shake = 12;
        }
      }
    }
    hv.zIndex = py + 0.5;

    // 적을 격자에 담는다. 탄 700발 × 적 200마리를 전수 비교하면 프레임이
    // 반토막 난다 — 탄은 자기 주변 칸만 본다. 밀어내기도 같은 격자를 쓴다.
    for (const c of grid) c.length = 0;
    for (const f of foes) {
      const ci = cellIndex(f.x, f.y);
      if (ci >= 0) grid[ci].push(f);
    }

    // 서로 밀어낸다. 없으면 전부 한 점에 겹쳐 "한 마리"처럼 보인다 —
    // 몰려온다는 압박은 개체가 벽처럼 퍼져 있어야 생긴다.
    for (const cell of grid) {
      // 한 칸에 몰릴 때 쌍 비교가 제곱으로 늘어나 프레임을 잡아먹는다.
      // 겹침을 완전히 없앨 필요는 없고 뭉치지만 않으면 되므로 앞쪽만 본다.
      const n = Math.min(cell.length, 10);
      for (let i = 0; i < n; i++) {
        const a = cell[i];
        for (let j = i + 1; j < cell.length; j++) {
          const b = cell[j];
          const dx = b.x - a.x;
          const dy = (b.y - a.y) * 1.35;
          const min = (a.def.r * a.scale + b.def.r * b.scale) * 0.95;
          const d2 = dx * dx + dy * dy;
          if (d2 > min * min) continue;
          const d = Math.sqrt(d2) || 0.5;
          const push = ((min - d) / d) * 150;
          a.kx -= dx * push * dt;
          a.ky -= dy * push * dt;
          b.kx += dx * push * dt;
          b.ky += dy * push * dt;
        }
      }
    }

    // ---- 탄
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];

      // 유도탄은 매 프레임 목표 쪽으로 조금씩 튼다. 각도를 즉시 맞춰버리면
      // 절대 안 빗나가서 유도라는 느낌 자체가 사라진다.
      if (b.homing > 0) {
        const t = nearestFoe(b.x, b.y);
        if (t) {
          const want = Math.atan2((t.y - 8 - b.y) / 0.8, t.x - b.x);
          const cur = Math.atan2(b.vy / 0.8, b.vx);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const turn = clamp(d, -b.homing * dt, b.homing * dt);
          const sp = Math.min(320, Math.hypot(b.vx, b.vy / 0.8) + 240 * dt);
          const na = cur + turn;
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp * 0.8;
        }
      }
      if (b.spin !== 0) b.angle += b.spin * dt;

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > ARENA_W + 20 || b.y < -20 || b.y > ARENA_H + 20) {
        if (b.boomR > 0) blast(b.x, b.y, b.boomR, b.boomDmg, b.color);
        bullets.splice(i, 1);
        continue;
      }
      const cx = Math.floor(b.x / GRID_CELL);
      const cy = Math.floor(b.y / GRID_CELL);
      // 한 프레임에 한 번만 맞는다 — 안 그러면 인접 칸을 도는 동안
      // 같은 탄이 여러 마리를 동시에 때려 관통 수치가 무의미해진다.
      let consumed = false;
      for (let gy = cy - 1; gy <= cy + 1 && !consumed; gy++) {
        if (gy < 0 || gy >= GRID_H) continue;
        for (let gx = cx - 1; gx <= cx + 1 && !consumed; gx++) {
          if (gx < 0 || gx >= GRID_W) continue;
          const cell = grid[gy * GRID_W + gx];
          for (const f of cell) {
            if (!f.alive || f === b.lastHit) continue;
            const dx = f.x - b.x;
            const dy = f.y - 8 - b.y;
            const rr = f.def.r * f.scale + b.r;
            if (dx * dx + dy * dy > rr * rr) continue;

            if (b.boomR > 0) {
              // 폭탄은 몸통 피해가 없다 — 터지는 것으로 끝낸다
              blast(b.x, b.y, b.boomR, b.boomDmg, b.color);
              bullets.splice(i, 1);
              consumed = true;
              break;
            }

            f.hp -= b.dmg;
            f.flash = 0.07;
            f.view.tint = 0xff5c5c;
            f.kx += (b.vx / w.speed) * 120;
            f.ky += (b.vy / w.speed) * 120;
            spawnPart(b.x, b.y, 2, b.shape === 'tracer' ? 0xfff0a0 : b.color, 110);
            b.lastHit = f;

            if (f.hp <= 0) killFoe(f);

            if (b.pierce > 0) b.pierce--;
            else bullets.splice(i, 1);
            consumed = true;
            break;
          }
        }
      }
    }

    updateOrbs(dt);

    // ---- 경험치
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      const dx = px - g.x;
      const dy = py - 8 - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < w.magnet) {
        const pull = 130 + (w.magnet - d) * 6;
        g.vx += (dx / d) * pull * dt * 6;
        g.vy += (dy / d) * pull * dt * 6;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= 0.9;
      g.vy *= 0.9;
      if (d < 11) {
        xp += g.val;
        gems.splice(i, 1);
      }
    }
    if (xp >= xpNeed) levelUp();

    draw(dt);
    input.endFrame();
  });

  // ------------------------------------------------------------ 그리기
  function draw(dt: number): void {
    // 카메라
    if (shake > 0) shake = Math.max(0, shake - dt * 26);
    const camX = clamp(px - W / 2, 0, ARENA_W - W);
    const camY = clamp(py - H / 2, 0, ARENA_H - H);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    world.position.set(Math.round(-camX + sx), Math.round(-camY + sy));
    farLayer.position.set(Math.round(-camX * 0.42 + sx * 0.42), Math.round(-camY * 0.42 + sy * 0.42));

    // 화면 밖은 그리지 않는다. 탄 수백 발이 상시 떠 있는 게임이라
    // 이걸 안 하면 안 보이는 탄을 그리느라 프레임이 반으로 떨어진다.
    const vx0 = camX - 24;
    const vx1 = camX + W + 24;
    const vy0 = camY - 24;
    const vy1 = camY + H + 24;
    const onScreen = (x: number, y: number): boolean => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    // 파티클 — 색깔별로 묶어서 fill 을 한 번씩만 부른다.
    // 개체마다 fill 하면 수백 개일 때 드로우콜만으로 프레임이 죽는다.
    partG.clear();
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
    for (const color of PART_COLORS) {
      for (let tier = 0; tier < 2; tier++) {
        let any = false;
        for (const p of parts) {
          if (p.color !== color) continue;
          if ((p.life / p.max > 0.45 ? 1 : 0) !== tier) continue;
          if (!onScreen(p.x, p.y)) continue;
          partG.rect(Math.round(p.x), Math.round(p.y), p.size, p.size);
          any = true;
        }
        if (any) partG.fill({ color, alpha: tier === 1 ? 1 : 0.45 });
      }
    }

    // 탄 — 궤적 선 두 겹(넓은 잔광 + 밝은 심지). 각각 stroke 는 한 번씩만.
    bulletG.clear();
    let drew = false;
    for (const b of bullets) {
      if (b.shape !== 'tracer' || !onScreen(b.x, b.y)) continue;
      bulletG.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028).lineTo(b.x, b.y);
      drew = true;
    }
    if (drew) {
      // 밝아진 배경에 탄이 묻히지 않도록 어두운 외곽선을 먼저 깐다
      bulletG.stroke({ color: 0x0a1024, width: 7, alpha: 0.55 });
      for (const b of bullets) {
        if (b.shape !== 'tracer' || !onScreen(b.x, b.y)) continue;
        bulletG.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028).lineTo(b.x, b.y);
      }
      bulletG.stroke({ color: shotColor, width: 5, alpha: 0.55 });
      for (const b of bullets) {
        if (b.shape !== 'tracer' || !onScreen(b.x, b.y)) continue;
        bulletG.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016).lineTo(b.x, b.y);
      }
      bulletG.stroke({ color: shotCore, width: 3 });
    }

    // 특수무기 탄 — 무기 색이 몇 개 안 되므로 색깔별로 묶어 한 번씩만 그린다
    specialG.clear();
    for (const color of SPECIAL_COLORS) {
      let any = false;
      for (const b of bullets) {
        if (b.shape === 'tracer' || b.color !== color || !onScreen(b.x, b.y)) continue;
        if (b.shape === 'blade') {
          // 회전하는 마름모 — 톱날이 도는 게 보여야 한다
          const c = Math.cos(b.angle) * b.r;
          const s = Math.sin(b.angle) * b.r;
          specialG.moveTo(b.x + c, b.y + s)
            .lineTo(b.x - s, b.y + c)
            .lineTo(b.x - c, b.y - s)
            .lineTo(b.x + s, b.y - c)
            .closePath();
        } else {
          specialG.circle(b.x, b.y, b.r);
        }
        any = true;
      }
      if (any) specialG.fill({ color, alpha: 0.85 });
    }
    // 큰 탄(토네이도)은 테두리를 덧그려 배경에 묻히지 않게 한다
    let outline = false;
    for (const b of bullets) {
      if (b.shape === 'tracer' || b.r < 10 || !onScreen(b.x, b.y)) continue;
      specialG.circle(b.x, b.y, b.r);
      outline = true;
    }
    if (outline) specialG.stroke({ color: 0xffffff, width: 1, alpha: 0.5 });

    // 발밑 이동 방향 화살표 — 몸이 조준을 보고 있어도 어디로 가는지는 읽힌다
    if (phase === 'play' && (moveDirX !== 0 || moveDirY !== 0)) {
      const a = Math.atan2(moveDirY * 0.78, moveDirX);
      const bx = px + Math.cos(a) * 18;
      const by = py + 2 + Math.sin(a) * 13;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const tri = (k: number): void => {
        specialG
          .moveTo(bx + c * (7 + k), by + s * (7 + k))
          .lineTo(bx - (c * 3 + k) - s * (6 + k), by - (s * 3 + k) + c * (6 + k))
          .lineTo(bx - (c * 3 + k) + s * (6 + k), by - (s * 3 + k) - c * (6 + k))
          .closePath();
      };
      // 밝은 배경에 묻히지 않게 어두운 테두리를 깔고 그 위에 얹는다
      tri(1.5);
      specialG.fill({ color: 0x08101f, alpha: 0.75 });
      tri(0);
      specialG.fill({ color: 0x8ef0ff, alpha: 0.95 });
    }

    // 실드 구슬
    for (const o of orbs) {
      const ox = px + Math.cos(o.angle) * 36;
      const oy = py - 12 + Math.sin(o.angle) * 24;
      specialG.circle(ox, oy, 6).fill({ color: 0x6ec8ff, alpha: 0.9 });
      specialG.circle(ox, oy, 6).stroke({ color: 0xdff2ff, width: 1, alpha: 0.8 });
    }

    // 번개 — 내리꽂히는 세로 선
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bl = bolts[i];
      bl.life -= dt;
      if (bl.life <= 0) { bolts.splice(i, 1); continue; }
      if (!onScreen(bl.x, bl.y)) continue;
      specialG.moveTo(bl.x, bl.y - 60).lineTo(bl.x + 3, bl.y - 30).lineTo(bl.x - 2, bl.y - 14).lineTo(bl.x, bl.y);
      specialG.stroke({ color: bl.color, width: 2, alpha: 0.9 });
    }

    // 폭발 파문
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.life -= dt;
      if (rg.life <= 0) { rings.splice(i, 1); continue; }
      const k = 1 - rg.life / rg.max;
      specialG.circle(rg.x, rg.y, rg.r * (0.45 + k * 0.55));
      specialG.stroke({ color: rg.color, width: 2, alpha: (1 - k) * 0.85 });
    }

    // 경험치
    gemG.clear();
    let gemAny = false;
    for (const g of gems) {
      if (!onScreen(g.x, g.y)) continue;
      gemG.rect(Math.round(g.x) - 2, Math.round(g.y) - 2, 4, 4);
      gemAny = true;
    }
    if (gemAny) {
      gemG.fill({ color: 0x4fd6e8 });
      for (const g of gems) {
        if (!onScreen(g.x, g.y)) continue;
        gemG.rect(Math.round(g.x) - 1, Math.round(g.y) - 1, 2, 2);
      }
      gemG.fill({ color: 0xd8fbff });
    }

    // 옵션 유닛
    droneG.clear();
    for (let d = 0; d < w.drones; d++) {
      const ang = droneAngle + (d / w.drones) * Math.PI * 2;
      const dx = Math.round(px + Math.cos(ang) * 30);
      const dy = Math.round(py - 12 + Math.sin(ang) * 20);
      droneG.rect(dx - 3, dy - 3, 6, 6).fill({ color: 0x2f6fd0 });
      droneG.rect(dx - 2, dy - 2, 4, 4).fill({ color: 0x8ef0ff });
    }

    // HUD
    hudBar.clear();
    // 세로 화면은 폭이 270뿐이라 한 줄에 다 못 넣는다 — 두 줄로 나눈다
    hudBar.rect(0, 0, W, 26).fill({ color: 0x000000, alpha: 0.55 });
    // 체력
    hudBar.rect(6, 17, 120, 5).fill({ color: 0x2a1420 });
    hudBar.rect(6, 17, Math.round(120 * clamp(hp / maxHp, 0, 1)), 5).fill({ color: 0xff5c78 });
    // 경험치
    hudBar.rect(0, 26, W, 2).fill({ color: 0x12203a });
    hudBar.rect(0, 26, Math.round(W * clamp(xp / xpNeed, 0, 1)), 2).fill({ color: 0x4fd6e8 });

    // 보유 특수무기 — 색 칸과 레벨 눈금. 뭘 뽑았는지 한눈에 보여야 한다
    let hx = 134;
    for (const def of SPECIALS) {
      const lv = owned.get(def.id) ?? 0;
      if (!lv) continue;
      hudBar.rect(hx, 16, 10, 7).fill({ color: def.color });
      for (let i = 0; i < lv; i++) hudBar.rect(hx + i * 2, 13, 1, 2).fill({ color: 0xffffff });
      hx += 14;
    }

    // 튜닝용 계측 — 화면만 보고 "적당히 많네" 하고 넘기면 밀도를 못 맞춘다
    const dbg = window as unknown as Record<string, unknown>;
    dbg.__hordeTime = time;
    dbg.__hordeDead = phase === 'dead';
    dbg.__hordeStat = {
      foes: foes.length, bullets: bullets.length, lv: level, kills, hp: Math.round(hp),
      shots: w.shots, itv: +w.interval.toFixed(3), fps: Math.round(app.ticker.FPS),
      wep: [...owned].map(([id, l]) => `${id}${l}`).join(','),
      face: facing,
      anim: hero?.current ?? '',
      stick: stick ? `${Math.round(stick.x - stick.ox)},${Math.round(stick.y - stick.oy)}` : null,
    };
    dbg.__hordePick = phase === 'pick'
      ? pickList.map((o) => (o.kind === 'stat' ? o.up.id : o.def.id))
      : null;
    dbg.__hordePickIndex = pickIndex;

    timeLabel.text = `${Math.floor(time)}s`;
    killLabel.text = `KILL ${kills}`;
    lvLabel.text = `Lv.${level}`;

    if (phase === 'dead') {
      centerLabel.position.set(W / 2, H / 2 - 20);
      centerLabel.text = '격 파 당 함';
      subLabel.text = `${Math.floor(time)}초 · ${kills}킬 · Lv.${level}\n화면을 누르면 재시도`;
      hintLabel.text = '';
      cardG.clear();
      // 밝아진 배경 위에서는 글자만 얹으면 안 읽힌다 — 판을 깔고 올린다
      for (const t of cardTexts) t.text = '';
      for (const b of cardBadges) b.visible = false;
      cardG.roundRect(16, H / 2 - 46, W - 32, 92, 5).fill({ color: 0x05070f, alpha: 0.88 });
      cardG.roundRect(16, H / 2 - 46, W - 32, 92, 5).stroke({ color: 0x3a4a90, width: 1 });
      cardG.roundRect(BTN_CHAR.x, BTN_CHAR.y, BTN_CHAR.w, BTN_CHAR.h, 4).fill({ color: 0x16203f });
      cardG.roundRect(BTN_CHAR.x, BTN_CHAR.y, BTN_CHAR.w, BTN_CHAR.h, 4).stroke({ color: 0x4f6198, width: 1 });
      charBtnLabel.visible = true;
    } else if (phase === 'pick') {
      // drawPick() 이 먼저 돌고 draw() 가 나중이라, 여기서 비우면 제목이 지워진다
      centerLabel.position.set(W / 2, 42);
      centerLabel.text = 'LEVEL UP';
      subLabel.text = '';
      hintLabel.text = '카드를 눌러 선택';
    } else {
      centerLabel.text = '';
      subLabel.text = '';
      hintLabel.text = time < 8 ? (touchMode ? '끌어서 이동 · 사격 자동' : '방향키 이동 · 사격 자동') : '';
    }

    if (phase !== 'pick' && phase !== 'dead') {
      cardG.clear();
      for (const t of cardTexts) t.text = '';
      charBtnLabel.visible = false;
    }

    // 터치 조작 표시 — 레벨업 카드가 떠 있는 동안은 숨긴다.
    // 카드를 손가락으로 짚는 화면에 조작 패드가 겹쳐 있으면 뭘 누르는지 모른다.
    padG.clear();
    dashLabel.visible = touchMode && phase === 'play';
    if (touchMode && phase === 'play') {
      dashLabel.position.set(DASH_BTN.x, DASH_BTN.y);
      const cd = dashCd > 0 ? 1 - dashCd / DASH_CD : 1;
      dashLabel.alpha = cd >= 1 ? 0.85 : 0.3;
      padG.circle(DASH_BTN.x, DASH_BTN.y, DASH_BTN.r).fill({ color: 0x8ef0ff, alpha: 0.07 + cd * 0.07 });
      padG
        .circle(DASH_BTN.x, DASH_BTN.y, DASH_BTN.r)
        .stroke({ color: 0x8ef0ff, alpha: cd >= 1 ? 0.55 : 0.2, width: 1 });
      if (stick) {
        padG.circle(stick.ox, stick.oy, STICK.radius).fill({ color: 0xffffff, alpha: 0.06 });
        padG.circle(stick.ox, stick.oy, STICK.radius).stroke({ color: 0xffffff, alpha: 0.22, width: 1 });
        const dx = stick.x - stick.ox;
        const dy = stick.y - stick.oy;
        const d = Math.hypot(dx, dy);
        const k = d > STICK.radius ? STICK.radius / d : 1;
        padG.circle(stick.ox + dx * k, stick.oy + dy * k, 9).fill({ color: 0xdfe8ff, alpha: 0.34 });
      }
    }
  }

  function drawPick(): void {
    cardG.clear();
    cardG.rect(0, 0, W, H).fill({ color: 0x05070f, alpha: 0.72 });

    // 세로 화면이라 카드를 가로로 늘어놓을 수 없다 — 위에서 아래로 쌓는다.
    // 손가락으로 짚을 거라 한 장을 화면 폭 거의 전부로 잡는다.
    const cw = W - 28;
    const ch = 86;
    const gap = 14;
    const total = pickList.length * ch + (pickList.length - 1) * gap;
    const x = 14;
    const y0 = (H - total) / 2 + 10;
    cardRects.length = 0;
    for (let i = 0; i < pickList.length; i++) {
      const cy = y0 + i * (ch + gap);
      const on = i === pickIndex;
      cardRects.push({ x, y: cy, w: cw, h: ch });
      const o = pickList[i];
      const isNew = o.kind === 'weapon' && o.lv === 0;
      cardG.roundRect(x, cy, cw, ch, 5).fill({ color: on ? 0x1e3266 : 0x11172e });
      cardG.roundRect(x, cy, cw, ch, 5).stroke({ color: on ? 0x8ef0ff : 0x2b3560, width: on ? 2 : 1 });

      // 무기 카드는 위쪽에 그 무기 색의 띠를 둘러 능력치 카드와 구분한다
      if (o.kind === 'weapon') {
        cardG.roundRect(x + 1, cy + 1, cw - 2, 5, 3).fill({ color: o.def.color, alpha: on ? 1 : 0.55 });
      }

      const name = cardTexts[i * 2];
      const desc = cardTexts[i * 2 + 1];
      const badge = cardBadges[i];
      if (o.kind === 'stat') {
        name.text = o.up.name;
        desc.text = o.up.desc;
        badge.text = '';
      } else {
        name.text = o.def.name;
        desc.text = o.def.desc(o.lv);
        badge.text = isNew ? 'NEW' : `Lv.${o.lv} → ${o.lv + 1}`;
        badge.style.fill = isNew ? 0xffd85c : 0x8ef0ff;
        badge.position.set(x + cw / 2, cy + 18);
      }
      badge.visible = badge.text !== '';
      name.style.fill = on ? 0xffffff : 0x9fb0dd;
      name.position.set(x + cw / 2, cy + 43);
      desc.position.set(x + cw / 2, cy + 66);
    }
    for (let i = pickList.length; i < 3; i++) {
      cardTexts[i * 2].text = '';
      cardTexts[i * 2 + 1].text = '';
      cardBadges[i].visible = false;
    }
  }
}
