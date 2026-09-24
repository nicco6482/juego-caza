// Utilidades para construir modelos low-poly a base de piezas con color por vértice
// y fusionarlas en una sola geometría (una sola llamada de dibujo por modelo).
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function colorize(geo, color, matrix, jitter) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  g.applyMatrix4(matrix);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    // Variación por cara: da un aspecto pictórico y menos plano.
    const k = 1 + (Math.random() * 2 - 1) * jitter;
    for (let j = 0; j < 3 && i + j < n; j++) {
      col[(i + j) * 3] = c.r * k;
      col[(i + j) * 3 + 1] = c.g * k;
      col[(i + j) * 3 + 2] = c.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], jitter = 0.06) {
  _m.compose(_p.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...scale));
  return colorize(geo, color, _m, jitter);
}

// Cilindro (o tronco de cono) entre dos puntos. r1 en `a`, r2 en `b`.
export function between(a, b, r1, r2, color, radial = 6, jitter = 0.05) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, 1, radial, 1);
  _q.setFromUnitVectors(_up, dir.normalize());
  _m.compose(A.add(B).multiplyScalar(0.5), _q, _s.set(1, len, 1));
  return colorize(geo, color, _m, jitter);
}

export function merge(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Intersección segmento-esfera. Devuelve el parámetro t de entrada (0..tMax) o -1.
export function segmentSphere(a, b, c, r, tMax = 1) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz;
  const B = 2 * (fx * dx + fy * dy + fz * dz);
  const C = fx * fx + fy * fy + fz * fz - r * r;
  if (C <= 0) return 0;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A === 0) return -1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= tMax ? t : -1;
}
