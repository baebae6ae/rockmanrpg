import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W, computeScale } from './core/config';
import { Input } from './input/input';
import { Player, type CharacterDef } from './player/player';
import { ProjectileSystem } from './combat/projectile';
import { Room } from './world/room';

// 캐릭터는 데이터로 추가된다 — 이 파일에 캐릭터별 분기는 없다.
const characterDefs = Object.entries(
  import.meta.glob('/data/characters/*.json', { eager: true, import: 'default' }) as Record<
    string,
    CharacterDef
  >,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, def]) => def);

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

  const world = new Container();
  const ui = new Container();
  app.stage.addChild(world, ui);

  const room = new Room();
  room.render(world);

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
  const swapLabel = new Text({
    text: 'TAB / 탭 → 교체',
    style: { ...mono, fill: 0x8fa8d8 },
  });
  swapLabel.anchor.set(1, 0);
  swapLabel.position.set(GAME_W - 6, 3);
  ui.addChild(nameLabel, infoLabel, swapLabel);

  input.mountTouchUI(ui);

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

  // HUD 상단 영역을 누르면 교체 (모바일)
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const gy = ((e.clientY - rect.top) / rect.height) * GAME_H;
    const gx = ((e.clientX - rect.left) / rect.width) * GAME_W;
    if (gy < 22 && gx > GAME_W / 2) void swap();
  });

  document.getElementById('boot')?.remove();

  // ------------------------------------------------------------ 루프
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 1 / 30);

    player.update(dt, input, room, shots);
    shots.update(dt, room);

    // 카메라 — 플레이어 추적 후 룸 경계로 제한
    const camX = Math.max(0, Math.min(room.width - GAME_W, player.x - GAME_W / 2));
    world.x = -Math.round(camX);

    nameLabel.text = `${player.def.name}  ${player.def.archetype}`;
    const m = player.def.movement;
    const abilities = [
      m.can_dash && 'DASH',
      m.can_air_dash && 'AIR',
      m.can_wall_kick && 'WALL',
      m.can_double_jump && 'DBLJMP',
    ]
      .filter(Boolean)
      .join(' ');
    const art = player.spriteSource === 'sprites' ? '진짜 스프라이트' : '임시 도트';
    infoLabel.text = `${abilities}   |   ${player.state}   |   ${art}`;

    input.endFrame();
  });
}

boot().catch((err: unknown) => {
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = String(err);
  console.error(err);
});
