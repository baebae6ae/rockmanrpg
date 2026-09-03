/**
 * 아홉 대원이 공유하는 애니메이션 — 자세만 나열한다.
 *
 * 그림은 crew.ts 가 그리고 여기는 "언제 어떤 자세인가"만 정한다.
 * 64px 캐릭터에서 동작이 읽히도록 정지 → 예비 → 접촉 → 회복의
 * 실루엣 차이를 크게 잡는다. 색이나 이펙트에 기대지 않는다.
 */
import type { Pose } from './crew.js';

export interface Tag {
  name: string;
  duration: number;
  loop: boolean;
  poses: Pose[];
}

/** 달리기: 접지 / 압축 / 통과 / 비행을 분명하게 분리한다. */
function runCycle(): Pose[] {
  return [
    { hipY: 16, lean: 3, footF: [9, 0], footB: [-7, 0], armWeapon: 'down', armFree: 'back' },
    { hipY: 14, lean: 4, headY: -1, footF: [10, 0], footB: [-5, 1], armWeapon: 'down', armFree: 'back' },
    { hipY: 13, lean: 5, headY: -1, footF: [7, 2], footB: [-2, 4], armWeapon: 'down', armFree: 'back' },
    { hipY: 15, lean: 4, footF: [3, 5], footB: [-1, 5], armWeapon: 'down', armFree: 'forward' },
    { hipY: 17, lean: 2, footF: [1, 1], footB: [-8, 0], armWeapon: 'down', armFree: 'forward' },
    { hipY: 16, lean: 3, footF: [6, 0], footB: [-9, 0], armWeapon: 'down', armFree: 'forward' },
    { hipY: 14, lean: 4, headY: -1, footF: [4, 1], footB: [-4, 4], armWeapon: 'down', armFree: 'forward' },
    { hipY: 13, lean: 5, headY: -1, footF: [0, 4], footB: [-7, 2], armWeapon: 'down', armFree: 'back' },
    { hipY: 15, lean: 4, footF: [2, 5], footB: [-4, 4], armWeapon: 'down', armFree: 'back' },
    { hipY: 17, lean: 2, footF: [8, 0], footB: [-5, 0], armWeapon: 'down', armFree: 'back' },
  ];
}

export function crewTags(): Tag[] {
  return [
    {
      name: 'idle', duration: 155, loop: true,
      poses: [
        { hipY: 16, lean: 2, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
        { hipY: 16, lean: 2, headY: -1, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'guard' },
        { hipY: 15, lean: 3, headY: -1, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'guard' },
        { hipY: 16, lean: 1, headY: 0, footF: [6, 0], footB: [-5, 0], armWeapon: 'down', armFree: 'rest' },
        { hipY: 16, lean: 2, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    { name: 'run', duration: 48, loop: true, poses: runCycle() },
    {
      name: 'jump_rise', duration: 82, loop: false,
      poses: [
        { hipY: 13, lean: 1, footF: [5, 1], footB: [-5, 0], armWeapon: 'guard', armFree: 'back' },
        { hipY: 17, lean: 2, footF: [7, 4], footB: [-6, 3], armWeapon: 'guard', armFree: 'up' },
        { hipY: 21, lean: 3, headY: 1, footF: [8, 7], footB: [-7, 6], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      name: 'jump_fall', duration: 78, loop: true,
      poses: [
        { hipY: 20, lean: -1, footF: [7, 6], footB: [-6, 7], armWeapon: 'down', armFree: 'up' },
        { hipY: 18, lean: -1, footF: [5, 4], footB: [-6, 6], armWeapon: 'down', armFree: 'back' },
        { hipY: 17, lean: 0, footF: [5, 2], footB: [-5, 4], armWeapon: 'down', armFree: 'back' },
      ],
    },
    {
      name: 'jump_land', duration: 70, loop: false,
      poses: [
        { hipY: 10, lean: -2, headY: 1, footF: [7, 0], footB: [-7, 0], armWeapon: 'guard', armFree: 'guard' },
        { hipY: 13, lean: 1, footF: [6, 0], footB: [-6, 0], armWeapon: 'down', armFree: 'rest' },
        { hipY: 16, lean: 2, footF: [6, 0], footB: [-5, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    {
      name: 'dash', duration: 58, loop: true,
      poses: [
        { hipY: 14, lean: 6, headY: -1, footF: [10, 1], footB: [-8, 0], armWeapon: 'back', armFree: 'back' },
        { hipY: 12, lean: 7, headY: -2, footF: [11, 0], footB: [-7, 1], armWeapon: 'down', armFree: 'back' },
        { hipY: 13, lean: 6, headY: -1, footF: [8, 1], footB: [-10, 0], armWeapon: 'down', armFree: 'back' },
      ],
    },
    {
      name: 'wall_slide', duration: 105, loop: true,
      poses: [
        { hipY: 18, lean: -3, footF: [-2, 5], footB: [4, 7], armWeapon: 'guard', armFree: 'up' },
        { hipY: 17, lean: -3, headY: -1, footF: [-1, 4], footB: [3, 6], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      name: 'wall_kick', duration: 74, loop: false,
      poses: [
        { hipY: 17, lean: 2, footF: [7, 5], footB: [-4, 1], armWeapon: 'guard', armFree: 'up' },
        { hipY: 20, lean: 5, headY: 1, footF: [10, 7], footB: [-7, 2], armWeapon: 'back', armFree: 'up' },
      ],
    },
    {
      name: 'attack_main', duration: 86, loop: false,
      poses: [
        { hipY: 16, lean: -4, footF: [5, 0], footB: [-5, 0], armWeapon: 'back', armFree: 'back' },
        { hipY: 15, lean: -6, footF: [3, 0], footB: [-6, 0], armWeapon: 'back', armFree: 'back', charge: 0.18 },
        { hipY: 15, lean: -2, footF: [5, 1], footB: [-4, 0], armWeapon: 'guard', armFree: 'forward', charge: 0.45 },
        { hipY: 16, lean: 3, footF: [8, 0], footB: [-4, 0], armWeapon: 'aim', armFree: 'forward', slash: 'high' },
        { hipY: 16, lean: 4, footF: [9, 0], footB: [-3, 0], armWeapon: 'aim', armFree: 'forward' },
        { hipY: 16, lean: 1, footF: [6, 0], footB: [-5, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    {
      name: 'attack_air', duration: 80, loop: false,
      poses: [
        { hipY: 20, lean: -3, footF: [4, 6], footB: [-5, 5], armWeapon: 'back', armFree: 'up' },
        { hipY: 21, lean: -2, footF: [2, 8], footB: [-7, 5], armWeapon: 'back', armFree: 'up' },
        { hipY: 19, lean: 1, footF: [7, 5], footB: [-4, 7], armWeapon: 'aim', armFree: 'up', slash: 'low' },
        { hipY: 18, lean: 3, footF: [8, 3], footB: [-3, 6], armWeapon: 'aim', armFree: 'up' },
      ],
    },
    {
      name: 'charge_loop', duration: 76, loop: true,
      poses: [
        { hipY: 16, lean: -2, armWeapon: 'aim', armFree: 'guard', charge: 0.10 },
        { hipY: 15, lean: -3, headY: -1, armWeapon: 'aim', armFree: 'guard', charge: 0.35 },
        { hipY: 15, lean: -4, headY: -1, armWeapon: 'aim', armFree: 'guard', charge: 0.72 },
        { hipY: 16, lean: -2, armWeapon: 'aim', armFree: 'guard', charge: 1.0 },
        { hipY: 15, lean: -1, armWeapon: 'aim', armFree: 'guard', charge: 0.55 },
      ],
    },
    {
      name: 'hurt', duration: 92, loop: false,
      poses: [
        { hipY: 17, lean: -7, headY: 2, footF: [1, 2], footB: [-9, 0], armWeapon: 'up', armFree: 'up', weapon: false },
        { hipY: 16, lean: -6, headY: 2, footF: [-2, 0], footB: [-8, 0], armWeapon: 'up', armFree: 'back', weapon: false },
        { hipY: 15, lean: -3, headY: 1, footF: [0, 0], footB: [-6, 0], armWeapon: 'guard', armFree: 'back', weapon: false },
        { hipY: 16, lean: 0, footF: [4, 0], footB: [-5, 0], armWeapon: 'guard', armFree: 'rest', weapon: false },
      ],
    },
  ];
}
