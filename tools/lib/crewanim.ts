/**
 * 《균열 회수반》 공용 전투 애니메이션.
 * 64px 도트에서 동작이 읽히도록 '준비 → 접촉 → 회복'의 실루엣을 우선한다.
 */
import type { Pose } from './crew.js';

export interface Tag {
  name: string;
  duration: number;
  loop: boolean;
  poses: Pose[];
}

function runCycle(): Pose[] {
  return [
    { hipY: 17, lean: 1, footF: [8, 0], footB: [-5, 2], armWeapon: 'down', armFree: 'back' },
    { hipY: 15, lean: 4, headY: -1, footF: [10, 2], footB: [-4, 0], armWeapon: 'down', armFree: 'back' },
    { hipY: 14, lean: 5, headY: -1, footF: [5, 5], footB: [-2, 3], armWeapon: 'down', armFree: 'forward' },
    { hipY: 16, lean: 3, footF: [2, 5], footB: [-7, 0], armWeapon: 'down', armFree: 'forward' },
    { hipY: 17, lean: 1, footF: [-2, 2], footB: [8, 0], armWeapon: 'down', armFree: 'forward' },
    { hipY: 15, lean: 4, headY: -1, footF: [-4, 0], footB: [10, 2], armWeapon: 'down', armFree: 'back' },
    { hipY: 14, lean: 5, headY: -1, footF: [-2, 3], footB: [5, 5], armWeapon: 'down', armFree: 'back' },
    { hipY: 16, lean: 3, footF: [-7, 0], footB: [2, 5], armWeapon: 'down', armFree: 'back' },
  ];
}

export function crewTags(): Tag[] {
  return [
    {
      name: 'idle', duration: 150, loop: true,
      poses: [
        { hipY: 16, lean: 2, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
        { hipY: 16, lean: 2, headY: -1, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'guard' },
        { hipY: 15, lean: 3, headY: -1, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'guard' },
        { hipY: 16, lean: 2, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    { name: 'run', duration: 52, loop: true, poses: runCycle() },
    {
      name: 'jump_rise', duration: 84, loop: false,
      poses: [
        { hipY: 17, lean: 0, footF: [6, 3], footB: [-5, 2], armWeapon: 'guard', armFree: 'up' },
        { hipY: 19, lean: 2, footF: [8, 7], footB: [-7, 4], armWeapon: 'guard', armFree: 'up' },
        { hipY: 21, lean: 3, headY: 1, footF: [9, 9], footB: [-8, 6], armWeapon: 'back', armFree: 'up' },
      ],
    },
    {
      name: 'jump_fall', duration: 78, loop: true,
      poses: [
        { hipY: 20, lean: -2, footF: [6, 6], footB: [-7, 8], armWeapon: 'down', armFree: 'up' },
        { hipY: 18, lean: -1, footF: [4, 3], footB: [-6, 6], armWeapon: 'down', armFree: 'guard' },
      ],
    },
    {
      name: 'jump_land', duration: 90, loop: false,
      poses: [
        { hipY: 11, lean: -2, headY: 1, footF: [7, 0], footB: [-7, 0], armWeapon: 'guard', armFree: 'guard' },
        { hipY: 13, lean: 0, footF: [6, 0], footB: [-6, 0], armWeapon: 'down', armFree: 'back' },
        { hipY: 16, lean: 2, footF: [6, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    {
      name: 'dash', duration: 72, loop: true,
      poses: [
        { hipY: 15, lean: 5, headY: -1, footF: [8, 2], footB: [-8, 1], armWeapon: 'down', armFree: 'back' },
        { hipY: 13, lean: 7, headY: -2, footF: [11, 0], footB: [-7, 2], armWeapon: 'down', armFree: 'back' },
        { hipY: 14, lean: 6, headY: -2, footF: [9, 1], footB: [-10, 0], armWeapon: 'back', armFree: 'back' },
      ],
    },
    {
      name: 'wall_slide', duration: 110, loop: true,
      poses: [
        { hipY: 18, lean: -3, footF: [-2, 4], footB: [3, 7], armWeapon: 'guard', armFree: 'up' },
        { hipY: 17, lean: -3, headY: -1, footF: [-3, 5], footB: [3, 6], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      name: 'wall_kick', duration: 78, loop: false,
      poses: [
        { hipY: 17, lean: 2, footF: [3, 5], footB: [-3, 2], armWeapon: 'guard', armFree: 'up' },
        { hipY: 19, lean: 5, footF: [9, 7], footB: [-7, 2], armWeapon: 'back', armFree: 'up' },
        { hipY: 20, lean: 7, footF: [11, 6], footB: [-8, 3], armWeapon: 'down', armFree: 'back' },
      ],
    },
    {
      name: 'attack_main', duration: 88, loop: false,
      poses: [
        { hipY: 17, lean: -4, footF: [4, 0], footB: [-6, 0], armWeapon: 'back', armFree: 'back' },
        { hipY: 15, lean: -6, headY: -1, footF: [3, 1], footB: [-7, 0], armWeapon: 'back', armFree: 'guard', charge: 0.18 },
        { hipY: 16, lean: 1, footF: [7, 0], footB: [-4, 0], armWeapon: 'aim', armFree: 'forward', slash: 'high', charge: 0.8 },
        { hipY: 16, lean: 3, footF: [8, 0], footB: [-3, 0], armWeapon: 'aim', armFree: 'forward' },
        { hipY: 16, lean: 1, footF: [6, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    {
      name: 'attack_air', duration: 82, loop: false,
      poses: [
        { hipY: 20, lean: -2, footF: [5, 6], footB: [-6, 4], armWeapon: 'guard', armFree: 'up' },
        { hipY: 19, lean: -5, footF: [3, 7], footB: [-8, 3], armWeapon: 'back', armFree: 'up', charge: 0.2 },
        { hipY: 18, lean: 3, footF: [8, 5], footB: [-5, 6], armWeapon: 'aim', armFree: 'up', slash: 'low' },
        { hipY: 18, lean: 1, footF: [6, 4], footB: [-4, 6], armWeapon: 'down', armFree: 'guard' },
      ],
    },
    {
      name: 'charge_loop', duration: 82, loop: true,
      poses: [
        { hipY: 16, lean: -2, armWeapon: 'aim', charge: 0.08 },
        { hipY: 15, lean: -3, headY: -1, armWeapon: 'aim', charge: 0.32 },
        { hipY: 14, lean: -4, headY: -1, armWeapon: 'aim', charge: 0.72 },
        { hipY: 15, lean: -2, armWeapon: 'aim', charge: 1 },
        { hipY: 16, lean: -1, armWeapon: 'aim', charge: 0.55 },
      ],
    },
    {
      name: 'hurt', duration: 104, loop: false,
      poses: [
        { hipY: 17, lean: -6, headY: 2, footF: [-1, 3], footB: [-8, 0], armWeapon: 'up', armFree: 'up', weapon: false },
        { hipY: 16, lean: -5, headY: 2, footF: [-3, 1], footB: [-7, 0], armWeapon: 'up', armFree: 'back', weapon: false },
        { hipY: 16, lean: -2, headY: 1, footF: [1, 0], footB: [-6, 0], armWeapon: 'guard', armFree: 'back', weapon: false },
        { hipY: 16, lean: 0, headY: 0, footF: [4, 0], footB: [-4, 0], armWeapon: 'guard', armFree: 'guard', weapon: false },
      ],
    },
  ];
}
