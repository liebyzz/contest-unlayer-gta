/**
 * Vehicles.
 *
 * Each one is a rounded lower body, a tapered greenhouse set back from the
 * nose, chamfered bumpers and a proper sill line — the shapes that make a
 * stylised car read as a car rather than as two stacked crates.
 *
 * Civilian traffic only. The police response is officers on foot; a street
 * this size turns into noise the moment you put a convoy on it.
 */
import * as THREE from "three";
import { roundedBox, taperedBox } from "./geometry";
import type { CarKind } from "./world";
import { CAR_SHAPE, HULL_FLOOR, VAN_FLOOR } from "./carShape";
import { glowTexture } from "./facades";

export interface CarModel {
  root: THREE.Group;
  wheels: THREE.Mesh[];
  brake: THREE.Mesh[];
  headlight: THREE.Object3D;
  beam: THREE.Mesh;
  body: THREE.MeshStandardMaterial;
}

/**
 * Two conventions meet here, and they disagree by a quarter turn.
 *
 * The mesh is modelled nose along **+X** — that's the space `PARKED_CARS.rot`
 * and the collider footprints in `city.ts` are authored in, which is why
 * kerbside cars have always looked right.
 *
 * The simulation, meanwhile, stores a heading where forward is
 * `(sin yaw, cos yaw)` — i.e. **+Z** at yaw 0 — because that is what
 * `Math.atan2(dx, dz)` produces and what every "face where you're going" test
 * in `world.ts` assumes.
 *
 * Anything driven by a simulated heading has to add this offset when it is
 * rendered. Without it the traffic drives at ninety degrees to the way it is
 * pointing.
 */
export const NOSE_OFFSET = -Math.PI / 2;

const RUBBER = new THREE.MeshStandardMaterial({ color: "#0d0d11", roughness: 0.95 });
const RIM = new THREE.MeshStandardMaterial({ color: "#8d8f98", roughness: 0.35, metalness: 0.85 });
const GLASS = new THREE.MeshStandardMaterial({
  color: "#0e1822",
  roughness: 0.08,
  metalness: 0.35,
  transparent: true,
  opacity: 0.82,
});
const TRIM = new THREE.MeshStandardMaterial({ color: "#191920", roughness: 0.55, metalness: 0.5 });

export function createCar(kind: CarKind, colour: string): CarModel {
  const s = CAR_SHAPE[kind];
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.32,
    metalness: 0.22,
  });

  if (kind === "van") {
    const hull = new THREE.Mesh(roundedBox(s.length, s.bodyH, s.width, 0.16), body);
    hull.position.y = VAN_FLOOR + s.bodyH / 2;
    hull.castShadow = true;
    root.add(hull);

    const nose = new THREE.Mesh(
      taperedBox(s.length * 0.22, s.bodyH * 0.52, s.width * 0.99, 0.9, 0.94, 0.08),
      body,
    );
    nose.position.set(s.length * 0.42, VAN_FLOOR + s.bodyH * 0.26, 0);
    nose.castShadow = true;
    root.add(nose);

    const screen = new THREE.Mesh(roundedBox(0.1, 0.56, s.width * 0.8, 0.04), GLASS);
    screen.position.set(s.length * 0.53, VAN_FLOOR + s.bodyH * 0.62, 0);
    root.add(screen);
  } else {
    // lower body, widest at the arches
    const hull = new THREE.Mesh(roundedBox(s.length, s.bodyH, s.width, 0.2), body);
    hull.position.y = HULL_FLOOR + s.bodyH / 2;
    hull.castShadow = true;
    hull.receiveShadow = true;
    root.add(hull);

    // bonnet slopes away from the cabin
    const bonnet = new THREE.Mesh(
      taperedBox(s.length * 0.3, 0.16, s.width * 0.92, 0.88, 0.9, 0.05),
      body,
    );
    bonnet.position.set(s.length * 0.3, HULL_FLOOR + s.bodyH + 0.06, 0);
    root.add(bonnet);

    // the greenhouse: narrower than the body and set back
    const cab = new THREE.Mesh(
      taperedBox(s.cabLen, s.cabH, s.width * 0.9, 0.74, 0.78, 0.07),
      kind === "pickup" ? body : GLASS,
    );
    cab.position.set(s.cabOff, HULL_FLOOR + s.bodyH + s.cabH / 2, 0);
    cab.castShadow = true;
    root.add(cab);

    if (kind !== "pickup") {
      const roof = new THREE.Mesh(roundedBox(s.cabLen * 0.72, 0.07, s.width * 0.68, 0.03), body);
      roof.position.set(s.cabOff - 0.05, HULL_FLOOR + s.bodyH + s.cabH, 0);
      roof.castShadow = true;
      root.add(roof);
    } else {
      const b = s.bed!;
      const bed = new THREE.Mesh(
        roundedBox(b.length, b.height, s.width * b.widthScale, 0.06),
        body,
      );
      bed.position.set(b.along, HULL_FLOOR + s.bodyH + b.height / 2, 0);
      root.add(bed);
    }

    const sill = new THREE.Mesh(roundedBox(s.length * 0.86, 0.07, s.width + 0.03, 0.03), TRIM);
    sill.position.y = 0.38;
    root.add(sill);
  }

  for (const dir of [1, -1]) {
    const bumper = new THREE.Mesh(roundedBox(0.2, 0.22, s.width * 0.98, 0.07), TRIM);
    bumper.position.set((dir * s.length) / 2, kind === "van" ? 0.52 : 0.44, 0);
    root.add(bumper);
  }

  /* wheels */
  const wheels: THREE.Mesh[] = [];
  const radius = 0.34;
  const tyre = new THREE.CylinderGeometry(radius, radius, 0.24, 14);
  const hubGeo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 0.26, 10);
  for (const fx of [s.length * 0.31, -s.length * 0.31]) {
    for (const sz of [s.width / 2 - 0.06, -s.width / 2 + 0.06]) {
      const w = new THREE.Mesh(tyre, RUBBER);
      w.position.set(fx, radius, sz);
      w.rotation.x = Math.PI / 2;
      w.castShadow = true;
      w.add(new THREE.Mesh(hubGeo, RIM));
      root.add(w);
      wheels.push(w);
    }
  }

  /* lights */
  const lampY = kind === "van" ? 0.72 : 0.6;
  // A flat emissive rectangle reads as exactly that at night: a bright oblong
  // sliding down the road. What a lamp actually looks like through damp air is
  // a soft radial bloom with a small hot core inside it.
  const headlight = new THREE.Group();
  for (const sz of [s.width * 0.34, -s.width * 0.34]) {
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 1.05),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: "#ffeec4",
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    halo.position.set(s.length / 2 + 0.06, lampY, sz);
    halo.rotation.y = Math.PI / 2;
    halo.renderOrder = 3;
    headlight.add(halo);

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.085, 12),
      new THREE.MeshBasicMaterial({ color: "#fffbf0", toneMapped: false }),
    );
    core.position.set(s.length / 2 + 0.065, lampY, sz);
    core.rotation.y = Math.PI / 2;
    headlight.add(core);
  }
  root.add(headlight);

  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 11),
    new THREE.MeshBasicMaterial({
      // the same radial falloff, stretched: the throw of the lamps on the road
      // has no business having corners
      map: glowTexture(),
      color: "#ffe6b0",
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(s.length / 2 + 4.6, 0.14, 0);
  beam.renderOrder = 2;
  root.add(beam);

  const brake: THREE.Mesh[] = [];
  const lightGeo = new THREE.PlaneGeometry(0.62, 0.62);
  for (const sz of [s.width * 0.32, -s.width * 0.32]) {
    const light = new THREE.Mesh(
      lightGeo,
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: "#ff2a2a",
        toneMapped: false,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    light.position.set(-s.length / 2 - 0.03, lampY + 0.04, sz);
    light.rotation.y = -Math.PI / 2;
    root.add(light);
    brake.push(light);
  }

  return { root, wheels, brake, headlight, beam, body };
}
