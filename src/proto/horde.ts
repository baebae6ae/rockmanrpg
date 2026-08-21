/**
 * 기획 프로토타입 — 몰려오는 적을 자동사격으로 갈아버리는 생존 모드.
 * 본편과 완전히 분리돼 있고 ?horde 로만 들어간다.
 *
 * 검증하려는 것은 딱 하나다: "정신없이 총알 갈기는 손맛"이 실제로 나는가.
 * 그래서 조작은 이동/대시뿐이고 사격은 전부 자동이다. 대신 레벨업마다
 * 탄이 늘어나 30초쯤 지나면 화면이 탄으로 덮이도록 수치를 잡았다.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W } from '../core/config';
import type { Input } from '../input/input';
import { AnimView, loadSheet, type Sheet } from '../anim/sheet';

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

const GRID_CELL = 34;
const GRID_W = Math.ceil(ARENA_W / GRID_CELL);
const GRID_H = Math.ceil(ARENA_H / GRID_CELL);

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export async function runHordeProto(app: Application, input: Input): Promise<void> {
  const sheets = new Map<FoeKind, Sheet>();
  await Promise.all(
    KIND_LIST.map(async (k) => {
      sheets.set(k, await loadSheet('enemies', k));
    }),
  );
  const heroSheet = await loadSheet('characters', 'x');

  // ------------------------------------------------------------ 레이어
  const world = new Container();
  const ui = new Container();
  app.stage.addChild(world, ui);

  const groundG = new Graphics();
  const gemG = new Graphics();
  const foeLayer = new Container();
  const bulletG = new Graphics();
  const partG = new Graphics();
  world.addChild(groundG, gemG, foeLayer, bulletG, partG);

  // 바닥 격자 — 한 번만 그린다. 이동감이 있어야 스스로 움직인다는 게 읽힌다.
  groundG.rect(0, 0, ARENA_W, ARENA_H).fill({ color: 0x0d1024 });
  for (let x = 0; x <= ARENA_W; x += 40) {
    groundG.rect(x, 0, 1, ARENA_H).fill({ color: 0x161c3a });
  }
  for (let y = 0; y <= ARENA_H; y += 40) {
    groundG.rect(0, y, ARENA_W, 1).fill({ color: 0x161c3a });
  }
  groundG.rect(0, 0, ARENA_W, 4).fill({ color: 0x3a4a90 });
  groundG.rect(0, ARENA_H - 4, ARENA_W, 4).fill({ color: 0x3a4a90 });
  groundG.rect(0, 0, 4, ARENA_H).fill({ color: 0x3a4a90 });
  groundG.rect(ARENA_W - 4, 0, 4, ARENA_H).fill({ color: 0x3a4a90 });

  foeLayer.sortableChildren = true;
  const hero = new AnimView(heroSheet);
  hero.play('idle');
  foeLayer.addChild(hero);

  const droneG = new Graphics();
  world.addChild(droneG);

  // ------------------------------------------------------------ HUD
  const hudBar = new Graphics();
  ui.addChild(hudBar);
  const mono = { fontFamily: 'monospace', fontSize: 9, fill: 0xcfe0ff } as const;

  const timeLabel = new Text({ text: '', style: { ...mono, fontSize: 13, fill: 0xffffff } });
  timeLabel.anchor.set(0.5, 0);
  timeLabel.position.set(GAME_W / 2, 2);
  const killLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0xffd85c } });
  killLabel.anchor.set(1, 0);
  killLabel.position.set(GAME_W - 6, 4);
  const lvLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0x8ef0ff } });
  lvLabel.position.set(6, 4);
  const hintLabel = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8a97c4 } });
  hintLabel.anchor.set(0.5, 1);
  hintLabel.position.set(GAME_W / 2, GAME_H - 3);
  ui.addChild(timeLabel, killLabel, lvLabel, hintLabel);

  const centerLabel = new Text({ text: '', style: { ...mono, fontSize: 15, fill: 0xffffff } });
  centerLabel.anchor.set(0.5);
  centerLabel.position.set(GAME_W / 2, GAME_H / 2 - 14);
  const subLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0xc9d6ff } });
  subLabel.anchor.set(0.5);
  subLabel.position.set(GAME_W / 2, GAME_H / 2 + 8);
  ui.addChild(centerLabel, subLabel);

  const cardG = new Graphics();
  const cardTexts: Text[] = [];
  ui.addChild(cardG);
  for (let i = 0; i < 3; i++) {
    const name = new Text({ text: '', style: { ...mono, fontSize: 11, fill: 0xffffff } });
    name.anchor.set(0.5);
    const desc = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0xa8b6e0 } });
    desc.anchor.set(0.5);
    cardTexts.push(name, desc);
    ui.addChild(name, desc);
  }

  input.mountTouchUI(ui);

  // ------------------------------------------------------------ 상태
  const foes: Foe[] = [];
  const bullets: Bullet[] = [];
  const gems: Gem[] = [];
  const parts: Part[] = [];
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
  let surgeAt = 12;
  let shake = 0;
  let hitstop = 0;
  let phase: 'play' | 'pick' | 'dead' = 'play';
  let pickIndex = 0;
  let pickList: Upgrade[] = [];
  let deadTimer = 0;

  // 시작부터 이미 "갈긴다"는 느낌이 나야 한다 — 1발 똑똑 쏘는 구간은 없다.
  const w: Weapon = {
    interval: 0.085,
    shots: 3,
    spread: 0.34,
    dmg: 4,
    speed: 340,
    pierce: 0,
    drones: 0,
    magnet: 72,
  };

  const taken: Record<string, number> = {};

  const UPGRADES: Upgrade[] = [
    {
      id: 'rapid', name: '연사 강화', desc: '발사 간격 -20%', max: 9,
      apply: () => { w.interval = Math.max(0.022, w.interval * 0.8); },
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
    // 화면이 560×240 이라 원형으로 뿌리면 위아래 개체가 한참을 걸어와야 한다.
    // 화면 비율에 맞춘 타원 바로 바깥에 뿌려야 스폰 즉시 압박이 된다.
    const a = Math.random() * Math.PI * 2;
    const far = 1 + Math.random() * 0.22;
    const x = clamp(px + Math.cos(a) * 320 * far, 14, ARENA_W - 14);
    const y = clamp(py + Math.sin(a) * 168 * far, 14, ARENA_H - 14);

    // 화력이 지수로 커지므로 적 체력도 그렇게 따라가야 한다.
    // 선형으로 두면 30초 넘어가는 순간 스폰 즉시 증발해서 화면이 텅 빈다.
    const grow = 1 + time * 0.05 + time * time * 0.0055;
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

  function killFoe(f: Foe): void {
    if (!f.alive) return;
    f.alive = false;
    kills++;
    spawnPart(f.x, f.y - 8, f.elite ? 26 : 9, f.elite ? 0xffc45c : 0xff9a4c, f.elite ? 190 : 130);
    const drops = f.elite ? 8 : 1;
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * Math.PI * 2;
      gems.push({
        x: f.x, y: f.y - 6,
        vx: Math.cos(a) * 40, vy: Math.sin(a) * 40,
        val: f.def.xp * (f.elite ? 3 : 1), alive: true,
      });
    }
    shake = Math.max(shake, f.elite ? 6 : 1.2);
    foeLayer.removeChild(f.view);
    f.view.visible = false;
    let pool = pools.get(f.kind);
    if (!pool) pools.set(f.kind, (pool = []));
    pool.push(f.view);
    const idx = foes.indexOf(f);
    if (idx >= 0) foes.splice(idx, 1);
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
    });
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

  function levelUp(): void {
    level++;
    xp -= xpNeed;
    // 2차식으로 올린다. 선형이면 킬 수가 초당 수십으로 불어나는 순간
    // 레벨이 초당 하나씩 올라 1분 만에 화력이 화면을 다 태워버린다.
    xpNeed = Math.round(3 + level * 2.2 + level * level * 0.26);
    const avail = UPGRADES.filter((u) => (taken[u.id] ?? 0) < u.max);
    pickList = [];
    const pool = [...avail];
    for (let i = 0; i < 3 && pool.length; i++) {
      pickList.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    if (!pickList.length) return;
    pickIndex = 0;
    phase = 'pick';
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
    px = ARENA_W / 2; py = ARENA_H / 2;
    hp = 100; maxHp = 100; iframe = 0;
    dashTimer = 0; dashCd = 0;
    time = 0; kills = 0; level = 1; xp = 0; xpNeed = 4;
    spawnAcc = 0; fireAcc = 0; surgeAt = 12; shake = 0; hitstop = 0;
    speedMul = 1;
    w.interval = 0.085; w.shots = 3; w.spread = 0.34; w.dmg = 4;
    w.speed = 340; w.pierce = 0; w.drones = 0; w.magnet = 72;
    for (const k of Object.keys(taken)) delete taken[k];
    phase = 'play';
    deadTimer = 0;
  }

  // ------------------------------------------------------------ 루프
  app.ticker.add(() => {
    const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 30);

    if (phase === 'pick') {
      if (input.pressed('left')) pickIndex = (pickIndex + pickList.length - 1) % pickList.length;
      if (input.pressed('right')) pickIndex = (pickIndex + 1) % pickList.length;
      if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) {
        const u = pickList[pickIndex];
        taken[u.id] = (taken[u.id] ?? 0) + 1;
        u.apply();
        phase = 'play';
      }
      drawPick();
      draw(dt);
      input.endFrame();
      return;
    }

    if (phase === 'dead') {
      deadTimer += dt;
      if (deadTimer > 0.5 && (input.pressed('jump') || input.pressed('shoot') || input.pressed('weapon') || input.pressed('menu'))) {
        reset();
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
    const len = Math.hypot(ix, iy);
    if (len > 0) { ix /= len; iy /= len; }
    if (ix !== 0) facing = ix > 0 ? 1 : -1;

    dashCd -= dt;
    if (dashTimer > 0) dashTimer -= dt;
    else if (input.pressed('dash') && dashCd <= 0) {
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

    hero.play(dashTimer > 0 ? 'dash' : len > 0 ? 'run' : 'idle');
    hero.scale.x = facing;
    hero.update(app.ticker.deltaMS);
    hero.position.set(Math.round(px), Math.round(py));
    hero.alpha = iframe > 0 && Math.floor(iframe * 24) % 2 === 0 ? 0.4 : 1;

    // ---- 스폰
    const rate = Math.min(70, 10 + time * 1.0);
    spawnAcc += rate * dt;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawnFoe(false); }

    if (time >= surgeAt) {
      surgeAt += 13;
      const elites = 3 + Math.floor(time / 25);
      for (let i = 0; i < elites; i++) spawnFoe(true);
      for (let i = 0; i < 26; i++) spawnFoe(false);
      shake = 7;
    }

    // ---- 자동사격
    fireAcc += dt;
    let guard = 0;
    while (fireAcc >= w.interval && guard++ < 6) {
      fireAcc -= w.interval;
      shoot();
    }

    // ---- 적
    if (iframe > 0) iframe -= dt;

    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      const dx = px - f.x;
      const dy = py - f.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = f.def.speed * (f.elite ? 0.8 : 1) * (1 + time * 0.006);
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
    hero.zIndex = py + 0.5;

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
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > ARENA_W + 20 || b.y < -20 || b.y > ARENA_H + 20) {
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
            const rr = f.def.r * f.scale + 3;
            if (dx * dx + dy * dy > rr * rr) continue;

            f.hp -= b.dmg;
            f.flash = 0.07;
            f.view.tint = 0xff5c5c;
            f.kx += (b.vx / w.speed) * 120;
            f.ky += (b.vy / w.speed) * 120;
            spawnPart(b.x, b.y, 2, 0xfff0a0, 110);
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
    const camX = clamp(px - GAME_W / 2, 0, ARENA_W - GAME_W);
    const camY = clamp(py - GAME_H / 2, 0, ARENA_H - GAME_H);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    world.position.set(Math.round(-camX + sx), Math.round(-camY + sy));

    // 화면 밖은 그리지 않는다. 탄 수백 발이 상시 떠 있는 게임이라
    // 이걸 안 하면 안 보이는 탄을 그리느라 프레임이 반으로 떨어진다.
    const vx0 = camX - 24;
    const vx1 = camX + GAME_W + 24;
    const vy0 = camY - 24;
    const vy1 = camY + GAME_H + 24;
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
      if (!onScreen(b.x, b.y)) continue;
      bulletG.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028).lineTo(b.x, b.y);
      drew = true;
    }
    if (drew) {
      bulletG.stroke({ color: 0xff8a2c, width: 6, alpha: 0.4 });
      for (const b of bullets) {
        if (!onScreen(b.x, b.y)) continue;
        bulletG.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016).lineTo(b.x, b.y);
      }
      bulletG.stroke({ color: 0xfff0b0, width: 3 });
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
    hudBar.rect(0, 0, GAME_W, 18).fill({ color: 0x000000, alpha: 0.5 });
    // 체력
    hudBar.rect(6, 14, 120, 4).fill({ color: 0x2a1420 });
    hudBar.rect(6, 14, Math.round(120 * clamp(hp / maxHp, 0, 1)), 4).fill({ color: 0xff5c78 });
    // 경험치
    hudBar.rect(0, 18, GAME_W, 2).fill({ color: 0x12203a });
    hudBar.rect(0, 18, Math.round(GAME_W * clamp(xp / xpNeed, 0, 1)), 2).fill({ color: 0x4fd6e8 });

    // 튜닝용 계측 — 화면만 보고 "적당히 많네" 하고 넘기면 밀도를 못 맞춘다
    const dbg = window as unknown as Record<string, unknown>;
    dbg.__hordeTime = time;
    dbg.__hordeDead = phase === 'dead';
    dbg.__hordeStat = { foes: foes.length, bullets: bullets.length, lv: level, kills, hp: Math.round(hp), shots: w.shots, itv: +w.interval.toFixed(3), fps: Math.round(app.ticker.FPS) };

    timeLabel.text = `${Math.floor(time)}s`;
    killLabel.text = `KILL ${kills}`;
    lvLabel.text = `Lv.${level}`;

    if (phase === 'dead') {
      centerLabel.position.set(GAME_W / 2, GAME_H / 2 - 14);
      centerLabel.text = '격 파 당 함';
      subLabel.text = `${Math.floor(time)}초 생존 · ${kills}킬 · Lv.${level}\n아무 키나 눌러 재시도`;
      hintLabel.text = '';
    } else if (phase === 'pick') {
      centerLabel.text = '';
      subLabel.text = '';
      hintLabel.text = '← → 선택 · Z 확정';
    } else {
      centerLabel.text = '';
      subLabel.text = '';
      hintLabel.text = time < 6 ? '방향키 이동 · C 대시 · 사격은 자동' : '';
    }

    if (phase !== 'pick') {
      cardG.clear();
      for (const t of cardTexts) t.text = '';
    }
  }

  function drawPick(): void {
    cardG.clear();
    cardG.rect(0, 0, GAME_W, GAME_H).fill({ color: 0x05070f, alpha: 0.72 });
    const head = 'LEVEL UP';
    centerLabel.text = head;
    centerLabel.position.set(GAME_W / 2, 42);
    subLabel.text = '';

    const cw = 150;
    const gap = 14;
    const total = pickList.length * cw + (pickList.length - 1) * gap;
    const x0 = (GAME_W - total) / 2;
    for (let i = 0; i < pickList.length; i++) {
      const x = x0 + i * (cw + gap);
      const on = i === pickIndex;
      cardG.roundRect(x, 82, cw, 68, 4).fill({ color: on ? 0x1e3266 : 0x11172e });
      cardG.roundRect(x, 82, cw, 68, 4).stroke({ color: on ? 0x8ef0ff : 0x2b3560, width: on ? 2 : 1 });
      const name = cardTexts[i * 2];
      const desc = cardTexts[i * 2 + 1];
      name.text = pickList[i].name;
      name.style.fill = on ? 0xffffff : 0x9fb0dd;
      name.position.set(x + cw / 2, 106);
      desc.text = pickList[i].desc;
      desc.position.set(x + cw / 2, 128);
    }
    for (let i = pickList.length; i < 3; i++) {
      cardTexts[i * 2].text = '';
      cardTexts[i * 2 + 1].text = '';
    }
  }
}
