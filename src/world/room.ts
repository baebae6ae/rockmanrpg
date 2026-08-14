/**
 * 임시 테스트 룸 — 맵 데이터 형식이 확정되기 전까지 이동 검증용으로 쓴다.
 * (맵 데이터 형식은 docs/DESIGN.md §11 미결 사항)
 */

import { Container, Graphics } from 'pixi.js';

export interface Solid {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Room {
  readonly width = 640;
  readonly height = 240;

  readonly solids: Solid[] = [
    // 바닥
    { x: 0, y: 208, w: 640, h: 32 },
    // 좌우 벽
    { x: -8, y: 0, w: 8, h: 240 },
    { x: 640, y: 0, w: 8, h: 240 },
    // 발판
    { x: 96, y: 168, w: 56, h: 8 },
    { x: 200, y: 136, w: 56, h: 8 },
    { x: 320, y: 176, w: 72, h: 8 },
    // 벽차기 검증용 기둥
    { x: 432, y: 96, w: 12, h: 112 },
    { x: 520, y: 64, w: 12, h: 144 },
    // 천장 선반
    { x: 556, y: 128, w: 84, h: 8 },
  ];

  /** 배경과 지형을 한 번만 그린다 (정적) */
  render(parent: Container): void {
    const bg = new Graphics();

    // 하늘 그라디언트 대용 — 밴딩으로 표현
    for (let i = 0; i < 12; i++) {
      const shade = 0x0d1024 + i * 0x000407;
      bg.rect(0, i * 20, this.width, 20).fill({ color: shade });
    }

    // 원경 실루엣
    for (let i = 0; i < 14; i++) {
      const x = i * 52 + ((i * 37) % 23);
      const h = 40 + ((i * 53) % 46);
      bg.rect(x, 208 - h, 34, h).fill({ color: 0x161c3a });
      bg.rect(x + 6, 208 - h - 6, 6, 6).fill({ color: 0x1d2650 });
    }

    const solid = new Graphics();
    for (const s of this.solids) {
      solid.rect(s.x, s.y, s.w, s.h).fill({ color: 0x2a3358 });
      solid.rect(s.x, s.y, s.w, 2).fill({ color: 0x4a5a96 });
      solid.rect(s.x, s.y + s.h - 1, s.w, 1).fill({ color: 0x151a30 });
    }

    parent.addChild(bg, solid);
  }
}

/** AABB 겹침 */
export function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  b: Solid,
): boolean {
  return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
}
