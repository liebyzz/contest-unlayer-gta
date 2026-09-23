"use client";

import { useMemo } from "react";
import * as THREE from "three";

/**
 * Dusk, twenty minutes after the rain: an orange band still burning on the
 * horizon, indigo overhead, the first stars showing through.
 */
const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColour;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

  vec3 col = mix(uHorizon, uMid, smoothstep(0.48, 0.62, h));
  col = mix(col, uZenith, smoothstep(0.58, 0.92, h));

  // the sun, low and blown out
  float sun = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColour * pow(sun, 900.0) * 3.4;
  col += uSunColour * pow(sun, 12.0) * 0.34;
  col += uSunColour * pow(sun, 3.0) * 0.09;

  // stars, only up high and only away from the sun
  if (d.y > 0.12) {
    vec2 cell = floor(d.xz * 260.0 / max(d.y, 0.2));
    float s = hash(cell);
    float twinkle = step(0.9975, s);
    col += vec3(0.85, 0.88, 1.0) * twinkle * smoothstep(0.12, 0.7, d.y) * (1.0 - pow(sun, 2.0));
  }

  // ground haze so the dome meets the fog cleanly
  col = mix(col, uHorizon * 0.55, smoothstep(0.5, 0.34, h));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Where the key light comes from. Shared with the scene's directional light. */
export const SUN_DIRECTION = new THREE.Vector3(-0.72, 0.3, -0.62).normalize();
export const FOG_COLOUR = "#241a30";

export function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: new THREE.Color("#ff7a3c") },
          uMid: { value: new THREE.Color("#6d3a72") },
          uZenith: { value: new THREE.Color("#150f2b") },
          uSunDir: { value: SUN_DIRECTION.clone() },
          uSunColour: { value: new THREE.Color("#ffb066") },
        },
      }),
    [],
  );

  return (
    <mesh material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 20]} />
    </mesh>
  );
}
