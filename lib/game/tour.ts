import type { PaintedPiece } from "@/lib/graffiti/graffitiTypes";
import { SPOT_BY_ID } from "@/lib/graffiti/spots";
import { BUILDINGS } from "./city";
import { revealFraming } from "./revealShot";

/**
 * THE CITY TOUR.
 *
 * Every piece has its moment — the reveal — and then you walk away from it,
 * and after a few walls the only place the whole body of work exists together
 * is the black book, as a grid of thumbnails. The city is the gallery. So the
 * camera goes up over the roofs and flies it: down onto each wall in turn at
 * the reveal's own framing, a beat on each with its name, and out over the
 * block at the end with everything you painted glowing in the dark.
 *
 * It is the STREET KING ending, and the black book will play it any time.
 *
 * This module is the plan and the flight path; the camera flies it
 * (`GameCamera`), the overlay titles it (`TourOverlay`).
 */

/** Longer than this and a tour stops being a victory lap and becomes a wait. */
const MAX_STOPS = 6;
/**
 * Seconds on each wall once the camera is down: long enough for the wall to
 * replay its time-lapse (about a second and a half on the tour) and then be
 * looked at for a beat.
 */
export const TOUR_HOLD = 2.9;
/** Seconds over the block at the end. */
export const AERIAL_HOLD = 6.5;

type V3 = [number, number, number];

/**
 * Which walls, in what order.
 *
 * Every piece if there are few enough; otherwise the ones with the most work
 * in them (the time-lapse length) and the biggest surfaces, always keeping the
 * newest. Then chained nearest-first from wherever the player is standing, so
 * the flight never zig-zags across the district and back — except the newest,
 * which closes it. On the victory lap that is the wall whose reveal has just
 * played, and opening on it again was the same shot twice in a row.
 */
export function planTour(
  painted: Record<string, PaintedPiece>,
  fromX: number,
  fromZ: number,
  max = MAX_STOPS,
): string[] {
  let ids = Object.keys(painted).filter((id) => SPOT_BY_ID.has(id));
  if (!ids.length) return [];
  const newest = ids.reduce((a, b) => (painted[b].paintedAt > painted[a].paintedAt ? b : a));
  if (ids.length > max) {
    const score = (id: string) =>
      (painted[id].process?.length ?? 0) * 2 + (SPOT_BY_ID.get(id)?.rep ?? 0) / 4;
    const rest = ids.filter((id) => id !== newest).sort((a, b) => score(b) - score(a));
    ids = [newest, ...rest.slice(0, max - 1)];
  }

  const order: string[] = [];
  let x = fromX;
  let z = fromZ;
  const left = new Set(ids.filter((id) => id !== newest));
  while (left.size) {
    let best = "";
    let bestD = Infinity;
    for (const id of left) {
      const p = SPOT_BY_ID.get(id)!.position;
      const d = Math.hypot(p[0] - x, p[2] - z);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    order.push(best);
    left.delete(best);
    const p = SPOT_BY_ID.get(best)!.position;
    x = p[0];
    z = p[2];
  }
  order.push(newest);
  return order;
}

/** Where the camera sits on a wall: the reveal's shot, pushing in as it holds. */
export function stopShot(id: string, settle: number): { position: V3; target: V3 } {
  const spot = SPOT_BY_ID.get(id)!;
  // the wall's own middle as the "writer", so the side it picks is stable
  return revealFraming(spot, settle, spot.position[0], spot.position[2]);
}

/**
 * The closing shot: high over the middle of the block, turning slowly, looking
 * down into the streets. Kept inside the ring of tall buildings round the
 * district (the tallest is 38 m, 40 m out) rather than outside it.
 */
const AERIAL_CENTRE: V3 = [-2, 0, 3];
const AERIAL_RADIUS = 30;
const AERIAL_HEIGHT = 33;
/** how far round it turns while it holds, in radians */
const AERIAL_SWEEP = 0.62;

export function aerialShot(angle0: number, t: number): { position: V3; target: V3 } {
  const a = angle0 + AERIAL_SWEEP * t;
  return {
    position: [
      AERIAL_CENTRE[0] + Math.sin(a) * AERIAL_RADIUS,
      AERIAL_HEIGHT - t * 3,
      AERIAL_CENTRE[2] + Math.cos(a) * AERIAL_RADIUS,
    ],
    // a little above the street, so the walls facing the lens are in the shot
    // and not just the roofs
    target: [AERIAL_CENTRE[0], 5, AERIAL_CENTRE[2]],
  };
}

/** The aerial's starting bearing: whichever side of the block the camera is already on. */
export function aerialBearing(fromX: number, fromZ: number): number {
  return Math.atan2(fromX - AERIAL_CENTRE[0], fromZ - AERIAL_CENTRE[2]);
}

/** The tallest roof within a metre and a half of a straight line across the city. */
function roofline(x0: number, z0: number, x1: number, z1: number): number {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.ceil(len));
  let top = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    for (const b of BUILDINGS) {
      if (x > b.x0 - 1.5 && x < b.x1 + 1.5 && z > b.z0 - 1.5 && z < b.z1 + 1.5) {
        top = Math.max(top, b.height);
      }
    }
  }
  return top;
}

export interface Leg {
  from: V3;
  fromLook: V3;
  to: V3;
  toLook: V3;
  /** the height the flight crosses at */
  cruise: number;
  duration: number;
}

/**
 * A flight from one shot to the next.
 *
 * Up, across, down — as three overlapping moves rather than one curve. A
 * Bézier with its handles over each end looked right and cut corners: it was
 * already travelling sideways at a third of its height, which with a wall
 * behind the lens (every reveal shot has one) meant flying through the
 * building the camera had just been looking at. Here the climb is two-thirds
 * done before the camera starts to cross, and the descent starts once it has
 * finished crossing.
 */
export function makeLeg(from: V3, fromLook: V3, to: V3, toLook: V3): Leg {
  const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const roofs = roofline(from[0], from[2], to[0], to[2]);
  const hop = Math.max(from[1], to[1]) + 2 + dist * 0.22;
  const cruise = Math.min(34, Math.max(hop, roofs > 0 ? roofs + 7 : 0));
  const climb = Math.max(0, cruise - Math.min(from[1], to[1]));
  const duration = Math.min(4.4, Math.max(2.3, 1.7 + dist / 26 + climb / 24));
  return { from, fromLook, to, toLook, cruise, duration };
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const smoother = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * c * (c * (c * 6 - 15) + 10);
};

/** The camera `u` of the way (0-1) through a leg. */
export function flyLeg(leg: Leg, u: number): { position: V3; target: V3 } {
  const across = smoother((u - 0.2) / 0.6);
  const up = smooth(u / 0.42);
  const down = smooth((u - 0.58) / 0.42);
  const { from, to, fromLook, toLook, cruise } = leg;
  const y = from[1] + (cruise - from[1]) * up + (to[1] - cruise) * down;
  const x = from[0] + (to[0] - from[0]) * across;
  const z = from[2] + (to[2] - from[2]) * across;
  const look = smoother((u - 0.1) / 0.75);
  let tx = fromLook[0] + (toLook[0] - fromLook[0]) * look;
  let ty = fromLook[1] + (toLook[1] - fromLook[1]) * look;
  let tz = fromLook[2] + (toLook[2] - fromLook[2]) * look;
  // Over the roofs, look where it is going. Aimed at a point between the two
  // walls, the lens was pointing straight down at whatever roof it was over
  // for the middle of every flight — a frame of flat tar — and swung about
  // that point as it passed over it.
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const dist = Math.hypot(dx, dz);
  if (dist > 4) {
    const w = Math.pow(Math.sin(Math.PI * across), 0.8);
    const ahead = 26;
    tx += (x + (dx / dist) * ahead - tx) * w;
    ty += (y - ahead * 0.42 - ty) * w;
    tz += (z + (dz / dist) * ahead - tz) * w;
  }
  return { position: [x, y, z], target: [tx, ty, tz] };
}
