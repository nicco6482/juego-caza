// El coto: terreno, cielo, luz, vegetación, hierba y colisiones.
import * as THREE from 'three';
import { createNoise2D, fbm, rng, hash2 } from './noise.js';
import { part, between, merge } from './geo.js';

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

function makeDetailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f6f6';
  g.fillRect(0, 0, 256, 256);
  const r = rng(5);
  for (let i = 0; i < 2600; i++) {
    const v = 185 + Math.floor(r() * 70);
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    g.lineWidth = 1 + r() * 1.5;
    const x = r() * 256, y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 7);
    g.stroke();
  }
  for (let i = 0; i < 400; i++) {
    const v = 200 + Math.floor(r() * 55);
    g.fillStyle = `rgba(${v},${v},${v},0.7)`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeGrassTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(77);
  g.fillStyle = '#fff';
  for (let i = 0; i < 18; i++) {
    const x = 10 + r() * 108;
    const w = 3 + r() * 5;
    const h = 60 + r() * 66;
    const lean = (r() - 0.5) * 40;
    g.beginPath();
    g.moveTo(x - w, S);
    g.quadraticCurveTo(x + lean * 0.3, S - h * 0.5, x + lean, S - h);
    g.quadraticCurveTo(x + lean * 0.3 + w * 0.3, S - h * 0.5, x + w, S);
    g.closePath();
    g.fill();
  }
  // El canvas guarda negro en los píxeles transparentes y eso ensucia los bordes al
  // filtrar. Se reconstruye la textura con color en todos los píxeles y el alfa aparte.
  const src = g.getImageData(0, 0, S, S).data;
  const data = new Uint8Array(S * S * 4);
  const base = new THREE.Color('#4a5a28'), mid = new THREE.Color('#8f9148'), tip = new THREE.Color('#d6c784');
  const col = new THREE.Color();
  for (let y = 0; y < S; y++) {
    const v = 1 - y / (S - 1); // 0 abajo, 1 arriba
    if (v < 0.55) col.copy(base).lerp(mid, v / 0.55);
    else col.copy(mid).lerp(tip, (v - 0.55) / 0.45);
    const row = S - 1 - y; // DataTexture empieza por abajo
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, o = (row * S + x) * 4;
      data[o] = col.r * 255;
      data[o + 1] = col.g * 255;
      data[o + 2] = col.b * 255;
      data[o + 3] = src[i + 3];
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.grid = new Map();
    this.grassTime = { value: 0 };
    this.lastGrass = new THREE.Vector2(1e9, 1e9);
    this.sunDir = new THREE.Vector3();
    this.hazeColor = { value: new THREE.Color() };

    this.buildTerrain();
    this.buildSky();
    this.buildLights();
    this.buildVegetation();
    this.buildGrass();
    this.buildMountains();
    this.setTimeOfDay(0);
  }

  buildTerrain() {
    const count = W * W;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    for (let iz = 0; iz < W; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const i = iz * W + ix;
        const x = -WORLD_HALF + ix * STEP, z = -WORLD_HALF + iz * STEP;
        pos[i * 3] = x;
        pos[i * 3 + 1] = heights[i];
        pos[i * 3 + 2] = z;
        uv[i * 2] = x / 5;
        uv[i * 2 + 1] = z / 5;
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
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const nor = geo.attributes.normal.array;
    const col = new Float32Array(count * 3);
    const lush = new THREE.Color('#58692f');
    const green = new THREE.Color('#7b8540');
    const dry = new THREE.Color('#a79a58');
    const forestFloor = new THREE.Color('#4a4428');
    const dirt = new THREE.Color('#7a6446');
    const rock = new THREE.Color('#858073');
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const slope = 1 - nor[i * 3 + 1];
      const n = fbm(nG, x / 45, z / 45, 2);
      c.copy(lush).lerp(green, smoothstep(-0.35, 0.1, n)).lerp(dry, smoothstep(0.0, 0.45, n + nB(x / 13, z / 13) * 0.15));
      c.lerp(forestFloor, smoothstep(-0.02, 0.16, forestAt(x, z)) * 0.75);
      c.lerp(dirt, smoothstep(0.08, 0.2, slope));
      c.lerp(rock, smoothstep(0.2, 0.35, slope) + smoothstep(55, 95, y) * 0.6);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: makeDetailTexture(),
      roughness: 1,
      metalness: 0,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  buildSky() {
    this.skyUniforms = {
      sunDir: { value: new THREE.Vector3(0, 0.2, 1) },
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color('#5b5a4d') },
      sunCol: { value: new THREE.Color('#ffc983') },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir, top, horizon, ground, sunCol;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, ground, pow(min(-h * 5.0, 1.0), 0.6));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 5.0) * 0.28 + pow(s, 64.0) * 0.45);
          c = mix(c, vec3(1.0, 0.96, 0.85), smoothstep(0.9990, 0.9996, s));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2('#e3cfae', 0.0021);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#bfd2ea', '#5d5132', 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffd8a6', 2.6);
    this.sun.castShadow = this.quality.shadows;
    const s = this.sun.shadow;
    s.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    s.camera.left = -110;
    s.camera.right = 110;
    s.camera.top = 110;
    s.camera.bottom = -110;
    s.camera.near = 20;
    s.camera.far = 700;
    s.bias = -0.0006;
    s.normalBias = 0.35;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  // t: 0 al empezar la cacería (tarde) -> 1 al terminar (atardecer).
  setTimeOfDay(t) {
    const elev = THREE.MathUtils.degToRad(17 - 12 * t);
    const az = THREE.MathUtils.degToRad(235);
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    this.skyUniforms.sunDir.value.copy(this.sunDir);
    const horizon = new THREE.Color('#e6d3b1').lerp(new THREE.Color('#eaa878'), t);
    this.skyUniforms.horizon.value.copy(horizon);
    this.skyUniforms.top.value.copy(new THREE.Color('#5f8fc6').lerp(new THREE.Color('#44609a'), t));
    this.scene.fog.color.copy(horizon);
    this.hazeColor.value.copy(horizon).convertLinearToSRGB();
    this.sun.color.copy(new THREE.Color('#ffdcae').lerp(new THREE.Color('#ff9d5c'), t));
    this.sun.intensity = 2.7 - 1.1 * t;
    this.hemi.intensity = 0.95 - 0.35 * t;
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

  buildVegetation() {
    const R = rng(99);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });

    const pineGeo = merge([
      between([0, -0.5, 0], [0, 4.4, 0], 0.26, 0.12, '#5b4331', 6),
      part(new THREE.ConeGeometry(2.1, 3.2, 7), '#2b4222', [0, 3.3, 0]),
      part(new THREE.ConeGeometry(1.75, 2.9, 7), '#314d28', [0, 4.7, 0], [0, 0.4, 0]),
      part(new THREE.ConeGeometry(1.35, 2.6, 7), '#38572c', [0, 6.0, 0], [0, 0.9, 0]),
      part(new THREE.ConeGeometry(0.85, 2.2, 6), '#40612f', [0, 7.2, 0], [0, 1.3, 0]),
    ]);
    const oakGeo = merge([
      between([0, -0.4, 0], [0.2, 1.9, 0.1], 0.34, 0.24, '#4e3b2b'),
      between([0.2, 1.9, 0.1], [-0.9, 2.9, 0.3], 0.18, 0.1, '#4e3b2b'),
      between([0.2, 1.9, 0.1], [1.1, 2.8, -0.4], 0.17, 0.1, '#4e3b2b'),
      part(new THREE.IcosahedronGeometry(1, 1), '#3c4b25', [0, 3.3, 0], [0, 0, 0], [2.9, 1.35, 2.7]),
      part(new THREE.IcosahedronGeometry(1, 1), '#475829', [1.3, 3.65, 0.6], [0, 0, 0], [1.6, 1.0, 1.5]),
      part(new THREE.IcosahedronGeometry(1, 1), '#43532a', [-1.2, 3.55, -0.5], [0, 0, 0], [1.7, 1.05, 1.6]),
      part(new THREE.IcosahedronGeometry(1, 1), '#4e602d', [0.1, 4.15, -0.2], [0, 0, 0], [1.6, 0.9, 1.6]),
    ]);
    const bushGeo = merge([
      part(new THREE.IcosahedronGeometry(1, 0), '#4b5a29', [0, 0.45, 0], [0, 0, 0], [1.1, 0.75, 1.0]),
      part(new THREE.IcosahedronGeometry(1, 0), '#56662f', [0.55, 0.35, 0.3], [0, 0.5, 0], [0.7, 0.55, 0.7]),
      part(new THREE.IcosahedronGeometry(1, 0), '#505f2c', [-0.5, 0.3, -0.25], [0, 1, 0], [0.65, 0.5, 0.7]),
    ]);
    const rockBase = new THREE.DodecahedronGeometry(1, 1);
    const rp = rockBase.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
      const k = 1 + nB(x * 2.1 + 5, z * 2.1 + y * 1.3) * 0.35;
      rp.setXYZ(i, x * k, y * k * 0.62, z * k);
    }
    rockBase.computeVertexNormals();
    const rockGeo = merge([part(rockBase, '#8a867c', [0, 0.2, 0], [0, 0, 0], [1, 1, 1], 0.1)]);

    const scatter = (count, tries, test) => {
      const out = [];
      for (let t = 0; t < tries && out.length < count; t++) {
        const x = (R() * 2 - 1) * (WORLD_HALF - 6);
        const z = (R() * 2 - 1) * (WORLD_HALF - 6);
        if (test(x, z)) out.push({ x, z });
      }
      return out;
    };
    const clearing = (x, z, r) => x * x + z * z > r * r;

    const pines = scatter(4300, 60000, (x, z) => clearing(x, z, 30) && forestAt(x, z) > 0.06 && R() < 0.85);
    const oaks = scatter(700, 60000, (x, z) => {
      const f = forestAt(x, z);
      return clearing(x, z, 26) && f < 0.06 && f > -0.45 && R() < 0.2;
    });
    const bushes = scatter(1700, 30000, (x, z) => clearing(x, z, 7) && forestAt(x, z) > -0.2 && R() < 0.55);
    const rocks = scatter(280, 5000, (x, z) => clearing(x, z, 6) && (slopeAt(x, z) > 0.15 || R() < 0.25));

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    const instance = (geo, list, scaleFn, collider) => {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => {
        const s = scaleFn();
        const y = groundAt(p.x, p.z);
        dummy.position.set(p.x, y, p.z);
        dummy.rotation.set((R() - 0.5) * 0.08, R() * Math.PI * 2, (R() - 0.5) * 0.08);
        dummy.scale.set(s * (0.9 + R() * 0.2), s, s * (0.9 + R() * 0.2));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const v = 0.82 + R() * 0.3;
        mesh.setColorAt(i, tint.setRGB(v, v * (0.95 + R() * 0.1), v * 0.95));
        if (collider) this.addCollider({ x: p.x, z: p.z, y0: y - 1, ...collider(s) });
      });
      mesh.castShadow = this.quality.shadows;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };

    instance(pineGeo, pines, () => 1.15 + R() * 0.85, (s) => ({ r: 0.26 * s, h: 9 * s, type: 'tree' }));
    instance(oakGeo, oaks, () => 0.8 + R() * 0.55, (s) => ({ r: 0.36 * s, h: 3.2 * s, type: 'tree' }));
    instance(bushGeo, bushes, () => 0.6 + R() * 0.9, null);
    instance(rockGeo, rocks, () => 0.6 + R() * 1.6, (s) => ({ r: 0.95 * s, h: 1.4 * s, type: 'rock' }));
  }

  buildGrass() {
    const pos = [], uv = [], nor = [];
    for (const rot of [0, Math.PI / 2, Math.PI / 4]) {
      const cx = Math.cos(rot) * 0.5, cz = Math.sin(rot) * 0.5;
      // Cara delantera y trasera por separado, ambas con la normal hacia arriba: así la
      // hierba se ilumina como el suelo por los dos lados (con DoubleSide saldría negra por detrás).
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

    const mat = new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      alphaTest: 0.45,
      roughness: 1,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.grassTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        float bend = uv.y * uv.y;
        transformed.x += (sin(uTime * 1.7 + wph) * 0.09 + sin(uTime * 3.3 + wph * 1.7) * 0.035) * bend;
        transformed.z += cos(uTime * 1.3 + wph) * 0.05 * bend;`
      );
    };
    this.grassMax = this.quality.grass;
    this.grass = new THREE.InstancedMesh(geo, mat, this.grassMax);
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
    const R = 62, C = 1.25;
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
        const prob = f < 0.04 ? 0.9 : 0.22;
        if (hash2(cx, cz, 3) > prob) continue;
        const r4 = hash2(cx, cz, 4);
        const fadeOut = smoothstep(R, R - 14, d);
        const h = (0.45 + r4 * 0.6) * fadeOut;
        if (h < 0.05) continue;
        const w = 0.8 + hash2(cx, cz, 5) * 0.6;
        dummy.position.set(x, groundAt(x, z) - 0.03, z);
        dummy.rotation.set(0, hash2(cx, cz, 6) * Math.PI * 2, 0);
        dummy.scale.set(w, h, w);
        dummy.updateMatrix();
        this.grass.setMatrixAt(n, dummy.matrix);
        const dryness = smoothstep(-0.1, 0.4, fbm(nG, x / 45, z / 45, 2));
        tint.setRGB(0.85 + dryness * 0.25, 0.9 + dryness * 0.1, 0.75 - dryness * 0.1);
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
    const segA = 240, rings = 7;
    const pos = [], col = [], idx = [];
    const near = new THREE.Color('#56645f'), far = new THREE.Color('#7a8aa0'), snow = new THREE.Color('#c9cdd2');
    const c = new THREE.Color();
    for (let j = 0; j <= rings; j++) {
      const rr = j / rings;
      const radius = 660 + rr * 700;
      for (let i = 0; i <= segA; i++) {
        const a = (i / segA) * Math.PI * 2;
        const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
        const u = Math.cos(a) * 3 + 10, v = Math.sin(a) * 3 + 10;
        const ridge = 1 - Math.abs(fbm(nA, u + rr * 1.7, v - rr * 0.9, 4));
        const profile = Math.sin(Math.min(1, rr * 1.35) * Math.PI) * 0.8 + 0.2;
        let h = (30 + ridge * ridge * 175) * profile;
        if (j === 0) h = 60;
        if (j === rings) h = -40;
        pos.push(x, h, z);
        c.copy(near).lerp(far, rr).lerp(snow, smoothstep(150, 200, h) * 0.7);
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
    // Niebla propia, más suave, para que se lean como montañas lejanas y no como un muro.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.hazeColor = this.hazeColor;
      sh.fragmentShader = 'uniform vec3 hazeColor;\n' + sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor * vec3(0.86, 0.92, 1.04), 0.42);`
      );
    };
    this.mountains = new THREE.Mesh(geo, mat);
    this.scene.add(this.mountains);
  }

  update(dt, camera, focus) {
    this.grassTime.value += dt;
    this.sky.position.copy(camera.position);
    // La sombra sigue al jugador; se ajusta a la rejilla del mapa para que no "tiemble".
    const snap = 220 / this.quality.shadowSize;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 350, focus.y + this.sunDir.y * 350, fz + this.sunDir.z * 350);
    this.updateGrass(focus.x, focus.z);
  }
}
