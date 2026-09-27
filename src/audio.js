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
    this.master.gain.value = 0.7;
    // Limitador final: pase lo que pase, la salida nunca satura.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.master.connect(this.limiter).connect(ctx.destination);
    this.slots = [];
    // Todo pasa por un compresor suave: los disparos pegan fuerte sin saturar y lo lejano se oye.
    this.bus = ctx.createDynamicsCompressor();
    this.bus.threshold.value = -16;
    this.bus.knee.value = 10;
    this.bus.ratio.value = 2.5;
    this.bus.attack.value = 0.006;
    this.bus.release.value = 0.35;
    this.bus.connect(this.master);
    this.listener = { x: 0, y: 0, z: 0 };

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
    this.reverb.connect(this.reverbGain).connect(this.bus);

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
    wind.connect(this.windFilter).connect(this.windGain).connect(this.bus);
    wind.start();
    this.initWater();
    this.loadRecordings();
  }

  // ---------- Grabaciones reales (opcionales) ----------
  // assets/sounds/manifest.json -> { "ciervo": ["berrea1.mp3", "berrea2.mp3"], "perdiz": "perdiz.ogg", "agua": "orilla.mp3" }
  // Si una especie tiene grabaciones, suenan ellas (con pequeñas variaciones); si no, la voz sintetizada.
  async loadRecordings() {
    this.rec = {};
    let manifest;
    try {
      const r = await fetch('assets/sounds/manifest.json');
      if (!r.ok) return;
      manifest = await r.json();
    } catch {
      return;
    }
    await Promise.all(Object.entries(manifest).map(async ([key, files]) => {
      const list = [];
      for (const f of [].concat(files)) {
        try {
          const data = await (await fetch('assets/sounds/' + f)).arrayBuffer();
          list.push(await this.ctx.decodeAudioData(data));
        } catch {
          /* archivo que falta o que no se puede leer: se ignora */
        }
      }
      if (list.length) this.rec[key] = list;
    }));
    if (this.rec.agua) this.useWaterRecording(this.rec.agua[0]);
  }

  playRec(key, x, y, z, vol = 1) {
    const list = this.rec && this.rec[key];
    if (!list) return false;
    const d = this.distTo(x, y, z);
    const src = this.ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    src.connect(this.at(x, y, z, vol, 0.45));
    src.start(this.ctx.currentTime + Math.min(3, d / 343));
    return true;
  }

  useWaterRecording(buf) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 1.6;
    src.connect(g).connect(this.waterOut);
    src.start();
    // La ola sintetizada se retira: manda la grabación.
    this.waterWave.disconnect();
    this.waterWave = { gain: { setTargetAtTime() {} } };
  }

  // Si el navegador suspende el audio (cambio de pestaña, ahorro de energía), se reanuda.
  wake() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
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
    g.connect(p).connect(this.bus);
    if (rev > 0) {
      const r = this.ctx.createGain();
      r.gain.value = rev;
      g.connect(r).connect(this.reverb);
    }
    return g;
  }

  shot(shotgun = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = this.out(0, shotgun ? 0.85 : 1, shotgun ? 1.2 : 1.6);
    // Estallido
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(shotgun ? 8000 : 6000, t);
    lp.frequency.exponentialRampToValueAtTime(shotgun ? 500 : 300, t + (shotgun ? 0.25 : 0.35));
    const g = ctx.createGain();
    this.env(g, t, 0.002, 1.0, 0.45);
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
    n.connect(bp).connect(g).connect(this.bus);
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

  // Campanilla del tiro perfecto: dos notas limpias.
  perfect() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    [[880, 0], [1318.5, 0.12], [1760, 0.24]].forEach(([f, d]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t0 + d);
      const g = ctx.createGain();
      this.env(g, t0 + d, 0.005, 0.16, 0.9);
      o.connect(g).connect(this.out(0, 1, 0.6));
      o.start(t0 + d);
      o.stop(t0 + d + 1.2);
    });
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

  // Zumbido de alas al arrancar un bando.
  flush(dist, pan, big = false) {
    if (!this.ctx || dist > 150) return;
    const ctx = this.ctx, t = ctx.currentTime + dist / 343;
    const vol = Math.min(0.5, 12 / (dist + 8));
    const dest = this.out(pan, vol, 0.3);
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = big ? 500 : 900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // Batir rápido: se modula el volumen con muchos golpes seguidos.
    const beats = big ? 10 : 18;
    for (let i = 0; i < beats; i++) {
      const tt = t + i * (big ? 0.09 : 0.05);
      g.gain.setValueAtTime(1 - i / beats, tt);
      g.gain.exponentialRampToValueAtTime(0.05, tt + (big ? 0.07 : 0.035));
    }
    n.connect(bp).connect(g).connect(dest);
    n.start(t, Math.random());
    n.stop(t + beats * 0.1 + 0.1);
  }

  birdCall(kind, dist, pan) {
    if (!this.ctx || dist > 260) return;
    const ctx = this.ctx, t = ctx.currentTime + dist / 343;
    const vol = Math.min(0.35, 25 / (dist + 20));
    const dest = this.out(pan, vol, 0.5);
    const note = (tt, f0, f1, len, type = 'sine', q = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, tt);
      o.frequency.exponentialRampToValueAtTime(f1, tt + len);
      const g = ctx.createGain();
      this.env(g, tt, 0.01, 1, len);
      let node = o;
      if (q) {
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = f0 * 1.5;
        f.Q.value = q;
        node = o.connect(f);
      }
      node.connect(g).connect(dest);
      o.start(tt);
      o.stop(tt + len + 0.05);
    };
    if (kind === 'perdiz') {
      // "Cha-chac, cha-chac..."
      for (let i = 0; i < 4; i++) {
        note(t + i * 0.32, 1300, 900, 0.07, 'sawtooth', 3);
        note(t + i * 0.32 + 0.1, 1500, 1000, 0.12, 'sawtooth', 3);
      }
    } else if (kind === 'tortola') {
      // Arrullo grave: "rrrr-rrrr".
      for (let i = 0; i < 3; i++) note(t + i * 0.6, 520, 470, 0.45, 'sine');
    } else if (kind === 'pato') {
      for (let i = 0; i < 3; i++) note(t + i * 0.28, 420, 330, 0.18, 'sawtooth', 2);
    } else if (kind === 'flamenco') {
      // Graznido nasal, como de ganso.
      for (let i = 0; i < 4; i++) note(t + i * 0.22, 760 + Math.random() * 80, 620, 0.14, 'sawtooth', 2.5);
    } else if (kind === 'agachadiza') {
      note(t, 2200, 1700, 0.12, 'square', 4);
    }
  }

  lever() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.click(t + 0.15, 1400, 0.35);
    this.click(t + 0.3, 2600, 0.3);
    this.click(t + 0.42, 1800, 0.35);
  }

  // Ladrido: grave y seco (braco/podenco) o agudo y repetido (teckel latiendo).
  bark(dist, pan, small = false, excited = false) {
    if (!this.ctx || dist > 400) return;
    const ctx = this.ctx, t0 = ctx.currentTime + dist / 343;
    const vol = Math.min(0.45, 25 / (dist + 12));
    const dest = this.out(pan, vol, 0.5);
    const n = excited ? 3 : 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (small ? 0.22 : 0.3);
      const f = (small ? 620 : 380) * (0.9 + Math.random() * 0.2);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.3, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 2.2;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      this.env(g, t, 0.008, 1, 0.13);
      o.connect(bp).connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  // Bramido del monstruo del lago: muy grave, largo y con eco.
  moan(dist, pan) {
    if (!this.ctx || dist > 1500) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.min(dist / 343, 2.5);
    const vol = Math.min(0.7, 160 / (dist + 120));
    const dest = this.out(pan, vol, 2);
    for (const [f, type, g0] of [[55, 'sawtooth', 0.5], [82, 'sine', 1], [110, 'triangle', 0.4]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * 0.8, t);
      o.frequency.linearRampToValueAtTime(f * 1.15, t + 1.2);
      o.frequency.linearRampToValueAtTime(f * 0.7, t + 3.2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(g0, t + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      o.connect(lp).connect(g).connect(dest);
      o.start(t);
      o.stop(t + 3.5);
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
    n.connect(f).connect(g).connect(this.bus);
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
      o.connect(g).connect(this.bus);
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
    n.connect(f).connect(g).connect(this.bus);
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

  // ---------- Sonido en 3D ----------
  // El oyente va con la cámara; cada fuente suena desde su sitio, se apaga con la distancia,
  // pierde agudos a lo lejos (el aire se los come) y gana eco del valle.
  listen(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    const e = cam.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    this.listener.x = cam.position.x;
    this.listener.y = cam.position.y;
    this.listener.z = cam.position.z;
    if (l.positionX) {
      l.positionX.setTargetAtTime(cam.position.x, t, 0.02);
      l.positionY.setTargetAtTime(cam.position.y, t, 0.02);
      l.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(ux, t, 0.02);
      l.upY.setTargetAtTime(uy, t, 0.02);
      l.upZ.setTargetAtTime(uz, t, 0.02);
    } else {
      l.setPosition(cam.position.x, cam.position.y, cam.position.z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  distTo(x, y, z) {
    const L = this.listener;
    return Math.hypot(x - L.x, y - L.y, z - L.z);
  }

  // Presupuesto de voces: si ya suenan muchas a la vez, las nuevas lejanas se omiten.
  // Así el audio nunca se atasca (que era lo que hacía crujir y cortarse el sonido).
  claim(dur, d = 0) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    this.slots = this.slots.filter((e) => e > now);
    const max = d < 40 ? 14 : 9;
    if (this.slots.length >= max) return false;
    this.slots.push(now + dur);
    return true;
  }

  // Devuelve la entrada de una fuente situada en (x, y, z).
  at(x, y, z, vol = 1, rev = 0.3) {
    const ctx = this.ctx;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      x = this.listener.x;
      y = this.listener.y;
      z = this.listener.z;
    }
    const d = this.distTo(x, y, z);
    const g = ctx.createGain();
    g.gain.value = vol;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(700, 16000 * Math.exp(-d / 180));
    const p = ctx.createPanner();
    // 'equalpower' es mucho más ligero que HRTF y con cascos se ubica igual de bien.
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 6;
    p.rolloffFactor = 1.15;
    p.maxDistance = 3000;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else p.setPosition(x, y, z);
    g.connect(lp).connect(p).connect(this.bus);
    if (rev > 0) {
      const r = ctx.createGain();
      r.gain.value = rev * Math.min(1.6, 0.25 + d / 120) * Math.min(1, 25 / (d + 10));
      lp.connect(r).connect(this.reverb);
    }
    return g;
  }

  // Utilidades de síntesis.
  osc(type, t, len, f0, f1, dest, gain = 1, a = 0.01, curve = 'exp') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + len);
      else o.frequency.linearRampToValueAtTime(f1, t + len);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
    return o;
  }

  formant(dest, freqs, q = 5) {
    // Filtros de formantes en paralelo: dan el timbre de garganta o de pico.
    const ctx = this.ctx;
    const inp = ctx.createGain();
    for (const [f, g] of freqs) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g;
      inp.connect(bp).connect(gg).connect(dest);
    }
    return inp;
  }

  noiseBurst(t, len, dest, gain = 1, f = 1000, q = 1, type = 'bandpass') {
    const ctx = this.ctx;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = type;
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, len / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bp).connect(g).connect(dest);
    n.start(t, Math.random() * 1.5);
    n.stop(t + len + 0.05);
  }

  // ---------- Aves ----------
  bird(kind, x, y, z, vol = 1) {
    if (!this.ctx) return;
    const d = this.distTo(x, y, z);
    if (d > 220) return;
    if (!this.claim(2.5, d)) return;
    if (this.playRec(kind, x, y, z, vol)) return;
    const ctx = this.ctx, t = ctx.currentTime + d / 343 + 0.02;
    // Cada ejemplar canta un poco distinto: tono, fuerza y ritmo.
    const dest = this.at(x, y, z, 0.42 * vol * (0.75 + Math.random() * 0.5), 0.25);
    const R = Math.random;
    if (kind === 'perdiz') {
      // Perdiz roja: "cha-chá, chachará…", áspero y rítmico.
      const reps = 3 + Math.floor(R() * 3);
      const f0 = 1100 + R() * 250;
      const fm = this.formant(dest, [[f0 * 1.4, 1], [f0 * 2.6, 0.5]], 4);
      for (let i = 0; i < reps; i++) {
        const tt = t + i * 0.42;
        this.osc('sawtooth', tt, 0.06, f0, f0 * 0.8, fm, 0.9);
        this.osc('sawtooth', tt + 0.1, 0.09, f0 * 1.1, f0 * 0.85, fm, 1);
        this.osc('sawtooth', tt + 0.22, 0.12, f0 * 1.2, f0 * 0.75, fm, 0.9);
        this.noiseBurst(tt + 0.1, 0.08, dest, 0.25, f0 * 2, 2);
      }
    } else if (kind === 'tortola') {
      // Tórtola: ronroneo grave "turrr, turrr" (un zumbido modulado muy rápido).
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.75;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(500 + R() * 30, tt);
        o.frequency.linearRampToValueAtTime(440, tt + 0.55);
        const am = ctx.createOscillator();
        am.frequency.value = 26 + R() * 6;
        const amg = ctx.createGain();
        amg.gain.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.9, tt + 0.08);
        g.gain.setValueAtTime(0.9, tt + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.6);
        const vca = ctx.createGain();
        vca.gain.value = 0.5;
        am.connect(amg).connect(vca.gain);
        o.connect(vca).connect(g).connect(dest);
        o.start(tt);
        am.start(tt);
        o.stop(tt + 0.65);
        am.stop(tt + 0.65);
      }
    } else if (kind === 'zorzal') {
      // Zorzal común: frases silbadas y aflautadas que repite dos o tres veces.
      let tt = t;
      for (let p = 0; p < 3; p++) {
        const f = 2200 + R() * 2600, f2 = f * (0.7 + R() * 0.7), n = 2 + Math.floor(R() * 2), len = 0.08 + R() * 0.12;
        for (let k = 0; k < n; k++) {
          this.osc('sine', tt, len, f, f2, dest, 0.7, 0.008);
          this.osc('sine', tt, len, f * 2, f2 * 2, dest, 0.12, 0.008);
          tt += len + 0.07;
        }
        tt += 0.25 + R() * 0.2;
      }
    } else if (kind === 'agachadiza') {
      // "¡Scaap!" ronco al arrancar.
      this.osc('square', t, 0.14, 2600, 1700, this.formant(dest, [[2400, 1], [4200, 0.4]], 3), 0.7);
      this.noiseBurst(t, 0.12, dest, 0.35, 3000, 2);
    } else if (kind === 'pato') {
      // Ánade real: "CUAC cuac cuac cuac", nasal, cada uno más flojo.
      const fm = this.formant(dest, [[950, 1], [2300, 0.6], [3300, 0.25]], 6);
      const n = 3 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.26, v = 1 - i * 0.15;
        this.osc('sawtooth', tt, 0.2, 290, 230, fm, v, 0.012);
        this.osc('sawtooth', tt, 0.2, 293, 232, fm, v * 0.6, 0.012);
      }
    } else if (kind === 'ciguena') {
      // Cigüeña: crotoreo, un traqueteo de pico cada vez más rápido.
      let tt = t, gap = 0.11;
      for (let i = 0; i < 26; i++) {
        this.noiseBurst(tt, 0.025, dest, 0.9, 1400 + R() * 400, 6);
        this.osc('triangle', tt, 0.02, 700, 500, dest, 0.3, 0.002);
        tt += gap;
        gap = Math.max(0.05, gap * 0.95);
      }
    } else if (kind === 'flamenco') {
      // Flamenco: graznido de ganso, nasal y repetido.
      const fm = this.formant(dest, [[1100, 1], [2600, 0.5]], 5);
      for (let i = 0; i < 4; i++) this.osc('sawtooth', t + i * 0.24, 0.16, 720 + R() * 80, 600, fm, 0.9, 0.015);
    } else {
      // Pajarillos: gorjeos rápidos con quiebros.
      const base = 2600 + R() * 2400;
      let tt = t;
      for (let i = 0; i < 4 + Math.floor(R() * 7); i++) {
        const len = 0.03 + R() * 0.07;
        this.osc('sine', tt, len, base * (0.8 + R() * 0.5), base * (0.9 + R() * 0.6), dest, 0.5, 0.004);
        tt += len + 0.02 + R() * 0.06;
      }
    }
  }

  // ---------- Voces de los animales ----------
  voice(key, x, y, z, vol = 1) {
    if (!this.ctx) return;
    const d = this.distTo(x, y, z);
    if (d > 1400) return;
    if (!this.claim(key === 'leon' ? 6.5 : key === 'ciervo' ? 5 : 3, d * 0.5)) return;
    if (this.playRec(key, x, y, z, vol)) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.min(3, d / 343) + 0.02;
    const dest = this.at(x, y, z, vol * 0.85, 0.55);
    const R = Math.random;
    const groan = (tt, len, f0, f1, forms, g = 1, vib = 0) => {
      // Nunca dos iguales: tono, duración y timbre cambian un poco en cada llamada.
      const j = 0.9 + R() * 0.2;
      f0 *= j;
      f1 *= j * (0.95 + R() * 0.1);
      len *= 0.85 + R() * 0.3;
      forms = forms.map(([f, gg]) => [f * (0.92 + R() * 0.16), gg]);
      const fm = this.formant(dest, forms, 2.6);
      // Menos zumbido y más aire: la voz de un animal es sobre todo respiración que vibra.
      const o = this.osc('sawtooth', tt, len, f0, f1, fm, g * 0.55, Math.min(0.12, len / 4), 'lin');
      // Temblor irregular de la voz.
      const jit = ctx.createOscillator();
      jit.type = 'triangle';
      jit.frequency.value = 3 + R() * 4;
      const jg = ctx.createGain();
      jg.gain.value = f0 * 0.025;
      jit.connect(jg).connect(o.frequency);
      jit.start(tt);
      jit.stop(tt + len);
      if (vib) {
        const v = ctx.createOscillator();
        v.frequency.value = vib;
        const vg = ctx.createGain();
        vg.gain.value = f0 * 0.04;
        v.connect(vg).connect(o.frequency);
        v.start(tt);
        v.stop(tt + len);
      }
      // Aire de la respiración, que es lo que hace que suene a bicho y no a sintetizador.
      this.noiseBurst(tt, len, fm, g * 0.6, forms[0][0] * 1.1, 0.7);
    };
    switch (key) {
      case 'ciervo': {
        // Berrea: bramidos largos y roncos con eco de valle.
        let tt = t;
        for (let i = 0; i < 1 + Math.floor(R() * 3); i++) {
          const len = 1.2 + R() * 0.9, f = 100 + R() * 25;
          groan(tt, len, f * 0.8, f * 0.7, [[380, 1], [900, 0.5], [2100, 0.15]], 1.1, 7);
          tt += len + 0.3 + R() * 0.4;
        }
        break;
      }
      case 'gamo': {
        // Ronca del gamo: eructos graves y cortos en serie.
        for (let i = 0; i < 4 + Math.floor(R() * 4); i++) groan(t + i * 0.55, 0.3, 75, 62, [[320, 1], [760, 0.5]], 1);
        break;
      }
      case 'corzo':
      case 'corza':
        for (let i = 0; i < 2 + Math.floor(R() * 2); i++) groan(t + i * 0.6, 0.18, 520, 300, [[1100, 1], [2300, 0.5]], 0.9);
        break;
      case 'jabali':
        // Gruñidos del jabalí: pulsos roncos, nasales.
        for (let i = 0; i < 3 + Math.floor(R() * 4); i++) {
          const tt = t + i * (0.25 + R() * 0.25);
          groan(tt, 0.16, 110, 85, [[420, 1], [1000, 0.4]], 0.9);
          this.noiseBurst(tt, 0.16, dest, 0.5, 600, 2);
        }
        break;
      case 'zorro':
        // Grito del zorro: un chillido ronco que asusta de noche.
        groan(t, 0.7, 900, 650, [[1400, 1], [2800, 0.5]], 0.8, 11);
        break;
      case 'lobo':
        this.howl(d, 0);
        break;
      case 'muflon':
      case 'cabra':
      case 'cabra_h':
        // Balido.
        groan(t, 0.65, 340 + R() * 60, 300, [[850, 1], [1900, 0.5]], 0.8, 6.5);
        break;
      case 'bufalo':
        // Mugido grave y largo.
        groan(t, 1.3, 95, 80, [[480, 1], [1100, 0.35]], 1.1, 3);
        break;
      case 'leon': {
        // Rugido del león: uno enorme y después gruñidos que se van apagando.
        groan(t, 1.6, 120, 95, [[330, 1], [800, 0.6], [1600, 0.2]], 1.4, 5);
        this.osc('sine', t, 1.6, 60, 45, dest, 0.8, 0.15, 'lin');
        let tt = t + 1.9, gap = 0.55;
        for (let i = 0; i < 8; i++) {
          groan(tt, 0.35, 105, 85, [[300, 1], [700, 0.5]], 1 - i * 0.1);
          tt += gap;
          gap *= 1.08;
        }
        break;
      }
      case 'leona':
        for (let i = 0; i < 3; i++) groan(t + i * 0.7, 0.4, 150, 120, [[380, 1], [900, 0.4]], 0.8);
        break;
      case 'elefante': {
        // Barrito: trompetazo brillante que sube y baja, con retumbo grave.
        const fm = this.formant(dest, [[1300, 1], [2500, 0.7], [3800, 0.3]], 1.8);
        const o = this.osc('sawtooth', t, 1.3, 420, 520, fm, 1.2, 0.05, 'lin');
        o.frequency.linearRampToValueAtTime(680, t + 0.35);
        o.frequency.linearRampToValueAtTime(560, t + 1.2);
        const v = ctx.createOscillator();
        v.frequency.value = 9;
        const vg = ctx.createGain();
        vg.gain.value = 18;
        v.connect(vg).connect(o.frequency);
        v.start(t);
        v.stop(t + 1.3);
        this.noiseBurst(t, 1.2, dest, 0.3, 2400, 1);
        this.osc('sine', t, 1.6, 28, 22, dest, 0.7, 0.2, 'lin');
        break;
      }
      case 'hipopotamo':
        // Resoplidos y "risa" del hipopótamo: bocinazos graves en serie.
        for (let i = 0; i < 6; i++) groan(t + i * 0.32, 0.26, 140 - i * 8, 110 - i * 6, [[420, 1], [950, 0.5]], 1.1 - i * 0.1);
        groan(t + 2.2, 0.9, 70, 55, [[300, 1]], 0.8);
        break;
      case 'cocodrilo':
        // Rugido sordo que hace vibrar el agua.
        this.osc('sine', t, 1.5, 38, 32, dest, 1, 0.2, 'lin');
        this.noiseBurst(t, 1.3, dest, 0.5, 180, 1.5, 'lowpass');
        break;
      case 'gorila': {
        // Ululatos y golpes en el pecho.
        for (let i = 0; i < 4; i++) this.osc('sine', t + i * 0.28, 0.24, 320 + i * 60, 420 + i * 70, dest, 0.5, 0.03);
        const t2 = t + 1.2;
        for (let i = 0; i < 12; i++) {
          const tt = t2 + i * 0.09;
          this.osc('sine', tt, 0.1, 110, 70, dest, 1, 0.003);
          this.noiseBurst(tt, 0.06, dest, 0.4, 300, 1);
        }
        break;
      }
      default:
        break;
    }
  }

  // ---------- Agua del lago ----------
  initWater() {
    const ctx = this.ctx;
    // Chapoteo de las olas en la orilla: ruido filtrado que sube y baja con cada ola.
    const src = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const waveAm = ctx.createGain();
    waveAm.gain.value = 0.4;
    this.waterWave = waveAm;
    this.waterOut = ctx.createGain();
    this.waterOut.gain.value = 0;
    this.waterPan = ctx.createPanner();
    this.waterPan.panningModel = 'equalpower';
    this.waterPan.distanceModel = 'linear';
    this.waterPan.refDistance = 1;
    this.waterPan.maxDistance = 10000;
    this.waterPan.rolloffFactor = 0;
    src.connect(lp).connect(waveAm);
    const src2 = this.noiseSrc();
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    src2.connect(bp).connect(g2).connect(waveAm);
    waveAm.connect(this.waterOut).connect(this.waterPan).connect(this.bus);
    const r = ctx.createGain();
    r.gain.value = 0.25;
    this.waterOut.connect(r).connect(this.reverb);
    src.start();
    src2.start(0, 0.7);
    this.waterPhase = 0;
    this.nextDrop = 0;
  }

  // near: 0 (lejos) a 1 (en la orilla); (x, y, z): punto de agua más cercano.
  water(near, x, y, z, dt, wading = false) {
    if (!this.ctx || !Number.isFinite(near) || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const t = this.ctx.currentTime;
    this.waterPhase += dt;
    const p = this.waterPan;
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, t, 0.3);
      p.positionY.setTargetAtTime(y, t, 0.3);
      p.positionZ.setTargetAtTime(z, t, 0.3);
    } else p.setPosition(x, y, z);
    // Cada ola: sube, rompe y se retira.
    const w = this.waterPhase;
    const wave = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(w * 1.9 + Math.sin(w * 0.37) * 2), 3);
    this.waterWave.gain.setTargetAtTime(wave, t, 0.08);
    this.waterOut.gain.setTargetAtTime(near * near * 0.55 + (wading ? 0.25 : 0), t, 0.3);
    // Gotas, pececillos que saltan y ranas cerca de la orilla.
    if (near > 0.15 && t > this.nextDrop) {
      this.nextDrop = t + 0.4 + Math.random() * (3 / near);
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 25;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const k = Math.random();
      if (k < 0.55) this.plop(px, y, pz, 0.35 + Math.random() * 0.4);
      else if (k < 0.8) this.frog(px, y, pz);
      else this.plop(px, y, pz, 0.15, true);
    }
  }

  plop(x, y, z, vol = 0.5, small = false) {
    if (!this.claim(0.3, 30)) return;
    const t = this.ctx.currentTime;
    const dest = this.at(x, y, z, vol, 0.3);
    // Gota: burbuja que sube de tono rápido.
    const f = small ? 1600 + Math.random() * 800 : 500 + Math.random() * 300;
    this.osc('sine', t, small ? 0.05 : 0.12, f, f * 2.2, dest, 0.8, 0.003);
    this.noiseBurst(t, small ? 0.05 : 0.18, dest, small ? 0.2 : 0.5, 2500, 0.8);
  }

  frog(x, y, z) {
    if (!this.claim(1, 30)) return;
    const t = this.ctx.currentTime;
    const dest = this.at(x, y, z, 0.5, 0.35);
    const fm = this.formant(dest, [[700, 1], [1700, 0.4]], 4);
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.osc('square', t + i * 0.2, 0.12, 190, 160, fm, 0.8, 0.01);
  }

  // Chapoteo al andar por el agua.
  splashStep(vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.25, this.bus, vol, 1400, 0.7);
    this.noiseBurst(t + 0.05, 0.2, this.bus, vol * 0.6, 3500, 1);
  }

  update(windSpeed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.05 + windSpeed * 0.025, t, 1);
    this.windFilter.frequency.setTargetAtTime(300 + windSpeed * 70, t, 1);

  }
}
