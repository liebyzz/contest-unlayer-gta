"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Building } from "@/lib/game/city";
import { facadeTexture, matchRepeat, normalFromTexture, signTexture } from "@/lib/game/facades";
import { roundedBox, taperedBox } from "@/lib/game/geometry";
import { GRAFFITI_SPOTS } from "@/lib/graffiti/spots";
import { LightPool } from "./LightPool";

const ROOF_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#1b1a22",
  roughness: 1,
  metalness: 0,
});
const STONE = new THREE.MeshStandardMaterial({ color: "#2a2731", roughness: 0.9 });
const CORNICE = new THREE.MeshStandardMaterial({ color: "#312c38", roughness: 0.85 });
const TRIM_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#15131a",
  roughness: 0.7,
  metalness: 0.3,
});
const IRON = new THREE.MeshStandardMaterial({
  color: "#232028",
  roughness: 0.6,
  metalness: 0.55,
});

/** Which way a shopfront looks, as [x, z] offset from centre and a Y rotation. */
function faceTransform(b: Building) {
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  switch (b.shopFace) {
    case "south":
      return { pos: [0, 0, d / 2] as const, rotY: 0, span: w };
    case "north":
      return { pos: [0, 0, -d / 2] as const, rotY: Math.PI, span: w };
    case "east":
      return { pos: [w / 2, 0, 0] as const, rotY: Math.PI / 2, span: d };
    case "west":
      return { pos: [-w / 2, 0, 0] as const, rotY: -Math.PI / 2, span: d };
    default:
      return null;
  }
}

/**
 * The top edge of any paintable surface that sits across this building's
 * shopfront, or null if the shopfront is clear.
 *
 * Several of the best walls on the block are shop fronts, and the shop used to
 * be built straight through them: lit windows and mullions poking out of the
 * middle of the player's piece, an awning slung across it at head height. A
 * shop with a piece over its front is a shop that has closed for the night.
 */
function spotAcrossShop(b: Building): number | null {
  const shop = faceTransform(b);
  if (!shop) return null;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const reach = Math.min(shop.span * 0.8, 9.2) / 2;
  let top: number | null = null;
  for (const s of GRAFFITI_SPOTS) {
    const [sx, sy, sz] = s.position;
    const half = s.size[0] / 2;
    if (b.shopFace === "south" || b.shopFace === "north") {
      const faceZ = b.shopFace === "south" ? b.z1 : b.z0;
      if (Math.abs(sz - faceZ) > 0.6 || Math.abs(sx - cx) > reach + half) continue;
    } else {
      const faceX = b.shopFace === "east" ? b.x1 : b.x0;
      if (Math.abs(sx - faceX) > 0.6 || Math.abs(sz - cz) > reach + half) continue;
    }
    const edge = sy + s.size[1] / 2;
    top = top === null ? edge : Math.max(top, edge);
  }
  return top;
}

export function BuildingMesh({ b, detailed = true }: { b: Building; detailed?: boolean }) {
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const h = b.height;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;

  const materials = useMemo(() => {
    const facade = facadeTexture(b.style, b.tint);
    // brick wants deeper mortar than a poured-concrete panel does
    const relief = b.style === "brick" ? 0.85 : b.style === "panel" ? 0.6 : 0.45;
    const normal = normalFromTexture(facade.map, 2.6);
    const face = (uMetres: number, vMetres: number) => {
      const map = facade.map.clone();
      map.repeat.set(uMetres / 8, vMetres / 8);
      map.needsUpdate = true;
      const emissiveMap = facade.emissive.clone();
      emissiveMap.repeat.copy(map.repeat);
      emissiveMap.needsUpdate = true;
      return new THREE.MeshStandardMaterial({
        map,
        emissiveMap,
        normalMap: matchRepeat(normal, map),
        normalScale: new THREE.Vector2(relief, relief),
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 1.25,
        roughness: 0.88,
        metalness: 0.03,
      });
    };
    const side = face(d, h);
    const front = face(w, h);
    // +X, -X, +Y, -Y, +Z, -Z
    return [side, side.clone(), ROOF_MATERIAL, ROOF_MATERIAL, front, front.clone()];
  }, [b.style, b.tint, w, d, h]);

  const shop = detailed && b.shopName ? faceTransform(b) : null;
  const pieceTop = useMemo(
    () => (detailed && b.shopName ? spotAcrossShop(b) : null),
    [b, detailed],
  );
  const closed = b.shuttered || pieceTop !== null;
  // the awning clears the top of the piece, and the sign goes up with it
  const awningY = Math.max(3.3, (pieceTop ?? 0) + 0.45);
  const sign = useMemo(
    () => (b.shopName ? signTexture(b.shopName, b.neon ?? "#c8ff32") : null),
    [b.shopName, b.neon],
  );

  // string courses every few floors — the single biggest "this is architecture,
  // not a voxel" cue you can add for one thin box each
  const courses = useMemo(() => {
    if (!detailed) return [];
    const out: number[] = [];
    for (let y = 5.2; y < h - 2.2; y += 4.6) out.push(y);
    return out;
  }, [h, detailed]);

  const setback = detailed && h > 15;

  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, h / 2, 0]} material={materials} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
      </mesh>

      {/* ground-floor plinth: heavier stone, slightly proud of the facade */}
      <mesh position={[0, 0.85, 0]} material={STONE} castShadow receiveShadow>
        <primitive object={roundedBox(w + 0.24, 1.7, d + 0.24, 0.08)} attach="geometry" />
      </mesh>

      {/* string courses */}
      {courses.map((y) => (
        <mesh key={y} position={[0, y, 0]} material={CORNICE} castShadow>
          <primitive object={roundedBox(w + 0.16, 0.16, d + 0.16, 0.04)} attach="geometry" />
        </mesh>
      ))}

      {/* corner pilasters break up the flat faces */}
      {detailed &&
        ([
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const).map(([sx, sz], i) => (
          <mesh
            key={i}
            position={[(sx * w) / 2, h / 2, (sz * d) / 2]}
            material={CORNICE}
            castShadow
          >
            <primitive object={roundedBox(0.42, h, 0.42, 0.08)} attach="geometry" />
          </mesh>
        ))}

      {/* cornice + parapet */}
      <mesh position={[0, h - 0.35, 0]} material={CORNICE} castShadow>
        <primitive
          object={taperedBox(w + 0.8, 0.7, d + 0.8, (w + 0.2) / (w + 0.8), (d + 0.2) / (d + 0.8), 0.06)}
          attach="geometry"
        />
      </mesh>
      <mesh position={[0, h + 0.3, 0]} material={ROOF_MATERIAL} castShadow>
        <primitive object={roundedBox(w + 0.3, 0.62, d + 0.3, 0.09)} attach="geometry" />
      </mesh>

      {/* a stepped-back upper storey on the tall ones */}
      {setback && (
        <>
          <mesh position={[0, h + 2.1, 0]} material={materials[4]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.62, 3.2, d * 0.62]} />
          </mesh>
          <mesh position={[0, h + 3.85, 0]} material={CORNICE} castShadow>
            <primitive object={roundedBox(w * 0.68, 0.4, d * 0.68, 0.06)} attach="geometry" />
          </mesh>
        </>
      )}

      {detailed && b.roof === "units" && (
        <>
          <mesh position={[w * 0.2, h + 1.2, d * 0.15]} material={TRIM_MATERIAL} castShadow>
            <primitive object={roundedBox(2.6, 1.4, 2.2, 0.12)} attach="geometry" />
          </mesh>
          <mesh position={[-w * 0.25, h + 1.0, -d * 0.2]} material={TRIM_MATERIAL} castShadow>
            <primitive object={roundedBox(1.8, 1.0, 1.8, 0.1)} attach="geometry" />
          </mesh>
          <mesh position={[w * 0.05, h + 2.1, -d * 0.3]} material={TRIM_MATERIAL} castShadow>
            <cylinderGeometry args={[0.22, 0.22, 3.2, 10]} />
          </mesh>
        </>
      )}

      {detailed && b.roof === "tank" && (
        <group position={[w * 0.15, h + 0.3, -d * 0.1]}>
          <mesh position={[0, 2.4, 0]} castShadow material={TRIM_MATERIAL}>
            <cylinderGeometry args={[1.5, 1.5, 2.6, 14]} />
          </mesh>
          <mesh position={[0, 3.9, 0]} castShadow material={TRIM_MATERIAL}>
            <coneGeometry args={[1.58, 0.75, 14]} />
          </mesh>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <mesh
                key={`${sx}${sz}`}
                position={[sx * 1.1, 0.55, sz * 1.1]}
                material={TRIM_MATERIAL}
              >
                <cylinderGeometry args={[0.09, 0.09, 1.1, 6]} />
              </mesh>
            )),
          )}
        </group>
      )}

      {/* a fire escape zig-zagging up one flank */}
      {detailed && b.style === "brick" && h > 9 && (
        <group position={[w / 2 + 0.55, 0, 0]}>
          {[3.4, 6.2, 9.0].filter((y) => y < h - 1).map((y) => (
            <group key={y}>
              <mesh position={[0, y, 0]} material={IRON} castShadow>
                <primitive object={roundedBox(1.1, 0.09, 3.0, 0.03)} attach="geometry" />
              </mesh>
              <mesh position={[-0.5, y + 0.55, 0]} material={IRON}>
                <primitive object={roundedBox(0.06, 1.1, 3.0, 0.02)} attach="geometry" />
              </mesh>
              <mesh position={[0.1, y + 1.4, 1.2]} rotation={[0.7, 0, 0]} material={IRON}>
                <primitive object={roundedBox(0.9, 0.06, 2.3, 0.02)} attach="geometry" />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* ground-floor shopfront */}
      {shop && sign && (
        <group position={[shop.pos[0], 0, shop.pos[2]]} rotation={[0, shop.rotY, 0]}>
          {!closed && (
            <>
              <mesh position={[0, 1.55, 0.2]}>
                <planeGeometry args={[Math.min(shop.span * 0.62, 7), 2.6]} />
                <meshBasicMaterial color="#241609" toneMapped={false} />
              </mesh>
              <mesh position={[0, 1.62, 0.22]}>
                <planeGeometry args={[Math.min(shop.span * 0.56, 6.4), 2.0]} />
                <meshBasicMaterial color="#ffb877" transparent opacity={0.13} toneMapped={false} />
              </mesh>
              {/* mullions turn a lit rectangle into a shop window */}
              {[-1, 0, 1].map((i) => (
                <mesh key={i} position={[i * Math.min(shop.span * 0.19, 2.1), 1.62, 0.24]} material={TRIM_MATERIAL}>
                  <primitive object={roundedBox(0.09, 2.0, 0.08, 0.02)} attach="geometry" />
                </mesh>
              ))}
              <mesh position={[0, 0.35, 0.24]}>
                <planeGeometry args={[Math.min(shop.span * 0.56, 6.4), 0.7]} />
                <meshBasicMaterial color="#0d0b12" toneMapped={false} />
              </mesh>
            </>
          )}

          {/* awning, with a proper drop and a scalloped edge */}
          <mesh
            position={[0, awningY, 0.85]}
            rotation={[-0.3, 0, 0]}
            material={TRIM_MATERIAL}
            castShadow
          >
            <primitive
              object={roundedBox(Math.min(shop.span * 0.8, 9.2), 0.14, 1.6, 0.05)}
              attach="geometry"
            />
          </mesh>
          <mesh position={[0, awningY - 0.28, 1.56]} material={TRIM_MATERIAL}>
            <primitive
              object={roundedBox(Math.min(shop.span * 0.8, 9.2), 0.26, 0.08, 0.03)}
              attach="geometry"
            />
          </mesh>

          {/* the neon */}
          <mesh position={[0, awningY + 1.2, 0.3]}>
            <planeGeometry
              args={[
                Math.min(shop.span * 0.72, 7.4),
                Math.min(shop.span * 0.72, 7.4) / sign.aspect,
              ]}
            />
            <meshBasicMaterial map={sign.texture} transparent toneMapped={false} />
          </mesh>

          <LightPool
            position={[0, 0.18, 2.4]}
            size={Math.min(shop.span, 11)}
            colour={b.neon ?? "#ffb066"}
            opacity={0.2}
          />
        </group>
      )}
    </group>
  );
}
