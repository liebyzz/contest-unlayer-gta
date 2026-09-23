import type { GraffitiSpot } from "./graffitiTypes";

const HALF_PI = Math.PI / 2;

/**
 * Fourteen paintable surfaces across Carmine turf.
 *
 * `rotation[1]` decides which way the plane faces: 0 → +Z, π → −Z,
 * +π/2 → +X, −π/2 → −X. Each sits a few centimetres proud of the geometry
 * behind it so it never z-fights.
 *
 * `rep` totals exactly 200 — that's the STREET KING bar.
 */
export const GRAFFITI_SPOTS: GraffitiSpot[] = [
  /* ── Cutthroat Alley: the Kings' own back yard ────────────────────────── */
  {
    id: "alley-dead-end",
    name: "The Dead End",
    district: "Cutthroat Alley",
    position: [-24, 2.8, 25.94],
    rotation: [0, Math.PI, 0],
    size: [6.4, 4.2],
    surfaceType: "wall",
    radius: 4.4,
    rep: 22,
    hint: "Their biggest mark is on this wall. Bury it.",
    seed: 10241,
  },
  {
    id: "alley-side",
    name: "Cutthroat Wall",
    district: "Cutthroat Alley",
    position: [-20.46, 2.5, 16],
    rotation: [0, -HALF_PI, 0],
    size: [5.0, 3.4],
    surfaceType: "wall",
    radius: 3.6,
    rep: 15,
    hint: "Old brick. Holds paint beautifully.",
    seed: 66127,
  },
  {
    id: "alley-west",
    name: "Back Of El Faro",
    district: "Cutthroat Alley",
    position: [-27.54, 2.3, 20.5],
    rotation: [0, HALF_PI, 0],
    size: [4.4, 3.0],
    surfaceType: "wall",
    radius: 3.5,
    rep: 13,
    hint: "The kitchen door's right there. Be quick.",
    seed: 30117,
  },
  {
    id: "alley-shutter",
    name: "Loading Bay",
    district: "Cutthroat Alley",
    position: [-20.46, 1.7, 22.5],
    rotation: [0, -HALF_PI, 0],
    size: [3.8, 2.8],
    surfaceType: "shutter",
    radius: 3.4,
    rep: 12,
    hint: "Nobody unloads anything here any more.",
    seed: 71822,
  },

  /* ── Marlow Street ────────────────────────────────────────────────────── */
  {
    id: "bodega-shutter",
    name: "24H Bodega",
    district: "Marlow Street",
    position: [0, 1.85, 7.94],
    rotation: [0, Math.PI, 0],
    size: [4.6, 3.0],
    surfaceType: "shutter",
    radius: 3.6,
    rep: 13,
    hint: "Shutter's down till six. That's your window.",
    seed: 3391,
  },
  {
    id: "corner-wall",
    name: "Marlow & Third",
    district: "Marlow Street",
    position: [-38, 2.5, -7.94],
    rotation: [0, 0, 0],
    size: [5.4, 3.4],
    surfaceType: "wall",
    radius: 3.8,
    rep: 15,
    hint: "Everyone walking to the station sees this one.",
    seed: 51877,
  },
  {
    id: "laundry-shutter",
    name: "Paloma Laundry",
    district: "Marlow Street",
    position: [-24, 1.8, -7.94],
    rotation: [0, 0, 0],
    size: [4.2, 2.9],
    surfaceType: "shutter",
    radius: 3.5,
    rep: 12,
    hint: "Closed Mondays. It's Monday.",
    seed: 44290,
  },
  {
    id: "noodle-wall",
    name: "Golden Noodle",
    district: "Marlow Street",
    position: [6, 2.4, -7.94],
    rotation: [0, 0, 0],
    size: [5.0, 3.2],
    surfaceType: "wall",
    radius: 3.7,
    rep: 14,
    hint: "The steam keeps the paint tacky. Worth it.",
    seed: 61503,
  },
  {
    id: "box-van",
    name: "The Box Van",
    district: "Marlow Street",
    position: [-13, 1.7, 5.06],
    rotation: [0, 0, 0],
    size: [3.6, 1.8],
    surfaceType: "vehicle",
    radius: 3.2,
    rep: 10,
    hint: "A rolling canvas. It'll be across town by morning.",
    seed: 43310,
  },
  {
    id: "west-shutter",
    name: "Marlow Hardware",
    district: "Marlow Street",
    position: [-44, 2.2, -7.94],
    rotation: [0, 0, 0],
    size: [4.4, 3.0],
    surfaceType: "shutter",
    radius: 3.6,
    rep: 12,
    hint: "Dead end of the street. Nobody comes down here.",
    seed: 18844,
  },

  /* ── Vernon Avenue ────────────────────────────────────────────────────── */
  {
    id: "underpass-wall",
    name: "Vernon Cut",
    district: "Vernon Avenue",
    position: [13.46, 2.5, 14],
    rotation: [0, HALF_PI, 0],
    size: [4.8, 3.2],
    surfaceType: "wall",
    radius: 3.8,
    rep: 15,
    hint: "Concrete. Cold, flat and hungry.",
    seed: 20903,
  },
  {
    id: "arclight-board",
    name: "Arclight Board",
    district: "Vernon Avenue",
    position: [27.06, 5.6, -16],
    rotation: [0, -HALF_PI, 0],
    size: [7.4, 3.8],
    surfaceType: "billboard",
    radius: 5.6,
    rep: 25,
    hint: "Prime advertising space. Not any more.",
    seed: 77431,
  },
  {
    id: "vernon-north",
    name: "Vernon & Ninth",
    district: "Vernon Avenue",
    position: [13.46, 2.4, -14],
    rotation: [0, HALF_PI, 0],
    size: [4.6, 3.1],
    surfaceType: "wall",
    radius: 3.7,
    rep: 12,
    hint: "Right under the streetlight. Bold move.",
    seed: 90217,
  },

  /* ── The vacant lot ───────────────────────────────────────────────────── */
  {
    id: "lot-hoarding",
    name: "Lot Hoarding",
    district: "Vacant Lot",
    position: [31, 1.3, 7.86],
    rotation: [0, Math.PI, 0],
    size: [6.0, 2.2],
    surfaceType: "fence",
    radius: 3.6,
    rep: 10,
    hint: "Plywood. It'll be gone by spring — make it count.",
    seed: 9014,
  },
];

export const TOTAL_REP = GRAFFITI_SPOTS.reduce((n, s) => n + s.rep, 0);

export const SPOT_BY_ID = new Map(GRAFFITI_SPOTS.map((s) => [s.id, s]));

/** Unit normal of a spot's plane — used to place the reveal camera. */
export function spotNormal(spot: GraffitiSpot): [number, number, number] {
  const y = spot.rotation[1];
  return [Math.sin(y), 0, Math.cos(y)];
}
