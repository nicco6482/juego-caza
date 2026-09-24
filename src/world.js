// El coto: terreno texturizado, cielo con nubes, luz, vegetación, hierba y colisiones.
import * as THREE from 'three';
import { createNoise2D, fbm, rng, hash2 } from './noise.js';
import { buildTextures } from './textures.js';
import { customize, fogUniforms } from './fog.js';

export const WORLD_HALF = 450;
export const PLAY_HALF = 385;
const SEG = 300;
const STEP = (WORLD_HALF * 2) / SEG;
const W = SEG + 1;

const nA = createNoise2D(7);
const nB = createNoise2D(19);
const nF = createNoise2D(31);
const nG = createNoise2D(43);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function baseHeight(x, z) {
  let h = fbm(nA, x / 320, z / 320, 5) * 44;
  h += fbm(nB, x / 90, z / 90, 3) * 5;
  // Loma central: el puesto del cazador, con buena vista.
  h += 13 * Math.exp(-(x * x + z * z) / (75 * 75));
  // Sierra que cierra el coto por los bordes.
  const d = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(335, 450, d) * 85 * (0.7 + 0.3 * nB(x / 60, z / 60));
  return h;
}

// > 0.06 es bosque cerrado; por debajo, pastos y dehesa.
export function forestAt(x, z) {
  return fbm(nF, x / 170 + 3.1, z / 170 - 1.7, 3) + nG(x / 28, z / 28) * 0.1;
}

const heights = new Float32Array(W * W);
for (let iz = 0; iz < W; iz++) {
  for (let ix = 0; ix < W; ix++) {
    heights[iz * W + ix] = baseHeight(-WORLD_HALF + ix * STEP, -WORLD_HALF + iz * STEP);
  }
}

// Altura exacta de la malla (misma triangulación), para que nada flote ni se hunda.
export function groundAt(x, z) {
  const gx = (x + WORLD_HALF) / STEP;
  const gz = (z + WORLD_HALF) / STEP;
  const ix = clamp(Math.floor(gx), 0, SEG - 1);
  const iz = clamp(Math.floor(gz), 0, SEG - 1);
  const fx = clamp(gx - ix, 0, 1);
  const fz = clamp(gz - iz, 0, 1);
  const i = iz * W + ix;
  const ha = heights[i], hb = heights[i + 1], hc = heights[i + W], hd = heights[i + W + 1];
  if (fx + fz <= 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
  return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
}

export function slopeAt(x, z) {
  const e = 1.5;
  const dx = groundAt(x + e, z) - groundAt(x - e, z);
  const dz = groundAt(x, z + e) - groundAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// ---------- Geometrías con UV ----------

function mergeUV(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const out = { position: new Float32Array(total * 3), normal: new Float32Array(total * 3), uv: new Float32Array(total * 2), color: new Float32Array(total * 3) };
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    out.position.set(g.attributes.position.array, o * 3);
    out.normal.set(g.attributes.normal.array, o * 3);
    out.uv.set(g.attributes.uv.array, o * 2);
    if (g.attributes.color) out.color.set(g.attributes.color.array, o * 3);
    else out.color.fill(1, o * 3, (o + n) * 3);
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(out.color, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Tronco o rama con corteza: cilindro entre a y b, UV repetidas según su longitud.
function barkLimb(a, b, r1, r2, tint, radial = 9) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r2, r1, len, radial, Math.max(1, Math.round(len / 2)), true).toNonIndexed();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r1 * 8)), uv.getY(i) * len / 1.6);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  const col = new Float32Array(uv.count * 3);
  const c = new THREE.Color(tint);
  for (let i = 0; i < uv.count; i++) {
    const y = g.attributes.position.getY(i);
    const ao = clamp(0.55 + y * 0.12, 0.55, 1);
    col[i * 3] = c.r * ao;
    col[i * 3 + 1] = c.g * ao;
    col[i * 3 + 2] = c.b * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Tarjetas con textura transparente, con las dos caras y normales "de volumen"
// (hacia fuera de la copa) para que la luz las envuelva como si fueran un follaje real.
function cardGeometry(cards) {
  const pos = [], nor = [], uv = [], col = [];
  const v = (p) => new THREE.Vector3(...p);
  for (const cd of cards) {
    const o = v(cd.o), L = v(cd.len), S = v(cd.side).multiplyScalar(0.5);
    const T = S.clone().multiplyScalar(cd.taper ?? 1);
    const p = [o.clone().sub(S), o.clone().add(S), o.clone().add(L).add(T), o.clone().add(L).sub(T)];
    const t = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const n = [v(cd.n0).normalize(), v(cd.n0).normalize(), v(cd.n1).normalize(), v(cd.n1).normalize()];
    const c = [cd.c0, cd.c0, cd.c1, cd.c1];
    const tri = (i) => {
      pos.push(p[i].x, p[i].y, p[i].z);
      nor.push(n[i].x, n[i].y, n[i].z);
      uv.push(t[i][0], t[i][1]);
      col.push(c[i][0], c[i][1], c[i][2]);
    };
    for (const i of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) tri(i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

function pineGeometries(R) {
  const trunk = mergeUV([barkLimb([0, -0.6, 0], [0, 12.2, 0], 0.3, 0.07, '#b08a6c', 10)]);
  const cards = [];
  const tiers = 9;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = 2.6 + t * 8.8;
    const radius = Math.pow(1 - t, 0.85) * 2.7 + 0.45;
    const count = i < 2 ? 6 : i < 6 ? 5 : 4;
    for (let k = 0; k < count; k++) {
      const a = i * 0.9 + (k / count) * Math.PI * 2 + (R() - 0.5) * 0.5;
      const droop = -0.28 - (1 - t) * 0.12 + (R() - 0.5) * 0.1;
      const dir = [Math.cos(a) * radius, droop * radius, Math.sin(a) * radius];
      const width = 1.3 + (1 - t) * 0.9;
      const ao0 = 0.42 + t * 0.25, ao1 = 0.8 + t * 0.2;
      // Dos planos cruzados por rama: uno casi horizontal y otro inclinado, para que la
      // rama se vea desde el suelo y desde lejos, no solo de canto.
      for (const roll of [(R() - 0.5) * 0.5, 1.1 + (R() - 0.5) * 0.4]) {
        const side = [-Math.sin(a) * width * Math.cos(roll), width * Math.sin(roll), Math.cos(a) * width * Math.cos(roll)];
        cards.push({
          o: [Math.cos(a) * 0.08, y, Math.sin(a) * 0.08], len: dir, side, taper: 0.6,
          n0: [Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4], n1: [Math.cos(a), 0.55, Math.sin(a)],
          c0: [ao0, ao0, ao0 * 0.95], c1: [ao1, ao1 * 1.02, ao1 * 0.92],
        });
      }
    }
  }
  // Guía (la punta del árbol)
  for (const a of [0, Math.PI / 2]) {
    cards.push({
      o: [0, 10.8, 0], len: [0, 2.2, 0], side: [Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9], taper: 0.2,
      n0: [Math.cos(a), 0.5, Math.sin(a)], n1: [0, 1, 0], c0: [0.8, 0.8, 0.8], c1: [1, 1, 0.95],
    });
  }
  return { trunk, foliage: cardGeometry(cards) };
}

function oakGeometries(R) {
  const tint = '#a09a92';
  const trunk = mergeUV([
    barkLimb([0, -0.5, 0], [0.15, 2.0, 0.1], 0.38, 0.27, tint, 10),
    barkLimb([0.15, 2.0, 0.1], [-1.1, 3.1, 0.4], 0.2, 0.09, tint, 7),
    barkLimb([0.15, 2.0, 0.1], [1.2, 3.0, -0.5], 0.19, 0.09, tint, 7),
    barkLimb([0.15, 2.0, 0.1], [0.2, 3.6, 0.9], 0.17, 0.08, tint, 7),
  ]);
  const cards = [];
  const center = new THREE.Vector3(0, 3.5, 0);
  for (let i = 0; i < 95; i++) {
    // Puntos en un elipsoide aplanado, más densos en la superficie de la copa.
    const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = Math.pow(R(), 0.35);
    const s = Math.sqrt(1 - u * u);
    const p = new THREE.Vector3(s * Math.cos(th) * 3.1 * rr, u * 1.45 * rr, s * Math.sin(th) * 3.0 * rr).add(center);
    const size = 1.25 + R() * 0.7;
    const n = p.clone().sub(center).normalize();
    n.y = n.y * 0.7 + 0.45;
    const a = R() * Math.PI * 2;
    const tilt = (R() - 0.5) * 1.4;
    const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(size);
    const up = new THREE.Vector3(-Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt)).multiplyScalar(size);
    const o = p.clone().addScaledVector(up, -0.5);
    const ao = clamp(0.45 + (p.y - center.y + 1.45) / 2.9 * 0.45 + rr * 0.15, 0.4, 1.05);
    cards.push({
      o: o.toArray(), len: up.toArray(), side: side.toArray(), taper: 1,
      n0: n.toArray(), n1: n.toArray(), c0: [ao * 0.9, ao * 0.9, ao * 0.9], c1: [ao, ao, ao],
    });
  }
  return { trunk, foliage: cardGeometry(cards) };
}

function bushGeometry(R) {
  const cards = [];
  const center = new THREE.Vector3(0, 0.55, 0);
  for (let i = 0; i < 16; i++) {
    const th = R() * Math.PI * 2, u = R() * 1.6 - 0.6;
    const p = new THREE.Vector3(Math.cos(th) * 0.7, u * 0.45, Math.sin(th) * 0.7).add(center);
    const size = 0.9 + R() * 0.5;
    const a = R() * Math.PI;
    const n = p.clone().sub(center).normalize();
    n.y += 0.5;
    const ao = 0.55 + (p.y / 1.1) * 0.45;
    cards.push({
      o: [p.x, p.y - size * 0.45, p.z], len: [0, size, 0], side: [Math.cos(a) * size, 0, Math.sin(a) * size], taper: 1,
      n0: n.toArray(), n1: n.toArray(), c0: [ao * 0.8, ao * 0.8, ao * 0.8], c1: [ao, ao, ao],
    });
  }
  return cardGeometry(cards);
}

// Pino piñonero: tronco alto y desnudo y copa en forma de sombrilla.
function stonePineGeometries(R) {
  const tint = '#b89a80';
  const lean = (R() - 0.5) * 0.8;
  const top = [lean, 6.6, (R() - 0.5) * 0.6];
  const limbs = [barkLimb([0, -0.6, 0], top, 0.36, 0.22, tint, 10)];
  const tips = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + R() * 0.6;
    const tip = [top[0] + Math.cos(a) * 2.4, 8.3 + R() * 0.5, top[2] + Math.sin(a) * 2.4];
    tips.push(tip);
    limbs.push(barkLimb(top, tip, 0.17, 0.08, tint, 7));
  }
  const trunk = mergeUV(limbs);
  const cards = [];
  const cx = top[0], cz = top[2];
  for (let ring = 0; ring < 6; ring++) {
    const r = 0.4 + ring * 0.85;
    const count = 5 + ring * 5;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + ring * 0.37 + R() * 0.3;
      const y = 9.5 - Math.pow(r / 4.7, 2) * 1.6 + (R() - 0.5) * 0.25;
      const len = 1.5 + R() * 0.5;
      const dir = [Math.cos(a) * len, -0.18 * len, Math.sin(a) * len];
      const ao = 0.55 + (1 - r / 5) * 0.1 + (y - 7.9) * 0.2;
      for (const roll of [(R() - 0.5) * 0.3, 0.9]) {
        const width = 1.5;
        cards.push({
          o: [cx + Math.cos(a) * (r - 0.6), y, cz + Math.sin(a) * (r - 0.6)], len: dir,
          side: [-Math.sin(a) * width * Math.cos(roll), width * Math.sin(roll), Math.cos(a) * width * Math.cos(roll)], taper: 0.7,
          n0: [Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3], n1: [Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6],
          c0: [ao * 0.8, ao * 0.8, ao * 0.78], c1: [ao, ao, ao * 0.95],
        });
      }
    }
  }
  return { trunk, foliage: cardGeometry(cards) };
}

// Jara: mata erguida de hojas estrechas y flores blancas.
function jaraGeometry(R) {
  const cards = [];
  for (let i = 0; i < 22; i++) {
    const th = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.55;
    const h = 0.7 + R() * 0.6;
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    const a = R() * Math.PI;
    const size = 0.75 + R() * 0.4;
    const ao = 0.6 + R() * 0.2;
    cards.push({
      o: [x, h - size * 0.5, z], len: [x * 0.2, size, z * 0.2], side: [Math.cos(a) * size, 0, Math.sin(a) * size], taper: 1,
      n0: [x, 0.8, z], n1: [x, 1, z], c0: [ao * 0.75, ao * 0.75, ao * 0.75], c1: [1, 1, 1],
    });
  }
  return cardGeometry(cards);
}

function rockGeometry() {
  const base = new THREE.DodecahedronGeometry(1, 2);
  const rp = base.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const k = 1 + nB(x * 1.7 + 5, z * 1.7 + y * 1.3) * 0.32 + nG(x * 4, z * 4 + y * 3) * 0.06;
    rp.setXYZ(i, x * k, Math.max(y * k * 0.62, -0.25), z * k);
  }
  base.computeVertexNormals();
  // Proyección de UV por caras (cada triángulo según su eje dominante).
  const uv = new Float32Array(rp.count * 2);
  const nor = base.attributes.normal;
  for (let i = 0; i < rp.count; i += 3) {
    const nx = Math.abs(nor.getX(i) + nor.getX(i + 1) + nor.getX(i + 2));
    const ny = Math.abs(nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2));
    const nz = Math.abs(nor.getZ(i) + nor.getZ(i + 1) + nor.getZ(i + 2));
    for (let j = i; j < i + 3; j++) {
      const x = rp.getX(j), y = rp.getY(j), z = rp.getZ(j);
      if (ny >= nx && ny >= nz) uv.set([x * 0.6, z * 0.6], j * 2);
      else if (nx >= nz) uv.set([z * 0.6, y * 0.6], j * 2);
      else uv.set([x * 0.6, y * 0.6], j * 2);
    }
  }
  base.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const col = new Float32Array(rp.count * 3);
  for (let i = 0; i < rp.count; i++) {
    const ao = clamp(0.55 + rp.getY(i) * 0.7, 0.5, 1);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  base.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return base;
}

// ---------- Mundo ----------

const WIND_GLSL = /* glsl */ `
  #ifdef USE_INSTANCING
    float wPh = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
  #else
    float wPh = 0.0;
  #endif
  float wH = max(position.y, 0.0) / 10.0;
  transformed.x += (sin(uTime * 0.9 + wPh) * 0.12 * wH * wH + sin(uTime * 2.3 + wPh * 3.0 + position.y) * 0.025 * wH) * uWind;
  transformed.z += cos(uTime * 0.7 + wPh) * 0.08 * wH * wH * uWind;
`;

// Contraluz: cuando miras hacia el sol, las hojas dejan pasar la luz y se iluminan.
function translucency(sh, amount) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    #ifdef USE_FOG
      vec3 tlView = normalize(vFogWorldPos - cameraPosition);
      float tlSun = pow(max(dot(tlView, fogSunDir), 0.0), 4.0);
      totalEmissiveRadiance += diffuseColor.rgb * fogSunColor * tlSun * ${amount.toFixed(2)};
    #endif`);
}

export class World {
  constructor(scene, quality, renderer) {
    this.scene = scene;
    this.quality = quality;
    this.renderer = renderer;
    this.grid = new Map();
    this.time = { value: 0 };
    this.windAmp = { value: 1 };
    this.lastGrass = new THREE.Vector2(1e9, 1e9);
    this.sunDir = new THREE.Vector3();
    this.hazeColor = { value: new THREE.Color() };
    this.envTimer = 0;
    this.tod = -1;

    this.tex = buildTextures(quality, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.buildTerrain();
    this.buildSky();
    this.buildLights();
    this.buildVegetation();
    this.buildGrass();
    this.buildMountains();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.setTimeOfDay(0);
  }

  windShader(sh) {
    sh.uniforms.uTime = this.time;
    sh.uniforms.uWind = this.windAmp;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_GLSL);
  }

  buildTerrain() {
    const count = W * W;
    const pos = new Float32Array(count * 3);
    for (let iz = 0; iz < W; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const i = iz * W + ix;
        pos[i * 3] = -WORLD_HALF + ix * STEP;
        pos[i * 3 + 1] = heights[i];
        pos[i * 3 + 2] = -WORLD_HALF + iz * STEP;
      }
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let k = 0;
    for (let iz = 0; iz < SEG; iz++) {
      for (let ix = 0; ix < SEG; ix++) {
        const a = iz * W + ix, b = a + 1, c = a + W, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    // Pesos de mezcla: hierba, tierra, roca, suelo de pinar. Y un tinte para la hierba seca.
    const nor = geo.attributes.normal.array;
    const splat = new Float32Array(count * 4);
    const tint = new Float32Array(count * 3);
    const lush = new THREE.Color(0.86, 1.0, 0.8), dry = new THREE.Color(1.32, 1.12, 0.74);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const slope = 1 - nor[i * 3 + 1];
      const rock = clamp(smoothstep(0.2, 0.34, slope) + smoothstep(60, 95, y) * 0.8, 0, 1);
      const patches = smoothstep(0.3, 0.55, fbm(nB, x / 25 + 7, z / 25, 3));
      const dirt = clamp(smoothstep(0.09, 0.2, slope) + patches * 0.8, 0, 1) * (1 - rock);
      const forest = smoothstep(-0.02, 0.14, forestAt(x, z)) * (1 - rock) * (1 - dirt * 0.5);
      const grass = Math.max(0, 1 - rock - dirt - forest);
      const sum = grass + dirt + rock + forest + 1e-5;
      splat.set([grass / sum, dirt / sum, rock / sum, forest / sum], i * 4);
      const n = fbm(nG, x / 45, z / 45, 2);
      c.copy(lush).lerp(dry, smoothstep(-0.15, 0.4, n + nB(x / 13, z / 13) * 0.15));
      tint.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));

    const t = this.tex;
    const mat = customize(new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 }), 'terrain', (sh) => {
      Object.assign(sh.uniforms, {
        tGrass: { value: t.grass.map }, tDirt: { value: t.dirt.map }, tRock: { value: t.rock.map }, tForest: { value: t.forest.map },
        nGrass: { value: t.grass.normal }, nDirt: { value: t.dirt.normal }, nRock: { value: t.rock.normal }, nForest: { value: t.forest.normal },
        tMacro: { value: t.macro },
      });
      sh.vertexShader = `
        attribute vec4 splat;
        attribute vec3 tint;
        varying vec4 vSplat;
        varying vec3 vTint;
        varying vec3 vTPos;
        varying vec3 vTNormal;
      ` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = splat;
        vTint = tint;
        vTPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTNormal = normal;`);
      sh.fragmentShader = `
        uniform sampler2D tGrass, tDirt, tRock, tForest, nGrass, nDirt, nRock, nForest, tMacro;
        varying vec4 vSplat;
        varying vec3 vTint;
        varying vec3 vTPos;
        varying vec3 vTNormal;
        vec3 tri(sampler2D t, vec3 p, vec3 b) {
          return texture2D(t, p.zy).rgb * b.x + texture2D(t, p.xz).rgb * b.y + texture2D(t, p.xy).rgb * b.z;
        }
      ` + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 tuvA = vTPos.xz * 0.28;
          vec2 tuvB = mat2(0.8, -0.6, 0.6, 0.8) * vTPos.xz * 0.071 + vec2(0.37, 0.71);
          vec2 macro = texture2D(tMacro, vTPos.xz * 0.0035).rg;
          float macroB = texture2D(tMacro, vTPos.xz * 0.021).g;
          vec4 w = vSplat;
          w.xyw *= vec3(0.7 + 0.6 * macroB, 1.3 - 0.6 * macroB, 0.8 + 0.4 * macroB);
          w = pow(max(w, 0.0), vec4(2.4));
          w /= max(dot(w, vec4(1.0)), 1e-4);
          vec3 bw = pow(abs(normalize(vTNormal)), vec3(4.0));
          bw /= dot(bw, vec3(1.0));
          vec3 cG = mix(texture2D(tGrass, tuvA).rgb, texture2D(tGrass, tuvB).rgb, 0.4) * vTint;
          vec3 cD = mix(texture2D(tDirt, tuvA).rgb, texture2D(tDirt, tuvB).rgb, 0.4);
          vec3 cR = tri(tRock, vTPos * 0.14, bw);
          vec3 cF = mix(texture2D(tForest, tuvA).rgb, texture2D(tForest, tuvB).rgb, 0.4);
          vec3 albedo = cG * w.x + cD * w.y + cR * w.z + cF * w.w;
          albedo *= mix(0.78, 1.2, macro.r);
          diffuseColor.rgb *= albedo;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.72, w.z);`)
        .replace('#include <normal_fragment_maps>', `
          vec3 tn = (texture2D(nGrass, tuvA).xyz * 2.0 - 1.0) * w.x
                  + (texture2D(nDirt, tuvA).xyz * 2.0 - 1.0) * w.y
                  + (texture2D(nForest, tuvA).xyz * 2.0 - 1.0) * w.w
                  + vec3(0.0, 0.0, 1.0) * w.z;
          vec3 tN = normalize(vTNormal);
          vec3 tT = normalize(vec3(1.0, 0.0, 0.0) - tN * tN.x);
          vec3 tB = cross(tT, tN);
          vec3 pert = normalize(tT * tn.x + tB * tn.y + tN * max(tn.z, 0.25));
          vec3 rq = vTPos * 0.14;
          vec3 rnX = texture2D(nRock, rq.zy).xyz * 2.0 - 1.0;
          vec3 rnY = texture2D(nRock, rq.xz).xyz * 2.0 - 1.0;
          vec3 rnZ = texture2D(nRock, rq.xy).xyz * 2.0 - 1.0;
          vec3 rockN = vec3(0.0, rnX.y, rnX.x) * bw.x + vec3(rnY.x, 0.0, rnY.y) * bw.y + vec3(rnZ.x, rnZ.y, 0.0) * bw.z;
          pert = normalize(pert + rockN * w.z * 0.9);
          normal = normalize((viewMatrix * vec4(pert, 0.0)).xyz);`);
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  skyMaterial(forEnv) {
    return new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = ${forEnv ? 'p' : 'p.xyww'};
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir, top, horizon, ground, sunCol;
        uniform float uTime, cloudCover;
        varying vec3 vDir;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 6; i++) { s += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
          return s;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.42)) : mix(horizon, ground, pow(min(-h * 5.0, 1.0), 0.6));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 4.0) * 0.25 + pow(s, 32.0) * 0.4);
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.1) * 0.9 + vec2(uTime * 0.0035, uTime * 0.0015);
            float n = fbm(uv * 1.3);
            float cov = smoothstep(1.0 - cloudCover, 1.0 - cloudCover + 0.28, n);
            float lit = fbm(uv * 1.3 + sunDir.xz * 0.06);
            vec3 cloud = mix(vec3(1.0, 0.97, 0.93), horizon, 0.3);
            cloud *= mix(0.62, 1.05, clamp(1.0 - (lit - n) * 5.0, 0.0, 1.0));
            cloud += sunCol * pow(s, 8.0) * 0.8 * (1.0 - cov * 0.5);
            c = mix(c, cloud, cov * smoothstep(0.0, 0.2, h) * 0.9);
          }
          c += vec3(1.0, 0.94, 0.82) * smoothstep(0.99955, 0.9998, s) * 12.0;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
  }

  buildSky() {
    this.skyUniforms = {
      sunDir: { value: new THREE.Vector3(0, 0.2, 1) },
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color('#4d4b40') },
      sunCol: { value: new THREE.Color('#ffc983') },
      uTime: this.time,
      cloudCover: { value: 0.42 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 24), this.skyMaterial(false));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.skyMaterial(true)));
    this.scene.fog = new THREE.FogExp2('#e3cfae', 0.0019);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#bfd2ea', '#4d4430', 0.3);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffd8a6', 3);
    this.sun.castShadow = this.quality.shadows;
    const s = this.sun.shadow;
    s.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    s.camera.left = -110;
    s.camera.right = 110;
    s.camera.top = 110;
    s.camera.bottom = -110;
    s.camera.near = 20;
    s.camera.far = 700;
    s.bias = -0.0004;
    s.normalBias = 0.3;
    s.radius = 2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.environmentIntensity = 0.6;
  }

  // t: 0 al empezar la cacería (tarde) -> 1 al terminar (atardecer).
  setTimeOfDay(t) {
    const elev = THREE.MathUtils.degToRad(18 - 13 * t);
    const az = THREE.MathUtils.degToRad(235);
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    this.skyUniforms.sunDir.value.copy(this.sunDir);
    const horizon = new THREE.Color('#e7d6b8').lerp(new THREE.Color('#eba77a'), t);
    this.skyUniforms.horizon.value.copy(horizon);
    this.skyUniforms.top.value.copy(new THREE.Color('#4f82c0').lerp(new THREE.Color('#3b5690'), t));
    this.skyUniforms.sunCol.value.copy(new THREE.Color('#ffcf8f').lerp(new THREE.Color('#ff8a4a'), t));
    this.scene.fog.color.copy(horizon);
    this.hazeColor.value.copy(horizon);
    fogUniforms.fogSunDir.value.copy(this.sunDir);
    fogUniforms.fogSunColor.value.copy(new THREE.Color('#ffe2b8').lerp(new THREE.Color('#ffae70'), t));
    this.sun.color.copy(new THREE.Color('#ffe1b8').lerp(new THREE.Color('#ff9a5a'), t));
    this.sun.intensity = 3.1 - 1.3 * t;
    this.hemi.intensity = 0.3 - 0.1 * t;
    // La luz ambiental sale del propio cielo; se recalcula cuando cambia la hora.
    if (Math.abs(t - this.tod) > 0.04 && this.pmrem) {
      this.tod = t;
      const rt = this.pmrem.fromScene(this.envScene, 0.04);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
  }

  addCollider(c) {
    const key = `${Math.floor(c.x / 10)},${Math.floor(c.z / 10)}`;
    let cell = this.grid.get(key);
    if (!cell) this.grid.set(key, (cell = []));
    cell.push(c);
  }

  forColliders(x0, z0, x1, z1, fn) {
    const cx0 = Math.floor(Math.min(x0, x1) / 10), cx1 = Math.floor(Math.max(x0, x1) / 10);
    const cz0 = Math.floor(Math.min(z0, z1) / 10), cz1 = Math.floor(Math.max(z0, z1) / 10);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const cell = this.grid.get(`${cx},${cz}`);
        if (cell) for (const c of cell) fn(c);
      }
    }
  }

  // Primer obstáculo (tronco o roca) que corta el segmento a->b.
  segmentObstacle(a, b) {
    let best = null;
    const dx = b.x - a.x, dz = b.z - a.z;
    const A = dx * dx + dz * dz;
    if (A < 1e-9) return null;
    this.forColliders(a.x - 2, a.z - 2, b.x + 2, b.z + 2, (c) => {
      const fx = a.x - c.x, fz = a.z - c.z;
      const B = 2 * (fx * dx + fz * dz);
      const C = fx * fx + fz * fz - c.r * c.r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return;
      const t = C <= 0 ? 0 : (-B - Math.sqrt(disc)) / (2 * A);
      if (t < 0 || t > 1) return;
      const y = a.y + (b.y - a.y) * t;
      if (y < c.y0 || y > c.y0 + c.h) return;
      if (!best || t < best.t) best = { t, type: c.type };
    });
    return best;
  }

  collidePlayer(pos, radius) {
    this.forColliders(pos.x - 2, pos.z - 2, pos.x + 2, pos.z + 2, (c) => {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    });
  }

  // Reparte instancias en bloques de 150 m para que la cámara descarte lo que no ve.
  instanceChunks(geo, mat, list, cast) {
    const chunks = new Map();
    for (const it of list) {
      const key = `${Math.floor((it.x + WORLD_HALF) / 150)},${Math.floor((it.z + WORLD_HALF) / 150)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(it);
    }
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (const items of chunks.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.tx, it.r, it.tz);
        dummy.scale.set(it.s * it.sx, it.s, it.s * it.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col.setRGB(it.c[0], it.c[1], it.c[2]));
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = cast && this.quality.shadows;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  buildVegetation() {
    const R = rng(99);
    const t = this.tex;
    const barkMat = customize(new THREE.MeshStandardMaterial({ map: t.bark.map, normalMap: t.bark.normal, vertexColors: true, roughness: 0.95 }), 'bark');
    const leafMat = (map, name) => customize(
      new THREE.MeshStandardMaterial({ map, alphaTest: 0.35, alphaToCoverage: this.quality.msaa > 0, vertexColors: true, roughness: 0.82 }),
      name, (sh) => {
        this.windShader(sh);
        translucency(sh, 0.55);
      }
    );
    const pineMat = leafMat(t.pine, 'pine');
    const oakMat = leafMat(t.oak, 'oak');
    const bushMat = leafMat(t.bush, 'bush');
    const rockMat = customize(new THREE.MeshStandardMaterial({ map: t.rock.map, normalMap: t.rock.normal, vertexColors: true, roughness: 0.8 }), 'rock');

    const pine = pineGeometries(R);
    const oaks2 = [oakGeometries(R), oakGeometries(R)];
    const stone = stonePineGeometries(R);
    const bush = bushGeometry(R);
    const jara = jaraGeometry(R);
    const jaraMat = leafMat(t.jara, 'jara');
    const rockGeo = rockGeometry();

    const scatter = (count, tries, test) => {
      const out = [];
      for (let k = 0; k < tries && out.length < count; k++) {
        const x = (R() * 2 - 1) * (WORLD_HALF - 6);
        const z = (R() * 2 - 1) * (WORLD_HALF - 6);
        if (test(x, z)) out.push({ x, z });
      }
      return out;
    };
    const clearing = (x, z, r) => x * x + z * z > r * r;
    const dens = this.quality.trees;
    const pines = scatter(Math.round(4300 * dens), 70000, (x, z) => clearing(x, z, 30) && forestAt(x, z) > 0.06 && R() < 0.85);
    const oaks = scatter(Math.round(700 * dens), 60000, (x, z) => {
      const f = forestAt(x, z);
      return clearing(x, z, 26) && f < 0.06 && f > -0.45 && R() < 0.2;
    });
    const bushes = scatter(Math.round(2200 * dens), 40000, (x, z) => clearing(x, z, 7) && forestAt(x, z) > -0.25 && R() < 0.55);
    const jaras = scatter(Math.round(2600 * dens), 50000, (x, z) => {
      const f = forestAt(x, z);
      return clearing(x, z, 7) && f < 0.1 && f > -0.4 && fbm(nB, x / 60, z / 60, 2) > -0.05 && R() < 0.5;
    });
    const stones = scatter(Math.round(380 * dens), 60000, (x, z) => {
      const f = forestAt(x, z);
      return clearing(x, z, 30) && f < 0.12 && f > -0.3 && R() < 0.12;
    });
    const rocks = scatter(300, 6000, (x, z) => clearing(x, z, 6) && (slopeAt(x, z) > 0.15 || R() < 0.25));

    const make = (list, sMin, sMax, tintFn, collider) => list.map((p) => {
      const s = sMin + R() * (sMax - sMin);
      const y = groundAt(p.x, p.z);
      if (collider) this.addCollider({ x: p.x, z: p.z, y0: y - 1, ...collider(s) });
      return {
        x: p.x, y, z: p.z, s, r: R() * Math.PI * 2, tx: (R() - 0.5) * 0.06, tz: (R() - 0.5) * 0.06,
        sx: 0.9 + R() * 0.2, sz: 0.9 + R() * 0.2, c: tintFn(),
      };
    });
    const leafTint = () => {
      const v = 0.85 + R() * 0.3;
      return [v * (0.95 + R() * 0.1), v, v * (0.9 + R() * 0.1)];
    };
    const plain = () => [1, 1, 1];

    const pineI = make(pines, 0.8, 1.3, leafTint, (s) => ({ r: 0.3 * s, h: 11 * s, type: 'tree' }));
    this.instanceChunks(pine.trunk, barkMat, pineI.map((p) => ({ ...p, c: plain() })), true);
    this.instanceChunks(pine.foliage, pineMat, pineI, true);

    const oakI = make(oaks, 0.8, 1.35, leafTint, (s) => ({ r: 0.4 * s, h: 3 * s, type: 'tree' }));
    oaks2.forEach((oak, v) => {
      const part = oakI.filter((_, i) => i % 2 === v);
      this.instanceChunks(oak.trunk, barkMat, part.map((p) => ({ ...p, c: [0.8, 0.78, 0.76] })), true);
      this.instanceChunks(oak.foliage, oakMat, part, true);
    });

    const stoneI = make(stones, 0.85, 1.25, leafTint, (s) => ({ r: 0.38 * s, h: 7 * s, type: 'tree' }));
    this.instanceChunks(stone.trunk, barkMat, stoneI.map((p) => ({ ...p, c: [0.95, 0.85, 0.8] })), true);
    this.instanceChunks(stone.foliage, pineMat, stoneI.map((p) => ({ ...p, c: p.c.map((v) => v * 1.08) })), true);

    this.instanceChunks(bush, bushMat, make(bushes, 0.7, 1.6, leafTint, null), true);
    this.instanceChunks(jara, jaraMat, make(jaras, 0.7, 1.3, leafTint, null), true);
    this.instanceChunks(rockGeo, rockMat, make(rocks, 0.6, 2.2, () => {
      const v = 0.85 + R() * 0.25;
      return [v, v * 0.98, v * 0.95];
    }, (s) => ({ r: 0.95 * s, h: 1.3 * s, type: 'rock' })), true);
  }

  buildGrass() {
    const pos = [], uv = [], nor = [];
    for (const rot of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const cx = Math.cos(rot) * 0.5, cz = Math.sin(rot) * 0.5;
      // Cara delantera y trasera por separado, ambas con la normal hacia arriba: así la
      // hierba se ilumina como el suelo por los dos lados.
      const quad = [
        [-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0], [cx, 1, cz, 1, 1],
        [-cx, 0, -cz, 0, 0], [cx, 1, cz, 1, 1], [-cx, 1, -cz, 0, 1],
        [-cx, 0, -cz, 0, 0], [cx, 1, cz, 1, 1], [cx, 0, cz, 1, 0],
        [-cx, 0, -cz, 0, 0], [-cx, 1, -cz, 0, 1], [cx, 1, cz, 1, 1],
      ];
      for (const q of quad) {
        pos.push(q[0], q[1], q[2]);
        uv.push(q[3], q[4]);
        nor.push(0, 1, 0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));

    const mat = customize(new THREE.MeshStandardMaterial({ map: this.tex.grassCard, alphaTest: 0.4, roughness: 0.9 }), 'grass', (sh) => {
      sh.uniforms.uTime = this.time;
      sh.uniforms.uWind = this.windAmp;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        float bend = uv.y * uv.y * uWind;
        transformed.x += (sin(uTime * 1.7 + wph) * 0.09 + sin(uTime * 3.3 + wph * 1.7) * 0.035) * bend;
        transformed.z += cos(uTime * 1.3 + wph) * 0.05 * bend;`
      );
      translucency(sh, 0.45);
      // Oscurece la base de las matas: sombra de contacto barata.
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.0, 0.55, vMapUv.y));`);
    });
    this.grassMax = this.quality.grass;
    this.grass = new THREE.InstancedMesh(geo, mat, Math.max(1, this.grassMax));
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    this.grass.count = 0;
    this.grass.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.grass);
  }

  updateGrass(px, pz) {
    if (this.grassMax === 0) return;
    if (Math.hypot(px - this.lastGrass.x, pz - this.lastGrass.y) < 5) return;
    this.lastGrass.set(px, pz);
    const R = this.quality.grassRadius, C = this.quality.grassCell;
    const dummy = this._dummy || (this._dummy = new THREE.Object3D());
    const tint = new THREE.Color();
    let n = 0;
    const cx0 = Math.floor((px - R) / C), cx1 = Math.floor((px + R) / C);
    const cz0 = Math.floor((pz - R) / C), cz1 = Math.floor((pz + R) / C);
    for (let cx = cx0; cx <= cx1 && n < this.grassMax; cx++) {
      for (let cz = cz0; cz <= cz1 && n < this.grassMax; cz++) {
        const x = (cx + hash2(cx, cz, 1)) * C;
        const z = (cz + hash2(cx, cz, 2)) * C;
        const d = Math.hypot(x - px, z - pz);
        if (d > R) continue;
        const f = forestAt(x, z);
        const prob = f < 0.04 ? 0.92 : 0.2;
        if (hash2(cx, cz, 3) > prob) continue;
        if (slopeAt(x, z) > 0.3) continue;
        const r4 = hash2(cx, cz, 4);
        const fadeOut = smoothstep(R, R - 16, d);
        const h = (0.4 + r4 * 0.65) * fadeOut;
        if (h < 0.05) continue;
        const w = 0.8 + hash2(cx, cz, 5) * 0.7;
        dummy.position.set(x, groundAt(x, z) - 0.03, z);
        dummy.rotation.set(0, hash2(cx, cz, 6) * Math.PI * 2, 0);
        dummy.scale.set(w, h, w);
        dummy.updateMatrix();
        this.grass.setMatrixAt(n, dummy.matrix);
        const dryness = smoothstep(-0.15, 0.4, fbm(nG, x / 45, z / 45, 2));
        const v = 0.85 + hash2(cx, cz, 7) * 0.25;
        tint.setRGB(v * (0.86 + dryness * 0.4), v * (0.97 + dryness * 0.12), v * (0.8 - dryness * 0.08));
        this.grass.setColorAt(n, tint);
        n++;
      }
    }
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
    if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
  }

  buildMountains() {
    // Cordillera lejana: un anillo de relieve continuo, azulado por la distancia.
    const segA = 260, rings = 8;
    const pos = [], col = [], idx = [];
    const near = new THREE.Color('#4f5d56'), far = new THREE.Color('#72829a'), snow = new THREE.Color('#d0d4d9');
    const c = new THREE.Color();
    for (let j = 0; j <= rings; j++) {
      const rr = j / rings;
      const radius = 660 + rr * 700;
      for (let i = 0; i <= segA; i++) {
        const a = (i / segA) * Math.PI * 2;
        const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
        const u = Math.cos(a) * 3 + 10, v = Math.sin(a) * 3 + 10;
        const ridge = 1 - Math.abs(fbm(nA, u + rr * 1.7, v - rr * 0.9, 5));
        const profile = Math.sin(Math.min(1, rr * 1.35) * Math.PI) * 0.8 + 0.2;
        let h = (30 + ridge * ridge * 185) * profile;
        if (j === 0) h = 60;
        if (j === rings) h = -40;
        pos.push(x, h, z);
        c.copy(near).lerp(far, rr).lerp(snow, smoothstep(150, 205, h) * 0.75);
        col.push(c.r, c.g, c.b);
      }
    }
    const row = segA + 1;
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segA; i++) {
        const a = j * row + i, b = a + 1, d = a + row, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false });
    // Bruma propia, más suave, para que se lean como montañas lejanas y no como un muro.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.hazeColor = this.hazeColor;
      sh.fragmentShader = 'uniform vec3 hazeColor;\n' + sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor * vec3(0.84, 0.92, 1.06), 0.5);`
      );
    };
    mat.customProgramCacheKey = () => 'mountains';
    this.mountains = new THREE.Mesh(geo, mat);
    this.scene.add(this.mountains);
  }

  update(dt, camera, focus, windSpeed = 3) {
    this.time.value += dt;
    this.windAmp.value += ((0.4 + windSpeed * 0.2) - this.windAmp.value) * Math.min(1, dt);
    this.sky.position.copy(camera.position);
    // La sombra sigue al jugador; se ajusta a la rejilla del mapa para que no "tiemble".
    const snap = 220 / this.quality.shadowSize;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 350, focus.y + this.sunDir.y * 350, fz + this.sunDir.z * 350);
    this.updateGrass(focus.x, focus.z);
  }
}
