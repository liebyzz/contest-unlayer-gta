"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GRAFFITI_SPOTS } from "@/lib/graffiti/spots";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { playerState } from "@/lib/game/playerState";
import { player } from "@/lib/game/world";

/**
 * A chevron on the pavement at the player's feet that points at the nearest
 * wall they haven't hit yet.
 *
 * It used to hover at head height with depth testing off, which from the
 * follow camera put it squarely over the middle of whatever wall was ahead —
 * including the piece you had just painted. Down at ankle height, orbiting the
 * character, it reads like a sat-nav arrow and never covers the art.
 *
 * Fourteen spots across four streets is more than you can hold in your head,
 * and the radar only helps if you stop and read it. This is the thing you
 * follow while you are running.
 *
 * It stands down the moment you are close enough to paint — at that point the
 * marker on the wall is doing the job and a second arrow is just clutter.
 */
const HIDE_WITHIN = 7;
/** How much closer a rival wall has to be before the arrow abandons its target. */
const LOCK_MARGIN = 9;

function chevron(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.42);
  shape.lineTo(0.4, -0.16);
  shape.lineTo(0.14, -0.16);
  shape.lineTo(0.14, -0.42);
  shape.lineTo(-0.14, -0.42);
  shape.lineTo(-0.14, -0.16);
  shape.lineTo(-0.4, -0.16);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  // Laid flat with the nose along +Z, which is the axis rotation.y measures
  // from. Rotating the other way puts the nose on −Z and the arrow then points
  // exactly 180° away from wherever you are meant to be going.
  geo.rotateX(Math.PI / 2);
  return geo;
}

export function Waypoint() {
  const group = useRef<THREE.Group>(null);
  const arrow = useRef<THREE.Mesh>(null);
  const painted = useGraffiti((s) => s.painted);
  const phase = useGraffiti((s) => s.phase);
  const arrived = useGraffiti((s) => s.arrived);
  const photoMode = useGraffiti((s) => s.photoMode);

  const geometry = useMemo(() => chevron(), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#c8ff32",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // recomputed only when something actually gets painted
  const remaining = useMemo(
    () => GRAFFITI_SPOTS.filter((s) => !painted[s.id]),
    [painted],
  );

  const shown = useRef(0);
  const locked = useRef<string | null>(null);

  useFrame((state, rawDelta) => {
    const g = group.current;
    const a = arrow.current;
    if (!g || !a) return;

    const live =
      phase === "playing" && arrived && !photoMode && !player.dead && remaining.length > 0;

    const distanceTo = (s: (typeof GRAFFITI_SPOTS)[number]) =>
      Math.hypot(playerState.x - s.position[0], playerState.z - s.position[2]);

    let target: (typeof GRAFFITI_SPOTS)[number] | null = null;
    let nearestDistance = Infinity;

    if (live) {
      let nearest: (typeof GRAFFITI_SPOTS)[number] | null = null;
      for (const s of remaining) {
        const d = distanceTo(s);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = s;
        }
      }

      if (nearestDistance <= HIDE_WITHIN) {
        // Standing at a wall. Whichever wall it is, the marker on it is doing
        // the job — drop the arrow and forget the target, so walking away
        // re-acquires honestly instead of pointing back at wherever we were
        // headed before.
        locked.current = null;
        target = null;
      } else {
        // Otherwise follow one wall all the way in. Re-picking the nearest spot
        // every frame meant that walking towards one could bring another inside
        // it and the arrow would swing away just as you arrived, which has you
        // chasing it in circles.
        target = remaining.find((s) => s.id === locked.current) ?? null;
        if (target && distanceTo(target) > nearestDistance + LOCK_MARGIN) target = null;
        if (!target) target = nearest;
        locked.current = target?.id ?? null;
      }
    } else {
      locked.current = null;
    }

    // fade rather than pop, and stand down once the wall marker takes over
    const want = target ? 1 : 0;
    shown.current += (want - shown.current) * Math.min(1, rawDelta * 7);
    material.opacity = shown.current * 0.9;
    g.visible = shown.current > 0.01;
    if (!g.visible || !target) return;

    const t = state.clock.elapsedTime;
    const heading = Math.atan2(
      target.position[0] - playerState.x,
      target.position[2] - playerState.z,
    );
    // clear of the feet, and above the kerb so the pavement never swallows it
    const orbit = 1.3 + Math.sin(t * 3.2) * 0.08;
    g.position.set(
      playerState.x + Math.sin(heading) * orbit,
      0.26,
      playerState.z + Math.cos(heading) * orbit,
    );
    g.rotation.y = heading;
    a.rotation.x = 0;
    const s = 0.95 + Math.sin(t * 3.2) * 0.05;
    a.scale.set(s, s, s);
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={arrow} geometry={geometry} material={material} renderOrder={30} />
    </group>
  );
}
