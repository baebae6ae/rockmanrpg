/**
 * 통합 입력 — 키보드와 터치를 같은 인터페이스로 다룬다.
 * 모바일이 주 확인 수단이므로 가상 패드는 선택이 아니라 필수다 (docs/DESIGN.md §3.2).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W } from '../core/config';

export type Button = 'left' | 'right' | 'up' | 'down' | 'jump' | 'shoot' | 'dash' | 'weapon' | 'menu';

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

const DPAD = { x: 40, y: 196, r: 30, dead: 7 };

const PAD_BUTTONS: PadButton[] = [
  { button: 'jump', x: 288, y: 204, r: 17, label: 'JUMP' },
  { button: 'shoot', x: 246, y: 192, r: 15, label: 'FIRE' },
  { button: 'dash', x: 284, y: 164, r: 14, label: 'DASH' },
  { button: 'weapon', x: 232, y: 154, r: 13, label: 'WPN' },
  { button: 'menu', x: 160, y: 210, r: 12, label: 'MENU' },
];

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
  /** 포인터별로 어떤 버튼을 누르고 있는지 */
  private readonly touches = new Map<number, Set<Button>>();
  private touchVisible = false;
  private pad: Container | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.keyHeld.clear();
      this.touchHeld.clear();
      this.sync();
    });

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(button: Button): boolean {
    return this.held.has(button);
  }

  /** 이번 프레임에 새로 눌렸는지 */
  pressed(button: Button): boolean {
    return this.pressedNow.has(button);
  }

  released(button: Button): boolean {
    return this.releasedNow.has(button);
  }

  /** 키보드·터치 상태를 합쳐 눌림/뗌 전이를 기록한다 */
  private sync(): void {
    const next = new Set<Button>([...this.keyHeld, ...this.touchHeld]);
    for (const b of next) if (!this.held.has(b)) this.pressedNow.add(b);
    for (const b of this.held) if (!next.has(b)) this.releasedNow.add(b);
    this.held = next;
  }

  /** -1 / 0 / 1 */
  get axisX(): number {
    return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
  }

  endFrame(): void {
    this.pressedNow.clear();
    this.releasedNow.clear();
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

  private hitTest(x: number, y: number): Set<Button> {
    const result = new Set<Button>();

    const dx = x - DPAD.x;
    const dy = y - DPAD.y;
    if (Math.hypot(dx, dy) <= DPAD.r * 1.45) {
      if (dx < -DPAD.dead) result.add('left');
      if (dx > DPAD.dead) result.add('right');
      if (dy < -DPAD.dead) result.add('up');
      if (dy > DPAD.dead) result.add('down');
    }

    for (const b of PAD_BUTTONS) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r * 1.35) result.add(b.button);
    }
    return result;
  }

  private refreshHeldFromTouches(): void {
    this.touchHeld.clear();
    for (const set of this.touches.values()) for (const b of set) this.touchHeld.add(b);
    this.sync();
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.showTouchUI();
    const p = this.toGame(e);
    this.touches.set(e.pointerId, this.hitTest(p.x, p.y));
    this.refreshHeldFromTouches();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' || !this.touches.has(e.pointerId)) return;
    e.preventDefault();
    const p = this.toGame(e);
    this.touches.set(e.pointerId, this.hitTest(p.x, p.y));
    this.refreshHeldFromTouches();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.touches.delete(e.pointerId)) return;
    e.preventDefault();
    this.refreshHeldFromTouches();
  };

  // ------------------------------------------------------------ 가상 패드 표시

  /** 터치가 실제로 들어왔을 때만 패드를 띄운다 (데스크톱에서는 방해가 되므로) */
  private showTouchUI(): void {
    if (this.touchVisible || !this.pad) return;
    this.touchVisible = true;
    this.pad.visible = true;
  }

  mountTouchUI(parent: Container): void {
    const pad = new Container();
    pad.visible = false;

    const ring = new Graphics();
    ring.circle(DPAD.x, DPAD.y, DPAD.r).fill({ color: 0xffffff, alpha: 0.07 });
    ring.circle(DPAD.x, DPAD.y, DPAD.r).stroke({ color: 0xffffff, alpha: 0.22, width: 1 });
    ring.moveTo(DPAD.x - DPAD.r + 6, DPAD.y).lineTo(DPAD.x + DPAD.r - 6, DPAD.y);
    ring.moveTo(DPAD.x, DPAD.y - DPAD.r + 6).lineTo(DPAD.x, DPAD.y + DPAD.r - 6);
    ring.stroke({ color: 0xffffff, alpha: 0.16, width: 1 });
    pad.addChild(ring);

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

    // 터치 기기로 판단되면 처음부터 보여준다
    if (matchMedia('(pointer: coarse)').matches) {
      this.touchVisible = true;
      pad.visible = true;
    }
  }
}
