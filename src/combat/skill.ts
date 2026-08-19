/**
 * 스킬 발동 — 효과 프리미티브의 조합을 실제 투사체로 바꾼다 (docs/DESIGN.md §6.2)
 *
 * 새 무기가 새 코드를 요구하지 않도록, 무기의 개성은 전부 effects 배열이
 * 담당한다.
 */

import type { ProjectileSystem } from './projectile';
import type { MeleeSystem } from './melee';
import type { Damageable } from './types';
import type { Progress, SkillDef, SkillEffect } from '../progression/progress';

function find(effects: SkillEffect[], type: string): SkillEffect | undefined {
  return effects.find((e) => e.type === type);
}

function num(effect: SkillEffect | undefined, key: string, fallback: number): number {
  const v = effect?.[key];
  return typeof v === 'number' ? v : fallback;
}

export interface FireContext {
  x: number;
  /** 총구 높이 (캐릭터 키에 따라 다르다) */
  y: number;
  facing: number;
  shots: ProjectileSystem;
  /** 세이버류 무기가 벨 수 있는 대상 — 근접 판정은 발동 즉시 검사하므로 필요하다 */
  melee: MeleeSystem;
  meleeTargets: Damageable[];
  progress: Progress;
  charged: boolean;
  /** 캐릭터의 공격력 — 무기 위력에 더해진다 */
  attackBonus: number;
}

/** 발동에 성공하면 true. 에너지가 모자라면 false. */
export function fireSkill(skill: SkillDef, ctx: FireContext): boolean {
  const cost = ctx.progress.energyCost(skill);
  if (!ctx.progress.spendEnergy(skill.id, cost)) return false;

  const projectile = find(skill.effects, 'projectile');
  const melee = find(skill.effects, 'melee_hitbox');
  const damage = find(skill.effects, 'damage');

  // 장비 보정과 강화 레벨을 위력에 반영한다
  // 무기 위력(강화 반영) + 캐릭터 공격력. 레벨과 분배 포인트가 여기서 체감된다.
  let power = num(damage, 'power', 6) * ctx.progress.powerScale(skill);
  power += ctx.attackBonus * 0.55;
  power *= 1 + ctx.progress.modifier('power_bonus');

  // 세이버류 — 총알 대신 그 자리에서 즉시 베는 판정 하나
  if (melee) {
    let reach = num(melee, 'reach', 20);
    let height = num(melee, 'height', 20);
    const color = num(melee, 'color', 0xffffff);

    if (ctx.charged && skill.charged) {
      reach *= skill.charged.radius_scale;
      height *= skill.charged.radius_scale;
      power *= skill.charged.power_scale;
    }

    ctx.melee.spawn(
      { x: ctx.x, y: ctx.y, facing: ctx.facing, reach, height, color, power: Math.round(power), element: skill.element },
      ctx.meleeTargets,
    );
    return true;
  }

  const count = Math.max(1, num(projectile, 'count', 1));
  const spread = num(projectile, 'spread', 0);
  const speed = num(projectile, 'speed', 240);
  const lifetime = num(projectile, 'lifetime', 1);
  const color = num(projectile, 'color', 0xffffff);
  let radius = num(projectile, 'radius', 2);
  let pierce = projectile?.pierce === true;

  if (ctx.charged && skill.charged) {
    radius *= skill.charged.radius_scale;
    power *= skill.charged.power_scale;
    pierce = pierce || skill.charged.pierce === true;
  }

  const base = ctx.facing >= 0 ? 0 : Math.PI;
  for (let i = 0; i < count; i++) {
    const offset =
      count > 1 ? ((i / (count - 1)) * 2 - 1) * ((spread * Math.PI) / 180) : 0;
    const angle = base + offset;
    ctx.shots.spawn({
      x: ctx.x + ctx.facing * 11,
      y: ctx.y,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      speed,
      color,
      radius,
      lifetime,
      team: 'player',
      power: Math.round(power),
      element: skill.element,
      pierce,
    });
  }
  return true;
}
