/** 아머 파츠 픽업 — 닿으면 해당 슬롯에 장착된다 (docs/DESIGN.md §8) */

import { Container, Graphics, Text } from 'pixi.js';
import type { ItemDef, Slot } from '../progression/progress';

const SLOT_MARK: Record<Slot, string> = { head: 'H', body: 'B', arm: 'A', foot: 'F' };

export class Pickup {
  readonly view = new Container();
  taken = false;
  private phase = Math.random() * Math.PI * 2;
  private readonly baseY: number;

  constructor(
    readonly item: ItemDef,
    readonly x: number,
    y: number,
  ) {
    this.baseY = y;

    const box = new Graphics();
    box.roundRect(-7, -14, 14, 14, 2).fill({ color: 0x1d2a52 });
    box.roundRect(-7, -14, 14, 14, 2).stroke({ color: 0x9fe8ff, width: 1 });
    box.rect(-5, -12, 10, 2).fill({ color: 0x9fe8ff, alpha: 0.65 });

    const mark = new Text({
      text: SLOT_MARK[item.slot],
      style: { fontFamily: 'monospace', fontSize: 9, fill: 0xe8f4ff },
    });
    mark.anchor.set(0.5);
    mark.position.set(0, -6);

    this.view.addChild(box, mark);
    this.view.position.set(x, y);
  }

  update(dt: number): void {
    if (this.taken) return;
    this.phase += dt * 3;
    this.view.y = this.baseY + Math.round(Math.sin(this.phase) * 2);
  }

  /** 플레이어 히트박스와 닿았는지 */
  touches(px: number, py: number, pw: number, ph: number): boolean {
    if (this.taken) return false;
    const left = this.x - 8;
    const top = this.view.y - 16;
    return left < px + pw / 2 && left + 16 > px - pw / 2 && top < py && top + 16 > py - ph;
  }

  take(): void {
    this.taken = true;
    this.view.visible = false;
  }
}
