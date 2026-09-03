/**
 * 아홉 대원이 공유하는 애니메이션 — 자세만 나열한다.
 *
 * 그림은 crew.ts 가 그리고 여기는 "언제 어떤 자세인가"만 정한다. 자세를
 * 대원별로 따로 짜면 아홉 벌을 관리해야 하므로, 골격을 공유하는 대신
 * 개성은 머리·장비·체격이 낸다.
 *
 * 팔은 앞뒤가 아니라 무기 팔 / 빈 팔로 지정한다 — crew.ts 의 Pose 주석 참고.
 */
import type { Pose } from './crew.js';

export interface Tag {
  name: string;
  /** 한 프레임 지속 시간(ms) */
  duration: number;
  loop: boolean;
  poses: Pose[];
}

/**
 * 달리기 — 발이 땅을 밀고 몸이 위아래로 한 번씩 튄다.
 * 무기 팔은 안 흔든다. 흔들면 거기 붙은 무기가 매 프레임 얼굴을 지나간다.
 *
 * 핵심은 "항상 움직이는 것"이 아니라 접지 프레임을 명확히 두는 것이다.
 * 접지→압축→통과→비행의 네 박자가 보여야 작은 64px 스프라이트도
 * 실제로 달리는 것으로 읽힌다.
 */
function runCycle(): Pose[] {
  const out: Pose[] = [];
  const cycle = [
    { hipY: 16, lean: 2, ff: [7, 0] as [number, number], fb: [-5, 0] as [number, number], free: 'back' as const },
    { hipY: 14, lean: 3, ff: [6, 0] as [number, number], fb: [-3, 1] as [number, number], free: 'back' as const },
    { hipY: 15, lean: 2, ff: [3, 4] as [number, number], fb: [-1, 4] as [number, number], free: 'forward' as const },
    { hipY: 17, lean: 1, ff: [2, 5] as [number, number], fb: [-6, 3] as [number, number], free: 'forward' as const },
    { hipY: 16, lean: 2, ff: [5, 0] as [number, number], fb: [-7, 0] as [number, number], free: 'forward' as const },
    { hipY: 14, lean: 3, ff: [3, 1] as [number, number], fb: [-5, 0] as [number, number], free: 'forward' as const },
    { hipY: 15, lean: 2, ff: [0, 4] as [number, number], fb: [-2, 4] as [number, number], free: 'back' as const },
    { hipY: 17, lean: 1, ff: [6, 5] as [number, number], fb: [-3, 3] as [number, number], free: 'back' as const },
  ];
  for (const p of cycle) {
    out.push({
      hipY: p.hipY,
      lean: p.lean,
      footF: p.ff,
      footB: p.fb,
      armWeapon: 'down',
      armFree: p.free,
    });
  }
  return out;
}

export function crewTags(): Tag[] {
  return [
    {
      // 숨쉬기. 골반이 먼저 내려가고 머리가 한 프레임 늦게 따라온다.
      // 둘이 같이 움직이면 몸 전체가 위아래로 튀는 기계가 된다.
      name: 'idle', duration: 170, loop: true,
      poses: [
        { hipY: 16, lean: 3, footF: [7, 0], footB: [-3, 0], armFree: 'guard' },
        { hipY: 16, lean: 3, headY: -1, footF: [7, 0], footB: [-3, 0], armFree: 'guard' },
        { hipY: 15, lean: 4, headY: -1, footF: [7, 0], footB: [-3, 0], armFree: 'guard' },
        { hipY: 16, lean: 3, headY: 0, footF: [7, 0], footB: [-3, 0], armFree: 'guard' },
      ],
    },
    { name: 'run', duration: 58, loop: true, poses: runCycle() },
    {
      // 상승은 몸을 길게, 팔은 위로. 점프의 "준비→이륙"이 한 번에 읽힌다.
      name: 'jump_rise', duration: 90, loop: false,
      poses: [
        { hipY: 18, lean: 1, footF: [5, 5], footB: [-4, 3], armWeapon: 'guard', armFree: 'up' },
        { hipY: 20, lean: 2, headY: 1, footF: [7, 7], footB: [-6, 5], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      name: 'jump_fall', duration: 90, loop: true,
      poses: [
        { hipY: 18, lean: -1, footF: [4, 2], footB: [-5, 5], armWeapon: 'down', armFree: 'up' },
        { hipY: 17, lean: -1, footF: [5, 1], footB: [-5, 4], armWeapon: 'down', armFree: 'up' },
      ],
    },
    {
      // 착지 — 먼저 낮아졌다가 한 박자 뒤에 올라온다. 공격 직후의 착지에도
      // 이 압축 프레임이 있어야 속도가 아니라 무게가 보인다.
      name: 'jump_land', duration: 76, loop: false,
      poses: [
        { hipY: 11, lean: -1, footF: [6, 0], footB: [-6, 0], armWeapon: 'guard', armFree: 'guard' },
        { hipY: 14, lean: 1, footF: [5, 0], footB: [-5, 0] },
        { hipY: 16, lean: 1, footF: [5, 0], footB: [-5, 0] },
      ],
    },
    {
      name: 'dash', duration: 80, loop: true,
      poses: [
        { hipY: 13, lean: 4, headY: -1, footF: [8, 1], footB: [-6, 0], armWeapon: 'down', armFree: 'back' },
        { hipY: 12, lean: 4, headY: -1, footF: [10, 0], footB: [-5, 1], armWeapon: 'down', armFree: 'back' },
      ],
    },
    {
      name: 'wall_slide', duration: 120, loop: true,
      poses: [
        { hipY: 17, lean: -2, footF: [-1, 3], footB: [2, 6], armWeapon: 'guard', armFree: 'up' },
        { hipY: 17, lean: -2, headY: -1, footF: [-2, 4], footB: [2, 5], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      name: 'wall_kick', duration: 80, loop: false,
      poses: [
        { hipY: 18, lean: 2, footF: [7, 6], footB: [-5, 2], armWeapon: 'guard', armFree: 'up' },
        { hipY: 20, lean: 3, footF: [8, 7], footB: [-6, 2], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      // 공격은 예비동작을 더 길게 잡고 타격 프레임에서 몸을 앞으로 던진다.
      // 이 차이가 있어야 자동사격에서도 "발사했다"가 자세 변화로 보인다.
      name: 'attack_main', duration: 78, loop: false,
      poses: [
        { hipY: 16, lean: -3, armWeapon: 'back', armFree: 'back' },
        { hipY: 15, lean: -4, armWeapon: 'guard', armFree: 'back', charge: 0.25 },
        { hipY: 16, lean: -1, armWeapon: 'aim', armFree: 'forward', slash: 'high' },
        { hipY: 16, lean: 1, armWeapon: 'aim', armFree: 'forward' },
      ],
    },
    {
      name: 'attack_air', duration: 74, loop: false,
      poses: [
        { hipY: 18, lean: -2, footF: [4, 4], footB: [-4, 5], armWeapon: 'guard', armFree: 'up' },
        { hipY: 19, lean: -2, footF: [3, 5], footB: [-5, 4], armWeapon: 'back', armFree: 'up' },
        { hipY: 18, lean: 0, footF: [5, 4], footB: [-4, 5], armWeapon: 'aim', armFree: 'up', slash: 'low' },
      ],
    },
    {
      name: 'charge_loop', duration: 90, loop: true,
      poses: [
        { hipY: 16, lean: -1, armWeapon: 'aim', charge: 0.15 },
        { hipY: 15, lean: -2, headY: -1, armWeapon: 'aim', charge: 0.55 },
        { hipY: 16, lean: -1, armWeapon: 'aim', charge: 1.0 },
        { hipY: 15, lean: 0, armWeapon: 'aim', charge: 0.55 },
      ],
    },
    {
      name: 'hurt', duration: 96, loop: false,
      poses: [
        { hipY: 17, lean: -4, headY: 1, footF: [0, 2], footB: [-7, 1], armWeapon: 'up', armFree: 'up', weapon: false },
        { hipY: 16, lean: -3, headY: 1, footF: [-1, 0], footB: [-6, 0], armWeapon: 'up', armFree: 'up', weapon: false },
        { hipY: 16, lean: -1, footF: [2, 0], footB: [-5, 0], armWeapon: 'guard', armFree: 'back', weapon: false },
      ],
    },
  ];
}
