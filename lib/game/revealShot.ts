import type { GraffitiSpot } from "@/lib/graffiti/graffitiTypes";
import { spotNormal } from "@/lib/graffiti/spots";
import { insideStructure } from "./city";

/** The reveal's field of view — a touch tighter than walking around. */
export const REVEAL_FOV = 51;

/**
 * Where the camera stands to show a piece off.
 *
 * Shared by the reveal push-in and the studio's live street view, so the
 * picture you watch update while you edit is the same shot the piece lands in.
 *
 * `settle` runs 0 → 1 over the push-in. The writer is wherever they pressed E,
 * which is usually a couple of metres in front of the wall — so the camera
 * takes the side of the wall they are *not* standing on, and they end up
 * beside their piece instead of across the bottom of it.
 */
export function revealFraming(
  spot: GraffitiSpot,
  settle: number,
  writerX: number,
  writerZ: number,
): { position: [number, number, number]; target: [number, number, number] } {
  const n = spotNormal(spot);
  const [wx, wy, wz] = spot.position;
  const span = Math.max(spot.size[0], spot.size[1] * 1.6);
  // Close enough that the piece is the picture: this shot is also the
  // photograph that goes in the black book.
  const back = span * 0.78 + 1.5 - settle * 0.7;
  // along the wall, +1 is (n.z, -n.x)
  const along = (writerX - wx) * n[2] - (writerZ - wz) * n[0];
  // Square in front of the middle, either side will do — so pick one and keep
  // it, rather than let the last few centimetres of a stopping stride swing the
  // camera across the street mid-shot.
  //
  // ...unless that side is somewhere a camera cannot stand. Marlow Hardware is
  // the last shutter before the roadblock, and the side away from the writer
  // put the lens on the far side of the barrier, filming the piece through a
  // jersey barrier from outside the map.
  const preferred = (along > 0.35 ? -1 : 1) * SIDE;
  const clear = (s: number) => {
    const cx = wx + n[0] * back + n[2] * s;
    const cz = wz + n[2] * back - n[0] * s;
    // from the lens to just proud of the wall
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = cx + (wx + n[0] * 0.6 - cx) * t;
      const z = cz + (wz + n[2] * 0.6 - cz) * t;
      if (insideStructure(x, z, i === 0 ? 0.45 : 0.1)) return false;
    }
    return true;
  };
  const side = clear(preferred) ? preferred : clear(-preferred) ? -preferred : 0;
  return {
    position: lens(spot, back, side),
    target: [wx, wy, wz],
  };
}

/** How far to one side of the middle of the piece the camera stands. */
const SIDE = 1.9;

function lens(spot: GraffitiSpot, back: number, side: number): [number, number, number] {
  const n = spotNormal(spot);
  const [wx, wy, wz] = spot.position;
  return [wx + n[0] * back + n[2] * side, wy + spot.size[1] * 0.22 + 0.25, wz + n[2] * back - n[0] * side];
}

/**
 * Every place the reveal camera can stand for this spot, at the start of its
 * push-in. The push-in only ever moves the lens towards the wall, so the view
 * from each of these contains every view that follows it.
 */
export function revealEyes(spot: GraffitiSpot): [number, number, number][] {
  const back = Math.max(spot.size[0], spot.size[1] * 1.6) * 0.78 + 1.5;
  return [lens(spot, back, SIDE), lens(spot, back, -SIDE), lens(spot, back, 0)];
}
