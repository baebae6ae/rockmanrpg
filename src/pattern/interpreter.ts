/**
 * 보스 행동 패턴 인터프리터 — docs/DESIGN.md §7
 *
 * 보스 200여 명의 행동을 코드로 짜면 유지가 불가능하다. 행동을 프리미티브의
 * 조합으로 데이터에 기술하고, 여기서 해석한다. 새 보스를 추가할 때 이 파일은
 * 건드리지 않는다.
 */

import type { Room } from '../world/room';

export interface PatternStep {
  op: string;
  [key: string]: unknown;
}

export interface PatternDef {
  id: string;
  sequence: PatternStep[];
}

/** 패턴이 조종하는 대상이 제공해야 하는 것들 */
export interface PatternHost {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  readonly hp: number;
  readonly maxHp: number;
  invulnerable: boolean;
  readonly grounded: boolean;
  playAnim(tag: string): void;
  fire(opts: {
    dx: number;
    dy: number;
    speed: number;
    power: number;
    element: string;
    radius: number;
    color: number;
  }): void;
  melee(opts: { w: number; h: number; duration: number; power: number }): void;
}

export interface PatternContext {
  target: { x: number; y: number };
  room: Room;
}

interface Frame {
  steps: PatternStep[];
  index: number;
  loops: number;
}

interface Active {
  time: number;
  tick?: (dt: number, ctx: PatternContext) => void;
  done?: () => boolean;
}

/** 한 번의 update 에서 즉시 소비할 수 있는 최대 스텝 수 — 잘못된 데이터로 인한 무한 루프 방지 */
const STEP_GUARD = 64;

export class PatternRunner {
  private stack: Frame[];
  private active: Active | null = null;

  constructor(
    private readonly host: PatternHost,
    def: PatternDef,
    private readonly params: Record<string, unknown> = {},
  ) {
    this.stack = [{ steps: def.sequence, index: 0, loops: 0 }];
  }

  /** `$이름` 은 적 정의의 pattern_params 에서 주입된다 */
  private res<T = number>(value: unknown, fallback: T): T {
    if (typeof value === 'string' && value.startsWith('$')) {
      const v = this.params[value.slice(1)];
      return (v ?? fallback) as T;
    }
    return (value ?? fallback) as T;
  }

  update(dt: number, ctx: PatternContext): void {
    if (this.active) {
      this.active.time -= dt;
      this.active.tick?.(dt, ctx);
      if (this.active.time > 0 && !this.active.done?.()) return;
      this.active = null;
    }

    for (let guard = 0; guard < STEP_GUARD; guard++) {
      const frame = this.stack[this.stack.length - 1];
      if (!frame) return;

      if (frame.index >= frame.steps.length) {
        if (this.stack.length === 1) frame.index = 0;
        else this.stack.pop();
        continue;
      }

      const step = frame.steps[frame.index++];
      const active = this.begin(step, ctx, frame);
      if (active) {
        this.active = active;
        return;
      }
    }
  }

  private begin(step: PatternStep, ctx: PatternContext, frame: Frame): Active | null {
    const h = this.host;

    switch (step.op) {
      // ---------------------------------------------------------- 제어
      case 'wait':
        return { time: this.res(step.duration, 0.5) };

      case 'anim':
        h.playAnim(this.res<string>(step.tag, 'idle'));
        return null;

      case 'telegraph': {
        h.playAnim(this.res<string>(step.anim, 'telegraph'));
        h.vx = 0;
        return { time: this.res(step.duration, 0.5) };
      }

      case 'face_player':
        h.facing = ctx.target.x >= h.x ? 1 : -1;
        return null;

      case 'invulnerable':
        h.invulnerable = this.res<boolean>(step.value as never, false) as boolean;
        return null;

      case 'loop': {
        const count = this.res(step.count, -1);
        if (count < 0) {
          frame.index = 0;
        } else {
          frame.loops++;
          if (frame.loops < count) frame.index = 0;
        }
        return null;
      }

      case 'if_hp_below': {
        const ratio = this.res(step.ratio, 0.5);
        if (h.hp / h.maxHp <= ratio && Array.isArray(step.then)) {
          this.stack.push({ steps: step.then as PatternStep[], index: 0, loops: 0 });
        }
        return null;
      }

      case 'random': {
        const options = (step.options ?? []) as PatternStep[][];
        if (options.length > 0) {
          const pick = options[Math.floor(Math.random() * options.length)];
          this.stack.push({ steps: pick, index: 0, loops: 0 });
        }
        return null;
      }

      // ---------------------------------------------------------- 이동
      case 'move_to': {
        const targetX = this.res(step.x, ctx.target.x);
        const speed = this.res(step.speed, 60);
        h.playAnim(this.res<string>(step.anim, 'move'));
        return {
          time: this.res(step.timeout, 3),
          tick: () => {
            const dir = Math.sign(targetX - h.x);
            h.facing = dir === 0 ? h.facing : dir;
            h.vx = dir * speed;
          },
          done: () => {
            if (Math.abs(targetX - h.x) <= 3) {
              h.vx = 0;
              return true;
            }
            return false;
          },
        };
      }

      case 'charge': {
        const speed = this.res(step.speed, 160);
        const distance = this.res(step.distance, 120);
        const startX = h.x;
        h.playAnim(this.res<string>(step.anim, 'move'));
        return {
          time: distance / speed,
          tick: () => {
            h.vx = h.facing * speed;
          },
          done: () => {
            if (Math.abs(h.x - startX) >= distance) {
              h.vx = 0;
              return true;
            }
            return false;
          },
        };
      }

      case 'jump': {
        h.vy = -this.res(step.vy, 240);
        h.vx = h.facing * this.res(step.vx, 0);
        h.playAnim(this.res<string>(step.anim, 'move'));
        let left = 0.12; // 이륙 직후에는 접지 판정을 무시한다
        return {
          time: this.res(step.timeout, 3),
          tick: (dt) => {
            left -= dt;
          },
          done: () => left <= 0 && h.grounded,
        };
      }

      case 'teleport': {
        const tx = this.res(step.x, ctx.target.x);
        const ty = this.res(step.y, h.y);
        const fade = this.res(step.fade, 0.25);
        let moved = false;
        return {
          time: fade,
          tick: () => {
            if (moved) return;
            moved = true;
            h.x = Math.max(16, Math.min(ctx.room.width - 16, tx));
            h.y = ty;
            h.vx = 0;
            h.vy = 0;
          },
        };
      }

      // ---------------------------------------------------------- 공격
      case 'shoot':
      case 'shoot_aimed': {
        const aimed = step.op === 'shoot_aimed';
        const count = this.res(step.count, 1);
        const interval = this.res(step.interval, 0.12);
        const spread = this.res(step.spread, 0);
        const speed = this.res(step.speed, 140);
        const power = this.res(step.power, 8);
        const element = this.res<string>(step.element, 'neutral');
        const radius = this.res(step.radius, 3);
        const color = this.res(step.color, 0xffd45c);

        h.playAnim(this.res<string>(step.anim, 'attack_1'));
        h.vx = 0;

        let fired = 0;
        let acc = 0;
        const emit = (): void => {
          let base = h.facing >= 0 ? 0 : Math.PI;
          if (aimed) base = Math.atan2(ctx.target.y - (h.y - 16), ctx.target.x - h.x);
          const offset =
            count > 1 ? ((fired / (count - 1)) * 2 - 1) * ((spread * Math.PI) / 180) : 0;
          const a = base + offset;
          h.fire({ dx: Math.cos(a), dy: Math.sin(a), speed, power, element, radius, color });
          fired++;
        };

        emit();
        return {
          time: Math.max(0.05, interval * count),
          tick: (dt) => {
            if (fired >= count) return;
            acc += dt;
            while (acc >= interval && fired < count) {
              acc -= interval;
              emit();
            }
          },
          done: () => fired >= count,
        };
      }

      case 'melee': {
        h.playAnim(this.res<string>(step.anim, 'attack_2'));
        h.melee({
          w: this.res(step.w, 26),
          h: this.res(step.h, 24),
          duration: this.res(step.duration, 0.2),
          power: this.res(step.power, 12),
        });
        return { time: this.res(step.duration, 0.2) };
      }

      default:
        console.warn(`알 수 없는 패턴 프리미티브: ${step.op}`);
        return null;
    }
  }
}
