/** 마을 NPC — 지금은 보급 담당(상점)만 있다 */

import { Container, Graphics, Text } from 'pixi.js';
import { overlaps } from './room';

export interface NpcDef {
  id: string;
  x: number;
  y: number;
  name: string;
  line?: string;
  /** 판매 품목 (아이템 id) */
  shop?: string[];
}

const W = 20;
const H = 30;

export class Npc {
  readonly view = new Container();
  private phase = Math.random() * Math.PI * 2;
  private readonly body = new Container();

  constructor(readonly def: NpcDef) {
    const g = new Graphics();
    // 작업복 차림의 정비사
    g.rect(-7, -H, 14, 18).fill({ color: 0x3f5a86 });
    g.rect(-7, -H, 14, 2).fill({ color: 0x7fa0d8 });
    g.rect(-5, -H + 18, 10, 12).fill({ color: 0x2a3a5e });
    g.rect(-6, -H - 9, 12, 9).fill({ color: 0xf6c9a0 });
    g.rect(-7, -H - 12, 14, 4).fill({ color: 0xffd85c });
    g.rect(-4, -H - 6, 2, 2).fill({ color: 0x2a1a10 });
    g.rect(2, -H - 6, 2, 2).fill({ color: 0x2a1a10 });
    this.body.addChild(g);

    const name = new Text({
      text: def.name,
      style: { fontFamily: 'monospace', fontSize: 8, fill: 0xffd85c },
    });
    name.anchor.set(0.5, 1);
    name.position.set(0, -H - 16);

    this.view.addChild(this.body, name);
    this.view.position.set(def.x, def.y);
  }

  update(dt: number): void {
    this.phase += dt * 2;
    this.body.y = Math.round(Math.sin(this.phase) * 1);
  }

  contains(px: number, py: number, pw: number, ph: number): boolean {
    return overlaps(px - pw / 2, py - ph, pw, ph, {
      x: this.def.x - W / 2,
      y: this.def.y - H - 12,
      w: W,
      h: H + 12,
    });
  }
}
