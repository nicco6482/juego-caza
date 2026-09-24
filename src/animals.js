// Fauna del coto: modelos, comportamiento (oído, vista, olfato), manadas y zonas de impacto.
import * as THREE from 'three';
import { part, between, merge, segmentSphere, loft, subdivide } from './geo.js';
import { customize } from './fog.js';
import { instantiate, playSlot } from './models.js';

// Piezas con muy poca variación por cara: el detalle lo pone el shader de pelaje.
const P = (g, c, pos, rot, sc) => part(g, c, pos, rot, sc, 0.012);
const Bt = (a, b, r1, r2, c, radial = 8) => between(a, b, r1, r2, c, radial, 0.012);
import { groundAt, forestAt, slopeAt, waterDepth, PLAY_HALF, clamp } from './world.js';

export const SPECIES = {
  ciervo: {
    name: 'Ciervo', legal: true, points: 120, scale: 1.0, build: 'deer', antlers: 'stag',
    walk: 1.3, run: 12.5, hearing: 42, sight: 85, smell: 120,
    col: { body: '#74502f', dark: '#3a2a1b', light: '#c7ae86', rump: '#d9c8a4', nose: '#1d1712', antler: '#d8c7a2' },
  },
  cierva: {
    name: 'Cierva', fem: true, legal: false, penalty: 250, scale: 0.86, build: 'deer', antlers: null,
    walk: 1.3, run: 12.5, hearing: 46, sight: 90, smell: 120,
    col: { body: '#8a6440', dark: '#4a3622', light: '#d2bb92', rump: '#e2d3b2', nose: '#1d1712' },
  },
  corzo: {
    name: 'Corzo', legal: true, points: 150, scale: 0.62, build: 'deer', antlers: 'roe',
    walk: 1.2, run: 11, hearing: 48, sight: 80, smell: 110,
    col: { body: '#8d5a31', dark: '#3d2819', light: '#c9a57c', rump: '#f0e9da', nose: '#161210', antler: '#cdb994' },
  },
  jabali: {
    name: 'Jabalí', legal: true, points: 110, scale: 0.82, build: 'boar', antlers: null,
    walk: 1.0, run: 10, hearing: 36, sight: 45, smell: 140,
    col: { body: '#5e4e3f', dark: '#30271f', light: '#7d6c59', rump: '#5e4e3f', nose: '#5a4640', tusk: '#efe6cf' },
  },
  zorro: {
    name: 'Zorro', legal: true, points: 180, scale: 0.44, build: 'fox', antlers: null,
    walk: 1.4, run: 11.5, hearing: 50, sight: 70, smell: 120,
    col: { body: '#b8622a', dark: '#2a1d15', light: '#efe4d2', rump: '#b8622a', nose: '#1a1310' },
  },
  gamo: {
    name: 'Gamo', legal: true, points: 140, scale: 0.78, build: 'deer', antlers: 'fallow', spots: true,
    walk: 1.3, run: 12, hearing: 44, sight: 85, smell: 115,
    col: { body: '#b3662f', dark: '#2a1c12', light: '#f3ede2', rump: '#f5f1ea', nose: '#1a1410', antler: '#c9ad85' },
  },
  gama: {
    name: 'Gama', fem: true, legal: true, points: 70, scale: 0.68, build: 'deer', antlers: null, spots: true,
    walk: 1.3, run: 12, hearing: 46, sight: 88, smell: 115,
    col: { body: '#b8703a', dark: '#2a1c12', light: '#f3ede2', rump: '#f5f1ea', nose: '#1a1410' },
  },
  muflon: {
    name: 'Muflón', legal: true, points: 160, scale: 0.62, build: 'sheep', horns: 'mouflon',
    walk: 1.1, run: 10, hearing: 45, sight: 95, smell: 110,
    col: { body: '#6e4a2c', dark: '#2d1f14', light: '#ece4d4', rump: '#ece4d4', nose: '#e3dccd', horn: '#7a6a54', saddle: '#d9cbb1' },
  },
  cabra: {
    name: 'Macho montés', legal: true, points: 200, scale: 0.72, build: 'sheep', horns: 'ibex',
    walk: 1.1, run: 9.5, hearing: 48, sight: 110, smell: 120,
    col: { body: '#8a7457', dark: '#2a2118', light: '#cfc2aa', rump: '#cfc2aa', nose: '#3a3028', horn: '#61574a' },
  },
  cabra_h: {
    name: 'Hembra montés', fem: true, legal: true, points: 90, scale: 0.6, build: 'sheep', horns: 'ibexF',
    walk: 1.1, run: 9.5, hearing: 50, sight: 110, smell: 120,
    col: { body: '#a08766', dark: '#4a3b2b', light: '#d8ccb5', rump: '#d8ccb5', nose: '#4a3d33', horn: '#6f6454' },
  },
  lobo: {
    name: 'Lobo', legal: false, penalty: 400, scale: 0.85, build: 'wolf',
    walk: 1.5, run: 12, hearing: 60, sight: 90, smell: 180,
    col: { body: '#7a6c5a', dark: '#28221c', light: '#e2d8c6', rump: '#7a6c5a', nose: '#161210' },
  },
  liebre: {
    name: 'Liebre', fem: true, legal: true, points: 130, scale: 0.62, build: 'hare',
    walk: 1.2, run: 13, hearing: 45, sight: 60, smell: 60,
    col: { body: '#8a7155', dark: '#2a2018', light: '#ece5d7', rump: '#ece5d7', nose: '#3a2a22' },
  },
};

export const ZONES = {
  corazon: { label: 'Corazón', mult: 2.0, kill: true },
  pulmones: { label: 'Pulmones', mult: 1.6, kill: true },
  cabeza: { label: 'Cabeza', mult: 1.3, kill: true },
  cuello: { label: 'Cuello', mult: 1.2, kill: true },
  cuerpo: { label: 'Cuerpo', mult: 0.5, kill: false },
};

const BUILDS = {
  deer: { L: 0.92, bl: 1.5, bh: 0.6, bw: 0.46, neckLen: 0.56, neckR: 0.13, hs: 0.17, snout: 0.26, rest: 0.78, graze: 2.1 },
  boar: { L: 0.52, bl: 1.35, bh: 0.74, bw: 0.6, neckLen: 0.22, neckR: 0.27, hs: 0.25, snout: 0.36, rest: 1.25, graze: 1.9 },
  fox: { L: 0.55, bl: 1.45, bh: 0.46, bw: 0.38, neckLen: 0.34, neckR: 0.11, hs: 0.18, snout: 0.3, rest: 0.75, graze: 1.9 },
  sheep: { L: 0.7, bl: 1.25, bh: 0.56, bw: 0.46, neckLen: 0.34, neckR: 0.14, hs: 0.17, snout: 0.2, rest: 0.95, graze: 2.0 },
  wolf: { L: 0.58, bl: 1.35, bh: 0.52, bw: 0.42, neckLen: 0.3, neckR: 0.16, hs: 0.23, snout: 0.28, rest: 0.62, graze: 1.9 },
  hare: { L: 0.36, bl: 0.95, bh: 0.4, bw: 0.3, neckLen: 0.12, neckR: 0.11, hs: 0.16, snout: 0.13, rest: 1.05, graze: 1.75 },
};

// Pelaje: ruido anisótropo en coordenadas del modelo, así el grano viaja con el animal.
const material = customize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, envMapIntensity: 0.55 }), 'animal', (sh, r, mat) => {
  sh.uniforms.uSpots = { value: mat.userData.spots || 0 };
  sh.uniforms.uSpotBand = { value: mat.userData.spotBand || new THREE.Vector2(0, 0) };
  sh.vertexShader = 'varying vec3 vFurPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurPos = position;');
  sh.fragmentShader = `varying vec3 vFurPos;
    uniform float uSpots;
    uniform vec2 uSpotBand;
    float fh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float fn(vec3 x) {
      vec3 i = floor(x), f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(fh(i), fh(i + vec3(1, 0, 0)), f.x), mix(fh(i + vec3(0, 1, 0)), fh(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(fh(i + vec3(0, 0, 1)), fh(i + vec3(1, 0, 1)), f.x), mix(fh(i + vec3(0, 1, 1)), fh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
  ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    float fur = fn(vFurPos * vec3(38.0, 38.0, 11.0)) * 0.6 + fn(vFurPos * vec3(130.0, 130.0, 34.0)) * 0.4;
    diffuseColor.rgb *= 0.84 + 0.3 * fur;
    if (uSpots > 0.5) {
      // Motas blancas del gamo en los costados.
      float band = smoothstep(uSpotBand.x, uSpotBand.x + 0.06, vFurPos.y) * (1.0 - smoothstep(uSpotBand.y - 0.05, uSpotBand.y, vFurPos.y));
      band *= 1.0 - smoothstep(0.42, 0.55, abs(vFurPos.z + 0.08));
      float sp = smoothstep(0.74, 0.79, fn(vFurPos * vec3(38.0, 38.0, 30.0)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.87, 0.8), sp * band);
    }`);
});

const geoCache = new Map();

const lin = (h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Perfiles anatómicos: secciones [z, y relativa al lomo, semiancho, semialto].
const TORSO = {
  deer: [[-0.8, 0.07, 0.02, 0.02], [-0.77, 0.06, 0.13, 0.15], [-0.68, 0.04, 0.2, 0.25], [-0.5, 0.02, 0.235, 0.3], [-0.25, -0.01, 0.235, 0.29],
    [0.0, 0.0, 0.24, 0.3], [0.25, 0.03, 0.225, 0.33], [0.45, 0.06, 0.185, 0.31], [0.58, 0.14, 0.13, 0.2], [0.62, 0.2, 0.02, 0.02]],
  boar: [[-0.7, 0.05, 0.02, 0.02], [-0.66, 0.04, 0.16, 0.2], [-0.55, 0.03, 0.25, 0.3], [-0.3, 0.02, 0.29, 0.34], [0.0, 0.05, 0.3, 0.37],
    [0.25, 0.1, 0.29, 0.4], [0.45, 0.1, 0.25, 0.37], [0.6, 0.05, 0.18, 0.28], [0.66, 0.02, 0.03, 0.03]],
  fox: [[-0.72, 0.03, 0.02, 0.02], [-0.68, 0.03, 0.1, 0.12], [-0.55, 0.02, 0.16, 0.2], [-0.3, 0.0, 0.17, 0.21], [0.0, 0.0, 0.165, 0.21],
    [0.3, 0.02, 0.17, 0.23], [0.52, 0.04, 0.14, 0.2], [0.64, 0.1, 0.09, 0.12], [0.67, 0.12, 0.02, 0.02]],
  sheep: [[-0.64, 0.06, 0.02, 0.02], [-0.6, 0.05, 0.14, 0.16], [-0.5, 0.03, 0.21, 0.25], [-0.3, 0.01, 0.235, 0.28], [0.0, 0.02, 0.24, 0.29],
    [0.25, 0.04, 0.23, 0.3], [0.42, 0.06, 0.19, 0.28], [0.53, 0.12, 0.13, 0.19], [0.57, 0.16, 0.02, 0.02]],
  wolf: [[-0.68, 0.04, 0.02, 0.02], [-0.64, 0.04, 0.12, 0.14], [-0.52, 0.02, 0.18, 0.21], [-0.28, -0.01, 0.18, 0.22], [0.0, 0.0, 0.19, 0.24],
    [0.28, 0.04, 0.2, 0.27], [0.48, 0.07, 0.17, 0.25], [0.6, 0.13, 0.11, 0.16], [0.64, 0.16, 0.02, 0.02]],
  hare: [[-0.48, 0.03, 0.02, 0.02], [-0.45, 0.04, 0.12, 0.14], [-0.3, 0.05, 0.16, 0.2], [-0.1, 0.04, 0.15, 0.19], [0.1, 0.03, 0.13, 0.17],
    [0.28, 0.06, 0.1, 0.14], [0.36, 0.1, 0.02, 0.02]],
};
// Patas: [x, y, z, semiancho, semifondo] desde la cadera (escala de ciervo).
const LEG_FRONT = [[0, 0.06, 0.0, 0.085, 0.11], [0, -0.22, 0.025, 0.068, 0.09], [0, -0.46, 0.0, 0.042, 0.048], [0, -0.52, 0.0, 0.036, 0.042],
  [0, -0.82, 0.008, 0.028, 0.032], [0, -0.865, 0.018, 0.033, 0.038], [0, -0.9, 0.035, 0.03, 0.042], [0, -0.92, 0.04, 0.028, 0.036]];
const LEG_HIND = [[0, 0.1, 0.0, 0.1, 0.17], [0, -0.12, -0.04, 0.085, 0.14], [0, -0.36, -0.11, 0.048, 0.058], [0, -0.43, -0.1, 0.035, 0.042],
  [0, -0.82, -0.005, 0.028, 0.032], [0, -0.865, 0.01, 0.033, 0.038], [0, -0.9, 0.03, 0.03, 0.042], [0, -0.92, 0.035, 0.028, 0.036]];

// cls: clase de edad (0 joven, 1 adulto, 2 viejo) para cuernas y cuernos.
function buildGeometry(key, cls = 1) {
  const cacheKey = `${key}|${cls}`;
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey);
  const ak = [0.72, 1, 1.22][cls];
  const sp = SPECIES[key];
  const b = BUILDS[sp.build];
  const build = sp.build;
  const C = {};
  for (const k of Object.keys(sp.col)) C[k] = lin(sp.col[k]);
  const { L, bl, bh, neckLen, neckR, hs, snout } = b;
  const by = L + bh * 0.28;
  const sphere = new THREE.SphereGeometry(1, 16, 12);

  // --- Tronco ---
  const torsoSecs = subdivide(TORSO[build].map(([z, dy, w, h]) => ({ p: [0, by + dy, z], w, h })), 3);
  const torsoCol = (t, c, s, v) => {
    let col = C.body;
    col = mixc(col, C.light, sm(-0.3, -0.85, s));
    col = mixc(col, C.dark, sm(0.5, 1.0, s) * (build === 'boar' ? 0.6 : 0.35));
    if (build === 'deer') {
      const rump = sm(-0.63, -0.73, v.z) * sm(-0.4, 0.1, s) * (1 - sm(0.5, 0.8, Math.abs(c)));
      col = mixc(col, C.rump, rump);
      if (sp.spots) {
        // Gamo: línea blanca a lo largo del bajo del costado y vientre blanco.
        const line = sm(-0.26, -0.33, s) * (1 - sm(-0.4, -0.47, s)) * sm(-0.6, -0.45, v.z) * (1 - sm(0.25, 0.4, v.z));
        col = mixc(col, C.light, line * 0.9);
        col = mixc(col, C.light, sm(-0.6, -0.75, s) * 0.8);
        // Borde negro del escudo.
        col = mixc(col, C.dark, sm(-0.59, -0.63, v.z) * (1 - sm(-0.66, -0.7, v.z)) * sm(-0.2, 0.3, s) * 0.8);
      }
    }
    if (build === 'fox') col = mixc(col, C.light, sm(0.35, 0.55, v.z) * sm(-0.05, -0.55, s));
    if (build === 'wolf') {
      col = mixc(col, C.dark, sm(0.55, 0.95, s) * 0.45 * sm(0.1, 0.4, v.z));
      col = mixc(col, C.light, sm(0.3, 0.55, v.z) * sm(0.0, -0.6, s) * 0.7);
    }
    if (key === 'muflon') col = mixc(col, C.saddle, sm(0.8, 0.95, Math.abs(c)) * sm(0.2, 0.06, Math.abs(v.z + 0.05)) * sm(-0.3, -0.1, s) * sm(0.3, 0.1, s) * 0.9);
    if (key === 'cabra') {
      col = mixc(col, C.dark, sm(-0.15, -0.35, s) * sm(-0.62, -0.45, s) * 0.8);
      col = mixc(col, C.dark, sm(0.3, 0.5, v.z) * sm(0.2, -0.3, s) * 0.8);
    }
    if (build === 'sheep') col = mixc(col, C.rump, sm(-0.5, -0.62, v.z) * sm(-0.6, 0.2, s));
    return col;
  };
  const torso = [loft(torsoSecs, [0, 1, 0], 28, torsoCol, 2.25)];
  if (build === 'deer' && sp.spots) {
    // Cola larga del gamo: blanca con una franja negra.
    torso.push(P(sphere, sp.col.rump, [0, by + 0.0, -0.79], [0.25, 0, 0], [0.055, 0.14, 0.045]));
    torso.push(P(sphere, sp.col.dark, [0, by + 0.0, -0.815], [0.25, 0, 0], [0.025, 0.14, 0.03]));
  } else if (build === 'deer') {
    torso.push(P(sphere, sp.col.rump, [0, by + 0.07, -0.8], [0.3, 0, 0], [0.05, 0.09, 0.05]));
  } else if (build === 'boar') {
    // Crin erizada sobre el lomo.
    for (let i = 0; i < 14; i++) {
      const z = 0.5 - i * 0.075;
      const top = by + 0.05 + 0.37 * (1 - Math.abs(z - 0.2) * 0.5);
      torso.push(P(new THREE.ConeGeometry(0.035, 0.13, 4), sp.col.dark, [0, top, z], [-0.5, 0, 0]));
    }
    torso.push(Bt([0, by + 0.1, -0.66], [0, by - 0.2, -0.74], 0.025, 0.015, sp.col.dark, 5));
  } else if (build === 'sheep') {
    torso.push(P(sphere, sp.col.dark, [0, by + 0.06, -0.64], [0.4, 0, 0], [0.04, 0.07, 0.04]));
  } else if (build === 'hare') {
    torso.push(P(sphere, sp.col.light, [0, by + 0.05, -0.49], [0, 0, 0], [0.06, 0.06, 0.05]));
  } else if (build === 'wolf') {
    const tailSecs = subdivide([[0.0, -0.62, 0.05, 0.05], [-0.1, -0.78, 0.075, 0.08], [-0.28, -0.93, 0.08, 0.085], [-0.45, -1.02, 0.06, 0.065],
      [-0.52, -1.05, 0.01, 0.01]].map(([dy, z, w, h]) => ({ p: [0, by + dy, z], w, h })), 3);
    torso.push(loft(tailSecs, [0, 1, 0], 14, (t) => mixc(C.body, C.dark, sm(0.7, 0.85, t)), 2));
  } else if (build === 'fox') {
    const tailSecs = subdivide([[0.02, -0.66, 0.05, 0.05], [-0.02, -0.85, 0.1, 0.11], [-0.1, -1.05, 0.13, 0.14], [-0.2, -1.22, 0.11, 0.12],
      [-0.27, -1.36, 0.05, 0.06], [-0.3, -1.42, 0.01, 0.01]].map(([dy, z, w, h]) => ({ p: [0, by + dy, z], w, h })), 3);
    torso.push(loft(tailSecs, [0, 1, 0], 16, (t) => mixc(C.body, C.light, sm(0.78, 0.86, t)), 2));
  }

  // --- Cuello y cabeza (se mueven juntos al pastar o al mirar) ---
  const stag = sp.antlers === 'stag';
  const nr = neckR * (stag ? 1.22 : 1);
  const neckSecs = subdivide([
    { p: [0, -nr * 0.9, -0.02], w: nr * 1.0, h: nr * 1.45 },
    { p: [0, neckLen * 0.45, 0.0], w: nr * 0.82, h: nr * 1.12 },
    { p: [0, neckLen + 0.02, 0.0], w: nr * 0.66, h: nr * 0.9 },
  ], 4);
  const neckCol = (t, c, s) => {
    let col = C.body;
    if (stag) col = mixc(col, C.dark, sm(0.1, 0.8, s) * 0.65);
    else if (build === 'deer' || build === 'fox') col = mixc(col, C.light, sm(0.3, 0.9, s) * (sp.spots ? 0.95 : 0.6));
    return mixc(col, C.dark, sm(-0.5, -1, s) * 0.25);
  };
  const neck = [loft(neckSecs, [0, 0, 1], 20, neckCol, 2.1)];

  const headRot = -b.rest + 0.35;
  const hm = new THREE.Matrix4().makeRotationX(headRot).setPosition(0, neckLen, 0);
  const H = (g) => {
    g.applyMatrix4(hm);
    return g;
  };
  const mw = { deer: 0.8, boar: 0.95, fox: 0.6, sheep: 0.85, wolf: 0.7, hare: 0.8 }[build], mh = { deer: 0.85, boar: 0.85, fox: 0.6, sheep: 0.9, wolf: 0.68, hare: 0.85 }[build];
  const snoutEnd = hs * 0.3 + snout;
  const headSecs = subdivide([
    [-hs * 0.55, hs * 0.25, 0.01, 0.01], [-hs * 0.45, hs * 0.28, hs * 0.5, hs * 0.55], [-hs * 0.12, hs * 0.32, hs * 0.64, hs * 0.64],
    [hs * 0.3, hs * 0.22, hs * 0.54, hs * 0.56], [hs * 0.3 + snout * 0.45, hs * 0.04, hs * 0.42 * mw, hs * 0.46 * mh],
    [hs * 0.3 + snout * 0.85, -hs * 0.06, hs * 0.33 * mw, hs * 0.36 * mh], [snoutEnd, -hs * 0.08, hs * 0.28 * mw, hs * 0.3 * mh],
    [snoutEnd + 0.012, -hs * 0.08, hs * 0.1, hs * 0.1],
  ].map(([z, y, w, h]) => ({ p: [0, y, z], w, h })), 3);
  const headCol = (t, c, s, v) => {
    let col = C.body;
    if (build === 'deer') col = mixc(col, C.light, sm(hs * 0.2, hs * 0.5, v.z) * sm(-0.3, -0.8, s) * 0.8);
    if (build === 'fox') col = mixc(col, C.light, sm(0.0, hs * 0.3, v.z) * sm(0.0, -0.5, s));
    if (build === 'boar') col = mixc(col, C.dark, 0.3);
    if (build === 'wolf') col = mixc(col, C.light, sm(0.0, hs * 0.3, v.z) * sm(0.0, -0.6, s) * 0.8);
    if (key === 'muflon') col = mixc(col, C.light, sm(hs * 0.25, hs * 0.5, v.z));
    if (key === 'cabra') col = mixc(col, C.dark, sm(hs * 0.1, hs * 0.4, v.z) * 0.6);
    if (build === 'sheep' && key !== 'muflon') return mixc(col, C.nose, sm(hs * 0.3 + snout * 0.8, snoutEnd, v.z) * 0.6);
    return mixc(col, C.nose, sm(hs * 0.3 + snout * 0.72, snoutEnd - 0.005, v.z));
  };
  neck.push(H(loft(headSecs, [0, 1, 0], 22, headCol, 2.2)));
  for (const sx of [-1, 1]) {
    neck.push(H(P(sphere, '#0b0908', [sx * hs * 0.5, hs * 0.44, hs * 0.16], [0, 0, 0], [hs * 0.13, hs * 0.13, hs * 0.13])));
  }
  const earLen = { fox: hs * 1.15, wolf: hs * 0.8, boar: hs * 0.75, sheep: hs * 0.85, hare: hs * 2.6 }[build] ?? hs * 1.3;
  for (const sx of [-1, 1]) {
    if (build === 'hare') {
      const rot = [-0.5, 0, -sx * 0.25];
      const pos = [sx * hs * 0.3, hs * 0.7 + earLen * 0.45, -hs * 0.35];
      neck.push(H(P(sphere, sp.col.body, pos, rot, [hs * 0.22, earLen * 0.5, hs * 0.09])));
      neck.push(H(P(sphere, sp.col.dark, [pos[0], pos[1] + earLen * 0.4, pos[2] - earLen * 0.2], rot, [hs * 0.16, earLen * 0.13, hs * 0.095])));
    } else if (build === 'fox' || build === 'wolf') {
      neck.push(H(P(new THREE.ConeGeometry(hs * 0.3, earLen, 8), sp.col.dark, [sx * hs * 0.45, hs * 0.75 + earLen * 0.4, -hs * 0.2], [-0.2, 0, -sx * 0.25])));
    } else {
      const rot = [-0.35, 0, -sx * (build === 'boar' ? 0.5 : 1.0)];
      const pos = [sx * hs * 0.55, hs * 0.8 + earLen * 0.25, -hs * 0.25];
      neck.push(H(P(sphere, sp.col.body, pos, rot, [hs * 0.3, earLen * 0.5, hs * 0.1])));
      neck.push(H(P(sphere, sp.col.light, [pos[0], pos[1], pos[2] + hs * 0.05], rot, [hs * 0.22, earLen * 0.42, hs * 0.06])));
    }
  }
  if (build === 'boar') {
    for (const sx of [-1, 1]) {
      neck.push(H(P(new THREE.ConeGeometry(0.025, 0.12, 6), sp.col.tusk, [sx * hs * 0.3, -hs * 0.02, hs * 0.3 + snout * 0.8], [-0.5, 0, sx * 0.6])));
    }
  }
  if (sp.antlers === 'stag') {
    for (const sx of [-1, 1]) {
      const p0 = [sx * hs * 0.4, hs * 0.95, -hs * 0.05];
      const p1 = [p0[0] + sx * 0.2 * ak, p0[1] + 0.3 * ak, -0.12 * ak];
      const p2 = [p1[0] + sx * 0.13 * ak, p1[1] + 0.3 * ak, -0.1 * ak];
      const p3 = [p2[0] + sx * 0.06 * ak, p2[1] + 0.26 * ak, -0.02 * ak];
      const p4 = [p3[0] - sx * 0.02 * ak, p3[1] + 0.2 * ak, 0.08 * ak];
      const r = 0.8 + ak * 0.2;
      const beam = [[p0, p1, 0.042 * r, 0.036 * r], [p1, p2, 0.036 * r, 0.03 * r], [p2, p3, 0.03 * r, 0.024 * r], [p3, p4, 0.024 * r, 0.01]];
      for (const [a, c, r1, r2] of beam) neck.push(H(Bt(a, c, r1, r2, sp.col.antler, 8)));
      neck.push(H(P(sphere, '#5a4a36', p0, [0, 0, 0], [0.055, 0.035, 0.055])));
      const tine = (from, dir, len, r) => neck.push(H(Bt(from, [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len], r, 0.006, sp.col.antler, 6)));
      tine([p0[0] + sx * 0.03, p0[1] + 0.07, p0[2]], [sx * 0.1, 0.35, 0.93], 0.26 * ak, 0.026);
      if (cls > 0) tine([p0[0] + sx * 0.08, p0[1] + 0.16 * ak, -0.05], [sx * 0.1, 0.45, 0.88], 0.22 * ak, 0.022);
      tine(p2, [sx * 0.15, 0.3, 0.94], 0.2 * ak, 0.02);
      tine(p3, [sx * 0.5, 0.75, -0.3], 0.16 * ak, 0.017);
      if (cls > 0) tine(p3, [-sx * 0.2, 0.8, 0.45], 0.15 * ak, 0.016);
      if (cls > 1) {
        // Corona de un venado viejo.
        tine(p4, [sx * 0.4, 0.8, 0.3], 0.12, 0.014);
        tine(p3, [sx * 0.2, 0.6, -0.7], 0.12, 0.014);
      }
    }
  } else if (sp.antlers === 'roe') {
    for (const sx of [-1, 1]) {
      const p0 = [sx * hs * 0.35, hs * 0.95, 0];
      const p1 = [p0[0] + sx * 0.03, p0[1] + 0.28, -0.03];
      neck.push(H(Bt(p0, p1, 0.034, 0.014, sp.col.antler, 7)));
      neck.push(H(P(sphere, '#5a4a36', p0, [0, 0, 0], [0.045, 0.03, 0.045])));
      neck.push(H(Bt([p0[0], p0[1] + 0.15, 0], [p0[0] + sx * 0.02, p0[1] + 0.23, 0.1], 0.017, 0.006, sp.col.antler, 6)));
      neck.push(H(Bt([p0[0], p0[1] + 0.19, 0], [p0[0] + sx * 0.02, p0[1] + 0.26, -0.1], 0.017, 0.006, sp.col.antler, 6)));
    }
  }

  if (sp.antlers === 'fallow') {
    // Gamo: vara alta con candil y puntas, que arriba se abre en una pala plana con dedos.
    const ak2 = ak * 1.45;
    for (const sx of [-1, 1]) {
      const ak = ak2;
      const p0 = [sx * hs * 0.38, hs * 0.95, -hs * 0.05];
      const p1 = [p0[0] + sx * 0.07 * ak, p0[1] + 0.2 * ak, -0.05 * ak];
      const p2 = [p1[0] + sx * 0.06 * ak, p1[1] + 0.16 * ak, -0.1 * ak];
      neck.push(H(Bt(p0, p1, 0.028, 0.024, sp.col.antler, 8)));
      neck.push(H(Bt(p1, p2, 0.024, 0.02, sp.col.antler, 8)));
      neck.push(H(P(sphere, '#5a4a36', p0, [0, 0, 0], [0.038, 0.026, 0.038])));
      // Candil (hacia delante, abajo) y punta media.
      neck.push(H(Bt([p0[0], p0[1] + 0.04, p0[2]], [p0[0] + sx * 0.02, p0[1] + 0.13 * ak, 0.15 * ak], 0.017, 0.005, sp.col.antler, 6)));
      neck.push(H(Bt([p1[0], p1[1] - 0.02, p1[2]], [p1[0] + sx * 0.02, p1[1] + 0.06 * ak, 0.13 * ak], 0.015, 0.005, sp.col.antler, 6)));
      // Pala: placa que se ensancha hacia arriba y hacia atrás.
      const palmPts = subdivide([
        { p: p2, w: 0.012, h: 0.022 },
        { p: [p2[0] + sx * 0.03 * ak, p2[1] + 0.1 * ak, p2[2] - 0.05 * ak], w: 0.011, h: 0.055 * ak },
        { p: [p2[0] + sx * 0.05 * ak, p2[1] + 0.2 * ak, p2[2] - 0.08 * ak], w: 0.01, h: 0.08 * ak },
        { p: [p2[0] + sx * 0.06 * ak, p2[1] + 0.27 * ak, p2[2] - 0.08 * ak], w: 0.008, h: 0.06 * ak },
      ], 3);
      neck.push(H(loft(palmPts, [0, 0, 1], 10, () => lin(sp.col.antler), 2.8)));
      // Dedos en el borde de la pala.
      const fingers = 3 + cls;
      for (let i = 0; i < fingers; i++) {
        const t = (i + 0.5) / fingers;
        const base = [p2[0] + sx * (0.03 + t * 0.03) * ak, p2[1] + (0.1 + t * 0.17) * ak, p2[2] - (0.05 + t * 0.04) * ak - 0.06 * ak];
        neck.push(H(Bt(base, [base[0] + sx * 0.02, base[1] + 0.05 * ak, base[2] - 0.05 * ak], 0.011, 0.003, sp.col.antler, 5)));
      }
      const top = [p2[0] + sx * 0.06 * ak, p2[1] + 0.27 * ak, p2[2] - 0.02 * ak];
      neck.push(H(Bt(top, [top[0] + sx * 0.01, top[1] + 0.07 * ak, top[2] + 0.03 * ak], 0.011, 0.003, sp.col.antler, 5)));
    }
  }
  if (sp.horns) {
    const hornSegs = (pts, r0, r1) => {
      const sm2 = subdivide(pts.map((q) => ({ p: q, w: 1, h: 1 })), 4);
      for (let i = 0; i < sm2.length - 1; i++) {
        const t = i / (sm2.length - 1);
        neck.push(H(Bt(sm2[i].p, sm2[i + 1].p, r0 + (r1 - r0) * t, r0 + (r1 - r0) * (t + 1 / sm2.length), sp.col.horn, 9)));
      }
    };
    for (const sx of [-1, 1]) {
      if (sp.horns === 'mouflon') {
        // Espiral: sube, va hacia atrás, baja por detrás de la oreja y vuelve hacia delante.
        const pts = [];
        const cy = hs * 0.5, cz = -hs * 0.55;
        const phi0 = Math.atan2(hs * 0.45, hs * 0.45);
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const phi = phi0 + t * Math.PI * 1.55 * (0.8 + ak * 0.2);
          const R = hs * 0.62 * (1 + 0.3 * t) * ak;
          pts.push([sx * (hs * 0.32 + t * 0.13 * ak), cy + Math.sin(phi) * R, cz + Math.cos(phi) * R]);
        }
        hornSegs(pts, 0.05 * ak, 0.012);
      } else if (sp.horns === 'ibex') {
        // Cabra montés: cuernos en lira, hacia atrás y afuera, con las puntas hacia arriba.
        const b0 = [sx * hs * 0.3, hs * 0.9, -hs * 0.05];
        const pts = [b0, [b0[0] + sx * 0.04 * ak, b0[1] + 0.07 * ak, b0[2] - 0.14 * ak], [b0[0] + sx * 0.14 * ak, b0[1] + 0.1 * ak, b0[2] - 0.35 * ak],
          [b0[0] + sx * 0.28 * ak, b0[1] + 0.06 * ak, b0[2] - 0.55 * ak], [b0[0] + sx * 0.36 * ak, b0[1] + 0.14 * ak, b0[2] - 0.68 * ak]];
        hornSegs(pts, 0.06 * ak, 0.012);
        // Nudos anuales en la cara delantera del cuerno.
        const knots = subdivide(pts.map((q) => ({ p: q, w: 1, h: 1 })), 4);
        for (let i = 1; i < knots.length * 0.7; i += 2) {
          const t = i / knots.length;
          neck.push(H(P(sphere, sp.col.horn, knots[i].p, [0, 0, 0], [0.066 * (1 - t * 0.7) * ak, 0.02, 0.066 * (1 - t * 0.7) * ak])));
        }
      } else {
        const b0 = [sx * hs * 0.28, hs * 0.9, -hs * 0.05];
        hornSegs([b0, [b0[0] + sx * 0.03, b0[1] + 0.12, b0[2] - 0.07], [b0[0] + sx * 0.06, b0[1] + 0.19, b0[2] - 0.2]], 0.022, 0.006);
      }
    }
  }

  // --- Patas (pivote en la cadera) ---
  const k = L / 0.92;
  const th = { deer: 1, boar: 1.55, fox: 0.85, sheep: 1.15, wolf: 1.3, hare: 1.1 }[build];
  const legCol = (t) => {
    let col = mixc(C.body, C.dark, sm(0.45, 0.8, t) * (build === 'fox' ? 0.9 : 0.35));
    if (key === 'muflon') col = mixc(col, C.light, sm(0.4, 0.6, t));
    if (sp.spots) col = mixc(col, C.light, sm(0.15, 0.5, t) * 0.45);
    if (key === 'cabra' || build === 'wolf') col = mixc(col, C.dark, sm(0.15, 0.4, t) * sm(0.85, 0.6, t) * 0.7);
    return mixc(col, lin('#1c1712'), sm(0.86, 0.92, t));
  };
  const makeLeg = (table) => loft(subdivide(table.map(([x, y, z, w, h]) => ({ p: [x, y * k, z * k], w: w * th, h: h * th })), 3), [0, 0, 1], 14, legCol, 2.1);

  const result = {
    b, by,
    torso: merge(torso),
    neck: merge(neck),
    front: merge([makeLeg(LEG_FRONT)]),
    hind: merge([makeLeg(LEG_HIND)]),
  };
  geoCache.set(cacheKey, result);
  return result;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Vector3();

let nextId = 1;

export class Animal {
  constructor(key, herd, x, z, scene) {
    this.id = nextId++;
    this.key = key;
    this.sp = SPECIES[key];
    this.herd = herd;
    // Clase de edad: los machos jóvenes llevan cuernas pequeñas; los viejos, grandes.
    const horned = this.sp.antlers || this.sp.horns;
    const rr = Math.random();
    this.cls = horned ? (rr < 0.3 ? 0 : rr < 0.8 ? 1 : 2) : 1;
    const g = buildGeometry(key, this.cls);
    this.b = g.b;
    const b = g.b;
    // Cada individuo con su tono de pelaje.
    const mat = material.clone();
    // clone() no copia los ganchos del shader: se reutilizan los del material base.
    mat.onBeforeCompile = material.onBeforeCompile;
    mat.customProgramCacheKey = material.customProgramCacheKey;
    const v = 0.9 + Math.random() * 0.2;
    mat.color.setRGB(v * (0.96 + Math.random() * 0.08), v, v * (0.94 + Math.random() * 0.08));
    if (this.sp.spots) {
      mat.userData.spots = 1;
      mat.userData.spotBand = new THREE.Vector2(g.by - b.bh * 0.12, g.by + b.bh * 0.34);
    }
    this.material = mat;

    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    const s = this.sp.scale * (0.9 + Math.random() * 0.14) * (horned ? [0.88, 1, 1.08][this.cls] : 1);
    this.scale = s;
    this.group.scale.setScalar(s);

    const mk = (geo) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.body.add(mk(g.torso));

    this.neck = new THREE.Group();
    this.neck.position.set(0, g.by + b.bh * 0.22, b.bl * 0.38);
    this.neck.rotation.order = 'YXZ';
    this.neck.add(mk(g.neck));
    this.body.add(this.neck);

    // Modelo 3D real si existe: el esqueleto generado sigue ahí (invisible) para las zonas de impacto.
    this.model = instantiate(key, b.bl * 1.12);
    if (this.model) this.group.add(this.model.root);

    this.legs = [];
    const hx = b.bw * 0.27;
    for (const [lx, lz, hind] of [[hx, b.bl * 0.3, false], [-hx, b.bl * 0.3, false], [hx, -b.bl * 0.32, true], [-hx, -b.bl * 0.32, true]]) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, b.L, lz);
      pivot.add(mk(hind ? g.hind : g.front));
      this.body.add(pivot);
      this.legs.push(pivot);
    }

    if (this.model) {
      this.body.traverse((o) => {
        if (o.isMesh) o.visible = false;
      });
    }

    // Zonas de impacto como puntos ligados al esqueleto.
    const by = g.by;
    const marker = (parent, pos, r, zone) => {
      const o = new THREE.Object3D();
      o.position.set(...pos);
      parent.add(o);
      return { o, r, zone };
    };
    this.outer = [
      marker(this.body, [0, by, b.bl * 0.26], b.bh * 0.52, 'cuerpo'),
      marker(this.body, [0, by, -0.02], b.bh * 0.5, 'cuerpo'),
      marker(this.body, [0, by, -b.bl * 0.3], b.bh * 0.48, 'cuerpo'),
      marker(this.neck, [0, b.neckLen * 0.45, 0], b.neckR * 1.25, 'cuello'),
      marker(this.neck, [0, b.neckLen + b.hs * 0.3, b.hs * 0.3], b.hs * 1.15, 'cabeza'),
    ];
    this.vitals = [
      marker(this.body, [0, by - b.bh * 0.16, b.bl * 0.29], b.bh * 0.15, 'corazon'),
      marker(this.body, [0, by + b.bh * 0.06, b.bl * 0.23], b.bh * 0.27, 'pulmones'),
    ];
    this.boundR = (b.bl * 0.75 + b.neckLen + 0.5) * s;

    this.pos = new THREE.Vector3(x, groundAt(x, z), z);
    this.vel = new THREE.Vector3();
    this.heading = Math.random() * Math.PI * 2;
    this.desired = this.heading;
    this.speed = 0;
    this.targetSpeed = 0;
    this.phase = Math.random() * 10;
    this.neckPitch = b.rest;
    this.neckYaw = 0;
    this.state = 'graze';
    this.timer = 2 + Math.random() * 6;
    this.suspicion = 0;
    this.threat = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.fleeJitter = 0;
    this.wounded = false;
    this.bleedTimer = 0;
    this.dropTimer = 0;
    this.deathT = 0;
    this.fallSide = Math.random() < 0.5 ? -1 : 1;
    this.reactDelay = -1;
    this.reactFrom = new THREE.Vector3();
    this.reactStrength = 0;
    this.spottedUntil = 0;
    this.distToPlayer = 1e9;

    scene.add(this.group);
    this.syncTransform();
  }

  get alive() {
    return this.state !== 'dead';
  }

  setState(s, t) {
    this.state = s;
    this.timer = t;
  }

  startFlee(fromX, fromZ) {
    if (!this.alive) return;
    this.threat.set(fromX, 0, fromZ);
    const fleeing = this.state === 'flee';
    this.setState('flee', 7 + Math.random() * 6 + (this.wounded ? 6 : 0));
    this.suspicion = 3;
    if (!fleeing) {
      this.fleeJitter = (Math.random() - 0.5) * 0.9;
      if (this.onAlarm) this.onAlarm(this);
    }
    if (this.herd) this.herd.alarm(this, fromX, fromZ);
  }

  // Reacción retardada: el sonido del disparo tarda en llegar (343 m/s).
  hearShot(x, z, delay, strength) {
    if (!this.alive) return;
    if (this.reactDelay >= 0 && this.reactStrength >= strength) return;
    this.reactDelay = delay;
    this.reactFrom.set(x, 0, z);
    this.reactStrength = strength;
  }

  // Devuelve 'kill', 'wound' o 'dead'.
  hit(zone) {
    if (!this.alive) return 'dead';
    if (ZONES[zone].kill || this.wounded) {
      this.die();
      return 'kill';
    }
    this.wounded = true;
    this.bleedTimer = 22 + Math.random() * 16;
    this.startFlee(this.pos.x - Math.sin(this.heading) * 5, this.pos.z - Math.cos(this.heading) * 5);
    return 'wound';
  }

  die() {
    this.state = 'dead';
    this.deathT = 0;
    this.reactDelay = -1;
  }

  update(dt, ctx) {
    if (this.state === 'dead') {
      this.updateDeath(dt);
      return;
    }
    const sp = this.sp, b = this.b;

    if (this.reactDelay >= 0) {
      this.reactDelay -= dt;
      if (this.reactDelay < 0) {
        if (this.reactStrength >= 1) this.startFlee(this.reactFrom.x, this.reactFrom.z);
        else {
          this.suspicion = Math.max(this.suspicion, 1.4);
          this.threat.copy(this.reactFrom);
          if (this.state !== 'flee') this.setState('alert', 5 + Math.random() * 4);
        }
      }
    }

    // --- Percepción ---
    const dx = ctx.player.x - this.pos.x, dz = ctx.player.z - this.pos.z;
    const d = Math.hypot(dx, dz) + 1e-3;
    this.distToPlayer = d;
    let s = 0;
    const hearR = sp.hearing * ctx.noise;
    if (d < hearR) s += 1.8 * (1 - d / hearR) + 0.35;
    const sightR = sp.sight * ctx.visibility;
    if (d < sightR) {
      const facing = (Math.sin(this.heading) * dx + Math.cos(this.heading) * dz) / d;
      if (facing > -0.35 || this.state === 'alert') s += 1.3 * (1 - d / sightR) + 0.25;
    }
    if (d < sp.smell) {
      // El viento lleva tu olor hacia el animal.
      const along = -(ctx.wind.x * dx + ctx.wind.z * dz) / d;
      if (along > 0.88) s += 2.2 * (1 - d / sp.smell) + 0.5;
    }
    if (s > 0) this.suspicion = Math.min(3, this.suspicion + s * dt);
    else this.suspicion = Math.max(0, this.suspicion - dt * 0.3);

    if (this.state !== 'flee') {
      if (this.suspicion > 2.6) this.startFlee(ctx.player.x, ctx.player.z);
      else if (this.suspicion > 1 && this.state !== 'alert') {
        this.threat.set(ctx.player.x, 0, ctx.player.z);
        this.setState('alert', 5 + Math.random() * 4);
        if (this.herd) this.herd.nudge(this);
        if (this.onAlert) this.onAlert(this);
      }
    }

    // Berrea: los machos de ciervo braman de vez en cuando si están tranquilos.
    if ((this.sp.antlers === 'stag' || this.key === 'lobo') && this.state !== 'flee' && this.onRoar) {
      this.roarT = (this.roarT ?? 8 + Math.random() * 40) - dt;
      if (this.roarT <= 0) {
        this.roarT = 25 + Math.random() * 45;
        this.onRoar(this);
      }
    }

    // --- Comportamiento ---
    let neckTarget = b.rest;
    let yawTarget = 0;
    this.timer -= dt;
    switch (this.state) {
      case 'graze':
        this.targetSpeed = 0;
        neckTarget = b.graze;
        if (this.timer <= 0) this.pickIdle();
        break;
      case 'idle':
        this.targetSpeed = 0;
        yawTarget = Math.sin(this.phase * 0.3 + this.id) * 0.6;
        if (this.timer <= 0) this.pickIdle();
        break;
      case 'walk': {
        this.targetSpeed = sp.walk;
        this.desired = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
        if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 1.5 || this.timer <= 0) {
          this.setState('graze', 5 + Math.random() * 10);
        }
        neckTarget = b.rest + 0.25;
        break;
      }
      case 'alert': {
        this.targetSpeed = 0;
        const ang = Math.atan2(this.threat.x - this.pos.x, this.threat.z - this.pos.z);
        const rel = wrapAngle(ang - this.heading);
        if (Math.abs(rel) > 1.1) this.desired = ang;
        yawTarget = clamp(rel, -0.9, 0.9);
        neckTarget = b.rest - 0.3;
        if (this.timer <= 0) {
          if (this.suspicion > 1.5) this.startFlee(this.threat.x, this.threat.z);
          else this.setState('idle', 2 + Math.random() * 3);
        }
        break;
      }
      case 'flee': {
        this.targetSpeed = sp.run * (this.wounded ? 0.62 : 1);
        const away = Math.atan2(this.pos.x - this.threat.x, this.pos.z - this.threat.z);
        this.desired = away + this.fleeJitter + Math.sin(this.phase * 0.07) * 0.25;
        // La liebre huye en zigzag.
        if (this.sp.build === 'hare') this.desired += Math.sign(Math.sin(this.phase * 0.35)) * 0.7;
        neckTarget = b.rest - 0.1;
        if (this.timer <= 0) {
          this.suspicion = 0.7;
          this.fleeJitter = 0;
          if (this.herd) this.herd.anchor.set(this.pos.x, 0, this.pos.z);
          this.pickWalk(25);
        }
        break;
      }
    }

    // No salir del coto.
    const lim = PLAY_HALF - 25;
    if (Math.abs(this.pos.x) > lim || Math.abs(this.pos.z) > lim) {
      this.desired = Math.atan2(-this.pos.x, -this.pos.z);
      if (this.state === 'walk') this.target.set(this.pos.x * 0.8, 0, this.pos.z * 0.8);
    }

    // --- Movimiento ---
    const turnRate = this.state === 'flee' ? 3.2 : 1.6;
    const diff = wrapAngle(this.desired - this.heading);
    this.heading += clamp(diff, -turnRate * dt, turnRate * dt);
    const accel = this.targetSpeed > this.speed ? (this.state === 'flee' ? 9 : 2) : 6;
    this.speed += clamp(this.targetSpeed - this.speed, -accel * dt, accel * dt);
    // Frena en pendientes muy fuertes.
    this.vel.set(Math.sin(this.heading) * this.speed, 0, Math.cos(this.heading) * this.speed);
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (waterDepth(nx + this.vel.x * 0.4, nz + this.vel.z * 0.4) > 0.25) {
      // Agua: se da la vuelta en lugar de meterse.
      this.desired = this.heading + (this.id % 2 ? 1.6 : -1.6);
      this.heading += (this.id % 2 ? 1 : -1) * 2.5 * dt;
      this.speed *= 0.9;
      this.vel.set(0, 0, 0);
      if (this.state === 'walk') this.setState('graze', 4 + Math.random() * 6);
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }

    if (this.wounded) {
      this.bleedTimer -= dt;
      this.dropTimer -= dt;
      if (this.dropTimer <= 0 && this.onBleed) {
        this.onBleed(this);
        this.dropTimer = this.speed > 3 ? 0.18 : 0.9;
      }
      if (this.bleedTimer <= 0) {
        this.die();
        if (this.onBledOut) this.onBledOut(this);
      }
    }

    this.neckPitch += (neckTarget - this.neckPitch) * Math.min(1, dt * 3);
    this.neckYaw += (yawTarget - this.neckYaw) * Math.min(1, dt * 3);
    this.animate(dt);
    this.syncTransform();
  }

  pickIdle() {
    const r = Math.random();
    if (r < 0.45) this.pickWalk(18);
    else if (r < 0.75) this.setState('graze', 4 + Math.random() * 10);
    else this.setState('idle', 2 + Math.random() * 4);
  }

  pickWalk(radius) {
    const a = this.herd ? this.herd.anchor : this.pos;
    for (let i = 0; i < 6; i++) {
      const x = a.x + (Math.random() - 0.5) * 2 * radius;
      const z = a.z + (Math.random() - 0.5) * 2 * radius;
      if (slopeAt(x, z) < 0.45 && waterDepth(x, z) < 0.05) {
        this.target.set(clamp(x, -PLAY_HALF + 30, PLAY_HALF - 30), 0, clamp(z, -PLAY_HALF + 30, PLAY_HALF - 30));
        break;
      }
    }
    this.setState('walk', 25);
  }

  animate(dt) {
    const b = this.b;
    const run = clamp((this.speed - this.sp.walk) / (this.sp.run * 0.35), 0, 1);
    const stride = (1.1 + run * 2.4) * this.scale;
    this.phase += (this.speed / stride) * Math.PI * 2 * dt;
    const moving = clamp(this.speed / this.sp.walk, 0, 1);
    const p = this.phase;
    const ampW = 0.38 * moving, ampR = 0.85;
    const walkSet = [Math.sin(p), Math.sin(p + Math.PI), Math.sin(p + Math.PI), Math.sin(p)];
    const runSet = [Math.sin(p), Math.sin(p + 0.5), Math.sin(p + Math.PI), Math.sin(p + Math.PI + 0.5)];
    for (let i = 0; i < 4; i++) {
      this.legs[i].rotation.x = walkSet[i] * ampW * (1 - run) + runSet[i] * ampR * run;
    }
    this.body.position.y = Math.abs(Math.sin(p)) * 0.04 * moving * (1 - run) + Math.max(0, Math.sin(p * 1)) * 0.12 * run;
    this.body.rotation.x = Math.sin(p + 0.8) * 0.09 * run;
    this.neck.rotation.x = this.neckPitch + Math.sin(p + 1.2) * 0.12 * run;
    this.neck.rotation.y = this.neckYaw;
    if (this.model && this.group.visible) {
      const m = this.model;
      if (this.speed > this.sp.walk * 1.6) playSlot(m, 'run', 0.25, clamp(this.speed / (this.sp.run * 0.7), 0.6, 1.6));
      else if (this.speed > 0.25) playSlot(m, 'walk', 0.3, clamp(this.speed / this.sp.walk, 0.5, 1.8));
      else if (this.state === 'graze') playSlot(m, 'eat', 0.5);
      else playSlot(m, 'idle', 0.5);
      m.mixer.update(dt);
    }
    const now = performance.now() * 0.001;
    if (this.state === 'graze') this.neck.rotation.x += Math.sin(now * 4 + this.id) * 0.05;
    // Respiración: más rápida tras correr.
    this.breath = Math.max(0, (this.breath || 0) + (run > 0.5 ? dt * 0.3 : -dt * 0.05));
    const br = Math.sin(now * (2.2 + this.breath * 4) + this.id);
    this.body.scale.set(1 + br * 0.008, 1 + br * 0.012, 1);
    // Pequeños giros de cabeza cuando está quieto.
    if (this.speed < 0.2 && this.state !== 'graze') this.neck.rotation.y += Math.sin(now * 0.7 + this.id * 3) * 0.15;
    void b;
  }

  syncTransform() {
    const g = this.group;
    const y = groundAt(this.pos.x, this.pos.z);
    this.pos.y = y;
    const len = this.b.bl * 0.5 * this.scale;
    const fx = Math.sin(this.heading) * len, fz = Math.cos(this.heading) * len;
    const pitch = Math.atan2(groundAt(this.pos.x - fx, this.pos.z - fz) - groundAt(this.pos.x + fx, this.pos.z + fz), len * 2);
    g.position.set(this.pos.x, y, this.pos.z);
    g.rotation.y = this.heading;
    g.rotation.x = clamp(pitch, -0.5, 0.5);
  }

  updateDeath(dt) {
    this.deathT += dt;
    if (this.model && this.model.actions.death) {
      // El modelo trae su propia animación de muerte.
      playSlot(this.model, 'death', 0.15);
      this.model.mixer.update(dt);
      this.speed = Math.max(0, this.speed - 14 * dt);
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
      this.syncTransform();
      return;
    }
    const t = clamp(this.deathT / 0.75, 0, 1);
    const e = t * t * (3 - 2 * t);
    // Inercia: si iba corriendo, se desliza un poco al caer.
    this.speed = Math.max(0, this.speed - 14 * dt);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.syncTransform();
    this.group.rotation.z = this.fallSide * e * 1.45;
    this.group.position.y += this.b.bw * 0.4 * this.scale * e;
    for (let i = 0; i < 4; i++) this.legs[i].rotation.x *= 1 - Math.min(1, dt * 4);
    this.neck.rotation.x += (this.b.rest + 0.6 - this.neck.rotation.x) * Math.min(1, dt * 3);
    this.body.position.y *= 0.9;
  }

  // Comprueba si el segmento a->b alcanza a este animal. `ahead` extrapola su movimiento.
  testSegment(a, b, ahead = 0) {
    this.group.updateMatrixWorld(true);
    const off = _e.copy(this.vel).multiplyScalar(ahead);
    let best = null;
    for (const m of this.outer) {
      m.o.getWorldPosition(_v).add(off);
      const t = segmentSphere(a, b, _v, m.r * this.scale);
      if (t >= 0 && (!best || t < best.t)) best = { t, zone: m.zone };
    }
    if (!best) return null;
    // ¿Atraviesa órganos vitales? Se alarga el segmento para cubrir el interior del cuerpo.
    const len = a.distanceTo(b);
    const ext = _w.copy(b).sub(a).multiplyScalar((len + 2.5) / Math.max(len, 1e-6)).add(a);
    const tScale = len / (len + 2.5);
    for (const m of this.vitals) {
      m.o.getWorldPosition(_v).add(off);
      const t = segmentSphere(a, ext, _v, m.r * this.scale);
      if (t >= 0 && t * (1 / tScale) >= best.t - 0.05) {
        best.zone = m.zone;
        break;
      }
    }
    return best;
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class Herd {
  constructor(x, z) {
    this.anchor = new THREE.Vector3(x, 0, z);
    this.members = [];
    this.driftTimer = 30 + Math.random() * 30;
  }

  alarm(source, fx, fz) {
    for (const m of this.members) {
      if (m !== source && m.alive && m.state !== 'flee') {
        m.hearShot(fx, fz, 0.15 + Math.random() * 0.5, 1);
      }
    }
  }

  nudge(source) {
    for (const m of this.members) {
      if (m !== source && m.alive) m.suspicion = Math.min(3, m.suspicion + 0.45);
    }
  }

  update(dt) {
    this.driftTimer -= dt;
    if (this.driftTimer <= 0) {
      this.driftTimer = 35 + Math.random() * 40;
      const a = Math.random() * Math.PI * 2;
      const nx = clamp(this.anchor.x + Math.sin(a) * 40, -PLAY_HALF + 40, PLAY_HALF - 40);
      const nz = clamp(this.anchor.z + Math.cos(a) * 40, -PLAY_HALF + 40, PLAY_HALF - 40);
      if (forestAt(nx, nz) < 0.2) this.anchor.set(nx, 0, nz);
    }
  }
}

const HERD_TYPES = {
  ciervos: () => {
    const list = ['ciervo'];
    const hinds = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < hinds; i++) list.push('cierva');
    if (Math.random() < 0.3) list.push('ciervo');
    return list;
  },
  corzos: () => (Math.random() < 0.5 ? ['corzo'] : ['corzo', 'corzo']),
  jabalies: () => Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => 'jabali'),
  zorro: () => ['zorro'],
  gamos: () => {
    const list = Math.random() < 0.4 ? ['gamo', 'gamo'] : ['gamo'];
    const does = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < does; i++) list.push('gama');
    return list;
  },
  muflones: () => Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => 'muflon'),
  cabras: () => {
    const list = Math.random() < 0.5 ? ['cabra', 'cabra'] : ['cabra'];
    for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) list.push('cabra_h');
    return list;
  },
  lobos: () => (Math.random() < 0.5 ? ['lobo'] : ['lobo', 'lobo']),
  liebre: () => ['liebre'],
};

export class Fauna {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.animals = [];
    this.herds = [];
    this.respawnTimer = 25;
  }

  clear() {
    for (const a of this.animals) a.dispose(this.scene);
    this.animals = [];
    this.herds = [];
  }

  findSpot(px, pz, minD, maxD, forestMax, rocky = false) {
    for (let i = 0; i < (rocky ? 300 : 80); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minD + Math.random() * (maxD - minD);
      const x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
      if (Math.abs(x) > PLAY_HALF - 40 || Math.abs(z) > PLAY_HALF - 40) continue;
      const sl = slopeAt(x, z);
      if (forestAt(x, z) > forestMax || sl > (rocky ? 0.6 : 0.4) || waterDepth(x, z) > -0.3) continue;
      // Las cabras monteses buscan laderas empinadas y altas.
      if (rocky && sl < 0.18 && groundAt(x, z) < 35 && i < 250) continue;
      return [x, z];
    }
    return null;
  }

  spawnHerd(type, px, pz, minD, maxD, at = null) {
    const forestMax = { jabalies: 0.3, lobos: 0.3, cabras: 0.35, muflones: 0.15 }[type] ?? 0.08;
    const spot = at || this.findSpot(px, pz, minD, maxD, forestMax, type === 'cabras' || type === 'muflones');
    if (!spot) return;
    const herd = new Herd(spot[0], spot[1]);
    for (const key of HERD_TYPES[type]()) {
      let x = spot[0] + (Math.random() - 0.5) * 16, z = spot[1] + (Math.random() - 0.5) * 16;
      if (waterDepth(x, z) > -0.2) [x, z] = spot;
      const an = new Animal(key, herd, x, z, this.scene);
      an.onBleed = this.hooks.onBleed;
      an.onBledOut = this.hooks.onBledOut;
      an.onAlarm = this.hooks.onAlarm;
      an.onRoar = this.hooks.onRoar;
      herd.members.push(an);
      this.animals.push(an);
    }
    this.herds.push(herd);
  }

  // Manadas en la orilla del lago: bajan a beber y es donde mejor se ven de cerca.
  spawnLakeHerds(lake) {
    const types = ['ciervos', 'gamos', 'corzos', 'jabalies'];
    let placed = 0;
    for (let k = 0; k < 60 && placed < types.length; k++) {
      const a = (k / 60) * Math.PI * 2 * 7.3;
      for (let r = lake.r * 0.8; r < lake.r * 1.6; r += 3) {
        const x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r;
        const d = waterDepth(x, z);
        if (d < -0.3 && d > -1.5 && slopeAt(x, z) < 0.35) {
          this.spawnHerd(types[placed++], 0, 0, 0, 0, [x, z]);
          break;
        }
      }
    }
  }

  spawnInitial(px, pz, lake) {
    if (lake) this.spawnLakeHerds(lake);
    const plan = {
      ciervos: 8, gamos: 4, corzos: 8, jabalies: 5, muflones: 3, cabras: 3, zorro: 4, lobos: 2, liebre: 6,
    };
    for (const [t, n] of Object.entries(plan)) {
      // La mayoría cerca del puesto (se distinguen a simple vista); el resto, más lejos.
      for (let i = 0; i < n; i++) {
        const near = i < n * 0.65;
        this.spawnHerd(t, px, pz, near ? 45 : 150, near ? 200 : 360);
      }
    }
  }

  update(dt, ctx, viewer) {
    for (const h of this.herds) h.update(dt);
    for (const a of this.animals) {
      if (a.alive || a.deathT < 3) a.update(dt, ctx);
      // Lejos no se dibujan (la niebla ya los tapa) y a media distancia no proyectan sombra.
      if (viewer) {
        const d = Math.hypot(a.pos.x - viewer.x, a.pos.z - viewer.z);
        a.group.visible = d < 500;
        const cast = d < 150;
        if (cast !== a.castsShadow) {
          a.castsShadow = cast;
          a.group.traverse((o) => {
            if (o.isMesh) o.castShadow = cast;
          });
        }
      }
    }
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 20;
      const legalAlive = this.animals.filter((a) => a.alive && a.sp.legal).length;
      if (legalAlive < 55) {
        const types = ['ciervos', 'ciervos', 'gamos', 'corzos', 'corzos', 'jabalies', 'muflones', 'cabras', 'zorro', 'liebre'];
        this.spawnHerd(types[Math.floor(Math.random() * types.length)], ctx.player.x, ctx.player.z, 120, 300);
      }
    }
  }

  onGunshot(x, z) {
    for (const a of this.animals) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      const delay = d / 343 + 0.1 + Math.random() * 0.25;
      if (d < 190) a.hearShot(x, z, delay, 1);
      else if (d < 420) a.hearShot(x, z, delay, Math.random() < 0.4 ? 1 : 0.5);
    }
  }

  onImpact(point, shooterX, shooterZ) {
    for (const a of this.animals) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - point.x, a.pos.z - point.z);
      if (d < 18) a.hearShot(point.x, point.z, 0.05 + Math.random() * 0.15, 1);
    }
    void shooterX; void shooterZ;
  }

  segmentHit(a, b, ahead = 0) {
    let best = null;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    const half = a.distanceTo(b) / 2;
    for (const an of this.animals) {
      const cx = an.pos.x + an.vel.x * ahead, cz = an.pos.z + an.vel.z * ahead;
      const dd = Math.hypot(cx - mx, an.pos.y + 0.8 - my, cz - mz);
      if (dd > half + an.boundR + 1) continue;
      const h = an.testSegment(a, b, ahead);
      if (h && (!best || h.t < best.t)) best = { ...h, animal: an };
    }
    return best;
  }
}
