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

// Suaviza una lista de secciones interpolando (Catmull-Rom) posición y tamaño.
export function subdivide(points, k = 3) {
  if (points.length < 3 || k < 2) return points;
  const out = [];
  const get = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < k; s++) {
      const t = s / k;
      out.push({
        p: [0, 1, 2].map((j) => cr(p0.p[j], p1.p[j], p2.p[j], p3.p[j], t)),
        w: Math.max(0.004, cr(p0.w, p1.w, p2.w, p3.w, t)),
        h: Math.max(0.004, cr(p0.h, p1.h, p2.h, p3.h, t)),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// "Esculpe" un volumen a partir de secciones (superelipses) a lo largo de un camino.
// points: [{ p: [x, y, z], w, h }]; ref: vector que marca hacia dónde mide `h`.
// colorFn(t, cos, sin, pos) -> [r, g, b] en espacio lineal. Devuelve geometría no indexada
// con normales suaves, color y UV (u alrededor, v a lo largo).
export function loft(points, ref, radial, colorFn, n = 2.3, uvScale = [1, 1]) {
  const R = new THREE.Vector3(...ref);
  const P = points.map((q) => new THREE.Vector3(...q.p));
  const pos = [], col = [], uv = [], idx = [];
  const rings = P.length;
  let along = 0;
  for (let i = 0; i < rings; i++) {
    if (i > 0) along += P[i].distanceTo(P[i - 1]);
    const T = P[Math.min(i + 1, rings - 1)].clone().sub(P[Math.max(i - 1, 0)]).normalize();
    const A = new THREE.Vector3().crossVectors(R, T).normalize();
    const B = new THREE.Vector3().crossVectors(T, A).normalize();
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      const v = P[i].clone().addScaledVector(A, ex * points[i].w).addScaledVector(B, ey * points[i].h);
      pos.push(v.x, v.y, v.z);
      col.push(...colorFn(i / (rings - 1), c, s, v));
      uv.push((j / radial) * uvScale[0], along * uvScale[1]);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = (i + 1) * row + j, c = a + 1, d = b + 1;
      idx.push(a, c, b, c, d, b);
    }
  }
  // Tapas en los extremos.
  for (const [ring, flip] of [[0, true], [rings - 1, false]]) {
    const center = pos.length / 3;
    const p = P[ring];
    pos.push(p.x, p.y, p.z);
    col.push(...colorFn(ring / (rings - 1), 0, 0, p));
    uv.push(0.5, 0);
    for (let j = 0; j < radial; j++) {
      const a = ring * row + j, b = a + 1;
      if (flip) idx.push(center, b, a);
      else idx.push(center, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // La costura (j = 0 y j = radial) tiene vértices duplicados: se igualan sus normales.
  const nor = g.attributes.normal;
  for (let i = 0; i < rings; i++) {
    const a = i * row, b = i * row + radial;
    const nx = nor.getX(a) + nor.getX(b), ny = nor.getY(a) + nor.getY(b), nz = nor.getZ(a) + nor.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(a, nx / l, ny / l, nz / l);
    nor.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return g.toNonIndexed();
}
