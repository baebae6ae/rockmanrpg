import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W, computeScale } from './core/config';
import { Input } from './input/input';
import { Player, type CharacterDef } from './player/player';
import { Enemy, type EnemyDef } from './enemy/enemy';
import { ProjectileSystem } from './combat/projectile';
import { MeleeSystem } from './combat/melee';
import type { PatternDef } from './pattern/interpreter';
import { Progress, type ItemDef, type SkillDef } from './progression/progress';
import { HealthBar } from './ui/healthbar';
import { Menu } from './ui/menu';
import { Shop } from './ui/shop';
import { Pickup } from './world/pickup';
import { Drop } from './world/drop';
import { Portal } from './world/portal';
import { Npc } from './world/npc';
import { mountFloatingText, clearFloatingText, popText, updateFloatingText } from './ui/floating_text';
import { PARALLAX, Room, type MapDef } from './world/room';

// 콘텐츠는 전부 데이터에서 온다 — 이 파일에 캐릭터·적·무기·맵별 분기는 없다.
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

const START_MAP = 'town';

/** 한 맵에 속한 모든 것 — 맵을 옮기면 통째로 버리고 다시 만든다 */
interface Stage {
  def: MapDef;
  room: Room;
  far: Container;
  mid: Container;
  world: Container;
  actorLayer: Container;
  shots: ProjectileSystem;
  melee: MeleeSystem;
  enemies: Enemy[];
  pickups: Pickup[];
  drops: Drop[];
  portals: Portal[];
  npcs: Npc[];
}

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

  // 백버퍼는 GAME_W×GAME_H 고정. 확대는 CSS 가 맡으므로 도트가 보간되지 않는다.
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

  const scene = new Container();
  const ui = new Container();
  app.stage.addChild(scene, ui);

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
  const placeLabel = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8fa8d8 } });
  placeLabel.anchor.set(1, 0);
  placeLabel.position.set(GAME_W - 6, 14);
  ui.addChild(nameLabel, levelLabel, weaponLabel, placeLabel);

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

  const hint = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x9fe8ff } });
  hint.anchor.set(0.5, 1);
  hint.visible = false;
  ui.addChild(hint);

  input.mountTouchUI(ui);

  const menu = new Menu(progress, itemDefs);
  const shop = new Shop(progress, itemDefs);
  ui.addChild(menu.view, shop.view);

  // ------------------------------------------------------------ 스테이지
  let stage: Stage | null = null;
  let player: Player | null = null;
  let characterIndex = 0;
  let busy = false;

  const destroyStage = (): void => {
    if (!stage) return;
    clearFloatingText();
    stage.shots.clear();
    stage.melee.clear();
    // 플레이어 뷰는 다음 스테이지에서 재사용하므로 먼저 떼어낸다
    if (player) stage.actorLayer.removeChild(player.view);
    scene.removeChild(stage.far, stage.mid, stage.world);
    stage.far.destroy({ children: true });
    stage.mid.destroy({ children: true });
    stage.world.destroy({ children: true });
    stage = null;
  };

  const buildStage = async (mapId: string, entryPortal?: string): Promise<void> => {
    const def = mapDefs[mapId];
    if (!def) {
      console.warn(`알 수 없는 맵: ${mapId}`);
      return;
    }

    destroyStage();

    const far = new Container();
    const mid = new Container();
    const world = new Container();
    scene.addChild(far, mid, world);

    const room = new Room(def);
    const terrain = new Container();
    const pickupLayer = new Container();
    const shotLayer = new Container();
    const actorLayer = new Container();
    const effectLayer = new Container();
    world.addChild(terrain, pickupLayer, shotLayer, actorLayer, effectLayer);
    room.render(far, mid, terrain);
    mountFloatingText(effectLayer);

    const shots = new ProjectileSystem(shotLayer);
    const melee = new MeleeSystem(effectLayer);

    const portals = (def.portals ?? []).map((p) => {
      const portal = new Portal(p);
      pickupLayer.addChild(portal.view);
      return portal;
    });

    const npcs = (def.npcs ?? []).map((n) => {
      const npc = new Npc(n);
      pickupLayer.addChild(npc.view);
      return npc;
    });

    const enemies: Enemy[] = [];
    for (const spawn of def.spawns ?? []) {
      const edef = enemyDefs[spawn.enemy];
      const pattern = edef ? patternDefs[edef.pattern] : undefined;
      if (!edef || !pattern) {
        console.warn(`배치를 건너뜀: ${spawn.enemy}`);
        continue;
      }
      const merged: EnemyDef = { ...edef, pattern_params: { ...edef.pattern_params, ...spawn.params } };
      enemies.push(await Enemy.create(merged, pattern, spawn.x, spawn.y, actorLayer, shots));
    }

    const pickups: Pickup[] = [];
    for (const entry of def.items ?? []) {
      const item = itemDefs[entry.id];
      // 이미 장착한 파츠는 다시 놓지 않는다
      if (!item || !item.slot || progress.equipped[item.slot] === item.id) continue;
      const pickup = new Pickup(item, entry.x, entry.y);
      pickups.push(pickup);
      pickupLayer.addChild(pickup.view);
    }

    stage = { def, room, far, mid, world, actorLayer, shots, melee, enemies, pickups, drops: [], portals, npcs };

    // 입장 위치 — 들어온 포탈 앞에 세운다
    const entry = entryPortal ? portals.find((p) => p.def.id === entryPortal) : undefined;
    const spawnPoint = entry ? { x: entry.def.x, y: entry.def.y } : def.player_spawn;

    if (!player) {
      player = await Player.create(characterDefs[characterIndex], actorLayer, progress, skillDefs, spawnPoint);
    } else {
      actorLayer.addChild(player.view);
      player.moveTo(spawnPoint.x, spawnPoint.y);
    }

    const level = def.recommended_level ?? 0;
    say(level > 0 ? `${def.name}  ·  권장 Lv ${level}` : def.name);
  };

  await buildStage(START_MAP);
  if (!player || !stage) throw new Error('스테이지를 만들지 못했다');
  const activePlayer = (): Player => player as Player;

  // ------------------------------------------------------------ 캐릭터 교체
  const swap = async (): Promise<void> => {
    if (busy || characterDefs.length < 2 || !stage || !player) return;
    busy = true;
    try {
      characterIndex = (characterIndex + 1) % characterDefs.length;
      const spawn = { x: player.x, y: player.y };
      const next = await Player.create(characterDefs[characterIndex], stage.actorLayer, progress, skillDefs, spawn);
      next.facing = player.facing;
      next.hp = Math.min(player.hp, next.maxHp);
      player.view.destroy();
      player = next;
    } finally {
      busy = false;
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Enter') {
      e.preventDefault();
      void swap();
    }
  });

  // ------------------------------------------------------------ 소모품
  menu.onUseItem = (item) => {
    const p = activePlayer();
    if (!progress.consume(item.id)) return;
    if (item.use?.hp) {
      p.hp = Math.min(p.maxHp, p.hp + item.use.hp);
      popText(p.x, p.y - p.hitboxH - 4, `+${item.use.hp}`, 'gain');
    }
    if (item.use?.energy) progress.refillEnergy(item.use.energy);
    say(`${item.name} 사용`);
  };

  // ------------------------------------------------------------ 입력(오버레이)
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const gx = ((e.clientX - rect.left) / rect.width) * GAME_W;
    const gy = ((e.clientY - rect.top) / rect.height) * GAME_H;

    if (shop.open) {
      const result = shop.handleTap(gx, gy);
      if (result) say(result);
      return;
    }
    if (menu.open) {
      const result = menu.handleTap(gx, gy);
      if (result) say(result);
      return;
    }
    if (gy < 22) void swap();
  });

  document.getElementById('boot')?.remove();

  (globalThis as Record<string, unknown>).__dbg = () => {
    const p = activePlayer();
    return {
      map: stage?.def.id ?? null,
      x: Math.round(p.x),
      y: Math.round(p.y),
      state: p.state,
      hp: p.hp,
      maxHp: p.maxHp,
      grounded: p.grounded,
      character: p.def.id,
      weapon: p.weapon?.id ?? null,
      level: progress.level,
      exp: progress.exp,
      sp: progress.sp,
      ap: progress.ap,
      bolts: progress.bolts,
      inventory: Object.fromEntries(progress.inventory),
      stats: { ...progress.stats },
      attackStat: p.attackStat,
      owned: [...progress.owned],
      equipped: { ...progress.equipped },
      enemiesAlive: stage?.enemies.filter((e) => e.alive).length ?? 0,
      bosses: (stage?.enemies ?? [])
        .filter((e) => e.def.tier === 'boss' || e.def.tier === 'signature')
        .map((b) => ({ id: b.def.id, hp: b.hp, x: Math.round(b.x) })),
      dropsOnGround: stage?.drops.length ?? 0,
      menuOpen: menu.open,
      shopOpen: shop.open,

    };
  };

  // ------------------------------------------------------------ 보상
  const grantRewards = (): void => {
    if (!stage) return;
    for (const e of stage.enemies) {
      if (e.hp > 0 || e.rewarded) continue;
      e.rewarded = true;

      popText(e.x, e.y - e.hitboxH - 12, `+${e.def.stats.exp} EXP`, 'gain');

      for (const d of e.def.drops ?? []) {
        if (Math.random() > d.chance) continue;
        const drop = new Drop(d.kind, d.amount, e.x + (Math.random() - 0.5) * 12, e.y - 8);
        stage.drops.push(drop);
        stage.world.addChild(drop.view);
      }

      const gained = progress.gainExp(e.def.stats.exp);
      if (gained > 0) say(`레벨 업!  Lv ${progress.level}   AP +${gained * 3}  SP +${gained}`);
    }
  };

  // ------------------------------------------------------------ 루프
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 1 / 30);
    const p = activePlayer();
    const current = stage;
    if (!current) return;

    // 메뉴/상점 열고 닫기
    if (input.pressed('menu')) {
      if (shop.open) shop.close();
      else {
        menu.toggle();
        if (menu.open) menu.render(p.weapons);
      }
    }

    if (toastTime > 0) {
      toastTime -= dt;
      if (toastTime <= 0) toast.visible = false;
    }

    const paused = menu.open || shop.open || busy;

    if (!paused) {
      progress.regen(dt);
      updateFloatingText(dt);

      // 세이버류는 발동 즉시 판정하므로, 그 시점의 살아있는 적 목록이 미리 있어야 한다
      const living = current.enemies.filter((e) => e.alive && !e.dying);
      p.update(dt, input, current.room, current.shots, current.melee, living);
      current.melee.update(dt);

      const ctx = { target: { x: p.x, y: p.y - p.hitboxH / 2 }, room: current.room };
      for (const e of current.enemies) e.update(dt, current.room, ctx, p);
      grantRewards();

      current.shots.update(dt, current.room, { enemies: living, players: [p] });

      for (const pk of current.pickups) {
        pk.update(dt);
        if (pk.touches(p.x, p.y, p.hitboxW, p.hitboxH)) {
          pk.take();
          progress.equip(pk.item);
          say(`${pk.item.name} 장착 — ${pk.item.description}`);
        }
      }

      for (let i = current.drops.length - 1; i >= 0; i--) {
        const d = current.drops[i];
        d.update(dt, current.room);
        if (!d.taken && d.touches(p.x, p.y, p.hitboxW, p.hitboxH)) {
          d.take();
          if (d.kind === 'health') {
            p.hp = Math.min(p.maxHp, p.hp + d.amount);
            popText(p.x, p.y - p.hitboxH - 4, `+${d.amount}`, 'gain');
          } else if (d.kind === 'energy') {
            progress.refillEnergy(d.amount);
            popText(p.x, p.y - p.hitboxH - 4, `+${d.amount} WE`, 'gain');
          } else {
            progress.gainBolts(d.amount);
            popText(p.x, p.y - p.hitboxH - 4, `+${d.amount} 볼트`, 'gain');
          }
        }
        if (d.taken) {
          d.view.destroy();
          current.drops.splice(i, 1);
        }
      }

      for (const portal of current.portals) portal.update(dt);
      for (const npc of current.npcs) npc.update(dt);

      // ---------------------------------------------------- 상호작용 (위 방향)
      const portal = current.portals.find((q) => q.contains(p.x, p.y, p.hitboxW, p.hitboxH));
      const npc = current.npcs.find((q) => q.contains(p.x, p.y, p.hitboxW, p.hitboxH));

      hint.visible = !!(portal || npc);
      if (portal || npc) {
        const target = portal ?? npc!;
        hint.text = portal ? `↑ ${portal.def.label ?? '이동'}` : `↑ ${npc!.def.name}`;
        hint.position.set(
          Math.round(target.view.x + current.world.x),
          Math.round(target.view.y - 44),
        );
      }

      if (input.pressed('up')) {
        if (portal) {
          busy = true;
          void buildStage(portal.def.to_map, portal.def.to_portal).finally(() => {
            busy = false;
          });
          // 이 프레임은 여기서 끝낸다. endFrame 을 건너뛰면 눌림 상태가 남아
          // 다음 프레임에도 포탈이 다시 발동하고, 맵 사이를 튕기게 된다.
          input.endFrame();
          return;
        }
        if (npc?.def.shop) {
          progress.save();
          shop.openWith(npc.def.shop);
        }
      }
    }

    // 카메라
    const camX = Math.max(0, Math.min(current.room.width - GAME_W, p.x - GAME_W / 2));
    current.world.x = -Math.round(camX);
    current.far.x = -Math.round(camX * PARALLAX.far);
    current.mid.x = -Math.round(camX * PARALLAX.mid);

    // HUD
    lifeBar.set(p.hp / p.maxHp);

    const weapon = p.weapon;
    const usesEnergy = !!weapon && weapon.cost > 0;
    weaponBar.visible = usesEnergy;
    if (weapon && usesEnergy) weaponBar.set(progress.energyOf(weapon.id) / progress.maxEnergy);

    const boss = current.enemies
      .filter((e) => (e.def.tier === 'boss' || e.def.tier === 'signature') && e.alive)
      .filter((b) => Math.abs(b.x - p.x) < GAME_W * 0.7)
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    bossBar.visible = !!boss;
    if (boss) bossBar.set(boss.hp / boss.maxHp);

    nameLabel.text = characterDefs.length > 1 ? `${p.def.name}  ⇄` : p.def.name;
    const points = [progress.ap > 0 ? `AP ${progress.ap}` : '', progress.sp > 0 ? `SP ${progress.sp}` : '']
      .filter(Boolean)
      .join(' ');
    levelLabel.text = `Lv ${progress.level}${points ? `  ${points}` : ''}`;
    weaponLabel.text = weapon
      ? `▶ ${weapon.name} Lv${progress.skillLevel(weapon.id)}  ATK ${p.attackStat}`
      : '무기 없음';
    placeLabel.text = `${current.def.name} · ${progress.bolts} 볼트`;

    input.endFrame();
  });
}

boot().catch((err: unknown) => {
  const el = document.getElementById('boot');
  if (el) el.textContent = String(err);
  console.error(err);
});
