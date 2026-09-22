/**
 * 배경음악 — 효과음(sfx.ts)과 똑같이 전부 WebAudio 로 합성한다. 녹음
 * 음원이 아니라 저작권 문제가 없다.
 *
 * 짧은 코드 진행(4마디)을 스케줄러로 계속 반복하고, 상황(메뉴/전투/
 * 보스전)에 따라 층(베이스·아르페지오·하이햇)을 얹거나 뺀다 — 곡을
 * 통째로 갈아 끼우지 않고 같은 진행 위에서 밀도만 바뀌므로 전환이
 * 뚝뚝 끊기지 않는다.
 *
 * 스케줄링은 "다음 스텝 시각"을 오디오 클록 기준으로 미리 계산해
 * 두고 짧은 간격으로 그 창을 채우는 표준 룩어헤드 방식이다 —
 * setInterval 콜백 자체의 지터에 기대면 박자가 서서히 밀린다.
 */

type Ctx = AudioContext;

export type BgmMood = 'menu' | 'play' | 'boss';

export interface Bgm {
  start(): void;
  stop(): void;
  setMood(mood: BgmMood): void;
  toggleMute(): boolean;
  readonly muted: boolean;
}

const MUTE_KEY = 'horde.bgm.muted';

/** A 단조 4마디 진행 — i(Am)-VI(F)-III(C)-VII(G). 전진감이 나는,
    액션 게임에 흔한 진행이다. notes 는 마디 안에서 스텝마다 도는
    아르페지오 음, bass 는 그 마디의 근음(한 옥타브 아래). */
const CHORDS: { bass: number; notes: number[] }[] = [
  { bass: 110.00, notes: [220.00, 261.63, 329.63, 261.63] }, // Am
  { bass: 87.31, notes: [174.61, 220.00, 261.63, 220.00] }, // F
  { bass: 130.81, notes: [261.63, 329.63, 392.00, 329.63] }, // C
  { bass: 98.00, notes: [196.00, 246.94, 293.66, 246.94] }, // G
];

const BPM = 132;
const STEP_DUR = 60 / BPM / 2; // 8분음표 단위로 스텝을 쪼갠다
const STEPS_PER_BAR = 8;

const MOOD_GAIN: Record<BgmMood, { pad: number; bass: number; lead: number; hat: number }> = {
  // 메뉴 — 드론만 옅게 깔아 화면이 비어 있지 않다는 정도만 알린다
  menu: { pad: 0.05, bass: 0, lead: 0, hat: 0 },
  // 평상시 전투 — 베이스·아르페지오까지 붙어 앞으로 나아가는 느낌
  play: { pad: 0.045, bass: 0.085, lead: 0.055, hat: 0.03 },
  // 보스전 — 전부 조금씩 더 크고, 하이햇까지 또렷해져 긴장감을 더한다
  boss: { pad: 0.05, bass: 0.11, lead: 0.075, hat: 0.05 },
};

export function createBgm(): Bgm {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let padGain: GainNode | null = null;
  let bassGain: GainNode | null = null;
  let leadGain: GainNode | null = null;
  let hatGain: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    // 저장소를 못 읽는 환경에서는 그냥 켠 채로 간다
  }

  let mood: BgmMood = 'menu';
  let running = false;
  let timer: number | null = null;
  let step = 0;
  let nextStepTime = 0;
  let padOsc: OscillatorNode[] = [];

  function ensure(): boolean {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);

      padGain = ctx.createGain(); padGain.gain.value = 0; padGain.connect(master);
      bassGain = ctx.createGain(); bassGain.gain.value = 0; bassGain.connect(master);
      leadGain = ctx.createGain(); leadGain.gain.value = 0; leadGain.connect(master);
      hatGain = ctx.createGain(); hatGain.gain.value = 0; hatGain.connect(master);

      const len = Math.floor(ctx.sampleRate * 0.2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }

  /** 근음 위에 5도를 얹은 드론 두 겹 — 계속 떠 있는 배경 층. 곡 내내
      한 번만 만들어 켜 두고, 볼륨만 무드에 따라 오르내린다. */
  function startPad(): void {
    if (!ctx || !padGain) return;
    for (const f of [110, 164.81]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(padGain);
      osc.start();
      padOsc.push(osc);
    }
  }

  function scheduleNote(
    freq: number, t: number, dur: number, type: OscillatorType, gainNode: GainNode, peak: number,
  ): void {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(gainNode);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function scheduleHat(t: number, peak: number): void {
    if (!ctx || !noiseBuf || !hatGain) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp).connect(g).connect(hatGain);
    src.start(t);
    src.stop(t + 0.05);
  }

  function scheduler(): void {
    if (!ctx || !bassGain || !leadGain) return;
    const lookahead = 0.12;
    while (nextStepTime < ctx.currentTime + lookahead) {
      const bar = Math.floor(step / STEPS_PER_BAR) % CHORDS.length;
      const beat = step % STEPS_PER_BAR;
      const chord = CHORDS[bar];

      // 베이스 — 마디 안 1·4박에 당김음으로 짚어 앞으로 미는 느낌을 낸다
      if (beat === 0 || beat === 3) {
        scheduleNote(chord.bass, nextStepTime, STEP_DUR * 1.4, 'sawtooth', bassGain, 1);
      }
      // 리드 아르페지오 — 매 스텝 코드 톤을 하나씩 밟는다
      scheduleNote(chord.notes[beat % chord.notes.length], nextStepTime, STEP_DUR * 0.9, 'square', leadGain, 0.6);
      // 하이햇 — 오프비트에만 살짝 얹어 리듬을 잡아준다
      if (beat % 2 === 1) scheduleHat(nextStepTime, 1);

      step++;
      nextStepTime += STEP_DUR;
    }
  }

  function rampLayers(): void {
    if (!ctx || !padGain || !bassGain || !leadGain || !hatGain) return;
    const g = MOOD_GAIN[mood];
    const t = ctx.currentTime;
    padGain.gain.linearRampToValueAtTime(g.pad, t + 1.2);
    bassGain.gain.linearRampToValueAtTime(g.bass, t + 1.2);
    leadGain.gain.linearRampToValueAtTime(g.lead, t + 1.2);
    hatGain.gain.linearRampToValueAtTime(g.hat, t + 1.2);
  }

  function start(): void {
    if (running || !ensure()) return;
    running = true;
    startPad();
    step = 0;
    nextStepTime = ctx!.currentTime + 0.05;
    rampLayers();
    timer = window.setInterval(scheduler, 25);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    if (timer !== null) { window.clearInterval(timer); timer = null; }
    for (const o of padOsc) {
      try { o.stop(); } catch { /* 이미 멎었으면 무시 */ }
    }
    padOsc = [];
  }

  function setMood(m: BgmMood): void {
    if (mood === m) return;
    mood = m;
    if (running) rampLayers();
  }

  function toggleMute(): boolean {
    muted = !muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // 저장 못 해도 이번 판에서는 적용된다
    }
    if (master) master.gain.value = muted ? 0 : 1;
    return muted;
  }

  return {
    get muted() { return muted; },
    start,
    stop,
    setMood,
    toggleMute,
  };
}
