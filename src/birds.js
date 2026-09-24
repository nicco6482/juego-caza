// Caza menor: perdiz roja, tórtola, zorzal, agachadiza y ánade real.
// Cada especie se dibuja con tres mallas instanciadas (cuerpo y dos alas), así que cientos
// de aves cuestan muy poco. Comportamiento: en el suelo (o nadando), arrancan al acercarte,
// vuelan a otro sitio y se posan; tórtolas y zorzales, además, pasan en vuelo.
import * as THREE from 'three';
import { loft, subdivide, merge, part, segmentSphere } from './geo.js';
import { customize } from './fog.js';
import { groundAt, forestAt, slopeAt, waterDepth, LAKE, PLAY_HALF, clamp } from './world.js';

export const BIRDS = {
  perdiz: {
    name: 'Perdiz roja', fem: true, points: 40, len: 0.34, span: 0.52, speed: 15, alt: [3, 8], flush: 24, vis: 2.4,
    habitat: 'meadow', flock: [8, 15], flap: 15, glide: 0.45, tail: 0.14, bill: 0.05, legs: '#c4302b',
    col: { back: '#8a7358', belly: '#9aa3ab', flank: '#c9a178', head: '#a09282', throat: '#f1ece2', beak: '#c4302b', wing: '#86705a', tip: '#5d4c3b', tailc: '#b0673a', dark: '#1b1612' },
  },
  tortola: {
    name: 'Tórtola', fem: true, points: 35, len: 0.27, span: 0.5, speed: 19, alt: [10, 22], flush: 28,
    habitat: 'meadow', flock: [1, 2], flap: 9, glide: 0.2, tail: 0.26, bill: 0.04, legs: '#b2585a',
    col: { back: '#a27a52', belly: '#dcc6b3', flank: '#cfae93', head: '#9ea3ab', throat: '#caa99c', beak: '#3a3432', wing: '#b07a48', tip: '#4a4440', tailc: '#6e6a66', dark: '#1a1614' },
  },
  zorzal: {
    name: 'Zorzal', points: 25, len: 0.22, span: 0.36, speed: 14, alt: [6, 16], flush: 30,
    habitat: 'oak', flock: [6, 14], flap: 14, glide: 0.35, tail: 0.18, bill: 0.05, legs: '#c9a07a',
    col: { back: '#7a6448', belly: '#efe3c8', flank: '#e1cfa8', head: '#7a6448', throat: '#efe3c8', beak: '#3b3025', wing: '#6d583f', tip: '#4c3c2b', tailc: '#6d583f', dark: '#2b2016' },
  },
  agachadiza: {
    name: 'Agachadiza', fem: true, points: 60, len: 0.26, span: 0.42, speed: 17, alt: [5, 14], flush: 14,
    habitat: 'shore', flock: [1, 2], flap: 12, glide: 0.1, tail: 0.1, bill: 0.26, zigzag: true, legs: '#8f8a5a',
    col: { back: '#5e4a33', belly: '#ece6d8', flank: '#b7a07a', head: '#6b5438', throat: '#e6dccb', beak: '#4a3a2a', wing: '#5a4630', tip: '#2f251b', tailc: '#b0673a', dark: '#1e160f' },
  },
  ciguena: {
    name: 'Cigüeña blanca', fem: true, points: 80, len: 1.0, span: 2.0, speed: 10, alt: [25, 60], flush: 40,
    habitat: 'meadow', flock: [1, 3], flap: 2.2, glide: 0.8, tail: 0.18, bill: 0.3, neck: 0.3, legLen: 0.75, legs: '#d0402a',
    soar: true, blackTrail: true, vis: 1,
    col: { back: '#f4f2ee', belly: '#f7f5f1', flank: '#f4f2ee', head: '#f7f5f1', throat: '#f7f5f1', beak: '#d0402a', wing: '#f1efea', tip: '#15130f', tailc: '#f1efea', dark: '#15130f' },
  },
  flamenco: {
    name: 'Flamenco', points: 90, len: 1.1, span: 1.6, speed: 13, alt: [12, 30], flush: 45,
    habitat: 'wade', flock: [8, 18], flap: 4, glide: 0.12, tail: 0.1, bill: 0.16, neck: 0.55, legLen: 1.0, legs: '#e8788a',
    flamingo: true, vis: 1,
    col: { back: '#f4b6c2', belly: '#f7c6cf', flank: '#f4b6c2', head: '#f7c6cf', throat: '#f7c6cf', beak: '#f0d6d6', wing: '#ef8f9f', tip: '#15130f', tailc: '#f4b6c2', dark: '#15130f', covert: '#e0485f' },
  },
  pato: {
    name: 'Ánade real', points: 50, len: 0.56, span: 0.9, speed: 17, alt: [8, 20], flush: 32,
    habitat: 'water', flock: [4, 9], flap: 8, glide: 0.08, tail: 0.1, bill: 0.12, legs: '#e08a2c', duck: true,
    col: { back: '#7a756c', belly: '#c4beb3', flank: '#b8b2a7', head: '#1f5a36', throat: '#f2f0ea', beak: '#d9b93a', wing: '#76716a', tip: '#4a4744', tailc: '#1d1c1c', dark: '#1c1a18', breast: '#5a3423', speculum: '#3947a8' },
  },
};

const lin = (h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Geometría en unidades de "largo del ave" (1 = pico a cola), mirando a +z.
function buildBird(key) {
  const sp = BIRDS[key];
  const C = {};
  for (const k of Object.keys(sp.col)) C[k] = lin(sp.col[k]);
  const duck = !!sp.duck;
  const bodySecs = subdivide([
    [-0.36, 0.02, 0.01, 0.01], [-0.3, 0.02, 0.12, 0.1], [-0.12, 0.0, 0.2, 0.18], [0.08, 0.01, 0.2, 0.19],
    [0.22, 0.05, 0.15, 0.15], [0.28, 0.08, 0.03, 0.03],
  ].map(([z, y, w, h]) => ({ p: [0, y, z], w, h: duck ? h * 0.85 : h })), 3);
  const bodyCol = (t, c, s, v) => {
    let col = mixc(C.back, C.belly, sm(0.1, -0.5, s));
    // Flancos: barrado de la perdiz, escamado suave en el resto.
    if (key === 'perdiz') {
      const flank = sm(0.55, 0.8, Math.abs(c)) * sm(-0.5, -0.1, s) * sm(0.35, 0.1, s) * sm(-0.25, -0.1, v.z) * sm(0.2, 0.08, v.z);
      const bar = Math.sin(v.z * 70) > 0.2 ? C.flank : (Math.sin(v.z * 70) > -0.4 ? C.throat : C.dark);
      col = mixc(col, bar, flank);
    }
    if (key === 'zorzal') {
      // Pecho moteado.
      const spot = Math.sin(v.z * 90 + c * 20) * Math.sin(s * 25 + v.z * 40) > 0.55 ? 1 : 0;
      col = mixc(col, C.dark, spot * sm(0.0, -0.4, s) * sm(-0.1, 0.1, v.z) * 0.7);
    }
    if (key === 'agachadiza') col = mixc(col, C.flank, (Math.sin(c * 12 + v.z * 30) > 0.3 ? 1 : 0) * sm(-0.2, 0.4, s) * 0.6);
    if (duck) col = mixc(col, C.breast, sm(0.08, 0.16, v.z) * sm(0.4, -0.2, s));
    if (key === 'tortola') col = mixc(col, C.flank, sm(0.1, 0.2, v.z) * 0.5);
    return col;
  };
  const parts = [loft(bodySecs, [0, 1, 0], 18, bodyCol, 2.1)];

  // Cuello y cabeza
  const nk = sp.neck || 0;
  const headZ = duck ? 0.36 : nk ? 0.3 + nk * 0.3 : 0.3;
  const headY = duck ? 0.2 : nk ? 0.12 + nk * 0.9 : 0.13;
  const headR = duck ? 0.085 : nk ? 0.07 : 0.1;
  const neckW = nk ? 0.045 : 0.07;
  parts.push(loft(subdivide([
    { p: [0, 0.05, 0.18], w: nk ? 0.08 : 0.1, h: nk ? 0.08 : 0.1 },
    { p: [0, headY * 0.55, headZ - 0.06 + (sp.flamingo ? 0.1 : 0)], w: neckW, h: neckW },
    { p: [0, headY, headZ], w: 0.02, h: 0.02 },
  ], 3), [0, 1, 0], 12, (t, c, s) => {
    if (nk) return C.head;
    if (duck) return mixc(C.head, C.throat, sm(0.25, 0.4, t) * (1 - sm(0.45, 0.6, t)));
    if (key === 'tortola') return mixc(C.head, C.dark, sm(0.3, 0.45, t) * (1 - sm(0.5, 0.65, t)) * sm(0.0, 0.6, Math.abs(c)));
    return mixc(C.back, C.throat, sm(0.2, -0.6, s));
  }, 2));
  const sphere = new THREE.SphereGeometry(1, 14, 10);
  parts.push(part(sphere, sp.col.head, [0, headY, headZ], [0, 0, 0], [headR * 0.9, headR, headR * 1.15], 0.01));
  if (key === 'perdiz') {
    // Garganta blanca con collar negro.
    parts.push(part(sphere, sp.col.throat, [0, headY - headR * 0.35, headZ + headR * 0.25], [0, 0, 0], [headR * 0.7, headR * 0.6, headR * 0.8], 0.01));
    parts.push(part(new THREE.TorusGeometry(headR * 0.75, headR * 0.12, 6, 16), sp.col.dark, [0, headY - headR * 0.55, headZ + 0.01], [1.3, 0, 0], [1, 1, 1], 0.01));
  }
  for (const sx of [-1, 1]) {
    parts.push(part(sphere, '#0a0908', [sx * headR * 0.72, headY + headR * 0.2, headZ + headR * 0.35], [0, 0, 0], [0.022, 0.022, 0.022], 0.01));
  }
  // Pico
  const billStart = [0, headY - headR * 0.1, headZ + headR * 0.9];
  if (sp.flamingo) {
    const cone = new THREE.ConeGeometry(0.035, sp.bill * 0.55, 8).rotateX(Math.PI / 2);
    parts.push(part(cone, sp.col.beak, [0, billStart[1], billStart[2] + sp.bill * 0.25], [0.15, 0, 0], [1, 1, 1], 0.01));
    const tip = new THREE.ConeGeometry(0.025, sp.bill * 0.5, 8).rotateX(Math.PI / 2);
    parts.push(part(tip, sp.col.dark, [0, billStart[1] - sp.bill * 0.2, billStart[2] + sp.bill * 0.55], [0.9, 0, 0], [1, 1, 1], 0.01));
  } else if (duck) {
    parts.push(part(sphere, sp.col.beak, [0, billStart[1] - 0.01, billStart[2] + sp.bill * 0.45], [0.15, 0, 0], [0.045, 0.02, sp.bill * 0.55], 0.01));
  } else {
    const cone = new THREE.ConeGeometry(0.03, sp.bill, 8).rotateX(Math.PI / 2);
    parts.push(part(cone, sp.col.beak, [0, billStart[1], billStart[2] + sp.bill * 0.5], [0.1, 0, 0], [1, 1, 1], 0.01));
  }
  // Cola: una placa plana.
  parts.push(loft(subdivide([
    { p: [0, 0.03, -0.3], w: 0.07, h: 0.015 },
    { p: [0, 0.02, -0.3 - sp.tail * 0.6], w: 0.1, h: 0.012 },
    { p: [0, 0.01, -0.3 - sp.tail], w: 0.12, h: 0.008 },
  ], 3), [0, 1, 0], 8, (t) => mixc(C.tailc, C.dark, sm(0.8, 1, t) * (key === 'tortola' ? 0 : 0.6)), 2));
  // Patas (se ven con el ave posada)
  for (const sx of [-1, 1]) {
    const ll = sp.legLen ?? 0.16;
    parts.push(part(new THREE.CylinderGeometry(0.012, 0.012, ll, 5), sp.legs, [sx * 0.05, -0.12 - ll / 2, 0.02], [0.2 * (0.16 / ll), 0, 0], [1, 1, 1], 0.01));
  }
  const body = merge(parts);

  // Ala izquierda (x+). Planta: raíz ancha, punta estrecha. Primarias más oscuras.
  const half = sp.span / sp.len / 2;
  const P = [
    [0, 0, 0.12], [0, 0, -0.16], [half * 0.5, 0.02, 0.1], [half * 0.5, 0.02, -0.2], [half, 0.0, 0.0], [half * 0.95, 0.0, -0.1],
  ];
  const tri = (a, b, c, ca, cb, cc, pos, col) => {
    for (const [p, cl] of [[a, ca], [b, cb], [c, cc]]) {
      pos.push(...p);
      col.push(...cl);
    }
  };
  const wcol = (i) => {
    let c = i >= 4 ? C.tip : C.wing;
    if (sp.blackTrail && (i === 1 || i === 3 || i === 5)) c = C.tip;
    if (sp.flamingo && (i === 0 || i === 2)) c = lin(sp.col.covert);
    if (duck && (i === 3)) c = mixc(C.wing, lin(sp.col.speculum), 0.45);
    return c;
  };
  const makeWing = (sx) => {
    const pos = [], col = [];
    const q = P.map(([x, y, z]) => [x * sx, y, z]);
    const quads = [[0, 1, 3, 2], [2, 3, 5, 4]];
    for (const [a, b, c, d] of quads) {
      tri(q[a], q[b], q[c], wcol(a), wcol(b), wcol(c), pos, col);
      tri(q[a], q[c], q[d], wcol(a), wcol(c), wcol(d), pos, col);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    // Normales hacia arriba en las dos caras: el ala se ilumina bien vista desde abajo.
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return g;
  };
  return { body, wingL: makeWing(1), wingR: makeWing(-1), half };
}

const MAX = 400;
// Las aves pequeñas se dibujan más grandes de lo real para que se vean bien en pantalla.
const VIS = 1.8;
const visOf = (sp) => sp.vis ?? VIS;
const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Birds {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.list = [];
    this.meshes = {};
    this.passTimer = 12;
    const bodyMat = customize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'aves');
    const wingMat = customize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), 'alas');
    for (const key of Object.keys(BIRDS)) {
      const g = buildBird(key);
      const mk = (geo, mat) => {
        const m = new THREE.InstancedMesh(geo, mat, MAX);
        m.count = 0;
        m.frustumCulled = false;
        m.castShadow = true;
        scene.add(m);
        return m;
      };
      this.meshes[key] = { body: mk(g.body, bodyMat), wingL: mk(g.wingL, wingMat), wingR: mk(g.wingR, wingMat), half: g.half };
    }
  }

  clear() {
    this.list = [];
  }

  count(key) {
    return this.list.filter((b) => b.key === key && b.state !== 'gone').length;
  }

  // Busca un sitio adecuado para cada especie.
  spot(habitat, px, pz, minD, maxD) {
    for (let i = 0; i < 200; i++) {
      let x, z;
      if (habitat === 'water' || habitat === 'shore' || habitat === 'wade') {
        const a = Math.random() * Math.PI * 2, r = LAKE.r * (habitat === 'water' ? Math.random() * 0.8 : 0.6 + Math.random() * 0.7);
        x = LAKE.x + Math.cos(a) * r;
        z = LAKE.z + Math.sin(a) * r;
        const d = waterDepth(x, z);
        if (habitat === 'water' && d < 0.8) continue;
        if (habitat === 'shore' && (d < -0.4 || d > 0.05)) continue;
        if (habitat === 'wade' && (d < 0.1 || d > 0.55)) continue;
        return [x, z];
      }
      const a = Math.random() * Math.PI * 2, r = minD + Math.random() * (maxD - minD);
      x = px + Math.sin(a) * r;
      z = pz + Math.cos(a) * r;
      if (Math.abs(x) > PLAY_HALF - 20 || Math.abs(z) > PLAY_HALF - 20) continue;
      const f = forestAt(x, z);
      if (waterDepth(x, z) > -0.5 || slopeAt(x, z) > 0.3) continue;
      if (habitat === 'meadow' && f > 0.04) continue;
      if (habitat === 'oak' && (f > 0.08 || f < -0.45)) continue;
      return [x, z];
    }
    return null;
  }

  spawnFlock(key, px, pz, minD = 50, maxD = 300) {
    const sp = BIRDS[key];
    const at = this.spot(sp.habitat, px, pz, minD, maxD);
    if (!at) return;
    const n = sp.flock[0] + Math.floor(Math.random() * (sp.flock[1] - sp.flock[0] + 1));
    const flock = { key, birds: [] };
    for (let i = 0; i < n; i++) {
      let x = at[0] + (Math.random() - 0.5) * (sp.duck ? 10 : 6), z = at[1] + (Math.random() - 0.5) * (sp.duck ? 10 : 6);
      if (sp.habitat === 'water' && waterDepth(x, z) < 0.5) [x, z] = at;
      const b = this.make(key, x, z, flock);
      b.state = sp.habitat === 'water' ? 'swim' : 'ground';
      b.pos.y = this.floor(b);
      flock.birds.push(b);
    }
  }

  make(key, x, z, flock) {
    const b = {
      key, sp: BIRDS[key], flock,
      pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), target: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2, pitch: 0, roll: 0, flapPh: Math.random() * 6, fold: 1,
      state: 'ground', t: Math.random() * 10, alt: 0, delay: -1, deadT: 0, wander: 0, zig: Math.random() * 6,
      scale: 0.92 + Math.random() * 0.16,
    };
    this.list.push(b);
    return b;
  }

  floor(b) {
    const g = groundAt(b.pos.x, b.pos.z);
    const size = b.sp.len * visOf(b.sp) * b.scale;
    const legs = (0.12 + (b.sp.legLen ?? 0.16)) * size * 0.95;
    const wet = waterDepth(b.pos.x, b.pos.z) > 0.05;
    if (b.state === 'dead') return wet ? LAKE.level + 0.02 : g + 0.1 * size;
    // Los flamencos están de pie en el fondo; los patos flotan.
    if (wet && !b.sp.legLen) return LAKE.level + 0.1 * size;
    return g + legs;
  }

  // Pasa una bandada o una pareja en vuelo cerca del jugador (tiro "de paso").
  flyover(px, pz, driven = false) {
    let key = Math.random() < 0.55 ? 'tortola' : 'zorzal';
    if (driven) {
      // Ojeo: te entran perdices, tórtolas, zorzales y, cerca del lago, patos.
      const nearLake = Math.hypot(px - LAKE.x, pz - LAKE.z) < LAKE.r * 3;
      const r = Math.random();
      key = r < 0.6 ? 'perdiz' : r < 0.78 ? 'tortola' : r < 0.9 || !nearLake ? 'zorzal' : 'pato';
    }
    const sp = BIRDS[key];
    const ang = Math.random() * Math.PI * 2;
    const off = driven ? (Math.random() - 0.5) * 50 : (Math.random() - 0.5) * 90;
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const sx = px - dx * 230 + dz * off, sz = pz - dz * 230 - dx * off;
    const n = { tortola: 1 + Math.floor(Math.random() * 3), zorzal: 5 + Math.floor(Math.random() * 8), perdiz: 6 + Math.floor(Math.random() * 7), pato: 3 + Math.floor(Math.random() * 4) }[key];
    const flock = { key, birds: [] };
    for (let i = 0; i < n; i++) {
      const b = this.make(key, sx + (Math.random() - 0.5) * 12, sz + (Math.random() - 0.5) * 12, flock);
      b.state = 'pass';
      b.alt = (driven ? sp.alt[0] * 0.8 + Math.random() * (sp.alt[1] - sp.alt[0]) * 0.6 : sp.alt[0] + Math.random() * (sp.alt[1] - sp.alt[0]));
      b.pos.y = groundAt(b.pos.x, b.pos.z) + b.alt;
      b.target.set(px + dx * 260 + dz * off, 0, pz + dz * 260 - dx * off);
      b.vel.set(dx, 0, dz).multiplyScalar(sp.speed);
      b.fold = 0;
      flock.birds.push(b);
    }
  }

  // Cigüeñas cicleando en una térmica, muy alto.
  spawnSoaring(px, pz) {
    const flock = { key: 'ciguena', birds: [] };
    const cx = px + (Math.random() - 0.5) * 300, cz = pz + (Math.random() - 0.5) * 300;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const b = this.make('ciguena', cx, cz, flock);
      b.state = 'soar';
      b.center = new THREE.Vector3(cx, 0, cz);
      b.radius = 35 + Math.random() * 45;
      b.ang = Math.random() * Math.PI * 2;
      b.alt = 30 + Math.random() * 40;
      b.fold = 0;
      flock.birds.push(b);
    }
  }

  populate(px, pz) {
    this.clear();
    for (let i = 0; i < 4; i++) this.spawnSoaring(px, pz);
    for (let i = 0; i < 2; i++) this.spawnFlock('flamenco', px, pz);
    const plan = { perdiz: 20, tortola: 9, zorzal: 6, agachadiza: 8, pato: 5, ciguena: 3 };
    for (const [k, n] of Object.entries(plan)) for (let i = 0; i < n; i++) this.spawnFlock(k, px, pz, 50, 320);
  }

  flush(b, fromX, fromZ, delay = 0) {
    if (b.state !== 'ground' && b.state !== 'swim') return;
    b.delay = delay;
    b.fromX = fromX;
    b.fromZ = fromZ;
  }

  takeOff(b) {
    if (b.state !== 'ground' && b.state !== 'swim') return;
    const sp = b.sp;
    const ax = b.pos.x - b.fromX, az = b.pos.z - b.fromZ;
    const l = Math.hypot(ax, az) || 1;
    const dir = new THREE.Vector3(ax / l, 0, az / l).applyAxisAngle(_v.set(0, 1, 0), (Math.random() - 0.5) * 0.8);
    b.state = 'fly';
    b.vel.copy(dir).multiplyScalar(sp.speed * 0.35);
    b.vel.y = sp.duck ? 5 : 4;
    b.alt = sp.alt[0] + Math.random() * (sp.alt[1] - sp.alt[0]);
    // Nuevo sitio donde posarse, lejos del peligro.
    let target = null;
    if (sp.habitat === 'water' || sp.habitat === 'shore' || sp.habitat === 'wade') target = this.spot(sp.habitat, 0, 0, 0, 0);
    else {
      for (let i = 0; i < 20 && !target; i++) {
        const cand = this.spot(sp.habitat, b.pos.x + dir.x * 150, b.pos.z + dir.z * 150, 20, 120);
        if (cand) target = cand;
      }
    }
    if (!target) target = [b.pos.x + dir.x * 180, b.pos.z + dir.z * 180];
    if (sp.duck) b.circle = 1 + Math.random();
    b.target.set(target[0], 0, target[1]);
    if (this.hooks.onFlush && !b.flock.announced) {
      b.flock.announced = true;
      this.hooks.onFlush(b);
    }
  }

  onGunshot(x, z) {
    for (const b of this.list) {
      const d = Math.hypot(b.pos.x - x, b.pos.z - z);
      if (d < (b.sp.duck ? 220 : 90)) this.flush(b, x, z, d / 343 + Math.random() * 0.3);
    }
  }

  kill(b, dir) {
    if (b.state === 'dead' || b.state === 'gone') return false;
    b.wasFlying = b.state === 'fly' || b.state === 'pass' || b.state === 'soar';
    b.byPlayer = true;
    b.delay = -1;
    b.state = 'dead';
    b.deadT = 0;
    b.vel.multiplyScalar(0.4).addScaledVector(dir, 2);
    b.vel.y = Math.max(b.vel.y, 1);
    for (const o of b.flock.birds) if (o !== b) this.flush(o, b.pos.x, b.pos.z, Math.random() * 0.4);
    return true;
  }

  segmentHit(a, c) {
    let best = null;
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    const half = Math.hypot(c.x - a.x, c.z - a.z) / 2 + 2;
    for (const b of this.list) {
      if (b.state === 'gone') continue;
      if (Math.abs(b.pos.x - mx) > half || Math.abs(b.pos.z - mz) > half) continue;
      // Radio algo generoso: los perdigones y la bala tienen que poder dar a un ave pequeña.
      const t = segmentSphere(a, c, b.pos, Math.max(0.16, b.sp.len * 0.45 * visOf(b.sp)) * b.scale);
      if (t >= 0 && (!best || t < best.t)) best = { bird: b, t };
    }
    return best;
  }

  update(dt, player, playerNoise, flushers = [], driven = false) {
    this.flushers = flushers;
    for (const b of this.list) this.step(b, dt, player, playerNoise);
    this.list = this.list.filter((b) => b.state !== 'gone');
    this.passTimer -= dt;
    if (this.passTimer > 14) this.passTimer = 4 + Math.random() * 6;
    if (this.passTimer <= 0 && player) {
      // Cada 8-14 s te pasa un bando a tiro, lleves el arma que lleves.
      this.passTimer = 8 + Math.random() * 6;
      this.flyover(player.x, player.z, true);
    }
    void driven;
    this.draw();
  }

  step(b, dt, player, noise) {
    const sp = b.sp;
    b.t += dt;
    if (b.delay >= 0) {
      b.delay -= dt;
      if (b.delay < 0) this.takeOff(b);
    }
    if (b.state === 'carried') return;
    if (b.state === 'soar') {
      const w = sp.speed / b.radius;
      b.ang += w * dt;
      b.center.x += Math.sin(b.t * 0.05) * dt * 1.5;
      b.center.z += Math.cos(b.t * 0.04) * dt * 1.5;
      const nx = b.center.x + Math.cos(b.ang) * b.radius, nz = b.center.z + Math.sin(b.ang) * b.radius;
      b.vel.set((nx - b.pos.x) / Math.max(dt, 1e-3), 0, (nz - b.pos.z) / Math.max(dt, 1e-3));
      b.pos.x = nx;
      b.pos.z = nz;
      b.pos.y = groundAt(b.center.x, b.center.z) + b.alt + Math.sin(b.t * 0.2) * 3;
      b.yaw = Math.atan2(-Math.sin(b.ang), Math.cos(b.ang));
      b.roll = -0.3;
      b.pitch = 0;
      // Casi siempre planeando; de vez en cuando, unos aletazos.
      const flap = Math.sin(b.t * 0.3 + b.zig) > 0.85;
      b.flapPh += dt * sp.flap * Math.PI * 2 * (flap ? 1 : 0);
      b.flapAmp = (b.flapAmp || 0) + ((flap ? 1 : 0) - (b.flapAmp || 0)) * Math.min(1, dt * 3);
      b.fold = 0;
      return;
    }
    if (b.state === 'ground' || b.state === 'swim') {
      b.fold += (1 - b.fold) * Math.min(1, dt * 6);
      // Deambula y picotea (o nada despacio).
      b.wander -= dt;
      if (b.wander <= 0) {
        b.wander = 1 + Math.random() * 4;
        b.yaw += (Math.random() - 0.5) * 2;
        b.speed0 = Math.random() < 0.5 ? (b.state === 'swim' ? 0.4 : 0.25) : 0;
      }
      const v = b.speed0 || 0;
      const nx = b.pos.x + Math.sin(b.yaw) * v * dt, nz = b.pos.z + Math.cos(b.yaw) * v * dt;
      const d = waterDepth(nx, nz);
      const ok = b.state === 'swim' ? d > 0.4 : b.sp.habitat === 'wade' ? d > 0.05 && d < 0.6 : d < 0.02;
      if (ok) {
        b.pos.x = nx;
        b.pos.z = nz;
      } else b.yaw += Math.PI * 0.5;
      b.pos.y = this.floor(b) + (b.state === 'swim' ? Math.sin(b.t * 1.6) * 0.01 : 0);
      b.pitch = b.state === 'ground' && v === 0 ? Math.max(0, Math.sin(b.t * 3)) * 0.5 : 0;
      b.roll = 0;
      if (player && b.delay < 0) {
        const dist = Math.hypot(player.x - b.pos.x, player.z - b.pos.z);
        if (dist < sp.flush * (0.45 + 0.55 * Math.min(1, noise + 0.3))) {
          for (const o of b.flock.birds) this.flush(o, player.x, player.z, Math.random() * 0.5);
        }
        // Los perros levantan la caza.
        for (const f of this.flushers || []) {
          if (Math.hypot(f.x - b.pos.x, f.z - b.pos.z) < 9) {
            for (const o of b.flock.birds) this.flush(o, f.x, f.z, Math.random() * 0.4);
            break;
          }
        }
      }
      return;
    }
    if (b.state === 'fly' || b.state === 'pass') {
      b.fold += (0 - b.fold) * Math.min(1, dt * 8);
      const toX = b.target.x - b.pos.x, toZ = b.target.z - b.pos.z;
      const dist = Math.hypot(toX, toZ);
      let dirX = toX / (dist || 1), dirZ = toZ / (dist || 1);
      if (b.circle > 0 && dist < 90) {
        // Los patos dan una vuelta sobre el lago antes de posarse.
        const a = Math.atan2(dirX, dirZ) + 1.3;
        dirX = Math.sin(a);
        dirZ = Math.cos(a);
        b.circle -= dt * 0.12;
      }
      if (sp.zigzag && b.t % 3 < 1.6) {
        const zz = Math.sin(b.t * 7 + b.zig) * 0.9;
        const c = Math.cos(zz), s = Math.sin(zz);
        [dirX, dirZ] = [dirX * c - dirZ * s, dirX * s + dirZ * c];
      }
      const landing = b.state === 'fly' && dist < 25;
      const speed = landing ? Math.max(4, sp.speed * dist / 25) : sp.speed;
      const base = waterDepth(b.pos.x, b.pos.z) > 0 ? LAKE.level : groundAt(b.pos.x, b.pos.z);
      const wantY = base + (landing ? 0 : b.alt);
      const k = Math.min(1, dt * 1.8);
      const oldYaw = Math.atan2(b.vel.x, b.vel.z);
      b.vel.x += (dirX * speed - b.vel.x) * k;
      b.vel.z += (dirZ * speed - b.vel.z) * k;
      b.vel.y += (clamp((wantY - b.pos.y) * 1.5, -6, 6) - b.vel.y) * k;
      b.pos.addScaledVector(b.vel, dt);
      const floor = this.floor(b);
      if (b.pos.y < floor) b.pos.y = floor;
      b.yaw = Math.atan2(b.vel.x, b.vel.z);
      let dy = b.yaw - oldYaw;
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      b.roll += (clamp(-dy / Math.max(dt, 1e-3) * 0.25, -0.9, 0.9) - b.roll) * k;
      b.pitch = -Math.atan2(b.vel.y, Math.hypot(b.vel.x, b.vel.z)) * 0.8;
      const flapping = landing || b.vel.y > 1 || Math.sin(b.t * 1.4 + b.zig) > -1 + 2 * sp.glide;
      b.flapPh += dt * sp.flap * Math.PI * 2 * (flapping ? 1 : 0);
      b.flapAmp = (b.flapAmp || 0) + ((flapping ? 1 : 0) - (b.flapAmp || 0)) * Math.min(1, dt * 8);
      if (b.state === 'fly' && dist < 2.5 && b.pos.y - floor < 0.6) {
        b.state = waterDepth(b.pos.x, b.pos.z) > 0.4 && !sp.legLen ? 'swim' : 'ground';
        b.vel.set(0, 0, 0);
        b.flock.announced = false;
      }
      if (b.state === 'pass' && (dist < 10 || Math.abs(b.pos.x) > PLAY_HALF + 60 || Math.abs(b.pos.z) > PLAY_HALF + 60)) b.state = 'gone';
      return;
    }
    if (b.state === 'dead') {
      b.deadT += dt;
      const floor = this.floor(b);
      if (b.pos.y > floor + 0.01 || b.vel.y > 0) {
        b.vel.y -= 9.8 * dt;
        b.vel.multiplyScalar(1 - dt * 0.3);
        b.pos.addScaledVector(b.vel, dt);
        b.roll += dt * 6;
        b.flapPh += dt * 8;
        if (b.pos.y <= floor) {
          b.pos.y = floor;
          b.vel.set(0, 0, 0);
          if (this.hooks.onLand) this.hooks.onLand(b);
        }
      } else {
        b.roll += (1.4 - b.roll) * Math.min(1, dt * 5);
        b.fold = 0.3;
        b.flapAmp = 0;
      }
      if (b.deadT > 90) b.state = 'gone';
    }
  }

  draw() {
    const counts = {};
    for (const key of Object.keys(this.meshes)) counts[key] = 0;
    for (const b of this.list) {
      const M = this.meshes[b.key];
      const i = counts[b.key];
      if (i >= MAX) continue;
      counts[b.key]++;
      const s = b.sp.len * b.scale * visOf(b.sp);
      _e.set(b.pitch, b.yaw, b.roll);
      _q.setFromEuler(_e);
      _m.compose(b.pos, _q, _s.set(s, s, s));
      M.body.setMatrixAt(i, _m);
      // Alas: plegadas junto al cuerpo en el suelo; batiendo en vuelo.
      const flap = Math.sin(b.flapPh) * 0.95 * (b.flapAmp ?? 0) + 0.12;
      const fold = b.fold;
      for (const [mesh, sx] of [[M.wingL, 1], [M.wingR, -1]]) {
        _t.makeTranslation(sx * 0.1, 0.06, 0.04);
        _w.makeRotationY(sx * fold * 1.25);
        _t.multiply(_w);
        _w.makeRotationZ(sx * (flap * (1 - fold) - fold * 0.15));
        _t.multiply(_w);
        _w.makeScale(1, 1, 1 - fold * 0.3);
        _t.multiply(_w);
        mesh.setMatrixAt(i, _w.multiplyMatrices(_m, _t));
      }
    }
    for (const [key, M] of Object.entries(this.meshes)) {
      for (const part of [M.body, M.wingL, M.wingR]) {
        part.count = counts[key];
        part.instanceMatrix.needsUpdate = true;
      }
    }
    void ZERO;
    void _p;
  }
}
