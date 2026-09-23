/**
 * Fully synthesised sound — no audio files, no downloads.
 *
 * Everything is built from oscillators and one shared noise buffer, so the
 * whole soundtrack costs a couple of kilobytes of code and starts instantly.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let ambientStarted = false;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noise(c: AudioContext) {
  if (!noiseBuf) {
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

export function setMuted(next: boolean) {
  muted = next;
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.85, ctx.currentTime, 0.08);
}

/** Call from a user gesture so the browser lets us make noise at all. */
export function unlockAudio() {
  ac();
}

/* ── one-shots ───────────────────────────────────────────────────────────── */

function blip(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

export const sfx = {
  hover() {
    blip(880, 0.05, "square", 0.03);
  },
  click() {
    blip(420, 0.09, "square", 0.06, 220);
  },
  back() {
    blip(300, 0.1, "square", 0.05, -120);
  },
  /** the ping when a graffiti spot comes into range */
  spotFound() {
    blip(660, 0.12, "triangle", 0.05);
    setTimeout(() => blip(990, 0.16, "triangle", 0.045), 90);
  },
  /** aerosol hiss — noise through a swept band-pass, plus the ball rattle */
  spray(duration = 1.1) {
    const c = ac();
    if (!c || !master) return;
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1800, c.currentTime);
    bp.frequency.exponentialRampToValueAtTime(5200, c.currentTime + duration * 0.6);
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.16, c.currentTime + 0.06);
    g.gain.setValueAtTime(0.16, c.currentTime + duration * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    src.connect(bp).connect(g).connect(master);
    src.start();
    src.stop(c.currentTime + duration + 0.05);
    // the ball bearing
    for (let i = 0; i < 5; i++) {
      setTimeout(() => blip(140 + Math.random() * 120, 0.04, "square", 0.035), i * 70);
    }
  },
  /**
   * A phone ringing: two warbling bursts. Scheduled on the audio clock rather
   * than with timers, because it plays while the city is being built and the
   * main thread is busy — a setTimeout for the second burst would land late.
   */
  ring() {
    const c = ac();
    if (!c || !master) return;
    const t0 = c.currentTime + 0.05;
    for (const at of [0, 0.42]) {
      for (const freq of [440, 480]) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t0 + at);
        g.gain.linearRampToValueAtTime(0.035, t0 + at + 0.02);
        g.gain.setValueAtTime(0.035, t0 + at + 0.3);
        g.gain.linearRampToValueAtTime(0, t0 + at + 0.34);
        o.connect(g).connect(master);
        o.start(t0 + at);
        o.stop(t0 + at + 0.36);
      }
    }
  },
  /** one short burst of can — a single frame of the time-lapse landing */
  psst() {
    const c = ac();
    if (!c || !master) return;
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200 + Math.random() * 2600;
    bp.Q.value = 1.4;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp).connect(g).connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.11);
  },
  /** the reward sting after a piece lands on the wall */
  confirm() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => setTimeout(() => blip(n, 0.35, "triangle", 0.07), i * 85));
  },
  /** a new rank: a kick drum under a rising stab, a notch bigger than a piece landing */
  rankUp() {
    blip(70, 0.32, "sine", 0.22, -40);
    const notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, i) =>
      setTimeout(() => {
        blip(n, 0.4, "sawtooth", 0.035);
        blip(n / 2, 0.3, "triangle", 0.05);
      }, 60 + i * 70),
    );
  },
  /** pistol: a noise crack through a fast-decaying low-pass, plus a body thump */
  gunshot() {
    const c = ac();
    if (!c || !master) return;
    const src = noise(c);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(5200, c.currentTime);
    lp.frequency.exponentialRampToValueAtTime(420, c.currentTime + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0.34, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22);
    src.connect(lp).connect(g).connect(master);
    src.start();
    src.stop(c.currentTime + 0.25);
    blip(90, 0.14, "sine", 0.18, -50);
  },
  dryFire() {
    blip(1400, 0.03, "square", 0.05);
  },
  reload() {
    blip(320, 0.05, "square", 0.05);
    setTimeout(() => blip(220, 0.06, "square", 0.05), 620);
    setTimeout(() => blip(520, 0.05, "square", 0.05), 1180);
  },
  holster(out: boolean) {
    blip(out ? 520 : 300, 0.09, "triangle", 0.05, out ? 180 : -140);
  },
  hurt() {
    blip(180, 0.2, "sawtooth", 0.09, -90);
  },
  wasted() {
    const notes = [392, 311.13, 261.63, 196];
    notes.forEach((n, i) => setTimeout(() => blip(n, 0.7, "sawtooth", 0.09), i * 220));
  },
  /** air past the lens — the tour camera climbing out over the roofs */
  whoosh(duration = 2.4) {
    const c = ac();
    if (!c || !master) return;
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.7;
    const t = c.currentTime;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + duration * 0.45);
    bp.frequency.exponentialRampToValueAtTime(320, t + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + duration * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(bp).connect(g).connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
  },
  footstep(running: boolean) {
    const c = ac();
    if (!c || !master) return;
    const src = noise(c);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = running ? 900 : 620;
    const g = c.createGain();
    const amp = running ? 0.05 : 0.03;
    g.gain.setValueAtTime(amp, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
    src.connect(lp).connect(g).connect(master);
    src.start();
    src.stop(c.currentTime + 0.12);
  },
};

/* ── the victory lap's soundtrack ─────────────────────────────────────────── */

/**
 * Four bars of synthwave on a loop, for as long as the city tour flies: a
 * detuned pad on Am–F–C–G, a pulsing bass, a soft kick and a hat. Scheduled a
 * little ahead on the audio clock (not on timers, which the flight's frame
 * work would push around), faded in, and faded out by the function it returns.
 */
export function startTourMusic(): () => void {
  const c = ac();
  if (!c || !master) return () => {};
  const bus = c.createGain();
  bus.gain.setValueAtTime(0.0001, c.currentTime);
  bus.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.2);
  bus.connect(master);

  const BEAT = 60 / 104;
  const BAR = BEAT * 4;
  const CHORDS = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [261.63, 329.63, 392],
    [196, 246.94, 293.66],
  ];
  const start = c.currentTime + 0.08;
  let scheduled = 0; // bars scheduled so far

  const pad = (freqs: number[], at: number) => {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700, at);
    lp.frequency.linearRampToValueAtTime(1500, at + BAR * 0.6);
    lp.frequency.linearRampToValueAtTime(800, at + BAR);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.022, at + 0.35);
    g.gain.setValueAtTime(0.022, at + BAR - 0.25);
    g.gain.linearRampToValueAtTime(0.0001, at + BAR + 0.1);
    lp.connect(g).connect(bus);
    for (const f of freqs) {
      for (const detune of [-7, 7]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = detune;
        o.connect(lp);
        o.start(at);
        o.stop(at + BAR + 0.15);
      }
    }
  };
  const bass = (f: number, at: number) => {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = f / 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.09, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + BEAT * 0.45);
    o.connect(g).connect(bus);
    o.start(at);
    o.stop(at + BEAT * 0.5);
  };
  const kick = (at: number) => {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(130, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0.16, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g).connect(bus);
    o.start(at);
    o.stop(at + 0.24);
  };
  const hat = (at: number) => {
    const n = noise(c);
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.022, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    n.connect(hp).connect(g).connect(bus);
    n.start(at, Math.random());
    n.stop(at + 0.06);
  };

  const scheduleBar = (i: number) => {
    const at = start + i * BAR;
    const chord = CHORDS[i % CHORDS.length];
    pad(chord, at);
    for (let b = 0; b < 4; b++) {
      const beat = at + b * BEAT;
      kick(beat);
      hat(beat + BEAT / 2);
      bass(chord[0], beat);
      bass(chord[0], beat + BEAT / 2);
    }
  };

  const pump = () => {
    // keep a bar and a half queued up
    while (start + scheduled * BAR < c.currentTime + BAR * 1.5) scheduleBar(scheduled++);
  };
  pump();
  const timer = window.setInterval(pump, 250);

  return () => {
    window.clearInterval(timer);
    const t = c.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    window.setTimeout(() => bus.disconnect(), 1400);
  };
}

/* ── the city, humming ───────────────────────────────────────────────────── */

export function startAmbience() {
  const c = ac();
  if (!c || !master || ambientStarted) return;
  ambientStarted = true;

  // distant traffic: filtered noise bed
  const src = noise(c);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 340;
  const bed = c.createGain();
  bed.gain.value = 0.045;
  src.connect(lp).connect(bed).connect(master);
  src.start();

  // slow swell so it never sits still
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.06;
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain).connect(bed.gain);
  lfo.start();

  // a low electrical drone from the street lights
  const drone = c.createOscillator();
  const dg = c.createGain();
  drone.type = "sawtooth";
  drone.frequency.value = 55;
  const dlp = c.createBiquadFilter();
  dlp.type = "lowpass";
  dlp.frequency.value = 160;
  dg.gain.value = 0.018;
  drone.connect(dlp).connect(dg).connect(master);
  drone.start();

  // the occasional car passing a block away
  const passBy = () => {
    if (!ctx || !master) return;
    const n = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(220, ctx.currentTime);
    f.frequency.linearRampToValueAtTime(90, ctx.currentTime + 3.2);
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.4);
    n.connect(f).connect(g).connect(master);
    n.start();
    n.stop(ctx.currentTime + 3.5);
    setTimeout(passBy, 7000 + Math.random() * 14000);
  };
  setTimeout(passBy, 4000);
}
