/**
 * 가챠 연출 — 슬롯머신 릴.
 *
 * 이 화면의 목적은 "무기를 하나 준다"가 아니라 **뽑는 순간 자체를 사건으로
 * 만드는 것**이다. 그래서 결과를 바로 보여주지 않고 다음 순서로 끈다.
 *
 *   돈다 → 느려진다 → 등급 기운이 배경에 먼저 번진다 → 멈춘다 → 터진다
 *
 * 특히 감속 구간에서 등급색을 미리 흘리는 게 핵심이다. 멈추기 전에 "혹시
 * 금색인가?" 하는 구간이 있어야 멈추는 순간에 반응이 나온다. 그냥 결과만
 * 띄우면 아무리 화려해도 그건 알림창이지 가챠가 아니다.
 */

import { Container, Graphics, Text } from 'pixi.js';

export type Rarity = 'R' | 'SR' | 'SSR';

export const RARITY_COLOR: Record<Rarity, number> = {
  R: 0x6ec8ff,
  SR: 0xc98cff,
  SSR: 0xffd05c,
};

const RARITY_STARS: Record<Rarity, number> = { R: 1, SR: 2, SSR: 3 };
/** 등급이 높을수록 더 오래 끌고 더 크게 터뜨린다 */
const RARITY_HOLD: Record<Rarity, number> = { R: 0.55, SR: 0.85, SSR: 1.35 };

export interface ReelItem {
  name: string;
  color: number;
  rarity: Rarity;
}

const CELL = 42;
/** 결과에 닿기까지 몇 바퀴 돌릴지 */
const LOOPS = 7;

const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

export class GachaReel {
  readonly view = new Container();

  private readonly bg = new Graphics();
  private readonly reelG = new Graphics();
  private readonly reelBox = new Container();
  private readonly maskG = new Graphics();
  private readonly frontG = new Graphics();
  private readonly names: Text[] = [];
  private readonly title: Text;
  private readonly banner: Text;
  private readonly resultName: Text;
  private readonly hint: Text;

  private items: ReelItem[] = [];
  private resultIndex = 0;
  private duration = 2.6;
  private t = 0;
  private offset = 0;
  private lastCell = 0;
  private state: 'idle' | 'spin' | 'burst' | 'hold' = 'idle';
  private holdT = 0;

  /** 이번 프레임에 호출자가 반영해야 할 흔들림 세기 */
  shake = 0;
  /** 릴이 한 칸 넘어갈 때마다 true 한 번 — 딸깍 소리를 여기 맞춘다 */
  ticked = false;

  constructor(private readonly W: number, private readonly H: number) {
    this.view.addChild(this.bg);

    // 릴 내용은 창 모양으로 잘라낸다. 안 자르면 위아래 칸이 창 밖까지
    // 삐져나와서 슬롯이 아니라 그냥 목록으로 보인다.
    const cy = H / 2 - 20;
    const winH = CELL * 5;
    this.maskG.roundRect(20, cy - winH / 2, W - 40, winH, 6).fill({ color: 0xffffff });
    this.reelBox.addChild(this.reelG);

    // 릴에 올라가는 이름표는 미리 만들어 돌려쓴다 — 매 프레임 만들면
    // 텍스트 객체가 초당 수십 개씩 새로 생긴다.
    for (let i = 0; i < 9; i++) {
      const t = new Text({
        text: '',
        style: { fontFamily: 'monospace', fontSize: 11, fill: 0xffffff },
      });
      t.anchor.set(0.5);
      this.names.push(t);
      this.reelBox.addChild(t);
    }

    this.view.addChild(this.maskG, this.reelBox);
    this.reelBox.mask = this.maskG;

    this.view.addChild(this.frontG);

    this.title = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0x8a97c4 },
    });
    this.title.anchor.set(0.5);
    this.title.position.set(W / 2, H / 2 - 176);

    this.banner = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 26, fill: 0xffffff },
    });
    this.banner.anchor.set(0.5);

    this.resultName = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 14, fill: 0xffffff },
    });
    this.resultName.anchor.set(0.5);

    this.hint = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 8, fill: 0x8a97c4 },
    });
    this.hint.anchor.set(0.5);
    this.hint.position.set(W / 2, H - 40);

    this.view.addChild(this.title, this.banner, this.resultName, this.hint);
    this.view.visible = false;
  }

  get active(): boolean {
    return this.state !== 'idle';
  }

  /** 결과를 눌러서 넘길 수 있는 상태인지 */
  get canDismiss(): boolean {
    return this.state === 'hold' && this.holdT <= 0;
  }

  get result(): ReelItem | null {
    return this.items[this.resultIndex] ?? null;
  }

  start(items: ReelItem[], resultIndex: number, label: string): void {
    this.items = items;
    this.resultIndex = resultIndex;
    this.duration = 2.5 + Math.random() * 0.5;
    this.t = 0;
    this.offset = 0;
    this.lastCell = 0;
    this.state = 'spin';
    this.holdT = 0;
    this.view.visible = true;
    this.title.text = label;
    this.banner.text = '';
    this.resultName.text = '';
    this.hint.text = '눌러서 넘기기';
  }

  /** 돌아가는 중에 누르면 즉시 결과로 — 몇 번 보고 나면 다들 넘기고 싶어진다 */
  skip(): void {
    if (this.state === 'spin') this.t = this.duration;
  }

  dismiss(): void {
    this.state = 'idle';
    this.view.visible = false;
  }

  update(dt: number): void {
    this.ticked = false;
    this.shake = 0;
    if (this.state === 'idle') return;

    const n = this.items.length;
    const total = (LOOPS * n + this.resultIndex) * CELL;

    if (this.state === 'spin') {
      this.t = Math.min(this.duration, this.t + dt);
      this.offset = easeOutQuart(this.t / this.duration) * total;
      const cell = Math.floor(this.offset / CELL);
      if (cell !== this.lastCell) {
        this.lastCell = cell;
        this.ticked = true;
      }
      if (this.t >= this.duration) {
        this.state = 'burst';
        this.holdT = 0;
        const r = this.result?.rarity ?? 'R';
        this.shake = r === 'SSR' ? 14 : r === 'SR' ? 8 : 4;
      }
    } else if (this.state === 'burst') {
      this.offset = total;
      this.holdT += dt;
      if (this.holdT >= RARITY_HOLD[this.result?.rarity ?? 'R']) {
        this.state = 'hold';
        this.holdT = 0;
      }
    } else {
      this.holdT -= dt;
    }

    this.render(dt);
  }

  // ------------------------------------------------------------ 그리기

  private render(dt: number): void {
    const { W, H } = this;
    const cy = H / 2 - 20;
    const item = this.result;
    const rarity = item?.rarity ?? 'R';
    const rc = RARITY_COLOR[rarity];

    // 감속률로 "거의 멈췄음"을 재서 기운을 미리 흘린다.
    // 이 값이 올라가는 동안 배경이 등급색으로 물든다 — 멈추기 전에
    // 결과를 눈치채게 만드는 구간이고, 여기가 없으면 긴장이 안 생긴다.
    const near = this.state === 'spin' ? Math.pow(this.t / this.duration, 3) : 1;
    const revealed = this.state !== 'spin';

    this.bg.clear();
    this.bg.rect(0, 0, W, H).fill({ color: 0x04060e, alpha: 0.82 });
    // 등급 기운
    this.bg.rect(0, cy - 150, W, 300).fill({ color: rc, alpha: 0.05 + near * 0.12 });

    // SSR 은 뒤에서 빛살이 돈다
    if (rarity === 'SSR' && near > 0.45) {
      const a = (near - 0.45) * 0.5;
      this.rayT += dt * 2.2;
      for (let i = 0; i < 12; i++) {
        const ang = this.rayT + (i / 12) * Math.PI * 2;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        this.bg.moveTo(W / 2, cy)
          .lineTo(W / 2 + c * 260 - s * 26, cy + s * 260 + c * 26)
          .lineTo(W / 2 + c * 260 + s * 26, cy + s * 260 - c * 26)
          .closePath();
      }
      this.bg.fill({ color: 0xffd05c, alpha: a * 0.5 });
    }

    // 릴 창
    const winH = CELL * 5;
    this.bg.roundRect(20, cy - winH / 2, W - 40, winH, 6).fill({ color: 0x080c18 });

    // 릴 내용
    this.reelG.clear();
    const n = this.items.length;
    const base = this.offset / CELL;
    const centerIdx = Math.floor(base);
    const frac = base - centerIdx;
    let slot = 0;
    for (let i = -3; i <= 3; i++) {
      const idx = ((centerIdx + i) % n + n) % n;
      const it = this.items[idx];
      const y = cy + (i - frac) * CELL;
      const isCenter = i === 0 && revealed;
      const t = this.names[slot++];

      if (y < cy - winH / 2 - CELL || y > cy + winH / 2 + CELL) {
        t.visible = false;
        continue;
      }

      // 가운데에서 멀수록 어둡게 — 창 밖으로 자연스럽게 사라진다
      const fade = Math.max(0, 1 - Math.abs(y - cy) / (winH / 2 + 8));
      const cellA = revealed ? (isCenter ? 1 : 0.18) : 0.35 + fade * 0.5;

      this.reelG.roundRect(28, y - CELL / 2 + 3, W - 56, CELL - 6, 4)
        .fill({ color: it.color, alpha: cellA * 0.3 });
      this.reelG.roundRect(28, y - CELL / 2 + 3, W - 56, CELL - 6, 4)
        .stroke({ color: it.color, alpha: cellA * 0.9, width: isCenter ? 2 : 1 });

      t.visible = true;
      t.text = it.name;
      t.position.set(W / 2, Math.round(y));
      t.alpha = cellA;
      t.style.fill = isCenter ? 0xffffff : it.color;
    }
    for (; slot < this.names.length; slot++) this.names[slot].visible = false;

    // 창 위아래 그림자 + 당첨선
    this.frontG.clear();
    for (let i = 0; i < 5; i++) {
      const a = 0.5 - i * 0.1;
      this.frontG.rect(20, cy - winH / 2 + i * 3, W - 40, 3).fill({ color: 0x04060e, alpha: a });
      this.frontG.rect(20, cy + winH / 2 - 3 - i * 3, W - 40, 3).fill({ color: 0x04060e, alpha: a });
    }
    this.frontG.roundRect(20, cy - winH / 2, W - 40, winH, 6)
      .stroke({ color: revealed ? rc : 0x3a4a90, width: 2 });
    // 당첨선 표시
    this.frontG.rect(14, cy - CELL / 2, 8, CELL).fill({ color: rc, alpha: revealed ? 1 : 0.5 });
    this.frontG.rect(W - 22, cy - CELL / 2, 8, CELL).fill({ color: rc, alpha: revealed ? 1 : 0.5 });

    // 도는 동안 속도선
    if (this.state === 'spin') {
      const speed = 1 - this.t / this.duration;
      for (let i = 0; i < 7; i++) {
        const y = cy - winH / 2 + ((this.offset * 0.7 + i * 63) % winH);
        this.frontG.rect(30, y, W - 60, 1).fill({ color: 0xffffff, alpha: 0.06 + speed * 0.16 });
      }
    }

    // 멈춘 순간의 섬광
    if (this.state === 'burst') {
      const k = this.holdT / RARITY_HOLD[rarity];
      this.frontG.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: Math.max(0, 0.7 - k * 2.2) });
      // 퍼지는 고리
      const rr = 30 + k * 220;
      this.frontG.circle(W / 2, cy, rr).stroke({ color: rc, width: 3, alpha: Math.max(0, 1 - k) });
    }

    // 등급 배너 — 멈추는 순간 크게 들어왔다 제자리로
    if (revealed) {
      const k = this.state === 'burst' ? this.holdT / RARITY_HOLD[rarity] : 1;
      const pop = 1 + Math.max(0, 1 - k * 3) * 0.9;
      this.banner.text = '★'.repeat(RARITY_STARS[rarity]) + ' ' + rarity;
      this.banner.style.fill = rc;
      this.banner.scale.set(pop);
      this.banner.position.set(W / 2, cy - winH / 2 - 40);
      this.resultName.text = item?.name ?? '';
      this.resultName.style.fill = rc;
      this.resultName.position.set(W / 2, cy + winH / 2 + 26);
      this.hint.text = this.canDismiss ? '눌러서 계속' : '';
      this.title.text = '';
    } else {
      this.banner.text = '';
      this.resultName.text = '';
    }
  }

  private rayT = 0;
}
