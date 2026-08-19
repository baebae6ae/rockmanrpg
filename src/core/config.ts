/**
 * 렌더 규격 — docs/DESIGN.md §2
 *
 * 가로를 넓게 잡는 이유: 세로(GAME_H)는 화면 높이에 맞춰 스케일을 정하는 축이라
 * 손대면 캐릭터 표시 크기 자체가 바뀐다. 반면 가로는 화면 비율이 GAME_W:GAME_H
 * 보다 넓은 기기(요즘 스마트폰 가로모드 대부분)에서 스케일에 전혀 관여하지
 * 않고 화면 좌우에 검은 여백으로 버려진다. 그 여백만큼 GAME_W를 넓히면 도트
 * 크기는 그대로인데 화면에 보이는 사냥터 폭만 넓어진다 — 록맨의 좁은 액션
 * 스테이지가 아니라 메이플식 사냥터로 읽히려면 이 폭이 핵심이다.
 */
export const GAME_W = 560;
export const GAME_H = 240;

/**
 * 정수배 스케일이 원칙이지만, 모바일 세로 화면에서는 ×1 이 화면의 극히 일부만
 * 채워 실기 확인이 어렵다. ×2 이상이 들어가면 정수배로 고정하고, 그보다 좁으면
 * 화면에 맞춰 늘린다. 캔버스 백버퍼는 항상 GAME_W×GAME_H 이고 확대는 CSS 가
 * 맡으므로 도트 자체는 어느 경우에도 보간되지 않는다.
 */
export function computeScale(screenW: number, screenH: number): number {
  const fit = Math.min(screenW / GAME_W, screenH / GAME_H);
  return fit >= 2 ? Math.floor(fit) : fit;
}

/**
 * 물리 — 단위는 게임 픽셀 / 초.
 *
 * 록맨 시리즈의 조작감은 "가속이 없다"는 데서 나온다. 방향키를 누르면 즉시
 * 최고 속도, 떼면 즉시 정지. 공중에서도 방향 전환이 즉시 된다. 가속 곡선을
 * 넣으면 미끄러지는 느낌이 되어 시리즈 특유의 정확한 조작감이 사라진다.
 */
export const PHYSICS = {
  gravity: 780,
  maxFall: 300,

  /** 즉시 도달하는 지상·공중 이동 속도 */
  runSpeed: 95,

  /** 약 57px 높이 — X 시리즈의 점프 높이에 맞춤 */
  jumpVelocity: 300,
  /**
   * 점프 버튼을 일찍 떼면 여기까지 상승을 자른다 (약 17px 높이).
   * 남은 속도에 비율을 곱하면 떼는 시점에 따라 최소 점프 높이가 들쭉날쭉해지므로
   * 하한을 고정한다.
   */
  jumpCutVelocity: 165,
  coyoteTime: 0.08,
  jumpBuffer: 0.12,

  dashSpeed: 200,
  dashDuration: 0.33,
  dashCooldown: 0.05,

  wallSlideSpeed: 68,
  /**
   * 벽차기 반동. 너무 크면 같은 벽으로 되돌아갈 수 없어 벽타기 등반이 불가능해진다.
   * 입력 잠금도 짧게 잡아야 즉시 벽으로 복귀할 수 있다.
   */
  wallKickX: 110,
  wallKickY: 300,
  wallKickLock: 0.09,
} as const;
