import { CAMERA_BLOCKERS, COLLIDERS, type Box2 } from "./city";

const PLAYER_RADIUS = 0.42;

function overlaps(x: number, z: number, r: number, b: Box2) {
  const cx = Math.max(b.min[0], Math.min(x, b.max[0]));
  const cz = Math.max(b.min[1], Math.min(z, b.max[1]));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

/**
 * Kinematic slide: resolve X and Z independently so walking into a wall at an
 * angle slides along it instead of sticking.
 *
 * The important detail is that each axis takes the *most restrictive* of every
 * box it hits and is then clamped to the span we actually tried to travel. An
 * earlier version snapped straight to each blocking box's edge in turn, so
 * brushing two boxes at once — or ever ending up marginally inside one — threw
 * the player across the map. Clamping to [start, start + delta] makes a
 * collision incapable of moving anyone anywhere except backwards to a standstill.
 */
export function resolveMove(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r = PLAYER_RADIUS,
): [number, number] {
  let nx = x + dx;
  if (dx > 0) {
    let limit = nx;
    for (const b of COLLIDERS) {
      if (overlaps(nx, z, r, b)) limit = Math.min(limit, b.min[0] - r);
    }
    nx = Math.max(x, limit);
  } else if (dx < 0) {
    let limit = nx;
    for (const b of COLLIDERS) {
      if (overlaps(nx, z, r, b)) limit = Math.max(limit, b.max[0] + r);
    }
    nx = Math.min(x, limit);
  }

  let nz = z + dz;
  if (dz > 0) {
    let limit = nz;
    for (const b of COLLIDERS) {
      if (overlaps(nx, nz, r, b)) limit = Math.min(limit, b.min[1] - r);
    }
    nz = Math.max(z, limit);
  } else if (dz < 0) {
    let limit = nz;
    for (const b of COLLIDERS) {
      if (overlaps(nx, nz, r, b)) limit = Math.max(limit, b.max[1] + r);
    }
    nz = Math.min(z, limit);
  }

  return depenetrate(nx, nz, r);
}

/**
 * Last-resort safety net. If something does wedge an actor inside geometry —
 * a car shunt, a spawn on a prop — ease it out along the shallowest axis a few
 * centimetres per frame rather than snapping, so it reads as being nudged
 * clear instead of teleporting.
 */
function depenetrate(x: number, z: number, r: number): [number, number] {
  for (const b of COLLIDERS) {
    if (!overlaps(x, z, r, b)) continue;
    // only act when the centre is genuinely inside the box
    if (x <= b.min[0] || x >= b.max[0] || z <= b.min[1] || z >= b.max[1]) continue;

    const left = x - b.min[0];
    const right = b.max[0] - x;
    const up = z - b.min[1];
    const down = b.max[1] - z;
    const smallest = Math.min(left, right, up, down);
    const step = Math.min(0.25, smallest + r);

    if (smallest === left) return [x - step, z];
    if (smallest === right) return [x + step, z];
    if (smallest === up) return [x, z - step];
    return [x, z + step];
  }
  return [x, z];
}

/**
 * Walks backwards from the player towards the wanted camera position and stops
 * at the first obstruction, so the camera never ends up inside a building.
 *
 * The camera rides at `camY` wherever along the arm it ends up, so anything
 * with a roof lower than that (a parked car, a bin) is one it can sit over:
 * it may hide the character's legs, the way cover does in any third-person
 * game, but it is never inside it.
 */
export function clampCameraDistance(
  px: number,
  pz: number,
  dirX: number,
  dirZ: number,
  wanted: number,
  minDist = 1.4,
  camY = 0,
): number {
  // March *outward* and stop at the first obstruction. The previous version
  // walked inward and returned the first sample that happened to be clear,
  // which only ever tested the end point — so a camera whose final position
  // sat in open air behind a building was considered fine, and the player
  // spent the whole approach looking at the back of a wall.
  const steps = 16;
  let clear = minDist;
  for (let i = 1; i <= steps; i++) {
    const d = (wanted * i) / steps;
    if (d <= minDist) {
      clear = d;
      continue;
    }
    const x = px + dirX * d;
    const z = pz + dirZ * d;
    let blocked = false;
    for (const { box, top } of CAMERA_BLOCKERS) {
      // a slim probe, so lamp posts and bollards don't yank the camera in;
      // and a little headroom over a roof, for the near plane
      if (camY < top + 0.3 && overlaps(x, z, 0.34, box)) {
        blocked = true;
        break;
      }
    }
    if (blocked) return Math.max(minDist, clear - 0.12);
    clear = d;
  }
  return wanted;
}

/**
 * How far the camera has to rise to see the character's head over whatever
 * low cover is on the arm behind them — the pickup parked at the kerb in front
 * of the Golden Noodle, the sedan outside Paloma Laundry. Riding over it at its
 * usual height put the whole character out of sight behind the car.
 */
export function coverLift(
  px: number,
  pz: number,
  dirX: number,
  dirZ: number,
  dist: number,
  camY: number,
  maxLift = 1.3,
): number {
  const HEAD = 1.72;
  let need = camY;
  for (let d = 0.4; d < dist; d += 0.2) {
    const x = px + dirX * d;
    const z = pz + dirZ * d;
    for (const { box, top } of CAMERA_BLOCKERS) {
      if (!Number.isFinite(top) || top < HEAD - 0.4) continue;
      if (!overlaps(x, z, 0.05, box)) continue;
      const sight = HEAD + ((camY - HEAD) * d) / dist;
      if (sight < top + 0.08) need = Math.max(need, HEAD + ((top + 0.08 - HEAD) * dist) / d);
    }
  }
  return Math.min(maxLift, need - camY);
}
