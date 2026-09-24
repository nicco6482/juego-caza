// Partículas (polvo, corteza, sangre, humo) y manchas de sangre en el suelo.
import * as THREE from 'three';
import { groundAt } from './world.js';

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const map = puffTexture();
    this.particles = [];
    for (let i = 0; i < 120; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: true }));
      s.visible = false;
      scene.add(s);
      this.particles.push({ s, vel: new THREE.Vector3(), life: 0, age: 0, s0: 1, s1: 1, a0: 1, grav: 0 });
    }
    this.next = 0;

    const decalGeo = new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2);
    const decalMat = new THREE.MeshStandardMaterial({
      color: '#5e0c0c', roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.decalMax = 900;
    this.decals = new THREE.InstancedMesh(decalGeo, decalMat, this.decalMax);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.receiveShadow = true;
    scene.add(this.decals);
    this.decalIndex = 0;
    this._d = new THREE.Object3D();
  }

  emit(pos, { color = '#ffffff', count = 6, size = 0.4, grow = 2.5, life = 1.2, speed = 1, rise = 0.6, alpha = 0.8, grav = 0, dir = null }) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.next];
      this.next = (this.next + 1) % this.particles.length;
      p.s.visible = true;
      p.s.position.copy(pos);
      p.s.material.color.set(color);
      p.s.material.opacity = alpha;
      p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.5 + rise, (Math.random() - 0.5) * speed);
      if (dir) p.vel.addScaledVector(dir, speed * (0.5 + Math.random()));
      p.life = life * (0.7 + Math.random() * 0.6);
      p.age = 0;
      p.s0 = size * (0.7 + Math.random() * 0.6);
      p.s1 = p.s0 * grow;
      p.a0 = alpha;
      p.grav = grav;
      p.s.scale.setScalar(p.s0);
    }
  }

  dust(pos, color = '#b39b76') {
    this.emit(pos, { color, count: 7, size: 0.35, grow: 3.5, life: 1.6, speed: 1.4, rise: 1.2, alpha: 0.75 });
    this.emit(pos, { color: '#6d5a42', count: 5, size: 0.08, grow: 1, life: 0.6, speed: 3, rise: 3, alpha: 1, grav: 9.8 });
  }

  bark(pos) {
    this.emit(pos, { color: '#6b4c33', count: 8, size: 0.07, grow: 1, life: 0.7, speed: 3, rise: 1.5, alpha: 1, grav: 9.8 });
    this.emit(pos, { color: '#a58a6c', count: 3, size: 0.3, grow: 2.5, life: 1, speed: 0.6, rise: 0.4, alpha: 0.5 });
  }

  blood(pos, dir) {
    this.emit(pos, { color: '#8a1010', count: 10, size: 0.07, grow: 1.2, life: 0.6, speed: 2.5, rise: 0.8, alpha: 1, grav: 9.8, dir });
    this.emit(pos, { color: '#7a1a1a', count: 3, size: 0.25, grow: 2.2, life: 0.8, speed: 0.4, rise: 0.2, alpha: 0.55 });
  }

  smoke(pos, dir) {
    this.emit(pos, { color: '#d8d4cc', count: 5, size: 0.12, grow: 6, life: 1.6, speed: 0.5, rise: 0.25, alpha: 0.35, dir });
  }

  bloodDrop(x, z, size = 1) {
    const d = this._d;
    const i = this.decalIndex;
    this.decalIndex = (this.decalIndex + 1) % this.decalMax;
    const px = x + (Math.random() - 0.5) * 0.5, pz = z + (Math.random() - 0.5) * 0.5;
    d.position.set(px, groundAt(px, pz) + 0.04, pz);
    d.rotation.set(0, Math.random() * 6, 0);
    const s = (0.06 + Math.random() * 0.1) * size;
    d.scale.set(s * (0.7 + Math.random() * 0.8), 1, s);
    d.updateMatrix();
    this.decals.setMatrixAt(i, d.matrix);
    this.decals.count = Math.max(this.decals.count, i + 1);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    for (const p of this.particles) {
      if (!p.s.visible) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.s.visible = false;
        continue;
      }
      const k = p.age / p.life;
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(1 - Math.min(1, dt * (p.grav ? 0.5 : 1.8)));
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * Math.sqrt(k));
      p.s.material.opacity = p.a0 * (1 - k) * (1 - k);
    }
  }
}
