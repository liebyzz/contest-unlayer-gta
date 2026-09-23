import * as THREE from "three";

/**
 * The paint-on reveal.
 *
 * A standard material (so it takes the scene's dusk lighting like everything
 * else) with a dissolve injected into its shader: the piece sprays on from the
 * bottom of the wall upward, with a bright aerosol edge riding the boundary.
 */
const COMMON = /* glsl */ `
#include <common>
uniform float uProgress;
uniform vec3 uEdge;
float nwEdgeAmt = 0.0;
float nwHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float nwNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(nwHash(i), nwHash(i + vec2(1.0, 0.0)), f.x),
    mix(nwHash(i + vec2(0.0, 1.0)), nwHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
`;

// Guarded: a material compiled for a frame before its map is attached (a hot
// reload, a context restore) must still link rather than take the scene down.
// The front is spray, not slime: coarse noise shapes where the can has been,
// finer octaves and a per-texel grain break its edge into droplets, and the
// glow is a thin wet rim rather than a band. The old single low-frequency
// octave with a wide, bright edge swept the wall in big glowing acid blobs.
const MAP_FRAGMENT = /* glsl */ `
#include <map_fragment>
#ifdef USE_MAP
{
  float nwGrain = nwHash(floor(vMapUv * vec2(480.0, 300.0)));
  float nwN =
    nwNoise(vMapUv * 7.0) * 0.3 +
    nwNoise(vMapUv * 29.0) * 0.17 +
    nwGrain * 0.15 +
    (1.0 - vMapUv.y) * 0.38;
  float nwP = mix(-0.1, 1.1, uProgress);
  diffuseColor.a *= smoothstep(nwN - 0.035, nwN + 0.005, nwP);
  nwEdgeAmt =
    smoothstep(nwN - 0.02, nwN + 0.005, nwP) -
    smoothstep(nwN + 0.005, nwN + 0.06, nwP);
}
#endif
`;

const DITHERING = /* glsl */ `
#include <dithering_fragment>
gl_FragColor.rgb += uEdge * nwEdgeAmt * 1.1 * (1.0 - step(0.999, uProgress));
`;

/** How much of its own colour a piece gives off. */
const ART_GLOW = 0.3;

export interface GraffitiMaterialHandle {
  material: THREE.MeshStandardMaterial;
  setProgress: (v: number) => void;
  setMap: (map: THREE.Texture) => void;
  /** extra light the paint gives off, over its resting glow — the landing flare */
  setFlare: (v: number) => void;
  dispose: () => void;
}

export function makeGraffitiMaterial(map: THREE.Texture | null): GraffitiMaterialHandle {
  const uProgress = { value: 0 };
  const uEdge = { value: new THREE.Color("#d6ff5a") };

  const material = new THREE.MeshStandardMaterial({
    ...(map ? { map } : null),
    transparent: true,
    roughness: 0.95,
    metalness: 0,
    // The piece lights itself a little, from its own pixels. Lit only by the
    // scene, a white fill came out of the dusk grade pink and a cyan one grey —
    // the player's colours were being repainted by the street lamps. A share
    // of each texel's own colour on top keeps them the colours that were
    // chosen in the editor, without turning the wall into a screen.
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: ART_GLOW,
    ...(map ? { emissiveMap: map } : null),
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uProgress = uProgress;
    shader.uniforms.uEdge = uEdge;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", COMMON)
      .replace("#include <map_fragment>", MAP_FRAGMENT)
      .replace("#include <dithering_fragment>", DITHERING);
  };
  // keep three from handing us the plain MeshStandardMaterial program
  material.customProgramCacheKey = () => "neon-walls-graffiti-v4";

  return {
    material,
    setProgress: (v) => {
      uProgress.value = v;
    },
    setMap: (next) => {
      material.map = next;
      material.emissiveMap = next;
      material.needsUpdate = true;
    },
    setFlare: (v) => {
      material.emissiveIntensity = ART_GLOW + v;
    },
    dispose: () => {
      material.dispose();
    },
  };
}

/** Loads a data URL into a texture ready to hang on a wall. */
export function textureFromDataUrl(
  dataUrl: string,
  onReady?: (t: THREE.Texture) => void,
): THREE.Texture {
  const tex = new THREE.TextureLoader().load(dataUrl, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    onReady?.(t);
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
