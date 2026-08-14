/**
 * 상태·강화 메뉴 — 레벨, SP, 무기 강화, 장비를 보여준다 (docs/DESIGN.md §8.1)
 *
 * 무기 목록은 보유한 무기에서 그대로 파생되므로, 무기가 늘어나도
 * 이 파일은 그대로다.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W } from '../core/config';
import type { ItemDef, Progress, SkillDef, Slot } from '../progression/progress';

const SLOTS: Slot[] = ['head', 'body', 'arm', 'foot'];
const SLOT_NAME: Record<Slot, string> = { head: '헤드', body: '보디', arm: '암', foot: '풋' };

const ROW_H = 13;
const LIST_TOP = 62;

interface Row {
  y: number;
  skill: SkillDef;
}

export class Menu {
  readonly view = new Container();
  private readonly body = new Container();
  private rows: Row[] = [];
  open = false;

  constructor(
    private readonly progress: Progress,
    private readonly items: Record<string, ItemDef>,
  ) {
    const dim = new Graphics();
    dim.rect(0, 0, GAME_W, GAME_H).fill({ color: 0x080b16 });

    const frame = new Graphics();
    frame.rect(10, 10, GAME_W - 20, GAME_H - 20).stroke({ color: 0x5a6ea8, width: 1 });

    this.view.addChild(dim, frame, this.body);
    this.view.visible = false;
  }

  toggle(): void {
    this.open = !this.open;
    this.view.visible = this.open;
    if (this.open) this.render();
  }

  close(): void {
    this.open = false;
    this.view.visible = false;
  }

  private text(str: string, x: number, y: number, color = 0xcfe0ff, size = 9): Text {
    const t = new Text({ text: str, style: { fontFamily: 'monospace', fontSize: size, fill: color } });
    t.position.set(x, y);
    this.body.addChild(t);
    return t;
  }

  render(weapons: SkillDef[] = this.lastWeapons): void {
    this.lastWeapons = weapons;
    this.body.removeChildren();
    this.rows = [];

    const p = this.progress;

    this.text('상 태', 18, 16, 0xffffff, 11);
    this.text(`Lv ${p.level}`, 18, 32, 0x9fe8ff);
    this.text(`SP ${p.sp}`, 70, 32, 0xffd85c);

    // 경험치 게이지
    const barX = 118;
    const barW = GAME_W - barX - 22;
    const g = new Graphics();
    g.rect(barX, 33, barW, 6).fill({ color: 0x1b2447 });
    g.rect(barX, 33, Math.round((barW * p.exp) / p.expToNext), 6).fill({ color: 0x7fe4ff });
    g.rect(barX, 33, barW, 6).stroke({ color: 0x5a6ea8, width: 1 });
    this.body.addChild(g);
    this.text(`EXP ${p.exp}/${p.expToNext}`, barX, 42, 0x8fa8d8, 8);

    this.text('무기 — 눌러서 강화', 18, LIST_TOP - 12, 0x8fa8d8, 8);

    let y = LIST_TOP;
    for (const skill of weapons) {
      const level = p.skillLevel(skill.id);
      const cost = p.upgradeCost(skill);
      const affordable = cost !== null && p.sp >= cost;

      const row = new Graphics();
      row.rect(16, y - 2, GAME_W - 32, ROW_H - 1).fill({
        color: affordable ? 0x1e2c52 : 0x141a30,
        alpha: 0.9,
      });
      this.body.addChild(row);

      this.text(skill.name, 20, y, affordable ? 0xffffff : 0xa8b6d8);
      this.text(`Lv ${level}/${skill.upgrade.max_level}`, 150, y, 0x9fe8ff);
      this.text(
        cost === null ? 'MAX' : `SP ${cost}`,
        212,
        y,
        cost === null ? 0x6f7fa8 : affordable ? 0xffd85c : 0x6f7fa8,
      );
      this.text(skill.element, 258, y, 0x8fa8d8, 8);

      this.rows.push({ y, skill });
      y += ROW_H;
    }

    // 장비
    y += 6;
    this.text('장비', 18, y, 0x8fa8d8, 8);
    y += 11;
    for (const slot of SLOTS) {
      const id = p.equipped[slot];
      const item = id ? this.items[id] : null;
      this.text(SLOT_NAME[slot], 20, y, 0x8fa8d8);
      this.text(item ? item.name : '—', 60, y, item ? 0xffffff : 0x4a5680);
      if (item) this.text(item.description, 140, y, 0x8fa8d8, 8);
      y += 11;
    }

    this.text('MENU / M / ESC → 닫기', 18, GAME_H - 24, 0x6f7fa8, 8);
  }

  private lastWeapons: SkillDef[] = [];

  /** 게임 좌표 기준 탭 처리. 강화가 일어나면 true */
  handleTap(gx: number, gy: number): boolean {
    if (!this.open) return false;
    for (const row of this.rows) {
      if (gx < 16 || gx > GAME_W - 16) continue;
      if (gy < row.y - 2 || gy > row.y - 2 + ROW_H - 1) continue;
      const ok = this.progress.upgrade(row.skill);
      this.render();
      return ok;
    }
    return false;
  }
}
