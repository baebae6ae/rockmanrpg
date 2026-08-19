/**
 * 근접 공격 — 세이버류 무기는 총알처럼 날아가지 않는다. 캐릭터 앞에
 * 베기 판정이 그 자리에서 순간 나타났다 사라진다. 판정은 발동 시점에
 * 한 번만 검사한다 (칼은 총알과 달리 겹친 대상을 전부 벤다).
 */

import { Container, Graphics } from 'pixi.js';
import { overlaps } from '../world/room';
import { boxOf, type Damageable } from './types';

export interface MeleeOptions {
  x: number;
  y: number;
  facing: number;
  reach: number;
  height: number;
  color: number;
  power: number;
  element: string;
}

const VISUAL_LIFE = 0.12;

class MeleeSwing {
  readonly view = new Graphics();
  private life = VISUAL_LIFE;
  dead = false;

  constructor(opts: MeleeOptions) {
    const dir = opts.facing >= 0 ? 1 : -1;
    const x0 = dir * opts.reach * 0.1;
    const y0 = -opts.height * 0.55;
    const x1 = dir * opts.reach;
    const y1 = opts.height * 0.25;
    const cx = dir * opts.reach * 0.85;
    const cy = -opts.height * 0.15;

    this.view.moveTo(x0, y0).quadraticCurveTo(cx, cy, x1, y1).stroke({ width: 3, color: opts.color, cap: 'round' });
    this.view.moveTo(x0, y0).quadraticCurveTo(cx, cy, x1, y1).stroke({ width: 1, color: 0xffffff, cap: 'round' });
    this.view.position.set(Math.round(opts.x), Math.round(opts.y));
  }

  update(dt: number): void {
    this.life -= dt;
    this.view.alpha = Math.max(0, this.life / VISUAL_LIFE);
    if (this.life <= 0) this.dead = true;
  }
}

export class MeleeSystem {
  private readonly items: MeleeSwing[] = [];

  constructor(private readonly layer: Container) {}

  /** targets 는 이 공격이 맞힐 수 있는 대상만 미리 걸러서 넘긴다 */
  spawn(opts: MeleeOptions, targets: Damageable[]): void {
    const dir = opts.facing >= 0 ? 1 : -1;
    const bx = dir > 0 ? opts.x : opts.x - opts.reach;
    const by = opts.y - opts.height / 2;
    for (const t of targets) {
      if (!t.alive) continue;
      if (overlaps(bx, by, opts.reach, opts.height, boxOf(t))) {
        t.takeDamage(opts.power, opts.element, opts.x);
      }
    }

    const swing = new MeleeSwing(opts);
    this.items.push(swing);
    this.layer.addChild(swing.view);
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.update(dt);
      if (s.dead) {
        s.view.destroy();
        this.items.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const s of this.items) s.view.destroy();
    this.items.length = 0;
  }
}
