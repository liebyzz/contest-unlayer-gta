"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Dumpster, ParkedCar, Roadblock, StreetLight } from "@/lib/game/city";
import { createCar } from "@/lib/game/carModel";
import { LightPool } from "./LightPool";
import { lightShaftMaterial } from "@/lib/game/lightShaft";
import { roundedBox } from "@/lib/game/geometry";

const DARK = new THREE.MeshStandardMaterial({ color: "#16151b", roughness: 0.85, metalness: 0.3 });
const METAL = new THREE.MeshStandardMaterial({ color: "#2c2b33", roughness: 0.5, metalness: 0.7 });
const RUBBER = new THREE.MeshStandardMaterial({ color: "#0c0c0f", roughness: 1 });
/* ── street light ────────────────────────────────────────────────────────── */
export function StreetLightProp({ l }: { l: StreetLight }) {
  const lampMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(l.colour).multiplyScalar(2.4),
        toneMapped: false,
      }),
    [l.colour],
  );
  const hazeMaterial = useMemo(() => lightShaftMaterial(l.colour, 0.42), [l.colour]);

  return (
    <group position={[l.x, 0, l.z]} rotation={[0, l.rot, 0]}>
      <mesh position={[0, 0.15, 0]} material={DARK} castShadow>
        <cylinderGeometry args={[0.28, 0.34, 0.3, 8]} />
      </mesh>
      <mesh position={[0, 3.2, 0]} material={METAL} castShadow>
        <cylinderGeometry args={[0.11, 0.16, 6.4, 8]} />
      </mesh>
      {/* the arm reaching over the road */}
      <mesh position={[0, 6.3, 0.9]} rotation={[Math.PI / 2.6, 0, 0]} material={METAL} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 2.1, 8]} />
      </mesh>
      <mesh position={[0, 6.72, 1.75]} material={DARK} castShadow>
        <primitive object={roundedBox(0.5, 0.22, 1.0, 0.04)} attach="geometry" />
      </mesh>
      <mesh position={[0, 6.58, 1.75]} rotation={[Math.PI / 2, 0, 0]} material={lampMaterial}>
        <planeGeometry args={[0.42, 0.86]} />
      </mesh>
      {/* volumetric-ish haze cone */}
      <mesh position={[0, 3.4, 1.75]} material={hazeMaterial} renderOrder={3}>
        <coneGeometry args={[2.4, 6.4, 20, 1, true]} />
      </mesh>
      <LightPool position={[0, 0.17, 1.75]} size={8.5} colour={l.colour} opacity={0.2} />
    </group>
  );
}

/* ── vehicles ────────────────────────────────────────────────────────────── */
/**
 * Parked cars are built by the same factory as the moving traffic. They used
 * to be a separate pile of raw boxes, which is why a car at the kerb looked
 * like a different object from one driving past it.
 */
export function VehicleProp({ c }: { c: ParkedCar }) {
  const model = useMemo(() => createCar(c.kind, c.body), [c.kind, c.body]);

  useEffect(() => {
    // parked, so no headlights burning a hole in the pavement
    model.beam.visible = false;
    model.headlight.visible = false;
    for (const b of model.brake) {
      (b.material as THREE.MeshBasicMaterial).opacity = 0.25;
    }
  }, [model]);

  return (
    <group position={[c.x, 0, c.z]} rotation={[0, c.rot, 0]}>
      <primitive object={model.root} />
    </group>
  );
}

/* ── dumpster ────────────────────────────────────────────────────────────── */
export function DumpsterProp({ d }: { d: Dumpster }) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: d.colour, roughness: 0.75, metalness: 0.35 }),
    [d.colour],
  );
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, 0.72, 0]} material={material} castShadow receiveShadow>
        <primitive object={roundedBox(2.2, 1.25, 1.4, 0.07)} attach="geometry" />
      </mesh>
      <mesh position={[0, 1.4, -0.1]} rotation={[-0.12, 0, 0]} material={DARK} castShadow>
        <primitive object={roundedBox(2.24, 0.1, 1.5, 0.04)} attach="geometry" />
      </mesh>
      {[-0.9, 0.9].map((x) =>
        [-0.6, 0.6].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.12, z]} material={RUBBER}>
            <cylinderGeometry args={[0.12, 0.12, 0.1, 8]} />
          </mesh>
        )),
      )}
    </group>
  );
}

/* ── roadblock sealing the map edge ──────────────────────────────────────── */
export function RoadblockProp({ r }: { r: Roadblock }) {
  const count = Math.max(2, Math.round(r.length / 2.1));
  const barriers = Array.from({ length: count }, (_, i) => -r.length / 2 + 1.05 + i * 2.1);
  return (
    <group position={[r.x, 0, r.z]} rotation={[0, r.rot, 0]}>
      {barriers.map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
            <primitive object={roundedBox(1.95, 0.84, 0.62, 0.06)} attach="geometry" />
            <meshStandardMaterial color="#8a857c" roughness={1} />
          </mesh>
          <mesh position={[0, 0.88, 0]}>
            <boxGeometry args={[1.95, 0.1, 0.34]} />
            <meshBasicMaterial color={i % 2 ? "#ff8b3d" : "#efe7d8"} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* chain-link above the barriers */}
      <mesh position={[0, 1.9, 0]}>
        <planeGeometry args={[r.length, 2.0]} />
        <meshBasicMaterial color="#6f7a86" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 2.92, 0]} material={METAL}>
        <boxGeometry args={[r.length, 0.08, 0.08]} />
      </mesh>
      {/* warning beacon */}
      <mesh position={[r.length / 2 - 0.4, 1.1, 0]}>
        <sphereGeometry args={[0.14, 10, 10]} />
        <meshBasicMaterial color="#ff6a1f" toneMapped={false} />
      </mesh>
      <LightPool position={[0, 0.17, 0.9]} size={6} colour="#ff8b3d" opacity={0.16} />
    </group>
  );
}
