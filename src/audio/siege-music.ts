/**
 * Proceduralna muzyka oblężnicza — modalna, powolna, z rogami i bębnami wojennymi.
 * Bez zewnętrznych plików audio; unika generycznego „epic orchestra”.
 */

const BPM = 68;
const SEC_PER_BEAT = 60 / BPM;
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_MS = 40;

const D2 = 73.42;
const A2 = 110.0;
const D3 = 146.83;
const F3 = 174.61;
const G3 = 196.0;
const A3 = 220.0;
const C4 = 261.63;
const D4 = 293.66;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440.0;

type DrumKind = 'war' | 'rim' | 'taiko';

interface ScheduledDrum {
  beat: number;
  kind: DrumKind;
  gain: number;
}

/** Nieregularny rytm oblężniczy — 2 taktowy wzorzec (16 beatów). */
const DRUM_SCORE: ScheduledDrum[] = [
  { beat: 0, kind: 'war', gain: 0.95 },
  { beat: 1.5, kind: 'rim', gain: 0.35 },
  { beat: 3, kind: 'taiko', gain: 0.55 },
  { beat: 4, kind: 'war', gain: 0.75 },
  { beat: 5.5, kind: 'rim', gain: 0.28 },
  { beat: 7, kind: 'war', gain: 0.88 },
  { beat: 8, kind: 'taiko', gain: 0.5 },
  { beat: 9, kind: 'rim', gain: 0.32 },
  { beat: 10.5, kind: 'war', gain: 0.7 },
  { beat: 12, kind: 'war', gain: 1 },
  { beat: 13.5, kind: 'rim', gain: 0.38 },
  { beat: 15, kind: 'taiko', gain: 0.62 },
];

/** Fanfary rogów strażniczych — co 16 beatów inna fraza. */
const HORN_PHRASES: number[][] = [
  [D4, F4, G4, A4, G4, F4, D4],
  [A3, C4, D4, F4, D4, C4, A3],
  [D4, D4, F4, G4, F4, D3, D3],
  [G3, A3, C4, A3, G3, F3, D3],
];

export class SiegeMusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private windNode: AudioBufferSourceNode | null = null;
  private running = false;
  private muted = false;
  private nextBeat = 0;
  private phraseIndex = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) {
      const target = muted ? 0 : 0.42;
      this.master.gain.setTargetAtTime(target, this.ctx?.currentTime ?? 0, 0.08);
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
    this.startDrone();
    this.startWind();
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
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    this.droneOscs = [];
    if (this.windNode) {
      try {
        this.windNode.stop();
      } catch {
        /* noop */
      }
      this.windNode = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
      this.droneGain = null;
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;

      const warmth = this.ctx.createBiquadFilter();
      warmth.type = 'lowpass';
      warmth.frequency.value = 3400;
      warmth.Q.value = 0.6;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -22;
      comp.knee.value = 12;
      comp.ratio.value = 3;

      this.master.connect(warmth);
      warmth.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
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
        this.playDrum(hit.kind, time, hit.gain);
      }
    }

    if (cycleBeat === 0 && beat % 16 === 0) {
      const phrase = HORN_PHRASES[this.phraseIndex % HORN_PHRASES.length];
      this.phraseIndex += 1;
      this.scheduleHornPhrase(phrase, time + SEC_PER_BEAT * 0.5);
    }

    if (cycleBeat === 8 && beat % 32 === 8) {
      this.playBell(time);
    }
  }

  private startDrone(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.14;
    this.droneGain.connect(this.master);

    const freqs = [D2, A2, D3 * 0.5];
    const types: OscillatorType[] = ['sawtooth', 'triangle', 'sine'];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = freqs[i] * (1 + (i - 1) * 0.003);

      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.55 : i === 1 ? 0.35 : 0.2;
      osc.connect(g);
      g.connect(this.droneGain);
      osc.start();
      this.droneOscs.push(osc);
    }

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(this.droneGain.gain);
    lfo.start();
  }

  private startWind(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 280;
    bp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.04;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start();
    this.windNode = src;
  }

  private playDrum(kind: DrumKind, time: number, velocity: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    if (kind === 'war' || kind === 'taiko') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const baseFreq = kind === 'war' ? 58 : 88;
      osc.frequency.setValueAtTime(baseFreq, time);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.35, time + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(velocity * (kind === 'war' ? 0.55 : 0.38), time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + (kind === 'war' ? 0.45 : 0.28));

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(time);
      osc.stop(time + 0.5);
    }

    const noiseLen = Math.floor(ctx.sampleRate * 0.06);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const nGain = ctx.createGain();
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.value = kind === 'rim' ? 2200 : 900;

    const nVel = kind === 'rim' ? velocity * 0.22 : velocity * 0.18;
    nGain.gain.setValueAtTime(nVel, time);
    nGain.gain.exponentialRampToValueAtTime(0.0001, time + (kind === 'rim' ? 0.04 : 0.09));

    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.master);
    noise.start(time);
    noise.stop(time + 0.1);
  }

  private scheduleHornPhrase(notes: number[], start: number): void {
    if (!this.ctx || !this.master) return;
    const noteLen = SEC_PER_BEAT * 0.85;
    notes.forEach((freq, i) => {
      this.playHorn(freq, start + i * noteLen * 0.72, noteLen * 0.7);
    });
  }

  private playHorn(freq: number, time: number, duration: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.linearRampToValueAtTime(freq * 0.992, time + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 720;
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.11, time + 0.06);
    gain.gain.setValueAtTime(0.09, time + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private playBell(time: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const partials = [392, 523.25, 659.25];
    for (const freq of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.04, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 2.8);
      osc.connect(g);
      g.connect(this.master);
      osc.start(time);
      osc.stop(time + 3);
    }
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
