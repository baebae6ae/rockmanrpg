/**
 * 가챠 연출 — 슬롯머신 릴.
 *
 * 이 화면의 목적은 "무기를 하나 준다"가 아니라 **뽑는 순간 자체를 사건으로
 * 만드는 것**이다. 그래서 결과를 바로 보여주지 않고 네 단계로 끈다.
 *
 *   모인다 → 돈다 → 등급 기운이 먼저 번진다 → 터진다
 *
 * 감속 구간에서 등급색을 미리 흘리는 게 핵심이다. 멈추기 전에 "혹시
 * 금색인가?" 하는 구간이 있어야 멈추는 순간에 반응이 나온다. 그냥 결과만
 * 띄우면 아무리 화려해도 그건 알림창이지 가챠가 아니다.
 *
 * 그리고 화면이 한순간도 가만히 있으면 안 된다 — 기운이 빨려 들어오고,
 * 불티가 흐르고, 테두리가 뛰고, 터질 때 색종이가 쏟아진다. 정지된 프레임을
 * 잘라 봤을 때 어디를 잘라도 뭔가 움직이고 있어야 한다.
 */

import { Container, Graphics, Text } from 'pixi.js';

export type Rarity = 'R' | 'SR' | 'SSR';

export const RARITY_COLOR: Record<Rarity, number> = {
  R: 0x6ec8ff,
  SR: 0xc98cff,
  SSR: 0xffd05c,
};

/** 등급마다 곁들이는 보조색 — 단색이면 아무리 밝아도 납작해 보인다 */
const RARITY_SUB: Record<Rarity, number> = {
  R: 0xdcf4ff,
  SR: 0xf0d0ff,
  SSR: 0xfff6d0,
};

const RARITY_STARS: Record<Rarity, number> = { R: 1, SR: 2, SSR: 3 };
/** 등급이 높을수록 더 오래 끌고 더 크게 터뜨린다 */
const RARITY_HOLD: Record<Rarity, number> = { R: 0.7, SR: 1.05, SSR: 1.6 };
const RARITY_POWER: Record<Rarity, number> = { R: 1, SR: 1.6, SSR: 2.6 };

export interface ReelItem {
  name: string;
  color: number;
  rarity: Rarity;
}

const CELL = 42;
const VISIBLE = 5;
/** 결과에 닿기까지 몇 바퀴 돌릴지 */
const LOOPS = 7;
const CHARGE_TIME = 0.5;

const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);
const easeInQuad = (t: number): number => t * t;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  rot: number;
  spin: number;
  /** 색종이는 회전하는 사각형, 불티는 늘어나는 선 */
  kind: 'confetti' | 'spark' | 'streak';
  grav: number;
}

export class GachaReel {
  readonly view = new Container();

  private readonly bg = new Graphics();
  private readonly reelG = new Graphics();
  private readonly reelBox = new Container();
  private readonly maskG = new Graphics();
  private readonly frontG = new Graphics();
  private readonly fxG = new Graphics();
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
  private state: 'idle' | 'charge' | 'spin' | 'burst' | 'hold' = 'idle';
  private holdT = 0;
  private chargeT = 0;
  private clock = 0;
  private rayT = 0;
  private parts: Particle[] = [];

  /** 이번 프레임에 호출자가 반영해야 할 흔들림 세기 */
  shake = 0;
  /** 릴이 한 칸 넘어갈 때마다 true 한 번 — 딸깍 소리를 여기 맞춘다 */
  ticked = false;
  /** 0~1. 멈춤에 얼마나 가까운지 — 소리 음정을 여기 맞춘다 */
  near = 0;
  /** 이번 프레임에 터졌는지 (한 번만 true) */
  justBurst = false;

  private readonly cy: number;
  private readonly winH = CELL * VISIBLE;

  constructor(private readonly W: number, private readonly H: number) {
    this.cy = H / 2 - 20;
    this.view.addChild(this.bg);

    // 릴 내용은 창 모양으로 잘라낸다. 안 자르면 위아래 칸이 창 밖까지
    // 삐져나와서 슬롯이 아니라 그냥 목록으로 보인다.
    this.maskG
      .roundRect(20, this.cy - this.winH / 2, W - 40, this.winH, 6)
      .fill({ color: 0xffffff });
    this.reelBox.addChild(this.reelG);

    // 릴에 올라가는 이름표는 미리 만들어 돌려쓴다 — 매 프레임 만들면
    // 텍스트 객체가 초당 수십 개씩 새로 생긴다.
    for (let i = 0; i < 11; i++) {
      const t = new Text({
        text: '',
        style: { fontFamily: 'monospace', fontSize: 11, fill: 0xffffff },
      });
      t.anchor.set(0.5);
      this.names.push(t);
      this.reelBox.addChild(t);
    }

    this.view.addChild(this.maskG, this.reelBox, this.frontG, this.fxG);
    this.reelBox.mask = this.maskG;

    this.title = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0x8a97c4 },
    });
    this.title.anchor.set(0.5);
    this.title.position.set(W / 2, this.cy - this.winH / 2 - 30);

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
    this.state = 'charge';
    this.chargeT = 0;
    this.holdT = 0;
    this.near = 0;
    this.parts.length = 0;
    this.view.visible = true;
    this.title.text = label;
    this.banner.text = '';
    this.resultName.text = '';
    this.hint.text = '';
  }

  /** 돌아가는 중에 누르면 즉시 결과로 — 몇 번 보고 나면 다들 넘기고 싶어진다 */
  skip(): void {
    if (this.state === 'charge') this.chargeT = CHARGE_TIME;
    else if (this.state === 'spin') this.t = this.duration;
  }

  dismiss(): void {
    this.state = 'idle';
    this.view.visible = false;
    this.parts.length = 0;
  }

  update(dt: number): void {
    this.ticked = false;
    this.justBurst = false;
    this.shake = 0;
    if (this.state === 'idle') return;

    this.clock += dt;
    const n = this.items.length;
    const total = (LOOPS * n + this.resultIndex) * CELL;
    const rarity = this.result?.rarity ?? 'R';

    if (this.state === 'charge') {
      // 기운이 빨려 들어오는 구간. 바로 돌리면 "시작됐다"는 순간이 없다.
      this.chargeT += dt;
      this.near = 0;
      if (Math.random() < 0.6) this.spawnChargeSpark();
      if (this.chargeT >= CHARGE_TIME) {
        this.state = 'spin';
        this.shake = 3;
      }
    } else if (this.state === 'spin') {
      this.t = Math.min(this.duration, this.t + dt);
      this.offset = easeOutQuart(this.t / this.duration) * total;
      this.near = Math.pow(this.t / this.duration, 3);
      const cell = Math.floor(this.offset / CELL);
      if (cell !== this.lastCell) {
        this.lastCell = cell;
        this.ticked = true;
      }
      // 도는 동안 창 옆으로 불티가 흐른다
      if (Math.random() < 0.9) this.spawnStreak();
      if (this.t >= this.duration) {
        this.state = 'burst';
        this.holdT = 0;
        this.justBurst = true;
        this.shake = 6 * RARITY_POWER[rarity];
        this.explode(rarity);
      }
    } else if (this.state === 'burst') {
      this.offset = total;
      this.near = 1;
      this.holdT += dt;
      if (this.holdT >= RARITY_HOLD[rarity]) {
        this.state = 'hold';
        this.holdT = 0;
      }
    } else {
      this.near = 1;
      this.holdT -= dt;
      // 결과가 떠 있는 동안에도 반짝임이 계속 올라온다
      if (Math.random() < (rarity === 'SSR' ? 0.5 : 0.2)) this.spawnIdleSparkle(rarity);
    }

    this.stepParticles(dt);
    this.render(dt);
  }

  // ------------------------------------------------------------ 입자

  private spawnChargeSpark(): void {
    // 화면 가장자리에서 창 중심으로 빨려 들어온다
    const a = Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 120;
    const x = this.W / 2 + Math.cos(a) * dist;
    const y = this.cy + Math.sin(a) * dist;
    const sp = 260 + Math.random() * 200;
    this.parts.push({
      x, y,
      vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp,
      life: dist / sp, max: dist / sp,
      size: 2 + Math.random() * 2,
      color: Math.random() > 0.5 ? 0x9fe8ff : 0xffffff,
      rot: a, spin: 0, kind: 'spark', grav: 0,
    });
  }

  private spawnStreak(): void {
    const side = Math.random() > 0.5;
    this.parts.push({
      x: side ? 14 + Math.random() * 12 : this.W - 26 + Math.random() * 12,
      y: this.cy + (Math.random() - 0.5) * this.winH,
      vx: 0, vy: -(300 + Math.random() * 420),
      life: 0.45, max: 0.45,
      size: 1 + Math.random() * 2,
      color: 0x9fe8ff, rot: 0, spin: 0, kind: 'streak', grav: 0,
    });
  }

  private spawnIdleSparkle(rarity: Rarity): void {
    this.parts.push({
      x: 30 + Math.random() * (this.W - 60),
      y: this.cy + this.winH / 2 - Math.random() * 20,
      vx: (Math.random() - 0.5) * 24, vy: -(20 + Math.random() * 40),
      life: 0.9, max: 0.9,
      size: 1 + Math.random() * 2,
      color: Math.random() > 0.4 ? RARITY_COLOR[rarity] : RARITY_SUB[rarity],
      rot: 0, spin: 0, kind: 'spark', grav: -14,
    });
  }

  /** 멈추는 순간 — 색종이와 불티가 한꺼번에 쏟아진다 */
  private explode(rarity: Rarity): void {
    const power = RARITY_POWER[rarity];
    const rc = RARITY_COLOR[rarity];
    const sub = RARITY_SUB[rarity];
    const confetti = Math.round(26 * power);
    for (let i = 0; i < confetti; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 300 * power;
      this.parts.push({
        x: this.W / 2, y: this.cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 1 + Math.random() * 0.8, max: 1.8,
        size: 3 + Math.random() * 4,
        color: [rc, sub, 0xffffff, rc][i % 4],
        rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 16,
        kind: 'confetti', grav: 340,
      });
    }
    const sparks = Math.round(22 * power);
    for (let i = 0; i < sparks; i++) {
      const a = (i / sparks) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 260 + Math.random() * 340 * power;
      this.parts.push({
        x: this.W / 2, y: this.cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.45 + Math.random() * 0.35, max: 0.8,
        size: 2 + Math.random() * 2,
        color: i % 3 === 0 ? 0xffffff : rc,
        rot: a, spin: 0, kind: 'spark', grav: 0,
      });
    }
  }

  private stepParticles(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.rot += p.spin * dt;
      if (p.kind === 'confetti') {
        p.vx *= 0.99;
      }
    }
  }

  // ------------------------------------------------------------ 그리기

  private render(dt: number): void {
    const { W, H, cy, winH } = this;
    const item = this.result;
    const rarity = item?.rarity ?? 'R';
    const rc = RARITY_COLOR[rarity];
    const sub = RARITY_SUB[rarity];
    const revealed = this.state === 'burst' || this.state === 'hold';
    const near = this.near;
    const power = RARITY_POWER[rarity];

    this.bg.clear();
    this.fxG.clear();
    this.frontG.clear();

    // --- 바탕
    this.bg.rect(0, 0, W, H).fill({ color: 0x04060e, alpha: 0.86 });

    // 등급 기운 — 감속할수록 진해진다. 여기가 "혹시?" 구간이다.
    const auraA = Math.min(0.3, 0.05 + near * 0.15 * power);
    this.bg.rect(0, cy - 190, W, 380).fill({ color: rc, alpha: auraA * 0.5 });
    // 중심으로 갈수록 밝아지도록 띠를 겹친다 (그라디언트 대용)
    for (let i = 0; i < 4; i++) {
      const h = 190 - i * 42;
      this.bg.rect(0, cy - h, W, h * 2).fill({ color: rc, alpha: auraA * 0.1 });
    }

    // 회전하는 빛살 — 등급이 높을수록 일찍, 세게 돈다
    const rayA = (near - (rarity === 'SSR' ? 0.25 : 0.55)) * power * 0.55;
    if (rayA > 0) {
      this.rayT += dt * (1.4 + near * 3.2);
      const rays = rarity === 'SSR' ? 14 : 10;
      for (let i = 0; i < rays; i++) {
        const ang = this.rayT + (i / rays) * Math.PI * 2;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const wRay = 12 + near * 22;
        this.bg.moveTo(W / 2, cy)
          .lineTo(W / 2 + c * 320 - s * wRay, cy + s * 320 + c * wRay)
          .lineTo(W / 2 + c * 320 + s * wRay, cy + s * 320 - c * wRay)
          .closePath();
      }
      this.bg.fill({ color: sub, alpha: Math.min(0.34, rayA) });
    }

    // 밖으로 퍼지는 맥박 고리 — 도는 내내 계속 나간다
    if (this.state !== 'charge') {
      for (let i = 0; i < 3; i++) {
        const k = ((this.clock * (0.7 + near) + i / 3) % 1);
        this.bg.circle(W / 2, cy, 40 + k * 240)
          .stroke({ color: rc, width: 2, alpha: (1 - k) * 0.3 * (0.4 + near) });
      }
    }

    // --- 기운이 모이는 구간
    if (this.state === 'charge') {
      const k = easeInQuad(this.chargeT / CHARGE_TIME);
      this.bg.circle(W / 2, cy, 260 * (1 - k) + 30)
        .stroke({ color: 0x9fe8ff, width: 3, alpha: 0.7 });
      this.bg.circle(W / 2, cy, 190 * (1 - k) + 20)
        .stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
    }

    // --- 릴 창
    this.bg.roundRect(20, cy - winH / 2, W - 40, winH, 6).fill({ color: 0x05070f });
    this.bg.roundRect(20, cy - winH / 2, W - 40, winH, 6).fill({ color: 0x05070f, alpha: 0.9 });

    // --- 릴 내용
    this.reelG.clear();
    const n = this.items.length;
    const base = this.offset / CELL;
    const centerIdx = Math.floor(base);
    const frac = base - centerIdx;
    // 도는 속도 — 잔상 길이를 여기 맞춘다
    const speed = this.state === 'spin' ? 1 - this.t / this.duration : 0;
    let slot = 0;
    for (let i = -3; i <= 3; i++) {
      const idx = ((centerIdx + i) % n + n) % n;
      const it = this.items[idx];
      const y = cy + (i - frac) * CELL;
      const isCenter = i === 0 && revealed;
      const t = this.names[slot++];

      const fade = Math.max(0, 1 - Math.abs(y - cy) / (winH / 2 + 10));
      const cellA = revealed ? (isCenter ? 1 : 0.14) : 0.3 + fade * 0.6;

      const x0 = 28;
      const cw = W - 56;
      const ch = CELL - 6;
      const y0 = y - CELL / 2 + 3;

      // 칸 몸통 + 위쪽 하이라이트 — 납작한 사각형이 아니라 판때기로 보이게
      this.reelG.roundRect(x0, y0, cw, ch, 4).fill({ color: it.color, alpha: cellA * 0.26 });
      this.reelG.roundRect(x0, y0, cw, 3, 2).fill({ color: it.color, alpha: cellA * 0.5 });
      this.reelG.roundRect(x0, y0, cw, ch, 4)
        .stroke({ color: it.color, alpha: cellA * 0.95, width: isCenter ? 2 : 1 });

      // 등급 표시 — 왼쪽에 별 개수만큼 점
      for (let sIdx = 0; sIdx < RARITY_STARS[it.rarity]; sIdx++) {
        this.reelG.rect(x0 + 7 + sIdx * 5, y + 6, 3, 3)
          .fill({ color: RARITY_COLOR[it.rarity], alpha: cellA });
      }

      // 도는 동안 칸에 잔상 줄무늬
      if (speed > 0.02) {
        for (let b = 0; b < 3; b++) {
          this.reelG.rect(x0, y0 + 4 + b * 9, cw, 1)
            .fill({ color: 0xffffff, alpha: speed * 0.18 });
        }
      }

      // 당첨 칸은 빛이 훑고 지나간다
      if (isCenter) {
        const sweep = ((this.clock * 1.6) % 1) * (cw + 40) - 20;
        this.reelG.rect(x0 + sweep, y0, 14, ch).fill({ color: 0xffffff, alpha: 0.16 });
      }

      t.visible = true;
      t.text = it.name;
      t.position.set(W / 2, Math.round(y));
      t.alpha = cellA;
      t.style.fill = isCenter ? 0xffffff : it.color;
      t.scale.set(isCenter ? 1.1 : 1);
    }
    for (; slot < this.names.length; slot++) this.names[slot].visible = false;

    // --- 창 앞 장식
    // 위아래 어둠 — 칸이 자연스럽게 사라지게
    for (let i = 0; i < 6; i++) {
      const a = 0.55 - i * 0.09;
      this.frontG.rect(20, cy - winH / 2 + i * 3, W - 40, 3).fill({ color: 0x04060e, alpha: a });
      this.frontG.rect(20, cy + winH / 2 - 3 - i * 3, W - 40, 3).fill({ color: 0x04060e, alpha: a });
    }

    // 테두리 — 멈춤이 가까울수록 뛴다
    const beat = 1 + Math.sin(this.clock * (6 + near * 26)) * 0.5;
    this.frontG.roundRect(20, cy - winH / 2, W - 40, winH, 6)
      .stroke({ color: revealed ? rc : 0x3a4a90, width: 2 + (revealed ? beat : near * beat) });
    if (near > 0.2) {
      this.frontG.roundRect(16, cy - winH / 2 - 4, W - 32, winH + 8, 8)
        .stroke({ color: rc, width: 1, alpha: near * 0.6 * beat });
    }

    // 당첨선 표지 — 화살표 모양으로
    const markA = revealed ? 1 : 0.4 + near * 0.5;
    for (const dir of [1, -1]) {
      const bx = dir > 0 ? 14 : W - 14;
      this.frontG.moveTo(bx, cy - 9)
        .lineTo(bx + dir * 12, cy)
        .lineTo(bx, cy + 9)
        .closePath()
        .fill({ color: rc, alpha: markA });
    }

    // --- 입자
    for (const p of this.parts) {
      const a = Math.min(1, p.life / (p.max * 0.6));
      if (p.kind === 'confetti') {
        const c = Math.cos(p.rot) * p.size;
        const s = Math.sin(p.rot) * p.size;
        this.fxG.moveTo(p.x + c, p.y + s)
          .lineTo(p.x - s, p.y + c)
          .lineTo(p.x - c, p.y - s)
          .lineTo(p.x + s, p.y - c)
          .closePath()
          .fill({ color: p.color, alpha: a });
      } else if (p.kind === 'streak') {
        this.fxG.rect(p.x, p.y, p.size, 14).fill({ color: p.color, alpha: a * 0.7 });
      } else {
        this.fxG.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: a });
      }
    }

    // --- 터지는 순간
    if (this.state === 'burst') {
      const k = this.holdT / RARITY_HOLD[rarity];
      // 섬광
      this.fxG.rect(0, 0, W, H)
        .fill({ color: 0xffffff, alpha: Math.max(0, 0.85 - k * 2.4) });
      // 겹쳐 퍼지는 고리 — 하나면 심심하다
      for (let i = 0; i < 4; i++) {
        const kk = Math.max(0, k - i * 0.08) * 1.6;
        if (kk <= 0 || kk >= 1) continue;
        this.fxG.circle(W / 2, cy, 20 + kk * 260 * power)
          .stroke({ color: i % 2 ? sub : rc, width: 4 * (1 - kk), alpha: 1 - kk });
      }
      // 사방으로 뻗는 빛기둥
      const beamA = Math.max(0, 1 - k * 2);
      if (beamA > 0) {
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + this.rayT * 0.3;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const len = 120 + k * 360;
          this.fxG.moveTo(W / 2 + c * 20 - s * 8, cy + s * 20 + c * 8)
            .lineTo(W / 2 + c * len, cy + s * len)
            .lineTo(W / 2 + c * 20 + s * 8, cy + s * 20 - c * 8)
            .closePath();
        }
        this.fxG.fill({ color: sub, alpha: beamA * 0.4 });
      }
    }

    // --- 글자
    if (revealed) {
      const k = this.state === 'burst' ? this.holdT / RARITY_HOLD[rarity] : 1;
      // 크게 들어왔다 제자리로 (살짝 넘겼다 돌아오게)
      const over = Math.max(0, 1 - k * 3.2);
      const pop = 1 + over * 1.1 - Math.max(0, Math.sin(k * 12) * over * 0.15);
      this.banner.text = '★'.repeat(RARITY_STARS[rarity]) + ' ' + rarity;
      this.banner.style.fill = rc;
      this.banner.scale.set(pop);
      this.banner.rotation = over * (Math.random() - 0.5) * 0.08;
      this.banner.position.set(W / 2, cy - winH / 2 - 42);
      this.banner.alpha = 1;

      this.resultName.text = item?.name ?? '';
      this.resultName.style.fill = sub;
      this.resultName.position.set(W / 2, cy + winH / 2 + 28);
      this.resultName.scale.set(1 + Math.max(0, 1 - k * 4) * 0.5);

      this.title.text = '';
      this.hint.text = this.canDismiss ? '눌러서 계속' : '';
    } else {
      this.banner.text = '';
      this.resultName.text = '';
      this.hint.text = this.state === 'spin' ? '눌러서 넘기기' : '';
    }
  }
}
