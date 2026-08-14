import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W, computeScale } from './core/config';
import { Input } from './input/input';
import { Player, type CharacterDef } from './player/player';
import { Enemy, type EnemyDef } from './enemy/enemy';
import { ProjectileSystem } from './combat/projectile';
import type { PatternDef } from './pattern/interpreter';
import { HealthBar } from './ui/healthbar';
import { PARALLAX, Room } from './world/room';

interface MapDef {
  id: string;
  name: string;
  spawns: { enemy: string; x: number; y: number; params?: Record<string, unknown> }[];
}

// 콘텐츠는 전부 데이터에서 온다 — 이 파일에 캐릭터·적·패턴별 분기는 없다.
const byPath = <T>(glob: Record<string, unknown>): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const [path, value] of Object.entries(glob)) {
    const id = path.split('/').pop()!.replace(/\.json$/, '');
    out[id] = value as T;
  }
  return out;
};

const characterDefs = Object.values(
  byPath<CharacterDef>(import.meta.glob('/data/characters/*.json', { eager: true, import: 'default' })),
).sort((a, b) => a.id.localeCompare(b.id));

const enemyDefs = byPath<EnemyDef>(
  import.meta.glob('/data/enemies/*.json', { eager: true, import: 'default' }),
);
const patternDefs = byPath<PatternDef>(
  import.meta.glob('/data/patterns/*.json', { eager: true, import: 'default' }),
);
const mapDefs = byPath<MapDef>(import.meta.glob('/data/maps/*.json', { eager: true, import: 'default' }));

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

  const shotLayer = new Container();
  const actorLayer = new Container();
  world.addChild(shotLayer, actorLayer);

  const shots = new ProjectileSystem(shotLayer);
  const input = new Input(canvas);

  // ------------------------------------------------------------ HUD
  const hudBar = new Graphics();
  hudBar.rect(0, 0, GAME_W, 22).fill({ color: 0x000000, alpha: 0.45 });
  ui.addChild(hudBar);

  const mono = { fontFamily: 'monospace', fontSize: 9, fill: 0xcfe0ff } as const;
  const nameLabel = new Text({ text: '', style: { ...mono, fontSize: 11, fill: 0xffffff } });
  nameLabel.position.set(6, 1);
  const infoLabel = new Text({ text: '', style: mono });
  infoLabel.position.set(6, 13);
  const swapLabel = new Text({ text: 'TAB / 탭 → 교체', style: { ...mono, fill: 0x8fa8d8 } });
  swapLabel.anchor.set(1, 0);
  swapLabel.position.set(GAME_W - 6, 3);
  ui.addChild(nameLabel, infoLabel, swapLabel);

  const playerBar = new HealthBar(8, 30, 6, 24, 0x7fe4ff, 'LIFE');
  const bossBar = new HealthBar(34, 30, 6, 24, 0xff7b6b, 'BOSS');
  bossBar.visible = false;
  ui.addChild(playerBar.view, bossBar.view);

  input.mountTouchUI(ui);

  // ------------------------------------------------------------ 적 배치
  const map = mapDefs.test_room;
  const enemies: Enemy[] = [];

  for (const spawn of map.spawns) {
    const def = enemyDefs[spawn.enemy];
    if (!def) {
      console.warn(`알 수 없는 적: ${spawn.enemy}`);
      continue;
    }
    const pattern = patternDefs[def.pattern];
    if (!pattern) {
      console.warn(`알 수 없는 패턴: ${def.pattern}`);
      continue;
    }
    // 배치별 파라미터가 적 정의의 기본값을 덮어쓴다
    const merged: EnemyDef = {
      ...def,
      pattern_params: { ...def.pattern_params, ...spawn.params },
    };
    enemies.push(await Enemy.create(merged, pattern, spawn.x, spawn.y, actorLayer, shots));
  }

  const boss = enemies.find((e) => e.def.tier === 'boss' || e.def.tier === 'signature');

  // ------------------------------------------------------------ 캐릭터
  let index = 0;
  let player = await Player.create(characterDefs[index], actorLayer);

  let swapping = false;
  const swap = async (): Promise<void> => {
    if (swapping || characterDefs.length < 2) return;
    swapping = true;
    try {
      index = (index + 1) % characterDefs.length;
      // 새 캐릭터를 먼저 만든 뒤 교체한다. 로딩을 기다리는 동안에도 루프는
      // 계속 돌기 때문에, 먼저 파괴하면 파괴된 뷰를 갱신하게 된다.
      const next = await Player.create(characterDefs[index], actorLayer);
      next.x = player.x;
      next.y = player.y;
      next.facing = player.facing;
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

  // HUD 우측 상단을 누르면 교체 (모바일)
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const gy = ((e.clientY - rect.top) / rect.height) * GAME_H;
    const gx = ((e.clientX - rect.left) / rect.width) * GAME_W;
    if (gy < 22 && gx > GAME_W / 2) void swap();
  });

  document.getElementById('boot')?.remove();

  // 자동 검증용 상태 훅
  (globalThis as Record<string, unknown>).__dbg = () => ({
    x: Math.round(player.x),
    y: Math.round(player.y),
    state: player.state,
    hp: player.hp,
    grounded: player.grounded,
    wallDir: player.wallDir,
    character: player.def.id,
    enemiesAlive: enemies.filter((e) => e.alive).length,
    bossHp: boss?.hp ?? null,
    bossPos: boss ? [Math.round(boss.x), Math.round(boss.y)] : null,
  });

  // ------------------------------------------------------------ 루프
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 1 / 30);

    player.update(dt, input, room, shots);

    const ctx = { target: { x: player.x, y: player.y - player.hitboxH / 2 }, room };
    for (const e of enemies) e.update(dt, room, ctx, player);

    const living = enemies.filter((e) => e.alive && !e.dying);
    shots.update(dt, room, { enemies: living, players: [player] });

    // 카메라 — 플레이어 추적 후 룸 경계로 제한
    const camX = Math.max(0, Math.min(room.width - GAME_W, player.x - GAME_W / 2));
    world.x = -Math.round(camX);
    bgFar.x = -Math.round(camX * PARALLAX.far);
    bgMid.x = -Math.round(camX * PARALLAX.mid);

    // HUD
    playerBar.set(player.hp / player.maxHp);
    const bossVisible = !!boss && boss.alive && Math.abs(boss.x - player.x) < GAME_W * 0.75;
    bossBar.visible = bossVisible;
    if (boss && bossVisible) bossBar.set(boss.hp / boss.maxHp);

    nameLabel.text = `${player.def.name}  ${player.def.archetype}`;
    const art = player.spriteSource === 'sprites' ? '진짜 스프라이트' : '임시 도트';
    infoLabel.text = `HP ${player.hp}/${player.maxHp}   |   ${player.state}   |   ${art}`;

    input.endFrame();
  });
}

boot().catch((err: unknown) => {
  const el = document.getElementById('boot');
  if (el) el.textContent = String(err);
  console.error(err);
});
