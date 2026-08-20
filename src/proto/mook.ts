/**
 * 프로토타입 — "잡몹이 되어 살아남기" (기획 3번안)
 *
 * 확인하려는 것은 딱 하나다:
 *   압도적인 놈이 다가올 때 "지금 뛸까, 더 웅크릴까" 하는 갈등이 조마조마한가?
 *
 * 그래서 재미와 무관한 것은 전부 뺐다 — 성장도, 인벤토리도, 맵 이동도 없다.
 * 한 방이면 죽고, 한 판은 30초 안에 끝나고, 죽으면 즉시 다시 시작한다.
 *
 * 본편 코드는 건드리지 않는다. `?mook` 으로 들어왔을 때만 이 씬이 뜬다.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W } from '../core/config';
import { AnimView, loadSheet } from '../anim/sheet';
import { overlaps, type Solid } from '../world/room';
import type { Input } from '../input/input';

const FLOOR_Y = 200;

/** 잡몹은 느리다. 이 격차가 공포의 근원이라 사냥꾼보다 확실히 느려야 한다. */
const MOOK_SPEED = 52;
const HUNTER_WALK = 74;
const HUNTER_CHARGE = 150;

const SHOT_SPEED = 190;

interface Objective {
  x: number;
  y: number;
  taken: boolean;
  g: Graphics;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  g: Graphics;
}

type HunterState = 'patrol' | 'alert' | 'hunt';

export async function runMookProto(app: Application, input: Input): Promise<void> {
  const scene = new Container();
  const ui = new Container();
  app.stage.addChild(scene, ui);

  // ---------------------------------------------------------------- 지형
  // 기둥이 있어야 "시야를 끊는다"는 선택지가 생긴다. 뻥 뚫린 방은 숨을 데가
  // 없어서 그냥 운이 되어버린다.
  const solids: Solid[] = [
    { x: -8, y: FLOOR_Y, w: GAME_W + 16, h: 40 },
    { x: -8, y: -40, w: 8, h: 280 },
    { x: GAME_W, y: -40, w: 8, h: 280 },
    { x: 120, y: 150, w: 16, h: 50 },
    { x: 250, y: 128, w: 16, h: 72 },
    { x: 400, y: 150, w: 16, h: 50 },
  ];

  const terrain = new Graphics();
  terrain.rect(0, 0, GAME_W, GAME_H).fill({ color: 0x141926 });
  for (const s of solids) {
    terrain.rect(s.x, s.y, s.w, s.h).fill({ color: 0x2a3350 });
    terrain.rect(s.x, s.y, s.w, 2).fill({ color: 0x3d4a72 });
  }
  scene.addChild(terrain);

  // ---------------------------------------------------------------- 목표물
  const objLayer = new Container();
  scene.addChild(objLayer);
  const objectives: Objective[] = [];
  const makeObjectives = (): void => {
    for (const o of objectives) o.g.destroy();
    objectives.length = 0;
    for (const px of [70, 320, 500]) {
      // 잡몹 헬멧이 노란색이라 목표물은 다른 색이어야 한 눈에 갈린다
      const g = new Graphics();
      g.rect(-5, -10, 10, 10).fill({ color: 0x4fd6e8 });
      g.rect(-5, -10, 10, 2).fill({ color: 0xc2f4fb });
      g.position.set(px, FLOOR_Y);
      objLayer.addChild(g);
      objectives.push({ x: px, y: FLOOR_Y, taken: false, g });
    }
  };

  // 회수한 부품을 넣는 곳. 전부 모아서 여기까지 와야 한 판이 끝난다.
  const exitG = new Graphics();
  exitG.rect(-14, -34, 28, 34).fill({ color: 0x1d6b4f, alpha: 0.5 });
  exitG.rect(-14, -34, 28, 2).fill({ color: 0x54ffb0 });
  exitG.position.set(GAME_W - 40, FLOOR_Y);
  scene.addChild(exitG);

  // ---------------------------------------------------------------- 액터
  const actors = new Container();
  scene.addChild(actors);

  const hunterSheet = await loadSheet('characters', 'x');
  const hunterView = new AnimView(hunterSheet);

  /**
   * 잡몹은 직접 그린다. 리핑 스프라이트를 쓰면 화면에서 안 읽히기도 하고
   * (원본 메트는 너무 작다), 무엇보다 이 프로토타입의 주인공만큼은
   * 저작권이 깨끗한 편이 낫다.
   *
   * 시각 언어는 단 하나다 — 눈이 보이면 위험, 눈이 없으면 안전.
   */
  const mookView = new Graphics();
  const drawMook = (guard: boolean): void => {
    mookView.clear();
    if (guard) {
      // 완전히 닫힌 헬멧. 눈이 없다 = 안전하다.
      mookView.ellipse(0, -5, 10, 6).fill({ color: 0xf0c040 });
      mookView.ellipse(0, -6, 10, 5).fill({ color: 0xffe38a });
      mookView.rect(-10, -1, 20, 2).fill({ color: 0x8a6a1c });
    } else {
      mookView.rect(-5, -9, 10, 9).fill({ color: 0x3a4a6b });   // 몸
      mookView.ellipse(0, -9, 10, 7).fill({ color: 0xf0c040 }); // 헬멧
      mookView.ellipse(0, -10, 10, 6).fill({ color: 0xffe38a });
      mookView.rect(-3, -8, 2, 3).fill({ color: 0xffffff });    // 눈
      mookView.rect(1, -8, 2, 3).fill({ color: 0xffffff });
    }
  };
  actors.addChild(hunterView, mookView);

  const shotLayer = new Container();
  scene.addChild(shotLayer);
  const shots: Shot[] = [];

  // 사냥꾼 상태를 눈으로 알려주는 표식 — 소리가 없으니 시각 신호가 전부다.
  const mark = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 14, fill: 0xff6b6b } });
  mark.anchor.set(0.5, 1);
  actors.addChild(mark);

  const chargeRing = new Graphics();
  // 시야를 눈에 보이게 그린다. 안 보이면 들키는 게 운처럼 느껴진다.
  const visionG = new Graphics();
  actors.addChildAt(visionG, 0);
  actors.addChild(chargeRing);

  /** 사냥꾼이 보는 방향으로 시야가 어디까지 닿는지 (기둥에서 끊긴다) */
  const sightEnd = (hx: number, dir: number): number => {
    const eye = FLOOR_Y - 8;
    let end = hx + dir * 190;
    for (const s of solids) {
      if (s.y >= eye || s.y + s.h <= eye || s.h >= 200) continue;
      const edge = dir > 0 ? s.x : s.x + s.w;
      if (dir > 0 ? edge > hx && edge < end : edge < hx && edge > end) end = edge;
    }
    return end;
  };

  // ---------------------------------------------------------------- HUD
  const mono = { fontFamily: 'monospace', fontSize: 10, fill: 0xcfe0ff } as const;
  const bar = new Graphics();
  bar.rect(0, 0, GAME_W, 20).fill({ color: 0x000000, alpha: 0.5 });
  ui.addChild(bar);

  const taskLabel = new Text({ text: '', style: mono });
  taskLabel.position.set(6, 4);
  const stateLabel = new Text({ text: '', style: { ...mono, fontSize: 9, fill: 0x8fa8d8 } });
  stateLabel.anchor.set(1, 0);
  stateLabel.position.set(GAME_W - 6, 5);
  ui.addChild(taskLabel, stateLabel);

  const center = new Text({
    text: '',
    style: { fontFamily: 'monospace', fontSize: 16, fill: 0xffffff, align: 'center' },
  });
  center.anchor.set(0.5);
  center.position.set(GAME_W / 2, GAME_H / 2 - 20);
  ui.addChild(center);

  const hint = new Text({
    text: '← → 이동    ↓ 웅크리기(무적, 못 움직임)    R 다시',
    style: { fontFamily: 'monospace', fontSize: 9, fill: 0x7d8bb0 },
  });
  hint.anchor.set(0.5, 1);
  hint.position.set(GAME_W / 2, GAME_H - 4);
  ui.addChild(hint);

  // ---------------------------------------------------------------- 상태
  let mookX = 30;
  let guarding = false;
  let carried = 0;
  let hunterX = GAME_W - 90;
  let hunterDir = -1;
  let hstate: HunterState = 'patrol';
  let stateTimer = 0;
  let chargeT = 0;
  let outcome: '' | 'dead' | 'clear' = '';
  let outcomeT = 0;
  let elapsed = 0;
  let attempts = 0;
  let bestTime: number | null = null;

  const MOOK_W = 14;
  const MOOK_H = 14;

  const reset = (): void => {
    mookX = 30;
    guarding = false;
    carried = 0;
    hunterX = GAME_W - 90;
    hunterDir = -1;
    hstate = 'patrol';
    stateTimer = 0;
    chargeT = 0;
    outcome = '';
    outcomeT = 0;
    elapsed = 0;
    for (const s of shots) s.g.destroy();
    shots.length = 0;
    makeObjectives();
    attempts++;
  };
  reset();
  attempts = 1;

  /** 기둥이 시야를 끊는지 — 잡몹과 사냥꾼 사이 눈높이 선을 막는 게 있나 */
  const blocked = (): boolean => {
    const y = FLOOR_Y - 8;
    const x0 = Math.min(mookX, hunterX);
    const x1 = Math.max(mookX, hunterX);
    return solids.some(
      (s) => s.y < y && s.y + s.h > y && s.x + s.w > x0 && s.x < x1 && s.h < 200,
    );
  };

  /**
   * 들키는 조건. 웅크리면 안 들킨다 — 이게 이 게임의 전부다.
   * 원작에서 메트가 헬멧을 쓰면 무적이 되는 것과 같은 규칙을,
   * "안 보인다"까지 확장했다.
   */
  const spotted = (): boolean => {
    if (guarding) return false;
    const dx = mookX - hunterX;
    if (Math.sign(dx) !== hunterDir && Math.abs(dx) > 12) return false;
    if (Math.abs(dx) > 190) return false;
    return !blocked();
  };

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 1 / 30);

    if (input.pressed('menu') || (outcome && input.down('jump'))) {
      if (outcome) reset();
    }
    // R 키로도 다시 시작 — 실패가 잦은 게임이라 재시작이 즉각이어야 한다
    if (input.pressed('weapon')) reset();

    if (!outcome) {
      elapsed += dt;

      // -------------------------------------------------------- 잡몹
      guarding = input.down('down');
      const axis = guarding ? 0 : input.axisX;
      mookX = Math.max(10, Math.min(GAME_W - 10, mookX + axis * MOOK_SPEED * dt));

      drawMook(guarding);
      mookView.position.set(Math.round(mookX), FLOOR_Y);

      // 부품 회수
      for (const o of objectives) {
        if (o.taken) continue;
        if (Math.abs(o.x - mookX) < 12) {
          o.taken = true;
          o.g.visible = false;
          carried++;
        }
      }
      if (carried >= objectives.length && Math.abs(mookX - (GAME_W - 40)) < 16) {
        outcome = 'clear';
        outcomeT = 0;
        if (bestTime === null || elapsed < bestTime) bestTime = elapsed;
      }

      // -------------------------------------------------------- 사냥꾼
      stateTimer -= dt;
      const see = spotted();

      if (hstate === 'patrol') {
        hunterX += hunterDir * HUNTER_WALK * dt;
        if (hunterX < 40) { hunterX = 40; hunterDir = 1; }
        if (hunterX > GAME_W - 40) { hunterX = GAME_W - 40; hunterDir = -1; }
        if (see) { hstate = 'alert'; stateTimer = 0.35; }
      } else if (hstate === 'alert') {
        // 발견 후 잠깐 멈춘다 — 이 틈이 플레이어가 웅크릴 수 있는 유일한 기회다.
        if (stateTimer <= 0) {
          if (see) { hstate = 'hunt'; stateTimer = 2.2; }
          else hstate = 'patrol';
        }
      } else {
        hunterDir = Math.sign(mookX - hunterX) || hunterDir;
        const near = Math.abs(mookX - hunterX);
        if (near > 70) hunterX += hunterDir * HUNTER_CHARGE * dt;

        chargeT += dt;
        if (chargeT > 0.55) {
          chargeT = 0;
          const g = new Graphics();
          g.circle(0, 0, 3).fill({ color: 0x9fe8ff });
          shotLayer.addChild(g);
          shots.push({ x: hunterX + hunterDir * 10, y: FLOOR_Y - 12, vx: hunterDir * SHOT_SPEED, g });
        }

        if (stateTimer <= 0) {
          if (see) stateTimer = 1.6;
          else { hstate = 'patrol'; chargeT = 0; }
        }
      }
      hunterX = Math.max(20, Math.min(GAME_W - 20, hunterX));

      hunterView.play(hstate === 'hunt' ? 'run' : hstate === 'alert' ? 'idle' : 'run');
      hunterView.update(dt * 1000);
      hunterView.position.set(Math.round(hunterX), FLOOR_Y);
      hunterView.scale.x = hunterDir;

      mark.text = hstate === 'alert' ? '?' : hstate === 'hunt' ? '!' : '';
      mark.position.set(Math.round(hunterX), FLOOR_Y - 34);

      visionG.clear();
      const se = sightEnd(hunterX, hunterDir);
      visionG
        .moveTo(hunterX, FLOOR_Y - 12)
        .lineTo(se, FLOOR_Y - 22)
        .lineTo(se, FLOOR_Y)
        .lineTo(hunterX, FLOOR_Y - 6)
        .fill({ color: hstate === 'patrol' ? 0x6f8fd0 : 0xff6b6b, alpha: 0.1 });

      chargeRing.clear();
      if (hstate === 'hunt') {
        const t = chargeT / 0.55;
        chargeRing
          .circle(hunterX + hunterDir * 10, FLOOR_Y - 12, 2 + t * 5)
          .stroke({ color: 0x9fe8ff, width: 1, alpha: 0.35 + t * 0.5 });
      }

      // -------------------------------------------------------- 탄
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.x += s.vx * dt;
        s.g.position.set(Math.round(s.x), Math.round(s.y));

        const hitBody =
          !guarding && overlaps(mookX - MOOK_W / 2, FLOOR_Y - MOOK_H, MOOK_W, MOOK_H, {
            x: s.x - 3, y: s.y - 3, w: 6, h: 6,
          });
        // 웅크리면 튕겨낸다 — 원작 메트 그대로
        const deflect =
          guarding && Math.abs(s.x - mookX) < 10 && s.y > FLOOR_Y - MOOK_H;

        if (hitBody) { outcome = 'dead'; outcomeT = 0; }
        if (hitBody || deflect || s.x < -10 || s.x > GAME_W + 10) {
          s.g.destroy();
          shots.splice(i, 1);
        }
      }

      // 접촉사 — 웅크려도 밟히면 죽는다면 너무 가혹해서, 웅크리면 안전하게 뒀다
      if (!guarding && Math.abs(mookX - hunterX) < 12) { outcome = 'dead'; outcomeT = 0; }

      taskLabel.text = `부품 ${carried}/${objectives.length}` + (carried >= objectives.length ? '  → 오른쪽 문으로!' : '');
      stateLabel.text = `${elapsed.toFixed(1)}s   시도 ${attempts}` + (bestTime !== null ? `   최고 ${bestTime.toFixed(1)}s` : '');
      center.text = '';
    } else {
      outcomeT += dt;
      center.text =
        outcome === 'clear'
          ? `탈출 성공\n${elapsed.toFixed(1)}초\n\n[R] 다시`
          : `발각됨\n\n[R] 다시`;
      center.style.fill = outcome === 'clear' ? 0x8effc4 : 0xff8b7b;
      // 실패는 빠르게 넘어가야 한다. 1초 뒤 아무 키나 눌러도 재시작.
      if (outcomeT > 0.6 && (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash'))) reset();
    }

    input.endFrame();
  });
}
