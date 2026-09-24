// Niebla de altura con dispersión solar: se acumula en los valles, se aclara con la altura
// y se ilumina en la dirección del sol. Sustituye a los fragmentos de niebla de three.js.
import * as THREE from 'three';

export const fogUniforms = {
  fogSunDir: { value: new THREE.Vector3(0, 0.3, 1) },
  fogSunColor: { value: new THREE.Color('#ffd7a0') },
  fogFalloff: { value: 0.011 },
  fogBase: { value: -15 },
};

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif`;

THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 fogWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWorld = instanceMatrix * fogWorld;
  #endif
  vFogWorldPos = ( modelMatrix * fogWorld ).xyz;
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  uniform float fogFalloff;
  uniform float fogBase;
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    if ( fogFalloff > 0.0 ) {
      vec3 fogRay = vFogWorldPos - cameraPosition;
      float fogDist = length( fogRay );
      fogRay /= max( fogDist, 1e-4 );
      float fogH0 = max( cameraPosition.y - fogBase, 0.0 );
      float fogRy = fogRay.y * fogDist * fogFalloff;
      float fogInteg = abs( fogRy ) > 1e-3 ? ( 1.0 - exp( - fogRy ) ) / fogRy : 1.0;
      float fogAmount = fogDensity * fogDist * exp( - fogFalloff * fogH0 ) * fogInteg;
      float fogFactor = 1.0 - exp( - fogAmount );
      float fogSun = pow( max( dot( fogRay, fogSunDir ), 0.0 ), 6.0 );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, fogSunColor, fogSun * 0.55 ), fogFactor );
    } else {
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
    }
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif`;

let keySeq = 0;

// Conecta los uniformes de la niebla a un material y, opcionalmente, aplica otros cambios
// al shader. Cada material recibe una clave propia para que three.js no mezcle programas.
export function customize(material, name, fn) {
  const key = `${name}-${keySeq++}`;
  material.onBeforeCompile = (sh, renderer) => {
    Object.assign(sh.uniforms, fogUniforms);
    if (fn) fn(sh, renderer);
  };
  material.customProgramCacheKey = () => key;
  return material;
}
