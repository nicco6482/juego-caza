// Rehala del cazador: bracos húngaros (muestra y cobro), podencos (campean y levantan caza)
// y teckels (rastro de sangre de las piezas heridas).
import * as THREE from 'three';
import { Animal } from './animals.js';
import { groundAt, waterDepth, LAKE, PLAY_HALF, clamp } from './world.js';

const ROLES = {
  braco: { role: 'retriever', range: 16, quest: 6, run: 9 },
  podenco: { role: 'flusher', range: 32, quest: 8, run: 11 },
  teckel: { role: 'tracker', range: 0, quest: 3, run: 5.5 },
};

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

class Dog extends Animal {
  constructor(key, scene, index) {
    super(key, null, 0, 0, scene);
    this.cfg = ROLES[key];
    this.index = index;
    this.task = null;
    this.clock = Math.random() * 10;
    this.seed = Math.random() * 100;
    this.state = 'idle';
    this.barkT = 0;
    this.sit = 0;
    // Punto de la boca (para llevar las aves).
    const b = this.b;
    const hm = new THREE.Matrix4().makeRotationX(-b.rest + 0.35).setPosition(0, b.neckLen, 0);
    const v = new THREE.Vector3(0, -b.hs * 0.2, b.hs * 0.3 + b.snout * 0.8).applyMatrix4(hm);
    this.mouth = new THREE.Object3D();
    this.mouth.position.copy(v);
    this.neck.add(this.mouth);
  }

  place(x, z) {
    this.pos.set(x, groundAt(x, z), z);
    this.speed = 0;
    this.task = null;
    this.syncTransform();
  }

  // Mueve el perro hacia un punto a cierta velocidad.
  steer(dt, tx, tz, speed) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    let target = speed;
    if (d < 0.6) target = 0;
    else if (d < 3) target = Math.min(speed, d * 1.2);
    const want = Math.atan2(dx, dz);
    if (d > 0.3) this.heading += clamp(wrap(want - this.heading), -5 * dt, 5 * dt);
    this.speed += clamp(target - this.speed, -12 * dt, 8 * dt);
    const swim = waterDepth(this.pos.x, this.pos.z) > 0.35;
    const v = this.speed * (swim ? 0.45 : 1);
    this.pos.x = clamp(this.pos.x + Math.sin(this.heading) * v * dt, -PLAY_HALF, PLAY_HALF);
    this.pos.z = clamp(this.pos.z + Math.cos(this.heading) * v * dt, -PLAY_HALF, PLAY_HALF);
    this.vel.set(Math.sin(this.heading) * v, 0, Math.cos(this.heading) * v);
    return d;
  }

  // Postura de sentado: cuartos traseros al suelo, manos rectas y la cabeza alta.
  // La inclinación se ajusta a las proporciones (un teckel apenas se inclina).
  applySit() {
    const k = this.sit;
    if (k <= 0.001) return;
    const b = this.b;
    const tilt = Math.min(0.75, Math.asin(Math.min(1, (0.82 * b.L) / (0.62 * b.bl)))) * k;
    this.body.rotation.x = -tilt;
    this.body.position.y = (b.L - (Math.cos(tilt) * b.L + 0.3 * b.bl * Math.sin(tilt))) * k;
    for (let i = 0; i < 4; i++) {
      const rest = i < 2 ? tilt : -0.95 * k;
      this.legs[i].rotation.x += (rest - this.legs[i].rotation.x) * k;
    }
    this.neck.rotation.x += tilt * 0.6;
  }

  mouthPos(out) {
    this.group.updateMatrixWorld(true);
    return this.mouth.getWorldPosition(out);
  }

  syncDog() {
    this.syncTransform();
    const depth = waterDepth(this.pos.x, this.pos.z);
    if (depth > 0.35) {
      // Nadando: solo asoman la cabeza y el lomo.
      this.group.position.y = LAKE.level - this.b.by * this.scale * 0.8;
      this.group.rotation.x = -0.15;
    }
  }
}

export class DogPack {
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.dogs = [];
    const roster = [['braco', 2], ['podenco', 3], ['teckel', 2]];
    let i = 0;
    for (const [key, n] of roster) for (let k = 0; k < n; k++) this.dogs.push(new Dog(key, scene, i++));
    this.retrieveQueue = [];
    this.tracks = [];
    this.still = 0;
    this.lineYaw = null;
    this.visible = false;
    this.setVisible(false);
  }

  setVisible(v) {
    this.visible = v;
    for (const d of this.dogs) d.group.visible = v;
  }

  reset(px, pz) {
    this.retrieveQueue = [];
    this.tracks = [];
    this.still = 0;
    this.lineYaw = null;
    this.dogs.forEach((d, i) => d.place(px - 2 - (i % 3) * 1.2, pz + 1.5 + Math.floor(i / 3) * 1.1));
    this.setVisible(true);
  }

  // Un ave abatida ha caído: el perro de cobro libre más cercano va a por ella.
  retrieve(bird) {
    this.retrieveQueue.push(bird);
  }

  // Pieza herida: los teckels siguen el rastro.
  track(animal) {
    if (!this.tracks.includes(animal)) this.tracks.push(animal);
  }

  flushers() {
    return this.dogs.filter((d) => d.cfg.role !== 'tracker' && d.speed > 1).map((d) => d.pos);
  }

  update(dt, player, yaw, shotgun) {
    if (!this.visible) return;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const pSpeed = Math.hypot(player.vel ? player.vel.x : 0, player.vel ? player.vel.z : 0);
    // Perros educados: si te quedas quieto, se sientan en fila delante de ti y esperan.
    const moving = player.moving ?? pSpeed > 0.3;
    this.still = moving ? 0 : this.still + dt;
    if (this.still < 1) this.lineYaw = null;
    else if (this.lineYaw === null || Math.abs(wrap(yaw - this.lineYaw)) > 1.1) this.lineYaw = yaw;
    const waiting = this.lineYaw !== null;
    const lfx = waiting ? -Math.sin(this.lineYaw) : 0, lfz = waiting ? -Math.cos(this.lineYaw) : 0;
    const lrx = waiting ? Math.cos(this.lineYaw) : 0, lrz = waiting ? -Math.sin(this.lineYaw) : 0;
    const n = this.dogs.length;
    // Asigna cobros pendientes.
    this.retrieveQueue = this.retrieveQueue.filter((b) => b.state === 'dead');
    for (const b of this.retrieveQueue) {
      if (this.dogs.some((d) => d.task && d.task.bird === b)) continue;
      const free = this.dogs.filter((d) => !d.task && d.cfg.role !== 'tracker')
        .sort((a, c) => (a.cfg.role === 'retriever' ? 0 : 1) - (c.cfg.role === 'retriever' ? 0 : 1) || a.pos.distanceTo(b.pos) - c.pos.distanceTo(b.pos))[0];
      if (free) free.task = { type: 'fetch', bird: b, phase: 'go' };
    }
    // Rastro de sangre con los teckels.
    this.tracks = this.tracks.filter((a) => !a.retrievedByDogs);
    for (const d of this.dogs) {
      if (d.cfg.role === 'tracker' && !d.task && this.tracks.length) d.task = { type: 'track', animal: this.tracks[0] };
    }

    const tmp = new THREE.Vector3();
    for (const d of this.dogs) {
      d.clock += dt;
      const t = d.task;
      if (t && t.type === 'fetch') {
        const b = t.bird;
        if (t.phase === 'go') {
          if (b.state !== 'dead') {
            d.task = null;
          } else {
            const dist = d.steer(dt, b.pos.x, b.pos.z, d.cfg.run);
            if (dist < 0.8) {
              t.phase = 'back';
              b.state = 'carried';
              if (this.hooks.onPickup) this.hooks.onPickup(d, b);
            }
          }
        } else {
          const dist = d.steer(dt, player.pos.x + fx * 1.2, player.pos.z + fz * 1.2, d.cfg.run * 0.8);
          d.mouthPos(tmp);
          b.pos.copy(tmp);
          b.yaw = d.heading + Math.PI / 2;
          b.pitch = 0;
          b.roll = 1.4;
          if (dist < 1.7) {
            b.state = 'gone';
            d.task = null;
            if (this.hooks.onRetrieved) this.hooks.onRetrieved(d, b);
          }
        }
        d.neckPitch += (d.b.rest - 0.25 - d.neckPitch) * Math.min(1, dt * 4);
      } else if (t && t.type === 'track') {
        const a = t.animal;
        const dist = d.steer(dt, a.pos.x + Math.sin(d.index) * 1.5, a.pos.z + Math.cos(d.index) * 1.5, a.alive ? d.cfg.run : d.cfg.run * 0.8);
        // Nariz al suelo mientras rastrea.
        d.neckPitch += ((dist > 3 ? d.b.graze - 0.3 : d.b.rest - 0.2) - d.neckPitch) * Math.min(1, dt * 3);
        d.barkT -= dt;
        if (d.barkT <= 0) {
          d.barkT = !a.alive && dist < 4 ? 1.1 + Math.random() * 0.6 : 5 + Math.random() * 4;
          if (this.hooks.onBark) this.hooks.onBark(d, !a.alive && dist < 4);
        }
        // Cuando llegas a la pieza, el trabajo está hecho.
        if (!a.alive && Math.hypot(player.pos.x - a.pos.x, player.pos.z - a.pos.z) < 8) {
          if (!a.retrievedByDogs) {
            a.retrievedByDogs = true;
            if (this.hooks.onTracked) this.hooks.onTracked(a);
          }
          d.task = null;
        }
      } else if (waiting) {
        // En fila, mirando al cazador, a unos pasos por delante.
        const side = (d.index - (n - 1) / 2) * 0.95;
        let ahead = 3.6;
        let tx = player.pos.x + lfx * ahead + lrx * side, tz = player.pos.z + lfz * ahead + lrz * side;
        while (ahead > 1.4 && waterDepth(tx, tz) > 0.2) {
          ahead -= 0.5;
          tx = player.pos.x + lfx * ahead + lrx * side;
          tz = player.pos.z + lfz * ahead + lrz * side;
        }
        const dist = Math.hypot(tx - d.pos.x, tz - d.pos.z);
        if (dist > 1.2) d.seated = false;
        if (dist > 0.75 && d.sit < 0.5) {
          d.steer(dt, tx, tz, dist > 4 ? d.cfg.run * 0.7 : 3);
        } else {
          d.speed = Math.max(0, d.speed - 12 * dt);
          d.vel.set(0, 0, 0);
          const face = Math.atan2(player.pos.x - d.pos.x, player.pos.z - d.pos.z);
          d.heading += clamp(wrap(face - d.heading), -4 * dt, 4 * dt);
          if (Math.abs(wrap(face - d.heading)) < 0.35) d.seated = true;
        }
        d.neckPitch += (d.b.rest - 0.1 - d.neckPitch) * Math.min(1, dt * 3);
      } else {
        // Sin tarea: con escopeta, buscan por delante; con rifle, van a tu lado.
        let tx, tz, sp;
        if (shotgun && d.cfg.range > 0) {
          const zig = Math.sin(d.clock * (0.35 + d.index * 0.03) + d.seed) * d.cfg.range;
          const ahead = d.cfg.range * 0.8 + Math.sin(d.clock * 0.2 + d.seed) * d.cfg.range * 0.3;
          tx = player.pos.x + fx * ahead + rx * zig;
          tz = player.pos.z + fz * ahead + rz * zig;
          sp = d.cfg.quest;
        } else {
          const back = 1.6 + (d.index % 3) * 1.1, side = (Math.floor(d.index / 3) - 1) * 1.1 + ((d.index % 2) ? 0.5 : -0.5);
          tx = player.pos.x - fx * back + rx * side;
          tz = player.pos.z - fz * back + rz * side;
          sp = Math.max(1.5, pSpeed * 1.3 + 1);
        }
        if (waterDepth(tx, tz) > 0.2) {
          tx = player.pos.x - fx * 2;
          tz = player.pos.z - fz * 2;
        }
        d.steer(dt, tx, tz, sp);
        d.neckPitch += ((d.speed > 3 ? d.b.rest + 0.15 : d.b.rest) - d.neckPitch) * Math.min(1, dt * 3);
      }
      if (!waiting || d.task) d.seated = false;
      d.sit = clamp(d.sit + (d.seated ? dt * 2.2 : -dt * 5), 0, 1);
      d.state = d.speed > 0.2 ? 'walk' : 'idle';
      d.animate(dt);
      d.applySit();
      d.syncDog();
    }
  }
}
