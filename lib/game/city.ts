/**
 * The neighbourhood: one main street, one side street, one dead-end alley and
 * a vacant lot. Small on purpose — every metre of it is dressed.
 *
 * Everything here is plain data. `components/game/City.tsx` renders it and
 * `movement.ts` collides against the boxes derived from it.
 */

export interface Box2 {
  /** min x, min z */
  min: [number, number];
  /** max x, max z */
  max: [number, number];
}

export type FacadeStyle = "brick" | "panel" | "block";

export interface Building {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: number;
  style: FacadeStyle;
  /** facade tint index into CITY_PALETTE */
  tint: number;
  /** which face carries a shopfront */
  shopFace?: "north" | "south" | "east" | "west";
  shopName?: string;
  /** hex colour of the shop's neon sign */
  neon?: string;
  roof?: "units" | "tank" | "bare";
  /** shop is closed — the roller shutter is down, so no lit glass frontage.
   *  Set where a graffiti spot occupies the shopfront. */
  shuttered?: boolean;
}

export const CITY_PALETTE = [
  "#3d3340",
  "#4a3b39",
  "#33323f",
  "#463a33",
  "#2e3340",
  "#453644",
  "#39332c",
];

/* ── street geometry ─────────────────────────────────────────────────────── */
export const MAIN_STREET = { x0: -46, x1: 44, roadZ0: -5, roadZ1: 5, kerb: 3 };
export const SIDE_STREET = { z0: -28, z1: 36, roadX0: 16, roadX1: 24.5, kerb: 2.6 };
export const ALLEY = { x0: -27.6, x1: -20.4, z0: 8, z1: 26 };
export const VACANT_LOT = { x0: 27, x1: 39, z0: 8, z1: 16 };

/**
 * On the bodega's pavement, looking down Marlow Street into the last of the
 * sunset with the first wall framed on the left.
 *
 * It used to be in the westbound lane, which is a spawn the traffic has to
 * stop for: the first car of the night pulled up behind the writer and sat
 * across the left third of the opening shot for as long as they stood there.
 */
export const SPAWN = { x: 4.6, z: 5.7, yaw: -1.1 };

/* ── buildings ───────────────────────────────────────────────────────────── */
export const BUILDINGS: Building[] = [
  // north side of the main street
  { id: "n1", x0: -46, x1: -32, z0: -26, z1: -8, height: 14, style: "brick", tint: 1, shopFace: "south", shopName: "MARLOW HARDWARE", neon: "#ff8b3d", roof: "units" },
  { id: "n2", x0: -30, x1: -18, z0: -24, z1: -8, height: 10, style: "panel", tint: 0, shopFace: "south", shopName: "PALOMA LAUNDRY", neon: "#ff2f86", roof: "tank" },
  { id: "n3", x0: -16, x1: -4, z0: -28, z1: -8, height: 19, style: "block", tint: 2, roof: "units" },
  { id: "n4", x0: -2, x1: 13.4, z0: -22, z1: -8, height: 12, style: "brick", tint: 3, shopFace: "south", shopName: "GOLDEN NOODLE", neon: "#ffc542", roof: "bare" },
  { id: "n5", x0: 27, x1: 42, z0: -26, z1: -8, height: 16, style: "panel", tint: 4, roof: "units" },

  // south side
  { id: "s1", x0: -46, x1: -27.6, z0: 8, z1: 26, height: 11, style: "brick", tint: 5, shopFace: "north", shopName: "EL FARO CAFE", neon: "#22e0ff", roof: "tank" },
  { id: "s2", x0: -20.4, x1: -7, z0: 8, z1: 28, height: 13, style: "block", tint: 6, roof: "units" },
  { id: "s3", x0: -7, x1: 6, z0: 8, z1: 24, height: 9, style: "panel", tint: 0, shopFace: "north", shopName: "24H BODEGA", neon: "#c8ff32", roof: "bare", shuttered: true },
  { id: "s4", x0: 8, x1: 13.4, z0: 8, z1: 20, height: 15, style: "block", tint: 2, roof: "tank" },
  { id: "s5", x0: 27, x1: 40, z0: 16, z1: 30, height: 12, style: "brick", tint: 1, roof: "units" },

  // the wall that closes the alley
  { id: "s6", x0: -27.6, x1: -20.4, z0: 26, z1: 34, height: 9, style: "brick", tint: 3, roof: "bare" },
];

/** Distant filler so the skyline never runs out — outside the playable area. */
export const SKYLINE: Building[] = [
  { id: "k1", x0: -80, x1: -58, z0: -60, z1: -34, height: 30, style: "block", tint: 2 },
  { id: "k2", x0: -52, x1: -30, z0: -62, z1: -34, height: 24, style: "panel", tint: 4 },
  { id: "k3", x0: -24, x1: 2, z0: -66, z1: -36, height: 38, style: "block", tint: 0 },
  { id: "k4", x0: 8, x1: 30, z0: -60, z1: -34, height: 27, style: "brick", tint: 5 },
  { id: "k5", x0: 46, x1: 74, z0: -54, z1: -26, height: 33, style: "block", tint: 2 },
  { id: "k6", x0: 48, x1: 70, z0: -18, z1: 8, height: 21, style: "panel", tint: 6 },
  { id: "k7", x0: 46, x1: 72, z0: 34, z1: 60, height: 29, style: "block", tint: 4 },
  { id: "k8", x0: -10, x1: 18, z0: 42, z1: 68, height: 34, style: "panel", tint: 0 },
  { id: "k9", x0: -54, x1: -26, z0: 40, z1: 66, height: 26, style: "brick", tint: 5 },
  { id: "k10", x0: -84, x1: -60, z0: 0, z1: 30, height: 22, style: "block", tint: 3 },
];

/* ── street furniture ────────────────────────────────────────────────────── */
export interface StreetLight {
  x: number;
  z: number;
  /** rotation in radians: which way the arm points */
  rot: number;
  colour: string;
}

export const STREET_LIGHTS: StreetLight[] = [
  // not -38: that planted the post a metre and a half in front of the middle
  // of Marlow & Third, in every view of the piece
  { x: -33.6, z: -6.4, rot: Math.PI, colour: "#ffb264" },
  { x: -20, z: -6.4, rot: Math.PI, colour: "#ffb264" },
  { x: -2, z: -6.4, rot: Math.PI, colour: "#ffb264" },
  { x: 16, z: -6.4, rot: Math.PI, colour: "#ffb264" },
  { x: 36, z: -6.4, rot: Math.PI, colour: "#ffb264" },
  { x: -30, z: 6.4, rot: 0, colour: "#ffb264" },
  { x: -10, z: 6.4, rot: 0, colour: "#ffb264" },
  { x: 10, z: 6.4, rot: 0, colour: "#ffb264" },
  { x: 32, z: 6.4, rot: 0, colour: "#ffb264" },
  { x: 25.4, z: -18, rot: -Math.PI / 2, colour: "#8fd6ff" },
  { x: 25.4, z: 8, rot: -Math.PI / 2, colour: "#8fd6ff" },
  { x: 25.4, z: 26, rot: -Math.PI / 2, colour: "#8fd6ff" },
];

export interface ParkedCar {
  x: number;
  z: number;
  rot: number;
  body: string;
  kind: "sedan" | "hatch" | "van" | "pickup";
}

/**
 * Parked at the kerb only — the middle of the road belongs to the moving
 * traffic in `world.ts`, whose lanes sit at z = ±1.75.
 */
export const PARKED_CARS: ParkedCar[] = [
  { x: -13, z: 3.95, rot: 0, body: "#d8d4cc", kind: "van" },
  { x: -26, z: -3.95, rot: Math.PI, body: "#7a2f3d", kind: "sedan" },
  { x: -34, z: 3.95, rot: 0, body: "#2f4a5e", kind: "hatch" },
  { x: 6, z: -3.95, rot: Math.PI, body: "#2b2f36", kind: "pickup" },
  { x: 30, z: 3.95, rot: 0, body: "#4d5a3a", kind: "sedan" },
  { x: 36, z: -3.95, rot: Math.PI, body: "#8a6a2f", kind: "hatch" },
  { x: -41, z: -3.95, rot: Math.PI, body: "#6b6b70", kind: "hatch" },
  // written off, dumped in the vacant lot
  { x: 34.5, z: 13.2, rot: 0.6, body: "#5a3f6b", kind: "sedan" },
];

/** Chain-link + jersey barriers sealing the ends of the map. */
export interface Roadblock {
  x: number;
  z: number;
  /** length along its local X */
  length: number;
  rot: number;
}

export const ROADBLOCKS: Roadblock[] = [
  // Past the corners of the buildings rather than in front of them: at -45.4
  // the barrier stood across the western metre of Marlow Hardware, and in
  // front of every picture anyone took of the piece on it.
  { x: -46.75, z: 0, length: 16, rot: Math.PI / 2 },
  { x: 43.4, z: 0, length: 16, rot: Math.PI / 2 },
  { x: 20.2, z: -27.4, length: 13, rot: 0 },
  { x: 20.2, z: 35.4, length: 13, rot: 0 },
];

export interface Dumpster {
  x: number;
  z: number;
  rot: number;
  colour: string;
}

export const DUMPSTERS: Dumpster[] = [
  { x: -22.4, z: 11.5, rot: 0.1, colour: "#2f4a3a" },
  { x: -25.6, z: 22.5, rot: -0.2, colour: "#4a3a2f" },
  // kept clear of the loading-bay shutter — this used to sit exactly where you
  // have to stand to paint it
  { x: -26.4, z: 19.2, rot: 0.35, colour: "#33384a" },
  { x: 10.6, z: 26, rot: 0, colour: "#2f4a3a" },
  { x: 29.6, z: 12.6, rot: 0.4, colour: "#4a3140" },
];

/* ── colliders ───────────────────────────────────────────────────────────── */
const PAD = 0.02;

function buildingBox(b: Building): Box2 {
  return { min: [b.x0 - PAD, b.z0 - PAD], max: [b.x1 + PAD, b.z1 + PAD] };
}

function centred(x: number, z: number, w: number, d: number): Box2 {
  return { min: [x - w / 2, z - d / 2], max: [x + w / 2, z + d / 2] };
}

function rotatedFootprint(x: number, z: number, len: number, thick: number, rot: number): Box2 {
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const w = len * c + thick * s;
  const d = len * s + thick * c;
  return centred(x, z, w, d);
}

export const COLLIDERS: Box2[] = [
  ...BUILDINGS.map(buildingBox),
  ...ROADBLOCKS.map((r) => rotatedFootprint(r.x, r.z, r.length, 1.1, r.rot)),
  ...PARKED_CARS.map((c) =>
    rotatedFootprint(c.x, c.z, c.kind === "van" ? 5.4 : 4.4, 2.1, c.rot),
  ),
  ...DUMPSTERS.map((d) => centred(d.x, d.z, 2.3, 1.5)),
  ...STREET_LIGHTS.map((l) => centred(l.x, l.z, 0.5, 0.5)),
  // the hoarding around the vacant lot
  { min: [VACANT_LOT.x0, 7.8], max: [VACANT_LOT.x1, 8.4] },
  // outer fence keeping the player inside the neighbourhood
  { min: [-60, 36.5], max: [60, 40] },
  { min: [-60, -32], max: [60, -28.6] },
  { min: [-52, -40], max: [-47.5, 40] },
  { min: [45.5, -40], max: [52, 40] },
];

/** Roof heights of the parked cars, from `CAR_SHAPE` (chassis + body + cab). */
const PARKED_TOP: Record<ParkedCar["kind"], number> = {
  sedan: 1.66,
  hatch: 1.66,
  pickup: 1.88,
  van: 2.76,
};

/**
 * What the follow camera has to stay out of, and how tall each thing is.
 *
 * The camera used to treat every collider as a wall, so standing at a piece
 * with a car parked at the kerb behind you — the Golden Noodle and its pickup,
 * the Box Van's own street — pulled it in to its minimum and parked it over
 * the character's head, looking down at the pavement. It rides two and a half
 * metres up; a sedan's roof is a metre lower than that. Low things only block
 * the camera where it would actually be inside them.
 */
export const CAMERA_BLOCKERS: { box: Box2; top: number }[] = [
  ...BUILDINGS.map((b) => ({ box: buildingBox(b), top: Infinity })),
  ...ROADBLOCKS.map((r) => ({ box: rotatedFootprint(r.x, r.z, r.length, 1.1, r.rot), top: Infinity })),
  ...PARKED_CARS.map((c) => ({
    box: rotatedFootprint(c.x, c.z, c.kind === "van" ? 5.4 : 4.4, 2.1, c.rot),
    top: PARKED_TOP[c.kind],
  })),
  ...DUMPSTERS.map((d) => ({ box: centred(d.x, d.z, 2.3, 1.5), top: 1.4 })),
  ...STREET_LIGHTS.map((l) => ({ box: centred(l.x, l.z, 0.5, 0.5), top: Infinity })),
  { box: { min: [VACANT_LOT.x0, 7.8], max: [VACANT_LOT.x1, 8.4] }, top: Infinity },
  { box: { min: [-60, 36.5], max: [60, 40] }, top: Infinity },
  { box: { min: [-60, -32], max: [60, -28.6] }, top: Infinity },
  { box: { min: [-52, -40], max: [-47.5, 40] }, top: Infinity },
  { box: { min: [45.5, -40], max: [52, 40] }, top: Infinity },
];

/**
 * Only the things a camera cannot see through: buildings, the roadblocks and
 * the fences. Lamp posts, bins and parked cars are left out on purpose — the
 * reveal takes those out of its own shot (`RevealClearance`).
 */
const STRUCTURES: Box2[] = [
  ...BUILDINGS.map(buildingBox),
  ...ROADBLOCKS.map((r) => rotatedFootprint(r.x, r.z, r.length, 1.1, r.rot)),
  { min: [VACANT_LOT.x0, 7.8], max: [VACANT_LOT.x1, 8.4] },
  { min: [-60, 36.5], max: [60, 40] },
  { min: [-60, -32], max: [60, -28.6] },
  { min: [-52, -40], max: [-47.5, 40] },
  { min: [45.5, -40], max: [52, 40] },
];

export function insideStructure(x: number, z: number, grow = 0): boolean {
  for (const b of STRUCTURES) {
    if (x > b.min[0] - grow && x < b.max[0] + grow && z > b.min[1] - grow && z < b.max[1] + grow) {
      return true;
    }
  }
  return false;
}

/** Rough test used by the camera so it does not clip through a building. */
export function insideAnyBox(x: number, z: number, grow = 0): boolean {
  for (const b of COLLIDERS) {
    if (x > b.min[0] - grow && x < b.max[0] + grow && z > b.min[1] - grow && z < b.max[1] + grow) {
      return true;
    }
  }
  return false;
}
