// Sonido 100% sintetizado con Web Audio: disparo con eco de valle, cerrojo, viento,
// pájaros, bramidos de alarma, galope, pasos, latido y respiración.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.birdsMutedUntil = 0;
    this.nextBird = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // Reverberación larga y abierta: el eco de la sierra.
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        const echo = (t > 0.55 && t < 0.62 ? 2.2 : 0) + (t > 1.3 && t < 1.38 ? 1.2 : 0);
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (0.35 + echo);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.5;
    this.reverb.connect(this.reverbGain).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Viento ambiente (ruido marrón filtrado).
    const brown = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }
    const wind = ctx.createBufferSource();
    wind.buffer = brown;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.12;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();
  }

  get ready() {
    return !!this.ctx;
  }

  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  env(gain, t, a, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  out(pan = 0, vol = 1, rev = 0) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.master);
    if (rev > 0) {
      const r = this.ctx.createGain();
      r.gain.value = rev;
      g.connect(r).connect(this.reverb);
    }
    return g;
  }

  shot() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = this.out(0, 1, 1.6);
    // Estallido
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.35);
    const g = ctx.createGain();
    this.env(g, t, 0.002, 1.4, 0.45);
    n.connect(lp).connect(g).connect(dest);
    n.start(t);
    n.stop(t + 0.6);
    // Golpe grave
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const og = ctx.createGain();
    this.env(og, t, 0.003, 1.2, 0.35);
    o.connect(og).connect(dest);
    o.start(t);
    o.stop(t + 0.5);
    this.birdsMutedUntil = t + 25;
  }

  click(t, freq = 2500, vol = 0.35) {
    const ctx = this.ctx;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 3;
    const g = ctx.createGain();
    this.env(g, t, 0.001, vol, 0.05);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.1);
  }

  bolt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.click(t + 0.25, 1800, 0.3);
    this.click(t + 0.38, 3200, 0.35);
    this.click(t + 0.62, 2600, 0.35);
    this.click(t + 0.75, 1500, 0.4);
  }

  reload() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.click(t + 0.2, 1500, 0.3);
    for (let i = 0; i < 4; i++) this.click(t + 0.6 + i * 0.35, 3000, 0.25);
    this.click(t + 2.1, 2200, 0.4);
    this.click(t + 2.3, 1600, 0.4);
  }

  dry() {
    if (!this.ctx) return;
    this.click(this.ctx.currentTime, 4000, 0.3);
  }

  zoomTick() {
    if (!this.ctx) return;
    this.click(this.ctx.currentTime, 5000, 0.12);
  }

  // Impacto en carne: llega con el retraso del sonido.
  thud(delay, dist) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const vol = Math.min(0.9, 30 / (dist + 20));
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    const g = ctx.createGain();
    this.env(g, t, 0.004, vol, 0.2);
    o.connect(g).connect(this.out(0, 1, 0.4));
    o.start(t);
    o.stop(t + 0.3);
  }

  ricochet(delay, dist, pan) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const vol = Math.min(0.4, 18 / (dist + 20));
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    const g = ctx.createGain();
    this.env(g, t, 0.005, vol * 0.4, 0.4);
    o.connect(g).connect(this.out(pan, 1, 0.5));
    o.start(t);
    o.stop(t + 0.5);
  }

  alarmCall(species, dist, pan) {
    if (!this.ctx || dist > 350) return;
    const ctx = this.ctx, t = ctx.currentTime + dist / 343;
    const vol = Math.min(0.5, 25 / (dist + 15));
    const dest = this.out(pan, vol, 0.6);
    if (species === 'jabali') {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(95, t);
      o.frequency.linearRampToValueAtTime(70, t + 0.35);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const g = ctx.createGain();
      this.env(g, t, 0.02, 0.8, 0.35);
      o.connect(f).connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.45);
      return;
    }
    // Ladrido de alarma de cérvidos / zorro: dos golpes cortos.
    const base = species === 'zorro' ? 700 : species === 'corzo' ? 520 : 360;
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.45;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, tt);
      o.frequency.exponentialRampToValueAtTime(base * 0.55, tt + 0.18);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = base * 2.2;
      f.Q.value = 1.5;
      const g = ctx.createGain();
      this.env(g, tt, 0.01, 0.9, 0.2);
      o.connect(f).connect(g).connect(dest);
      o.start(tt);
      o.stop(tt + 0.3);
    }
  }

  // Bramido de ciervo en celo: gruñido grave y largo, con eco en el valle.
  roar(dist, pan) {
    if (!this.ctx || dist > 900) return;
    const ctx = this.ctx, t = ctx.currentTime + dist / 343;
    const vol = Math.min(0.6, 60 / (dist + 40));
    const dest = this.out(pan, vol, 0.9);
    const groans = 1 + Math.floor(Math.random() * 3);
    let tt = t;
    for (let i = 0; i < groans; i++) {
      const len = 1.1 + Math.random() * 0.9;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = 95 + Math.random() * 25;
      o.frequency.setValueAtTime(f0 * 0.85, tt);
      o.frequency.linearRampToValueAtTime(f0 * 1.25, tt + len * 0.35);
      o.frequency.linearRampToValueAtTime(f0 * 0.7, tt + len);
      const vib = ctx.createOscillator();
      vib.frequency.value = 7 + Math.random() * 3;
      const vibG = ctx.createGain();
      vibG.gain.value = 6;
      vib.connect(vibG).connect(o.frequency);
      // Dos formantes: suena a garganta, no a sirena.
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 420;
      f1.Q.value = 2.5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1100;
      f2.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(1.2, tt + 0.25);
      g.gain.setValueAtTime(1.2, tt + len * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + len);
      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      o.connect(f1).connect(g);
      o.connect(f2).connect(g2).connect(g);
      g.connect(dest);
      o.start(tt);
      vib.start(tt);
      o.stop(tt + len + 0.05);
      vib.stop(tt + len + 0.05);
      tt += len + 0.35 + Math.random() * 0.4;
    }
  }

  // Aullido de lobo, lejano y con mucho eco.
  howl(dist, pan) {
    if (!this.ctx || dist > 1200) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.min(dist / 343, 2);
    const vol = Math.min(0.35, 70 / (dist + 80));
    const dest = this.out(pan, vol, 1.4);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 380 + Math.random() * 60;
    o.frequency.setValueAtTime(f * 0.75, t);
    o.frequency.linearRampToValueAtTime(f * 1.3, t + 0.9);
    o.frequency.setValueAtTime(f * 1.3, t + 2.2);
    o.frequency.linearRampToValueAtTime(f * 0.8, t + 3.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 7;
    vib.connect(vg).connect(o.frequency);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.6);
    g.gain.setValueAtTime(1, t + 2.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(dest);
    for (const n of [o, o2, vib]) {
      n.start(t);
      n.stop(t + 3.6);
    }
  }

  step(vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500 + Math.random() * 400;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    this.env(g, t, 0.01, vol, 0.12);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  }

  heartbeat(vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, v] of [[0, 1], [0.16, 0.7]]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(58, t + dt);
      o.frequency.exponentialRampToValueAtTime(35, t + dt + 0.12);
      const g = ctx.createGain();
      this.env(g, t + dt, 0.01, vol * v, 0.14);
      o.connect(g).connect(this.master);
      o.start(t + dt);
      o.stop(t + dt + 0.2);
    }
  }

  breath(inhale) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = inhale ? 1400 : 900;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + (inhale ? 0.35 : 0.15));
    g.gain.linearRampToValueAtTime(0.0001, t + (inhale ? 0.6 : 0.7));
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.8);
  }

  chirp() {
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = this.out(Math.random() * 1.6 - 0.8, 0.05 + Math.random() * 0.06, 0.3);
    const notes = 2 + Math.floor(Math.random() * 5);
    const base = 2200 + Math.random() * 2200;
    for (let i = 0; i < notes; i++) {
      const tt = t + i * (0.09 + Math.random() * 0.08);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), tt);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), tt + 0.06);
      const g = ctx.createGain();
      this.env(g, tt, 0.005, 1, 0.07);
      o.connect(g).connect(dest);
      o.start(tt);
      o.stop(tt + 0.12);
    }
  }

  update(windSpeed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.05 + windSpeed * 0.025, t, 1);
    this.windFilter.frequency.setTargetAtTime(300 + windSpeed * 70, t, 1);
    if (t > this.nextBird) {
      this.nextBird = t + 0.8 + Math.random() * 4;
      if (t > this.birdsMutedUntil) this.chirp();
    }
  }
}
