"use client";

import { useCallback, useMemo } from "react";
import * as THREE from "three";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  N8AO,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";

/** The two N8AO knobs its React wrapper doesn't expose. */
type AOPass = {
  autoDetectTransparency: boolean;
  configuration: { transparencyAware: boolean };
};

/** Neon needs bloom. Everything else here is restraint. */
export function Effects() {
  const aberration = useMemo(() => new THREE.Vector2(0.00055, 0.00075), []);
  // N8AO notices the scene has transparent materials — every pool of lamplight
  // does — and switches itself into a mode that walks the whole scene graph
  // four times and renders it twice more every frame, shadow map included, so
  // AO can sit correctly under glass. Measured: three hundred draw calls a
  // frame, for a difference under additive light that nobody can see.
  //
  // A callback ref, because the composer mounts its passes after this
  // component's own effects have run.
  const tameAO = useCallback((pass: AOPass | null) => {
    if (!pass) return;
    pass.autoDetectTransparency = false;
    // flipped through true so the pass sees a change and rebuilds without it
    pass.configuration.transparencyAware = true;
    pass.configuration.transparencyAware = false;
  }, []);

  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      {/* Ambient occlusion, before anything else touches the image.
          This is the single biggest thing separating "a stylised city" from
          "a pile of coloured boxes": without it nothing has a contact shadow,
          so walls float off the pavement, alcoves are as bright as the wall
          they are cut into and the whole scene reads as flat-shaded voxels.
          Half resolution keeps it around a millisecond. */}
      <N8AO
        ref={tameAO as never}
        halfRes
        quality="medium"
        aoRadius={1.1}
        distanceFalloff={0.7}
        intensity={1.5}
        color="#120c1c"
        denoiseSamples={6}
      />
      <Bloom
        intensity={0.62}
        luminanceThreshold={0.45}
        luminanceSmoothing={0.3}
        mipmapBlur
        radius={0.68}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={aberration}
        radialModulation
        modulationOffset={0.42}
      />
      {/* The composer switches the renderer to NoToneMapping and expects to do
          it here instead — without this the scene is a clipped linear image,
          which is what "washed out and pink" looks like. */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* There is a second vignette in CSS over the top of this one; between
          them the corners of the frame were going to black and taking the ends
          of the street with them. */}
      <Vignette offset={0.32} darkness={0.58} eskil={false} />
    </EffectComposer>
  );
}
