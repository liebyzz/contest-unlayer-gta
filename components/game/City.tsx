"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { batchStatic } from "@/lib/game/staticBatch";
import { mayClearForReveal } from "./RevealClearance";
import {
  BUILDINGS,
  DUMPSTERS,
  PARKED_CARS,
  ROADBLOCKS,
  SKYLINE,
  STREET_LIGHTS,
  VACANT_LOT,
} from "@/lib/game/city";
import { plankTexture } from "@/lib/game/facades";
import { rivalTag } from "@/lib/graffiti/surfaces";
import { BuildingMesh } from "./props/Building";
import {
  DumpsterProp,
  RoadblockProp,
  StreetLightProp,
  VehicleProp,
} from "./props/StreetProps";
import { LightPool } from "./props/LightPool";
import { roundedBox } from "@/lib/game/geometry";

const CRATE = new THREE.MeshStandardMaterial({ color: "#6b533a", roughness: 0.95 });
const POST = new THREE.MeshStandardMaterial({ color: "#26242c", roughness: 0.7, metalness: 0.5 });
const CONE = new THREE.MeshStandardMaterial({ color: "#d8551f", roughness: 0.8 });

/**
 * Tags left by other writers. None of these are interactive — they exist so
 * the neighbourhood already reads as a graffiti city the second you spawn,
 * and so a fresh spot marker stands out against them.
 */
const AMBIENT_TAGS: {
  pos: [number, number, number];
  rotY: number;
  size: [number, number];
  seed: number;
  opacity: number;
}[] = [
  { pos: [-33, 2.2, -7.9], rotY: 0, size: [3.4, 1.7], seed: 3, opacity: 0.72 },
  { pos: [-9, 1.9, 7.9], rotY: Math.PI, size: [2.6, 1.3], seed: 11, opacity: 0.6 },
  { pos: [-20.35, 3.6, 22], rotY: -Math.PI / 2, size: [3.0, 1.5], seed: 19, opacity: 0.5 },
  { pos: [-27.5, 4.4, 12], rotY: Math.PI / 2, size: [3.4, 1.7], seed: 27, opacity: 0.44 },
  { pos: [13.35, 4.6, 17.5], rotY: Math.PI / 2, size: [2.8, 1.4], seed: 33, opacity: 0.55 },
  { pos: [26.88, 2.3, 11.5], rotY: -Math.PI / 2, size: [3.2, 1.6], seed: 41, opacity: 0.5 },
  { pos: [8, 2.0, 7.9], rotY: Math.PI, size: [2.4, 1.2], seed: 47, opacity: 0.62 },
  { pos: [34, 2.4, -7.88], rotY: 0, size: [3.0, 1.5], seed: 53, opacity: 0.45 },
];

function AmbientTag({ tag }: { tag: (typeof AMBIENT_TAGS)[number] }) {
  const material = useMemo(() => {
    const tex = new THREE.TextureLoader().load(rivalTag(tag.seed, 700, 360));
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      opacity: tag.opacity,
      roughness: 1,
      depthWrite: false,
    });
  }, [tag.seed, tag.opacity]);

  return (
    <mesh position={tag.pos} rotation={[0, tag.rotY, 0]} material={material} renderOrder={1}>
      <planeGeometry args={tag.size} />
    </mesh>
  );
}

/** Plywood hoarding around the vacant lot; the paintable panel sits on it. */
function Hoarding() {
  const material = useMemo(() => {
    const map = plankTexture().clone();
    map.repeat.set(4, 1);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.98 });
  }, []);
  const width = VACANT_LOT.x1 - VACANT_LOT.x0;

  return (
    <group position={[(VACANT_LOT.x0 + VACANT_LOT.x1) / 2, 0, 8.1]}>
      <mesh position={[0, 1.3, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[width, 2.6, 0.18]} />
      </mesh>
      <mesh position={[0, 2.68, 0]}>
        <boxGeometry args={[width + 0.1, 0.14, 0.3]} />
        <meshStandardMaterial color="#2a2229" roughness={0.9} />
      </mesh>
    </group>
  );
}

function AlleyClutter() {
  return (
    <group>
      {/* pallets and crates stacked against the wall */}
      <mesh position={[-26.4, 0.45, 14]} rotation={[0, 0.3, 0]} material={CRATE} castShadow>
        <primitive object={roundedBox(1.1, 0.9, 1.0, 0.055)} attach="geometry" />
      </mesh>
      <mesh position={[-26.5, 1.25, 14.2]} rotation={[0, -0.15, 0]} material={CRATE} castShadow>
        <primitive object={roundedBox(0.9, 0.7, 0.85, 0.05)} attach="geometry" />
      </mesh>
      <mesh position={[-21.4, 0.35, 19]} rotation={[0, 1.2, 0.06]} material={CRATE} castShadow>
        <primitive object={roundedBox(1.2, 0.7, 1.0, 0.05)} attach="geometry" />
      </mesh>
      {/* a leaning pallet */}
      <mesh position={[-26.8, 0.75, 24]} rotation={[0, 0.2, -0.34]} material={CRATE} castShadow>
        <primitive object={roundedBox(1.2, 1.6, 0.1, 0.035)} attach="geometry" />
      </mesh>
      {/* fire escape suggestion on the alley wall */}
      {[3.2, 6.0, 8.8].map((y) => (
        <group key={y}>
          <mesh position={[-20.9, y, 12]} material={POST} castShadow>
            <boxGeometry args={[1.0, 0.08, 3.0]} />
          </mesh>
          <mesh position={[-20.45, y + 0.55, 12]} material={POST}>
            <boxGeometry args={[0.06, 1.1, 3.0]} />
          </mesh>
        </group>
      ))}
      {/* a single sodium light over the dead end */}
      <mesh position={[-24, 5.4, 25.6]}>
        <primitive object={roundedBox(0.7, 0.24, 0.5, 0.05)} attach="geometry" />
        <meshBasicMaterial color="#ffb066" toneMapped={false} />
      </mesh>
      <LightPool position={[-24, 0.14, 24]} size={13} colour="#ffa24d" opacity={0.5} />
      <LightPool position={[-23.5, 0.14, 15]} size={9} colour="#7fb6ff" opacity={0.18} />
    </group>
  );
}

function StreetClutter() {
  const bollards = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -44; x < 12; x += 4.5) out.push([x, 6.4]);
    for (let x = -42; x < 12; x += 5.5) out.push([x, -6.4]);
    return out;
  }, []);

  return (
    <group>
      {bollards.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.55, z]} material={POST} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 0.8, 6]} />
        </mesh>
      ))}
      {[
        [-30.5, 6.5],
        [4.5, -6.4],
        [28.5, 6.4],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.55, z]} material={POST} castShadow>
          <cylinderGeometry args={[0.16, 0.2, 0.85, 8]} />
        </mesh>
      ))}
      {/* cones around a patch of roadworks */}
      {[
        [16.5, -4, 0],
        [18.2, -5.4, 0.4],
        [17.4, -2.4, -0.3],
      ].map(([x, z, r], i) => (
        <mesh key={i} position={[x, 0.28, z]} rotation={[0, r, 0]} material={CONE} castShadow>
          <coneGeometry args={[0.28, 0.56, 8]} />
        </mesh>
      ))}
      {/* fire hydrant */}
      <mesh position={[-16.5, 0.4, 6.3]} castShadow>
        <cylinderGeometry args={[0.16, 0.19, 0.7, 8]} />
        <meshStandardMaterial color="#a8332f" roughness={0.7} />
      </mesh>
    </group>
  );
}

export function City() {
  const root = useRef<THREE.Group>(null);

  // Bake the block's static meshes into a few dozen batches once it is built
  // (see `lib/game/staticBatch.ts`). A passive effect, so it runs after every
  // prop has finished setting itself up — parked cars switch their lamps off
  // in theirs. Props the reveal may have to lift out of shot stay separate.
  useEffect(() => {
    const group = root.current;
    if (!group) return;
    const undo = batchStatic(group, (mesh, box) => {
      const geometry = mesh.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere!.radius * mesh.matrixWorld.getMaxScaleOnAxis();
      return mayClearForReveal(box, radius);
    });
    // nothing on the block moves, so nothing needs its matrix rebuilt every frame
    group.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    return () => {
      group.traverse((o) => {
        o.matrixAutoUpdate = true;
      });
      undo();
    };
  }, []);

  return (
    <group ref={root}>
      {BUILDINGS.map((b) => (
        <BuildingMesh key={b.id} b={b} />
      ))}
      {SKYLINE.map((b) => (
        <BuildingMesh key={b.id} b={b} detailed={false} />
      ))}

      {STREET_LIGHTS.map((l, i) => (
        <StreetLightProp key={i} l={l} />
      ))}
      {PARKED_CARS.map((c, i) => (
        <VehicleProp key={i} c={c} />
      ))}
      {DUMPSTERS.map((d, i) => (
        <DumpsterProp key={i} d={d} />
      ))}
      {ROADBLOCKS.map((r, i) => (
        <RoadblockProp key={i} r={r} />
      ))}

      <Hoarding />
      <AlleyClutter />
      <StreetClutter />

      {AMBIENT_TAGS.map((tag, i) => (
        <AmbientTag key={i} tag={tag} />
      ))}
    </group>
  );
}
