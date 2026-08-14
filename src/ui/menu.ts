/**
 * 상태·강화 메뉴 — 레벨, 능력치 분배, 무기 강화, 장비 (docs/DESIGN.md §8)
 *
 * 목록은 보유한 무기와 능력치 정의에서 그대로 파생되므로, 항목이 늘어나도
 * 이 파일은 그대로다.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { GAME_H, GAME_W } from '../core/config';
import { STAT_NAME, type ItemDef, type Progress, type SkillDef, type Slot, type StatKey } from '../progression/progress';

const SLOTS: Slot[] = ['head', 'body', 'arm', 'foot'];
const SLOT_NAME: Record<Slot, string> = { head: '헤드', body: '보디', arm: '암', foot: '풋' };
const STATS: StatKey[] = ['attack', 'defense', 'vitality'];

const ROW_H = 11;

interface Row {
  y: number;
  kind: 'stat' | 'weapon' | 'item';
  stat?: StatKey;
  skill?: SkillDef;
  item?: ItemDef;
}

export class Menu {
  /** 소모품 사용 요청 — 회복 대상(플레이어)을 아는 쪽에서 처리한다 */
  onUseItem?: (item: ItemDef) => void;
  readonly view = new Container();
  private readonly body = new Container();
  private rows: Row[] = [];
  private lastWeapons: SkillDef[] = [];
  open = false;

  constructor(
    private readonly progress: Progress,
    private readonly items: Record<string, ItemDef>,
  ) {
    const dim = new Graphics();
    dim.rect(0, 0, GAME_W, GAME_H).fill({ color: 0x080b16 });

    const frame = new Graphics();
    frame.rect(6, 6, GAME_W - 12, GAME_H - 12).stroke({ color: 0x5a6ea8, width: 1 });

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

  private text(str: string, x: number, y: number, color = 0xcfe0ff, size = 9): void {
    const t = new Text({ text: str, style: { fontFamily: 'monospace', fontSize: size, fill: color } });
    t.position.set(x, y);
    this.body.addChild(t);
  }

  private rowBox(y: number, active: boolean): void {
    const g = new Graphics();
    g.rect(12, y - 1, GAME_W - 24, ROW_H - 1).fill({ color: active ? 0x1e2c52 : 0x141a30 });
    this.body.addChild(g);
  }

  render(weapons: SkillDef[] = this.lastWeapons): void {
    this.lastWeapons = weapons;
    this.body.removeChildren();
    this.rows = [];

    const p = this.progress;

    this.text('상 태', 14, 11, 0xffffff, 11);
    this.text(`Lv ${p.level}`, 66, 13, 0x9fe8ff);
    this.text(`AP ${p.ap}`, 108, 13, p.ap > 0 ? 0x8ef0d8 : 0x6f7fa8);
    this.text(`SP ${p.sp}`, 150, 13, p.sp > 0 ? 0xffd85c : 0x6f7fa8);
    this.text(`${p.bolts} 볼트`, 14, 26, 0xffd85c, 8);

    const barX = 192;
    const barW = GAME_W - barX - 14;
    const g = new Graphics();
    g.rect(barX, 14, barW, 6).fill({ color: 0x1b2447 });
    g.rect(barX, 14, Math.round((barW * p.exp) / p.expToNext), 6).fill({ color: 0x7fe4ff });
    g.rect(barX, 14, barW, 6).stroke({ color: 0x5a6ea8, width: 1 });
    this.body.addChild(g);
    this.text(`EXP ${p.exp}/${p.expToNext}`, barX, 22, 0x8fa8d8, 8);

    // ---------------------------------------------------------- 능력치
    let y = 48;
    this.text('능력치 — 눌러서 AP 투자', 14, y - 12, 0x8fa8d8, 8);
    for (const stat of STATS) {
      const can = p.ap > 0;
      this.rowBox(y, can);
      this.text(STAT_NAME[stat], 16, y, can ? 0xffffff : 0xa8b6d8);
      this.text(`+${p.stats[stat]}`, 60, y, 0x9fe8ff);
      this.text(can ? 'AP 1' : '-', 260, y, can ? 0x8ef0d8 : 0x4a5680, 8);
      this.rows.push({ y, kind: 'stat', stat });
      y += ROW_H;
    }

    // ---------------------------------------------------------- 무기
    y += 12;
    this.text('무기 — 눌러서 강화', 14, y - 12, 0x8fa8d8, 8);
    for (const skill of weapons) {
      const level = p.skillLevel(skill.id);
      const cost = p.upgradeCost(skill);
      const can = cost !== null && p.sp >= cost;

      this.rowBox(y, can);
      this.text(skill.name, 16, y, can ? 0xffffff : 0xa8b6d8);
      this.text(`Lv${level}/${skill.upgrade.max_level}`, 150, y, 0x9fe8ff);
      this.text(cost === null ? 'MAX' : `SP ${cost}`, 206, y, cost === null ? 0x6f7fa8 : can ? 0xffd85c : 0x6f7fa8);
      this.text(skill.element, 256, y, 0x8fa8d8, 8);
      this.rows.push({ y, kind: 'weapon', skill });
      y += ROW_H;
    }

    // ---------------------------------------------------------- 소지품
    const owned = Object.values(this.items).filter(
      (i) => i.kind === 'consumable' && p.countOf(i.id) > 0,
    );
    y += 12;
    this.text('소지품 — 눌러서 사용', 14, y - 12, 0x8fa8d8, 8);
    if (owned.length === 0) {
      this.text('없음 — 마을 보급소에서 살 수 있다', 16, y, 0x4a5680, 8);
      y += 10;
    }
    for (const item of owned) {
      this.rowBox(y, true);
      this.text(item.name, 16, y, 0xffffff);
      this.text(`x${p.countOf(item.id)}`, 150, y, 0x9fe8ff);
      this.text(item.description, 190, y, 0x8fa8d8, 8);
      this.rows.push({ y, kind: 'item', item });
      y += ROW_H;
    }

    // ---------------------------------------------------------- 장비
    y += 12;
    this.text('장비', 14, y - 12, 0x8fa8d8, 8);
    for (const slot of SLOTS) {
      const id = p.equipped[slot];
      const item = id ? this.items[id] : null;
      this.text(SLOT_NAME[slot], 16, y, 0x8fa8d8, 8);
      this.text(item ? item.name : '—', 52, y, item ? 0xffffff : 0x4a5680, 8);
      if (item) this.text(item.description, 128, y, 0x8fa8d8, 8);
      y += 10;
    }

    this.text('MENU / M / ESC → 닫기', 14, GAME_H - 16, 0x6f7fa8, 8);
  }

  /** 게임 좌표 기준 탭 처리. 무언가 소비했으면 안내 문구를 돌려준다 */
  handleTap(gx: number, gy: number): string | null {
    if (!this.open || gx < 12 || gx > GAME_W - 12) return null;

    for (const row of this.rows) {
      if (gy < row.y - 1 || gy > row.y - 1 + ROW_H - 1) continue;

      if (row.kind === 'stat' && row.stat) {
        const ok = this.progress.allocate(row.stat);
        this.render();
        return ok ? `${STAT_NAME[row.stat]} 상승` : null;
      }
      if (row.kind === 'weapon' && row.skill) {
        const ok = this.progress.upgrade(row.skill);
        this.render();
        return ok ? `${row.skill.name} 강화` : null;
      }
      if (row.kind === 'item' && row.item) {
        // 실제 회복은 main 이 처리한다 — 여기서는 사용 요청만 알린다
        this.onUseItem?.(row.item);
        this.render();
        return null;
      }
    }
    return null;
  }
}
