import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W, computeScale } from './core/config';
import { Input } from './input/input';
import { Player, type CharacterDef } from './player/player';
import { Enemy, type EnemyDef } from './enemy/enemy';
import { ProjectileSystem } from './combat/projectile';
import type { PatternDef } from './pattern/interpreter';
import { Progress, type ItemDef, type SkillDef } from './progression/progress';
import { HealthBar } from './ui/healthbar';
import { Menu } from './ui/menu';
import { Pickup } from './world/pickup';
import { PARALLAX, Room } from './world/room';

interface MapDef {
  id: string;
  name: string;
  spawns: { enemy: string; x: number; y: number; params?: Record<string, unknown> }[];
  items?: { id: string; x: number; y: number }[];
}

// 콘텐츠는 전부 데이터에서 온다 — 이 파일에 캐릭터·적·무기별 분기는 없다.
const byId = <T>(glob: Record<string, unknown>): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const [path, value] of Object.entries(glob)) {
    out[path.split('/').pop()!.replace(/\.json$/, '')] = value as T;
  }
  return out;
};

const characterDefs = Object.values(
  byId<CharacterDef>(import.meta.glob('/data/characters/*.json', { eager: true, import: 'default' })),
).sort((a, b) => a.id.localeCompare(b.id));

const enemyDefs = byId<EnemyDef>(import.meta.glob('/data/enemies/*.json', { eager: true, import: 'default' }));
const patternDefs = byId<PatternDef>(import.meta.glob('/data/patterns/*.json', { eager: true, import: 'default' }));
const mapDefs = byId<MapDef>(import.meta.glob('/data/maps/*.json', { eager: true, import: 'default' }));
const skillDefs = byId<SkillDef>(import.meta.glob('/data/skills/*.json', { eager: true, import: 'default' }));
const itemDefs = byId<ItemDef>(import.meta.glob('/data/items/*.json', { eager: true, import: 'default' }));

async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;

  const app = new Application();
  await app.init({
    canvas,
    width: GAME_W,
    height: GAME_H,
    backgroundColor: 0x0a0a12,
    antialias: false,
    roundPixels: true,
  });

  // 백버퍼는 320×240 고정. 확대는 CSS 가 맡으므로 도트가 보간되지 않는다.
  const fit = (): void => {
    const scale = computeScale(window.innerWidth, window.innerHeight);
    canvas.style.width = `${Math.round(GAME_W * scale)}px`;
    canvas.style.height = `${Math.round(GAME_H * scale)}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${Math.round((window.innerWidth - GAME_W * scale) / 2)}px`;
    canvas.style.top = `${Math.round((window.innerHeight - GAME_H * scale) / 2)}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 100));

  // 시차 배경 3층 — 층마다 카메라가 다른 비율로 민다
  const bgFar = new Container();
  const bgMid = new Container();
  const world = new Container();
  const ui = new Container();
  app.stage.addChild(bgFar, bgMid, world, ui);

  const room = new Room();
  const terrain = new Container();
  world.addChild(terrain);
  room.render(bgFar, bgMid, terrain);

  const pickupLayer = new Container();
  const shotLayer = new Container();
  const actorLayer = new Container();
  world.addChild(pickupLayer, shotLayer, actorLayer);

  const shots = new ProjectileSystem(shotLayer);
  const input = new Input(canvas);
  const progress = new Progress(itemDefs);

  // ------------------------------------------------------------ HUD
  const hudBar = new Graphics();
  hudBar.rect(0, 0, GAME_W, 22).fill({ color: 0x000000, alpha: 0.45 });
  ui.addChild(hudBar);

  const mono = { fontFamily: 'monospace', fontSize: 9, fill: 0xcfe0ff } as const;
  const nameLabel = new Text({ text: '', style: { ...mono, fontSize: 11, fill: 0xffffff } });
  nameLabel.position.set(6, 1);
  const levelLabel = new Text({ text: '', style: { ...mono, fill: 0xffd85c } });
  levelLabel.anchor.set(1, 0);
  levelLabel.position.set(GAME_W - 6, 2);
  const weaponLabel = new Text({ text: '', style: mono });
  weaponLabel.position.set(6, 13);
  const hintLabel = new Text({
    text: 'TAB 교체 · V 무기 · M 메뉴',
    style: { ...mono, fontSize: 8, fill: 0x6f7fa8 },
  });
  hintLabel.anchor.set(1, 0);
  hintLabel.position.set(GAME_W - 6, 14);
  ui.addChild(nameLabel, levelLabel, weaponLabel, hintLabel);

  const lifeBar = new HealthBar(8, 30, 6, 24, 0x7fe4ff, 'LIFE');
  const weaponBar = new HealthBar(30, 30, 6, 24, 0xffd85c, 'WPN');
  const bossBar = new HealthBar(52, 30, 6, 24, 0xff7b6b, 'BOSS');
  weaponBar.visible = false;
  bossBar.visible = false;
  ui.addChild(lifeBar.view, weaponBar.view, bossBar.view);

  const toast = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0xffd85c } });
  toast.anchor.set(0.5, 0);
  toast.position.set(GAME_W / 2, 25);
  toast.visible = false;
  ui.addChild(toast);
  let toastTime = 0;
  const say = (message: string): void => {
    toast.text = message;
    toast.visible = true;
    toastTime = 2.4;
  };

  input.mountTouchUI(ui);

  const menu = new Menu(progress, itemDefs);
  ui.addChild(menu.view);

  // ------------------------------------------------------------ 배치
  const map = mapDefs.test_room;
  const enemies: Enemy[] = [];

  for (const spawn of map.spawns) {
    const def = enemyDefs[spawn.enemy];
    const pattern = def ? patternDefs[def.pattern] : undefined;
    if (!def || !pattern) {
      console.warn(`배치를 건너뜀: ${spawn.enemy}`);
      continue;
    }
    // 배치별 파라미터가 적 정의의 기본값을 덮어쓴다
    const merged: EnemyDef = { ...def, pattern_params: { ...def.pattern_params, ...spawn.params } };
    enemies.push(await Enemy.create(merged, pattern, spawn.x, spawn.y, actorLayer, shots));
  }

  const boss = enemies.find((e) => e.def.tier === 'boss' || e.def.tier === 'signature');

  const pickups: Pickup[] = [];
  for (const entry of map.items ?? []) {
    const item = itemDefs[entry.id];
    // 이미 장착한 파츠는 다시 놓지 않는다
    if (!item || progress.equipped[item.slot] === item.id) continue;
    const pickup = new Pickup(item, entry.x, entry.y);
    pickups.push(pickup);
    pickupLayer.addChild(pickup.view);
  }

  // ------------------------------------------------------------ 캐릭터
  let index = 0;
  let player = await Player.create(characterDefs[index], actorLayer, progress, skillDefs);

  let swapping = false;
  const swap = async (): Promise<void> => {
    if (swapping || characterDefs.length < 2) return;
    swapping = true;
    try {
      index = (index + 1) % characterDefs.length;
      // 새 캐릭터를 먼저 만든 뒤 교체한다. 로딩을 기다리는 동안에도 루프는
      // 계속 돌기 때문에, 먼저 파괴하면 파괴된 뷰를 갱신하게 된다.
      const next = await Player.create(characterDefs[index], actorLayer, progress, skillDefs);
      next.x = player.x;
      next.y = player.y;
      next.facing = player.facing;
      next.hp = Math.min(player.hp, next.maxHp);
      player.view.destroy();
      player = next;
    } finally {
      swapping = false;
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Enter') {
      e.preventDefault();
      void swap();
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const gx = ((e.clientX - rect.left) / rect.width) * GAME_W;
    const gy = ((e.clientY - rect.top) / rect.height) * GAME_H;

    if (menu.open) {
      if (menu.handleTap(gx, gy)) say('강화 완료');
      return;
    }
    // HUD 우측 상단을 누르면 캐릭터 교체 (모바일)
    if (gy < 22 && gx > GAME_W / 2) void swap();
  });

  document.getElementById('boot')?.remove();

  // 자동 검증용 상태 훅
  (globalThis as Record<string, unknown>).__dbg = () => ({
    x: Math.round(player.x),
    y: Math.round(player.y),
    state: player.state,
    hp: player.hp,
    maxHp: player.maxHp,
    grounded: player.grounded,
    wallDir: player.wallDir,
    character: player.def.id,
    weapon: player.weapon?.id ?? null,
    weapons: player.weapons.map((w) => `${w.id}:${progress.skillLevel(w.id)}`),
    level: progress.level,
    exp: progress.exp,
    sp: progress.sp,
    owned: [...progress.owned],
    equipped: { ...progress.equipped },
    enemiesAlive: enemies.filter((e) => e.alive).length,
    bossHp: boss?.hp ?? null,
    bossPos: boss ? [Math.round(boss.x), Math.round(boss.y)] : null,
    menuOpen: menu.open,
  });

  // ------------------------------------------------------------ 보상
  const rewarded = new Set<Enemy>();
  const grantRewards = (): void => {
    for (const e of enemies) {
      if (e.hp > 0 || rewarded.has(e)) continue;
      rewarded.add(e);

      const gained = progress.gainExp(e.def.stats.exp);
      progress.refillEnergy(6);
      if (gained > 0) say(`레벨 업!  Lv ${progress.level}   SP +${gained}`);

      // 보스 격파 → 특수무기 획득. 어떤 무기인지는 스킬 데이터가 정한다.
      const drop = Object.values(skillDefs).find(
        (s) => s.unlock.source === 'boss' && s.unlock.boss_id === e.def.id,
      );
      if (drop && progress.acquire(drop.id)) {
        player.refreshWeapons(skillDefs);
        say(`${drop.name} 획득!  V 로 전환`);
      }
    }
  };

  // ------------------------------------------------------------ 루프
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 1 / 30);

    if (input.pressed('menu')) {
      menu.toggle();
      if (menu.open) menu.render(player.weapons);
    }

    if (toastTime > 0) {
      toastTime -= dt;
      if (toastTime <= 0) toast.visible = false;
    }

    // 메뉴가 열려 있으면 게임은 멈춘다
    if (!menu.open) {
      player.update(dt, input, room, shots);

      const ctx = { target: { x: player.x, y: player.y - player.hitboxH / 2 }, room };
      for (const e of enemies) e.update(dt, room, ctx, player);
      grantRewards();

      const living = enemies.filter((e) => e.alive && !e.dying);
      shots.update(dt, room, { enemies: living, players: [player] });

      for (const p of pickups) {
        p.update(dt);
        if (p.touches(player.x, player.y, player.hitboxW, player.hitboxH)) {
          p.take();
          progress.equip(p.item);
          say(`${p.item.name} 장착 — ${p.item.description}`);
        }
      }
    }

    // 카메라 — 플레이어 추적 후 룸 경계로 제한
    const camX = Math.max(0, Math.min(room.width - GAME_W, player.x - GAME_W / 2));
    world.x = -Math.round(camX);
    bgFar.x = -Math.round(camX * PARALLAX.far);
    bgMid.x = -Math.round(camX * PARALLAX.mid);

    // HUD
    lifeBar.set(player.hp / player.maxHp);

    const weapon = player.weapon;
    const usesEnergy = !!weapon && weapon.cost > 0;
    weaponBar.visible = usesEnergy;
    if (weapon && usesEnergy) weaponBar.set(progress.energyOf(weapon.id) / progress.maxEnergy);

    const bossVisible = !!boss && boss.alive && Math.abs(boss.x - player.x) < GAME_W * 0.75;
    bossBar.visible = bossVisible;
    if (boss && bossVisible) bossBar.set(boss.hp / boss.maxHp);

    nameLabel.text = player.def.name;
    levelLabel.text = `Lv ${progress.level}  SP ${progress.sp}`;
    weaponLabel.text = weapon
      ? `▶ ${weapon.name}  Lv${progress.skillLevel(weapon.id)}  ${weapon.element}`
      : '무기 없음';

    input.endFrame();
  });
}

boot().catch((err: unknown) => {
  const el = document.getElementById('boot');
  if (el) el.textContent = String(err);
  console.error(err);
});
