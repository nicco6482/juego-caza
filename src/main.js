import * as THREE from 'three';
import { World, groundAt, forestAt, waterDepth, LAKE, PLAY_HALF, clamp } from './world.js';
import { Water } from './water.js';
import { Fauna, ZONES } from './animals.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { MUZZLE, stepBullet, zeroAngle } from './ballistics.js';
import { buildRifle } from './rifle.js';
import { Hud } from './hud.js';
import { createPost } from './post.js';

// ---------- Ajustes ----------
const HUNT_TIME = 600;
const MAG_SIZE = 5;
const RESERVE = 20;
const ZEROS = [100, 150, 200, 250, 300, 400];
const ZOOMS = [3, 6, 10, 16, 24];
const BINOC_ZOOMS = [4, 8, 12];
const BASE_FOV = 70;

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  },
};

const settings = {
  sens: store.get('sierra.sens', 1),
  quality: store.get('sierra.quality', 'alta'),
  bulletCam: store.get('sierra.bulletcam', true),
};
const QUALITY = {
  alta: {
    shadows: true, shadowSize: 4096, grass: 30000, grassRadius: 68, grassCell: 0.95, trees: 1, texSize: 512, foliageSize: 1024, waterReflect: 0.6, waterSeg: 220,
    bloom: true, msaa: 4, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  },
  media: {
    shadows: true, shadowSize: 2048, grass: 14000, grassRadius: 55, grassCell: 1.15, trees: 0.8, texSize: 512, foliageSize: 512, waterReflect: 0.4, waterSeg: 160,
    bloom: true, msaa: 2, pixelRatio: 1,
  },
  baja: {
    shadows: false, shadowSize: 512, grass: 3500, grassRadius: 38, grassCell: 1.5, trees: 0.55, texSize: 256, foliageSize: 256, waterReflect: 0, waterSeg: 100,
    bloom: false, msaa: 0, pixelRatio: 0.8,
  },
};
const quality = QUALITY[settings.quality] || QUALITY.alta;

// ---------- Motor ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.05, 2600);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hud = new Hud();
const sfx = new Sfx();
let world, fauna, effects, rifle, post, water;

const zeroAngles = ZEROS.map(zeroAngle);

// ---------- Estado ----------
const game = {
  state: 'loading', // loading | menu | playing | paused | results
  time: HUNT_TIME,
  score: 0,
  mag: MAG_SIZE,
  reserve: RESERVE,
  shots: 0,
  hits: 0,
  log: [],
  longest: 0,
  boltT: 0,
  reloadT: 0,
  zeroIdx: 0,
  zoomIdx: 1,
  binocIdx: 1,
  timeScale: 1,
  clock: 0,
  ended: false,
  hadLock: false,
};

const player = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  stance: 'stand',
  eye: 1.68,
  breath: 1,
  gasp: 0,
  holding: false,
  fatigue: 0,
  moving: false,
  sprinting: false,
  stepAcc: 0,
  bob: 0,
  aim: 0,
  aiming: false,
  aimToggle: false,
  binoc: false,
  swayX: 0,
  swayY: 0,
  swayAmp: 0.004,
  recoil: 0,
  heartT: 0,
};

const wind = { x: 1, z: 0, speed: 3, baseAngle: 0, baseSpeed: 3 };
const keys = Object.create(null);
const bullets = [];

// ---------- Cámara de bala ----------
const bulletCam = {
  active: false,
  phase: '',
  bullet: null,
  t: 0,
  base: 0.15,
  target: new THREE.Vector3(),
  center: new THREE.Vector3(),
  angle: 0,
  radius: 4,
  mesh: null,
  trail: null,
  trailPts: [],
};

function makeBulletMesh() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#c8a15a', metalness: 0.9, roughness: 0.25 });
  const copper = new THREE.MeshStandardMaterial({ color: '#b86b3d', metalness: 0.9, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.02, 14), brass);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0078, 0.02, 14), copper);
  tip.position.y = 0.02;
  body.position.y = 0;
  g.add(body, tip);
  const holder = new THREE.Group();
  g.rotation.x = -Math.PI / 2; // la punta mira hacia -z del contenedor
  holder.add(g);
  holder.scale.setScalar(2.2);
  holder.visible = false;
  scene.add(holder);
  bulletCam.mesh = holder;

  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: '#dfe6ee', transparent: true, opacity: 0.45 }));
  trail.frustumCulled = false;
  trail.visible = false;
  scene.add(trail);
  bulletCam.trail = trail;
}

// ---------- Arranque ----------
function boot() {
  world = new World(scene, quality, renderer);
  water = new Water(scene, quality, renderer, world);
  post = createPost(renderer, scene, camera, quality);
  effects = new Effects(scene);
  fauna = new Fauna(scene, {
    onBleed: (a) => effects.bloodDrop(a.pos.x, a.pos.z, a.speed > 3 ? 1 : 1.6),
    onBledOut: onBledOut,
    onRoar: (a) => {
      if (game.state !== 'playing') return;
      sfx.roar(a.distToPlayer, Math.sin(relativeBearing(a.pos)));
    },
    onAlarm: (a) => {
      if (game.state !== 'playing') return;
      const rel = relativeBearing(a.pos);
      sfx.alarmCall(a.key, a.distToPlayer, Math.sin(rel));
    },
  });
  rifle = buildRifle();
  camera.add(rifle.group);
  rifle.group.position.set(0.19, -0.2, -0.42);
  makeBulletMesh();

  // Mundo de fondo para el menú.
  fauna.spawnInitial(0, 0, LAKE);
  game.state = 'menu';
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  showBest();
}

function showBest() {
  const best = store.get('sierra.best', 0);
  document.getElementById('menu-best').textContent = best > 0 ? `Mejor cacería: ${best} puntos` : '';
}

function newHunt() {
  fauna.clear();
  bullets.length = 0;
  const a = Math.random() * Math.PI * 2;
  player.pos.set(0, groundAt(0, 0), 0);
  player.yaw = a;
  player.pitch = -0.04;
  player.stance = 'stand';
  player.eye = 1.68;
  player.breath = 1;
  player.fatigue = 0;
  player.aim = 0;
  player.aiming = false;
  player.aimToggle = false;
  player.binoc = false;
  player.vel.set(0, 0, 0);
  fauna.spawnInitial(0, 0, LAKE);
  Object.assign(game, {
    time: HUNT_TIME, score: 0, mag: MAG_SIZE, reserve: RESERVE, shots: 0, hits: 0, log: [], longest: 0,
    boltT: 0, reloadT: 0, timeScale: 1, ended: false,
  });
  wind.baseAngle = Math.random() * Math.PI * 2;
  wind.baseSpeed = 1.5 + Math.random() * 4.5;
  updateWind(0);
  world.setTimeOfDay(0);
  hud.setScore(0);
  hud.setStance('stand');
  refreshAmmo();
  hud.feed('Temporada abierta: ciervo, corzo, jabalí y zorro. La cierva está protegida.');
  hud.feed('Es época de berrea: escucha a los ciervos para saber dónde están.');
  hud.tip('Clic derecho o F: visor · B: prismáticos · Mira el viento antes de acercarte', 6);
}

function startHunt() {
  sfx.init();
  newHunt();
  game.state = 'playing';
  showScreen(null);
  hud.show(true);
  lockPointer();
}

function lockPointer() {
  try {
    if (!canvas.requestPointerLock) {
      game.lockFailed = true;
      return;
    }
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => (game.lockFailed = true));
  } catch {
    game.lockFailed = true;
  }
}

function showScreen(id) {
  for (const s of ['menu', 'pause', 'results', 'help']) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  }
}

function pause() {
  if (game.state !== 'playing') return;
  if (bulletCam.active) endBulletCam();
  game.state = 'paused';
  player.aiming = false;
  showScreen('pause');
}

function resume() {
  sfx.init();
  game.state = 'playing';
  showScreen(null);
  lockPointer();
}

function endHunt(reason) {
  if (game.ended) return;
  game.ended = true;
  if (bulletCam.active) endBulletCam();
  game.state = 'results';
  hud.show(false);
  hud.optic('');
  if (document.pointerLockElement) document.exitPointerLock();
  const best = store.get('sierra.best', 0);
  const isBest = game.score > best;
  if (isBest) store.set('sierra.best', game.score);
  const kills = game.log.filter((l) => l.pts !== undefined);
  const acc = game.shots ? Math.round((game.hits / game.shots) * 100) : 0;
  document.getElementById('res-reason').textContent = reason;
  document.getElementById('res-score').textContent = game.score;
  document.getElementById('res-best').textContent = isBest ? '¡Nuevo récord!' : `Récord: ${Math.max(best, game.score)}`;
  document.getElementById('res-stats').innerHTML = `
    <div><b>${kills.filter((k) => k.pts > 0).length}</b><span>Piezas</span></div>
    <div><b>${game.shots}</b><span>Disparos</span></div>
    <div><b>${acc}%</b><span>Precisión</span></div>
    <div><b>${Math.round(game.longest)} m</b><span>Tiro más largo</span></div>`;
  document.getElementById('res-log').innerHTML = kills.length
    ? kills.map((k) => `<li class="${k.pts < 0 ? 'bad' : ''}"><span>${k.name}</span><span>${k.note}</span><span>${Math.round(k.dist)} m</span><b>${k.pts > 0 ? '+' : ''}${k.pts}</b></li>`).join('')
    : '<li class="empty">Sin piezas esta vez. El monte manda.</li>';
  showScreen('results');
}

// ---------- Viento ----------
function updateWind(t) {
  const ang = wind.baseAngle + Math.sin(t * 0.05) * 0.25 + Math.sin(t * 0.13) * 0.1;
  wind.x = Math.sin(ang);
  wind.z = -Math.cos(ang);
  wind.speed = Math.max(0.3, wind.baseSpeed * (1 + Math.sin(t * 0.3) * 0.2 + Math.sin(t * 1.1) * 0.08));
}

// Rumbo en grados: 0 = norte (-z), 90 = este (+x).
function bearingOf(x, z) {
  return (THREE.MathUtils.radToDeg(Math.atan2(x, -z)) + 360) % 360;
}
function playerBearing() {
  return (THREE.MathUtils.radToDeg(-player.yaw) % 360 + 360) % 360;
}
function relativeBearing(p) {
  const b = bearingOf(p.x - player.pos.x, p.z - player.pos.z);
  return THREE.MathUtils.degToRad(((b - playerBearing() + 540) % 360) - 180);
}

// ---------- Entrada ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (game.state !== 'playing') return;
  if (bulletCam.active && (e.code === 'Space' || e.code === 'Enter')) {
    endBulletCam();
    return;
  }
  switch (e.code) {
    case 'KeyC':
      setStance(player.stance === 'crouch' ? 'stand' : 'crouch');
      break;
    case 'KeyZ':
      setStance(player.stance === 'prone' ? 'crouch' : 'prone');
      break;
    case 'Space':
      setStance('stand');
      e.preventDefault();
      break;
    case 'KeyR':
      reload();
      break;
    case 'Enter':
    case 'NumpadEnter':
      fire();
      break;
    case 'KeyB':
      player.binoc = !player.binoc;
      if (player.binoc) {
        player.aiming = false;
        player.aimToggle = false;
      }
      break;
    case 'KeyF':
      player.aimToggle = !player.aimToggle;
      if (player.aimToggle) player.binoc = false;
      break;
    case 'ArrowUp':
    case 'PageUp':
      changeZero(1);
      e.preventDefault();
      break;
    case 'ArrowDown':
    case 'PageDown':
      changeZero(-1);
      e.preventDefault();
      break;
  }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  player.aiming = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousedown', (e) => {
  if (game.state !== 'playing') return;
  if (!document.pointerLockElement && game.hadLock) {
    lockPointer();
    return;
  }
  if (bulletCam.active) {
    if (e.button === 0) endBulletCam();
    return;
  }
  if (e.button === 0) fire();
  if (e.button === 2) {
    // Clic corto (p. ej. dos dedos en el trackpad) deja el visor fijo; mantenido, se quita al soltar.
    if (player.aimToggle) {
      player.aimToggle = false;
      player.aiming = false;
      aimPressAt = -1;
    } else {
      player.aiming = true;
      aimPressAt = performance.now();
    }
    player.binoc = false;
  }
});
let aimPressAt = -1;
addEventListener('mouseup', (e) => {
  if (e.button !== 2) return;
  if (aimPressAt >= 0 && performance.now() - aimPressAt < 280) player.aimToggle = true;
  player.aiming = false;
  aimPressAt = -1;
});
addEventListener('mousemove', (e) => {
  if (game.state !== 'playing' || bulletCam.active) return;
  if (!document.pointerLockElement && !game.lockFailed) return;
  const k = 0.0022 * settings.sens * (camera.fov / BASE_FOV);
  player.yaw -= e.movementX * k;
  player.pitch = clamp(player.pitch - e.movementY * k, -1.45, 1.45);
});
addEventListener('wheel', (e) => {
  if (game.state !== 'playing') return;
  const step = e.deltaY < 0 ? 1 : -1;
  if (player.binoc) {
    const n = clamp(game.binocIdx + step, 0, BINOC_ZOOMS.length - 1);
    if (n !== game.binocIdx) {
      game.binocIdx = n;
      sfx.zoomTick();
    }
    return;
  }
  if (!isScoped()) return;
  const n = clamp(game.zoomIdx + step, 0, ZOOMS.length - 1);
  if (n !== game.zoomIdx) {
    game.zoomIdx = n;
    sfx.zoomTick();
  }
}, { passive: true });

document.addEventListener('pointerlockerror', () => {
  // Sin captura del ratón (p. ej. dentro de un iframe): se mira moviendo el ratón sin más.
  game.lockFailed = true;
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    game.hadLock = true;
  } else if (game.state === 'playing') {
    pause();
  }
});

function setStance(s) {
  if (player.stance === s) return;
  player.stance = s;
  hud.setStance(s);
  sfx.step(0.15);
}

function changeZero(d) {
  const n = clamp(game.zeroIdx + d, 0, ZEROS.length - 1);
  if (n !== game.zeroIdx) {
    game.zeroIdx = n;
    sfx.zoomTick();
    hud.tip(`Alza a ${ZEROS[n]} m`, 1.5);
  }
}

function reload() {
  if (game.reloadT > 0 || game.mag >= MAG_SIZE || game.reserve <= 0) return;
  game.reloadT = 2.6;
  player.aimToggle = false;
  sfx.reload();
  refreshAmmo();
}

function refreshAmmo() {
  let state = '';
  if (game.reloadT > 0) state = 'Recargando…';
  else if (game.boltT > 0) state = 'Cerrojo';
  else if (game.mag === 0) state = game.reserve > 0 ? 'R · Recargar' : 'Sin munición';
  hud.setAmmo(game.mag, game.reserve, state);
}

function isScoped() {
  return player.aim > 0.92 && !player.binoc;
}

// ---------- Disparo ----------
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function fire() {
  if (player.binoc) return;
  if (game.reloadT > 0 || game.boltT > 0) return;
  if (game.mag <= 0) {
    sfx.dry();
    hud.tip(game.reserve > 0 ? 'Cargador vacío · pulsa R' : 'Sin munición', 2);
    return;
  }
  game.mag--;
  game.shots++;
  game.boltT = 1.15;
  refreshAmmo();

  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  _right.crossVectors(_dir, _up).normalize();
  _dir.applyAxisAngle(_right, zeroAngles[game.zeroIdx]);
  if (!isScoped()) {
    // Sin apuntar se dispara "a la cadera": nada preciso.
    const spread = 0.035 * (1 - player.aim * 0.7);
    _dir.x += (Math.random() - 0.5) * spread;
    _dir.y += (Math.random() - 0.5) * spread;
    _dir.z += (Math.random() - 0.5) * spread;
    _dir.normalize();
  }
  const start = camera.position.clone().addScaledVector(_dir, 0.3);
  const b = { pos: start.clone(), prev: start.clone(), vel: _dir.clone().multiplyScalar(MUZZLE), t: 0, origin: start.clone(), alive: true };
  bullets.push(b);

  sfx.shot();
  sfx.bolt();
  fauna.onGunshot(player.pos.x, player.pos.z);
  player.recoil += isScoped() ? 0.055 : 0.04;
  hud.muzzleFlash();
  rifle.flash.intensity = 40;
  const mz = rifle.muzzle.getWorldPosition(new THREE.Vector3());
  effects.smoke(mz, _dir);

  if (settings.bulletCam && isScoped()) {
    const pred = predict(b);
    if (pred && pred.kind === 'animal' && pred.animal.alive && pred.animal.sp.legal && ZONES[pred.zone].kill && pred.dist > 90) {
      startBulletCam(b, pred);
    }
  }
}

function traceSegment(a, c, ahead) {
  let best = null;
  const ah = fauna.segmentHit(a, c, ahead);
  if (ah) best = { kind: 'animal', t: ah.t, animal: ah.animal, zone: ah.zone };
  const oh = world.segmentObstacle(a, c);
  if (oh && (!best || oh.t < best.t)) best = { kind: oh.type, t: oh.t };
  const gc = c.y - groundAt(c.x, c.z);
  if (gc < 0) {
    let lo = 0, hi = 1;
    const p = new THREE.Vector3();
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      p.lerpVectors(a, c, mid);
      if (p.y - groundAt(p.x, p.z) < 0) hi = mid;
      else lo = mid;
    }
    if (!best || hi < best.t) best = { kind: 'ground', t: hi };
  }
  if (a.y >= LAKE.level && c.y < LAKE.level) {
    const tw = (a.y - LAKE.level) / (a.y - c.y);
    const wx = a.x + (c.x - a.x) * tw, wz = a.z + (c.z - a.z) * tw;
    if (waterDepth(wx, wz) > 0 && (!best || tw < best.t)) best = { kind: 'water', t: tw };
  }
  if (best) best.point = a.clone().lerp(c, best.t);
  return best;
}

function predict(b) {
  const pos = b.pos.clone(), vel = b.vel.clone(), prev = new THREE.Vector3();
  const h = 1 / 300;
  for (let t = 0; t < 3; t += h) {
    prev.copy(pos);
    stepBullet(pos, vel, h, wind);
    const hit = traceSegment(prev, pos, t + h);
    if (hit) {
      hit.time = t + h;
      hit.dist = hit.point.distanceTo(b.origin);
      return hit;
    }
  }
  return null;
}

function updateBullets(dt) {
  for (const b of bullets) {
    let remaining = dt;
    while (remaining > 1e-6 && b.alive) {
      const h = Math.min(remaining, 1 / 300);
      remaining -= h;
      b.prev.copy(b.pos);
      stepBullet(b.pos, b.vel, h, wind);
      b.t += h;
      const hit = traceSegment(b.prev, b.pos, 0);
      if (hit) {
        b.alive = false;
        b.pos.copy(hit.point);
        resolveImpact(b, hit);
      } else if (b.t > 3.5) {
        b.alive = false;
      }
    }
  }
  for (let i = bullets.length - 1; i >= 0; i--) if (!bullets[i].alive) bullets.splice(i, 1);
}

function resolveImpact(b, hit) {
  const dist = hit.point.distanceTo(b.origin);
  const delay = dist / 343;
  const dirN = b.vel.clone().normalize();
  const pan = Math.sin(relativeBearing(hit.point));
  if (hit.kind === 'animal') {
    const res = hit.animal.hit(hit.zone);
    effects.blood(hit.point, dirN.clone().multiplyScalar(0.6));
    for (let i = 0; i < 4; i++) effects.bloodDrop(hit.point.x + dirN.x * i * 0.4, hit.point.z + dirN.z * i * 0.4, 1.4);
    sfx.thud(delay, dist);
    onAnimalHit(hit.animal, hit.zone, dist, res);
  } else {
    if (hit.kind === 'water') effects.splash(hit.point);
    else if (hit.kind === 'tree') effects.bark(hit.point);
    else if (hit.kind === 'rock') {
      effects.dust(hit.point, '#a29d92');
      sfx.ricochet(delay, dist, pan);
    } else {
      effects.dust(hit.point, forestAt(hit.point.x, hit.point.z) > 0.06 ? '#7a6a4f' : '#b8a27a');
    }
    fauna.onImpact(hit.point);
  }
  if (bulletCam.active && bulletCam.bullet === b) bulletCamImpact(hit);
}

function onAnimalHit(animal, zone, dist, res) {
  const sp = animal.sp;
  if (res === 'dead') {
    hud.feed(`Impacto en un ${sp.name.toLowerCase()} ya abatido`);
    return;
  }
  game.hits++;
  hud.hitmark(res === 'kill');
  if (res === 'wound') {
    animal.woundDist = dist;
    hud.banner('HERIDO', 'Sigue el rastro de sangre antes de que se pierda', 'warn');
    hud.feed(`${sp.name} herido a ${Math.round(dist)} m`, 'warn');
    return;
  }
  animal.killedByPlayer = true;
  if (!sp.legal) {
    game.score -= sp.penalty;
    game.log.push({ name: sp.name, note: 'Protegida', dist, pts: -sp.penalty });
    hud.banner(`¡${sp.name.toUpperCase()} PROTEGIDA!`, `Sanción de la guardería · −${sp.penalty}`, 'bad');
    hud.feed(`Has abatido una ${sp.name.toLowerCase()}: −${sp.penalty}`, 'bad');
  } else {
    const z = ZONES[zone];
    let pts = Math.round(sp.points * z.mult + dist * 0.8);
    let note = z.label;
    if (animal.wounded) {
      pts = Math.round(pts * 0.6);
      note = 'Remate';
    }
    game.score += pts;
    game.longest = Math.max(game.longest, dist);
    game.log.push({ name: sp.name, note, dist, pts });
    hud.banner(`${sp.name.toUpperCase()} ABATIDO`, `${note} · ${Math.round(dist)} m · +${pts}`, 'good');
    hud.feed(`${sp.name} · ${note} · ${Math.round(dist)} m · +${pts}`, 'good');
  }
  hud.setScore(game.score);
}

function onBledOut(animal) {
  if (game.state !== 'playing' && game.state !== 'paused') return;
  const sp = animal.sp;
  animal.killedByPlayer = true;
  if (!sp.legal) {
    game.score -= sp.penalty;
    game.log.push({ name: sp.name, note: 'Protegida', dist: animal.woundDist || 0, pts: -sp.penalty });
    hud.feed(`La ${sp.name.toLowerCase()} herida ha muerto: −${sp.penalty}`, 'bad');
  } else {
    const pts = Math.round(sp.points * 0.4 + (animal.woundDist || 0) * 0.3);
    game.score += pts;
    game.log.push({ name: sp.name, note: 'Rastreo', dist: animal.woundDist || 0, pts });
    hud.feed(`El ${sp.name.toLowerCase()} herido ha caído · rastreo · +${pts}`, 'warn');
  }
  hud.setScore(game.score);
}

// ---------- Cámara de bala ----------
function startBulletCam(b, pred) {
  bulletCam.active = true;
  bulletCam.phase = 'flight';
  bulletCam.bullet = b;
  bulletCam.t = 0;
  bulletCam.target.copy(pred.point);
  bulletCam.base = clamp(pred.time / 2.2, 0.03, 0.35);
  bulletCam.trailPts.length = 0;
  game.timeScale = bulletCam.base;
  bulletCam.mesh.visible = true;
  bulletCam.trail.visible = true;
  rifle.group.visible = false;
  hud.letterbox(true);
  hud.optic('');
  hud.crosshair(false);
}

function bulletCamImpact(hit) {
  bulletCam.phase = 'orbit';
  bulletCam.t = 0;
  bulletCam.mesh.visible = false;
  const center = hit.animal ? hit.animal.pos.clone().setY(hit.animal.pos.y + 0.8 * hit.animal.scale) : hit.point.clone();
  bulletCam.center.copy(center);
  const back = bulletCam.bullet.vel.clone().setY(0).normalize();
  bulletCam.angle = Math.atan2(-back.x, -back.z) + 0.9;
  bulletCam.radius = hit.animal ? 3.2 * hit.animal.scale + 1.6 : 3;
  game.timeScale = 0.22;
}

function endBulletCam() {
  bulletCam.active = false;
  bulletCam.phase = '';
  bulletCam.mesh.visible = false;
  bulletCam.trail.visible = false;
  game.timeScale = 1;
  rifle.group.visible = true;
  hud.letterbox(false);
}

function updateBulletCam(realDt) {
  bulletCam.t += realDt;
  if (bulletCam.phase === 'flight') {
    const b = bulletCam.bullet;
    const dirN = b.vel.clone().normalize();
    const side = new THREE.Vector3().crossVectors(dirN, _up).normalize();
    const remaining = b.pos.distanceTo(bulletCam.target);
    game.timeScale = bulletCam.base * (remaining < 12 ? 0.3 : 1);
    camera.position.copy(b.pos).addScaledVector(dirN, -0.9).addScaledVector(side, 0.22).addScaledVector(_up, 0.1);
    camera.lookAt(b.pos.clone().addScaledVector(dirN, 4));
    camera.fov = 50;
    camera.updateProjectionMatrix();
    bulletCam.mesh.position.copy(b.pos);
    bulletCam.mesh.lookAt(b.pos.clone().sub(dirN));
    const pts = bulletCam.trailPts;
    pts.unshift(b.pos.clone());
    if (pts.length > 60) pts.pop();
    const arr = bulletCam.trail.geometry.attributes.position.array;
    for (let i = 0; i < 60; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    bulletCam.trail.geometry.attributes.position.needsUpdate = true;
    if (!b.alive && bulletCam.phase === 'flight') endBulletCam();
    if (bulletCam.t > 6) endBulletCam();
  } else if (bulletCam.phase === 'orbit') {
    bulletCam.angle += realDt * 0.45;
    const c = bulletCam.center;
    const r = bulletCam.radius;
    const x = c.x + Math.sin(bulletCam.angle) * r, z = c.z + Math.cos(bulletCam.angle) * r;
    camera.position.set(x, Math.max(groundAt(x, z) + 0.6, c.y + 0.5), z);
    camera.lookAt(c);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    if (bulletCam.t > 0.9) bulletCam.trail.visible = false;
    if (bulletCam.t > 2.6) endBulletCam();
  }
}

// ---------- Jugador ----------
const STANCE = {
  stand: { eye: 1.68, speed: 3.0, noise: 0.7, vis: 1, sway: 0.0042 },
  crouch: { eye: 1.05, speed: 1.5, noise: 0.25, vis: 0.45, sway: 0.0026 },
  prone: { eye: 0.38, speed: 0.6, noise: 0.1, vis: 0.2, sway: 0.0011 },
};

function updatePlayer(dt) {
  const st = STANCE[player.stance];
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const wantsAim = (player.aiming || player.aimToggle) && game.reloadT <= 0 && !player.binoc;
  const shift = keys.ShiftLeft || keys.ShiftRight;
  player.sprinting = shift && !wantsAim && !player.binoc && player.stance === 'stand' && fwd > 0 && player.fatigue < 0.95;

  let speed = st.speed;
  if (player.sprinting) speed = 6.2;
  if (wantsAim || player.binoc) speed *= 0.45;
  const len = Math.hypot(fwd, strafe);
  const tx = len ? ((-Math.sin(player.yaw) * fwd + Math.cos(player.yaw) * strafe) / len) * speed : 0;
  const tz = len ? ((-Math.cos(player.yaw) * fwd - Math.sin(player.yaw) * strafe) / len) * speed : 0;
  const k = Math.min(1, dt * 10);
  player.vel.x += (tx - player.vel.x) * k;
  player.vel.z += (tz - player.vel.z) * k;
  const prevX = player.pos.x, prevZ = player.pos.z;
  const wade = waterDepth(player.pos.x, player.pos.z) > 0.15 ? 0.5 : 1;
  player.pos.x += player.vel.x * dt * wade;
  player.pos.z += player.vel.z * dt * wade;
  // No se puede entrar donde cubre.
  if (waterDepth(player.pos.x, player.pos.z) > 1.0) {
    player.pos.x = prevX;
    player.pos.z = prevZ;
  }
  world.collidePlayer(player.pos, 0.4);
  player.pos.x = clamp(player.pos.x, -PLAY_HALF, PLAY_HALF);
  player.pos.z = clamp(player.pos.z, -PLAY_HALF, PLAY_HALF);
  player.pos.y = groundAt(player.pos.x, player.pos.z);
  const v = Math.hypot(player.vel.x, player.vel.z);
  player.moving = v > 0.3;

  player.eye += (st.eye - player.eye) * Math.min(1, dt * 6);

  // Cansancio y respiración.
  if (player.sprinting) player.fatigue = Math.min(1, player.fatigue + dt * 0.16);
  else player.fatigue = Math.max(0, player.fatigue - dt * 0.07);
  const wasHolding = player.holding;
  player.holding = shift && isScoped() && player.breath > 0 && player.gasp <= 0;
  if (player.holding) {
    player.breath -= dt / 6;
    if (player.breath <= 0) {
      player.breath = 0;
      player.gasp = 2.5;
      sfx.breath(false);
    }
  } else {
    player.breath = Math.min(1, player.breath + dt / 3.5);
    player.gasp = Math.max(0, player.gasp - dt);
  }
  if (player.holding && !wasHolding) sfx.breath(true);
  if (!player.holding && wasHolding && player.gasp <= 0) sfx.breath(false);

  // Pasos.
  if (player.moving) {
    player.stepAcc += v * dt;
    const stride = player.sprinting ? 1.5 : 0.8;
    if (player.stepAcc > stride) {
      player.stepAcc = 0;
      sfx.step({ stand: 0.12, crouch: 0.06, prone: 0.035 }[player.stance] * (player.sprinting ? 1.8 : 1));
    }
    player.bob += v * dt * (player.sprinting ? 1.5 : 2.2);
  }

  // Apuntar.
  const aimTarget = wantsAim ? 1 : 0;
  player.aim += clamp(aimTarget - player.aim, -dt * 6, dt * 5);

  // Balanceo del arma.
  let amp = st.sway * (1 + player.fatigue * 2.2) * (player.moving ? 2.8 : 1);
  if (player.holding) amp *= 0.14;
  if (player.gasp > 0) amp *= 1.9;
  player.swayAmp += (amp - player.swayAmp) * Math.min(1, dt * 3);
  const t = game.clock;
  const a2 = player.swayAmp;
  const breathing = player.holding ? 0.1 : 1;
  player.swayX = a2 * (Math.sin(t * 0.61) * 0.7 + Math.sin(t * 1.43 + 1.1) * 0.35 + Math.sin(t * 3.1 + 0.3) * 0.1);
  player.swayY = a2 * (Math.sin(t * 0.83 + 2) * 0.5 + Math.sin(t * 1.9) * 0.25) + a2 * breathing * Math.sin(t * 1.55) * 0.55;

  player.recoil *= Math.exp(-dt * 7);

  // Latido con el pulso acelerado.
  if (isScoped() && player.fatigue > 0.25) {
    player.heartT -= dt;
    if (player.heartT <= 0) {
      player.heartT = 60 / (70 + player.fatigue * 70);
      sfx.heartbeat(0.25 + player.fatigue * 0.35);
    }
  }
}

function updateCamera(dt) {
  const scoped = isScoped();
  const binoc = player.binoc;
  const opticOn = scoped || binoc;
  const swayK = opticOn ? 1 : 0.25;
  const bobY = player.moving && !opticOn ? Math.sin(player.bob * 2) * 0.035 : 0;
  camera.position.set(player.pos.x, player.pos.y + player.eye + bobY, player.pos.z);
  camera.rotation.set(
    player.pitch + player.swayY * swayK + player.recoil,
    player.yaw + player.swayX * swayK,
    player.moving && !opticOn ? Math.sin(player.bob) * 0.006 : 0
  );

  let fov;
  if (scoped) fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / ZOOMS[game.zoomIdx]));
  else if (binoc) fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / BINOC_ZOOMS[game.binocIdx]));
  else fov = BASE_FOV - player.aim * 18;
  if (Math.abs(camera.fov - fov) > 1e-3) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // Rifle en primera persona.
  const r = rifle.group;
  r.visible = !opticOn && !binoc;
  const a = player.aim;
  let rx = 0.19 * (1 - a), ry = -0.2 + a * 0.115, rz = -0.42 + a * 0.12;
  let rotZ = 0, rotX = 0;
  if (game.boltT > 0) {
    const p = 1 - game.boltT / 1.15;
    const k = Math.sin(clamp(p * 1.4, 0, 1) * Math.PI);
    rotZ = k * 0.35;
    ry -= k * 0.03;
    rifle.bolt.rotation.z = k * 1.2;
    rifle.bolt.position.z = 0.06 + Math.sin(clamp((p - 0.15) * 1.8, 0, 1) * Math.PI) * 0.08;
  } else {
    rifle.bolt.rotation.z = 0;
    rifle.bolt.position.z = 0.06;
  }
  if (game.reloadT > 0) {
    const k = Math.sin(clamp(1 - game.reloadT / 2.6, 0, 1) * Math.PI);
    ry -= k * 0.12;
    rotX = k * 0.5;
    rotZ = k * 0.4;
  }
  if (player.sprinting) {
    rotZ += 0.35;
    rx -= 0.05;
    rotX -= 0.25;
  }
  const bob = player.moving ? Math.sin(player.bob * 2) * 0.008 : 0;
  r.position.set(rx, ry + bob - player.recoil * 0.4, rz + player.recoil * 1.2);
  r.rotation.set(rotX + player.recoil * 2, 0, rotZ);
  rifle.flash.intensity *= Math.exp(-dt * 40);
}

// Telémetro: distancia a lo que hay en el centro de la mira.
function rangefind() {
  camera.getWorldDirection(_dir);
  const a = camera.position;
  const far = a.clone().addScaledVector(_dir, 900);
  let dist = Infinity;
  const ah = fauna.segmentHit(a, far, 0);
  if (ah) dist = ah.t * 900;
  const p = new THREE.Vector3();
  for (let d = 2; d < Math.min(dist, 900); d += 2) {
    p.copy(a).addScaledVector(_dir, d);
    if (p.y < groundAt(p.x, p.z)) {
      dist = d;
      break;
    }
  }
  return dist;
}

// ---------- Marcadores ----------
const _proj = new THREE.Vector3();
function updateMarkers() {
  const list = [];
  const now = game.clock;
  const lookDir = camera.getWorldDirection(new THREE.Vector3());
  for (const a of fauna.animals) {
    const d = a.pos.distanceTo(player.pos);
    // Avistar con los prismáticos: basta con mirar al animal un momento.
    if (player.binoc && a.alive && d < 800) {
      _proj.set(a.pos.x, a.pos.y + 0.9 * a.scale, a.pos.z).sub(camera.position).normalize();
      if (_proj.dot(lookDir) > Math.cos(THREE.MathUtils.degToRad(4.5))) {
        if (a.spottedUntil < now) hud.feed(`Avistado: ${a.sp.name.toLowerCase()} a ${Math.round(d)} m${a.sp.legal ? '' : ' (protegida)'}`, a.sp.legal ? '' : 'bad');
        a.spottedUntil = now + 45;
      }
    }
    const spotted = a.alive && a.spottedUntil > now;
    const trophy = !a.alive && a.killedByPlayer && d < 400;
    if (!spotted && !trophy) continue;
    _proj.set(a.pos.x, a.pos.y + (a.alive ? 1.9 : 0.9) * a.scale + 0.3, a.pos.z).project(camera);
    if (_proj.z > 1 || Math.abs(_proj.x) > 1.05 || Math.abs(_proj.y) > 1.05) continue;
    const x = (_proj.x * 0.5 + 0.5) * innerWidth, y = (-_proj.y * 0.5 + 0.5) * innerHeight;
    let kind = a.sp.legal ? 'legal' : 'protected';
    let sub = `${Math.round(d)} m`;
    if (!a.alive) kind = 'dead';
    else if (a.state === 'flee') sub += ' · huye';
    else if (a.state === 'alert') sub += ' · alerta';
    if (a.wounded && a.alive) sub += ' · herido';
    list.push({ x, y, title: a.sp.name + (a.sp.legal ? '' : ' · protegida'), sub, kind });
  }
  hud.setMarkers(list);
}

// ---------- Bucle principal ----------
let last = performance.now();
let todTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'loading') return;

  const playing = game.state === 'playing';
  const simDt = playing ? realDt * game.timeScale : game.state === 'menu' ? realDt : 0;
  game.clock += realDt;

  if (playing) {
    if (!bulletCam.active) {
      updatePlayer(realDt);
      updateCamera(realDt);
    } else {
      updateBulletCam(realDt);
    }
    updateWind(game.clock);
    game.time -= simDt;
    game.boltT = Math.max(0, game.boltT - simDt);
    if (game.reloadT > 0) {
      game.reloadT -= simDt;
      if (game.reloadT <= 0) {
        const n = Math.min(MAG_SIZE - game.mag, game.reserve);
        game.mag += n;
        game.reserve -= n;
      }
    }
    refreshAmmo();
    updateBullets(simDt);
    fauna.update(simDt, {
      player: player.pos,
      noise: player.moving ? (player.sprinting ? 1.8 : STANCE[player.stance].noise) : 0,
      visibility: STANCE[player.stance].vis * (player.moving ? 1 : 0.35) * (forestAt(player.pos.x, player.pos.z) > 0.06 ? 0.7 : 1),
      wind,
    }, camera.position);

    // HUD
    hud.setTime(game.time);
    hud.setCompass(playerBearing());
    hud.setWind(((bearingOf(wind.x, wind.z) - playerBearing()) + 360) % 360, wind.speed);
    hud.setBreath(player.breath, player.holding, player.gasp > 0);
    const scoped = isScoped() && !bulletCam.active;
    const binoc = player.binoc && !bulletCam.active;
    hud.crosshair(!scoped && !binoc && !bulletCam.active && player.aim < 0.3);
    if (scoped || binoc) {
      const range = rangefind();
      hud.optic(scoped ? 'scope' : 'binoc', THREE.MathUtils.degToRad(camera.fov), {
        zoom: scoped ? `${ZOOMS[game.zoomIdx]}×` : `${BINOC_ZOOMS[game.binocIdx]}×`,
        range: range === Infinity ? '— m' : `${Math.round(range)} m`,
        zero: scoped ? `Alza ${ZEROS[game.zeroIdx]} m` : '',
        hint: scoped ? 'Shift: aguantar respiración · Rueda: aumentos · ↑↓: alza' : 'Mira un animal para marcarlo · Rueda: aumentos · B: guardar',
      });
    } else if (!bulletCam.active) {
      hud.optic('');
    }
    updateMarkers();

    todTimer -= realDt;
    if (todTimer <= 0) {
      todTimer = 1;
      world.setTimeOfDay(clamp(1 - game.time / HUNT_TIME, 0, 1));
    }

    if (game.time <= 0) endHunt('Se ha hecho de noche. Fin de la cacería.');
    else if (game.mag === 0 && game.reserve === 0 && bullets.length === 0 && game.boltT <= 0 && !bulletCam.active) {
      game.outT = (game.outT || 0) + realDt;
      if (game.outT > 2.5) endHunt('Te has quedado sin munición.');
    } else game.outT = 0;
  } else if (game.state === 'menu' || game.state === 'results') {
    // Vuelo lento sobre el coto.
    const t = game.clock * 0.025;
    const x = Math.sin(t) * 150, z = Math.cos(t) * 150;
    camera.position.set(x, Math.max(groundAt(x, z), groundAt(0, 0)) + 22, z);
    camera.lookAt(Math.sin(t + 0.9) * 40, groundAt(0, 0) + 4, Math.cos(t + 0.9) * 40);
    if (camera.fov !== BASE_FOV) {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
    }
    rifle.group.visible = false;
    fauna.update(simDt, { player: new THREE.Vector3(9999, 0, 9999), noise: 0, visibility: 0, wind }, camera.position);
  }

  effects.update(simDt);
  world.update(realDt, camera, playing ? player.pos : camera.position, wind.speed);
  water.update(realDt, wind.speed);
  hud.update(realDt);
  sfx.update(wind.speed);
  post.render(realDt);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (post) post.setSize(innerWidth, innerHeight);
});

// ---------- Menús ----------
document.getElementById('btn-start').addEventListener('click', startHunt);
document.getElementById('btn-help').addEventListener('click', () => showScreen('help'));
document.getElementById('btn-help-back').addEventListener('click', () => showScreen(game.state === 'paused' ? 'pause' : 'menu'));
document.getElementById('btn-resume').addEventListener('click', resume);
document.getElementById('btn-pause-help').addEventListener('click', () => showScreen('help'));
document.getElementById('btn-quit').addEventListener('click', () => endHunt('Has dado por terminada la cacería.'));
document.getElementById('btn-again').addEventListener('click', startHunt);
document.getElementById('btn-menu').addEventListener('click', () => {
  game.state = 'menu';
  showScreen('menu');
  showBest();
});

const sens = document.getElementById('opt-sens');
sens.value = settings.sens;
sens.addEventListener('input', () => {
  settings.sens = +sens.value;
  store.set('sierra.sens', settings.sens);
});
const qual = document.getElementById('opt-quality');
qual.value = settings.quality;
qual.addEventListener('change', () => {
  store.set('sierra.quality', qual.value);
  location.reload();
});
const bc = document.getElementById('opt-bulletcam');
bc.checked = settings.bulletCam;
bc.addEventListener('change', () => {
  settings.bulletCam = bc.checked;
  store.set('sierra.bulletcam', bc.checked);
});

// Deja pintar la pantalla de carga antes de generar el mundo.
requestAnimationFrame(() => setTimeout(() => {
  boot();
  requestAnimationFrame(frame);
}, 30));

// Acceso para depuración desde la consola.
window.__sierra = { game, player, get fauna() { return fauna; }, camera, startHunt, endHunt, fire, predict, wind };
