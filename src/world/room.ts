/**
 * 맵 — 지형과 배경. 지형은 전부 맵 데이터에서 온다 (docs/DESIGN.md §11).
 *
 * 배경은 시차(parallax) 3층으로 그린다. 층마다 컨테이너가 따로이며
 * 카메라가 각기 다른 비율로 밀어준다.
 */

import { Container, Graphics } from 'pixi.js';
import type { PortalDef } from './portal';
import type { NpcDef } from './npc';

export interface Solid {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 데이터에만 있는 메모 — 런타임은 무시한다 */
  note?: string;
}

/**
 * 맵마다 다른 분위기를 주기 위한 배색. 하늘 두 색과, 건물·지형에 섞을
 * 색조 하나로 낮/밤/실내 같은 분위기를 표현한다 — 배경을 그리는 코드는
 * 맵마다 갈라지지 않고, 이 값만 바뀐다.
 */
export interface MapPalette {
  skyTop: number;
  skyHorizon: number;
  /** 별을 그릴지 (밤 분위기에서만 켠다) */
  stars?: boolean;
  glowColor: number;
  glowAlpha?: number;
  /** 건물·지형 색에 섞는 분위기색 */
  tint: number;
  /** 섞는 비율 0~1. 0이면 원래 색 그대로 */
  tintAmount?: number;
}

const DEFAULT_PALETTE: MapPalette = {
  skyTop: 0x0a0d1f,
  skyHorizon: 0x1e2a55,
  stars: true,
  glowColor: 0x2b4a86,
  glowAlpha: 0.18,
  tint: 0x2b4184,
  tintAmount: 0,
};

/** base 색을 tint 쪽으로 amount 만큼 섞는다 — 명암 구조는 그대로 두고 색조만 민다 */
function mix(base: number, tint: number, amount: number): number {
  if (amount <= 0) return base;
  const br = (base >> 16) & 255;
  const bg = (base >> 8) & 255;
  const bb = base & 255;
  const tr = (tint >> 16) & 255;
  const tg = (tint >> 8) & 255;
  const tb = tint & 255;
  const r = Math.round(br * (1 - amount) + tr * amount);
  const g = Math.round(bg * (1 - amount) + tg * amount);
  const b = Math.round(bb * (1 - amount) + tb * amount);
  return (r << 16) | (g << 8) | b;
}

export interface MapDef {
  id: string;
  name: string;
  /** 사냥터 권장 레벨. 마을은 0 */
  recommended_level?: number;
  /** 적이 나오지 않는 안전 지대인지 */
  safe?: boolean;
  width: number;
  height: number;
  ground_y: number;
  player_spawn: { x: number; y: number };
  solids: Solid[];
  spawns?: { enemy: string; x: number; y: number; params?: Record<string, unknown> }[];
  items?: { id: string; x: number; y: number }[];
  portals?: PortalDef[];
  npcs?: NpcDef[];
  palette?: MapPalette;
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
  readonly width: number;
  readonly height: number;
  readonly groundY: number;
  readonly solids: Solid[];
  readonly palette: MapPalette;

  constructor(readonly def: MapDef) {
    this.width = def.width;
    this.height = def.height;
    this.groundY = def.ground_y;
    this.solids = def.solids;
    this.palette = def.palette ?? DEFAULT_PALETTE;
  }

  /** 정적 배경·지형을 한 번만 그린다 */
  render(far: Container, mid: Container, terrain: Container): void {
    this.renderSky(far);
    this.renderFarCity(far);
    this.renderMidStructures(mid);
    this.renderTerrain(terrain);
  }

  private renderSky(layer: Container): void {
    const p = this.palette;
    const g = new Graphics();
    const bands = 30;
    const topR = (p.skyTop >> 16) & 255;
    const topG = (p.skyTop >> 8) & 255;
    const topB = p.skyTop & 255;
    const horR = (p.skyHorizon >> 16) & 255;
    const horG = (p.skyHorizon >> 8) & 255;
    const horB = p.skyHorizon & 255;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(topR + t * (horR - topR));
      const gg = Math.round(topG + t * (horG - topG));
      const b = Math.round(topB + t * (horB - topB));
      g.rect(-40, (i * this.height) / bands, this.width + 80, this.height / bands + 1).fill({
        color: (r << 16) | (gg << 8) | b,
      });
    }

    if (p.stars !== false) {
      const rnd = makeRandom(0x5eed);
      for (let i = 0; i < 130; i++) {
        const x = rnd() * (this.width + 80) - 40;
        const y = rnd() * 130;
        const bright = rnd();
        g.rect(x, y, 1, 1).fill({ color: bright > 0.85 ? 0xdfeaff : 0x8fa4d8, alpha: 0.3 + bright * 0.5 });
      }
    }

    g.rect(-40, 150, this.width + 80, 58).fill({ color: p.glowColor, alpha: p.glowAlpha ?? 0.18 });
    layer.addChild(g);
  }

  private renderFarCity(layer: Container): void {
    const p = this.palette;
    const amt = p.tintAmount ?? 0;
    const g = new Graphics();
    const rnd = makeRandom(0xc17a);
    let x = -40;
    while (x < this.width + 40) {
      const w = 22 + Math.floor(rnd() * 26);
      const h = 46 + Math.floor(rnd() * 74);
      const top = this.groundY - h;
      const body = mix(0x0c1024, p.tint, amt);
      g.rect(x, top, w, h).fill({ color: body });
      if (rnd() > 0.5) g.rect(x + 4, top - 5, 5, 5).fill({ color: body });
      for (let wy = top + 6; wy < this.groundY - 6; wy += 7) {
        for (let wx = x + 3; wx < x + w - 4; wx += 6) {
          if (rnd() > 0.72) {
            g.rect(wx, wy, 2, 3).fill({ color: mix(0x2b4184, p.tint, amt), alpha: 0.3 + rnd() * 0.3 });
          }
        }
      }
      x += w + 4 + Math.floor(rnd() * 10);
    }
    layer.addChild(g);
  }

  private renderMidStructures(layer: Container): void {
    const p = this.palette;
    const amt = p.tintAmount ?? 0;
    const g = new Graphics();
    const rnd = makeRandom(0xbead);
    let x = -60;
    while (x < this.width + 60) {
      const w = 40 + Math.floor(rnd() * 44);
      const h = 66 + Math.floor(rnd() * 78);
      const top = this.groundY - h;

      g.rect(x, top, w, h).fill({ color: mix(0x121831, p.tint, amt) });
      g.rect(x, top, w, 2).fill({ color: mix(0x1b2447, p.tint, amt) });
      g.rect(x + w - 2, top, 2, h).fill({ color: mix(0x0d1226, p.tint, amt) });

      const px = x + 6 + Math.floor(rnd() * (w - 14));
      g.rect(px, top + 6, 3, h - 10).fill({ color: mix(0x0d1226, p.tint, amt) });

      if (rnd() > 0.45) {
        const ny = top + 12 + Math.floor(rnd() * (h - 30));
        g.rect(x + 4, ny, w - 8, 2).fill({ color: mix(0x2f5ea6, p.tint, amt), alpha: 0.28 });
      }

      x += w + 16 + Math.floor(rnd() * 30);
    }
    layer.addChild(g);
  }

  private renderTerrain(layer: Container): void {
    const p = this.palette;
    const amt = p.tintAmount ?? 0;
    const g = new Graphics();

    for (const s of this.solids) {
      if (s.w <= 0 || s.h <= 0) continue;

      g.rect(s.x, s.y, s.w, s.h).fill({ color: mix(0x333f6d, p.tint, amt) });

      for (let px = s.x + 4; px < s.x + s.w - 3; px += 10) {
        for (let py = s.y + 5; py < s.y + s.h - 2; py += 10) {
          g.rect(px, py, 2, 2).fill({ color: mix(0x273159, p.tint, amt) });
        }
      }

      // 상단 하이라이트 — 발을 딛는 면을 명확히
      g.rect(s.x, s.y, s.w, 2).fill({ color: mix(0x93a6e8, p.tint, amt) });
      g.rect(s.x, s.y + 2, s.w, 1).fill({ color: mix(0x55679f, p.tint, amt) });

      g.rect(s.x, s.y, 1, s.h).fill({ color: mix(0x55679f, p.tint, amt) });
      g.rect(s.x + s.w - 1, s.y, 1, s.h).fill({ color: mix(0x1a2140, p.tint, amt) });

      if (s.h > 4) g.rect(s.x, s.y + s.h - 2, s.w, 2).fill({ color: mix(0x161c36, p.tint, amt) });
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
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
}
