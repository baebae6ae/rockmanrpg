/**
 * 상점 — 마을의 보급 담당에게서 물건을 산다.
 *
 * 재화(볼트)를 쓸 곳이 있어야 사냥에 목적이 생긴다. 목록은 NPC 데이터가
 * 정하므로 품목이 늘어나도 이 파일은 그대로다.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W } from '../core/config';
import type { ItemDef, Progress } from '../progression/progress';

const ROW_H = 19;
const LIST_TOP = 44;

export class Shop {
  readonly view = new Container();
  private readonly body = new Container();
  private rows: { y: number; item: ItemDef }[] = [];
  private stock: ItemDef[] = [];
  open = false;

  constructor(
    private readonly progress: Progress,
    private readonly items: Record<string, ItemDef>,
  ) {
    const dim = new Graphics();
    dim.rect(0, 0, GAME_W, GAME_H).fill({ color: 0x080b16 });
    const frame = new Graphics();
    frame.rect(6, 6, GAME_W - 12, GAME_H - 12).stroke({ color: 0xffd85c, width: 1 });
    this.view.addChild(dim, frame, this.body);
    this.view.visible = false;
  }

  openWith(ids: string[]): void {
    this.stock = ids.map((id) => this.items[id]).filter(Boolean);
    this.open = true;
    this.view.visible = true;
    this.render();
  }

  close(): void {
    this.open = false;
    this.view.visible = false;
  }

  private text(str: string, x: number, y: number, color = 0xcfe0ff, size = 9): void {
    const t = new Text({ text: str, style: { fontFamily: 'monospace', fontSize: size, fill: color } });
    t.position.set(x, y);
    this.body.addChild(t);
  }

  private render(): void {
    this.body.removeChildren();
    this.rows = [];

    this.text('보 급 소', 14, 11, 0xffffff, 11);
    this.text(`보유 ${this.progress.bolts} 볼트`, GAME_W - 110, 13, 0xffd85c);
    this.text('눌러서 구매 · 방어구는 즉시 장착된다', 14, 28, 0x8fa8d8, 8);

    let y = LIST_TOP;
    for (const item of this.stock) {
      const price = item.price ?? 0;
      const owned =
        item.kind === 'armor' ? item.slot && this.progress.equipped[item.slot] === item.id : false;
      const can = !owned && this.progress.bolts >= price;

      const row = new Graphics();
      row.rect(12, y - 2, GAME_W - 24, ROW_H - 2).fill({ color: can ? 0x2a2a18 : 0x141a30 });
      this.body.addChild(row);

      this.text(item.name, 16, y, can ? 0xffffff : 0x8fa8d8);
      this.text(item.description, 16, y + 8, 0x6f7fa8, 8);
      this.text(
        owned ? '보유중' : `${price}`,
        GAME_W - 60,
        y + 2,
        owned ? 0x6f7fa8 : can ? 0xffd85c : 0x6a5a30,
      );
      if (item.kind === 'consumable') {
        this.text(`x${this.progress.countOf(item.id)}`, GAME_W - 26, y + 2, 0x9fe8ff, 8);
      }

      this.rows.push({ y, item });
      y += ROW_H;
    }

    this.text('MENU / M / ESC → 닫기', 14, GAME_H - 16, 0x6f7fa8, 8);
  }

  /** 구매했으면 안내 문구를 돌려준다 */
  handleTap(gx: number, gy: number): string | null {
    if (!this.open || gx < 12 || gx > GAME_W - 12) return null;
    for (const row of this.rows) {
      if (gy < row.y - 2 || gy > row.y - 2 + ROW_H - 2) continue;
      const ok = this.progress.buy(row.item);
      this.render();
      return ok ? `${row.item.name} 구매` : null;
    }
    return null;
  }
}
