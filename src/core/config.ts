/** 렌더 규격 — docs/DESIGN.md §2 */
export const GAME_W = 320;
export const GAME_H = 240;

/**
 * 정수배 스케일이 원칙이지만, 모바일 세로 화면에서는 ×1 이 화면의 극히 일부만
 * 채워 실기 확인이 어렵다. ×2 이상이 들어가면 정수배로 고정하고, 그보다 좁으면
 * 화면에 맞춰 늘린다. 캔버스 백버퍼는 항상 320×240 이고 확대는 CSS 가 맡으므로
 * 도트 자체는 어느 경우에도 보간되지 않는다.
 */
export function computeScale(screenW: number, screenH: number): number {
  const fit = Math.min(screenW / GAME_W, screenH / GAME_H);
  return fit >= 2 ? Math.floor(fit) : fit;
}

/** 물리 — 단위는 게임 픽셀 / 초 */
export const PHYSICS = {
  gravity: 900,
  maxFall: 320,
  runSpeed: 92,
  airControl: 0.65,
  jumpVelocity: 255,
  /** 점프 버튼을 일찍 떼면 상승을 잘라 가변 점프 높이를 만든다 */
  jumpCutFactor: 0.42,
  coyoteTime: 0.08,
  jumpBuffer: 0.1,

  dashSpeed: 195,
  dashDuration: 0.34,
  dashCooldown: 0.08,

  wallSlideSpeed: 62,
  wallKickX: 165,
  wallKickY: 245,
  /** 벽차기 직후 입력이 잠기는 시간 */
  wallKickLock: 0.12,
} as const;
