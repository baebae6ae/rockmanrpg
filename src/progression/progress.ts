/**
 * 육성 상태 — 레벨·경험치·SP·무기 강화·장비 (docs/DESIGN.md §8)
 *
 * 스킬 습득은 보스 격파로, 강화는 SP 투자로 이루어진다 (§8.1).
 * 트리를 캐릭터별로 설계하지 않고 무기 목록에서 파생시키므로,
 * 무기가 수백 개로 늘어나도 이 파일은 그대로다.
 */

export type Slot = 'head' | 'body' | 'arm' | 'foot';

export interface SkillEffect {
  type: string;
  [key: string]: unknown;
}

export interface SkillDef {
  id: string;
  name: string;
  element: string;
  cost: number;
  cooldown: number;
  animation_tag: string;
  unlock: { source: string; boss_id?: string; character?: string };
  upgrade: { max_level: number; sp_cost: number[]; per_level: { power: number; cost: number } };
  effects: SkillEffect[];
  charged?: { radius_scale: number; power_scale: number; pierce?: boolean };
}

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  description: string;
  stats: { attack?: number; defense?: number };
  modifiers: Record<string, number>;
}

const SAVE_KEY = 'rockmanrpg.progress.v1';
const MAX_ENERGY = 28;

interface SaveData {
  level: number;
  exp: number;
  sp: number;
  owned: string[];
  levels: Record<string, number>;
  equipped: Record<string, string | null>;
}

export class Progress {
  level = 1;
  exp = 0;
  sp = 0;

  /** 획득한 무기 (기본 무기는 캐릭터가 항상 가진다) */
  readonly owned = new Set<string>();
  /** 무기별 강화 레벨. 1 이 기본 */
  private readonly levels = new Map<string, number>();
  private readonly energy = new Map<string, number>();

  equipped: Record<Slot, string | null> = { head: null, body: null, arm: null, foot: null };

  constructor(private readonly items: Record<string, ItemDef>) {
    this.load();
  }

  // ------------------------------------------------------------ 레벨

  get expToNext(): number {
    return Math.round(18 * Math.pow(this.level, 1.45));
  }

  /** 획득한 레벨 수를 돌려준다 */
  gainExp(amount: number): number {
    this.exp += amount;
    let gained = 0;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this.level++;
      this.sp += 1;
      gained++;
    }
    if (gained > 0) this.save();
    return gained;
  }

  // ------------------------------------------------------------ 무기

  skillLevel(id: string): number {
    return this.levels.get(id) ?? 1;
  }

  acquire(id: string): boolean {
    if (this.owned.has(id)) return false;
    this.owned.add(id);
    this.levels.set(id, 1);
    this.energy.set(id, MAX_ENERGY);
    this.save();
    return true;
  }

  /** 다음 강화에 필요한 SP. 최대 레벨이면 null */
  upgradeCost(skill: SkillDef): number | null {
    const level = this.skillLevel(skill.id);
    if (level >= skill.upgrade.max_level) return null;
    return skill.upgrade.sp_cost[level - 1] ?? skill.upgrade.sp_cost.at(-1) ?? 1;
  }

  upgrade(skill: SkillDef): boolean {
    const cost = this.upgradeCost(skill);
    if (cost === null || this.sp < cost) return false;
    this.sp -= cost;
    this.levels.set(skill.id, this.skillLevel(skill.id) + 1);
    this.save();
    return true;
  }

  /** 강화 레벨을 반영한 위력 배율 */
  powerScale(skill: SkillDef): number {
    return 1 + skill.upgrade.per_level.power * (this.skillLevel(skill.id) - 1);
  }

  /** 강화 레벨을 반영한 소모 에너지 */
  energyCost(skill: SkillDef): number {
    const scale = 1 + skill.upgrade.per_level.cost * (this.skillLevel(skill.id) - 1);
    return Math.max(0, Math.round(skill.cost * scale));
  }

  // ------------------------------------------------------------ 무기 에너지

  energyOf(id: string): number {
    return this.energy.get(id) ?? MAX_ENERGY;
  }

  get maxEnergy(): number {
    return MAX_ENERGY;
  }

  spendEnergy(id: string, amount: number): boolean {
    if (amount <= 0) return true;
    const left = this.energyOf(id);
    if (left < amount) return false;
    this.energy.set(id, left - amount);
    return true;
  }

  refillEnergy(amount: number): void {
    for (const id of this.owned) {
      this.energy.set(id, Math.min(MAX_ENERGY, this.energyOf(id) + amount));
    }
  }

  // ------------------------------------------------------------ 장비

  equip(item: ItemDef): void {
    this.equipped[item.slot] = item.id;
    this.save();
  }

  equippedItems(): ItemDef[] {
    return (Object.values(this.equipped).filter(Boolean) as string[])
      .map((id) => this.items[id])
      .filter(Boolean);
  }

  /** 장비의 수정치를 합산한다 (없으면 0) */
  modifier(name: string): number {
    let total = 0;
    for (const item of this.equippedItems()) total += item.modifiers[name] ?? 0;
    return total;
  }

  get bonusAttack(): number {
    return this.equippedItems().reduce((n, i) => n + (i.stats.attack ?? 0), 0);
  }

  get bonusDefense(): number {
    return this.equippedItems().reduce((n, i) => n + (i.stats.defense ?? 0), 0);
  }

  // ------------------------------------------------------------ 저장

  save(): void {
    try {
      const data: SaveData = {
        level: this.level,
        exp: this.exp,
        sp: this.sp,
        owned: [...this.owned],
        levels: Object.fromEntries(this.levels),
        equipped: { ...this.equipped },
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // 저장 실패는 진행을 막지 않는다 (사생활 보호 모드 등)
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as SaveData;
      this.level = data.level ?? 1;
      this.exp = data.exp ?? 0;
      this.sp = data.sp ?? 0;
      for (const id of data.owned ?? []) this.owned.add(id);
      for (const [id, lv] of Object.entries(data.levels ?? {})) this.levels.set(id, lv);
      for (const [slot, id] of Object.entries(data.equipped ?? {})) {
        this.equipped[slot as Slot] = id;
      }
      for (const id of this.owned) this.energy.set(id, MAX_ENERGY);
    } catch {
      // 손상된 저장 데이터는 무시하고 새로 시작한다
    }
  }

  reset(): void {
    this.level = 1;
    this.exp = 0;
    this.sp = 0;
    this.owned.clear();
    this.levels.clear();
    this.energy.clear();
    this.equipped = { head: null, body: null, arm: null, foot: null };
    this.save();
  }
}
