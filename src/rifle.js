// Rifle de cerrojo con visor, visto en primera persona: culata de nogal con veta,
// acero pavonado, visor torneado con torretas y anillas.
import * as THREE from 'three';
import { loft, subdivide } from './geo.js';
import { rng } from './noise.js';

function woodTexture() {
  const W = 256, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#5a321a');
  grd.addColorStop(0.5, '#6e4023');
  grd.addColorStop(1, '#5a321a');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const r = rng(404);
  // Vetas: líneas largas y onduladas a lo largo de la culata.
  for (let i = 0; i < 140; i++) {
    const x0 = r() * W;
    const amp = 2 + r() * 10, freq = 0.004 + r() * 0.01, ph = r() * 6;
    const dark = r() < 0.6;
    g.strokeStyle = dark ? `rgba(38,18,8,${0.15 + r() * 0.35})` : `rgba(150,95,50,${0.12 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let y = 0; y <= H; y += 8) {
      const x = x0 + Math.sin(y * freq + ph) * amp + Math.sin(y * freq * 3.1 + ph) * amp * 0.25;
      if (y === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Nudos y "llamas" del nogal.
  for (let i = 0; i < 6; i++) {
    const x = r() * W, y = r() * H;
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = `rgba(35,16,6,${0.25 - k * 0.03})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(x, y, 4 + k * 4, 12 + k * 10, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Moleteado para el pomo del cerrojo y las torretas (mapa de relieve).
function knurlTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#8080ff';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#b0b0ff';
  g.lineWidth = 2;
  for (let i = -S; i < S * 2; i += 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + S, S);
    g.moveTo(i, S);
    g.lineTo(i + S, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

// Pieza torneada. Perfil [radio, posición en el eje] en orden creciente; el eje queda en +z.
function lathe(profile, segments = 40) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

export function buildRifle() {
  const wood = new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.25 });
  const blued = new THREE.MeshStandardMaterial({ color: '#1d2024', roughness: 0.32, metalness: 0.85 });
  const matte = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.55, metalness: 0.5 });
  const knurl = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.6, metalness: 0.5, normalMap: knurlTexture() });
  const rubber = new THREE.MeshStandardMaterial({ color: '#0f0f10', roughness: 0.95 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0e1a22', roughness: 0.03, metalness: 0.2, clearcoat: 1, envMapIntensity: 2.2, emissive: '#06131a' });
  const brass = new THREE.MeshStandardMaterial({ color: '#b28a4a', roughness: 0.35, metalness: 0.9 });

  const g = new THREE.Group();
  const add = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    g.add(m);
    return m;
  };
  const white = () => [1, 1, 1];

  // --- Culata y guardamanos (una sola pieza de madera) ---
  const stock = subdivide([
    [0.64, -0.078, 0.021, 0.072], [0.6, -0.074, 0.023, 0.076], [0.45, -0.058, 0.022, 0.062], [0.3, -0.045, 0.02, 0.046],
    [0.21, -0.04, 0.017, 0.044], [0.13, -0.046, 0.018, 0.054], [0.06, -0.032, 0.02, 0.042], [-0.05, -0.02, 0.022, 0.032],
    [-0.25, -0.021, 0.021, 0.028], [-0.4, -0.019, 0.018, 0.024], [-0.44, -0.017, 0.012, 0.014],
  ].map(([z, y, w, h]) => ({ p: [0, y, z], w, h })), 4);
  add(loft(stock, [0, 1, 0], 28, white, 2.6, [1, 1.3]), wood);
  // Empuñadura de pistola
  const grip = subdivide([
    { p: [0, -0.05, 0.18], w: 0.017, h: 0.03 },
    { p: [0, -0.1, 0.15], w: 0.016, h: 0.024 },
    { p: [0, -0.135, 0.13], w: 0.015, h: 0.022 },
    { p: [0, -0.142, 0.126], w: 0.008, h: 0.01 },
  ], 4);
  add(loft(grip, [0, 0, 1], 20, white, 2.4, [1, 1.3]), wood);
  // Cantonera de goma
  add(new THREE.BoxGeometry(0.044, 0.15, 0.016), rubber, [0, -0.078, 0.648]);

  // --- Acción, cerrojo y cañón ---
  add(lathe([[0, -0.11], [0.0165, -0.11], [0.018, -0.1], [0.018, 0.1], [0.016, 0.115], [0, 0.115]], 36), blued, [0, 0.014, -0.005]);
  add(new THREE.BoxGeometry(0.012, 0.004, 0.05), matte, [0.0125, 0.03, 0.0]); // ventana de expulsión
  add(lathe([
    [0, 0], [0.0125, 0], [0.0125, 0.02], [0.0118, 0.03], [0.0105, 0.4], [0.0095, 0.7], [0.0095, 0.745], [0.0105, 0.75], [0.0105, 0.765], [0.006, 0.768], [0, 0.768],
  ], 32), blued, [0, 0.014, -0.115], [Math.PI, 0, 0]);
  const bolt = new THREE.Group();
  const boltBody = new THREE.Mesh(lathe([[0, 0], [0.0085, 0], [0.0085, 0.06], [0.0095, 0.065], [0.0095, 0.085], [0, 0.085]], 24), blued);
  boltBody.position.set(0, 0, -0.02);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.06, 12), blued);
  handle.rotation.z = Math.PI / 2 - 0.35;
  handle.position.set(0.032, -0.012, 0.045);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 14), knurl);
  knob.position.set(0.06, -0.022, 0.045);
  bolt.add(boltBody, handle, knob);
  bolt.position.set(0, 0.014, 0.06);
  g.add(bolt);
  // Guardamonte, gatillo y chapa del cargador
  add(new THREE.TorusGeometry(0.026, 0.0035, 10, 28, Math.PI), blued, [0, -0.034, 0.075], [0, Math.PI / 2, Math.PI]);
  add(new THREE.BoxGeometry(0.006, 0.003, 0.11), blued, [0, -0.035, 0.055]);
  add(new THREE.TorusGeometry(0.012, 0.003, 8, 16, Math.PI * 0.6), blued, [0, -0.03, 0.072], [0, Math.PI / 2, Math.PI * 0.95]);
  add(new THREE.BoxGeometry(0.03, 0.006, 0.08), blued, [0, -0.043, -0.01]);
  // Anillas del portafusil
  add(new THREE.TorusGeometry(0.008, 0.0018, 8, 16), blued, [0, -0.052, 0.4], [0, Math.PI / 2, 0]);
  add(new THREE.TorusGeometry(0.008, 0.0018, 8, 16), blued, [0, -0.042, -0.36], [0, Math.PI / 2, 0]);

  // --- Visor (ocular hacia +z, objetivo hacia -z) ---
  const scopeY = 0.068;
  add(lathe([
    [0, -0.275], [0.0235, -0.275], [0.026, -0.27], [0.026, -0.2], [0.024, -0.19], [0.0165, -0.13], [0.0155, -0.11], [0.0155, 0.085],
    [0.0172, 0.1], [0.019, 0.108], [0.021, 0.12], [0.0205, 0.165], [0.017, 0.17], [0, 0.17],
  ], 48), matte, [0, scopeY, 0]);
  add(new THREE.CircleGeometry(0.0235, 32), glass, [0, scopeY, -0.2765], [0, Math.PI, 0]);
  add(new THREE.CircleGeometry(0.0165, 32), glass, [0, scopeY, 0.1712]);
  // Torretas de elevación (arriba) y deriva (derecha)
  const turret = lathe([[0, 0], [0.012, 0], [0.012, 0.012], [0.0135, 0.014], [0.0135, 0.028], [0.012, 0.03], [0, 0.03]], 32);
  add(turret, knurl, [0, scopeY + 0.012, -0.02], [-Math.PI / 2, 0, 0]);
  add(turret, knurl, [0.012, scopeY, -0.02], [0, Math.PI / 2, 0]);
  add(new THREE.BoxGeometry(0.03, 0.02, 0.05), matte, [0, scopeY, -0.02]);
  // Anillas y bases
  for (const z of [-0.075, 0.06]) {
    add(new THREE.TorusGeometry(0.0172, 0.0035, 12, 32), matte, [0, scopeY, z]);
    add(new THREE.BoxGeometry(0.018, 0.028, 0.018), matte, [0, 0.042, z]);
    add(new THREE.CylinderGeometry(0.003, 0.003, 0.044, 10), brass, [0, 0.042, z], [0, 0, Math.PI / 2]);
  }

  // Boca del cañón, para el fogonazo.
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.014, -0.885);
  g.add(muzzle);
  const flash = new THREE.PointLight('#ffb35c', 0, 6, 2);
  flash.position.copy(muzzle.position);
  g.add(flash);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return { group: g, bolt, muzzle, flash };
}

// Escopeta paralela de dos cañones, para caza menor.
export function buildShotgun() {
  const wood = new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const blued = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.3, metalness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: '#8d8a85', roughness: 0.35, metalness: 0.9 });
  const g = new THREE.Group();
  const add = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    g.add(m);
    return m;
  };
  const white = () => [1, 1, 1];
  // Culata inglesa, recta.
  const stock = subdivide([
    [0.6, -0.07, 0.02, 0.065], [0.56, -0.066, 0.022, 0.068], [0.4, -0.05, 0.02, 0.055], [0.24, -0.035, 0.017, 0.04],
    [0.14, -0.03, 0.016, 0.034], [0.08, -0.022, 0.02, 0.03], [0.07, -0.02, 0.012, 0.012],
  ].map(([z, y, w, h]) => ({ p: [0, y, z], w, h })), 4);
  add(loft(stock, [0, 1, 0], 26, white, 2.6, [1, 1.3]), wood);
  add(new THREE.BoxGeometry(0.04, 0.13, 0.012), blued, [0, -0.07, 0.606]);
  // Báscula (acero grabado) y guardamanos.
  add(new THREE.BoxGeometry(0.046, 0.05, 0.1), steel, [0, -0.005, 0.02]);
  add(new THREE.BoxGeometry(0.04, 0.03, 0.2), wood, [0, -0.012, -0.2]);
  // Dos cañones y la banda con el punto de mira.
  for (const sx of [-1, 1]) {
    add(lathe([[0, 0], [0.0112, 0], [0.011, 0.3], [0.0098, 0.66], [0.0098, 0.67], [0, 0.67]], 24), blued, [sx * 0.0112, 0.012, -0.03], [Math.PI, 0, 0]);
  }
  add(new THREE.BoxGeometry(0.008, 0.004, 0.64), blued, [0, 0.024, -0.36]);
  add(new THREE.SphereGeometry(0.0028, 10, 8), steel, [0, 0.029, -0.69]);
  // Gatillos y guarda.
  add(new THREE.TorusGeometry(0.024, 0.0032, 8, 24, Math.PI), blued, [0, -0.034, 0.05], [0, Math.PI / 2, Math.PI]);
  add(new THREE.TorusGeometry(0.011, 0.0028, 8, 14, Math.PI * 0.6), blued, [0, -0.03, 0.05], [0, Math.PI / 2, Math.PI * 0.95]);
  add(new THREE.TorusGeometry(0.011, 0.0028, 8, 14, Math.PI * 0.6), blued, [0, -0.03, 0.068], [0, Math.PI / 2, Math.PI * 0.95]);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.012, -0.7);
  g.add(muzzle);
  const flash = new THREE.PointLight('#ffb35c', 0, 6, 2);
  flash.position.copy(muzzle.position);
  g.add(flash);
  // El código de animación espera un "cerrojo"; en la paralela no se mueve nada.
  const bolt = new THREE.Group();
  g.add(bolt);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return { group: g, bolt, muzzle, flash };
}
