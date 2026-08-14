/** 투사체 — 스킬 효과 프리미티브 `projectile` 의 구현 (docs/DESIGN.md §6.2) */

import { Container, Graphics } from 'pixi.js';
import { overlaps, type Room } from '../world/room';
import { boxOf, type Damageable, type Team } from './types';

export interface ProjectileOptions {
  x: number;
  y: number;
  /** 정규화된 방향 벡터 */
  dx: number;
  dy: number;
  speed: number;
  color: number;
  radius: number;
  lifetime: number;
  team: Team;
  power: number;
  element: string;
  /** 관통하면 맞아도 사라지지 않는다 */
  pierce?: boolean;
  /** 지형을 무시한다 */
  ghost?: boolean;
}

export class Projectile {
  readonly view = new Graphics();
  private life: number;
  private readonly hit = new Set<Damageable>();
  dead = false;

  constructor(readonly opts: ProjectileOptions) {
    this.life = opts.lifetime;
    const r = opts.radius;
    this.view.circle(0, 0, r).fill({ color: opts.color });
    this.view.circle(-opts.dx * r * 0.4, -opts.dy * r * 0.4, r * 0.45).fill({ color: 0xffffff });
    this.view.position.set(opts.x, opts.y);
  }

  update(dt: number, room: Room, targets: Damageable[]): void {
    const o = this.opts;
    this.life -= dt;
    this.view.x += o.dx * o.speed * dt;
    this.view.y += o.dy * o.speed * dt;

    if (this.life <= 0 || this.view.x < -20 || this.view.x > room.width + 20) {
      this.dead = true;
      return;
    }

    const r = o.radius;
    const bx = this.view.x - r;
    const by = this.view.y - r;

    if (!o.ghost) {
      for (const s of room.solids) {
        if (overlaps(bx, by, r * 2, r * 2, s)) {
          this.dead = true;
          return;
        }
      }
    }

    for (const t of targets) {
      if (!t.alive || this.hit.has(t)) continue;
      const b = boxOf(t);
      if (!overlaps(bx, by, r * 2, r * 2, b)) continue;

      t.takeDamage(o.power, o.element, this.view.x);
      this.hit.add(t);
      if (!o.pierce) {
        this.dead = true;
        return;
      }
    }
  }
}

export class ProjectileSystem {
  private readonly items: Projectile[] = [];

  constructor(private readonly layer: Container) {}

  spawn(opts: ProjectileOptions): void {
    const p = new Projectile(opts);
    this.items.push(p);
    this.layer.addChild(p.view);
  }

  /** 팀별로 맞을 대상이 다르므로 대상 목록을 밖에서 받는다 */
  update(dt: number, room: Room, targets: { enemies: Damageable[]; players: Damageable[] }): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.update(dt, room, p.opts.team === 'player' ? targets.enemies : targets.players);
      if (p.dead) {
        p.view.destroy();
        this.items.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.items) p.view.destroy();
    this.items.length = 0;
  }
}
