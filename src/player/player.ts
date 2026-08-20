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
import type { MeleeSystem } from '../combat/melee';
import { computeDamage } from '../combat/elements';
import { popText } from '../ui/floating_text';
import { fireSkill } from '../combat/skill';
import type { Damageable } from '../combat/types';
import type { Progress, SkillDef } from '../progression/progress';
import type { Input } from '../input/input';

export interface CharacterDef {
  id: string;
  name: string;
  series: string;
  archetype: string;
  hitbox: { w: number; h: number };
  /** 총구/무기 높이 = hitbox.h * 이 비율. 생략하면 0.63 (docs/DESIGN.md §6.2) */
  muzzle_ratio?: number;
  movement: {
    can_dash: boolean;
    can_air_dash: boolean;
    can_wall_kick: boolean;
    can_double_jump: boolean;
    can_climb_ladder: boolean;
    can_slide: boolean;
  };
  base_stats: { hp: number; attack: number; defense?: number };
  growth: { hp: number; attack: number; defense: number };
  starting_skills: string[];
}

export class Player implements Damageable {
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
  /** 대시 중 점프하면 공중에서도 대시 속도를 유지한다 — X 시리즈의 대시점프 */
  private dashJump = false;
  /** 클래식 계열의 슬라이딩 — 대시와 같은 이동이지만 아래+점프로 나간다 */
  private slideMode = false;
  private jumpsUsed = 0;
  private coyote = 0;
  private buffer = 0;
  private lock = 0;
  private landTimer = 0;
  private attackTimer = 0;
  private chargeTime = 0;
  /** 지상 공격 연속기 단계 (0~2) — 세이버류 3단 콤보 */
  private comboStep = 0;
  private comboWindow = 0;
  private sliding = false;

  hp: number;
  readonly element = 'neutral';
  /** 이 캐릭터가 쓸 수 있는 무기 — 기본 무기 + 획득한 특수무기 */
  weapons: SkillDef[] = [];
  weaponIndex = 0;
  private cooldown = 0;
  private invulnTimer = 0;
  private hurtTimer = 0;
  private deathTimer = 0;
  private spawnX: number;
  private spawnY: number;

  readonly view: AnimView;
  spriteSource: 'sprites' | 'generated';

  private constructor(
    readonly def: CharacterDef,
    view: AnimView,
    source: 'sprites' | 'generated',
    readonly progress: Progress,
    spawn: { x: number; y: number },
  ) {
    this.view = view;
    this.spriteSource = source;
    this.hp = this.maxHp;
    this.x = spawn.x;
    this.y = spawn.y;
    this.spawnX = spawn.x;
    this.spawnY = spawn.y;
  }

  /** 레벨 성장·장비·분배 포인트를 반영한 최대 체력 */
  get maxHp(): number {
    const grown = this.def.base_stats.hp + this.def.growth.hp * (this.progress.level - 1);
    return Math.round(grown + this.progress.bonusDefense * 2 + this.progress.stats.vitality * 6);
  }

  /** 무기 위력에 더해지는 공격력 */
  get attackStat(): number {
    const grown = this.def.base_stats.attack + this.def.growth.attack * (this.progress.level - 1);
    return Math.round(grown + this.progress.bonusAttack + this.progress.stats.attack * 2);
  }

  /** 받는 피해를 줄이는 방어력 */
  get defenseStat(): number {
    const base = this.def.base_stats.defense ?? 0;
    const grown = base + this.def.growth.defense * (this.progress.level - 1);
    return Math.round(grown + this.progress.bonusDefense + this.progress.stats.defense * 2);
  }

  get weapon(): SkillDef | undefined {
    return this.weapons[this.weaponIndex];
  }

  cycleWeapon(): void {
    if (this.weapons.length < 2) return;
    this.weaponIndex = (this.weaponIndex + 1) % this.weapons.length;
    this.chargeTime = 0;
  }

  /** 맵을 옮길 때 위치와 부활 지점을 함께 옮긴다 */
  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.spawnX = x;
    this.spawnY = y;
  }

  get alive(): boolean {
    return this.hp > 0;
  }
  get hitboxW(): number {
    return this.def.hitbox.w;
  }
  get hitboxH(): number {
    return this.def.hitbox.h;
  }
  get invulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  takeDamage(power: number, element: string, fromX: number): void {
    if (this.invulnTimer > 0 || this.deathTimer > 0 || !this.alive) return;

    const raw = computeDamage(power, element, this.element);
    // 방어력은 뺄셈으로, 장비 보정은 곱셈으로 적용한다
    const afterDefense = Math.max(1, raw - this.defenseStat * 0.35);
    const reduced = Math.max(1, Math.round(afterDefense * (1 - this.progress.modifier('damage_reduction'))));
    this.hp = Math.max(0, this.hp - reduced);
    popText(this.x, this.y - this.def.hitbox.h - 2, `${reduced}`, 'player');
    this.invulnTimer = 1;
    this.hurtTimer = 0.34;
    this.dashTimer = 0;
    this.dashJump = false;
    this.vx = (this.x >= fromX ? 1 : -1) * 78;
    this.vy = -130;

    if (this.hp <= 0) {
      this.deathTimer = 1.3;
      this.view.play('death');
    }
  }

  private respawn(): void {
    this.hp = this.maxHp;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = 0;
    this.vy = 0;
    this.invulnTimer = 1.2;
    this.view.alpha = 1;
  }

  static async create(
    def: CharacterDef,
    layer: Container,
    progress: Progress,
    skills: Record<string, SkillDef>,
    spawn: { x: number; y: number },
  ): Promise<Player> {
    const sheet = await loadSheet('characters', def.id);
    const view = new AnimView(sheet);
    layer.addChild(view);
    const player = new Player(def, view, sheet.source, progress, spawn);
    player.refreshWeapons(skills);
    return player;
  }

  /** 기본 무기 뒤에 획득한 특수무기를 붙인다 */
  refreshWeapons(skills: Record<string, SkillDef>): void {
    const list: SkillDef[] = [];
    for (const id of this.def.starting_skills) {
      if (skills[id]) list.push(skills[id]);
    }
    for (const id of this.progress.owned) {
      if (skills[id] && !list.some((s) => s.id === id)) list.push(skills[id]);
    }
    this.weapons = list;
    this.weaponIndex = Math.min(this.weaponIndex, Math.max(0, list.length - 1));
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

  /** 축별로 이동시킨 뒤 지형에 붙인다 */
  private integrate(dt: number, room: Room): void {
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

    this.x = Math.max(this.halfWidth, Math.min(room.width - this.halfWidth, this.x));
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

  update(
    dt: number,
    input: Input,
    room: Room,
    shots: ProjectileSystem,
    melee: MeleeSystem,
    meleeTargets: Damageable[],
  ): void {
    const move = this.def.movement;

    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    // 사망 중에는 조작을 받지 않고 낙하만 시킨다
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      this.vx *= 0.88;
      this.vy = Math.min(this.vy + PHYSICS.gravity * dt, PHYSICS.maxFall);
      this.integrate(dt, room);
      if (this.deathTimer <= 0) this.respawn();
      this.view.update(dt * 1000);
      this.syncView();
      return;
    }

    const stunned = this.hurtTimer > 0;

    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.lock = Math.max(0, this.lock - dt);

    const axis = stunned ? 0 : input.axisX;
    if (axis !== 0 && this.dashTimer <= 0 && this.lock <= 0) this.facing = axis;

    // ---------------------------------------------------------- 대시·슬라이딩
    if (
      move.can_dash &&
      !stunned &&
      input.pressed('dash') &&
      this.dashCooldown <= 0 &&
      this.dashTimer <= 0 &&
      (this.grounded || (move.can_air_dash && !this.airDashUsed))
    ) {
      this.dashTimer = PHYSICS.dashDuration;
      this.slideMode = false;
      if (!this.grounded) this.airDashUsed = true;
    }

    // 클래식 계열은 대시가 없는 대신 아래+점프로 슬라이딩한다
    if (
      move.can_slide &&
      !stunned &&
      this.grounded &&
      this.dashTimer <= 0 &&
      this.dashCooldown <= 0 &&
      input.down('down') &&
      input.pressed('jump')
    ) {
      this.dashTimer = PHYSICS.dashDuration;
      this.slideMode = true;
      this.buffer = 0;
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.dashCooldown = PHYSICS.dashCooldown;
        this.slideMode = false;
      }
    }

    // 벽에 붙으면 대시점프 관성은 끊긴다
    if (this.wallDir !== 0) this.dashJump = false;
    // 대시점프 중 반대 방향을 누르면 관성을 버린다
    if (this.dashJump && axis !== 0 && axis !== this.facing) this.dashJump = false;

    // ---------------------------------------------------------- 수평 속도
    // 가속 곡선 없음. 입력이 그대로 속도가 된다.
    if (stunned) {
      // 피격 경직 중에는 넉백 속도만 남긴다
      this.vx *= 0.9;
    } else if (this.lock > 0) {
      // 벽차기 직후 짧은 구간만 반동 속도를 유지한다
    } else if (this.dashTimer > 0) {
      this.vx = this.facing * this.dashSpeed;
    } else if (this.dashJump && !this.grounded) {
      this.vx = this.facing * this.dashSpeed;
    } else {
      this.vx = axis * PHYSICS.runSpeed;
    }

    // ---------------------------------------------------------- 점프
    if (input.pressed('jump') && !stunned && !(this.slideMode && this.dashTimer > 0)) {
      this.buffer = PHYSICS.jumpBuffer;
    }
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = this.grounded ? PHYSICS.coyoteTime : Math.max(0, this.coyote - dt);

    // 벽에 닿아 낙하 중이면 매달린다. 방향키를 붙잡고 있을 필요는 없다 —
    // 그 조건을 걸면 등반 중 재접촉이 까다로워져 벽타기가 사실상 불가능해진다.
    this.sliding = move.can_wall_kick && !this.grounded && this.wallDir !== 0 && this.vy > 0;

    if (this.buffer > 0) {
      if (this.coyote > 0) {
        this.vy = -PHYSICS.jumpVelocity;
        this.buffer = 0;
        this.coyote = 0;
        this.jumpsUsed = 1;
        if (this.dashTimer > 0) this.dashJump = true;
      } else if (this.sliding) {
        // 대시를 누른 채 벽을 차면 훨씬 멀리 튀어나간다 — X 시리즈의 대시 벽차기
        const dashKick = move.can_dash && (input.down('dash') || this.dashTimer > 0);

        this.vy = -PHYSICS.wallKickY;
        this.facing = -this.wallDir;
        this.vx = this.facing * (dashKick ? this.dashSpeed : PHYSICS.wallKickX);
        this.lock = dashKick ? PHYSICS.wallKickLock * 1.6 : PHYSICS.wallKickLock;
        this.buffer = 0;
        this.airDashUsed = false;
        this.dashTimer = 0;
        this.dashJump = dashKick;
        this.jumpsUsed = 1;
      } else if (move.can_double_jump && this.jumpsUsed < 2) {
        this.vy = -PHYSICS.jumpVelocity * 0.92;
        this.buffer = 0;
        this.jumpsUsed = 2;
      }
    }

    // 버튼을 일찍 떼면 상승을 자른다 — 가변 점프 높이
    if (input.released('jump') && this.vy < -PHYSICS.jumpCutVelocity) {
      this.vy = -PHYSICS.jumpCutVelocity;
    }

    // ---------------------------------------------------------- 중력
    this.vy += PHYSICS.gravity * dt;
    if (this.sliding) this.vy = Math.min(this.vy, PHYSICS.wallSlideSpeed);
    this.vy = Math.min(this.vy, PHYSICS.maxFall);

    // ---------------------------------------------------------- 이동·충돌
    const wasGrounded = this.grounded;

    this.integrate(dt, room);

    // 접지는 충돌 결과가 아니라 별도 탐침으로 판정한다.
    // 충돌 해제 후에는 접촉면에 정확히 붙어 있어 "겹침"이 발생하지 않기 때문.
    this.grounded = this.blocked(room, this.x, this.y + 1);
    if (this.grounded) {
      this.airDashUsed = false;
      this.jumpsUsed = 0;
      this.dashJump = false;
      if (!wasGrounded) this.landTimer = 0.14;
    }

    // 벽 접촉 판정 — 좌우 1픽셀 탐침
    this.wallDir = 0;
    if (!this.grounded) {
      if (this.blocked(room, this.x + 1, this.y)) this.wallDir = 1;
      else if (this.blocked(room, this.x - 1, this.y)) this.wallDir = -1;

      // 벽에 붙으면 에어대시와 점프 횟수가 회복된다. 이게 없으면 긴 벽을
      // 끝까지 오를 수 없다.
      if (this.wallDir !== 0) {
        this.airDashUsed = false;
        this.jumpsUsed = 0;
      }
    }

    // 룸 밖으로 나가지 않게
    this.x = Math.max(this.halfWidth, Math.min(room.width - this.halfWidth, this.x));

    // ---------------------------------------------------------- 사격
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (input.pressed('weapon') && !stunned) this.cycleWeapon();

    if (stunned) this.chargeTime = 0;
    else if (input.down('shoot')) this.chargeTime += dt;

    // 차지 가능한 무기는 누르는 순간 바로 쏘지 않는다 — 누르자마자 공격 자세가
    // 반짝이고 차지가 시작되면 "누를 때마다 공격만 나온다"는 인상을 준다.
    // 떼는 순간 차지 여부에 따라 일반/차지샷 중 하나만 나가게 한다.
    const chargeable = !!this.weapon?.charged;
    if (input.pressed('shoot') && !stunned && !chargeable) this.fire(shots, melee, meleeTargets, false);
    if (input.released('shoot') && !stunned) {
      if (chargeable) this.fire(shots, melee, meleeTargets, this.chargeTime > this.chargeThreshold);
      this.chargeTime = 0;
    }

    this.applyAnimation(dt);
  }

  /** 장비로 짧아지는 차지 시간 */
  get chargeThreshold(): number {
    return 0.55 * (1 - this.progress.modifier('charge_rate'));
  }

  get dashSpeed(): number {
    return PHYSICS.dashSpeed * (1 + this.progress.modifier('dash_speed'));
  }

  private fire(shots: ProjectileSystem, melee: MeleeSystem, meleeTargets: Damageable[], charged: boolean): void {
    const skill = this.weapon;
    if (!skill || this.cooldown > 0) return;
    // 차지샷은 차지가 가능한 무기에서만
    const useCharge = charged && !!skill.charged;

    const ok = fireSkill(skill, {
      attackBonus: this.attackStat,
      x: this.x,
      // 총구 높이는 캐릭터 키를 따른다 — 클래식 계열은 X 계열보다 낮다
      y: this.y - this.def.hitbox.h * (this.def.muzzle_ratio ?? 0.63),
      facing: this.facing,
      shots,
      melee,
      meleeTargets,
      progress: this.progress,
      charged: useCharge,
    });
    if (!ok) return;

    this.attackTimer = 0.22;
    this.cooldown = skill.cooldown;

    // 지상 공격만 3단 콤보를 탄다 — 콤보 유효시간 안에 다시 때리면 다음 단으로
    if (this.grounded && !charged) {
      this.comboStep = this.comboWindow > 0 ? (this.comboStep + 1) % 3 : 0;
      this.comboWindow = 0.6;
    } else {
      this.comboStep = 0;
      this.comboWindow = 0;
    }
  }

  private applyAnimation(dt: number): void {
    let tag: string;
    let fallback = 'idle';

    if (this.hurtTimer > 0) tag = 'hurt';
    else if (this.sliding) tag = 'wall_slide';
    else if (!this.grounded) {
      tag = this.attackTimer > 0 ? 'attack_air' : this.vy < 0 ? 'jump_rise' : 'jump_fall';
      if (this.attackTimer > 0) fallback = 'attack_main';
    } else if (this.dashTimer > 0 && this.slideMode) tag = 'slide';
    // 대시 중 공격해도 공격 모션이 보이도록, 순수 대시(슬라이드 아님)보다 공격을 우선한다
    else if (this.attackTimer > 0) {
      // 세이버류 3단 콤보 — attack_main2/3 이 없는 캐릭터는 attack_main 으로 대체된다
      const comboTag = this.comboStep === 0 ? 'attack_main' : `attack_main${this.comboStep + 1}`;
      // 이동 중 전용 공격 동작(달리며/미끄러지며 쏘기)이 있으면 그걸 쓰고,
      // 없는 캐릭터(세이버류)는 콤보 공격 자세를 그대로 보여준다
      if (this.dashTimer > 0 && this.view.has('dash_attack')) tag = 'dash_attack';
      else if (Math.abs(this.vx) > 8 && this.view.has('run_attack')) tag = 'run_attack';
      else tag = comboTag;
      fallback = 'attack_main';
    } else if (this.dashTimer > 0 && this.grounded) tag = 'dash';
    else if (this.landTimer > 0) tag = 'jump_land';
    else if (Math.abs(this.vx) > 8) tag = 'run';
    else if (this.chargeTime > this.chargeThreshold && this.weapon?.charged) tag = 'charge_loop';
    else tag = 'idle';

    this.view.play(tag, fallback);
    this.view.update(dt * 1000);
    this.syncView();
  }

  private syncView(): void {
    this.view.position.set(Math.round(this.x), Math.round(this.y));
    // 벽에 매달릴 때는 벽을 등지고 보이도록 뒤집는다
    this.view.scale.x = this.sliding ? this.wallDir : this.facing;
    // 무적 시간 동안 깜빡인다
    this.view.alpha = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 24) % 2 === 0 ? 0.3 : 1;
  }
}
