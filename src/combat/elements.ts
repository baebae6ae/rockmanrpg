/**
 * 속성 상성 — docs/DESIGN.md §6.4
 *
 * 록맨의 약점 시스템은 원래 데이터 표다. 코드에 상성을 박지 않는다.
 */

import chart from '../../data/elements.json';

interface ElementChart {
  elements: string[];
  default_multiplier: number;
  chart: Record<string, Record<string, number>>;
}

const table = chart as ElementChart;

/** 공격 속성이 방어 속성에 주는 배율 */
export function multiplier(attack: string, defend: string): number {
  return table.chart[attack]?.[defend] ?? table.default_multiplier;
}

export function isWeakness(attack: string, defend: string): boolean {
  return multiplier(attack, defend) > 1;
}

export function computeDamage(power: number, attack: string, defend: string): number {
  return Math.max(1, Math.round(power * multiplier(attack, defend)));
}
