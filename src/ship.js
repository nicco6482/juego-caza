// Galeón pirata fondeado en medio del lago: casco de madera con franja y portas de cañón,
// castillo de popa con ventanales iluminados, tres palos con velas cuadradas recogidas a medias,
// jarcia y la bandera negra de la calavera ondeando al viento.
import * as THREE from 'three';
import { LAKE, waterDepth, clamp } from './world.js';

const LEN = 26, BEAM = 7, DEPTH = 4.2;
// Calado: la línea de flotación queda a esta distancia bajo la cubierta, así se ve el casco entero.
const DRAFT = 2.1;

// Media manga del casco a lo largo de la eslora (proa en +z, afilada; popa en -z, más llena).
function halfBeam(z) {
  const u = z / (LEN / 2);
  if (u > 0) return (BEAM / 2) * Math.pow(Math.max(0, 1 - u * u), 0.55);
  return (BEAM / 2) * Math.pow(Math.max(0, 1 - Math.pow(-u, 4)), 0.5) * (0.88 + 0.12 * (1 + u));
}
// Arrufo: la cubierta sube hacia proa y sobre todo hacia popa.
const sheer = (z) => {
  const u = z / (LEN / 2);
  return 0.35 * u * u + (u < 0 ? 0.5 * u * u : 0);
};

function hullGeometry() {
  const NZ = 40, NA = 16;
  const pos = [], col = [], idx = [];
  const dark = new THREE.Color('#2a1a10'), band = new THREE.Color('#b8892e'), below = new THREE.Color('#5a1f18');
  for (let i = 0; i <= NZ; i++) {
    const z = -LEN / 2 + (i / NZ) * LEN;
    const w = Math.max(0.02, halfBeam(z));
    const top = sheer(z);
    // La quilla sube hacia los extremos.
    const u = Math.abs(z / (LEN / 2));
    const d = DEPTH * (1 - 0.55 * Math.pow(u, 3));
    for (let j = 0; j <= NA; j++) {
      const th = -Math.PI / 2 + (j / NA) * Math.PI;
      const c = Math.cos(th);
      const x = w * Math.sin(th) * (0.75 + 0.25 * Math.pow(c, 0.3));
      const y = top - d * Math.pow(c, 0.8);
      pos.push(x, y, z);
      // Franja dorada bajo la borda, obra muerta oscura y obra viva rojiza.
      const k = (top - y) / d;
      const cc = k < 0.06 ? dark : k < 0.13 ? band : top - y < DRAFT - 0.25 ? dark : below;
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < NZ; i++) {
    for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j, b = a + NA + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Espejo de popa: tapa el extremo trasero.
  const base = pos.length / 3;
  pos.push(0, sheer(-LEN / 2) - 0.6, -LEN / 2);
  col.push(dark.r, dark.g, dark.b);
  for (let j = 0; j < NA; j++) idx.push(base, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function deckGeometry() {
  const shape = new THREE.Shape();
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const z = -LEN / 2 + (i / N) * LEN;
    const p = [halfBeam(z) * 0.97, z];
    if (i === 0) shape.moveTo(...p);
    else shape.lineTo(...p);
  }
  for (let i = N; i >= 0; i--) {
    const z = -LEN / 2 + (i / N) * LEN;
    shape.lineTo(-halfBeam(z) * 0.97, z);
  }
  const g = new THREE.ShapeGeometry(shape);
  // La forma está en XY: se tumba y se curva con el arrufo.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getY(i);
    p.setXYZ(i, x, sheer(z) - 0.15, z);
  }
  g.computeVertexNormals();
  return g;
}

// Vela cuadrada con bolsa de viento.
function sailGeometry(w, h, belly) {
  const g = new THREE.PlaneGeometry(w, h, 10, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
    p.setZ(i, belly * (1 - x * x) * (1 - 0.6 * y * y) * (0.7 + 0.3 * (1 - y)));
  }
  g.computeVertexNormals();
  return g;
}

function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#0d0d0f';
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#ece6d6';
  g.strokeStyle = '#ece6d6';
  // Tibias cruzadas.
  g.lineWidth = 13;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(78, 122);
  g.lineTo(178, 58);
  g.moveTo(78, 58);
  g.lineTo(178, 122);
  g.stroke();
  for (const [x, y] of [[72, 126], [184, 54], [72, 54], [184, 126]]) {
    g.beginPath();
    g.arc(x - 5, y, 8, 0, Math.PI * 2);
    g.arc(x + 5, y, 8, 0, Math.PI * 2);
    g.fill();
  }
  // Calavera.
  g.beginPath();
  g.ellipse(128, 72, 34, 32, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(108, 88, 40, 24);
  g.fillStyle = '#0d0d0f';
  g.beginPath();
  g.ellipse(115, 72, 9, 10, 0, 0, Math.PI * 2);
  g.ellipse(141, 72, 9, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(128, 82);
  g.lineTo(122, 94);
  g.lineTo(134, 94);
  g.fill();
  for (let i = 0; i < 4; i++) g.fillRect(112 + i * 9, 102, 3, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class PirateShip {
  constructor(scene) {
    this.group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.85 });
    const woodLight = new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.8 });
    const iron = new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.5, metalness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: '#b8892e', roughness: 0.45, metalness: 0.5 });
    const sail = new THREE.MeshStandardMaterial({ color: '#d9ccb0', roughness: 0.95, side: THREE.DoubleSide });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb347', emissiveIntensity: 1.6 });
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };

    add(hullGeometry(), hullMat);
    add(deckGeometry(), woodLight);

    // Borda: listón a lo largo de cada costado.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 24; i++) {
        const z0 = -LEN / 2 + 0.6 + (i / 24) * (LEN - 1.6), z1 = z0 + (LEN - 1.6) / 24;
        const a = new THREE.Vector3(sx * halfBeam(z0) * 0.97, sheer(z0) + 0.55, z0);
        const b = new THREE.Vector3(sx * halfBeam(z1) * 0.97, sheer(z1) + 0.55, z1);
        const len = a.distanceTo(b);
        const rail = add(new THREE.BoxGeometry(0.16, 0.12, len + 0.02), wood);
        rail.position.copy(a).add(b).multiplyScalar(0.5);
        rail.lookAt(b);
        if (i % 2 === 0) add(new THREE.BoxGeometry(0.1, 0.55, 0.1), wood, a.x, a.y - 0.28, a.z);
      }
      // Cañones asomando por las portas.
      for (let i = 0; i < 7; i++) {
        const z = -7 + i * 2.2;
        const x = sx * (halfBeam(z) + 0.05);
        add(new THREE.BoxGeometry(0.08, 0.55, 0.6), gold, x, sheer(z) - 0.75, z);
        add(new THREE.CylinderGeometry(0.13, 0.16, 1.0, 10), iron, x + sx * 0.3, sheer(z) - 0.75, z, 0, 0, Math.PI / 2);
      }
    }

    // Castillo de popa con ventanales y farol.
    const sz = -LEN / 2 + 2.6;
    const sy = sheer(-LEN / 2 + 2.6);
    add(new THREE.BoxGeometry(BEAM * 0.8, 2.0, 5.0), wood, 0, sy + 0.85, sz);
    add(new THREE.BoxGeometry(BEAM * 0.86, 0.15, 5.3), woodLight, 0, sy + 1.9, sz);
    add(new THREE.BoxGeometry(BEAM * 0.84, 0.2, 0.2), gold, 0, sy + 1.2, -LEN / 2 + 0.05);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.55, 0.6, 0.06), glow, -1.35 + i * 0.9, sy + 0.55, -LEN / 2 + 0.05);
    add(new THREE.CylinderGeometry(0.18, 0.12, 0.5, 8), glow, 0, sy + 2.65, -LEN / 2 + 0.5);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), iron, 0, sy + 2.2, -LEN / 2 + 0.5);
    this.lantern = new THREE.PointLight('#ffb347', 0, 14, 2);
    this.lantern.position.set(0, sy + 2.7, -LEN / 2 + 0.5);
    this.group.add(this.lantern);
    // Castillo de proa y bauprés con su botalón.
    add(new THREE.BoxGeometry(BEAM * 0.55, 0.9, 3), wood, 0, sheer(LEN / 2 - 3) + 0.3, LEN / 2 - 3.2);
    add(new THREE.CylinderGeometry(0.12, 0.22, 9, 8), wood, 0, sheer(LEN / 2) + 1.2, LEN / 2 + 2.6, Math.PI / 2 - 0.35, 0, 0);
    // Mascarón de proa dorado.
    add(new THREE.SphereGeometry(0.35, 10, 8), gold, 0, sheer(LEN / 2) - 0.2, LEN / 2 - 0.1);

    // Palos, vergas y velas: trinquete, mayor y mesana.
    this.sails = [];
    const masts = [{ z: 6.5, h: 17, yards: [[5.2, 4.3], [10.2, 3.5], [14.6, 2.6]] }, { z: -0.5, h: 20, yards: [[5.6, 4.8], [11.2, 3.9], [16.3, 2.9]] },
      { z: -7.8, h: 14, yards: [[6.2, 3.2], [10.8, 2.5]] }];
    const tops = [];
    for (const m of masts) {
      const base = sheer(m.z) - 0.2;
      add(new THREE.CylinderGeometry(0.2, 0.34, m.h, 10), wood, 0, base + m.h / 2, m.z);
      // Cofa.
      add(new THREE.CylinderGeometry(1.0, 0.8, 0.3, 12), wood, 0, base + m.yards[0][0] + 3.2, m.z);
      tops.push(new THREE.Vector3(0, base + m.h, m.z));
      m.yards.forEach(([y, half], k) => {
        add(new THREE.CylinderGeometry(0.1, 0.1, half * 2.2, 8), wood, 0, base + y, m.z, 0, 0, Math.PI / 2);
        const next = k + 1 < m.yards.length ? m.yards[k + 1][0] : y + 3;
        const h = (next - y) * 0.92;
        const s = add(sailGeometry(half * 2, h, 0.9), sail, 0, base + y - h / 2 - 0.1 + (k + 1 < m.yards.length ? h : 0) * 0, m.z + 0.25);
        // La vela cuelga de la verga hacia abajo.
        s.position.y = base + y - h / 2;
        this.sails.push(s);
      });
    }
    // Jarcia: obenques de cada palo a las bordas y estays entre palos.
    const pts = [];
    tops.forEach((t, i) => {
      const z = masts[i].z;
      for (const sx of [-1, 1]) {
        for (let k = -1; k <= 1; k++) {
          const zz = z + k * 0.9 - 1;
          pts.push(t.x, t.y - 1.5, t.z, sx * halfBeam(zz) * 0.97, sheer(zz) + 0.5, zz);
        }
      }
      if (i > 0) pts.push(t.x, t.y, t.z, tops[i - 1].x, tops[i - 1].y - 3, tops[i - 1].z);
    });
    pts.push(tops[0].x, tops[0].y, tops[0].z, 0, sheer(LEN / 2) + 2.5, LEN / 2 + 6.5);
    pts.push(tops[2].x, tops[2].y, tops[2].z, 0, sy + 2, -LEN / 2 + 0.3);
    const rig = new THREE.BufferGeometry();
    rig.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.LineSegments(rig, new THREE.LineBasicMaterial({ color: '#1c140e' })));

    // Bandera pirata en lo alto del palo mayor.
    const fw = 3.2, fh = 2;
    this.flagGeo = new THREE.PlaneGeometry(fw, fh, 14, 6);
    this.flagGeo.translate(fw / 2, 0, 0);
    this.flagBase = this.flagGeo.attributes.position.array.slice();
    const flag = new THREE.Mesh(this.flagGeo, new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.9, side: THREE.DoubleSide }));
    flag.position.set(0, tops[1].y - 0.9, tops[1].z);
    // Ondea hacia popa (la proa se orienta al viento).
    flag.rotation.y = Math.PI / 2;
    this.flag = flag;
    this.group.add(flag);

    // Espuma y ondas en la línea de flotación, donde el casco corta el agua.
    const ring = new THREE.Shape(), hole = new THREE.Path();
    const N = 40, wl = (z) => halfBeam(z) * 0.93;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const z = Math.cos(a) * (LEN / 2 + 1.2), zi = Math.cos(a) * (LEN / 2 - 0.8);
      const x = Math.sin(a) * (wl(clamp(z, -LEN / 2, LEN / 2)) + 1.1), xi = Math.sin(a) * wl(clamp(zi, -LEN / 2, LEN / 2)) * 0.95;
      if (i === 0) {
        ring.moveTo(x, z);
        hole.moveTo(xi, zi);
      } else {
        ring.lineTo(x, z);
        hole.lineTo(xi, zi);
      }
    }
    ring.holes.push(hole);
    const foamGeo = new THREE.ShapeGeometry(ring).rotateX(Math.PI / 2);
    this.foamMat = new THREE.MeshBasicMaterial({ color: '#e8efe9', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    this.foam = new THREE.Mesh(foamGeo, this.foamMat);
    this.foam.renderOrder = 3;
    scene.add(this.foam);
    const wakeGeo = new THREE.RingGeometry(1, 1.25, 48).rotateX(-Math.PI / 2);
    this.wakes = [0, 1, 2].map((k) => {
      const m = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ color: '#dfe8e2', transparent: true, opacity: 0, depthWrite: false }));
      m.renderOrder = 3;
      m.userData.phase = k / 3;
      scene.add(m);
      return m;
    });

    // Fondeado en la parte honda del lago, algo apartado del centro.
    this.anchor = this.findSpot();
    this.group.position.set(this.anchor.x, LAKE.level + DRAFT, this.anchor.z);
    this.heading = Math.random() * Math.PI * 2;
    this.group.rotation.y = this.heading;
    scene.add(this.group);
    this.t = Math.random() * 10;
  }

  findSpot() {
    let best = { x: LAKE.x, z: LAKE.z, d: waterDepth(LAKE.x, LAKE.z) };
    for (let i = 0; i < 200; i++) {
      const a = (i / 200) * Math.PI * 2 * 7, r = LAKE.r * 0.35 * (i / 200);
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      // Que quepa: comprueba la profundidad bajo proa y popa.
      let min = Infinity;
      for (const k of [-1, -0.5, 0, 0.5, 1]) for (const dir of [0, Math.PI / 2]) {
        min = Math.min(min, waterDepth(x + Math.cos(dir) * k * LEN * 0.5, z + Math.sin(dir) * k * LEN * 0.5));
      }
      if (min > best.d) best = { x, z, d: min };
    }
    return best;
  }

  update(dt, wind, dayK = 0) {
    this.t += dt;
    const t = this.t;
    // Cabeceo y balanceo suaves.
    // Flota: sube y baja con el oleaje, cabecea y se balancea.
    const heave = Math.sin(t * 0.7) * 0.12 + Math.sin(t * 1.3 + 2) * 0.04;
    this.group.position.y = LAKE.level + DRAFT + heave;
    this.group.rotation.x = Math.sin(t * 0.55) * 0.018;
    this.group.rotation.z = Math.sin(t * 0.43 + 1) * 0.04 + Math.sin(t * 1.1) * 0.01;
    this.foam.position.set(this.anchor.x, LAKE.level + 0.03, this.anchor.z);
    this.foam.rotation.y = this.group.rotation.y;
    this.foamMat.opacity = 0.3 + 0.15 * Math.sin(t * 1.4) + heave * 0.6;
    // Ondas que salen del casco al subir y bajar.
    for (const w of this.wakes) {
      const k = (t * 0.12 + w.userData.phase) % 1;
      w.position.set(this.anchor.x, LAKE.level + 0.02, this.anchor.z);
      w.rotation.y = this.group.rotation.y;
      w.scale.set(BEAM * 0.6 + k * 16, 1, LEN * 0.55 + k * 16);
      w.material.opacity = 0.22 * (1 - k) * Math.min(1, k * 6);
    }
    // Borneo: la proa se orienta despacio al viento.
    if (wind) {
      const want = Math.atan2(-wind.x, -wind.z);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * 0.02);
      this.group.rotation.y = this.heading;
    }
    // Bandera ondeando.
    const p = this.flagGeo.attributes.position, b = this.flagBase;
    const speed = wind ? Math.max(1, wind.speed) : 2;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3];
      const w = x / 3.2;
      p.array[i * 3 + 2] = Math.sin(x * 1.9 - t * (2 + speed * 0.6)) * 0.28 * w + Math.sin(x * 3.7 - t * 4.1) * 0.06 * w;
      p.array[i * 3 + 1] = b[i * 3 + 1] - w * w * 0.25 / speed;
    }
    p.needsUpdate = true;
    this.flagGeo.computeVertexNormals();
    // Velas que respiran con las rachas.
    const gust = 1 + Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3) * 0.02;
    for (const s of this.sails) s.scale.z = gust;
    // El farol se enciende al caer la tarde.
    this.lantern.intensity = dayK > 0.6 ? (dayK - 0.6) * 10 : 0;
  }
}
