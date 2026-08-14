/** 버스터 샷 — 스킬 효과 프리미티브 `projectile` 의 최소 구현 (docs/DESIGN.md §6.2) */

import { Container, Graphics } from 'pixi.js';
import { overlaps, type Room } from '../world/room';

export interface ProjectileOptions {
  x: number;
  y: number;
  dir: number;
  speed: number;
  color: number;
  radius: number;
  lifetime: number;
}

export class Projectile {
  readonly view = new Graphics();
  private life: number;
  private readonly opts: ProjectileOptions;
  dead = false;

  constructor(opts: ProjectileOptions) {
    this.opts = opts;
    this.life = opts.lifetime;

    this.view.circle(0, 0, opts.radius).fill({ color: opts.color });
    this.view.circle(-opts.dir * (opts.radius * 0.4), 0, opts.radius * 0.45).fill({ color: 0xffffff });
    this.view.position.set(opts.x, opts.y);
  }

  update(dt: number, room: Room): void {
    this.life -= dt;
    this.view.x += this.opts.dir * this.opts.speed * dt;

    if (this.life <= 0 || this.view.x < -16 || this.view.x > room.width + 16) {
      this.dead = true;
      return;
    }

    const r = this.opts.radius;
    for (const s of room.solids) {
      if (overlaps(this.view.x - r, this.view.y - r, r * 2, r * 2, s)) {
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

  update(dt: number, room: Room): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.update(dt, room);
      if (p.dead) {
        p.view.destroy();
        this.items.splice(i, 1);
      }
    }
  }

  get count(): number {
    return this.items.length;
  }
}
