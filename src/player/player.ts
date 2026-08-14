/**
 * 플레이어 액터.
 *
 * 이동 능력은 코드 분기가 아니라 캐릭터 데이터의 movement 플래그가 결정한다
 * (docs/DESIGN.md §6.1). 새 캐릭터를 추가할 때 이 파일은 건드리지 않는다.
 */

import { Container } from 'pixi.js';
import { AnimView, loadSheet } from '../anim/sheet';
import { PHYSICS } from '../core/config';
import { overlaps, type Room } from '../world/room';
import type { ProjectileSystem } from '../combat/projectile';
import type { Input } from '../input/input';

export interface CharacterDef {
  id: string;
  name: string;
  series: string;
  archetype: string;
  hitbox: { w: number; h: number };
  movement: {
    can_dash: boolean;
    can_air_dash: boolean;
    can_wall_kick: boolean;
    can_double_jump: boolean;
    can_climb_ladder: boolean;
    can_slide: boolean;
  };
  shot: { speed: number; color: string; radius: number; lifetime: number };
}

export class Player {
  x = 40;
  y = 208;
  vx = 0;
  vy = 0;
  facing = 1;

  grounded = false;
  wallDir = 0;

  private dashTimer = 0;
  private dashCooldown = 0;
  private airDashUsed = false;
  private jumpsUsed = 0;
  private coyote = 0;
  private buffer = 0;
  private lock = 0;
  private landTimer = 0;
  private attackTimer = 0;
  private chargeTime = 0;

  readonly view: AnimView;
  spriteSource: 'sprites' | 'generated';

  private constructor(
    readonly def: CharacterDef,
    view: AnimView,
    source: 'sprites' | 'generated',
  ) {
    this.view = view;
    this.spriteSource = source;
  }

  static async create(def: CharacterDef, layer: Container): Promise<Player> {
    const sheet = await loadSheet('characters', def.id);
    const view = new AnimView(sheet);
    layer.addChild(view);
    return new Player(def, view, sheet.source);
  }

  get state(): string {
    return this.view.current;
  }

  private get halfWidth(): number {
    return this.def.hitbox.w / 2;
  }

  private blocked(room: Room, x: number, y: number): boolean {
    const { w, h } = this.def.hitbox;
    for (const s of room.solids) {
      if (overlaps(x - w / 2, y - h, w, h, s)) return true;
    }
    return false;
  }

  /**
   * 겹친 지형의 표면에 정확히 붙인다.
   * 조금씩 되돌리는 방식은 표면에서 미세하게 떠서 접지 판정이 깜빡인다.
   */
  private snapY(room: Room, dir: number): number {
    const { w, h } = this.def.hitbox;
    let y = this.y;
    for (const s of room.solids) {
      if (!overlaps(this.x - w / 2, y - h, w, h, s)) continue;
      y = dir > 0 ? Math.min(y, s.y) : Math.max(y, s.y + s.h + h);
    }
    return y;
  }

  private snapX(room: Room, dir: number): number {
    const { w, h } = this.def.hitbox;
    let x = this.x;
    for (const s of room.solids) {
      if (!overlaps(x - w / 2, this.y - h, w, h, s)) continue;
      x = dir > 0 ? Math.min(x, s.x - w / 2) : Math.max(x, s.x + s.w + w / 2);
    }
    return x;
  }

  update(dt: number, input: Input, room: Room, shots: ProjectileSystem): void {
    const move = this.def.movement;

    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.lock = Math.max(0, this.lock - dt);

    const axis = this.lock > 0 ? 0 : input.axisX;
    if (axis !== 0 && this.dashTimer <= 0) this.facing = axis;

    // ---------------------------------------------------------- 대시
    if (
      move.can_dash &&
      input.pressed('dash') &&
      this.dashCooldown <= 0 &&
      this.dashTimer <= 0 &&
      (this.grounded || (move.can_air_dash && !this.airDashUsed))
    ) {
      this.dashTimer = PHYSICS.dashDuration;
      if (!this.grounded) this.airDashUsed = true;
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vx = this.facing * PHYSICS.dashSpeed;
      if (this.dashTimer <= 0) this.dashCooldown = PHYSICS.dashCooldown;
    } else {
      const target = axis * PHYSICS.runSpeed;
      const accel = this.grounded ? 1 : PHYSICS.airControl;
      this.vx += (target - this.vx) * Math.min(1, accel * dt * 22);
    }

    // ---------------------------------------------------------- 점프
    if (input.pressed('jump')) this.buffer = PHYSICS.jumpBuffer;
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = this.grounded ? PHYSICS.coyoteTime : Math.max(0, this.coyote - dt);

    const sliding =
      move.can_wall_kick && !this.grounded && this.wallDir !== 0 && this.vy > 0 && axis === this.wallDir;

    if (this.buffer > 0) {
      if (this.coyote > 0) {
        this.vy = -PHYSICS.jumpVelocity;
        this.buffer = 0;
        this.jumpsUsed = 1;
      } else if (sliding) {
        this.vy = -PHYSICS.wallKickY;
        this.vx = -this.wallDir * PHYSICS.wallKickX;
        this.facing = -this.wallDir;
        this.lock = PHYSICS.wallKickLock;
        this.buffer = 0;
        this.airDashUsed = false;
        this.jumpsUsed = 1;
      } else if (move.can_double_jump && this.jumpsUsed < 2) {
        this.vy = -PHYSICS.jumpVelocity * 0.92;
        this.buffer = 0;
        this.jumpsUsed = 2;
      }
    }

    // 버튼을 일찍 떼면 상승을 자른다 — 가변 점프 높이
    if (input.released('jump') && this.vy < 0) this.vy *= PHYSICS.jumpCutFactor;

    // ---------------------------------------------------------- 중력
    this.vy += PHYSICS.gravity * dt;
    if (sliding) this.vy = Math.min(this.vy, PHYSICS.wallSlideSpeed);
    this.vy = Math.min(this.vy, PHYSICS.maxFall);

    // ---------------------------------------------------------- 이동·충돌
    const wasGrounded = this.grounded;

    this.x += this.vx * dt;
    if (this.blocked(room, this.x, this.y)) {
      this.x = this.snapX(room, Math.sign(this.vx) || this.facing);
      this.vx = 0;
      if (this.dashTimer > 0) this.dashTimer = 0;
    }

    this.y += this.vy * dt;
    if (this.blocked(room, this.x, this.y)) {
      this.y = this.snapY(room, Math.sign(this.vy) || 1);
      this.vy = 0;
    }

    // 접지는 충돌 결과가 아니라 별도 탐침으로 판정한다.
    // 충돌 해제 후에는 접촉면에 정확히 붙어 있어 "겹침"이 발생하지 않기 때문.
    this.grounded = this.blocked(room, this.x, this.y + 1);
    if (this.grounded) {
      this.airDashUsed = false;
      this.jumpsUsed = 0;
      if (!wasGrounded) this.landTimer = 0.14;
    }

    // 벽 접촉 판정 — 좌우 1픽셀 탐침
    this.wallDir = 0;
    if (!this.grounded) {
      if (this.blocked(room, this.x + 1, this.y)) this.wallDir = 1;
      else if (this.blocked(room, this.x - 1, this.y)) this.wallDir = -1;
    }

    // 룸 밖으로 나가지 않게
    this.x = Math.max(this.halfWidth, Math.min(room.width - this.halfWidth, this.x));

    // ---------------------------------------------------------- 사격
    if (input.down('shoot')) this.chargeTime += dt;
    if (input.pressed('shoot')) {
      const charged = false;
      this.fire(shots, charged);
    }
    if (input.released('shoot')) {
      if (this.chargeTime > 0.55) this.fire(shots, true);
      this.chargeTime = 0;
    }

    this.applyAnimation(sliding, dt);
  }

  private fire(shots: ProjectileSystem, charged: boolean): void {
    this.attackTimer = 0.22;
    const s = this.def.shot;
    shots.spawn({
      x: this.x + this.facing * 11,
      y: this.y - 19,
      dir: this.facing,
      speed: s.speed,
      color: Number(s.color),
      radius: charged ? s.radius * 2.4 : s.radius,
      lifetime: s.lifetime,
    });
  }

  private applyAnimation(sliding: boolean, dt: number): void {
    let tag: string;

    if (sliding) tag = 'wall_slide';
    else if (this.dashTimer > 0) tag = 'dash';
    else if (!this.grounded) {
      tag = this.attackTimer > 0 ? 'attack_air' : this.vy < 0 ? 'jump_rise' : 'jump_fall';
    } else if (this.attackTimer > 0) tag = 'attack_main';
    else if (this.landTimer > 0) tag = 'jump_land';
    else if (Math.abs(this.vx) > 8) tag = 'run';
    else if (this.chargeTime > 0.55) tag = 'charge_loop';
    else tag = 'idle';

    this.view.play(tag);
    this.view.update(dt * 1000);
    this.view.position.set(Math.round(this.x), Math.round(this.y));
    this.view.scale.x = this.facing;
  }
}
