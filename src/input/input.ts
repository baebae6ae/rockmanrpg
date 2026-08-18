/**
 * 통합 입력 — 키보드와 터치를 같은 인터페이스로 다룬다.
 * 모바일이 주 확인 수단이므로 가상 패드는 선택이 아니라 필수다 (docs/DESIGN.md §3.2).
 *
 * 터치는 "붙잡는" 방식이다. 한 번 잡은 손가락은 화면 어디로 움직이든 그 역할을
 * 유지한다. 고정 영역을 벗어나면 입력이 끊기는 방식은 손가락이 조금만 미끄러져도
 * 캐릭터가 멈춰버려 조작이 성립하지 않는다.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W } from '../core/config';

export type Button = 'left' | 'right' | 'up' | 'down' | 'jump' | 'shoot' | 'dash' | 'weapon' | 'menu';

const ALL_BUTTONS: Button[] = [
  'left', 'right', 'up', 'down', 'jump', 'shoot', 'dash', 'weapon', 'menu',
];

const KEY_MAP: Record<string, Button> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyZ: 'jump',
  Space: 'jump',
  KeyK: 'jump',
  KeyX: 'shoot',
  KeyJ: 'shoot',
  KeyC: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyL: 'dash',
  KeyV: 'weapon',
  KeyQ: 'weapon',
  Escape: 'menu',
  KeyM: 'menu',
};

interface PadButton {
  button: Button;
  x: number;
  y: number;
  r: number;
  label: string;
}

const PAD_BUTTONS: PadButton[] = [
  { button: 'jump', x: 288, y: 204, r: 18, label: 'JUMP' },
  { button: 'shoot', x: 244, y: 192, r: 16, label: 'FIRE' },
  { button: 'dash', x: 286, y: 160, r: 15, label: 'DASH' },
  { button: 'weapon', x: 236, y: 150, r: 14, label: 'WPN' },
  { button: 'menu', x: 300, y: 36, r: 13, label: 'MENU' },
];

/** 스틱을 잡을 수 있는 영역 — 화면 왼쪽 절반의 아래쪽 */
const STICK_ZONE = { maxX: GAME_W * 0.55, minY: 60 };

const STICK = {
  /** 이 거리를 넘어야 방향으로 인정한다 */
  dead: 6,
  /** 손잡이가 원점에서 벗어날 수 있는 최대 거리 */
  radius: 26,
  /** 이보다 멀어지면 원점을 손가락 쪽으로 끌어당긴다 (손가락이 미끄러져도 계속 조작됨) */
  drag: 30,
};

type Touch =
  | { kind: 'stick'; ox: number; oy: number; x: number; y: number; dirs: Set<Button> }
  | { kind: 'button'; button: Button };

export class Input {
  /** 키보드와 터치를 따로 들고, 둘의 합집합을 실제 입력으로 본다 */
  private readonly keyHeld = new Set<Button>();
  private readonly touchHeld = new Set<Button>();
  private held = new Set<Button>();
  /**
   * 눌림·뗌은 프레임 비교가 아니라 이벤트 시점에 기록한다.
   * 프레임보다 짧은 탭이 통째로 묻히는 것을 막기 위함.
   */
  private readonly pressedNow = new Set<Button>();
  private readonly releasedNow = new Set<Button>();

  private readonly touches = new Map<number, Touch>();
  private touchVisible = false;
  private pad: Container | null = null;
  private stickBase: Container | null = null;
  private stickKnob: Graphics | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    const releaseAll = (): void => {
      this.keyHeld.clear();
      this.touchHeld.clear();
      this.touches.clear();
      this.sync();
    };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseAll();
    });

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    // 손가락이 캔버스 경계 밖으로 나가면 캡처가 없는 한 move/up 이벤트가
    // 더 이상 캔버스로 오지 않는다 — 그러면 놓친 손가락이 마지막 방향에
    // 영구히 붙박여 조작이 막힌다. 캡처로 경계 밖까지 계속 추적한다.
    canvas.addEventListener('lostpointercapture', this.onPointerUp);
    // 캔버스로 이벤트가 안 온 경우를 대비한 이중 안전망 — 포인터 이벤트는
    // 버블링되므로, 어떤 이유로든 원래 타깃으로 안 잡히더라도 window까지는
    // 올라온다. 이미 지워진 손가락이면 onPointerUp이 조용히 무시한다.
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(button: Button): boolean {
    return this.held.has(button);
  }

  pressed(button: Button): boolean {
    return this.pressedNow.has(button);
  }

  released(button: Button): boolean {
    return this.releasedNow.has(button);
  }

  /** -1 / 0 / 1 */
  get axisX(): number {
    return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
  }

  endFrame(): void {
    this.pressedNow.clear();
    this.releasedNow.clear();
  }

  private sync(): void {
    const next = new Set<Button>([...this.keyHeld, ...this.touchHeld]);
    for (const b of next) if (!this.held.has(b)) this.pressedNow.add(b);
    for (const b of this.held) if (!next.has(b)) this.releasedNow.add(b);
    this.held = next;
  }

  // ------------------------------------------------------------ 키보드

  private onKeyDown = (e: KeyboardEvent): void => {
    const button = KEY_MAP[e.code];
    if (!button) return;
    e.preventDefault();
    if (e.repeat) return;
    this.keyHeld.add(button);
    this.sync();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const button = KEY_MAP[e.code];
    if (!button) return;
    e.preventDefault();
    this.keyHeld.delete(button);
    this.sync();
  };

  // ------------------------------------------------------------ 터치

  /** 캔버스 좌표 → 게임 좌표 (백버퍼가 320×240 이므로 비율만 맞추면 된다) */
  private toGame(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * GAME_W,
      y: ((e.clientY - rect.top) / rect.height) * GAME_H,
    };
  }

  private buttonAt(x: number, y: number): Button | null {
    for (const b of PAD_BUTTONS) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r * 1.3) return b.button;
    }
    return null;
  }

  /** 스틱 방향 갱신 — 원점에서의 벡터로 판단하므로 손가락이 어디로 가든 유지된다 */
  private updateStick(touch: Extract<Touch, { kind: 'stick' }>, x: number, y: number): void {
    let dx = x - touch.ox;
    let dy = y - touch.oy;

    // 너무 멀어지면 원점을 끌어당겨, 손가락이 미끄러져도 계속 조작할 수 있게 한다
    const dist = Math.hypot(dx, dy);
    if (dist > STICK.drag) {
      const pull = (dist - STICK.drag) / dist;
      touch.ox += dx * pull;
      touch.oy += dy * pull;
      dx = x - touch.ox;
      dy = y - touch.oy;
    }

    touch.x = x;
    touch.y = y;
    touch.dirs.clear();
    if (dx < -STICK.dead) touch.dirs.add('left');
    if (dx > STICK.dead) touch.dirs.add('right');
    if (dy < -STICK.dead) touch.dirs.add('up');
    if (dy > STICK.dead) touch.dirs.add('down');
  }

  private refresh(): void {
    this.touchHeld.clear();
    for (const t of this.touches.values()) {
      if (t.kind === 'button') this.touchHeld.add(t.button);
      else for (const d of t.dirs) this.touchHeld.add(d);
    }
    this.sync();
    this.drawStick();
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.showTouchUI();

    const p = this.toGame(e);
    const button = this.buttonAt(p.x, p.y);

    if (button) {
      this.touches.set(e.pointerId, { kind: 'button', button });
    } else if (p.x <= STICK_ZONE.maxX && p.y >= STICK_ZONE.minY) {
      // 누른 자리가 곧 스틱의 원점이 된다
      const touch: Touch = { kind: 'stick', ox: p.x, oy: p.y, x: p.x, y: p.y, dirs: new Set() };
      this.touches.set(e.pointerId, touch);
    } else {
      return;
    }
    // 손가락이 캔버스 밖으로 나가도 move/up 이벤트를 계속 이 손가락에
    // 묶어 받기 위함 — 안 하면 경계 밖에서 뗐을 때 입력이 붙박인다.
    this.canvas.setPointerCapture(e.pointerId);
    this.refresh();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const touch = this.touches.get(e.pointerId);
    if (!touch) return;
    e.preventDefault();

    // 버튼은 한 번 잡으면 손가락이 벗어나도 계속 눌린 것으로 본다
    if (touch.kind === 'stick') {
      const p = this.toGame(e);
      this.updateStick(touch, p.x, p.y);
      this.refresh();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.touches.delete(e.pointerId)) return;
    e.preventDefault();
    this.refresh();
  };

  // ------------------------------------------------------------ 가상 패드 표시

  private showTouchUI(): void {
    if (this.touchVisible || !this.pad) return;
    this.touchVisible = true;
    this.pad.visible = true;
  }

  /** 스틱은 잡은 자리에 나타난다 */
  private drawStick(): void {
    if (!this.stickBase || !this.stickKnob) return;

    const stick = [...this.touches.values()].find((t) => t.kind === 'stick') as
      | Extract<Touch, { kind: 'stick' }>
      | undefined;

    if (!stick) {
      this.stickBase.visible = false;
      return;
    }

    this.stickBase.visible = true;
    this.stickBase.position.set(Math.round(stick.ox), Math.round(stick.oy));

    const dx = stick.x - stick.ox;
    const dy = stick.y - stick.oy;
    const dist = Math.hypot(dx, dy);
    const clamp = dist > STICK.radius ? STICK.radius / dist : 1;
    this.stickKnob.position.set(Math.round(dx * clamp), Math.round(dy * clamp));
  }

  mountTouchUI(parent: Container): void {
    const pad = new Container();
    pad.visible = false;

    // 스틱 (누른 자리에 나타남)
    const base = new Container();
    const ring = new Graphics();
    ring.circle(0, 0, STICK.radius).fill({ color: 0xffffff, alpha: 0.06 });
    ring.circle(0, 0, STICK.radius).stroke({ color: 0xffffff, alpha: 0.24, width: 1 });
    const knob = new Graphics();
    knob.circle(0, 0, 10).fill({ color: 0xdfe8ff, alpha: 0.3 });
    knob.circle(0, 0, 10).stroke({ color: 0xffffff, alpha: 0.5, width: 1 });
    base.addChild(ring, knob);
    base.visible = false;
    pad.addChild(base);
    this.stickBase = base;
    this.stickKnob = knob;

    // 스틱을 잡을 수 있는 영역 표시 (아주 흐리게)
    const zone = new Graphics();
    zone
      .roundRect(6, STICK_ZONE.minY + 44, STICK_ZONE.maxX - 12, GAME_H - STICK_ZONE.minY - 50, 6)
      .stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
    pad.addChildAt(zone, 0);

    for (const b of PAD_BUTTONS) {
      const g = new Graphics();
      g.circle(b.x, b.y, b.r).fill({ color: 0xffffff, alpha: 0.08 });
      g.circle(b.x, b.y, b.r).stroke({ color: 0xffffff, alpha: 0.28, width: 1 });
      pad.addChild(g);

      const label = new Text({
        text: b.label,
        style: { fontFamily: 'monospace', fontSize: 8, fill: 0xdfe8ff },
      });
      label.anchor.set(0.5);
      label.position.set(b.x, b.y);
      pad.addChild(label);
    }

    parent.addChild(pad);
    this.pad = pad;

    if (matchMedia('(pointer: coarse)').matches) {
      this.touchVisible = true;
      pad.visible = true;
    }
  }

  /** 진단용 */
  get activeButtons(): Button[] {
    return ALL_BUTTONS.filter((b) => this.held.has(b));
  }
}
