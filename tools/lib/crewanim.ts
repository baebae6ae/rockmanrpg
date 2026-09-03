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

/**
 * 달리기 — 자유팔이 다리와 반대로 흔들려야 뛰는 것으로 보인다.
 *
 * 1차 시도는 'back'/'forward' 를 그대로 썼는데, 그 둘은 공격처럼 한 번
 * 크게 뻗는 동작용이라 좌우 폭이 15px 나 됐다(어깨 폭은 16~18px 뿐이라
 * 팔이 몸통만큼 휘둘렸다).
 *
 * 2차 시도는 진폭을 runF/runB 로 좁히고 그 사이에 guard 를 중립으로
 * 끼웠는데, runF 를 실수로 guard 와 똑같은 값으로 적어서 뒤→중립→
 * 중립→중립이 구워졌다 — 8프레임 중 1프레임만 튀고 나머지 3프레임이
 * 완전히 같은 자세다. 52ms 짜리 빠른 루프에서 이건 '스치는' 게 아니라
 * 주기적으로 한 번씩 튀는 경련으로 보였다.
 *
 * 이번엔 runB/runN/runF 세 칸을 전부 다른 값으로, 높이(-5)는 맞춰서
 * 뒤→중립→앞→중립이 두 걸음마다 한 번씩 매끄럽게 돈다 — 다리가 한
 * 걸음 내딛을 때마다 반대팔이 한 번 스치는 실제 보행 리듬과 같다.
 */
function runCycle(): Pose[] {
  return [
    { hipY: 22, lean: 1, footF: [8, 0], footB: [-5, 2], armWeapon: 'down', armFree: 'runB' },
    { hipY: 20, lean: 3, headY: -1, footF: [10, 2], footB: [-4, 0], armWeapon: 'down', armFree: 'runN' },
    { hipY: 19, lean: 3, headY: -1, footF: [5, 5], footB: [-2, 3], armWeapon: 'down', armFree: 'runF' },
    { hipY: 21, lean: 2, footF: [2, 5], footB: [-7, 0], armWeapon: 'down', armFree: 'runN' },
    { hipY: 22, lean: 1, footF: [-2, 2], footB: [8, 0], armWeapon: 'down', armFree: 'runB' },
    { hipY: 20, lean: 3, headY: -1, footF: [-4, 0], footB: [10, 2], armWeapon: 'down', armFree: 'runN' },
    { hipY: 19, lean: 3, headY: -1, footF: [-2, 3], footB: [5, 5], armWeapon: 'down', armFree: 'runF' },
    { hipY: 21, lean: 2, footF: [-7, 0], footB: [2, 5], armWeapon: 'down', armFree: 'runN' },
  ];
}

export function crewTags(): Tag[] {
  return [
    /**
     * 대기 — 원래는 'rest'(-10)와 'guard'(-3)를 프레임마다 번갈아 썼는데,
     * 둘의 높이 차가 7칸(어깨~골반 낙차 10칸의 70%)이나 돼서 150ms 마다
     * 팔이 가슴 높이까지 튀어 올랐다 떨어지길 반복했다 — 캐릭터 선택
     * 화면에 항상 떠 있는 애니메이션이라 이 스냅이 제일 먼저, 제일 자주
     * 눈에 띈다. 참고한 X/제로는 서 있을 때 팔을 아예 안 움직인다.
     * 팔은 'rest' 로 고정하고, 골반 1칸·머리 살짝만 오르내려 숨쉬듯
     * 보이게 한다.
     */
    {
      name: 'idle', duration: 150, loop: true,
      poses: [
        { hipY: 21, lean: 2, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
        { hipY: 20, lean: 2, headY: -1, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
        { hipY: 20, lean: 3, headY: -1, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
        { hipY: 21, lean: 2, footF: [7, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    { name: 'run', duration: 52, loop: true, poses: runCycle() },
    {
      name: 'jump_rise', duration: 84, loop: false,
      poses: [
        { hipY: 22, lean: 0, footF: [6, 3], footB: [-5, 2], armWeapon: 'guard', armFree: 'up' },
        { hipY: 24, lean: 2, footF: [8, 7], footB: [-7, 4], armWeapon: 'guard', armFree: 'up' },
        { hipY: 26, lean: 3, headY: 1, footF: [9, 9], footB: [-8, 6], armWeapon: 'back', armFree: 'up' },
      ],
    },
    {
      name: 'jump_fall', duration: 78, loop: true,
      poses: [
        { hipY: 25, lean: -2, footF: [6, 6], footB: [-7, 8], armWeapon: 'down', armFree: 'up' },
        { hipY: 23, lean: -1, footF: [4, 3], footB: [-6, 6], armWeapon: 'down', armFree: 'guard' },
      ],
    },
    {
      name: 'jump_land', duration: 90, loop: false,
      poses: [
        { hipY: 16, lean: -2, headY: 1, footF: [7, 0], footB: [-7, 0], armWeapon: 'guard', armFree: 'guard' },
        { hipY: 18, lean: 0, footF: [6, 0], footB: [-6, 0], armWeapon: 'down', armFree: 'back' },
        { hipY: 21, lean: 2, footF: [6, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    {
      name: 'dash', duration: 72, loop: true,
      poses: [
        { hipY: 20, lean: 5, headY: -1, footF: [8, 2], footB: [-8, 1], armWeapon: 'down', armFree: 'back' },
        { hipY: 18, lean: 7, headY: -2, footF: [11, 0], footB: [-7, 2], armWeapon: 'down', armFree: 'back' },
        { hipY: 19, lean: 6, headY: -2, footF: [9, 1], footB: [-10, 0], armWeapon: 'back', armFree: 'back' },
      ],
    },
    {
      name: 'wall_slide', duration: 110, loop: true,
      poses: [
        { hipY: 23, lean: -3, footF: [-2, 4], footB: [3, 7], armWeapon: 'guard', armFree: 'up' },
        { hipY: 22, lean: -3, headY: -1, footF: [-3, 5], footB: [3, 6], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      name: 'wall_kick', duration: 78, loop: false,
      poses: [
        { hipY: 22, lean: 2, footF: [3, 5], footB: [-3, 2], armWeapon: 'guard', armFree: 'up' },
        { hipY: 24, lean: 5, footF: [9, 7], footB: [-7, 2], armWeapon: 'back', armFree: 'up' },
        { hipY: 25, lean: 7, footF: [11, 6], footB: [-8, 3], armWeapon: 'down', armFree: 'back' },
      ],
    },
    /**
     * idle 의 lean(+2)에서 첫 프레임이 곧장 lean -4 로 튀어서, 대기 상태에서
     * 공격이 시작되는 순간 자체가 이어지지 않고 끊겨 보였다. 첫 프레임을
     * 완만하게(-1) 낮추고 두 번째 프레임에서 깊은 백스윙(-6)에 도달하게
     * 해서 준비 동작이 한 단계를 더 거치며 이어지게 한다.
     *
     * 타격 프레임은 'aim' 대신 'strike' 를 쓴다 — 'aim' 은 원래 총을 겨누는
     * 자세(어깨 높이에서 살짝 앞으로)라 도끼 같은 근접무기를 휘두르는
     * 그림이 안 나왔다. 특히 무기가 뒷손인 도끼·거울은 이 폭으로는 몸을
     * 거의 못 가로질러서, 눈에 보이는 건 앞의 빈손이 뻗는 것뿐이고
     * 무기는 제자리에 머무는 것처럼 보였다("반대손으로 공격하는" 원인).
     * 무기 팔과 빈 팔을 둘 다 'strike' 로 같은 방향으로 보내 양손이
     * 함께 앞으로 크게 휘둘러지게 한다. 다음 프레임에서 'forward'(진폭이
     * 훨씬 작고 높이도 다름)로 바꿨더니 휘두른 팔이 순간적으로 다시
     * 위로 튀어 올랐다 — 타격 자세를 한 프레임 더 붙잡아 두는 게
     * 눈으로 궤적을 따라가기에도, 자연스러움에도 낫다.
     */
    {
      name: 'attack_main', duration: 88, loop: false,
      poses: [
        { hipY: 22, lean: -1, footF: [4, 0], footB: [-6, 0], armWeapon: 'back', armFree: 'back' },
        { hipY: 20, lean: -6, headY: -1, footF: [3, 1], footB: [-7, 0], armWeapon: 'back', armFree: 'guard', charge: 0.18 },
        { hipY: 21, lean: 1, footF: [7, 0], footB: [-4, 0], armWeapon: 'strike', armFree: 'strike', slash: 'high', charge: 0.8 },
        { hipY: 21, lean: 3, footF: [8, 0], footB: [-3, 0], armWeapon: 'strike', armFree: 'strike' },
        { hipY: 21, lean: 1, footF: [6, 0], footB: [-4, 0], armWeapon: 'down', armFree: 'rest' },
      ],
    },
    {
      name: 'attack_air', duration: 82, loop: false,
      poses: [
        { hipY: 25, lean: -2, footF: [5, 6], footB: [-6, 4], armWeapon: 'guard', armFree: 'up' },
        { hipY: 24, lean: -5, footF: [3, 7], footB: [-8, 3], armWeapon: 'back', armFree: 'up', charge: 0.2 },
        { hipY: 23, lean: 3, footF: [8, 5], footB: [-5, 6], armWeapon: 'strike', armFree: 'up', slash: 'low' },
        { hipY: 23, lean: 1, footF: [6, 4], footB: [-4, 6], armWeapon: 'down', armFree: 'guard' },
      ],
    },
    {
      name: 'charge_loop', duration: 82, loop: true,
      poses: [
        { hipY: 21, lean: -2, armWeapon: 'aim', charge: 0.08 },
        { hipY: 20, lean: -3, headY: -1, armWeapon: 'aim', charge: 0.32 },
        { hipY: 19, lean: -4, headY: -1, armWeapon: 'aim', charge: 0.72 },
        { hipY: 20, lean: -2, armWeapon: 'aim', charge: 1 },
        { hipY: 21, lean: -1, armWeapon: 'aim', charge: 0.55 },
      ],
    },
    {
      name: 'hurt', duration: 104, loop: false,
      poses: [
        { hipY: 22, lean: -6, headY: 2, footF: [-1, 3], footB: [-8, 0], armWeapon: 'up', armFree: 'up', weapon: false },
        { hipY: 21, lean: -5, headY: 2, footF: [-3, 1], footB: [-7, 0], armWeapon: 'up', armFree: 'back', weapon: false },
        { hipY: 21, lean: -2, headY: 1, footF: [1, 0], footB: [-6, 0], armWeapon: 'guard', armFree: 'back', weapon: false },
        { hipY: 21, lean: 0, headY: 0, footF: [4, 0], footB: [-4, 0], armWeapon: 'guard', armFree: 'guard', weapon: false },
      ],
    },
  ];
}
