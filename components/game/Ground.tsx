"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { MeshReflectorMaterial } from "@react-three/drei";
import { ALLEY, VACANT_LOT } from "@/lib/game/city";
import {
  asphaltTexture,
  concreteTexture,
  dirtTexture,
  matchRepeat,
  normalFromTexture,
} from "@/lib/game/facades";

/** Rectangles of pavement, [x0, x1, z0, z1]. */
const SIDEWALKS: [number, number, number, number][] = [
  [-46, 16, -8, -5],
  [24.5, 44, -8, -5],
  [-46, 16, 5, 8],
  [24.5, 44, 5, 8],
  [13.4, 16, -28, -8],
  [13.4, 16, 8, 36],
  [24.5, 27, -28, -8],
  [24.5, 27, 8, 36],
];

const KERB_MATERIAL = new THREE.MeshStandardMaterial({ color: "#3a3842", roughness: 0.95 });
const ROAD_RELIEF = new THREE.Vector2(0.55, 0.55);
const PAVEMENT_RELIEF = new THREE.Vector2(0.7, 0.7);

function dashTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 16);
  ctx.fillStyle = "#d8d2b8";
  ctx.fillRect(0, 3, 74, 10);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function RoadLine({
  from,
  to,
  axis,
  at,
  width = 0.16,
}: {
  from: number;
  to: number;
  axis: "x" | "z";
  at: number;
  width?: number;
}) {
  const length = to - from;
  const texture = useMemo(() => {
    const t = dashTexture();
    t.repeat.set(length / 5.6, 1);
    return t;
  }, [length]);

  return (
    <mesh
      position={axis === "x" ? [(from + to) / 2, 0.016, at] : [at, 0.016, (from + to) / 2]}
      rotation={axis === "x" ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, Math.PI / 2]}
      renderOrder={1}
    >
      <planeGeometry args={[length, width * 6]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.42}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

export function Ground() {
  const asphalt = useMemo(() => {
    const t = asphaltTexture().clone();
    t.repeat.set(28, 28);
    t.needsUpdate = true;
    return t;
  }, []);

  // Grain on the road matters more than grain anywhere else: it is the largest
  // surface on screen and the one every street lamp rakes across.
  const asphaltNormal = useMemo(() => matchRepeat(normalFromTexture(asphalt, 1.6), asphalt), [asphalt]);

  const pavement = useMemo(() => {
    const t = concreteTexture();
    return t;
  }, []);

  const pavementNormal = useMemo(() => normalFromTexture(pavement, 1.9), [pavement]);

  const dirt = useMemo(() => {
    const t = dirtTexture().clone();
    t.repeat.set(5, 4);
    t.needsUpdate = true;
    return t;
  }, []);

  return (
    <group>
      {/* wet road — the one reflective surface in the scene, and it does a lot
          of the heavy lifting for the after-the-rain look */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[260, 260]} />
        <MeshReflectorMaterial
          map={asphalt}
          resolution={256}
          mirror={0.34}
          mixBlur={1.15}
          mixStrength={2.1}
          blur={[240, 60]}
          depthScale={1.15}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          normalMap={asphaltNormal ?? undefined}
          normalScale={ROAD_RELIEF}
          roughness={0.74}
          metalness={0.32}
          color="#2b2934"
        />
      </mesh>

      <RoadLine from={-44} to={13} axis="x" at={0} />
      <RoadLine from={27} to={42} axis="x" at={0} />
      <RoadLine from={-26} to={-8} axis="z" at={20.25} />
      <RoadLine from={8} to={34} axis="z" at={20.25} />

      {/* pavements */}
      {SIDEWALKS.map(([x0, x1, z0, z1], i) => {
        const w = x1 - x0;
        const d = z1 - z0;
        const map = pavement.clone();
        map.repeat.set(w / 3, d / 3);
        map.needsUpdate = true;
        return (
          <group key={i}>
            <mesh position={[(x0 + x1) / 2, 0.075, (z0 + z1) / 2]} receiveShadow>
              <boxGeometry args={[w, 0.15, d]} />
              <meshStandardMaterial
                map={map}
                normalMap={matchRepeat(pavementNormal, map) ?? undefined}
                normalScale={PAVEMENT_RELIEF}
                roughness={0.94}
                metalness={0.02}
              />
            </mesh>
            {/* kerb line so the edge catches the light */}
            <mesh position={[(x0 + x1) / 2, 0.155, (z0 + z1) / 2]}>
              <boxGeometry args={[w + 0.06, 0.02, d + 0.06]} />
              <primitive object={KERB_MATERIAL} attach="material" />
            </mesh>
          </group>
        );
      })}

      {/* the vacant lot behind the hoarding */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(VACANT_LOT.x0 + VACANT_LOT.x1) / 2, 0.03, (VACANT_LOT.z0 + VACANT_LOT.z1) / 2]}
        receiveShadow
      >
        <planeGeometry args={[VACANT_LOT.x1 - VACANT_LOT.x0, VACANT_LOT.z1 - VACANT_LOT.z0]} />
        <meshStandardMaterial map={dirt} roughness={1} />
      </mesh>

      {/* a slick of standing water down the alley */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(ALLEY.x0 + ALLEY.x1) / 2, 0.012, (ALLEY.z0 + ALLEY.z1) / 2]}
        renderOrder={1}
      >
        <planeGeometry args={[ALLEY.x1 - ALLEY.x0 - 1.2, ALLEY.z1 - ALLEY.z0 - 3]} />
        <meshBasicMaterial color="#0a1620" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}
