"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { GRAFFITI_SPOTS, SPOT_BY_ID, spotNormal } from "@/lib/graffiti/spots";
import type { GraffitiSpot as Spot } from "@/lib/graffiti/graffitiTypes";
import { wallPreview } from "@/lib/game/wallPreview";
import { revealEyes } from "@/lib/game/revealShot";

/** Anything bigger than this is architecture, and taking it away would show. */
const MAX_RADIUS = 5.5;
/**
 * How far in front of the wall something has to stand before it counts as in
 * the way. Facade detail flush with the wall is part of the picture.
 */
const STAND_OFF = 0.45;

/**
 * The pyramid between the reveal lens and the piece, shared with the crowd.
 *
 * People are never hidden wholesale, but someone squaring up to the writer is
 * not a passer-by admiring the work. In STORY the Kings are roused the moment a
 * piece lands, and whoever was nearest the wall turns round and points a pistol
 * across the middle of the shot — which is also the photograph the black book
 * keeps. `People` reads this and takes only those out of the frame.
 */
export const revealView = {
  active: false,
  frustum: new THREE.Frustum(),
};

/** Marks a subtree the clearance must never hide — people, the writer, the walls. */
export function keepInReveal(object: THREE.Object3D) {
  object.userData.nwKeep = true;
}

const corners = Array.from({ length: 4 }, () => new THREE.Vector3());
const centre = new THREE.Vector3();
const inside = new THREE.Vector3();
const normal = new THREE.Vector3();

/**
 * The pyramid from a lens at `eye` to the four corners of a piece, stopped a
 * little proud of the wall — whatever is inside it is between the camera and
 * the work.
 */
export function revealPyramid(spot: Spot, eye: THREE.Vector3, frustum: THREE.Frustum) {
  const planes = frustum.planes;
  const n = spotNormal(spot);
  // a little wider than the piece, so nothing clips its edge either
  const w = spot.size[0] * 0.56;
  const h = spot.size[1] * 0.56;
  const [px, py, pz] = spot.position;
  ([
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ] as const).forEach(([u, v], i) => {
    corners[i].set(px + n[2] * u * w, py + v * h, pz - n[0] * u * w);
  });
  normal.set(n[0], 0, n[2]);
  // the middle of the piece, on the wall
  centre.set(px, py, pz);
  inside.copy(centre).addScaledVector(normal, 1);

  for (let i = 0; i < 4; i++) {
    planes[i].setFromCoplanarPoints(eye, corners[i], corners[(i + 1) % 4]);
    // every side faces into the pyramid: a metre off the middle of the piece is inside it
    if (planes[i].distanceToPoint(inside) < 0) planes[i].negate();
  }
  // the far face: a little proud of the wall, so facade detail flush with it stays
  planes[4].setFromNormalAndCoplanarPoint(normal, inside.copy(centre).addScaledVector(normal, STAND_OFF));
  // the near face: the lens itself, looking at the wall
  planes[5].setFromNormalAndCoplanarPoint(inside.copy(normal).negate(), eye);
  return frustum;
}

let everyShot: THREE.Frustum[] | null = null;

/**
 * Could this ever be lifted out of a reveal?
 *
 * The same test the clearance runs live, asked once up front against every
 * spot and every place its camera can stand. The city's static batching uses
 * it to leave those props as separate objects, since a batch cannot hide one
 * lamp post out of fifty.
 */
export function mayClearForReveal(box: THREE.Box3, radius: number) {
  if (radius > MAX_RADIUS) return false;
  everyShot ??= GRAFFITI_SPOTS.flatMap((spot) =>
    revealEyes(spot).map((eye) => revealPyramid(spot, new THREE.Vector3(...eye), new THREE.Frustum())),
  );
  return everyShot.some((f) => f.intersectsBox(box));
}

function kept(object: THREE.Object3D | null) {
  for (let o = object; o; o = o.parent) if (o.userData.nwKeep) return true;
  return false;
}

/**
 * A clear line of sight for the reveal.
 *
 * The reveal camera stands back from the wall and off to one side, which on a
 * street puts a lamp post or a parked car between the lens and the piece more
 * often than not — and this shot is also the photograph that goes in the black
 * book. Whatever small thing stands inside the pyramid between the lens and
 * the four corners of the piece steps out of the frame for the few seconds the
 * camera is there, and comes straight back afterwards.
 *
 * A pyramid rather than a few rays: a lamp post is fifteen centimetres wide,
 * and five rays across a five-metre wall walk straight past it.
 *
 * People are never taken out: the passers-by who stop to look at the piece are
 * the best thing that can be in that picture.
 */
export function RevealClearance() {
  const { camera, scene } = useThree();
  const hidden = useRef(new Set<THREE.Object3D>());
  const frame = useRef(0);
  const clearedFor = useRef<string | null>(null);
  const work = useMemo(
    () => ({
      frustum: new THREE.Frustum(),
      box: new THREE.Box3(),
      sphere: new THREE.Sphere(),
    }),
    [],
  );

  // Priority 0.6: after the follow camera (0) and the studio's street-view
  // lens (0.5) have both had their say about where the camera is this frame.
  useFrame(() => {
    const { phase, revealSpotId, tourStops, tourBeat } = useGraffiti.getState();
    // The studio's live street view is the same shot, so it gets the same
    // clear line of sight — measured only on the frames it is actually drawn.
    // So does each wall the city tour lands on, once the camera is down: in
    // flight the pyramid from the lens runs across half the district.
    const id =
      phase === "reveal"
        ? revealSpotId
        : phase === "editor"
          ? wallPreview.spotId
          : phase === "tour" && tourBeat.holding
            ? (tourStops[tourBeat.stop] ?? null)
            : null;
    const spot = id ? SPOT_BY_ID.get(id) : undefined;

    // the tour moves from wall to wall: what stood in front of the last one comes back
    if (id !== clearedFor.current && hidden.current.size) {
      for (const o of hidden.current) o.visible = true;
      hidden.current.clear();
    }
    clearedFor.current = id;

    if (!spot) {
      revealView.active = false;
      if (hidden.current.size) {
        for (const o of hidden.current) o.visible = true;
        hidden.current.clear();
      }
      frame.current = 0;
      return;
    }
    if (phase === "editor") {
      if (!wallPreview.framing) return;
    } else if (frame.current++ % 5 !== 0) {
      // a few times a second is plenty for a camera gliding into a fixed spot
      return;
    }

    const { frustum, box, sphere } = work;
    revealPyramid(spot, camera.position, frustum);
    revealView.frustum.copy(frustum);
    revealView.active = true;

    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || hidden.current.has(o)) return;
      const geometry = mesh.geometry;
      if (!geometry) return;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingBox || !geometry.boundingSphere) return;
      sphere.copy(geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      if (sphere.radius > MAX_RADIUS) return;
      // a box, not a sphere: a sphere round an awning is the size of a car
      box.copy(geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (!frustum.intersectsBox(box)) return;
      if (kept(o)) return;
      o.visible = false;
      hidden.current.add(o);
    });
  }, 0.6);

  return null;
}
