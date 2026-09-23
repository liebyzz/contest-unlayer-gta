/**
 * The shaft of light under a lamp.
 *
 * A cone drawn at a flat opacity has a hard triangular outline, and a hard
 * outline is what makes it read as a solid tent of coloured plastic rather than
 * dusty air. Two things fix that, and neither can be done with a texture
 * because both depend on where the camera is:
 *
 *   - the silhouette fades out. Where the cone's surface turns edge-on to the
 *     viewer we are looking through the *thinnest* part of it, so that is
 *     exactly where it should disappear;
 *   - the beam thins towards the ground, where a real shaft has spread out and
 *     run out of dust to catch.
 *
 * Everything else in the scene is faked with additive quads; this is the one
 * place worth a shader.
 */
import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vToEye;
  varying float vHeight;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vToEye = cameraPosition - world.xyz;
    // ConeGeometry runs v from 1 at the apex to 0 at the base
    vHeight = uv.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColour;
  uniform float uStrength;
  uniform float uFlip;
  varying vec3 vNormalW;
  varying vec3 vToEye;
  varying float vHeight;

  void main() {
    float facing = abs(dot(normalize(vNormalW), normalize(vToEye)));
    // pow() rather than the raw dot so the fade holds a soft core and lets go
    // of the edge quickly
    float body = pow(facing, 1.9);
    // bright just under the lamp, gone by the pavement, and eased off at the
    // very apex so the cone does not end on a point
    float hh = mix(vHeight, 1.0 - vHeight, uFlip);
    float fall = smoothstep(0.02, 0.62, hh) * (1.0 - smoothstep(0.93, 1.0, hh));
    float a = body * fall * uStrength;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColour, a);
  }
`;

/**
 * @param colour lamp colour
 * @param strength peak alpha through the middle of the beam
 */
export function lightShaftMaterial(
  colour: string,
  strength = 0.5,
  /** true when the source is at the BOTTOM, e.g. a marker growing off a wall */
  flip = false,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColour: { value: new THREE.Color(colour) },
      uStrength: { value: strength },
      uFlip: { value: flip ? 1 : 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
