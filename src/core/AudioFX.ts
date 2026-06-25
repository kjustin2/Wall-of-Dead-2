/**
 * Fully procedural WebAudio sound engine. No audio files.
 *
 * Signal flow:
 *   ambientBus ┐
 *   creatureBus┼─► duckBus ─┐
 *              │            ├─► master ─► outGain(pause-duck) ─► pauseLP ─► limiter ─► out
 *   voiceBus  ─┼────────────┘            ▲
 *   sfxBus    ─┘                         │
 *   (any source) ─► verbSend ─► convolution reverb ─┘
 *
 * Per-category buses let the player balance the mix (Options) and let dialogue
 * duck the ambient + creature layers so story beats stay intelligible. One-shots
 * are spatialized (inverse-square gain + stereo pan + distance low-pass) against
 * the listener pose captured at trigger time. The reverb is a real ConvolverNode
 * fed a *synthesized* impulse response — a concrete-bunker tail, still zero files.
 *
 * The only non-synthesized layer is the optional CC0 score + sampled stinger streamed
 * from public/ (see audio-manifest.ts): a `musicBus` carries a looping act-cued track,
 * and the stinger/footsteps layer real samples *over* the synth. All of it degrades
 * gracefully to procedural-only if the files are missing — nothing here requires them.
 */
import { MUSIC, SAMPLES } from "./audio-manifest";

export type AudioBus = "ambient" | "creature" | "voice" | "sfx" | "music";

export class AudioFX {
  private ctx!: AudioContext;
  private master!: GainNode;
  private outGain!: GainNode;             // pause duck — independent of user volume
  private pauseLP!: BiquadFilterNode;     // muffles the mix while the menu is up
  private comp!: DynamicsCompressorNode;  // master limiter — stacked one-shots can't clip
  private verbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private ready = false;
  private vol = 1; // user master-volume multiplier (Options → MASTER VOLUME)
  private static readonly BASE_GAIN = 0.85;

  // per-category mix buses + their user-volume multipliers
  private ambientBus!: GainNode;
  private creatureBus!: GainNode;
  private voiceBus!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;            // looping CC0 score (act-cued)
  private duckBus!: GainNode;             // ambient+creature+music dip under dialogue
  private busVol: Record<AudioBus, number> = { ambient: 1, creature: 1, voice: 1, sfx: 1, music: 1 };
  private duckUntil = 0;                  // ctx time the dialogue duck releases

  // optional CC0 samples (decoded at init; absent = procedural-only fallback)
  private samples: Partial<Record<string, AudioBuffer>> = {};
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicName = "";

  // listener
  private lx = 0;
  private lz = 0;
  private lyaw = 0;

  // continuous layers
  private droneGain!: GainNode;
  private breathGain!: GainNode;
  private airFilter!: BiquadFilterNode;   // ambient "air" band — opens up with dread
  private tensionGain!: GainNode;         // dissonant riser, swells with threat
  private breathPhase = 0;
  private beatTimer = 0;
  private chaseKick = 0;
  private dripTimer = 2;
  private threatSmooth = 0;
  private stepParity = 0;                 // alternate the footstep timbre L/R

  init(): void {
    if (this.ready) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = AudioFX.BASE_GAIN * this.vol;
    // output bus: master -> duck -> pause-muffle -> limiter -> speakers. The limiter
    // catches the peaks when a stinger, a kill-scream and the chase pulse all land
    // together (which used to clip hard); the duck + lowpass soften the mix when paused.
    this.outGain = ctx.createGain();
    this.outGain.gain.value = 1;
    this.pauseLP = ctx.createBiquadFilter();
    this.pauseLP.type = "lowpass";
    this.pauseLP.frequency.value = 22000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 3.4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;
    this.master.connect(this.outGain);
    this.outGain.connect(this.pauseLP);
    this.pauseLP.connect(this.comp);
    this.comp.connect(ctx.destination);

    // category buses → (duck) → master
    this.duckBus = ctx.createGain();
    this.duckBus.gain.value = 1;
    this.duckBus.connect(this.master);
    this.ambientBus = ctx.createGain();
    this.creatureBus = ctx.createGain();
    this.voiceBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambientBus.gain.value = this.busVol.ambient;
    this.creatureBus.gain.value = this.busVol.creature;
    this.voiceBus.gain.value = this.busVol.voice;
    this.sfxBus.gain.value = this.busVol.sfx;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.busVol.music;
    this.ambientBus.connect(this.duckBus);   // ambient + creature + music dip under dialogue
    this.creatureBus.connect(this.duckBus);
    this.musicBus.connect(this.duckBus);
    this.voiceBus.connect(this.master);      // voice + sfx stay at full level
    this.sfxBus.connect(this.master);

    // shared noise buffer (brown-ish)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b = (b + 0.02 * w) / 1.02;
      data[i] = w * 0.5 + b * 2.2;
    }

    // convolution reverb: a synthesized concrete-bunker impulse response. A real
    // ConvolverNode gives a far more convincing "underground" space than the old
    // single feedback delay, and it's still 100% generated (no files).
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(1.9, 2.6, 0.22);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    conv.connect(wet);
    wet.connect(this.master);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 1;
    this.verbSend.connect(conv);

    this.ready = true;
    void ctx.resume();
    this.startAmbient();
    void this.loadSamples(); // async, non-blocking — synth plays meanwhile
  }

  /** decode the optional CC0 clips into buffers; failures are silently ignored so
   *  the procedural path remains the guaranteed fallback */
  private async loadSamples(): Promise<void> {
    const load = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    };
    for (const [key, url] of Object.entries({ ...MUSIC, ...SAMPLES })) {
      const b = await load(url);
      if (b) this.samples[key] = b;
    }
    // a track requested before its buffer finished loading starts now
    if (this.musicName && !this.musicSrc && this.samples[this.musicName]) {
      const n = this.musicName;
      this.musicName = "";
      this.playMusic(n);
    }
  }

  /** start a looping score track on the music bus, crossfading from the current one.
   *  No-op (synth bed continues) until the track's buffer is loaded. */
  playMusic(name: string, vol = 0.5): void {
    if (!this.ready) return;
    if (name === this.musicName && this.musicSrc) return; // already playing it
    this.musicName = name;
    const buf = this.samples[name];
    if (!buf) return; // not loaded yet — loadSamples() will start it when ready
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.musicSrc && this.musicGain) {            // fade out the outgoing track
      const oldG = this.musicGain, oldS = this.musicSrc;
      oldG.gain.cancelScheduledValues(t);
      oldG.gain.setTargetAtTime(0, t, 0.8);
      try { oldS.stop(t + 3); } catch { /* already stopped */ }
    }
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(vol, t, 1.2);              // slow fade-in
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    g.connect(this.musicBus);
    src.start(t);
    this.musicSrc = src;
    this.musicGain = g;
  }

  stopMusic(): void {
    if (!this.ready || !this.musicSrc || !this.musicGain) { this.musicName = ""; return; }
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(0, t, 1.0);
    try { this.musicSrc.stop(t + 4); } catch { /* already stopped */ }
    this.musicSrc = null;
    this.musicGain = null;
    this.musicName = "";
  }

  /** play a decoded sample on a bus at a given gain (used to layer over the synth) */
  private playSample(name: string, gain: number, bus: AudioBus = "sfx", rate = 1): void {
    const buf = this.samples[name];
    if (!buf) return;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(g);
    g.connect(this.bus(bus));
    src.start(this.ctx.currentTime);
  }

  /** synthesize a stereo impulse response: decaying, low-passed noise = a dark room tail */
  private makeImpulse(seconds: number, decay: number, color: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const n = Math.max(1, Math.floor(rate * seconds));
    const buf = this.ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const env = (1 - i / n) ** decay;
        const white = Math.random() * 2 - 1;
        lp += (white - lp) * color;     // one-pole LP → a darker, concrete tail
        d[i] = lp * env;
      }
    }
    return buf;
  }

  private bus(name: AudioBus): GainNode {
    return name === "ambient" ? this.ambientBus
      : name === "creature" ? this.creatureBus
      : name === "voice" ? this.voiceBus
      : name === "music" ? this.musicBus
      : this.sfxBus;
  }

  /** master volume, 0..1 — safe to call before init(); applied when ready */
  setVolume(v: number): void {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.ready) this.master.gain.value = AudioFX.BASE_GAIN * this.vol;
  }

  getVolume(): number {
    return this.vol;
  }

  /** per-category volume, 0..1 (Options → AMBIENCE / CREATURE / VOICE) */
  setBusVolume(name: AudioBus, v: number): void {
    const val = Math.max(0, Math.min(1, v));
    this.busVol[name] = val;
    if (this.ready) this.bus(name).gain.value = val;
  }

  getBusVolume(name: AudioBus): number {
    return this.busVol[name];
  }

  /** muffle + duck the whole mix while the pause menu is up; un-duck on resume */
  setPaused(on: boolean): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.pauseLP.frequency.cancelScheduledValues(t);
    this.pauseLP.frequency.setTargetAtTime(on ? 460 : 22000, t, 0.06);
    this.outGain.gain.cancelScheduledValues(t);
    this.outGain.gain.setTargetAtTime(on ? 0.4 : 1, t, 0.06);
  }

  /** stop the audio clock when the tab is hidden (no CPU, no ambient droning into a
   *  backgrounded window); resume() restarts it when the tab returns */
  suspend(): void {
    if (this.ready && this.ctx.state === "running") void this.ctx.suspend();
  }
  resume(): void {
    if (this.ready && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setListener(x: number, z: number, yaw: number): void {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  // ---------- helpers ----------

  /** spatialize a source: inverse-square gain, stereo pan, and a distance low-pass
   *  so far sounds lose their highs (a creature across the level is felt, not heard
   *  in crisp detail). Routes to `busName` (sfx by default). */
  private spat(x: number, z: number, refDist = 6, busName: AudioBus = "sfx"): { out: GainNode; d: number } {
    const ctx = this.ctx;
    const dx = x - this.lx;
    const dz = z - this.lz;
    const d = Math.hypot(dx, dz);
    // pan: project onto listener right vector
    const rx = Math.cos(this.lyaw);
    const rz = -Math.sin(this.lyaw);
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    const g = ctx.createGain();
    // inverse-square-ish falloff (gentler than pure 1/d² so distant cues stay audible)
    g.gain.value = (refDist * refDist) / (refDist * refDist + d * d);
    // distance low-pass: full band up close, muffled far away
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(700, 18000 - d * d * 24);
    const p = ctx.createStereoPanner();
    p.pan.value = pan * 0.8;
    g.connect(lp);
    lp.connect(p);
    p.connect(this.bus(busName));
    const send = ctx.createGain();
    send.gain.value = 0.5;
    lp.connect(send);
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
    this.droneGain.connect(this.ambientBus);

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
    // air: looping filtered noise (the band center rides up with dread in update())
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = "bandpass";
    this.airFilter.frequency.value = 320;
    this.airFilter.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    src.connect(this.airFilter);
    this.airFilter.connect(g);
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

    // tension riser: a low tone and a tritone partner, normally silent, swelling in
    // with threat for a dread that builds as the creature closes (driven in update())
    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionGain.connect(this.ambientBus);
    for (const f of [41, 58]) { // ~tritone — uneasy, never resolves
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const tf = ctx.createBiquadFilter();
      tf.type = "lowpass";
      tf.frequency.value = 180;
      const tg = ctx.createGain();
      tg.gain.value = 0.5;
      o.connect(tf); tf.connect(tg); tg.connect(this.tensionGain);
      o.start(t);
    }

    // player breath layer (driven by threat in update)
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    this.breathGain.connect(this.ambientBus);
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

  /** drive heartbeat / chase pulse / threat mix; call every frame */
  update(dt: number, threat: number, chase: boolean): void {
    if (!this.ready) return;
    const ctx = this.ctx;

    // smoothed threat drives the dread mix (drone air + tension riser)
    this.threatSmooth += (threat - this.threatSmooth) * Math.min(1, 2.5 * dt);
    const th = this.threatSmooth;
    // the ambient air band opens up as dread rises (more hiss/anxiety)
    this.airFilter.frequency.value += (320 + th * 1100 - this.airFilter.frequency.value) * Math.min(1, 3 * dt);
    // the dissonant riser swells in with threat (and harder during a chase)
    const tensionTarget = Math.max(0, th - 0.25) * 0.09 + (chase ? 0.05 : 0);
    this.tensionGain.gain.value += (tensionTarget - this.tensionGain.gain.value) * Math.min(1, 2 * dt);

    // heartbeat
    if (threat > 0.12) {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        const interval = 1.35 - threat * 0.9;
        this.beatTimer = interval;
        const t = ctx.currentTime;
        const vol = 0.10 + threat * 0.22;
        this.tone(this.ambientBus, t, 0.12, vol, "sine", 58, 38);
        this.tone(this.ambientBus, t + interval * 0.28, 0.1, vol * 0.7, "sine", 52, 36);
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
        this.tone(this.ambientBus, t, 0.16, 0.22, "sine", 92, 34);
        this.noise(this.ambientBus, t, 0.07, 0.07, "highpass", 3000);
        if (Math.random() < 0.22) this.tone(this.ambientBus, t + 0.1, 0.5, 0.05, "sawtooth", 622, 590);
      }
    }

    // ragged breathing as threat rises
    if (this.breathGain) {
      const b = Math.max(0, threat - 0.45) / 0.55;
      this.breathPhase += dt * (2.1 + b * 1.6);
      const cycle = Math.max(0, Math.sin(this.breathPhase)) ** 2;
      this.breathGain.gain.value = b * 0.05 * (0.25 + 0.75 * cycle);
    }

    // occasional drips (environmental → sfx bus, spatialized)
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

  /** dip the ambient + creature layers so dialogue cuts through, then release */
  private duckForVoice(dur: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.duckUntil = Math.max(this.duckUntil, t + dur);
    this.duckBus.gain.cancelScheduledValues(t);
    this.duckBus.gain.setTargetAtTime(0.5, t, 0.12);
    this.duckBus.gain.setTargetAtTime(1, this.duckUntil, 0.4);
  }

  // ---------- one-shots ----------

  stepPlayer(speedFrac: number, crouched: boolean): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const vol = crouched ? 0.03 : 0.05 + speedFrac * 0.1;
    // alternate the timbre L/R + jitter so a run doesn't machine-gun one sample
    this.stepParity ^= 1;
    const heelF = (this.stepParity ? 240 : 300) + Math.random() * 240;
    const thudF = (this.stepParity ? 72 : 84) + Math.random() * 22;
    this.noise(this.sfxBus, t, 0.07 + speedFrac * 0.04, vol, "bandpass", heelF, 1.2);
    this.tone(this.sfxBus, t, 0.06, vol * 0.8, "sine", thudF, 48);
    // grit on faster steps: a real CC0 metal-on-concrete footstep layered over the
    // synth when loaded (varied pitch so it never machine-guns), else a synth scuff
    if (!crouched && speedFrac > 0.3 && Math.random() < 0.5) {
      if (this.samples.step1) {
        this.playSample("step" + (1 + ((Math.random() * 4) | 0)), 0.13 + speedFrac * 0.1, "sfx", 0.92 + Math.random() * 0.16);
      } else {
        this.noise(this.sfxBus, t + 0.02, 0.05, vol * 0.5, "highpass", 1800 + Math.random() * 1200);
      }
    }
  }

  stepStalker(x: number, z: number, heavy: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 9, "creature");
    this.tone(out, t, 0.14, 0.3 + heavy * 0.3, "sine", 58 + Math.random() * 14, 34);
    this.noise(out, t, 0.1, 0.12, "lowpass", 500, 1);
  }

  /** the creature's throat — irregular wet clicks over a low growl */
  creatureNear(x: number, z: number, aggressive: boolean): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const { out } = this.spat(x, z, aggressive ? 12 : 8, "creature");
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
    const { out } = this.spat(x, z, 8, "creature");
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
    const { out } = this.spat(x, z, 12, "creature");
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
    this.tone(this.sfxBus, t, 0.08, 0.12, "triangle", 660, 880);
    this.noise(this.sfxBus, t, 0.04, 0.06, "highpass", 2000);
  }

  fuseClunk(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfxBus, t, 0.12, 0.3, "sine", 120, 60);
    this.tone(this.sfxBus, t + 0.12, 0.05, 0.15, "square", 480);
  }

  powerOn(): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.tone(this.sfxBus, t, 1.8, 0.25, "sine", 38, 62);
    this.tone(this.sfxBus, t + 0.3, 0.08, 0.4, "square", 110);
    this.tone(this.sfxBus, t + 0.42, 0.08, 0.3, "square", 95);
    this.noise(this.sfxBus, t + 0.5, 2.4, 0.07, "bandpass", 120, 2, 240);
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
    g.connect(this.sfxBus);
    o.start(t + 0.6);
    o.stop(t + 6.2);
  }

  /** unintelligible broadcast voice — AM noise bursts shaped like speech */
  radioVoice(dur = 6): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.duckForVoice(dur); // pull the ambient + creature layers down so it reads
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
    g.connect(this.voiceBus);
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
    this.tone(this.voiceBus, t, dur, 0.012, "sine", 997);
  }

  stinger(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // a sharp scare sting (sfx bus → punches through dialogue ducking).
    // Layer the CC0 metal-impact sample for a sharper transient when it's loaded,
    // under a beefier synth body + deep sub-boom for cinematic weight.
    this.playSample("stinger", 0.9, "sfx");
    for (const det of [0, 7, 13, -9]) {
      this.tone(this.sfxBus, t, 1.4, 0.07, "sawtooth", 220 + det, 466 + det * 2);
    }
    this.noise(this.sfxBus, t, 1.2, 0.16, "bandpass", 800, 1, 4000);
    this.tone(this.sfxBus, t, 0.5, 0.3, "sine", 60, 30);
    this.tone(this.sfxBus, t, 0.7, 0.32, "sine", 64, 24); // sub-boom — the floor drops out
  }

  whisper(x: number, z: number): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { out } = this.spat(x, z, 5, "creature");
    this.noise(out, t, 1.6, 0.08, "bandpass", 2400, 3, 1500);
  }

  groanDistant(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(this.creatureBus, t, 2.6, 0.08, "sawtooth", 65, 48);
    this.noise(this.creatureBus, t + 0.4, 2.2, 0.06, "bandpass", 180, 6, 90);
  }

  killScream(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const det of [0, 11, 23, -13, 31]) {
      this.tone(this.creatureBus, t, 1.6, 0.12, "sawtooth", 480 + det * 3, 130);
    }
    this.noise(this.creatureBus, t, 1.4, 0.5, "bandpass", 1800, 0.8, 200);
    this.tone(this.creatureBus, t, 1.2, 0.5, "sine", 70, 26);
  }

  uiClick(): void {
    if (!this.ready) return;
    this.tone(this.sfxBus, this.ctx.currentTime, 0.05, 0.08, "square", 220, 180);
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
    o.connect(lp); lp.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 3.5);
    // cage rattle: irregular metallic ticks
    let tt = t + 0.2;
    while (tt < t + 3.1) {
      this.noise(this.sfxBus, tt, 0.04, 0.06 + Math.random() * 0.05, "bandpass", 1400 + Math.random() * 1800, 5);
      tt += 0.1 + Math.random() * 0.22;
    }
  }

  /** the cage settling onto its stop — a heavy clunk with a metal ring-off */
  liftClunk(): void {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfxBus, t, 0.34, 0.6, "sine", 96, 30);
    this.noise(this.sfxBus, t, 0.16, 0.35, "lowpass", 1200, 1, 220);
    this.tone(this.sfxBus, t + 0.02, 0.7, 0.09, "triangle", 320, 250);
    this.tone(this.sfxBus, t + 0.03, 0.5, 0.05, "square", 540, 430);
  }
}
