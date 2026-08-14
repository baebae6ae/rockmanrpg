/**
 * 떠오르는 데미지 숫자.
 *
 * 육성 RPG 에서 성장 체감의 절반은 "숫자가 커지는 것"에서 온다.
 * 레벨과 강화가 실제로 반영되는지 눈으로 확인되지 않으면 성장이 없는 것과 같다.
 */

import { Container, Text } from 'pixi.js';

export type PopKind = 'hit' | 'weak' | 'resist' | 'player' | 'gain';

const STYLE: Record<PopKind, { color: number; size: number; rise: number }> = {
  hit: { color: 0xffffff, size: 9, rise: 26 },
  weak: { color: 0xffd85c, size: 12, rise: 34 },
  resist: { color: 0x8fa8d8, size: 8, rise: 20 },
  player: { color: 0xff7b6b, size: 10, rise: 28 },
  gain: { color: 0x9fe8ff, size: 9, rise: 30 },
};

interface Pop {
  view: Text;
  life: number;
  total: number;
  rise: number;
  vx: number;
}

const pops: Pop[] = [];
let layer: Container | null = null;

/** 월드 좌표계 컨테이너를 넘긴다 (카메라를 따라가야 하므로) */
export function mountFloatingText(container: Container): void {
  layer = container;
}

export function popText(x: number, y: number, label: string, kind: PopKind = 'hit'): void {
  if (!layer) return;

  const style = STYLE[kind];
  const view = new Text({
    text: label,
    style: {
      fontFamily: 'monospace',
      fontSize: style.size,
      fill: style.color,
      stroke: { color: 0x0a0d1a, width: 3 },
    },
  });
  view.anchor.set(0.5, 1);
  view.position.set(Math.round(x), Math.round(y));
  layer.addChild(view);

  pops.push({
    view,
    life: 0.75,
    total: 0.75,
    rise: style.rise,
    vx: (Math.random() - 0.5) * 18,
  });
}

export function updateFloatingText(dt: number): void {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.life -= dt;
    if (p.life <= 0) {
      p.view.destroy();
      pops.splice(i, 1);
      continue;
    }
    const t = 1 - p.life / p.total;
    p.view.y -= p.rise * dt;
    p.view.x += p.vx * dt;
    p.view.alpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
  }
}

export function clearFloatingText(): void {
  for (const p of pops) p.view.destroy();
  pops.length = 0;
}
