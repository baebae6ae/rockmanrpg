/**
 * 통합 입력 — 키보드와 터치를 같은 인터페이스로 다룬다.
 * 모바일이 주 확인 수단이므로 가상 패드는 선택이 아니라 필수다 (docs/DESIGN.md §3.2).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W } from '../core/config';

export type Button = 'left' | 'right' | 'up' | 'down' | 'jump' | 'shoot' | 'dash';

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
  { button: 'jump', x: 288, y: 202, r: 17, label: 'JUMP' },
  { button: 'shoot', x: 248, y: 188, r: 15, label: 'FIRE' },
  { button: 'dash', x: 282, y: 160, r: 14, label: 'DASH' },
];

export class Input {
  private readonly held = new Set<Button>();
  private readonly prev = new Set<Button>();
  /** 포인터별로 어떤 버튼을 누르고 있는지 */
  private readonly touches = new Map<number, Set<Button>>();
  private touchVisible = false;
  private pad: Container | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.held.clear());

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
    return this.held.has(button) && !this.prev.has(button);
  }

  released(button: Button): boolean {
    return !this.held.has(button) && this.prev.has(button);
  }

  /** -1 / 0 / 1 */
  get axisX(): number {
    return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
  }

  endFrame(): void {
    this.prev.clear();
    for (const b of this.held) this.prev.add(b);
  }

  // ------------------------------------------------------------ 키보드

  private onKeyDown = (e: KeyboardEvent): void => {
    const button = KEY_MAP[e.code];
    if (!button) return;
    e.preventDefault();
    this.held.add(button);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const button = KEY_MAP[e.code];
    if (!button) return;
    e.preventDefault();
    this.held.delete(button);
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
    // 터치로 눌린 버튼을 모두 해제한 뒤 다시 채운다 (키보드 입력은 건드리지 않음)
    const fromTouch = new Set<Button>();
    for (const set of this.touches.values()) for (const b of set) fromTouch.add(b);

    for (const b of ['left', 'right', 'up', 'down', 'jump', 'shoot', 'dash'] as Button[]) {
      if (fromTouch.has(b)) this.held.add(b);
      else if (this.touchOwned.has(b)) this.held.delete(b);
    }
    this.touchOwned = fromTouch;
  }

  private touchOwned = new Set<Button>();

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
