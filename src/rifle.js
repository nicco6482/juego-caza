// Rifle de cerrojo con visor, visto en primera persona.
import * as THREE from 'three';

export function buildRifle() {
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4b2a', roughness: 0.5, metalness: 0.0 });
  const metal = new THREE.MeshStandardMaterial({ color: '#33373c', roughness: 0.55, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#2a3d4a', roughness: 0.05, metalness: 0.9, emissive: '#0d1a22' });

  const g = new THREE.Group();
  const add = (geo, mat, pos, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    g.add(m);
    return m;
  };

  // Culata y guardamanos
  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, 0);
  stockShape.lineTo(0.42, 0.0);
  stockShape.lineTo(0.46, -0.035);
  stockShape.lineTo(0.62, -0.03);
  stockShape.lineTo(0.66, -0.13);
  stockShape.lineTo(0.64, -0.155);
  stockShape.lineTo(0.5, -0.1);
  stockShape.lineTo(0.4, -0.065);
  stockShape.lineTo(0.3, -0.07);
  stockShape.lineTo(0.28, -0.045);
  stockShape.lineTo(-0.45, -0.035);
  stockShape.lineTo(-0.47, 0.0);
  stockShape.lineTo(0, 0);
  const stockGeo = new THREE.ExtrudeGeometry(stockShape, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
  stockGeo.translate(0, 0, -0.0225);
  add(stockGeo, wood, [0, 0, 0], [0, -Math.PI / 2, 0]);

  // Cajón de mecanismos, cañón y cerrojo
  add(new THREE.BoxGeometry(0.042, 0.04, 0.22), metal, [0, 0.012, -0.02]);
  add(new THREE.CylinderGeometry(0.0095, 0.012, 0.72, 12), metal, [0, 0.018, -0.48], [Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), metal, [0, 0.018, -0.85], [Math.PI / 2, 0, 0]);
  const bolt = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8), metal);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.04, 0, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), metal);
  knob.position.set(0.075, 0, 0);
  bolt.add(handle, knob);
  bolt.position.set(0, 0.02, 0.06);
  g.add(bolt);
  add(new THREE.BoxGeometry(0.035, 0.05, 0.07), metal, [0, -0.03, 0.0]); // cargador
  add(new THREE.TorusGeometry(0.03, 0.004, 6, 14, Math.PI), metal, [0, -0.03, 0.11], [0, Math.PI / 2, Math.PI]);

  // Visor
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 16), metal, [0, 0.075, -0.02], [Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(0.024, 0.017, 0.07, 16), metal, [0, 0.075, -0.19], [Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(0.021, 0.021, 0.05, 16), metal, [0, 0.075, -0.25], [Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(0.017, 0.022, 0.06, 16), metal, [0, 0.075, 0.14], [Math.PI / 2, 0, 0]);
  add(new THREE.CircleGeometry(0.02, 16), glass, [0, 0.075, -0.276]);
  add(new THREE.CylinderGeometry(0.009, 0.009, 0.025, 10), metal, [0, 0.1, -0.01]);
  add(new THREE.CylinderGeometry(0.009, 0.009, 0.025, 10), metal, [0.028, 0.075, -0.01], [0, 0, Math.PI / 2]);
  add(new THREE.BoxGeometry(0.02, 0.035, 0.02), metal, [0, 0.045, -0.1]);
  add(new THREE.BoxGeometry(0.02, 0.035, 0.02), metal, [0, 0.045, 0.07]);

  // Boca del cañón, para el fogonazo.
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.018, -0.9);
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
