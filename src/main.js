import * as THREE from 'three';
import { World, groundAt, forestAt, waterDepth, LAKE, PLAY_HALF, clamp } from './world.js';
import { Water } from './water.js';
import { Fauna, ZONES } from './animals.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { MUZZLE, stepBullet, zeroAngle } from './ballistics.js';
import { buildRifle, buildShotgun, buildOverUnder, buildSemiAuto, buildLever } from './rifle.js';
import { DogPack } from './dogs.js';
import { Birds } from './birds.js';
import * as Trophies from './trophies.js';
import { Nessie } from './nessie.js';
import { Hud } from './hud.js';
import { createPost } from './post.js';
import { loadModels } from './models.js';

// ---------- Ajustes ----------
const HUNT_TIME = 600;
// kind: 'rifle' (una bala) o 'shotgun' (perdigones). scope: con visor. spread: apertura del plomeo.
const WEAPONS = {
  rifle: { name: 'Rifle de cerrojo', short: 'Cerrojo .308', kind: 'rifle', scope: true, action: 'bolt', mag: 5, reserve: 20, cycle: 1.15, reload: 2.6, muzzle: 830 },
  palanca: { name: 'Rifle de palanca', short: 'Palanca .30-30', kind: 'rifle', scope: false, action: 'lever', mag: 6, reserve: 24, cycle: 0.55, reload: 3.2, muzzle: 720, aimFov: 38 },
  escopeta: { name: 'Escopeta paralela', short: 'Paralela', kind: 'shotgun', mag: 2, reserve: 40, cycle: 0.28, reload: 1.9, spread: 0.011, pellets: 28 },
  superpuesta: { name: 'Escopeta superpuesta', short: 'Superpuesta', kind: 'shotgun', mag: 2, reserve: 40, cycle: 0.3, reload: 1.9, spread: 0.0085, pellets: 30 },
  semiauto: { name: 'Escopeta semiautomática', short: 'Semiautomática', kind: 'shotgun', mag: 3, reserve: 45, cycle: 0.22, reload: 2.8, spread: 0.013, pellets: 26, action: 'semi' },
};
const WEAPON_ORDER = ['rifle', 'palanca', 'escopeta', 'superpuesta', 'semiauto'];
const isShotgun = () => WEAPONS[game.weapon].kind === 'shotgun';
const MAG_SIZE = 5;
const RESERVE = 20;
const magSize = () => WEAPONS[game.weapon].mag;
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
  quality: store.get('sierra.quality', 'media'),
  showFps: store.get('sierra.fps', false),
  bulletCam: store.get('sierra.bulletcam', true),
};
const QUALITY = {
  alta: {
    shadows: true, shadowSize: 2048, grass: 30000, grassRadius: 68, grassCell: 0.95, trees: 1, texSize: 512, foliageSize: 1024, waterReflect: 0.5, waterSeg: 220,
    bloom: true, msaa: 4, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  },
  media: {
    shadows: true, shadowSize: 2048, grass: 14000, grassRadius: 55, grassCell: 1.15, trees: 0.8, texSize: 512, foliageSize: 512, waterReflect: 0.33, waterSeg: 160,
    bloom: true, msaa: 2, pixelRatio: 1,
  },
  baja: {
    shadows: false, shadowSize: 512, grass: 3500, grassRadius: 38, grassCell: 1.5, trees: 0.55, texSize: 256, foliageSize: 256, waterReflect: 0, waterSeg: 100,
    bloom: false, msaa: 0, pixelRatio: 0.8,
  },
};
const quality = QUALITY[settings.quality] || QUALITY.media;

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
let world, fauna, effects, rifle, post, water, birds, dogs, nessie;
const views = {};

const zeroAngles = ZEROS.map((d) => zeroAngle(d));
const leverZero = zeroAngle(100, WEAPONS.palanca.muzzle);

// ---------- Estado ----------
const game = {
  state: 'loading', // loading | menu | playing | paused | results
  time: HUNT_TIME,
  score: 0,
  mag: MAG_SIZE,
  reserve: RESERVE,
  weapon: 'rifle',
  stash: {},
  switchT: 0,
  shotId: 0,
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
  // La hierba no se dibuja en el reflejo del agua (capa 1): ahorra mucho y ni se nota.
  world.grass.layers.set(1);
  camera.layers.enable(1);
  water = new Water(scene, quality, renderer, world);
  post = createPost(renderer, scene, camera, quality);
  effects = new Effects(scene);
  fauna = new Fauna(scene, {
    onBleed: (a) => effects.bloodDrop(a.pos.x, a.pos.z, a.speed > 3 ? 1 : 1.6),
    onBledOut: onBledOut,
    onCharge: (a) => {
      if (game.state !== 'playing') return;
      hud.banner('¡TE HA EMBESTIDO!', `${a.sp.name}: el animal más peligroso del monte`, 'bad');
      sfx.thud(0, 2);
      player.recoil += 0.3;
      setTimeout(() => endHunt(`Te ha embestido ${a.sp.fem ? 'una' : 'un'} ${a.sp.name.toLowerCase()}.`), 1500);
    },
    onRoar: (a) => {
      if (game.state !== 'playing') return;
      const pan = Math.sin(relativeBearing(a.pos));
      if (a.key === 'lobo') sfx.howl(a.distToPlayer, pan);
      else sfx.roar(a.distToPlayer, pan);
    },
    onAlarm: (a) => {
      if (game.state !== 'playing') return;
      const rel = relativeBearing(a.pos);
      sfx.alarmCall(a.key, a.distToPlayer, Math.sin(rel));
    },
  });
  views.rifle = buildRifle();
  views.palanca = buildLever();
  views.escopeta = buildShotgun();
  views.superpuesta = buildOverUnder();
  views.semiauto = buildSemiAuto();
  for (const v of Object.values(views)) {
    camera.add(v.group);
    v.group.position.set(0.19, -0.2, -0.42);
    v.group.visible = false;
  }
  rifle = views.rifle;
  birds = new Birds(scene, {
    onLand: (b) => {
      if (b.byPlayer && game.state === 'playing') dogs.retrieve(b);
    },
    onFlush: (b) => {
      if (game.state !== 'playing') return;
      const d = b.pos.distanceTo(player.pos), pan = Math.sin(relativeBearing(b.pos));
      sfx.flush(d, pan, !!b.sp.duck);
      if (['perdiz', 'pato', 'agachadiza', 'flamenco'].includes(b.key)) sfx.birdCall(b.key, d, pan);
    },
  });
  makeBulletMesh();

  dogs = window.__dogs = new DogPack(scene, {
    onPickup: (d, b) => hud.feed(`${d.sp.name} cobra ${b.sp.fem ? 'la' : 'el'} ${b.sp.name.toLowerCase()}`),
    onRetrieved: (d, b) => {
      game.score += 10;
      hud.setScore(game.score);
      hud.feed(`${d.sp.name}: ${b.sp.name.toLowerCase()} cobrad${b.sp.fem ? 'a' : 'o'} · +10`, 'good');
      sfx.bark(1, 0, false);
    },
    onBark: (d, found) => {
      if (game.state !== 'playing') return;
      sfx.bark(d.pos.distanceTo(player.pos), Math.sin(relativeBearing(d.pos)), true, found);
    },
    onTracked: (a) => {
      game.score += 25;
      hud.setScore(game.score);
      hud.feed(`Los teckels han encontrado ${a.sp.fem ? 'la' : 'el'} ${a.sp.name.toLowerCase()} · +25`, 'good');
    },
  });

  nessie = new Nessie(scene, {
    onSurface: (n, dist) => {
      if (game.state !== 'playing') return;
      for (let i = 0; i < 6; i++) effects.splash(n.pos.clone().setY(LAKE.level).add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)));
      sfx.moan(dist, Math.sin(relativeBearing(n.pos)));
      if (dist < 500) hud.feed('Algo enorme se mueve en el lago…', 'warn');
    },
  });

  // Modelos 3D opcionales (si no hay, se usan los generados por código).
  loadModels().finally(() => {
    // Mundo de fondo para el menú.
    fauna.spawnInitial(0, 0, LAKE);
    birds.populate(0, 0);
    game.state = 'menu';
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
    showBest();
  });
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
  birds.populate(0, 0);
  Object.assign(game, {
    time: HUNT_TIME, score: 0, mag: MAG_SIZE, reserve: RESERVE, shots: 0, hits: 0, log: [], longest: 0,
    boltT: 0, reloadT: 0, timeScale: 1, ended: false, weapon: 'rifle', switchT: 0,
    stash: {},
  });
  for (const v of Object.values(views)) v.group.visible = false;
  rifle = views.rifle;
  dogs.reset(player.pos.x, player.pos.z);
  nessie.reset();
  hud.weaponBar(WEAPON_ORDER.map((k) => WEAPONS[k].short), 0);
  wind.baseAngle = Math.random() * Math.PI * 2;
  wind.baseSpeed = 1.5 + Math.random() * 4.5;
  updateWind(0);
  world.setTimeOfDay(0);
  hud.setScore(0);
  hud.setStance('stand');
  refreshAmmo();
  hud.feed('Temporada abierta: ciervo, gamo, corzo, jabalí, muflón, cabra montés, búfalo, elefante, hipopótamo, cocodrilo, león, zorro y liebre.');
  hud.feed('¡Ojo! Búfalos, elefantes, hipopótamos y leones pueden embestir, y los cocodrilos del lago se lanzan si te acercas. Los leones beben en la orilla del lago.', 'warn');
  hud.feed('Protegidos: la cierva, el lobo ibérico y el gorila.', 'bad');
  hud.feed('Es época de berrea: escucha a los ciervos para saber dónde están.');
  hud.feed('Caza menor: perdiz, tórtola, zorzal, agachadiza y ánade. Con escopeta (3, 4 o 5) te entran al vuelo.');
  hud.feed('Te acompañan 2 bracos, 3 podencos y 2 teckels.');
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
  for (const s of ['menu', 'pause', 'results', 'help', 'trophies']) {
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
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
    case 'Digit4':
    case 'Digit5':
      switchWeapon(WEAPON_ORDER[+e.code.slice(5) - 1]);
      break;
    case 'KeyQ':
      switchWeapon(game.lastWeapon || 'escopeta');
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
  if (!isScoped()) {
    if (player.aim < 0.3) {
      const i = WEAPON_ORDER.indexOf(game.weapon);
      switchWeapon(WEAPON_ORDER[(i - step + WEAPON_ORDER.length) % WEAPON_ORDER.length]);
    }
    return;
  }
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

function totalAmmo() {
  return WEAPON_ORDER.reduce((sum, k) => {
    if (k === game.weapon) return sum + game.mag + game.reserve;
    const st = game.stash[k];
    return sum + (st ? st.mag + st.reserve : WEAPONS[k].mag + WEAPONS[k].reserve);
  }, 0);
}

function switchWeapon(w) {
  if (w === game.weapon || game.reloadT > 0 || bulletCam.active) return;
  game.stash[game.weapon] = { mag: game.mag, reserve: game.reserve };
  const st = game.stash[w] || { mag: WEAPONS[w].mag, reserve: WEAPONS[w].reserve };
  game.mag = st.mag;
  game.reserve = st.reserve;
  views[game.weapon].group.visible = false;
  game.lastWeapon = game.weapon;
  game.weapon = w;
  rifle = views[w];
  game.switchT = 0.6;
  game.boltT = 0;
  player.aiming = false;
  player.aimToggle = false;
  sfx.step(0.2);
  hud.weaponBar(WEAPON_ORDER.map((k) => WEAPONS[k].short), WEAPON_ORDER.indexOf(w));
  hud.tip(WEAPONS[w].kind === 'shotgun' ? `${WEAPONS[w].name}: aves a vuelo, hasta unos 40 m` : `${WEAPONS[w].name}: caza mayor`, 2);
  refreshAmmo();
}

function reload() {
  if (game.reloadT > 0 || game.mag >= magSize() || game.reserve <= 0) return;
  game.reloadT = WEAPONS[game.weapon].reload;
  player.aimToggle = false;
  sfx.reload();
  refreshAmmo();
}

function refreshAmmo() {
  let state = '';
  if (game.reloadT > 0) state = 'Recargando…';
  else if (game.boltT > 0 && WEAPONS[game.weapon].action === 'bolt') state = 'Cerrojo';
  else if (game.boltT > 0 && WEAPONS[game.weapon].action === 'lever') state = 'Palanca';
  else if (game.mag === 0) state = game.reserve > 0 ? 'R · Recargar' : 'Sin munición';
  hud.setAmmo(game.mag, game.reserve, state, magSize(), WEAPONS[game.weapon].name, isShotgun());
}

function isScoped() {
  return player.aim > 0.92 && !player.binoc && WEAPONS[game.weapon].scope === true;
}

// ---------- Disparo ----------
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function fire() {
  if (player.binoc) return;
  if (game.reloadT > 0 || game.boltT > 0 || game.switchT > 0) return;
  if (isShotgun()) {
    fireShotgun();
    return;
  }
  const W = WEAPONS[game.weapon];
  if (game.mag <= 0) {
    sfx.dry();
    hud.tip(game.reserve > 0 ? 'Cargador vacío · pulsa R' : 'Sin munición', 2);
    return;
  }
  game.mag--;
  game.shots++;
  game.boltT = W.cycle;
  game.shotId++;
  refreshAmmo();

  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  _right.crossVectors(_dir, _up).normalize();
  _dir.applyAxisAngle(_right, W.scope ? zeroAngles[game.zeroIdx] : leverZero);
  if (!isScoped() && !(W.aimFov && player.aim > 0.8)) {
    // Sin apuntar se dispara "a la cadera": nada preciso.
    const spread = 0.035 * (1 - player.aim * 0.7);
    _dir.x += (Math.random() - 0.5) * spread;
    _dir.y += (Math.random() - 0.5) * spread;
    _dir.z += (Math.random() - 0.5) * spread;
    _dir.normalize();
  }
  const start = camera.position.clone().addScaledVector(_dir, 0.3);
  const b = { pos: start.clone(), prev: start.clone(), vel: _dir.clone().multiplyScalar(W.muzzle || MUZZLE), t: 0, origin: start.clone(), alive: true, shot: game.shotId };
  bullets.push(b);
  birds.onGunshot(player.pos.x, player.pos.z);
  nessie.onGunshot();

  sfx.shot();
  if (W.action === 'bolt') sfx.bolt();
  else sfx.lever();
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

// Escopeta: una rociada de perdigones que se abre con la distancia.
const shotHits = new Map();
function fireShotgun() {
  if (game.mag <= 0) {
    sfx.dry();
    hud.tip(game.reserve > 0 ? 'Recámaras vacías · pulsa R' : 'Sin cartuchos', 2);
    return;
  }
  game.mag--;
  game.shots++;
  game.shotId++;
  const W = WEAPONS[game.weapon];
  game.boltT = W.cycle;
  refreshAmmo();
  camera.updateMatrixWorld();
  camera.getWorldDirection(_dir);
  const aimed = player.aim > 0.7;
  const base = _dir.clone();
  if (!aimed) {
    base.x += (Math.random() - 0.5) * 0.03;
    base.y += (Math.random() - 0.5) * 0.03;
    base.normalize();
  }
  const right = new THREE.Vector3().crossVectors(base, _up).normalize();
  const upv = new THREE.Vector3().crossVectors(right, base).normalize();
  const start = camera.position.clone().addScaledVector(base, 0.3);
  for (let i = 0; i < W.pellets; i++) {
    // Reparto gaussiano: la mayoría cerca del centro.
    const r = Math.sqrt(-2 * Math.log(Math.max(1e-6, Math.random()))) * W.spread;
    const a = Math.random() * Math.PI * 2;
    const d = base.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(upv, Math.sin(a) * r).normalize();
    bullets.push({ pos: start.clone(), prev: start.clone(), vel: d.multiplyScalar(390 + Math.random() * 20), t: 0, origin: start.clone(), alive: true, pellet: true, shot: game.shotId });
  }
  shotHits.set(game.shotId, { counted: false, animals: new Set() });
  sfx.shot(true);
  if (W.action === 'semi') sfx.click(sfx.ctx ? sfx.ctx.currentTime + 0.08 : 0, 2600, 0.3);
  fauna.onGunshot(player.pos.x, player.pos.z);
  birds.onGunshot(player.pos.x, player.pos.z);
  nessie.onGunshot();
  player.recoil += 0.07;
  hud.muzzleFlash();
  rifle.flash.intensity = 50;
  effects.smoke(rifle.muzzle.getWorldPosition(new THREE.Vector3()), base);
}

function traceSegment(a, c, ahead) {
  let best = null;
  const bh = birds.segmentHit(a, c);
  if (bh) best = { kind: 'bird', t: bh.t, bird: bh.bird };
  const nh = nessie.segmentHit(a, c);
  if (nh && (!best || nh.t < best.t)) best = { kind: 'nessie', t: nh.t, zone: nh.zone };
  const ah = fauna.segmentHit(a, c, ahead);
  if (ah && (!best || ah.t < best.t)) best = { kind: 'animal', t: ah.t, animal: ah.animal, zone: ah.zone };
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
      if (b.pellet) {
        // Los perdigones frenan muy rápido: a partir de unos 50 m ya no hacen nada.
        b.vel.y -= 9.81 * h;
        b.vel.multiplyScalar(1 - 2.6 * h);
        b.pos.addScaledVector(b.vel, h);
      } else stepBullet(b.pos, b.vel, h, wind);
      b.t += h;
      if (b.pellet && b.t > 0.4) {
        b.alive = false;
        break;
      }
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
  if (hit.kind === 'nessie') {
    effects.blood(hit.point, dirN.clone().multiplyScalar(0.6));
    sfx.thud(delay, dist);
    if (nessie.kill()) {
      countHit(b.shot);
      const pts = 1500 + Math.round(dist * 2);
      game.score += pts;
      hud.setScore(game.score);
      hud.hitmark(true);
      game.log.push({ name: 'Monstruo del lago', note: hit.zone, dist, pts });
      hud.banner('¡EL MONSTRUO DEL LAGO!', `Nadie te va a creer · ${hit.zone} · +${pts}`, 'good');
      showTrophy(Trophies.record({ key: 'nessie', name: 'Monstruo del lago', dist, zone: hit.zone, weapon: WEAPONS[game.weapon].name }));
      sfx.moan(dist, 0);
    }
    return;
  }
  if (hit.kind === 'bird') {
    if (birds.kill(hit.bird, dirN)) {
      effects.emit(hit.point, { color: '#8a7a66', count: 8, size: 0.05, grow: 1.5, life: 1.4, speed: 1.2, rise: 0.4, alpha: 0.9, grav: 1.2 });
      onBirdHit(hit.bird, dist, b);
    }
    return;
  }
  if (b.pellet && hit.kind === 'animal') {
    // Perdigones contra caza mayor: de cerca hieren; de lejos, nada.
    const rec = shotHits.get(b.shot);
    if (dist > 22 || !rec || rec.animals.has(hit.animal)) return;
    rec.animals.add(hit.animal);
    hit.zone = 'cuerpo';
  } else if (b.pellet) {
    if (Math.random() < 0.25) {
      if (hit.kind === 'water') effects.splash(hit.point);
      else effects.emit(hit.point, { color: '#a58f6c', count: 2, size: 0.12, grow: 2, life: 0.8, speed: 0.4, rise: 0.4, alpha: 0.5 });
    }
    return;
  }
  if (hit.kind === 'animal') {
    const res = hit.animal.hit(hit.zone);
    effects.blood(hit.point, dirN.clone().multiplyScalar(0.6));
    for (let i = 0; i < 4; i++) effects.bloodDrop(hit.point.x + dirN.x * i * 0.4, hit.point.z + dirN.z * i * 0.4, 1.4);
    sfx.thud(delay, dist);
    onAnimalHit(hit.animal, hit.zone, dist, res, b.pellet ? b.shot : undefined);
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

function countHit(shot) {
  const rec = shotHits.get(shot);
  if (rec) {
    if (rec.counted) return;
    rec.counted = true;
  }
  game.hits++;
}

// Ficha de trofeo que aparece al abatir una pieza.
let toastT = 0;
function showTrophy(e) {
  const el = document.getElementById('trophy-toast');
  el.innerHTML = `<small>Nueva pieza en tu sala de trofeos</small><b>${e.name}</b><span>${Trophies.describe(e)}</span>` +
    (e.medal ? `<div class="t-medal m-${e.medal}">${Trophies.MEDALS[e.medal]}</div>` : '');
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 4500);
}

function onBirdHit(bird, dist, b) {
  const sp = bird.sp;
  countHit(b.shot);
  hud.hitmark(true);
  if (sp.protected) {
    game.score -= sp.penalty;
    hud.setScore(game.score);
    game.log.push({ name: sp.name, note: 'Protegida', dist, pts: -sp.penalty });
    hud.banner(`¡${sp.name.toUpperCase()} ${sp.fem ? 'PROTEGIDA' : 'PROTEGIDO'}!`, `Sanción de la guardería · −${sp.penalty}`, 'bad');
    Trophies.record({ key: bird.key, name: sp.name, size: bird.scale, dist, weapon: WEAPONS[game.weapon].name, zone: 'Especie protegida', penalty: true });
    return;
  }
  const flying = bird.wasFlying;
  const pts = Math.round(sp.points * (flying ? 1.5 : 1) * (b.pellet ? 1 : 1.8) + dist * 0.5);
  const note = flying ? 'A vuelo' : 'Posada';
  game.score += pts;
  game.log.push({ name: sp.name, note: b.pellet ? note : `${note} · rifle`, dist, pts });
  hud.setScore(game.score);
  hud.feed(`${sp.name} · ${note.toLowerCase()} · ${Math.round(dist)} m · +${pts}`, 'good');
  showTrophy(Trophies.record({ key: bird.key, name: sp.name, size: bird.scale, dist, weapon: WEAPONS[game.weapon].name, flying, zone: b.pellet ? '' : 'Con bala' }));
  if (!b.pellet) hud.banner(`${sp.name.toUpperCase()} CON RIFLE`, `¡Qué puntería! · +${pts}`, 'good');
}

function onAnimalHit(animal, zone, dist, res, shot) {
  const sp = animal.sp;
  if (res === 'dead') {
    hud.feed(`Impacto en un ${sp.name.toLowerCase()} ya abatido`);
    return;
  }
  if (shot !== undefined && shotHits.has(shot)) countHit(shot);
  else game.hits++;
  hud.hitmark(res === 'kill');
  if (res === 'wound') {
    dogs.track(animal);
    animal.woundDist = dist;
    hud.banner(sp.fem ? 'HERIDA' : 'HERIDO', 'Sigue el rastro de sangre antes de que se pierda', 'warn');
    hud.feed(`${sp.name} ${sp.fem ? 'herida' : 'herido'} a ${Math.round(dist)} m`, 'warn');
    return;
  }
  animal.killedByPlayer = true;
  if (!sp.legal) {
    game.score -= sp.penalty;
    game.log.push({ name: sp.name, note: 'Protegida', dist, pts: -sp.penalty });
    Trophies.record({ key: animal.key, name: sp.name, size: animal.scale / sp.scale, cls: animal.cls, dist, zone: 'Especie protegida', weapon: WEAPONS[game.weapon].name, penalty: true });
    hud.banner(`¡${sp.name.toUpperCase()} ${sp.fem ? 'PROTEGIDA' : 'PROTEGIDO'}!`, `Sanción de la guardería · −${sp.penalty}`, 'bad');
    hud.feed(`Has abatido ${sp.fem ? 'una' : 'un'} ${sp.name.toLowerCase()}: −${sp.penalty}`, 'bad');
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
    const trophy = Trophies.record({ key: animal.key, name: sp.name, size: animal.scale / sp.scale, cls: animal.cls, dist, zone: note, weapon: WEAPONS[game.weapon].name });
    showTrophy(trophy);
    hud.banner(`${sp.name.toUpperCase()} ${sp.fem ? 'ABATIDA' : 'ABATIDO'}`, `${note} · ${Math.round(dist)} m · +${pts}`, 'good');
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
    hud.feed(`${sp.fem ? 'La' : 'El'} ${sp.name.toLowerCase()} ${sp.fem ? 'herida' : 'herido'} ha muerto: −${sp.penalty}`, 'bad');
  } else {
    const pts = Math.round(sp.points * 0.4 + (animal.woundDist || 0) * 0.3);
    game.score += pts;
    game.log.push({ name: sp.name, note: 'Rastreo', dist: animal.woundDist || 0, pts });
    showTrophy(Trophies.record({ key: animal.key, name: sp.name, size: animal.scale / sp.scale, cls: animal.cls, dist: animal.woundDist || 0, zone: 'Rastreo', weapon: WEAPONS[game.weapon].name }));
    hud.feed(`${sp.fem ? 'La' : 'El'} ${sp.name.toLowerCase()} ${sp.fem ? 'herida' : 'herido'} ha caído · rastreo · +${pts}`, 'warn');
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
  else fov = BASE_FOV - player.aim * (BASE_FOV - (WEAPONS[game.weapon].aimFov || BASE_FOV - 18));
  if (Math.abs(camera.fov - fov) > 1e-3) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // Rifle en primera persona.
  const r = rifle.group;
  r.visible = !opticOn && !binoc;
  const a = player.aim;
  const W = WEAPONS[game.weapon];
  const shotgun = W.kind === 'shotgun' || W.action === 'lever';
  let rx = 0.19 * (1 - a), ry = -0.2 + a * (shotgun ? 0.152 : 0.115), rz = -0.42 + a * (shotgun ? 0.02 : 0.12);
  let rotZ = 0, rotX = 0;
  if (game.switchT > 0) {
    // Cambio de arma: baja y vuelve a subir.
    const k = Math.sin((game.switchT / 0.6) * Math.PI);
    ry -= k * 0.25;
    rotX -= k * 0.6;
  }
  if (W.action === 'lever') {
    // Palanca: abajo y arriba entre disparo y disparo.
    const k = game.boltT > 0 ? Math.sin(clamp(1 - game.boltT / W.cycle, 0, 1) * Math.PI) : 0;
    rifle.bolt.rotation.x = k * 0.9;
    rotX += k * 0.08;
  } else if (W.action === 'semi') {
    rifle.bolt.position.z = game.boltT > 0 ? Math.sin(clamp(1 - game.boltT / W.cycle, 0, 1) * Math.PI) * 0.05 : 0;
  } else if (game.boltT > 0 && W.action === 'bolt') {
    const p = 1 - game.boltT / 1.15;
    const k = Math.sin(clamp(p * 1.4, 0, 1) * Math.PI);
    rotZ = k * 0.35;
    ry -= k * 0.03;
    rifle.bolt.rotation.z = k * 1.2;
    rifle.bolt.position.z = 0.06 + Math.sin(clamp((p - 0.15) * 1.8, 0, 1) * Math.PI) * 0.08;
  } else if (W.action === 'bolt') {
    rifle.bolt.rotation.z = 0;
    rifle.bolt.position.z = 0.06;
  }
  if (game.reloadT > 0) {
    const k = Math.sin(clamp(1 - game.reloadT / W.reload, 0, 1) * Math.PI);
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
        if (a.spottedUntil < now) hud.feed(`Avistado: ${a.sp.name.toLowerCase()} a ${Math.round(d)} m${a.sp.legal ? '' : a.sp.fem ? ' (protegida)' : ' (protegido)'}`, a.sp.legal ? '' : 'bad');
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
    if (a.wounded && a.alive) sub += a.sp.fem ? ' · herida' : ' · herido';
    list.push({ x, y, title: a.sp.name + (a.sp.legal ? '' : a.sp.fem ? ' · protegida' : ' · protegido'), sub, kind });
  }
  hud.setMarkers(list);
}

// ---------- Bucle principal ----------
let last = performance.now();
let todTimer = 0;
// Resolución dinámica: si no llega a ~45 FPS, baja la resolución interna; si va sobrado, la sube.
const perf = { frames: 0, time: 0, fps: 60, pr: quality.pixelRatio, min: 0.62, max: quality.pixelRatio, level: 0 };
// Escalones de detalle: antes de bajar mucho la resolución se recorta lo que menos se nota.
const DETAIL = [
  { draw: 460, grass: 1 },
  { draw: 380, grass: 0.8 },
  { draw: 300, grass: 0.6 },
  { draw: 240, grass: 0.45 },
];
function applyDetail(level) {
  perf.level = level;
  const d = DETAIL[level];
  if (fauna) fauna.drawDistance = d.draw;
  if (world) {
    world.quality.grassRadius = (QUALITY[settings.quality] || QUALITY.media).grassRadius * d.grass;
    world.lastGrass.set(1e9, 1e9);
  }
}
const fpsEl = document.getElementById('fps');
function updatePerf(realDt) {
  perf.frames++;
  perf.time += realDt;
  if (perf.time < 1) return;
  perf.fps = perf.frames / perf.time;
  perf.frames = 0;
  perf.time = 0;
  let pr = perf.pr;
  if (perf.fps < 42) {
    // Primero se recorta detalle lejano; después, la resolución.
    if (perf.level < DETAIL.length - 1 && game.state === 'playing') applyDetail(perf.level + 1);
    else pr = Math.max(perf.min, pr - (perf.fps < 25 ? 0.15 : 0.08));
  } else if (perf.fps > 57) {
    if (pr < perf.max) pr = Math.min(perf.max, pr + 0.05);
    else if (perf.level > 0 && perf.fps > 62) applyDetail(perf.level - 1);
  }
  if (Math.abs(pr - perf.pr) > 0.01 && game.state !== 'loading') {
    perf.pr = pr;
    renderer.setPixelRatio(pr);
    if (post) post.setPixelRatio(pr);
  }
  if (settings.showFps) {
    fpsEl.textContent = `${Math.round(perf.fps)} FPS · resolución ${Math.round((pr / (window.devicePixelRatio || 1)) * 100)}% · detalle ${DETAIL.length - perf.level}/${DETAIL.length}`;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(1, (now - last) / 1000);
  const realDt = Math.min(0.05, rawDt);
  last = now;
  if (game.state === 'loading') return;

  const playing = game.state === 'playing';
  const simDt = playing ? realDt * game.timeScale : game.state === 'menu' ? realDt : 0;
  game.clock += realDt;
  updatePerf(rawDt);

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
    game.switchT = Math.max(0, game.switchT - realDt);
    if (game.reloadT > 0) {
      game.reloadT -= simDt;
      if (game.reloadT <= 0) {
        const n = Math.min(magSize() - game.mag, game.reserve);
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
    dogs.update(simDt, player, player.yaw, isShotgun());
    nessie.update(simDt, player.pos);
    birds.update(simDt, player.pos, player.moving ? (player.sprinting ? 1.8 : STANCE[player.stance].noise) : 0, dogs.flushers(), isShotgun());

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
    else if (totalAmmo() === 0 && bullets.length === 0 && game.boltT <= 0 && !bulletCam.active) {
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
    birds.update(simDt, null, 0);
    dogs.setVisible(false);
  }

  effects.update(simDt);
  world.update(realDt, camera, playing ? player.pos : camera.position, wind.speed);
  water.update(realDt, wind.speed, camera.position);
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
let trophiesBack = 'menu';
const openTrophies = (from) => {
  trophiesBack = from;
  Trophies.renderCatalog(document.getElementById('trophies'));
  showScreen('trophies');
};
document.getElementById('btn-trophies').addEventListener('click', () => openTrophies('menu'));
document.getElementById('btn-pause-trophies').addEventListener('click', () => openTrophies('pause'));
document.getElementById('btn-res-trophies').addEventListener('click', () => openTrophies('results'));
document.getElementById('btn-trophies-back').addEventListener('click', () => showScreen(trophiesBack));
document.getElementById('btn-trophies-clear').addEventListener('click', () => {
  if (confirm('¿Seguro que quieres borrar todos tus trofeos? No se puede deshacer.')) {
    Trophies.clearAll();
    Trophies.renderCatalog(document.getElementById('trophies'));
  }
});
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
const fpsOpt = document.getElementById('opt-fps');
fpsOpt.checked = settings.showFps;
fpsEl.classList.toggle('hidden', !settings.showFps);
fpsOpt.addEventListener('change', () => {
  settings.showFps = fpsOpt.checked;
  store.set('sierra.fps', fpsOpt.checked);
  fpsEl.classList.toggle('hidden', !fpsOpt.checked);
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
window.__dogs = null;
window.__sierra = { get nessie() { return nessie; }, game, player, get fauna() { return fauna; }, get birds() { return birds; }, camera, startHunt, endHunt, fire, predict, wind };
