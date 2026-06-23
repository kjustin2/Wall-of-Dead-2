/**
 * Fully procedural WebAudio sound engine. No audio files.
 * One-shots are spatialized (gain + stereo pan) against the listener
 * position captured at trigger time.
 */
export class AudioFX {
  private ctx!: AudioContext;
  private master!: GainNode;
  private verbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private ready = false;

  // listener
  private lx = 0;
  private lz = 0;
  private lyaw = 0;

  // continuous layers
  private droneGain!: GainNode;
  private breathGain!: GainNode;
  private breathPhase = 0;
  private beatTimer = 0;
  private chaseKick = 0;
  private dripTimer = 2;

  init(): void {
    if (this.ready) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    // cheap "concrete space": feedback delay into a lowpass
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.16;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 900;
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    damp.connect(wet);
    wet.connect(this.master);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 1;
    this.verbSend.connect(delay);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b = (b + 0.02 * w) / 1.02; // brown-ish
      data[i] = w * 0.5 + b * 2.2;
    }
    this.ready = true;
    void ctx.resume();
    this.startAmbient();
  }

  setListener(x: number, z: number, yaw: number): void {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  // ---------- helpers ----------

  private spat(x: number, z: number, refDist = 6): { out: GainNode; d: number } {
    const ctx = this.ctx;
    const dx = x - this.lx;
    const dz = z - this.lz;
    const d = Math.hypot(dx, dz);
    // pan: project onto listener right vector
    const rx = Math.cos(this.lyaw);
    const rz = -Math.sin(this.lyaw);
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    const g = ctx.createGain();
    g.gain.value = Math.min(1, refDist / (refDist + d * d * 0.06));
    const p = ctx.createStereoPanner();
    p.pan.value = pan * 0.75;
    g.connect(p);
    p.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send);
    send.connect(this.verbSend);
    return { out: g, d };
  }

  private noise(dest: AudioNode, t0: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1, freqEnd?: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.015, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  private tone(dest: AudioNode, t0: number, dur: number, vol: number, type: OscillatorType, f0: number, f1?: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // ---------- ambient bed ----------

  private startAmbient(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.05;
    this.droneGain.connect(this.master);

    for (const [f, v, type] of [[48, 0.5, "sine"], [50.3, 0.35, "sine"], [97, 0.12, "triangle"]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g);
      g.connect(this.droneGain);
      o.start(t);
    }
    // air: looping filtered noise
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 320;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    src.connect(f);
    f.connect(g);
    g.connect(this.droneGain);
    src.start(t);
    // slow swell LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lg = ctx.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg);
    lg.connect(this.droneGain.gain);
    lfo.start(t);

    // player breath layer (driven by threat in update)
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    this.breathGain.connect(this.master);
    const bsrc = ctx.createBufferSource();
    bsrc.buffer = this.noiseBuf;
    bsrc.loop = true;
    bsrc.playbackRate.value = 0.5;
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = 650;
    bf.Q.value = 0.9;
    bsrc.connect(bf);
    bf.connect(this.breathGain);
    bsrc.start(t);
  }

  /** drive heartbeat / chase pulse; call every frame */
  update(dt: number, threat: number, chase: boolean): void {
    if (!this.ready) return;
    const ctx = this.ctx;

    // heartbeat
    if (threat > 0.12) {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        const interval = 1.35 - threat * 0.9;
        this.beatTimer = interval;
        const t = ctx.currentTime;
        const vol = 0.10 + threat * 0.22;
        this.tone(this.master, t, 0.12, vol, "sine", 58, 38);
        this.tone(this.master, t + interval * 0.28, 0.1, vol * 0.7, "sine", 52, 36);
      }
    } else {
      this.beatTimer = 0;
    }

    // chase pulse
    if (chase) {
      this.chaseKick -= dt;
      if (this.chaseKick <= 0) {
        this.chaseKick = 0.46;
        const t = ctx.currentTime;
        this.tone(this.master, t, 0.16, 0.22, "sine", 92, 34);
        this.noise(this.master, t, 0.07, 0.07, "highpass", 3000);
        if (Math.random() < 0.22) this.tone(this.master, t + 0.1, 0.5, 0.05, "sawtooth", 622, 590);
      }
    }

    // ragged breathing as threat rises
    if (this.breathGain) {
      const b = Math.max(0, threat - 0.45) / 0.55;
      this.breathPhase += dt * (2.1 + b * 1.6);
      const cycle = Math.max(0, Math.sin(this.breathPhase)) ** 2;
      this.breathGain.gain.value = b * 0.05 * (0.25 + 0.75 * cycle);
    }

    // occasional drips
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 3 + Math.random() * 9;
      const t = ctx.currentTime;
      const ox = this.lx + (Math.random() - 0.5) * 24;
      const oz = this.lz + (Math.random() - 0.5) * 24;
      const { out } = this.spat(ox, oz, 3);
      this.tone(out, t, 0.09, 0.4, "sine", 1900 + Math.random() * 1400, 700);
    }
  }

  // ---------- one-shots ----------

  stepPlayer(speedFrac: number, crouched: boolean): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const vol = crouched ? 0.03 : 0.05 + speedFrac * 0.1;
    this.noise(this.master, t, 0.07 + speedFrac * 0.04, vol, "bandpass", 240 + Math.random() * 320, 1.2);
    this.tone(this.master, t, 0.06, vol * 0.8, "sine", 75 + Math.random() * 20, 50);
  }

  stepStalker(x: number, z: number, heavy: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 9);
    this.tone(out, t, 0.14, 0.3 + heavy * 0.3, "sine", 58 + Math.random() * 14, 34);
    this.noise(out, t, 0.1, 0.12, "lowpass", 500, 1);
  }

  /** the creature's throat — irregular wet clicks over a low growl */
  creatureNear(x: number, z: number, aggressive: boolean): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const { out } = this.spat(x, z, aggressive ? 12 : 8);
    // growl bed
    for (const f of [52, 54.7]) {
      this.tone(out, t, aggressive ? 1.1 : 1.7, 0.09, "sawtooth", f, f * 0.82);
    }
    // vocal-fry clicks
    let tt = t + 0.08;
    const total = aggressive ? 0.9 : 1.5;
    while (tt < t + total) {
      this.noise(out, tt, 0.028, 0.3, "lowpass", 900 + Math.random() * 600, 2);
      this.tone(out, tt, 0.03, 0.18, "sine", 70 + Math.random() * 25);
      tt += (aggressive ? 0.05 : 0.09) + Math.random() * (aggressive ? 0.08 : 0.16);
    }
  }

  /** small electrical pop (a light giving up) */
  pop(x: number, z: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 6);
    this.noise(out, t, 0.05, 0.25, "highpass", 2400);
    this.tone(out, t, 0.07, 0.1, "square", 320, 90);
  }

  drag(x: number, z: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 8);
    this.noise(out, t, 1.4 + Math.random(), 0.12, "bandpass", 420, 4, 260);
  }

  creak(x: number, z: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 7);
    this.noise(out, t, 0.9, 0.18, "bandpass", 900, 14, 380);
    this.tone(out, t + 0.05, 0.7, 0.04, "sawtooth", 310, 240);
  }

  slam(x: number, z: number, big: boolean): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, big ? 14 : 8);
    this.tone(out, t, 0.3, big ? 0.7 : 0.35, "sine", 90, 32);
    this.noise(out, t, 0.18, big ? 0.4 : 0.2, "lowpass", 1400, 1, 300);
    if (big) this.tone(out, t + 0.02, 0.5, 0.1, "square", 174, 130);
  }

  bash(x: number, z: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 12);
    this.tone(out, t, 0.2, 0.55, "sine", 70, 36);
    this.tone(out, t, 0.4, 0.1, "square", 210 + Math.random() * 60, 140);
    this.noise(out, t, 0.12, 0.3, "lowpass", 2000, 1, 400);
  }

  glass(x: number, z: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 12);
    this.noise(out, t, 0.25, 0.4, "highpass", 2600);
    for (let i = 0; i < 6; i++) {
      this.tone(out, t + Math.random() * 0.16, 0.06, 0.1, "sine", 2200 + Math.random() * 3400);
    }
  }

  pickup(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(this.master, t, 0.08, 0.12, "triangle", 660, 880);
    this.noise(this.master, t, 0.04, 0.06, "highpass", 2000);
  }

  fuseClunk(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(this.master, t, 0.12, 0.3, "sine", 120, 60);
    this.tone(this.master, t + 0.12, 0.05, 0.15, "square", 480);
  }

  powerOn(): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.tone(this.master, t, 1.8, 0.25, "sine", 38, 62);
    this.tone(this.master, t + 0.3, 0.08, 0.4, "square", 110);
    this.tone(this.master, t + 0.42, 0.08, 0.3, "square", 95);
    this.noise(this.master, t + 0.5, 2.4, 0.07, "bandpass", 120, 2, 240);
    // rising fluorescent hum
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 100;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 800;
    f.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.045, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.015, t + 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(t + 0.6);
    o.stop(t + 6.2);
  }

  /** unintelligible broadcast voice — AM noise bursts shaped like speech */
  radioVoice(dur = 6): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    g.connect(this.verbSend);
    src.start(t);
    src.stop(t + dur + 0.2);
    // syllable envelope
    let tt = t + 0.2;
    while (tt < t + dur) {
      const syl = 0.07 + Math.random() * 0.13;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, tt + syl * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + syl);
      tt += syl + (Math.random() < 0.25 ? 0.25 + Math.random() * 0.4 : 0.03 + Math.random() * 0.07);
    }
    // carrier whine
    this.tone(this.master, t, dur, 0.012, "sine", 997);
  }

  stinger(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const det of [0, 7, 13, -9]) {
      this.tone(this.master, t, 1.4, 0.07, "sawtooth", 220 + det, 466 + det * 2);
    }
    this.noise(this.master, t, 1.2, 0.16, "bandpass", 800, 1, 4000);
    this.tone(this.master, t, 0.5, 0.3, "sine", 60, 30);
  }

  whisper(x: number, z: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 5);
    this.noise(out, t, 1.6, 0.08, "bandpass", 2400, 3, 1500);
  }

  groanDistant(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(this.master, t, 2.6, 0.08, "sawtooth", 65, 48);
    this.noise(this.master, t + 0.4, 2.2, 0.06, "bandpass", 180, 6, 90);
  }

  killScream(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const det of [0, 11, 23, -13, 31]) {
      this.tone(this.master, t, 1.6, 0.12, "sawtooth", 480 + det * 3, 130);
    }
    this.noise(this.master, t, 1.4, 0.5, "bandpass", 1800, 0.8, 200);
    this.tone(this.master, t, 1.2, 0.5, "sine", 70, 26);
  }

  uiClick(): void {
    if (!this.ready) return;
    this.tone(this.master, this.ctx.currentTime, 0.05, 0.08, "square", 220, 180);
  }

  /** the lift cage descending: a labouring motor whine under a metal rattle */
  liftDescend(): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // motor whine, sags then holds
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(64, t + 0.8);
    o.frequency.linearRampToValueAtTime(58, t + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 340;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 3.5);
    // cage rattle: irregular metallic ticks
    let tt = t + 0.2;
    while (tt < t + 3.1) {
      this.noise(this.master, tt, 0.04, 0.06 + Math.random() * 0.05, "bandpass", 1400 + Math.random() * 1800, 5);
      tt += 0.1 + Math.random() * 0.22;
    }
  }

  /** the cage settling onto its stop — a heavy clunk with a metal ring-off */
  liftClunk(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(this.master, t, 0.34, 0.6, "sine", 96, 30);
    this.noise(this.master, t, 0.16, 0.35, "lowpass", 1200, 1, 220);
    this.tone(this.master, t + 0.02, 0.7, 0.09, "triangle", 320, 250);
    this.tone(this.master, t + 0.03, 0.5, 0.05, "square", 540, 430);
  }
}
