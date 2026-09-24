// Fauna del coto: modelos, comportamiento (oído, vista, olfato), manadas y zonas de impacto.
import * as THREE from 'three';
import { part, between, merge, segmentSphere } from './geo.js';
import { groundAt, forestAt, slopeAt, PLAY_HALF, clamp } from './world.js';

export const SPECIES = {
  ciervo: {
    name: 'Ciervo', legal: true, points: 120, scale: 1.0, build: 'deer', antlers: 'stag',
    walk: 1.3, run: 12.5, hearing: 75, sight: 125, smell: 170,
    col: { body: '#74502f', dark: '#3a2a1b', light: '#c7ae86', rump: '#d9c8a4', nose: '#1d1712', antler: '#d8c7a2' },
  },
  cierva: {
    name: 'Cierva', legal: false, penalty: 250, scale: 0.86, build: 'deer', antlers: null,
    walk: 1.3, run: 12.5, hearing: 85, sight: 130, smell: 170,
    col: { body: '#8a6440', dark: '#4a3622', light: '#d2bb92', rump: '#e2d3b2', nose: '#1d1712' },
  },
  corzo: {
    name: 'Corzo', legal: true, points: 150, scale: 0.62, build: 'deer', antlers: 'roe',
    walk: 1.2, run: 11, hearing: 90, sight: 115, smell: 150,
    col: { body: '#8d5a31', dark: '#3d2819', light: '#c9a57c', rump: '#f0e9da', nose: '#161210', antler: '#cdb994' },
  },
  jabali: {
    name: 'Jabalí', legal: true, points: 110, scale: 0.82, build: 'boar', antlers: null,
    walk: 1.0, run: 10, hearing: 65, sight: 60, smell: 210,
    col: { body: '#3f362d', dark: '#221c16', light: '#5c4f41', rump: '#3f362d', nose: '#4a3a33', tusk: '#efe6cf' },
  },
  zorro: {
    name: 'Zorro', legal: true, points: 180, scale: 0.44, build: 'fox', antlers: null,
    walk: 1.4, run: 11.5, hearing: 95, sight: 95, smell: 170,
    col: { body: '#b8622a', dark: '#2a1d15', light: '#efe4d2', rump: '#b8622a', nose: '#1a1310' },
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
  deer: { L: 0.92, bl: 1.5, bh: 0.6, bw: 0.46, neckLen: 0.62, neckR: 0.13, hs: 0.17, snout: 0.26, rest: 0.5, graze: 2.05 },
  boar: { L: 0.52, bl: 1.35, bh: 0.74, bw: 0.6, neckLen: 0.22, neckR: 0.27, hs: 0.25, snout: 0.36, rest: 1.25, graze: 1.9 },
  fox: { L: 0.55, bl: 1.45, bh: 0.46, bw: 0.38, neckLen: 0.34, neckR: 0.11, hs: 0.18, snout: 0.3, rest: 0.75, graze: 1.9 },
};

const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 });
const geoCache = new Map();

function buildGeometry(key) {
  if (geoCache.has(key)) return geoCache.get(key);
  const sp = SPECIES[key];
  const b = BUILDS[sp.build];
  const c = sp.col;
  const { L, bl, bh, bw, neckLen, neckR, hs, snout } = b;
  const by = L + bh * 0.28;
  const S = (w, h, d) => [w, h, d];
  const sphere = new THREE.SphereGeometry(1, 12, 9);
  const ico = new THREE.IcosahedronGeometry(1, 1);

  // --- Tronco ---
  const torso = [
    part(sphere, c.body, [0, by, 0], [0, 0, 0], S(bw / 2, bh / 2, bl / 2)),
    part(sphere, c.body, [0, by - 0.02, bl * 0.28], [0, 0, 0], S(bw * 0.52, bh * 0.56, bl * 0.3)),
    part(sphere, c.body, [0, by + 0.02, -bl * 0.3], [0, 0, 0], S(bw * 0.5, bh * 0.52, bl * 0.28)),
    part(sphere, c.light, [0, by - bh * 0.2, 0.02], [0, 0, 0], S(bw * 0.42, bh * 0.32, bl * 0.4)),
  ];
  if (sp.build === 'deer') {
    torso.push(part(sphere, c.rump, [0, by + 0.04, -bl * 0.535], [0, 0, 0], S(bw * 0.27, bh * 0.3, 0.06)));
    torso.push(part(new THREE.ConeGeometry(0.05, 0.16, 5), c.dark, [0, by + bh * 0.25, -bl * 0.57], [-2.4, 0, 0]));
  } else if (sp.build === 'boar') {
    // Crin erizada sobre el lomo y cuartos delanteros potentes.
    torso.push(part(sphere, c.body, [0, by + 0.08, bl * 0.2], [0, 0, 0], S(bw * 0.55, bh * 0.62, bl * 0.34)));
    for (let i = 0; i < 7; i++) {
      const z = bl * (0.38 - i * 0.12);
      torso.push(part(new THREE.ConeGeometry(0.06, 0.18, 4), c.dark, [0, by + bh * 0.5 - i * 0.012, z], [-0.5, 0, 0]));
    }
    torso.push(between([0, by + 0.1, -bl * 0.52], [0, by - 0.2, -bl * 0.6], 0.03, 0.02, c.dark, 4));
  } else if (sp.build === 'fox') {
    torso.push(part(sphere, c.body, [0, by - 0.05, -bl * 0.85], [0.55, 0, 0], S(0.17, 0.17, 0.52)));
    torso.push(part(sphere, c.light, [0, by - 0.33, -bl * 1.15], [0.55, 0, 0], S(0.11, 0.11, 0.16)));
    torso.push(part(sphere, c.light, [0, by - 0.05, bl * 0.36], [0, 0, 0], S(bw * 0.4, bh * 0.42, bl * 0.14)));
  }

  // --- Cuello y cabeza (se mueven juntos al pastar o al mirar) ---
  const headRot = -b.rest + 0.35;
  const hm = new THREE.Matrix4().makeRotationX(headRot).setPosition(0, neckLen, 0);
  const H = (g) => { g.applyMatrix4(hm); return g; };
  const neck = [
    between([0, -neckR * 0.8, 0], [0, neckLen + 0.02, 0], neckR, neckR * 0.72, c.body, 7),
    H(part(sphere, c.body, [0, hs * 0.3, hs * 0.15], [0, 0, 0], S(hs * 0.85, hs * 0.9, hs * 1.15))),
    H(between([0, hs * 0.15, hs * 0.6], [0, -hs * 0.08, hs * 0.6 + snout], hs * 0.56, hs * (sp.build === 'fox' ? 0.18 : 0.36), sp.build === 'boar' ? c.body : c.body, 7)),
    H(part(sphere, c.nose, [0, -hs * 0.08, hs * 0.6 + snout], [0, 0, 0], S(hs * (sp.build === 'boar' ? 0.42 : 0.26), hs * (sp.build === 'boar' ? 0.36 : 0.2), hs * 0.12))),
    H(part(sphere, '#0c0a08', [hs * 0.72, hs * 0.5, hs * 0.55], [0, 0, 0], S(0.03, 0.03, 0.03))),
    H(part(sphere, '#0c0a08', [-hs * 0.72, hs * 0.5, hs * 0.55], [0, 0, 0], S(0.03, 0.03, 0.03))),
  ];
  const earLen = sp.build === 'fox' ? hs * 1.2 : sp.build === 'boar' ? hs * 0.7 : hs * 1.25;
  for (const sx of [-1, 1]) {
    neck.push(H(part(new THREE.ConeGeometry(hs * 0.28, earLen, 5), sp.build === 'fox' ? c.dark : c.body,
      [sx * hs * 0.62, hs * 0.95 + earLen * 0.35, -hs * 0.15], [-0.25, 0, -sx * (sp.build === 'fox' ? 0.2 : 0.9)])));
  }
  if (sp.build === 'deer') {
    neck.push(part(sphere, c.light, [0, neckLen * 0.35, neckR * 0.7], [0, 0, 0], S(neckR * 0.6, neckLen * 0.35, neckR * 0.4)));
  }
  if (sp.build === 'boar') {
    for (const sx of [-1, 1]) {
      neck.push(H(part(new THREE.ConeGeometry(0.03, 0.14, 4), c.tusk, [sx * hs * 0.42, hs * 0.02, hs * 0.55 + snout * 0.75], [-0.4, 0, sx * 0.5])));
    }
  }
  if (sp.antlers === 'stag') {
    for (const sx of [-1, 1]) {
      const p0 = [sx * hs * 0.4, hs * 1.05, 0];
      const p1 = [p0[0] + sx * 0.22, p0[1] + 0.42, -0.12];
      const p2 = [p1[0] + sx * 0.12, p1[1] + 0.38, -0.02];
      const p3 = [p2[0] - sx * 0.02, p2[1] + 0.26, 0.1];
      neck.push(H(between(p0, p1, 0.04, 0.032, c.antler, 5)));
      neck.push(H(between(p1, p2, 0.032, 0.025, c.antler, 5)));
      neck.push(H(between(p2, p3, 0.025, 0.012, c.antler, 5)));
      neck.push(H(between([p0[0], p0[1] + 0.06, p0[2]], [p0[0] + sx * 0.04, p0[1] + 0.12, 0.28], 0.025, 0.01, c.antler, 4)));
      neck.push(H(between([p1[0], p1[1] - 0.12, p1[2]], [p1[0] + sx * 0.02, p1[1] + 0.02, 0.2], 0.022, 0.01, c.antler, 4)));
      neck.push(H(between(p2, [p2[0] + sx * 0.1, p2[1] + 0.2, -0.12], 0.02, 0.008, c.antler, 4)));
      neck.push(H(between(p2, [p2[0] - sx * 0.02, p2[1] + 0.22, 0.2], 0.02, 0.008, c.antler, 4)));
    }
  } else if (sp.antlers === 'roe') {
    for (const sx of [-1, 1]) {
      const p0 = [sx * hs * 0.35, hs * 1.05, 0];
      const p1 = [p0[0] + sx * 0.03, p0[1] + 0.3, -0.03];
      neck.push(H(between(p0, p1, 0.035, 0.015, c.antler, 5)));
      neck.push(H(between([p0[0], p0[1] + 0.16, 0], [p0[0] + sx * 0.02, p0[1] + 0.24, 0.1], 0.018, 0.007, c.antler, 4)));
      neck.push(H(between([p0[0], p0[1] + 0.2, 0], [p0[0] + sx * 0.02, p0[1] + 0.27, -0.1], 0.018, 0.007, c.antler, 4)));
    }
  }

  // --- Patas (pivote en la cadera) ---
  const legR = sp.build === 'boar' ? 0.07 : sp.build === 'fox' ? 0.06 : 0.065;
  const makeLeg = (hind) => {
    const knee = hind ? [0, -L * 0.45, -0.09] : [0, -L * 0.5, 0.03];
    const g = [
      between([0, 0.08, 0], knee, legR * (hind ? 1.9 : 1.5), legR, hind ? c.body : c.body, 6),
      between(knee, [0, -L + 0.05, 0], legR * 0.8, legR * 0.62, sp.build === 'fox' ? c.dark : c.body, 5),
      part(new THREE.CylinderGeometry(legR * 0.7, legR * 0.9, 0.07, 5), c.dark, [0, -L + 0.035, 0.01]),
    ];
    return merge(g);
  };

  const result = {
    b, by,
    torso: merge(torso),
    neck: merge(neck),
    front: makeLeg(false),
    hind: makeLeg(true),
  };
  geoCache.set(key, result);
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
    const g = buildGeometry(key);
    this.b = g.b;
    const b = g.b;

    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    const s = this.sp.scale * (0.92 + Math.random() * 0.16);
    this.scale = s;
    this.group.scale.setScalar(s);

    const mk = (geo) => {
      const m = new THREE.Mesh(geo, material);
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

    this.legs = [];
    const hx = b.bw * 0.27;
    for (const [lx, lz, hind] of [[hx, b.bl * 0.3, false], [-hx, b.bl * 0.3, false], [hx, -b.bl * 0.32, true], [-hx, -b.bl * 0.32, true]]) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, b.L, lz);
      pivot.add(mk(hind ? g.hind : g.front));
      this.body.add(pivot);
      this.legs.push(pivot);
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
    else this.suspicion = Math.max(0, this.suspicion - dt * 0.22);

    if (this.state !== 'flee') {
      if (this.suspicion > 2.2) this.startFlee(ctx.player.x, ctx.player.z);
      else if (this.suspicion > 1 && this.state !== 'alert') {
        this.threat.set(ctx.player.x, 0, ctx.player.z);
        this.setState('alert', 5 + Math.random() * 4);
        if (this.herd) this.herd.nudge(this);
        if (this.onAlert) this.onAlert(this);
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
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

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
      if (slopeAt(x, z) < 0.45) {
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
    if (this.state === 'graze') this.neck.rotation.x += Math.sin(performance.now() * 0.004 + this.id) * 0.05;
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
};

export class Fauna {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.animals = [];
    this.herds = [];
    this.respawnTimer = 40;
  }

  clear() {
    for (const a of this.animals) a.dispose(this.scene);
    this.animals = [];
    this.herds = [];
  }

  findSpot(px, pz, minD, maxD, forestMax) {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minD + Math.random() * (maxD - minD);
      const x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
      if (Math.abs(x) > PLAY_HALF - 40 || Math.abs(z) > PLAY_HALF - 40) continue;
      if (forestAt(x, z) > forestMax || slopeAt(x, z) > 0.4) continue;
      return [x, z];
    }
    return null;
  }

  spawnHerd(type, px, pz, minD, maxD) {
    const spot = this.findSpot(px, pz, minD, maxD, type === 'jabalies' ? 0.3 : 0.08);
    if (!spot) return;
    const herd = new Herd(spot[0], spot[1]);
    for (const key of HERD_TYPES[type]()) {
      const x = spot[0] + (Math.random() - 0.5) * 16, z = spot[1] + (Math.random() - 0.5) * 16;
      const an = new Animal(key, herd, x, z, this.scene);
      an.onBleed = this.hooks.onBleed;
      an.onBledOut = this.hooks.onBledOut;
      an.onAlarm = this.hooks.onAlarm;
      herd.members.push(an);
      this.animals.push(an);
    }
    this.herds.push(herd);
  }

  spawnInitial(px, pz) {
    const plan = ['ciervos', 'ciervos', 'ciervos', 'ciervos', 'corzos', 'corzos', 'corzos', 'corzos', 'jabalies', 'jabalies', 'jabalies', 'zorro', 'zorro', 'zorro'];
    for (const t of plan) this.spawnHerd(t, px, pz, 110, 360);
  }

  update(dt, ctx) {
    for (const h of this.herds) h.update(dt);
    for (const a of this.animals) {
      if (a.alive || a.deathT < 3) a.update(dt, ctx);
    }
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 45;
      const legalAlive = this.animals.filter((a) => a.alive && a.sp.legal).length;
      if (legalAlive < 14) {
        const types = Object.keys(HERD_TYPES);
        this.spawnHerd(types[Math.floor(Math.random() * types.length)], ctx.player.x, ctx.player.z, 250, 380);
      }
    }
  }

  onGunshot(x, z) {
    for (const a of this.animals) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      const delay = d / 343 + 0.1 + Math.random() * 0.25;
      if (d < 260) a.hearShot(x, z, delay, 1);
      else if (d < 480) a.hearShot(x, z, delay, Math.random() < 0.4 ? 1 : 0.5);
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
