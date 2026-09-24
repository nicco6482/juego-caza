// El monstruo del lago: pasa casi todo el tiempo sumergido y de vez en cuando asoma el cuello
// y las jorobas. Si fallas, se sumerge. Es el trofeo legendario del coto.
import * as THREE from 'three';
import { loft, subdivide, merge, part, segmentSphere } from './geo.js';
import { customize } from './fog.js';
import { LAKE, waterDepth } from './world.js';

const BODY = '#34443d', BELLY = '#6d7a62';

function buildMesh() {
  const body = new THREE.Color(BODY), belly = new THREE.Color(BELLY);
  const col = (t, c, s) => {
    const k = Math.max(0, -s);
    return [body.r + (belly.r - body.r) * k, body.g + (belly.g - body.g) * k, body.b + (belly.b - body.b) * k];
  };
  const parts = [];
  // Cuello: sale del agua y se curva hacia delante.
  parts.push(loft(subdivide([
    { p: [0, -1.2, -0.6], w: 0.7, h: 0.8 }, { p: [0, 0.6, -0.1], w: 0.5, h: 0.55 }, { p: [0, 2.2, 0.4], w: 0.35, h: 0.38 },
    { p: [0, 3.4, 1.2], w: 0.28, h: 0.3 }, { p: [0, 3.7, 1.9], w: 0.22, h: 0.22 },
  ], 4), [0, 0, 1], 16, col, 2));
  // Cabeza.
  parts.push(loft(subdivide([
    { p: [0, 3.72, 1.7], w: 0.2, h: 0.2 }, { p: [0, 3.78, 2.05], w: 0.32, h: 0.28 }, { p: [0, 3.7, 2.5], w: 0.24, h: 0.18 },
    { p: [0, 3.62, 2.8], w: 0.02, h: 0.02 },
  ], 3), [0, 1, 0], 14, col, 2.2));
  const sphere = new THREE.SphereGeometry(1, 12, 10);
  for (const sx of [-1, 1]) parts.push(part(sphere, '#d8c14a', [sx * 0.24, 3.86, 2.2], [0, 0, 0], [0.06, 0.06, 0.06], 0.01));
  // Jorobas del lomo, cada vez más pequeñas.
  [[-2.4, 0.9, 1.4], [-4.8, 0.7, 1.1], [-6.9, 0.45, 0.8]].forEach(([z, h, r]) => {
    parts.push(loft(subdivide([
      { p: [0, -0.8, z - r], w: 0.05, h: 0.05 }, { p: [0, h * 0.4, z - r * 0.6], w: r * 0.6, h: h * 0.9 },
      { p: [0, h * 0.7, z], w: r * 0.7, h: h }, { p: [0, h * 0.4, z + r * 0.6], w: r * 0.6, h: h * 0.9 },
      { p: [0, -0.8, z + r], w: 0.05, h: 0.05 },
    ], 3), [0, 1, 0], 14, col, 2.2));
  });
  const mat = customize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }), 'nessie');
  const mesh = new THREE.Mesh(merge(parts), mat);
  mesh.castShadow = true;
  return mesh;
}

const _v = new THREE.Vector3();

export class Nessie {
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.group = new THREE.Group();
    this.group.add(buildMesh());
    this.group.visible = false;
    scene.add(this.group);
    this.pos = new THREE.Vector3(LAKE.x, LAKE.level - 6, LAKE.z);
    this.heading = 0;
    this.reset();
    // Zonas de impacto (en coordenadas locales).
    this.spots = [
      { p: new THREE.Vector3(0, 3.75, 2.1), r: 0.45, zone: 'Cabeza' },
      { p: new THREE.Vector3(0, 2.2, 0.4), r: 0.5, zone: 'Cuello' },
      { p: new THREE.Vector3(0, 0.6, -0.1), r: 0.6, zone: 'Cuello' },
      { p: new THREE.Vector3(0, 0.4, -2.4), r: 1.3, zone: 'Lomo' },
      { p: new THREE.Vector3(0, 0.3, -4.8), r: 1.0, zone: 'Lomo' },
    ];
  }

  reset() {
    this.state = 'hidden';
    this.timer = 35 + Math.random() * 50;
    this.alive = true;
    this.rise = 0;
    this.dive = 0;
    this.group.visible = false;
  }

  pickSpot() {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, r = LAKE.r * Math.random() * 0.6;
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      if (waterDepth(x, z) > 2) {
        this.pos.set(x, 0, z);
        this.heading = Math.random() * Math.PI * 2;
        return true;
      }
    }
    return false;
  }

  visibleNow() {
    return this.group.visible && (this.state === 'up' || this.state === 'rising' || (this.state === 'sinking' && this.rise > 0.35));
  }

  // El disparo la asusta, pero tarda un momento en reaccionar (le llega el ruido y se sumerge).
  onGunshot() {
    if (this.alive && this.state === 'up' && !(this.dive > 0)) this.dive = 0.6;
  }

  segmentHit(a, c) {
    if (!this.visibleNow() || !this.alive) return null;
    this.group.updateMatrixWorld(true);
    let best = null;
    for (const s of this.spots) {
      _v.copy(s.p).applyMatrix4(this.group.matrixWorld);
      if (_v.y < LAKE.level - 0.3) continue;
      const t = segmentSphere(a, c, _v, s.r);
      if (t >= 0 && (!best || t < best.t)) best = { t, zone: s.zone };
    }
    return best;
  }

  kill() {
    if (!this.alive) return false;
    this.alive = false;
    this.state = 'dying';
    this.timer = 6;
    return true;
  }

  update(dt, player) {
    this.timer -= dt;
    const baseY = LAKE.level;
    if (this.state === 'hidden') {
      if (this.timer <= 0 && this.pickSpot()) {
        this.state = 'rising';
        this.timer = 3.5;
        this.group.visible = true;
        this.rise = 0;
        if (this.hooks.onSurface) this.hooks.onSurface(this, player ? this.pos.distanceTo(player) : 999);
      }
      return;
    }
    if (this.state === 'rising') this.rise = Math.min(1, this.rise + dt / 3.5);
    if (this.state === 'rising' && this.timer <= 0) {
      this.state = 'up';
      this.timer = 9 + Math.random() * 8;
    }
    if (this.dive > 0) {
      this.dive -= dt;
      if (this.dive <= 0 && this.alive && this.state === 'up') {
        this.state = 'sinking';
        this.timer = 2.5;
      }
    }
    if (this.state === 'up') {
      // Nada despacio y mueve el cuello.
      const nx = this.pos.x + Math.sin(this.heading) * 1.4 * dt, nz = this.pos.z + Math.cos(this.heading) * 1.4 * dt;
      if (waterDepth(nx, nz) > 2) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else this.heading += dt;
      if (this.timer <= 0) {
        this.state = 'sinking';
        this.timer = 3.5;
      }
    }
    if (this.state === 'sinking') {
      this.rise = Math.max(0, this.rise - dt / 3.5);
      if (this.timer <= 0) this.reset();
    }
    if (this.state === 'dying') {
      this.rise = Math.max(-0.2, this.rise - dt / 8);
      this.group.rotation.z = Math.min(1.2, this.group.rotation.z + dt * 0.25);
      if (this.timer <= 0) {
        this.group.visible = false;
        this.state = 'gone';
      }
    }
    if (this.state === 'gone') return;
    const t = performance.now() * 0.001;
    this.group.position.set(this.pos.x, baseY - 5.5 + this.rise * 5.5 + Math.sin(t * 0.8) * 0.08, this.pos.z);
    this.group.rotation.y = this.heading + Math.sin(t * 0.3) * 0.15;
    if (this.state !== 'dying') this.group.rotation.z = Math.sin(t * 0.5) * 0.04;
  }
}
