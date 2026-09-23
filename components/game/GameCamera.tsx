"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { input } from "@/lib/game/input";
import { playerState } from "@/lib/game/playerState";
import { clampCameraDistance, coverLift } from "@/lib/game/movement";
import { cameraCarClearance, player, world } from "@/lib/game/world";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { SPOT_BY_ID } from "@/lib/graffiti/spots";
import { REVEAL_FOV, revealFraming } from "@/lib/game/revealShot";
import {
  AERIAL_HOLD,
  TOUR_HOLD,
  aerialBearing,
  aerialShot,
  flyLeg,
  makeLeg,
  stopShot,
  type Leg,
} from "@/lib/game/tour";

const SENSITIVITY = 0.0026;
const AIM_SENSITIVITY = 0.0016;
const PITCH_MIN = -0.55;
const PITCH_MAX = 0.92;
const DIST_MIN = 3.2;
const DIST_MAX = 9.5;
/** how close to the road the camera may get before the arc stops */
const GROUND_CLEARANCE = 0.6;
const INTRO_SECONDS = 3.6;

/**
 * Where the arrival shot starts, relative to the player.
 *
 * Straight up the middle of Marlow Street rather than over the rooftops — the
 * old position began behind a building, so the whole descent played out with
 * the character hidden behind a facade.
 */
const DRONE_START: [number, number, number] = [21, 15, 3];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Third-person follow camera with five moods: the arrival drone shot, ordinary
 * play, an over-the-shoulder aim position when the pistol is out, the reveal
 * push-in that shows off a finished piece, and the city tour flying all of them.
 */
export function GameCamera() {
  const { camera } = useThree();
  const pitch = useRef(0.17);
  const distance = useRef(6.1);
  const aimBlend = useRef(0);
  const photoBlend = useRef(0);
  const photoWas = useRef(false);
  const pitchBeforePhoto = useRef(0.17);
  const pos = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const introT = useRef(0);
  const revealBlend = useRef(0);
  const revealT = useRef(0);
  const started = useRef(false);
  /** the city tour in flight: which stop, on it or flying to it, for how long */
  const tour = useRef<{ i: number; holding: boolean; t: number; leg: Leg; bearing: number } | null>(
    null,
  );

  const beginPlay = useGraffiti((s) => s.beginPlay);

  useEffect(() => {
    pos.current.set(playerState.x + DRONE_START[0], DRONE_START[1], playerState.z + DRONE_START[2]);
    look.current.set(playerState.x, 1.4, playerState.z);
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
  }, [camera]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const store = useGraffiti.getState();
    const phase = store.phase;
    const revealId = store.revealSpotId;
    const photo = store.photoMode && !player.dead;
    const aiming = player.aiming && !player.dead && !photo;

    aimBlend.current += ((aiming ? 1 : 0) - aimBlend.current) * Math.min(1, dt * 8);
    photoBlend.current += ((photo ? 1 : 0) - photoBlend.current) * Math.min(1, dt * 6);

    // The follow camera looks slightly down at the character, which is right
    // for walking and wrong for a photograph — held at that angle the phone
    // frames a lot of pavement. Level it as the phone comes up and put the
    // walking angle back when it goes away.
    if (photo !== photoWas.current) {
      if (photo) {
        pitchBeforePhoto.current = pitch.current;
        pitch.current = 0.02;
      } else {
        pitch.current = pitchBeforePhoto.current;
      }
      photoWas.current = photo;
    }

    // ── mouse look ───────────────────────────────────────────────────────
    if (phase === "playing") {
      const sens = aiming ? AIM_SENSITIVITY : SENSITIVITY;
      playerState.camYaw -= input.lookX * sens;
      // No recoil kick on the camera: the gun climbing is the character's
      // job, and throwing the view up on every shot just fights the player.
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + input.lookY * sens,
        PITCH_MIN,
        PITCH_MAX,
      );
      distance.current = THREE.MathUtils.clamp(
        distance.current + input.zoom * 0.45,
        DIST_MIN,
        DIST_MAX,
      );
    }
    input.lookX = 0;
    input.lookY = 0;
    input.zoom = 0;

    // The camera swings on a sphere around the player, and at full zoom the
    // bottom of that arc is three metres underground — from where you get an
    // excellent view of the underside of the road. Stop the arc at the
    // pavement instead of clamping the height afterwards, so the camera keeps
    // orbiting properly rather than sliding along an invisible floor.
    const reach = THREE.MathUtils.lerp(distance.current, 2.5, aimBlend.current);
    const eyeLine = THREE.MathUtils.lerp(1.5, 1.62, aimBlend.current);
    const orbitFloor = Math.asin(
      THREE.MathUtils.clamp((GROUND_CLEARANCE - eyeLine) / Math.max(reach, 0.001), -1, 1),
    );
    // The floor exists because the camera swings on a sphere and the bottom of
    // that arc is under the road. There is no arc in first person, and a phone
    // that cannot be tilted up at a building is not much of a camera — so the
    // limit relaxes to the full range as the phone comes out.
    pitch.current = Math.max(
      pitch.current,
      THREE.MathUtils.lerp(orbitFloor, PITCH_MIN, photoBlend.current),
    );
    playerState.camPitch = pitch.current;

    // ── follow position ──────────────────────────────────────────────────
    const yaw = playerState.camYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);

    const ab = aimBlend.current;
    const shoulder = 0.42 + ab * 0.55;
    const targetX = playerState.x + rx * shoulder;
    const targetZ = playerState.z + rz * shoulder;
    const wanted = THREE.MathUtils.lerp(distance.current, 2.5, ab);
    const eyeHeight = THREE.MathUtils.lerp(1.5, 1.62, ab);
    const horizontal = wanted * Math.cos(pitch.current);
    const height = eyeHeight + wanted * Math.sin(pitch.current);

    const walled = clampCameraDistance(targetX, targetZ, -fx, -fz, horizontal, 1.4, height);
    // ...and never inside a van going past behind you
    const clamped = cameraCarClearance(targetX, eyeHeight, targetZ, -fx, -fz, walled, height);
    const dodgingCar = clamped < walled - 0.05;
    const lift = coverLift(targetX, targetZ, -fx, -fz, clamped, height);
    const followPos = new THREE.Vector3(targetX - fx * clamped, height + lift, targetZ - fz * clamped);
    const aheadLook = THREE.MathUtils.lerp(1.4, 5.5, ab);
    const followLook = new THREE.Vector3(
      playerState.x + rx * (0.3 + ab * 0.5) + fx * aheadLook,
      THREE.MathUtils.lerp(1.42, 1.55, ab) - Math.sin(pitch.current) * aheadLook,
      playerState.z + rz * (0.3 + ab * 0.5) + fz * aheadLook,
    );

    let wantPos = followPos;
    let wantLook = followLook;
    // a car cutting across the arm is quicker than the usual follow lag
    let smoothing = dodgingCar ? 28 : THREE.MathUtils.lerp(9, 18, ab);

    // ── the phone ────────────────────────────────────────────────────────
    // A third-person camera photographs the back of your own head, which is
    // the one thing in the city nobody wants on a wall. Holding the phone up
    // goes first person: the lens is where the character's eyes are, they stop
    // being drawn, and the frame is entirely whatever you are looking at.
    const pb = photoBlend.current;
    if (pb > 0.002) {
      const lensX = playerState.x + fx * 0.12;
      const lensZ = playerState.z + fz * 0.12;
      const lensY = 1.68;
      const aim = 6;
      const photoPos = new THREE.Vector3(lensX, lensY, lensZ);
      const photoLook = new THREE.Vector3(
        lensX + fx * aim,
        lensY - Math.sin(pitch.current) * aim,
        lensZ + fz * aim,
      );
      const b = easeInOut(THREE.MathUtils.clamp(pb, 0, 1));
      wantPos = wantPos.clone().lerp(photoPos, b);
      wantLook = wantLook.clone().lerp(photoLook, b);
      smoothing = THREE.MathUtils.lerp(smoothing, 14, b);
    }

    // ── the arrival shot ─────────────────────────────────────────────────
    if (phase === "entering") {
      introT.current = Math.min(1, introT.current + dt / INTRO_SECONDS);
      const t = easeInOut(introT.current);
      const from = new THREE.Vector3(
        playerState.x + DRONE_START[0],
        DRONE_START[1],
        playerState.z + DRONE_START[2],
      );
      pos.current.copy(from.lerp(followPos, t));
      // hold on the character the whole way down
      look.current.set(playerState.x, 1.25, playerState.z).lerp(followLook, t * t);
      camera.position.copy(pos.current);
      camera.lookAt(look.current);
      if (introT.current >= 1 && !started.current) {
        started.current = true;
        beginPlay();
      }
      return;
    }

    // ── the city tour ────────────────────────────────────────────────────
    if (phase === "tour") {
      const stops = store.tourStops;
      const here = (): [number, number, number] => [pos.current.x, pos.current.y, pos.current.z];
      const aim = (): [number, number, number] => [look.current.x, look.current.y, look.current.z];
      if (!tour.current) {
        const first = stopShot(stops[0], 0);
        tour.current = {
          i: 0,
          holding: false,
          t: 0,
          leg: makeLeg(here(), aim(), first.position, first.target),
          bearing: 0,
        };
      }
      const T = tour.current;
      T.t += dt;
      let shot: { position: [number, number, number]; target: [number, number, number] };
      let fov: number = REVEAL_FOV;
      if (!T.holding) {
        const u = Math.min(1, T.t / T.leg.duration);
        shot = flyLeg(T.leg, u);
        // a touch wider in the air
        fov = REVEAL_FOV + Math.sin(u * Math.PI) * 9;
        if (u >= 1) {
          T.holding = true;
          T.t = 0;
          store.setTourBeat(T.i, true);
        }
      } else if (T.i < stops.length) {
        const k = Math.min(1, T.t / TOUR_HOLD);
        shot = stopShot(stops[T.i], easeOut(k));
        if (k >= 1) {
          T.i += 1;
          T.holding = false;
          T.t = 0;
          const next =
            T.i < stops.length
              ? stopShot(stops[T.i], 0)
              : aerialShot((T.bearing = aerialBearing(pos.current.x, pos.current.z)), 0);
          T.leg = makeLeg(here(), aim(), next.position, next.target);
          store.setTourBeat(T.i, false);
        }
      } else {
        // over the block; it keeps turning while the overlay fades it out
        shot = aerialShot(T.bearing, T.t / AERIAL_HOLD);
        fov = 50;
        if (T.t >= AERIAL_HOLD && !store.tourDone) store.finishTourFlight();
      }
      pos.current.set(...shot.position);
      look.current.set(...shot.target);
      camera.position.copy(pos.current);
      camera.lookAt(look.current);
      const persp = camera as THREE.PerspectiveCamera;
      if (Math.abs(persp.fov - fov) > 0.05) {
        persp.fov += (fov - persp.fov) * Math.min(1, dt * 5);
        persp.updateProjectionMatrix();
      }
      return;
    }
    if (tour.current) {
      // back from the tour: the overlay has cut to black, so cut the camera too
      tour.current = null;
      pos.current.copy(followPos);
      look.current.copy(followLook);
      revealBlend.current = 0;
    }

    // ── the reveal ───────────────────────────────────────────────────────
    const revealing = phase === "reveal" && revealId;
    revealBlend.current +=
      ((revealing ? 1 : 0) - revealBlend.current) * Math.min(1, dt * (revealing ? 3.2 : 2.4));
    if (revealing) revealT.current += dt;
    else revealT.current = 0;

    if (revealBlend.current > 0.002 && revealId) {
      const spot = SPOT_BY_ID.get(revealId);
      if (spot) {
        const shot = revealFraming(
          spot,
          easeOut(Math.min(1, revealT.current / 3)),
          playerState.x,
          playerState.z,
        );
        const revealPos = new THREE.Vector3(...shot.position);
        const revealLook = new THREE.Vector3(...shot.target);
        const b = easeInOut(THREE.MathUtils.clamp(revealBlend.current, 0, 1));
        wantPos = followPos.clone().lerp(revealPos, b);
        wantLook = followLook.clone().lerp(revealLook, b);
        // Brisk enough that the move has finished well before the shutter goes,
        // whatever frame rate the machine is managing.
        smoothing = 9;
      }
    }

    // ── death: drop and drift back ───────────────────────────────────────
    if (player.dead) {
      const t = Math.min(1, player.deadTimer / 2.4);
      wantPos = new THREE.Vector3(
        playerState.x - fx * (3.4 + t * 2.6),
        1.1 + t * 2.4,
        playerState.z - fz * (3.4 + t * 2.6),
      );
      wantLook = new THREE.Vector3(playerState.x, 0.45, playerState.z);
      smoothing = 2.4;
    }

    const s = 1 - Math.exp(-smoothing * dt);
    pos.current.lerp(wantPos, s);
    look.current.lerp(wantLook, s);

    camera.position.copy(pos.current);
    // handheld shake from crashes, gunfire and getting hit
    if (world.shake > 0.001) {
      const a = world.shake * 0.34;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      camera.position.z += (Math.random() - 0.5) * a;
    }
    camera.lookAt(look.current);

    const persp = camera as THREE.PerspectiveCamera;
    const wantFov =
      55 +
      (playerState.running ? 6 : 0) -
      revealBlend.current * (55 - REVEAL_FOV) -
      ab * 8 -
      photoBlend.current * 7;
    if (Math.abs(persp.fov - wantFov) > 0.05) {
      persp.fov += (wantFov - persp.fov) * Math.min(1, dt * 6);
      persp.updateProjectionMatrix();
    }
  });

  return null;
}
