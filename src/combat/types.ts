/** 데미지를 받을 수 있는 대상의 공통 계약 */
export interface Damageable {
  readonly x: number;
  readonly y: number;
  /** 히트박스 (x 는 중앙, y 는 발밑 기준) */
  readonly hitboxW: number;
  readonly hitboxH: number;
  readonly element: string;
  readonly alive: boolean;
  takeDamage(power: number, element: string, fromX: number): void;
}

export type Team = 'player' | 'enemy';

/** 히트박스 좌상단 좌표 */
export function boxOf(t: Damageable): { x: number; y: number; w: number; h: number } {
  return { x: t.x - t.hitboxW / 2, y: t.y - t.hitboxH, w: t.hitboxW, h: t.hitboxH };
}
