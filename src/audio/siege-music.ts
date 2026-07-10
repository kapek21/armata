/**
 * Cicha muzyka tła oblężniczego — rzadkie bębny, bez stałego buczenia.
 */

const BPM = 54;
const SEC_PER_BEAT = 60 / BPM;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_MS = 45;

const D3 = 146.83;
const F3 = 174.61;
const A3 = 220.0;

/** Rzadki, cichy rytm — co kilka uderzeń. */
const DRUM_SCORE: { beat: number; gain: number }[] = [
  { beat: 0, gain: 0.42 },
  { beat: 6, gain: 0.28 },
  { beat: 10, gain: 0.36 },
  { beat: 14, gain: 0.3 },
];

const HORN_PHRASES: number[][] = [
  [D3, F3, A3],
  [A3, F3, D3],
];

export class SiegeMusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padOsc: OscillatorNode | null = null;
  private running = false;
  private muted = false;
  private nextBeat = 0;
  private phraseIndex = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) {
      const target = muted ? 0 : 0.16;
      this.master.gain.setTargetAtTime(target, this.ctx?.currentTime ?? 0, 0.12);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) {
      await this.resume();
      return;
    }
    const ctx = await this.ensureContext();
    this.running = true;
    this.startTime = ctx.currentTime + 0.05;
    this.nextBeat = 0;
    this.startSoftPad();
    this.timerId = setInterval(() => this.tick(), SCHEDULE_MS);
  }

  pause(): void {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    void this.ctx.suspend();
  }

  async resume(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  stop(): void {
    this.running = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.padOsc) {
      try {
        this.padOsc.stop();
      } catch {
        /* noop */
      }
      this.padOsc = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.16;

      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1400;
      lowpass.Q.value = 0.5;

      this.master.connect(lowpass);
      lowpass.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  private startSoftPad(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 73.42;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.018;

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 220;

    osc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.master);
    osc.start();
    this.padOsc = osc;
  }

  private tick(): void {
    if (!this.running || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const elapsed = now - this.startTime;
    const currentBeat = elapsed / SEC_PER_BEAT;

    while (this.nextBeat < currentBeat + LOOKAHEAD_SEC / SEC_PER_BEAT) {
      const scheduleAt = this.startTime + this.nextBeat * SEC_PER_BEAT;
      this.scheduleBeat(this.nextBeat, scheduleAt);
      this.nextBeat += 0.5;
    }
  }

  private scheduleBeat(beat: number, time: number): void {
    const cycleBeat = beat % 16;

    for (const hit of DRUM_SCORE) {
      if (Math.abs(hit.beat - cycleBeat) < 0.01) {
        this.playSoftDrum(time, hit.gain);
      }
    }

    if (cycleBeat === 0 && beat % 32 === 0) {
      const phrase = HORN_PHRASES[this.phraseIndex % HORN_PHRASES.length];
      this.phraseIndex += 1;
      this.scheduleHornPhrase(phrase, time + SEC_PER_BEAT);
    }
  }

  private playSoftDrum(time: number, velocity: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(72, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.14);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(velocity * 0.32, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.55);
  }

  private scheduleHornPhrase(notes: number[], start: number): void {
    const noteLen = SEC_PER_BEAT * 1.1;
    notes.forEach((freq, i) => {
      this.playSoftHorn(freq, start + i * noteLen, noteLen * 0.85);
    });
  }

  private playSoftHorn(freq: number, time: number, duration: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.045, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }
}

let engine: SiegeMusicEngine | null = null;

export function getSiegeMusicEngine(): SiegeMusicEngine {
  if (!engine) engine = new SiegeMusicEngine();
  return engine;
}

export function disposeSiegeMusic(): void {
  engine?.stop();
  engine = null;
}
