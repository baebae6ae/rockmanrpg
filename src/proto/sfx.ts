/**
 * 효과음 — 전부 WebAudio 로 합성한다. 음원 파일이 하나도 없다.
 *
 * 녹음 음원을 쓰면 곧바로 저작권 문제가 되고(록맨 효과음은 더더욱),
 * 직접 만든 소리를 쓰자니 그것대로 일이다. 오실레이터와 잡음으로 짜면
 * 둘 다 피하면서 8/16비트 느낌도 자연스럽게 난다.
 *
 * 이 게임은 초당 수십 발이 나가므로 소리를 그대로 다 내면 귀가 아프고
 * 오디오 노드가 폭발한다. 그래서 소리마다 최소 간격을 두고 목소리 수를
 * 제한한다 — 안 그러면 "정신없다"가 아니라 그냥 잡음이 된다.
 */

type Ctx = AudioContext;

export interface Sfx {
  shot(style: 'charge' | 'rapid' | 'saber'): void;
  hit(): void;
  kill(): void;
  hurt(): void;
  level(): void;
  stage(): void;
  dash(): void;
  pick(): void;
  boss(): void;
  explode(): void;
  dead(): void;
  /** 첫 입력에서 불러야 한다 — 브라우저는 사용자 동작 전에 소리를 못 낸다 */
  unlock(): void;
  toggleMute(): boolean;
  readonly muted: boolean;
}

const MUTE_KEY = 'horde.muted';

export function createSfx(): Sfx {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    // 저장소를 못 읽는 환경(사생활 모드 등)에서는 그냥 소리를 켠 채로 간다
  }

  /** 소리별 마지막 재생 시각 — 최소 간격을 지키는 데 쓴다 */
  const last: Record<string, number> = {};
  let voices = 0;

  function ensure(): boolean {
    if (muted) return false;
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);

      // 잡음 버퍼 — 타격·폭발에 쓴다. 한 번만 만들어 재사용한다.
      const len = Math.floor(ctx.sampleRate * 0.4);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }

  /** 최소 간격 검사 — 통과하면 시각을 갱신한다 */
  function gate(key: string, minGap: number): boolean {
    if (!ctx) return false;
    const now = ctx.currentTime;
    if ((last[key] ?? -9) + minGap > now) return false;
    // 동시에 너무 많이 울리면 뒤엣것은 버린다
    if (voices > 18) return false;
    last[key] = now;
    return true;
  }

  function track(node: AudioScheduledSourceNode, dur: number): void {
    voices++;
    node.onended = () => { voices--; };
    node.stop(ctx!.currentTime + dur);
  }

  /** 음정이 미끄러지는 짧은 톤 */
  function tone(
    type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0,
  ): void {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    track(osc, dur + delay + 0.02);
  }

  /** 필터를 건 잡음 한 번 — 타격감의 대부분은 여기서 나온다 */
  function noise(dur: number, gain: number, freq: number, sweepTo = freq, delay = 0): void {
    if (!ctx || !master || !noiseBuf) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== freq) bp.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t0);
    track(src, dur + delay + 0.02);
  }

  return {
    get muted() { return muted; },

    unlock(): void {
      ensure();
    },

    toggleMute(): boolean {
      muted = !muted;
      try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // 저장 못 해도 이번 판에서는 적용된다
      }
      if (master) master.gain.value = muted ? 0 : 0.32;
      return muted;
    },

    shot(style): void {
      if (!ensure()) return;
      if (style === 'rapid') {
        // 연사는 실제 발사 간격(0.075초)보다 성기게 울려야 소음이 안 된다
        if (!gate('shot', 0.085)) return;
        tone('square', 1500, 900, 0.045, 0.055);
      } else if (style === 'charge') {
        if (!gate('shot', 0.1)) return;
        tone('sawtooth', 420, 150, 0.16, 0.1);
        tone('square', 840, 300, 0.1, 0.045);
      } else {
        if (!gate('shot', 0.12)) return;
        noise(0.14, 0.16, 2400, 600);
        tone('triangle', 900, 420, 0.1, 0.05);
      }
    },

    hit(): void {
      if (!ensure() || !gate('hit', 0.05)) return;
      noise(0.045, 0.1, 3200, 1600);
    },

    kill(): void {
      if (!ensure() || !gate('kill', 0.06)) return;
      noise(0.11, 0.14, 1400, 320);
      tone('square', 320, 110, 0.09, 0.045);
    },

    explode(): void {
      if (!ensure() || !gate('explode', 0.09)) return;
      noise(0.32, 0.3, 900, 120);
      tone('sawtooth', 180, 50, 0.3, 0.11);
    },

    hurt(): void {
      if (!ensure() || !gate('hurt', 0.2)) return;
      tone('sawtooth', 260, 70, 0.26, 0.2);
      noise(0.16, 0.16, 700, 220);
    },

    dash(): void {
      if (!ensure() || !gate('dash', 0.12)) return;
      noise(0.16, 0.13, 700, 3000);
    },

    level(): void {
      if (!ensure()) return;
      // 상승 아르페지오 — 뭔가 좋아졌다는 신호는 올라가는 음이어야 한다
      [0, 0.07, 0.14, 0.22].forEach((d, i) => {
        tone('square', 520 * Math.pow(1.26, i), 520 * Math.pow(1.26, i), 0.13, 0.09, d);
      });
    },

    pick(): void {
      if (!ensure()) return;
      tone('square', 880, 1320, 0.09, 0.08);
    },

    stage(): void {
      if (!ensure()) return;
      // 구역 전환 — 낮게 깔리는 경보
      tone('sawtooth', 180, 300, 0.3, 0.09);
      tone('sawtooth', 300, 180, 0.3, 0.09, 0.28);
      noise(0.5, 0.1, 400, 1600);
    },

    boss(): void {
      if (!ensure()) return;
      [0, 0.26, 0.52].forEach((d) => {
        tone('square', 240, 240, 0.16, 0.13, d);
        tone('square', 180, 180, 0.16, 0.1, d + 0.08);
      });
    },

    dead(): void {
      if (!ensure()) return;
      tone('sawtooth', 440, 60, 0.9, 0.2);
      noise(0.7, 0.2, 800, 90);
    },
  };
}
