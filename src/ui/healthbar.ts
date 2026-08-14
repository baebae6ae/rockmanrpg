/** 록맨 시리즈 특유의 세로 분절 체력 게이지 */

import { Container, Graphics, Text } from 'pixi.js';

const SEGMENT_H = 2;
const SEGMENT_GAP = 1;

export class HealthBar {
  readonly view = new Container();
  private readonly fill = new Graphics();
  private readonly segments: number;
  private last = -1;

  constructor(
    x: number,
    y: number,
    private readonly width: number,
    segments: number,
    private readonly color: number,
    label?: string,
  ) {
    this.segments = segments;

    const frame = new Graphics();
    const h = segments * (SEGMENT_H + SEGMENT_GAP) + 3;
    frame.rect(0, 0, width + 4, h).fill({ color: 0x0b0f20, alpha: 0.85 });
    frame.rect(0, 0, width + 4, h).stroke({ color: 0xdfe8ff, alpha: 0.7, width: 1 });
    this.view.addChild(frame, this.fill);

    if (label) {
      const t = new Text({
        text: label,
        style: { fontFamily: 'monospace', fontSize: 8, fill: 0xdfe8ff },
      });
      t.anchor.set(0, 0);
      t.position.set(0, h + 2);
      this.view.addChild(t);
    }

    this.view.position.set(x, y);
    this.set(1);
  }

  /** ratio: 0~1 */
  set(ratio: number): void {
    const lit = Math.ceil(Math.max(0, Math.min(1, ratio)) * this.segments);
    if (lit === this.last) return;
    this.last = lit;

    this.fill.clear();
    for (let i = 0; i < lit; i++) {
      // 아래에서부터 찬다
      const y = 2 + (this.segments - 1 - i) * (SEGMENT_H + SEGMENT_GAP);
      this.fill.rect(2, y, this.width, SEGMENT_H).fill({ color: this.color });
    }
  }

  set visible(v: boolean) {
    this.view.visible = v;
  }
}
