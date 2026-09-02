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
 */
function runCycle(): Pose[] {
  const out: Pose[] = [];
  for (let i = 0; i < 8; i++) {
    const p = (i / 8) * Math.PI * 2;
    const swing = Math.sin(p) * 6;
    const lift = Math.max(0, Math.cos(p)) * 4;
    const liftBack = Math.max(0, -Math.cos(p)) * 4;
    out.push({
      hipY: 16 - Math.abs(Math.sin(p * 2)),
      lean: 1,
      footF: [4 + swing, lift],
      footB: [-4 - swing, liftBack],
      armWeapon: 'down',
      armFree: swing > 0 ? 'forward' : 'back',
    });
  }
  return out;
}

export function crewTags(): Tag[] {
  return [
    {
      // 숨쉬기. 골반이 먼저 내려가고 머리가 한 프레임 늦게 따라온다.
      // 둘이 같이 움직이면 몸 전체가 위아래로 튀는 기계가 된다.
      //
      // headX 로 머리를 몸통과 다른 방향으로 틀어 봤는데, 목에서
      // 머리가 미끄러져 나온 것처럼 보였다 — "기괴하다"는 말을 들었다.
      // 얼굴 그림 자체는 항상 정면을 보게 그려져 있어서(눈 두 개가
      // 좌우 대칭) 머리 위치만 옮긴다고 고개를 돌린 것처럼 보이지도
      // 않는다 — 목만 어긋날 뿐이다. 얼굴을 돌리는 건 포기하고,
      // 머리와 몸통은 다시 같은 lean 으로 붙여서 통째로 기울인다.
      // 그 위에 몸무게가 실린 다리 자세와 당겨 쥔 팔로 '서 있는 방식'
      // 자체를 비대칭으로 만드는 쪽에 집중한다.
      name: 'idle', duration: 170, loop: true,
      poses: [
        { hipY: 16, lean: 3, footF: [7, 0], footB: [-3, 0], armFree: 'guard' },
        { hipY: 16, lean: 3, headY: -1, footF: [7, 0], footB: [-3, 0], armFree: 'guard' },
        { hipY: 15, lean: 4, headY: -1, footF: [7, 0], footB: [-3, 0], armFree: 'guard' },
        { hipY: 16, lean: 3, headY: -1, footF: [7, 0], footB: [-3, 0], armFree: 'guard' },
      ],
    },
    { name: 'run', duration: 60, loop: true, poses: runCycle() },
    {
      name: 'jump_rise', duration: 90, loop: false,
      poses: [
        { hipY: 18, lean: 1, footF: [5, 5], footB: [-4, 3], armWeapon: 'guard', armFree: 'up' },
        { hipY: 19, lean: 1, footF: [6, 6], footB: [-5, 4], armWeapon: 'guard', armFree: 'up' },
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
      // 착지 — 골반을 확 낮췄다가 되돌아온다. 이 두 장이 없으면
      // 점프가 바닥에 붙는 게 아니라 그냥 사라진다
      name: 'jump_land', duration: 70, loop: false,
      poses: [
        { hipY: 12, footF: [5, 0], footB: [-5, 0], armWeapon: 'guard', armFree: 'guard' },
        { hipY: 14, footF: [4, 0], footB: [-4, 0] },
      ],
    },
    {
      name: 'dash', duration: 80, loop: true,
      poses: [
        { hipY: 13, lean: 3, footF: [8, 1], footB: [-6, 0], armWeapon: 'down', armFree: 'back' },
        { hipY: 13, lean: 3, footF: [9, 0], footB: [-5, 1], armWeapon: 'down', armFree: 'back' },
      ],
    },
    {
      name: 'wall_slide', duration: 120, loop: true,
      poses: [
        { hipY: 17, lean: -2, footF: [-1, 3], footB: [2, 6], armWeapon: 'guard', armFree: 'up' },
        { hipY: 17, lean: -2, footF: [-2, 4], footB: [2, 5], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      name: 'wall_kick', duration: 80, loop: false,
      poses: [
        { hipY: 18, lean: 2, footF: [7, 6], footB: [-5, 2], armWeapon: 'guard', armFree: 'up' },
        { hipY: 19, lean: 1, footF: [5, 7], footB: [-4, 3], armWeapon: 'guard', armFree: 'up' },
      ],
    },
    {
      // 공격 — 예비동작 / 타격 / 되돌아옴. 가운데 한 장만 있으면
      // 때린 게 아니라 자세가 바뀐 것으로 보인다
      name: 'attack_main', duration: 70, loop: false,
      poses: [
        { hipY: 16, lean: -1, armWeapon: 'guard', armFree: 'back' },
        { hipY: 16, lean: -2, armWeapon: 'aim', armFree: 'back', slash: 'high' },
        { hipY: 16, lean: 0, armWeapon: 'aim' },
      ],
    },
    {
      name: 'attack_air', duration: 70, loop: false,
      poses: [
        { hipY: 18, lean: -1, footF: [4, 4], footB: [-4, 5], armWeapon: 'guard', armFree: 'up' },
        { hipY: 18, lean: -1, footF: [4, 4], footB: [-4, 5], armWeapon: 'aim', armFree: 'up', slash: 'low' },
      ],
    },
    {
      name: 'charge_loop', duration: 90, loop: true,
      poses: [
        { hipY: 16, armWeapon: 'aim', charge: 0.2 },
        { hipY: 15, armWeapon: 'aim', charge: 0.6 },
        { hipY: 16, armWeapon: 'aim', charge: 1.0 },
        { hipY: 15, armWeapon: 'aim', charge: 0.6 },
      ],
    },
    {
      // 피격 — 뒤로 밀리며 팔을 든다. 무기는 뺀다. 맞는 순간까지
      // 무기를 겨누고 있으면 아파 보이지 않는다
      name: 'hurt', duration: 90, loop: false,
      poses: [
        { hipY: 17, lean: -3, footF: [0, 2], footB: [-7, 1], armWeapon: 'up', armFree: 'up' },
        { hipY: 16, lean: -2, footF: [-1, 0], footB: [-6, 0], armWeapon: 'up', armFree: 'up' },
      ],
    },
  ];
}
