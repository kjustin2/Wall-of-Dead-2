type AudioCtx = AudioContext & { createGain(): GainNode };

function noiseBuffer(ctx: AudioContext, secs: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * secs));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(ctx: AudioContext, out: AudioNode, start: number, end: number, dur: number, gain: number, type: OscillatorType = "sine"): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(start, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(24, end), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(ctx: AudioContext, out: AudioNode, dur: number, lp: number, gain: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = lp;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.03);
}

function bandNoise(ctx: AudioContext, out: AudioNode, dur: number, freq: number, q: number, gain: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.04);
}

export class AudioSystem {
  private ctx: AudioCtx | null = null;
  private master: GainNode | null = null;
  private last: Record<string, number> = {};
  private ambientTimer = 0;
  private ambientAt = 6;
  private heartbeatTimer = 0;
  private ambientPool: string[] = [];
  private unlocked = false;
  private dreadGain: GainNode | null = null;
  private chaseGain: GainNode | null = null;
  private bedSources: AudioScheduledSourceNode[] = [];

  init(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor() as AudioCtx;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.58;
    this.master.connect(this.ctx.destination);
    this.startDreadBed(this.ctx, this.master);
    this.unlocked = true;
  }

  setAmbientPool(pool: string[]): void {
    this.ambientPool = pool;
    this.ambientTimer = 0;
    this.ambientAt = 4 + Math.random() * 5;
  }

  play(id: string): void {
    if (!this.ctx || !this.master || !this.unlocked) return;
    const now = performance.now();
    if (this.last[id] && now - this.last[id] < 35) return;
    this.last[id] = now;
    const ctx = this.ctx;
    const out = this.master;
    switch (id) {
      case "pistol":
        tone(ctx, out, 720, 92, 0.085, 0.32, "square");
        noise(ctx, out, 0.07, 4700, 0.16);
        break;
      case "shotgun":
        tone(ctx, out, 210, 42, 0.18, 0.46, "sawtooth");
        noise(ctx, out, 0.20, 1900, 0.52);
        break;
      case "rifle":
        tone(ctx, out, 390, 58, 0.14, 0.42, "sawtooth");
        noise(ctx, out, 0.12, 3200, 0.34);
        break;
      case "flare":
        bandNoise(ctx, out, 0.55, 1900, 4, 0.13);
        tone(ctx, out, 180, 96, 0.26, 0.10, "sawtooth");
        break;
      case "pipebomb":
      case "explosion":
        tone(ctx, out, 86, 28, 0.55, 0.58, "sawtooth");
        noise(ctx, out, 0.68, 1500, 0.52);
        break;
      case "bat":
      case "hit":
        tone(ctx, out, 104, 54, 0.12, 0.18, "sawtooth");
        noise(ctx, out, 0.08, 900, 0.14);
        break;
      case "hurt":
        tone(ctx, out, 250, 70, 0.18, 0.34, "sawtooth");
        break;
      case "reload":
        bandNoise(ctx, out, 0.08, 1150, 7, 0.07);
        window.setTimeout(() => bandNoise(ctx, out, 0.07, 820, 8, 0.055), 120);
        window.setTimeout(() => tone(ctx, out, 90, 62, 0.10, 0.08, "sine"), 230);
        break;
      case "whisper":
        bandNoise(ctx, out, 0.55, 1300, 8, 0.12);
        bandNoise(ctx, out, 0.55, 2300, 10, 0.055);
        break;
      case "distant_scream":
        tone(ctx, out, 620, 240, 0.72, 0.18, "sawtooth");
        bandNoise(ctx, out, 0.72, 780, 5, 0.07);
        break;
      case "chain_drag":
        bandNoise(ctx, out, 0.65, 3600, 12, 0.10);
        break;
      case "pipe_drip":
        tone(ctx, out, 2200, 1200, 0.07, 0.13, "sine");
        break;
      case "floor_creak":
        tone(ctx, out, 125, 54, 0.48, 0.16, "sawtooth");
        break;
      case "flicker_buzz":
        tone(ctx, out, 120, 118, 0.22, 0.09, "square");
        break;
      case "light_pop":
        tone(ctx, out, 1800, 92, 0.08, 0.18, "square");
        noise(ctx, out, 0.06, 6200, 0.12);
        break;
      case "blackout_drop":
        tone(ctx, out, 68, 26, 0.42, 0.44, "sawtooth");
        bandNoise(ctx, out, 0.36, 150, 2, 0.18);
        noise(ctx, out, 0.10, 1800, 0.10);
        break;
      case "door_slam":
        tone(ctx, out, 96, 28, 0.28, 0.48, "sawtooth");
        noise(ctx, out, 0.16, 900, 0.34);
        break;
      case "metal_groan":
        tone(ctx, out, 82, 54, 0.85, 0.21, "sawtooth");
        bandNoise(ctx, out, 0.9, 520, 5, 0.10);
        break;
      case "breath_close":
        bandNoise(ctx, out, 0.9, 720, 2.4, 0.12);
        bandNoise(ctx, out, 0.7, 1800, 8, 0.035);
        break;
      case "wall_scrape":
        bandNoise(ctx, out, 0.62, 880, 8, 0.13);
        bandNoise(ctx, out, 0.56, 1900, 12, 0.055);
        break;
      case "cloth_rustle":
        bandNoise(ctx, out, 0.22, 620, 3, 0.07);
        noise(ctx, out, 0.16, 1150, 0.045);
        break;
      case "radio_burst":
        bandNoise(ctx, out, 0.22, 2400, 12, 0.18);
        tone(ctx, out, 410, 390, 0.18, 0.05, "square");
        break;
      case "pa_broken":
        bandNoise(ctx, out, 0.42, 1900, 9, 0.13);
        tone(ctx, out, 118, 86, 0.36, 0.11, "square");
        window.setTimeout(() => bandNoise(ctx, out, 0.20, 620, 4, 0.09), 230);
        break;
      case "gate_hum":
        tone(ctx, out, 54, 42, 0.90, 0.16, "sawtooth");
        bandNoise(ctx, out, 0.90, 110, 2, 0.08);
        break;
      case "fluorescent_die":
        tone(ctx, out, 190, 64, 0.20, 0.18, "square");
        bandNoise(ctx, out, 0.28, 3200, 14, 0.11);
        window.setTimeout(() => tone(ctx, out, 64, 24, 0.30, 0.20, "sawtooth"), 120);
        break;
      case "enemy_reveal":
        tone(ctx, out, 72, 28, 0.52, 0.42, "sawtooth");
        bandNoise(ctx, out, 0.50, 420, 5, 0.13);
        bandNoise(ctx, out, 0.26, 1900, 10, 0.08);
        break;
      case "wet_footstep":
        tone(ctx, out, 88, 48, 0.13, 0.22, "sawtooth");
        bandNoise(ctx, out, 0.18, 540, 4, 0.12);
        break;
      case "distant_metal":
        tone(ctx, out, 96, 38, 0.62, 0.17, "sawtooth");
        bandNoise(ctx, out, 0.70, 760, 9, 0.085);
        break;
      case "shrine_hum":
        tone(ctx, out, 49, 41, 1.20, 0.17, "sawtooth");
        bandNoise(ctx, out, 1.10, 260, 4, 0.09);
        bandNoise(ctx, out, 0.80, 980, 8, 0.05);
        break;
      case "sub_bass_sting":
        tone(ctx, out, 72, 31, 0.72, 0.50, "sawtooth");
        bandNoise(ctx, out, 0.6, 180, 3, 0.12);
        break;
      case "body_drop":
        tone(ctx, out, 92, 35, 0.18, 0.52, "sawtooth");
        noise(ctx, out, 0.25, 650, 0.28);
        break;
      case "heartbeat":
        tone(ctx, out, 82, 44, 0.12, 0.33, "sine");
        window.setTimeout(() => this.play("heartbeat2"), 145);
        break;
      case "heartbeat2":
        tone(ctx, out, 76, 40, 0.09, 0.25, "sine");
        break;
      case "rat_skitter":
        bandNoise(ctx, out, 0.38, 880, 8, 0.12);
        tone(ctx, out, 120, 52, 0.22, 0.10, "sawtooth");
        break;
      case "skitter_tick":
        bandNoise(ctx, out, 0.16, 760, 6, 0.08);
        break;
      case "music_box":
        tone(ctx, out, 58, 43, 0.82, 0.14, "sawtooth");
        bandNoise(ctx, out, 0.72, 1180, 7, 0.05);
        break;
      case "wind":
        bandNoise(ctx, out, 1.0, 420, 2, 0.05);
        break;
    }
  }

  tick(dt: number, dread: number, chaseActive = false): void {
    if (!this.ctx || !this.master || !this.unlocked) return;
    const d = Math.max(0, Math.min(1, dread));
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.50 + d * 0.08, now, 0.5);
    this.dreadGain?.gain.setTargetAtTime(0.018 + d * 0.115, now, 0.9);
    this.chaseGain?.gain.setTargetAtTime(chaseActive ? 0.11 + d * 0.14 : 0.0001, now, 0.35);
    this.ambientTimer += dt;
    if (this.ambientPool.length > 0 && this.ambientTimer >= this.ambientAt) {
      this.ambientTimer = 0;
      this.ambientAt = 8 + Math.random() * 8 - d * 7;
      this.play(this.ambientPool[Math.floor(Math.random() * this.ambientPool.length)]);
    }
    if (d > 0.38) {
      this.heartbeatTimer += dt;
      const rate = 0.65 + d * 1.9;
      if (this.heartbeatTimer >= 1 / rate) {
        this.heartbeatTimer = 0;
        this.play("heartbeat");
      }
    } else {
      this.heartbeatTimer = 0;
    }
  }

  private startDreadBed(ctx: AudioContext, out: AudioNode): void {
    this.dreadGain = ctx.createGain();
    this.chaseGain = ctx.createGain();
    this.dreadGain.gain.value = 0.0001;
    this.chaseGain.gain.value = 0.0001;
    this.dreadGain.connect(out);
    this.chaseGain.connect(out);

    const low = ctx.createOscillator();
    low.type = "sine";
    low.frequency.value = 42;
    low.connect(this.dreadGain);
    low.start();
    this.bedSources.push(low);

    const scrape = ctx.createBufferSource();
    scrape.buffer = noiseBuffer(ctx, 2.6);
    scrape.loop = true;
    const scrapeFilter = ctx.createBiquadFilter();
    scrapeFilter.type = "bandpass";
    scrapeFilter.frequency.value = 310;
    scrapeFilter.Q.value = 2.2;
    scrape.connect(scrapeFilter).connect(this.dreadGain);
    scrape.start();
    this.bedSources.push(scrape);

    const chasePulse = ctx.createOscillator();
    chasePulse.type = "sawtooth";
    chasePulse.frequency.value = 58;
    const chaseFilter = ctx.createBiquadFilter();
    chaseFilter.type = "lowpass";
    chaseFilter.frequency.value = 180;
    chasePulse.connect(chaseFilter).connect(this.chaseGain);
    chasePulse.start();
    this.bedSources.push(chasePulse);
  }
}
