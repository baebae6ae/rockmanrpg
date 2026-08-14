/**
 * 포탈 — 맵과 맵을 잇는다.
 *
 * 스테이지 선택 화면이 아니라 포탈로 이어붙인 하나의 세계로 만든다.
 * 사냥터는 한 번 깨고 버리는 관문이 아니라 계속 돌아오는 장소여야 한다.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { overlaps } from './room';

export interface PortalDef {
  id: string;
  x: number;
  y: number;
  to_map: string;
  to_portal: string;
  label?: string;
}

const W = 22;
const H = 34;

export class Portal {
  readonly view = new Container();
  private readonly glow: Graphics;
  private phase = 0;

  constructor(readonly def: PortalDef) {
    const frame = new Graphics();
    frame.rect(-W / 2, -H, W, H).fill({ color: 0x101a38, alpha: 0.85 });
    frame.rect(-W / 2, -H, W, H).stroke({ color: 0x7fe4ff, width: 1 });
    frame.rect(-W / 2 + 3, -H + 3, W - 6, 3).fill({ color: 0x7fe4ff, alpha: 0.5 });

    this.glow = new Graphics();
    this.glow.rect(-W / 2 + 2, -H + 2, W - 4, H - 4).fill({ color: 0x7fe4ff, alpha: 0.14 });

    const arrow = new Text({
      text: '▲',
      style: { fontFamily: 'monospace', fontSize: 9, fill: 0x9fe8ff },
    });
    arrow.anchor.set(0.5);
    arrow.position.set(0, -H / 2);

    this.view.addChild(frame, this.glow, arrow);

    if (def.label) {
      const label = new Text({
        text: def.label,
        style: { fontFamily: 'monospace', fontSize: 8, fill: 0x9fe8ff },
      });
      label.anchor.set(0.5, 1);
      label.position.set(0, -H - 3);
      this.view.addChild(label);
    }

    this.view.position.set(def.x, def.y);
  }

  update(dt: number): void {
    this.phase += dt * 2.4;
    this.glow.alpha = 0.6 + Math.sin(this.phase) * 0.4;
  }

  contains(px: number, py: number, pw: number, ph: number): boolean {
    return overlaps(px - pw / 2, py - ph, pw, ph, {
      x: this.def.x - W / 2,
      y: this.def.y - H,
      w: W,
      h: H,
    });
  }
}
