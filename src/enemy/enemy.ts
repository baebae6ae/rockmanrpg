/**
 * 적 액터.
 *
 * 행동은 전부 데이터로 기술된 패턴이 결정한다 (docs/DESIGN.md §7).
 * 새 적을 추가할 때 이 파일은 건드리지 않는다.
 */

import { Container } from 'pixi.js';
import { AnimView, loadSheet } from '../anim/sheet';
import { computeDamage } from '../combat/elements';
import type { ProjectileSystem } from '../combat/projectile';
import { boxOf, type Damageable } from '../combat/types';
import { PatternRunner, type PatternContext, type PatternDef, type PatternHost } from '../pattern/interpreter';
import { overlaps, type Room } from '../world/room';

export interface EnemyDef {
  id: string;
  name: string;
  series: string;
  tier: 'mob' | 'miniboss' | 'boss' | 'signature';
  sprite_scale?: number;
  hitbox: { w: number; h: number };
  stats: { hp: number; attack: number; defense?: number; exp: number };
  element: string;
  weakness?: { element: string; multiplier: number }[];
  /** 비행형은 중력을 받지 않는다 */
  gravity?: boolean;
  contact_damage?: number;
  pattern: string;
  pattern_params?: Record<string, unknown>;
}

const ENEMY_GRAVITY = 780;
const ENEMY_MAX_FALL = 300;

export class Enemy implements PatternHost, Damageable {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facing = -1;

  hp: number;
  readonly maxHp: number;
  invulnerable = false;
  alive = true;
  grounded = false;

  private hurtTimer = 0;
  private deathTimer = 0;
  private readonly runner: PatternRunner;
  private meleeBox: { w: number; h: number; time: number; power: number } | null = null;
  private meleeHitDone = false;

  readonly view: AnimView;

  private constructor(
    readonly def: EnemyDef,
    view: AnimView,
    pattern: PatternDef,
    x: number,
    y: number,
    private readonly shots: ProjectileSystem,
  ) {
    this.view = view;
    this.x = x;
    this.y = y;
    this.hp = def.stats.hp;
    this.maxHp = def.stats.hp;
    this.runner = new PatternRunner(this, pattern, def.pattern_params ?? {});
  }

  static async create(
    def: EnemyDef,
    pattern: PatternDef,
    x: number,
    y: number,
    layer: Container,
    shots: ProjectileSystem,
  ): Promise<Enemy> {
    const sheet = await loadSheet('enemies', def.id);
    const view = new AnimView(sheet);
    layer.addChild(view);
    return new Enemy(def, view, pattern, x, y, shots);
  }

  get hitboxW(): number {
    return this.def.hitbox.w;
  }
  get hitboxH(): number {
    return this.def.hitbox.h;
  }
  get element(): string {
    return this.def.element;
  }
  get dying(): boolean {
    return this.deathTimer > 0;
  }

  // ------------------------------------------------------------ PatternHost

  playAnim(tag: string): void {
    if (this.hurtTimer <= 0 && this.alive) this.view.play(tag);
  }

  fire(o: { dx: number; dy: number; speed: number; power: number; element: string; radius: number; color: number }): void {
    this.shots.spawn({
      x: this.x + this.facing * (this.hitboxW / 2),
      y: this.y - this.hitboxH * 0.6,
      dx: o.dx,
      dy: o.dy,
      speed: o.speed,
      color: o.color,
      radius: o.radius,
      lifetime: 3,
      team: 'enemy',
      power: o.power,
      element: o.element,
    });
  }

  melee(o: { w: number; h: number; duration: number; power: number }): void {
    this.meleeBox = { w: o.w, h: o.h, time: o.duration, power: o.power };
    this.meleeHitDone = false;
  }

  // ------------------------------------------------------------ 피격

  takeDamage(power: number, element: string, fromX: number): void {
    if (!this.alive || this.invulnerable || this.deathTimer > 0) return;

    // 적 정의에 명시된 약점이 있으면 전역 상성표보다 우선한다
    const explicit = this.def.weakness?.find((w) => w.element === element);
    const damage = explicit
      ? Math.max(1, Math.round(power * explicit.multiplier))
      : computeDamage(power, element, this.def.element);

    this.hp -= damage;
    this.hurtTimer = 0.18;
    this.view.play('hurt');
    this.vx = Math.sign(this.x - fromX) * 40;

    if (this.hp <= 0) {
      this.hp = 0;
      this.deathTimer = 0.6;
      this.view.play('death');
      this.meleeBox = null;
    }
  }

  // ------------------------------------------------------------ 갱신

  update(dt: number, room: Room, ctx: PatternContext, player: Damageable): void {
    if (!this.alive) return;

    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      this.vx *= 0.9;
      this.applyPhysics(dt, room);
      this.view.update(dt * 1000);
      this.syncView();
      if (this.deathTimer <= 0) {
        this.alive = false;
        this.view.visible = false;
      }
      return;
    }

    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.hurtTimer <= 0) this.runner.update(dt, ctx);

    this.applyPhysics(dt, room);
    this.updateMelee(dt, player);
    this.contactDamage(player);

    this.view.update(dt * 1000);
    this.syncView();
  }

  private applyPhysics(dt: number, room: Room): void {
    if (this.def.gravity !== false) {
      this.vy = Math.min(this.vy + ENEMY_GRAVITY * dt, ENEMY_MAX_FALL);
    }

    const { w, h } = this.def.hitbox;
    const blocked = (x: number, y: number): boolean =>
      room.solids.some((s) => overlaps(x - w / 2, y - h, w, h, s));

    this.x += this.vx * dt;
    if (blocked(this.x, this.y)) {
      const dir = Math.sign(this.vx) || this.facing;
      for (const s of room.solids) {
        if (!overlaps(this.x - w / 2, this.y - h, w, h, s)) continue;
        this.x = dir > 0 ? Math.min(this.x, s.x - w / 2) : Math.max(this.x, s.x + s.w + w / 2);
      }
      this.vx = 0;
    }

    this.y += this.vy * dt;
    if (blocked(this.x, this.y)) {
      const dir = Math.sign(this.vy) || 1;
      for (const s of room.solids) {
        if (!overlaps(this.x - w / 2, this.y - h, w, h, s)) continue;
        this.y = dir > 0 ? Math.min(this.y, s.y) : Math.max(this.y, s.y + s.h + h);
      }
      this.vy = 0;
    }

    this.grounded = blocked(this.x, this.y + 1);
    this.x = Math.max(w / 2, Math.min(room.width - w / 2, this.x));
  }

  private updateMelee(dt: number, player: Damageable): void {
    if (!this.meleeBox) return;
    this.meleeBox.time -= dt;

    if (!this.meleeHitDone) {
      const m = this.meleeBox;
      const bx = this.facing > 0 ? this.x : this.x - m.w;
      const by = this.y - this.hitboxH * 0.5 - m.h / 2;
      const p = boxOf(player);
      if (overlaps(bx, by, m.w, m.h, p)) {
        player.takeDamage(m.power, this.def.element, this.x);
        this.meleeHitDone = true;
      }
    }

    if (this.meleeBox.time <= 0) this.meleeBox = null;
  }

  private contactDamage(player: Damageable): void {
    const power = this.def.contact_damage ?? 0;
    if (power <= 0 || !player.alive) return;
    const me = boxOf(this);
    const p = boxOf(player);
    if (overlaps(me.x, me.y, me.w, me.h, p)) {
      player.takeDamage(power, this.def.element, this.x);
    }
  }

  private syncView(): void {
    this.view.position.set(Math.round(this.x), Math.round(this.y));
    this.view.scale.x = this.facing;
    // 피격 중에는 깜빡인다
    this.view.alpha = this.hurtTimer > 0 && Math.floor(this.hurtTimer * 30) % 2 === 0 ? 0.35 : 1;
  }

  destroy(): void {
    this.view.destroy();
    this.alive = false;
  }
}
