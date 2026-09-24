// Interfaz: marcadores, brújula, viento, munición, visor/prismáticos y pantallas.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), score: $('score'), timer: $('timer'), compass: $('compass-strip'),
      windArrow: $('wind-arrow'), windSpeed: $('wind-speed'), mag: $('ammo-mag'), reserve: $('ammo-reserve'),
      ammoState: $('ammo-state'), stance: $('stance'), breath: $('breath-fill'), breathBox: $('breath'),
      crosshair: $('crosshair'), feed: $('feed'), banner: $('banner'), markers: $('markers'),
      optic: $('optic'), opticInfo: $('optic-info'), zoom: $('optic-zoom'), range: $('optic-range'), zero: $('optic-zero'),
      hint: $('optic-hint'), flash: $('flash'), letterbox: $('letterbox'), hitmark: $('hitmark'), tip: $('tip'),
    };
    this.ctx = this.el.optic.getContext('2d');
    this.opticKey = '';
    this.markerPool = [];
    this.compassTicks = [];
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    for (let d = 0; d < 360; d += 15) {
      const t = document.createElement('div');
      t.className = 'tick' + (labels[d] ? ' major' : '');
      t.textContent = labels[d] || '·';
      t.dataset.deg = d;
      this.el.compass.appendChild(t);
      this.compassTicks.push(t);
    }
    this.bannerTimer = 0;
    this.tipTimer = 0;
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  setScore(v) {
    this.el.score.textContent = v;
  }

  setTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    this.el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.el.timer.classList.toggle('low', s <= 60);
  }

  setCompass(bearing) {
    for (const t of this.compassTicks) {
      let d = +t.dataset.deg - bearing;
      d = ((d + 540) % 360) - 180;
      if (Math.abs(d) > 75) {
        t.style.display = 'none';
      } else {
        t.style.display = '';
        t.style.left = `${50 + (d / 75) * 50}%`;
        t.style.opacity = String(1 - Math.abs(d) / 85);
      }
    }
  }

  setWind(relDeg, speed) {
    this.el.windArrow.style.transform = `rotate(${relDeg}deg)`;
    this.el.windSpeed.textContent = `${speed.toFixed(1)} m/s`;
  }

  setAmmo(mag, reserve, state, size = 5, weapon = 'Rifle', shell = false) {
    const key = `${mag}|${reserve}|${state}|${size}|${weapon}`;
    if (key === this._ammoKey) return;
    this._ammoKey = key;
    let html = '';
    for (let i = 0; i < size; i++) html += `<i class="${i < mag ? 'full' : ''}${shell ? ' shell' : ''}"></i>`;
    this.el.mag.innerHTML = html;
    this.el.reserve.textContent = reserve;
    this.el.ammoState.textContent = state || weapon;
  }

  setStance(stance) {
    const names = { stand: 'De pie', crouch: 'Agachado', prone: 'Tumbado' };
    this.el.stance.textContent = names[stance];
    this.el.stance.dataset.stance = stance;
  }

  setBreath(v, holding, gasp) {
    this.el.breath.style.width = `${v * 100}%`;
    this.el.breathBox.classList.toggle('holding', holding);
    this.el.breathBox.classList.toggle('gasp', gasp);
  }

  // Barra de armas: aparece un momento al cambiar.
  weaponBar(names, current) {
    const el = document.getElementById('weapons');
    el.innerHTML = names.map((n, i) => `<div class="${i === current ? 'on' : ''}"><b>${i + 1}</b>${n}</div>`).join('');
    el.classList.add('show');
    clearTimeout(this._wb);
    this._wb = setTimeout(() => el.classList.remove('show'), 2200);
  }

  banner(title, sub, kind = 'good') {
    const b = this.el.banner;
    b.innerHTML = `<strong>${title}</strong><span>${sub}</span>`;
    b.className = `show ${kind}`;
    this.bannerTimer = 3.2;
  }

  feed(text, kind = '') {
    const d = document.createElement('div');
    d.className = `feed-item ${kind}`;
    d.textContent = text;
    this.el.feed.prepend(d);
    setTimeout(() => d.classList.add('out'), 5500);
    setTimeout(() => d.remove(), 6200);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
  }

  tip(text, secs = 3) {
    this.el.tip.textContent = text;
    this.el.tip.classList.add('show');
    this.tipTimer = secs;
  }

  hitmark(kill) {
    const h = this.el.hitmark;
    h.className = kill ? 'show kill' : 'show';
    clearTimeout(this._hm);
    this._hm = setTimeout(() => (h.className = ''), 450);
  }

  muzzleFlash() {
    const f = this.el.flash;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  letterbox(on) {
    this.el.letterbox.classList.toggle('on', on);
  }

  crosshair(on) {
    this.el.crosshair.classList.toggle('hidden', !on);
  }

  // kind: '' | 'scope' | 'binoc'
  optic(kind, fovV, info) {
    const o = this.el.optic;
    if (!kind) {
      if (this.opticKey) {
        o.classList.add('hidden');
        this.el.opticInfo.classList.add('hidden');
        this.opticKey = '';
      }
      return;
    }
    o.classList.remove('hidden');
    this.el.opticInfo.classList.remove('hidden');
    this.el.opticInfo.dataset.kind = kind;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    const key = `${kind}|${fovV.toFixed(4)}|${w}x${h}`;
    if (info) {
      this.el.zoom.textContent = info.zoom;
      this.el.range.textContent = info.range;
      this.el.zero.textContent = info.zero;
      this.el.hint.textContent = info.hint;
    }
    if (key === this.opticKey) return;
    this.opticKey = key;
    o.width = w;
    o.height = h;
    const g = this.ctx;
    const cx = w / 2, cy = h / 2;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const hole = (x, y, R) => {
      const grd = g.createRadialGradient(x, y, R * 0.9, x, y, R);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, R, 0, Math.PI * 2);
      g.fill();
    };
    let R;
    if (kind === 'scope') {
      R = Math.min(w, h) * 0.47;
      hole(cx, cy, R);
    } else {
      R = Math.min(w, h) * 0.42;
      hole(cx - R * 0.62, cy, R);
      hole(cx + R * 0.62, cy, R);
    }
    g.globalCompositeOperation = 'source-over';

    // Viñeteado interior de la lente.
    const vig = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * (kind === 'scope' ? 1 : 1.6));
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);

    if (kind !== 'scope') return;

    // Retícula mil-dot en el primer plano focal: las marcas miden milirradianes reales.
    const ppm = (h / 2 / Math.tan(fovV / 2)) * 0.001;
    const inner = R * 0.55;
    g.strokeStyle = '#0b0b0b';
    g.fillStyle = '#0b0b0b';
    g.lineCap = 'butt';
    g.lineWidth = Math.max(5, 6 * dpr);
    g.beginPath();
    g.moveTo(cx - R, cy); g.lineTo(cx - inner, cy);
    g.moveTo(cx + inner, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy + inner); g.lineTo(cx, cy + R);
    g.moveTo(cx, cy - inner); g.lineTo(cx, cy - R);
    g.stroke();
    g.lineWidth = Math.max(1, 1.2 * dpr);
    g.beginPath();
    g.moveTo(cx - inner, cy); g.lineTo(cx + inner, cy);
    g.moveTo(cx, cy - inner); g.lineTo(cx, cy + inner);
    g.stroke();
    const dot = Math.max(1.6, Math.min(4, ppm * 0.12));
    for (let i = 1; i <= 12; i++) {
      const d = i * ppm;
      if (d > inner - 4) break;
      for (const [x, y] of [[cx + d, cy], [cx - d, cy], [cx, cy - d], [cx, cy + d]]) {
        g.beginPath();
        g.arc(x, y, dot, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Marcas de corrección por debajo del centro (cada mil).
    g.font = `${Math.round(10 * dpr)}px system-ui, sans-serif`;
    g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const d = i * ppm;
      if (d > inner - 4) break;
      const half = (i % 2 === 0 ? 10 : 5) * dpr;
      g.beginPath();
      g.moveTo(cx - half, cy + d);
      g.lineTo(cx + half, cy + d);
      g.stroke();
      if (i % 2 === 0 && ppm > 9 * dpr) g.fillText(String(i), cx + half + 4 * dpr, cy + d);
    }
    // Punto central iluminado.
    g.fillStyle = '#ff3b2f';
    g.beginPath();
    g.arc(cx, cy, Math.max(1.4, 1.6 * dpr), 0, Math.PI * 2);
    g.fill();
  }

  // list: [{x, y, title, sub, kind}]
  setMarkers(list) {
    while (this.markerPool.length < list.length) {
      const m = document.createElement('div');
      m.className = 'marker';
      m.innerHTML = '<b></b><span></span>';
      this.el.markers.appendChild(m);
      this.markerPool.push(m);
    }
    this.markerPool.forEach((m, i) => {
      const it = list[i];
      if (!it) {
        m.style.display = 'none';
        return;
      }
      m.style.display = '';
      m.style.transform = `translate(${it.x}px, ${it.y}px)`;
      m.className = `marker ${it.kind}`;
      m.firstChild.textContent = it.title;
      m.lastChild.textContent = it.sub;
    });
  }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
    if (this.tipTimer > 0) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) this.el.tip.classList.remove('show');
    }
  }
}
