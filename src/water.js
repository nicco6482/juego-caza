// Lago: agua con reflejo real del paisaje, oleaje en capas, destellos del sol, color según
// la profundidad (transparente en la orilla, azul verdoso oscuro en el centro) y espuma.
// Alrededor, carrizos y nenúfares.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { LAKE, groundAt, waterDepth } from './world.js';
import { waterNormals } from './textures.js';
import { fogUniforms } from './fog.js';
import { rng, hash2 } from './noise.js';

const WaterShader = {
  name: 'Agua',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    tNormal: { value: null },
    uTime: { value: 0 },
    wave: { value: 1 },
    reflectAmt: { value: 1 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() },
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0.002 },
    shallow: { value: new THREE.Color('#5d7a5e') },
    deep: { value: new THREE.Color('#0b2227') },
    skyTop: { value: new THREE.Color() },
    skyHorizon: { value: new THREE.Color() },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    attribute float depth;
    varying vec4 vUvR;
    varying vec3 vWorld;
    varying float vDepth;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vDepth = depth;
      vUvR = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tNormal;
    uniform float uTime, wave, reflectAmt, fogDensity;
    uniform vec3 sunDir, sunColor, fogColor, shallow, deep, skyTop, skyHorizon;
    varying vec4 vUvR;
    varying vec3 vWorld;
    varying float vDepth;
    vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    void main() {
      if (vDepth < -0.02) discard;
      vec2 p = vWorld.xz;
      vec3 n1 = nrm(p * 0.045 + vec2(uTime * 0.010, uTime * 0.006));
      vec3 n2 = nrm(p * 0.11 + vec2(-uTime * 0.018, uTime * 0.013));
      vec3 n3 = nrm(p * 0.37 + vec2(uTime * 0.03, -uTime * 0.034));
      vec3 n4 = nrm(p * 1.3 + vec2(-uTime * 0.05, uTime * 0.045));
      vec3 toCam = cameraPosition - vWorld;
      float dist = length(toCam);
      vec3 V = toCam / dist;
      // A lo lejos se suaviza el oleaje (evita parpadeos) y el detalle fino solo se ve de cerca.
      float far = smoothstep(60.0, 380.0, dist);
      vec2 slope = (n1.xy * 0.5 + n2.xy * 0.35 + n3.xy * 0.22 + n4.xy * 0.12 * (1.0 - far)) * wave * (1.0 - far * 0.7);
      vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
      float cosT = max(dot(N, V), 0.0);
      float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

      vec3 refl;
      if (reflectAmt > 0.5) {
        vec2 ruv = vUvR.xy / vUvR.w + slope * 0.045 * (1.0 - far * 0.6);
        refl = texture2D(tDiffuse, ruv).rgb;
      } else {
        vec3 R = reflect(-V, N);
        refl = mix(skyHorizon, skyTop, pow(max(R.y, 0.0), 0.5));
      }

      float d = max(vDepth, 0.0);
      float absorb = 1.0 - exp(-d * 0.55);
      vec3 body = mix(shallow, deep, absorb);
      body += sunColor * 0.035 * (1.0 - absorb);
      vec3 col = mix(body, refl, fres);

      vec3 H = normalize(sunDir + V);
      float nh = max(dot(N, H), 0.0);
      col += sunColor * (pow(nh, 900.0) * 16.0 + pow(nh, 90.0) * 0.5) * (0.35 + fres);

      // Espuma que va y viene en la orilla.
      float foamN = n3.x * 0.5 + 0.5;
      float lap = 0.5 + 0.5 * sin(uTime * 1.3 + p.x * 0.7 + p.y * 0.5);
      float foam = (1.0 - smoothstep(0.02, 0.28, d)) * smoothstep(0.5, 0.85, foamN * 0.7 + lap * 0.5);
      col = mix(col, vec3(0.86, 0.88, 0.86), foam * 0.55);

      float alpha = mix(0.2, 1.0, smoothstep(0.0, 1.6, d));
      alpha = max(alpha, fres * 0.92);
      alpha = max(alpha, foam * 0.6);
      alpha *= smoothstep(-0.02, 0.07, vDepth);

      float ff = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
      col = mix(col, fogColor, ff);
      gl_FragColor = vec4(col, alpha);
    }`,
};

export class Water {
  constructor(scene, quality, renderer, world) {
    this.world = world;
    const span = LAKE.r * 1.45;
    const seg = quality.waterSeg;
    const geo = new THREE.PlaneGeometry(span * 2, span * 2, seg, seg);
    const pos = geo.attributes.position;
    const depth = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      // Plano en XY que luego se tumba: y local = -z del mundo.
      const x = LAKE.x + pos.getX(i), z = LAKE.z - pos.getY(i);
      const d = waterDepth(x, z);
      depth[i] = d < -90 ? -1 : d;
    }
    geo.setAttribute('depth', new THREE.BufferAttribute(depth, 1));

    const normalTex = waterNormals(512);
    const pr = renderer.getPixelRatio();
    if (quality.waterReflect > 0) {
      this.mesh = new Reflector(geo, {
        shader: WaterShader,
        textureWidth: Math.round(innerWidth * pr * quality.waterReflect),
        textureHeight: Math.round(innerHeight * pr * quality.waterReflect),
        clipBias: 0.002,
        multisample: quality.msaa > 0 ? 4 : 0,
      });
    } else {
      const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(WaterShader.uniforms),
        vertexShader: WaterShader.vertexShader,
        fragmentShader: WaterShader.fragmentShader,
      });
      mat.uniforms.reflectAmt.value = 0;
      this.mesh = new THREE.Mesh(geo, mat);
    }
    const u = (this.u = this.mesh.material.uniforms);
    u.tNormal.value = normalTex;
    this.mesh.material.transparent = true;
    this.mesh.material.depthWrite = true;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(LAKE.x, LAKE.level, LAKE.z);
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);

    this.buildReeds(scene, world);
    this.buildLilies(scene);
  }

  buildReeds(scene, world) {
    const R = rng(515);
    const list = [];
    for (let t = 0; t < 30000 && list.length < 2600; t++) {
      const a = R() * Math.PI * 2, r = LAKE.r * (0.6 + R() * 0.8);
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      const d = waterDepth(x, z);
      if (d < -0.5 || d > 0.55) continue;
      // Matas agrupadas, no un seto continuo.
      if (hash2(Math.floor(x / 9), Math.floor(z / 9), 7) < 0.45) continue;
      list.push([x, z]);
    }
    const mesh = new THREE.InstancedMesh(world.grass.geometry, world.grass.material, list.length);
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach(([x, z], i) => {
      dummy.position.set(x, groundAt(x, z) - 0.05, z);
      dummy.rotation.set(0, R() * Math.PI * 2, 0);
      const h = 1.4 + R() * 1.1;
      dummy.scale.set(0.45 + R() * 0.3, h, 0.45 + R() * 0.3);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const v = 0.75 + R() * 0.2;
      mesh.setColorAt(i, c.setRGB(v * 0.8, v * 1.05, v * 0.62));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  buildLilies(scene) {
    const R = rng(616);
    const geo = new THREE.CircleGeometry(0.32, 14, 0.35, Math.PI * 2 - 0.35).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#3f6a2c', roughness: 0.35, side: THREE.DoubleSide });
    const list = [];
    for (let t = 0; t < 20000 && list.length < 260; t++) {
      const a = R() * Math.PI * 2, r = LAKE.r * R();
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      const d = waterDepth(x, z);
      if (d < 0.4 || d > 1.8) continue;
      if (hash2(Math.floor(x / 7), Math.floor(z / 7), 9) < 0.7) continue;
      list.push([x, z]);
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach(([x, z], i) => {
      dummy.position.set(x, LAKE.level + 0.02, z);
      dummy.rotation.set(0, R() * Math.PI * 2, 0);
      dummy.scale.setScalar(0.6 + R() * 0.9);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const v = 0.8 + R() * 0.4;
      mesh.setColorAt(i, c.setRGB(v, v, v * 0.9));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    this.lilies = mesh;
    scene.add(mesh);
  }

  update(dt, windSpeed, cam) {
    const u = this.u, w = this.world;
    // El reflejo real (volver a dibujar la escena) solo compensa cerca del lago.
    if (cam && this.mesh.isReflector !== undefined) {
      const near = Math.hypot(cam.x - LAKE.x, cam.z - LAKE.z) < LAKE.r + 220;
      if (!this._reflectBefore) this._reflectBefore = this.mesh.onBeforeRender;
      this.mesh.onBeforeRender = near ? this._reflectBefore : () => {};
      u.reflectAmt.value = near ? 1 : 0;
    }
    u.uTime.value += dt;
    u.wave.value += ((0.45 + windSpeed * 0.14) - u.wave.value) * Math.min(1, dt);
    u.sunDir.value.copy(fogUniforms.fogSunDir.value);
    u.sunColor.value.copy(w.sun.color).multiplyScalar(w.sun.intensity * 0.55);
    u.fogColor.value.copy(w.scene.fog.color);
    u.fogDensity.value = w.scene.fog.density;
    u.skyTop.value.copy(w.skyUniforms.top.value);
    u.skyHorizon.value.copy(w.skyUniforms.horizon.value);
  }
}
