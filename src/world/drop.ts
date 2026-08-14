/**
 * 적이 떨어뜨리는 회복 아이템.
 *
 * 사냥의 보상이 경험치뿐이면 사냥터에 머물 이유가 약하다. 체력과 무기
 * 에너지를 적에게서 얻게 해야 "사냥 → 유지 → 더 사냥"이 돌아간다.
 */

import { Graphics } from 'pixi.js';
import { overlaps, type Room } from './room';

export type DropKind = 'health' | 'energy' | 'bolt';

const LOOK: Record<DropKind, { color: number; edge: number }> = {
  health: { color: 0x7fe4ff, edge: 0x2f6fd0 },
  energy: { color: 0xffd85c, edge: 0xb07a10 },
  bolt: { color: 0xc0c8d8, edge: 0x6a7488 },
};

const GRAVITY = 620;
const LIFETIME = 18;

export class Drop {
  readonly view = new Graphics();
  private vy = -90;
  private life = LIFETIME;
  taken = false;

  constructor(
    readonly kind: DropKind,
    readonly amount: number,
    public x: number,
    public y: number,
  ) {
    const look = LOOK[kind];
    this.view.rect(-3, -6, 6, 6).fill({ color: look.color });
    this.view.rect(-3, -6, 6, 1).fill({ color: 0xffffff });
    this.view.rect(-3, -1, 6, 1).fill({ color: look.edge });
    this.view.position.set(x, y);
  }

  update(dt: number, room: Room): void {
    if (this.taken) return;

    this.life -= dt;
    if (this.life <= 0) {
      this.taken = true;
      this.view.visible = false;
      return;
    }

    this.vy = Math.min(this.vy + GRAVITY * dt, 260);
    this.y += this.vy * dt;

    // 지형 위에 얹힌다
    for (const s of room.solids) {
      if (overlaps(this.x - 3, this.y - 6, 6, 6, s) && this.vy > 0) {
        this.y = s.y;
        this.vy = 0;
        break;
      }
    }

    // 사라지기 직전에 깜빡여서 알린다
    this.view.alpha = this.life < 3 && Math.floor(this.life * 8) % 2 === 0 ? 0.3 : 1;
    this.view.position.set(Math.round(this.x), Math.round(this.y));
  }

  touches(px: number, py: number, pw: number, ph: number): boolean {
    if (this.taken) return false;
    // 실제 그림보다 넉넉하게 잡는다 — 정확히 밟아야 주워지면 사냥이 성가시다
    return overlaps(this.x - 10, this.y - 18, 20, 24, {
      x: px - pw / 2,
      y: py - ph,
      w: pw,
      h: ph,
    });
  }

  take(): void {
    this.taken = true;
    this.view.visible = false;
  }
}
