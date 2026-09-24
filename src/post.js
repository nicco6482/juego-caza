// Postprocesado: resplandor (bloom), mapeo de tonos y un etalonaje cinematográfico suave.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.9 },
    uGrain: { value: 0.035 },
    uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
    uSharp: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uSharp;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // Nitidez: realza los bordes (compensa cuando la resolución baja).
      vec3 blur = (texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                 + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb) * 0.25;
      c = max(c + (c - blur) * uSharp, 0.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.1);
      c += (c - 0.5) * 0.07;
      // Sombras algo frías y luces cálidas: luz de tarde.
      c *= mix(vec3(0.95, 0.98, 1.05), vec3(1.05, 1.0, 0.92), smoothstep(0.15, 0.85, l));
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * uVignette;
      float n = fract(sin(dot(vUv * vec2(1733.1, 971.7) + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, quality) {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: quality.msaa,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (quality.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.55, 0.92);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const api = {
    render(dt) {
      grade.uniforms.uTime.value += dt;
      composer.render(dt);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      this.updateTexel();
    },
    setPixelRatio(pr) {
      composer.setPixelRatio(pr);
      composer.setSize(innerWidth, innerHeight);
      this.updateTexel();
    },
    updateTexel() {
      const pr = renderer.getPixelRatio();
      grade.uniforms.uTexel.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
      // Más nitidez cuanto más baja la resolución interna.
      grade.uniforms.uSharp.value = 0.25 + Math.max(0, 1 - pr / (window.devicePixelRatio || 1)) * 0.6;
    },
    set vignette(v) {
      grade.uniforms.uVignette.value = v;
    },
  };
  api.updateTexel();
  return api;
}
