// Texturas procedurales de alta resolución (color + relieve) generadas al arrancar.
// Todas repiten sin costuras. Si existe assets/textures/manifest.json, se sustituyen
// por fotografías (ver README).
import * as THREE from 'three';
import { rng, hash2 } from './noise.js';

const mod = (a, p) => ((a % p) + p) % p;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Ruido de valor periódico (px, py = periodo en celdas).
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = smooth(x - xi), v = smooth(y - yi);
  const x0 = mod(xi, px), x1 = mod(xi + 1, px), y0 = mod(yi, py), y1 = mod(yi + 1, py);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  const top = a + (b - a) * u;
  return top + (c + (d - c) * u - top) * v;
}

function fbmP(u, v, px, py, oct, seed) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(u * px * f, v * py * f, px * f, py * f, seed + o * 17);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

const hex = (h) => {
  const c = new THREE.Color(h);
  // Trabajamos en sRGB (lo que se ve), la textura se marca como sRGB.
  c.convertLinearToSRGB();
  return [c.r, c.g, c.b];
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Surface {
  constructor(S) {
    this.S = S;
    this.rgb = new Float32Array(S * S * 3);
    this.h = new Float32Array(S * S);
  }

  fill(fn) {
    const S = this.S;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const r = fn(x / S, y / S, x, y);
        this.rgb[i * 3] = r[0];
        this.rgb[i * 3 + 1] = r[1];
        this.rgb[i * 3 + 2] = r[2];
        this.h[i] = r[3];
      }
    }
  }

  // Compone trazos dibujados en un canvas (con envoltura en los bordes) sobre la base.
  overlay(draw, heightGain = 0.6) {
    const S = this.S;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        g.save();
        g.translate(dx, dy);
        draw(g, S);
        g.restore();
      }
    }
    const d = g.getImageData(0, 0, S, S).data;
    for (let i = 0; i < S * S; i++) {
      const a = d[i * 4 + 3] / 255;
      if (a === 0) continue;
      for (let k = 0; k < 3; k++) this.rgb[i * 3 + k] = this.rgb[i * 3 + k] * (1 - a) + (d[i * 4 + k] / 255) * a;
      const lum = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
      this.h[i] = this.h[i] * (1 - a) + (0.5 + lum * heightGain) * a;
    }
  }

  // Se aplica la misma receta a las tres copias desplazadas, así que las semillas
  // aleatorias tienen que repetirse en cada llamada a draw().
  toTextures(normalStrength, anisotropy) {
    const S = this.S;
    const col = new Uint8Array(S * S * 4);
    const nor = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        col[i * 4] = clamp01(this.rgb[i * 3]) * 255;
        col[i * 4 + 1] = clamp01(this.rgb[i * 3 + 1]) * 255;
        col[i * 4 + 2] = clamp01(this.rgb[i * 3 + 2]) * 255;
        col[i * 4 + 3] = 255;
        const hL = this.h[y * S + mod(x - 1, S)], hR = this.h[y * S + mod(x + 1, S)];
        const hD = this.h[mod(y - 1, S) * S + x], hU = this.h[mod(y + 1, S) * S + x];
        let nx = (hL - hR) * normalStrength, ny = (hD - hU) * normalStrength, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        nor[i * 4] = (nx * 0.5 + 0.5) * 255;
        nor[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
        nor[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
        nor[i * 4 + 3] = 255;
      }
    }
    return { map: dataTex(col, S, S, true, anisotropy), normal: dataTex(nor, S, S, false, anisotropy) };
  }
}

function dataTex(data, w, h, srgb, anisotropy, repeat = true) {
  const t = new THREE.DataTexture(data, w, h);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

function strokes(g, S, seed, count, palette, lenMin, lenMax, width, angleFn) {
  const r = rng(seed);
  const k = S / 512;
  for (let i = 0; i < count; i++) {
    const x = r() * S, y = r() * S;
    const a = angleFn ? angleFn(r) : r() * Math.PI * 2;
    const len = (lenMin + r() * (lenMax - lenMin)) * k;
    g.strokeStyle = palette[Math.floor(r() * palette.length)];
    g.globalAlpha = 0.75 + r() * 0.25;
    g.lineWidth = Math.max(1, width * k * (0.6 + r() * 0.8));
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 2 * k, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function pebbles(g, S, seed, count, rMin, rMax, palette) {
  const r = rng(seed);
  const k = S / 512;
  for (let i = 0; i < count; i++) {
    const x = r() * S, y = r() * S;
    const rad = (rMin + r() * (rMax - rMin)) * k;
    const base = palette[Math.floor(r() * palette.length)];
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI);
    g.scale(1, 0.6 + r() * 0.4);
    g.fillStyle = 'rgba(20,14,8,0.45)';
    g.beginPath();
    g.arc(rad * 0.25, rad * 0.3, rad * 1.05, 0, Math.PI * 2);
    g.fill();
    const grd = g.createRadialGradient(-rad * 0.35, -rad * 0.35, rad * 0.1, 0, 0, rad);
    grd.addColorStop(0, '#d8cfbf');
    grd.addColorStop(0.35, base);
    grd.addColorStop(1, '#3c342a');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, rad, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

// ---------- Superficies del terreno ----------

function grass(S, aniso) {
  const s = new Surface(S);
  const dark = hex('#2f3b18'), mid = hex('#55632a'), light = hex('#7c7f3a');
  s.fill((u, v) => {
    const n = fbmP(u, v, 6, 6, 5, 11);
    const m = fbmP(u, v, 24, 24, 3, 12);
    const c = mix3(mix3(dark, mid, smooth(clamp01(n * 1.6 - 0.2))), light, clamp01((m - 0.55) * 2));
    return [c[0], c[1], c[2], n * 0.3];
  });
  const pal = ['#56682b', '#627234', '#738038', '#88894a', '#4a5a25', '#9d9656', '#b6a868', '#3d4c1f'];
  s.overlay((g, S2) => {
    strokes(g, S2, 21, S2 * S2 / 90, pal, 7, 20, 1.6);
    strokes(g, S2, 22, S2 * S2 / 700, ['#c4b67a', '#d2c48c', '#aaa060'], 10, 24, 1.3);
  }, 0.8);
  return s.toTextures(3.2, aniso);
}

function dirt(S, aniso) {
  const s = new Surface(S);
  const a = hex('#5b4a36'), b = hex('#806a4e'), c2 = hex('#9a8466');
  s.fill((u, v, x, y) => {
    const n = fbmP(u, v, 5, 5, 5, 31);
    const grain = hash2(x, y, 33) * 0.09 - 0.045;
    const c = mix3(mix3(a, b, clamp01(n * 1.5 - 0.2)), c2, clamp01(fbmP(u, v, 16, 16, 2, 32) * 2 - 1.1));
    return [c[0] + grain, c[1] + grain, c[2] + grain, n * 0.5 + grain];
  });
  s.overlay((g, S2) => {
    pebbles(g, S2, 41, 150, 2, 7, ['#8c806e', '#a39683', '#6f6557', '#9a8a70']);
    strokes(g, S2, 42, 60, ['#3a2e20', '#4a3a28'], 8, 22, 1.6);
    strokes(g, S2, 43, 90, ['#6d7a38', '#56652c'], 4, 9, 1.4);
  }, 0.9);
  return s.toTextures(4, aniso);
}

function rock(S, aniso) {
  const s = new Surface(S);
  const a = hex('#5f5c56'), b = hex('#8e8a81'), c2 = hex('#aba699');
  const lichen = hex('#9c9a5a'), lichen2 = hex('#c0a95a');
  s.fill((u, v) => {
    const n = fbmP(u, v, 4, 4, 6, 51);
    const ridge = 1 - Math.abs(fbmP(u, v, 3, 3, 5, 52) * 2 - 1);
    const crack = Math.pow(ridge, 10);
    let c = mix3(mix3(a, b, n), c2, clamp01(fbmP(u, v, 20, 20, 3, 53) * 2 - 1.1));
    c = mix3(c, [0.12, 0.11, 0.1], crack * 0.8);
    const l = fbmP(u, v, 8, 8, 4, 54);
    c = mix3(c, l > 0.62 ? lichen2 : lichen, smooth(clamp01((l - 0.56) * 6)) * 0.7);
    return [c[0], c[1], c[2], n * 0.8 - crack * 0.5];
  });
  return s.toTextures(6, aniso);
}

function forestFloor(S, aniso) {
  const s = new Surface(S);
  const a = hex('#2c2217'), b = hex('#4a3a26');
  const moss = hex('#4a5626');
  s.fill((u, v) => {
    const n = fbmP(u, v, 6, 6, 5, 61);
    let c = mix3(a, b, n);
    c = mix3(c, moss, smooth(clamp01((fbmP(u, v, 5, 5, 4, 62) - 0.55) * 5)) * 0.8);
    return [c[0], c[1], c[2], n * 0.3];
  });
  s.overlay((g, S2) => {
    strokes(g, S2, 71, S2 * S2 / 160, ['#7b5a35', '#8f6b40', '#5d4327', '#a07a4a', '#6b4f30'], 10, 22, 1.3);
    pebbles(g, S2, 72, 12, 6, 11, ['#6b4a2c', '#5a3d22']);
  }, 0.7);
  return s.toTextures(3.5, aniso);
}

function bark(S, aniso) {
  const s = new Surface(S);
  const a = hex('#3b2c21'), b = hex('#6d5441'), c2 = hex('#8f7760');
  s.fill((u, v) => {
    const n = fbmP(u, v, 6, 2, 5, 81);
    const ridge = 1 - Math.abs(fbmP(u, v, 7, 1, 4, 82) * 2 - 1);
    const fissure = Math.pow(1 - ridge, 3);
    const plates = fbmP(u, v, 10, 3, 3, 83);
    let c = mix3(a, b, clamp01(ridge * 1.2 - 0.1));
    c = mix3(c, c2, clamp01(plates * 1.6 - 0.8));
    c = mix3(c, [0.08, 0.06, 0.05], fissure * 0.8);
    return [c[0], c[1], c[2], ridge * 0.8 + n * 0.2];
  });
  return s.toTextures(7, aniso);
}

function macroNoise(S) {
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      data[i] = fbmP(x / S, y / S, 4, 4, 5, 91) * 255;
      data[i + 1] = fbmP(x / S, y / S, 9, 9, 4, 92) * 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return dataTex(data, S, S, false, 1);
}

// ---------- Tarjetas con transparencia (ramas, hojas, hierba) ----------

// Dibuja en un canvas y devuelve una textura RGBA en la que los píxeles transparentes
// conservan un color neutro (evita halos oscuros al filtrar).
function cardTexture(S, W, draw, fillColor, aniso) {
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = W;
  const g = cv.getContext('2d');
  draw(g, S, W);
  const src = g.getImageData(0, 0, S, W).data;
  const fc = hex(fillColor);
  const data = new Uint8Array(S * W * 4);
  for (let y = 0; y < W; y++) {
    const row = W - 1 - y;
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, o = (row * S + x) * 4;
      const a = src[i + 3];
      if (a > 0) {
        data[o] = src[i];
        data[o + 1] = src[i + 1];
        data[o + 2] = src[i + 2];
      } else {
        data[o] = fc[0] * 255;
        data[o + 1] = fc[1] * 255;
        data[o + 2] = fc[2] * 255;
      }
      data[o + 3] = a;
    }
  }
  return dataTex(data, S, W, true, aniso, false);
}

// Rama de pino: la ramita va de izquierda (tronco, u=0) a derecha (punta, u=1).
// Debajo de las agujas hay una "masa" opaca con forma de rama: así el contorno no se
// deshace al verse de lejos (los niveles de mipmap promedian la transparencia).
function pineBranch(S, aniso) {
  return cardTexture(S, S, (g) => {
    const r = rng(101);
    const cy = S * 0.5;
    const greens = ['#1f3417', '#28401c', '#304b22', '#3a5829', '#456530', '#2a421d', '#51703a'];
    const blob = (x0, y0, x1, y1, w0, w1, color) => {
      const a = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
      g.save();
      g.translate(x0, y0);
      g.rotate(a);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, -w0);
      g.quadraticCurveTo(len * 0.55, -w0 * 1.1, len, -w1);
      g.lineTo(len, w1);
      g.quadraticCurveTo(len * 0.55, w0 * 1.1, 0, w0);
      g.closePath();
      g.fill();
      g.restore();
    };
    const twig = (x0, y0, x1, y1, width, depth) => {
      blob(x0, y0, x1, y1, width * 0.55, width * 0.25, '#263d1b');
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.floor(len / (S * 0.006));
      const base = Math.atan2(y1 - y0, x1 - x0);
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const nl = width * (0.95 - t * 0.45) * (0.8 + r() * 0.4);
        for (const side of [-1, 1]) {
          const a = base + side * (0.55 + r() * 0.55);
          g.strokeStyle = greens[Math.floor(r() * greens.length)];
          g.lineWidth = Math.max(1.5, S * 0.009);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * nl, y + Math.sin(a) * nl);
          g.stroke();
        }
      }
      g.strokeStyle = '#4a3522';
      g.lineWidth = Math.max(1, S * (depth ? 0.006 : 0.011));
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };
    twig(S * 0.02, cy, S * 0.97, cy + S * 0.02, S * 0.2, 0);
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + i * 0.095;
      const x = S * (0.02 + 0.95 * t), y = cy + S * 0.02 * t;
      const side = i % 2 ? 1 : -1;
      const l = S * (0.36 - t * 0.26);
      twig(x, y, x + l * 0.75, y + side * l * 0.6, S * (0.13 - t * 0.06), 1);
    }
  }, '#2a421d', aniso);
}

function leafCluster(S, aniso, seed, greens, fill, { count = 900, size = 0.014, elong = 0.55, flowers = 0 } = {}) {
  return cardTexture(S, S, (g) => {
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const ang = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * S * 0.45;
      const x = S / 2 + Math.cos(ang) * rad, y = S / 2 + Math.sin(ang) * rad;
      const L = S * (size + r() * size * 0.85), Wd = L * (elong + r() * 0.15);
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI * 2);
      g.fillStyle = greens[Math.floor(r() * greens.length)];
      g.beginPath();
      g.ellipse(0, 0, L, Wd, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,230,0.14)';
      g.lineWidth = Math.max(0.6, S / 1400);
      g.beginPath();
      g.moveTo(-L * 0.8, 0);
      g.lineTo(L * 0.8, 0);
      g.stroke();
      g.restore();
    }
    // Flores de jara: cinco pétalos blancos, mancha granate y centro amarillo.
    for (let i = 0; i < flowers; i++) {
      const ang = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * S * 0.38;
      const x = S / 2 + Math.cos(ang) * rad, y = S / 2 + Math.sin(ang) * rad;
      const R = S * (0.022 + r() * 0.01);
      const rot = r() * Math.PI;
      for (let k = 0; k < 5; k++) {
        const a = rot + (k / 5) * Math.PI * 2;
        g.fillStyle = k % 2 ? '#f4f1ea' : '#fbf9f4';
        g.beginPath();
        g.ellipse(x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55, R * 0.62, R * 0.5, a, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#6e1a24';
        g.beginPath();
        g.arc(x + Math.cos(a) * R * 0.4, y + Math.sin(a) * R * 0.4, R * 0.13, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#e8c23a';
      g.beginPath();
      g.arc(x, y, R * 0.22, 0, Math.PI * 2);
      g.fill();
    }
  }, fill, aniso);
}

function grassCard(S, aniso) {
  return cardTexture(S, S, (g) => {
    const r = rng(77);
    for (let i = 0; i < 34; i++) {
      const x = S * (0.06 + r() * 0.88);
      const w = S * (0.012 + r() * 0.02);
      const h = S * (0.45 + r() * 0.52);
      const lean = (r() - 0.5) * S * 0.35;
      const grd = g.createLinearGradient(0, S, 0, S - h);
      grd.addColorStop(0, '#34421b');
      grd.addColorStop(0.45, r() < 0.5 ? '#6b7431' : '#7d7c3c');
      grd.addColorStop(1, r() < 0.4 ? '#d8c887' : '#b5aa66');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x - w, S);
      g.quadraticCurveTo(x + lean * 0.3, S - h * 0.5, x + lean, S - h);
      g.quadraticCurveTo(x + lean * 0.3 + w * 0.2, S - h * 0.5, x + w, S);
      g.closePath();
      g.fill();
      if (r() < 0.07) {
        g.fillStyle = '#c2ad74';
        g.beginPath();
        g.ellipse(x + lean, S - h, w * 0.8, S * 0.028, lean / S, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, '#5c6630', aniso);
}

export function buildTextures(quality, anisotropy) {
  const S = quality.texSize;
  const t0 = performance.now();
  const tex = {
    grass: grass(S, anisotropy),
    dirt: dirt(S, anisotropy),
    rock: rock(S, anisotropy),
    forest: forestFloor(S, anisotropy),
    bark: bark(Math.min(S, 256), anisotropy),
    macro: macroNoise(256),
    pine: pineBranch(quality.foliageSize, anisotropy),
    oak: leafCluster(quality.foliageSize, anisotropy, 111, ['#2f3e1c', '#3a4a22', '#46572a', '#526433', '#34431f', '#5d6e3a'], '#3a4a22',
      { count: quality.foliageSize >= 1024 ? 2600 : 1100, size: quality.foliageSize >= 1024 ? 0.009 : 0.013 }),
    bush: leafCluster(Math.min(quality.foliageSize, 512), anisotropy, 121, ['#3d4d22', '#4b5c2a', '#5a6a32', '#46552a', '#66773a'], '#4b5c2a', { count: 1000, size: 0.014 }),
    jara: leafCluster(Math.min(quality.foliageSize, 512), anisotropy, 131, ['#27351a', '#2f3f1f', '#394a25', '#435530'], '#2f3f1f',
      { count: 900, size: 0.026, elong: 0.22, flowers: 9 }),
    grassCard: grassCard(256, anisotropy),
  };
  tex.ms = performance.now() - t0;
  loadPhotos(tex);
  return tex;
}

// Fotografías opcionales: assets/textures/manifest.json -> { "grass": "grass_diff.jpg", "grass_normal": "..." }
function loadPhotos(tex) {
  fetch('assets/textures/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      if (!m) return;
      const loader = new THREE.TextureLoader();
      for (const key of ['grass', 'dirt', 'rock', 'forest', 'bark']) {
        for (const kind of ['map', 'normal']) {
          const file = m[kind === 'map' ? key : `${key}_normal`];
          if (!file) continue;
          loader.load(`assets/textures/${file}`, (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.colorSpace = kind === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.anisotropy = tex.grass.map.anisotropy;
            const old = tex[key][kind];
            old.image = t.image;
            old.needsUpdate = true;
            // Una imagen de verdad: se sustituye en la misma textura para no tocar materiales.
            old.flipY = t.flipY;
            old.format = THREE.RGBAFormat;
            old.type = THREE.UnsignedByteType;
            old.isDataTexture = false;
          });
        }
      }
    })
    .catch(() => {});
}
