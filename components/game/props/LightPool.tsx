"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { glowTexture } from "@/lib/game/facades";

/**
 * A soft additive disc laid on the ground.
 *
 * The scene runs on two real lights; every lamp, sign and window "lights" the
 * street with one of these instead. Costs a quad, survives bloom beautifully,
 * and keeps the shader budget for the graffiti.
 */
export function LightPool({
  position,
  size,
  colour,
  opacity = 0.4,
  rotation,
}: {
  position: [number, number, number];
  size: number;
  colour: string;
  opacity?: number;
  rotation?: [number, number, number];
}) {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: new THREE.Color(colour),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [colour, opacity],
  );

  return (
    <mesh
      position={position}
      rotation={rotation ?? [-Math.PI / 2, 0, 0]}
      material={material}
      renderOrder={2}
    >
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
