/**
 * 임시 테스트 룸 — 맵 데이터 형식이 확정되기 전까지 이동 검증용으로 쓴다.
 * (맵 데이터 형식은 docs/DESIGN.md §11 미결 사항)
 *
 * 배경은 시차(parallax) 3층으로 그린다. 층마다 컨테이너가 따로이며
 * 카메라가 각기 다른 비율로 밀어준다.
 */

import { Container, Graphics } from 'pixi.js';

export interface Solid {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 배경을 매번 같은 모양으로 그리기 위한 결정적 난수 */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export const PARALLAX = { far: 0.25, mid: 0.55 } as const;

export class Room {
  readonly width = 800;
  readonly height = 240;
  readonly groundY = 208;

  readonly solids: Solid[] = [
    // 바닥과 좌우·상단 경계
    { x: 0, y: 208, w: 800, h: 32 },
    { x: -8, y: -40, w: 8, h: 280 },
    { x: 800, y: -40, w: 8, h: 280 },
    // 천장이 없으면 벽타기로 화면 밖까지 올라가버린다
    { x: -8, y: -8, w: 816, h: 8 },

    // 발판 구간
    { x: 88, y: 168, w: 56, h: 8 },
    { x: 176, y: 132, w: 56, h: 8 },
    { x: 276, y: 170, w: 64, h: 8 },

    // 굴뚝 — 마주보는 두 벽 사이를 번갈아 차며 오른다.
    // 왼쪽 벽은 바닥까지 내리지 않는다. 그러지 않으면 안으로 들어갈 수가 없다.
    { x: 392, y: 56, w: 14, h: 110 },
    { x: 452, y: 56, w: 14, h: 152 },
    { x: 466, y: 56, w: 62, h: 8 },

    // 외벽 하나만으로 오르는 구간
    { x: 606, y: 40, w: 14, h: 168 },
    { x: 620, y: 40, w: 76, h: 8 },

    // 높은 발판
    { x: 716, y: 116, w: 64, h: 8 },
  ];

  /** 정적 배경·지형을 한 번만 그린다 */
  render(far: Container, mid: Container, terrain: Container): void {
    this.renderSky(far);
    this.renderFarCity(far);
    this.renderMidStructures(mid);
    this.renderTerrain(terrain);
  }

  private renderSky(layer: Container): void {
    const g = new Graphics();
    const bands = 30;
    // 위쪽 심야색에서 지평선의 푸른빛으로
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(0x0a + t * 0x14);
      const gg = Math.round(0x0d + t * 0x1d);
      const b = Math.round(0x1f + t * 0x36);
      g.rect(-40, (i * this.height) / bands, this.width + 80, this.height / bands + 1).fill({
        color: (r << 16) | (gg << 8) | b,
      });
    }

    // 별
    const rnd = makeRandom(0x5eed);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * (this.width + 80) - 40;
      const y = rnd() * 130;
      const bright = rnd();
      g.rect(x, y, 1, 1).fill({ color: bright > 0.85 ? 0xdfeaff : 0x8fa4d8, alpha: 0.3 + bright * 0.5 });
    }

    // 지평선 발광
    g.rect(-40, 150, this.width + 80, 58).fill({ color: 0x2b4a86, alpha: 0.18 });
    layer.addChild(g);
  }

  private renderFarCity(layer: Container): void {
    const g = new Graphics();
    const rnd = makeRandom(0xc17a);
    let x = -40;
    while (x < this.width + 40) {
      const w = 22 + Math.floor(rnd() * 26);
      const h = 46 + Math.floor(rnd() * 74);
      const top = this.groundY - h;
      g.rect(x, top, w, h).fill({ color: 0x0c1024 });
      // 옥상 구조물
      if (rnd() > 0.5) g.rect(x + 4, top - 5, 5, 5).fill({ color: 0x0c1024 });
      // 창문
      for (let wy = top + 6; wy < this.groundY - 6; wy += 7) {
        for (let wx = x + 3; wx < x + w - 4; wx += 6) {
          if (rnd() > 0.72) {
            g.rect(wx, wy, 2, 3).fill({ color: 0x2b4184, alpha: 0.3 + rnd() * 0.3 });
          }
        }
      }
      x += w + 4 + Math.floor(rnd() * 10);
    }
    layer.addChild(g);
  }

  private renderMidStructures(layer: Container): void {
    const g = new Graphics();
    const rnd = makeRandom(0xbead);
    let x = -60;
    while (x < this.width + 60) {
      const w = 40 + Math.floor(rnd() * 44);
      const h = 66 + Math.floor(rnd() * 78);
      const top = this.groundY - h;

      g.rect(x, top, w, h).fill({ color: 0x121831 });
      g.rect(x, top, w, 2).fill({ color: 0x1b2447 });
      g.rect(x + w - 2, top, 2, h).fill({ color: 0x0d1226 });

      // 수직 배관
      const px = x + 6 + Math.floor(rnd() * (w - 14));
      g.rect(px, top + 6, 3, h - 10).fill({ color: 0x0d1226 });

      // 네온 띠
      if (rnd() > 0.45) {
        const ny = top + 12 + Math.floor(rnd() * (h - 30));
        g.rect(x + 4, ny, w - 8, 2).fill({ color: 0x2f5ea6, alpha: 0.28 });
      }

      x += w + 16 + Math.floor(rnd() * 30);
    }
    layer.addChild(g);
  }

  private renderTerrain(layer: Container): void {
    const g = new Graphics();

    for (const s of this.solids) {
      if (s.w <= 0 || s.h <= 0) continue;

      // 본체
      g.rect(s.x, s.y, s.w, s.h).fill({ color: 0x333f6d });

      // 내부 패널 무늬
      for (let px = s.x + 4; px < s.x + s.w - 3; px += 10) {
        for (let py = s.y + 5; py < s.y + s.h - 2; py += 10) {
          g.rect(px, py, 2, 2).fill({ color: 0x273159 });
        }
      }

      // 상단 하이라이트 — 발을 딛는 면을 명확히
      g.rect(s.x, s.y, s.w, 2).fill({ color: 0x93a6e8 });
      g.rect(s.x, s.y + 2, s.w, 1).fill({ color: 0x55679f });

      // 좌우 모서리
      g.rect(s.x, s.y, 1, s.h).fill({ color: 0x55679f });
      g.rect(s.x + s.w - 1, s.y, 1, s.h).fill({ color: 0x1a2140 });

      // 하단 그림자
      if (s.h > 4) g.rect(s.x, s.y + s.h - 2, s.w, 2).fill({ color: 0x161c36 });
    }

    layer.addChild(g);
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
