// Modelos 3D opcionales (glTF/GLB con esqueleto y animaciones) para sustituir a los animales
// generados por código. Se declaran en assets/models/manifest.json (ver README).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const MODELS = {};

const GUESS = {
  idle: /idle|stand|breath/i,
  walk: /walk/i,
  run: /run|gallop|trot|sprint/i,
  eat: /eat|graze|grazing/i,
  death: /death|die|dead/i,
};

export async function loadModels() {
  let manifest;
  try {
    const r = await fetch('assets/models/manifest.json');
    if (!r.ok) return;
    manifest = await r.json();
  } catch {
    return;
  }
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(manifest).map(async ([key, cfg]) => {
    if (!cfg || !cfg.file) return;
    try {
      const gltf = await loader.loadAsync(`assets/models/${cfg.file}`);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const clips = {};
      for (const [slot, re] of Object.entries(GUESS)) {
        const wanted = cfg.anims && cfg.anims[slot];
        clips[slot] = gltf.animations.find((c) => (wanted ? c.name === wanted : re.test(c.name))) || null;
      }
      MODELS[key] = { scene: gltf.scene, clips, cfg, size, minY: box.min.y };
    } catch (e) {
      console.warn(`No se pudo cargar el modelo de ${key}:`, e);
    }
  }));
}

// Crea una instancia animada. `length` es el largo del cuerpo que debe tener (en metros, antes
// de la escala del grupo).
export function instantiate(key, length) {
  const M = MODELS[key];
  if (!M) return null;
  const root = cloneSkinned(M.scene);
  const longest = Math.max(M.size.x, M.size.z) || 1;
  const k = M.cfg.scale ?? length / longest;
  root.scale.setScalar(k);
  root.rotation.y = M.cfg.rotationY ?? 0;
  root.position.y = -M.minY * k + (M.cfg.offsetY ?? 0);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [slot, clip] of Object.entries(M.clips)) {
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    if (slot === 'death') {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    actions[slot] = a;
  }
  return { root, mixer, actions, current: null };
}

export function playSlot(inst, slot, fade = 0.3, timeScale = 1) {
  const a = inst.actions[slot] || inst.actions.idle || inst.actions.walk;
  if (!a) return;
  a.timeScale = timeScale;
  if (inst.current === a) return;
  a.reset().play();
  if (inst.current) inst.current.crossFadeTo(a, fade, false);
  inst.current = a;
}
