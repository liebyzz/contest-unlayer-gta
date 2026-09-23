"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { input } from "@/lib/game/input";
import { playerState } from "@/lib/game/playerState";
import { resolveMove } from "@/lib/game/movement";
import { sfx } from "@/lib/game/audio";
import {
  createRig,
  poseRig,
  STRIDE_RUN,
  STRIDE_WALK,
} from "@/lib/game/characterRig";
import { player, playerFire, stepWorld, world } from "@/lib/game/world";
import { GRAFFITI_SPOTS, SPOT_BY_ID, spotNormal } from "@/lib/graffiti/spots";
import type { GraffitiSpot } from "@/lib/graffiti/graffitiTypes";
import { revealFraming } from "@/lib/game/revealShot";
import { insideAnyBox } from "@/lib/game/city";
import { selectRunning, useGraffiti } from "@/lib/graffiti/graffitiStore";
import { MuzzleFlash } from "./Actors";
import { keepInReveal, revealPyramid } from "./RevealClearance";
import { skipReflection } from "@/lib/game/layers";

// A brisk walk, not a jog. At the old 3.3 m/s the cycle had to spin at five
// steps a second to keep the feet planted, which is most of why the legs
// looked frantic however well they were posed.
const WALK_SPEED = 2.6;
const RUN_SPEED = 5.8;
const AIM_SPEED = 1.9;
const ACCEL = 15;
/** the light the writer carries, walking and while a piece is on show */
const KEY_LIGHT = 4.2;
const KEY_LIGHT_SHOWING = 0.7;

/**
 * Where the writer stands while their piece is shown off.
 *
 * Wherever they pressed E — usually square in front of the middle of the wall,
 * which on a low wall like the lot hoarding put them across the middle of the
 * reveal and of the photograph the black book keeps. If they are in the view of
 * the piece, they step along the wall, away from the side the camera stands on,
 * until they are clear of it: beside their work, looking at it. The reveal
 * opens on a white flash, which covers the step.
 */
function standAside(spot: GraffitiSpot, x: number, z: number) {
  const n = spotNormal(spot);
  const [wx, , wz] = spot.position;
  const shot = revealFraming(spot, 1, x, z);
  const view = revealPyramid(spot, new THREE.Vector3(...shot.position), new THREE.Frustum());
  const body = new THREE.Sphere(new THREE.Vector3(x, 0.95, z), 0.5);
  if (!view.intersectsSphere(body)) return null;

  // along the wall, +1 is (n.z, -n.x)
  const tx = n[2];
  const tz = -n[0];
  const lensAlong = (shot.position[0] - wx) * tx + (shot.position[2] - wz) * tz;
  const away = lensAlong >= 0 ? -1 : 1;
  const along = (x - wx) * tx + (z - wz) * tz;
  const out = (x - wx) * n[0] + (z - wz) * n[2];
  for (let step = 0.4; step <= 4.01; step += 0.4) {
    for (const o of [out, out + 0.7, Math.max(1.1, out - 0.7)]) {
      const px = wx + tx * (along + away * step) + n[0] * o;
      const pz = wz + tz * (along + away * step) + n[2] * o;
      if (insideAnyBox(px, pz, 0.4)) continue;
      body.center.set(px, 0.95, pz);
      if (view.intersectsSphere(body)) continue;
      return { x: px, z: pz, yaw: Math.atan2(wx - px, wz - pz) };
    }
  }
  return null;
}

/** Advances the whole city simulation. Registered before everything else. */
export function Simulation() {
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const state = useGraffiti.getState();
    // The city keeps moving through the arrival shot and through the reveal.
    // Both point the camera at the street, and a street where every car and
    // pedestrian is stopped mid-stride reads as a photograph rather than a
    // place. The player holds no controls in either, so nothing may take a
    // swing at them there.
    player.safe = state.phase !== "playing";
    stepWorld(dt, selectRunning(state));
  });
  return null;
}

export function Player() {
  const { camera } = useThree();
  const holder = useRef<THREE.Group>(null);
  const velocity = useRef({ x: 0, z: 0 });
  const phase = useRef(0);
  const stepFlag = useRef(false);
  const facing = useRef(playerState.yaw);
  const smoothRun = useRef(0);
  const smoothTurn = useRef(0);
  const smoothAccel = useRef(0);
  const lastSpeed = useRef(0);
  const gunAnchor = useRef<THREE.Object3D | null>(null);
  const keyLight = useRef<THREE.PointLight>(null);
  const lastPhase = useRef<string>("");

  const rig = useMemo(
    () =>
      createRig(
        {
          // Somebody who lives in this city rather than a mannequin in a neon
          // cap: cropped dark hair, a few days of stubble, an open olive shirt
          // with the sleeves off over a pale vest, dark denim, a chain.
          //
          // The pale vest is doing a job beyond looking right — it is the one
          // light shape on the character, and it is what lets you find yourself
          // in a dark street full of people at a glance, which is the work the
          // pink cap used to do far more crudely.
          jacket: "#40503c",
          legs: "#222a37",
          skin: "#b47a52",
          hat: null,
          hair: "#241b16",
          stubble: "#8a5f42",
          shortSleeves: true,
          chain: "#d9b65e",
          vest: "#d9cfb6",
          pack: true,
          armed: true,
          bulk: 1.04,
        },
        true,
      ),
    [],
  );

  const setNear = useGraffiti((s) => s.setNear);
  const spots = useMemo(() => GRAFFITI_SPOTS.map((s) => ({ spot: s, n: spotNormal(s) })), []);
  const lastNear = useRef<string | null>(null);

  useEffect(() => {
    const g = holder.current;
    if (!g) return;
    g.add(rig.root);
    keepInReveal(rig.root);
    skipReflection(rig.root);
    gunAnchor.current = rig.muzzle;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 16),
      new THREE.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    g.add(shadow);
    return () => {
      rig.root.removeFromParent();
      shadow.removeFromParent();
    };
  }, [rig]);

  // pulling the trigger
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // the click that captures the mouse shouldn't also loose a round — read
      // and clear it before any other exit, or a stale flag eats a later shot
      const captured = input.capturedThisClick;
      input.capturedThisClick = false;
      const st = useGraffiti.getState();
      if (st.phase !== "playing" || player.dead) return;
      // a left click is the shutter while the phone is out, not the trigger
      if (st.photoMode) return;
      if (captured) return;
      // Pointer lock is the normal case, but a browser that refuses it leaves
      // click-drag as the only way to look — and the gun has to work there too.
      if (!input.pointerLocked && !input.dragging) return;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      // the hit is resolved along the camera ray, so the crosshair tells the
      // truth; the visible tracer starts at the barrel instead
      const eye = {
        x: camera.position.x + dir.x * 1.9,
        y: camera.position.y + dir.y * 1.9,
        z: camera.position.z + dir.z * 1.9,
      };
      // Derived rather than read off the rig: the trigger is pulled in a
      // mousedown handler, so the gun hand is still wherever the *previous*
      // frame's pose left it — which is by the hip, and the round appears to
      // leave the character's chest. This is where the barrel is about to be.
      const flatX = dir.x;
      const flatZ = dir.z;
      const flatLen = Math.hypot(flatX, flatZ) || 1;
      const fx2 = flatX / flatLen;
      const fz2 = flatZ / flatLen;
      const barrel = {
        x: playerState.x + fx2 * 0.52 - fz2 * 0.2,
        y: 1.34 + dir.y * 0.3,
        z: playerState.z + fz2 * 0.52 + fx2 * 0.2,
      };

      if (playerFire({ x: dir.x, y: dir.y, z: dir.z }, eye, barrel)) sfx.gunshot();
      else if (player.ammo <= 0) sfx.dryFire();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [camera]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const gamePhase = useGraffiti.getState().phase;
    const canWalk = gamePhase === "playing" && !player.dead;

    // out of the shot of their own piece, as it goes up
    if (gamePhase === "reveal" && lastPhase.current !== "reveal") {
      const id = useGraffiti.getState().revealSpotId;
      const spot = id ? SPOT_BY_ID.get(id) : undefined;
      const aside = spot ? standAside(spot, playerState.x, playerState.z) : null;
      if (aside) {
        playerState.x = aside.x;
        playerState.z = aside.z;
        velocity.current.x = velocity.current.z = 0;
        facing.current = aside.yaw;
      }
    }
    lastPhase.current = gamePhase;
    const aiming = player.aiming && !player.dead;

    // ── movement ─────────────────────────────────────────────────────────
    const yaw = playerState.camYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);

    let dx = 0;
    let dz = 0;
    if (canWalk) {
      const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      dx = fx * f + rx * r;
      dz = fz * f + rz * r;
      const len = Math.hypot(dx, dz);
      if (len > 0.0001) {
        dx /= len;
        dz /= len;
      }
    }

    const moving = dx !== 0 || dz !== 0;
    const running = canWalk && input.sprint && moving && !aiming;
    const target = aiming ? AIM_SPEED : running ? RUN_SPEED : WALK_SPEED;
    const k = 1 - Math.exp(-ACCEL * dt);
    velocity.current.x += (dx * target - velocity.current.x) * k;
    velocity.current.z += (dz * target - velocity.current.z) * k;

    let speed = Math.hypot(velocity.current.x, velocity.current.z);
    if (speed < 0.03) {
      velocity.current.x = velocity.current.z = 0;
      speed = 0;
    }

    const [nx, nz] = resolveMove(
      playerState.x,
      playerState.z,
      velocity.current.x * dt,
      velocity.current.z * dt,
    );
    playerState.x = nx;
    playerState.z = nz;
    playerState.speed = speed;
    playerState.running = running;

    // ── facing ───────────────────────────────────────────────────────────
    // Towards travel normally, towards the camera while aiming — and also
    // while a hip shot is still playing, so the barrel points where the round
    // actually went instead of wherever we happened to be walking.
    const shooting = player.fireAnim > 0.12;
    const wantFacing =
      aiming || shooting
        ? yaw
        : speed > 0.4
          ? Math.atan2(velocity.current.x, velocity.current.z)
          : facing.current;
    let diff = wantFacing - facing.current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const prevFacing = facing.current;
    facing.current += diff * Math.min(1, dt * (aiming ? 16 : shooting ? 22 : 12));
    playerState.yaw = facing.current;

    // ── animation ────────────────────────────────────────────────────────
    // Run is a continuous blend rather than a flag, so speeding up lengthens
    // the stride instead of snapping between two different walks.
    const runBlend = THREE.MathUtils.clamp(
      (speed - WALK_SPEED * 0.85) / (RUN_SPEED - WALK_SPEED * 0.85),
      0,
      1,
    );
    smoothRun.current += (runBlend - smoothRun.current) * Math.min(1, dt * 6);

    const stride = THREE.MathUtils.lerp(STRIDE_WALK, STRIDE_RUN, smoothRun.current);
    phase.current += (speed / stride) * Math.PI * 2 * dt;
    const intensity = Math.min(1, speed / WALK_SPEED);

    // How hard we're turning, and whether we're gaining or losing speed — both
    // feed the lean, which is what stops the walk reading as a machine. This is
    // the angle actually turned this frame, in rad/s: taking it from the
    // residual error instead made it frame-rate dependent and pinned it at the
    // clamp on any brisk mouse turn, so the body banked hard one way and then
    // the other with every correction.
    let applied = facing.current - prevFacing;
    while (applied > Math.PI) applied -= Math.PI * 2;
    while (applied < -Math.PI) applied += Math.PI * 2;
    const turnRate = THREE.MathUtils.clamp(applied / Math.max(dt, 0.0001) / 3, -1, 1);
    smoothTurn.current += (turnRate - smoothTurn.current) * Math.min(1, dt * 4.5);
    const accelRate = THREE.MathUtils.clamp(
      (speed - lastSpeed.current) / Math.max(dt, 0.0001) / 18,
      -1,
      1,
    );
    smoothAccel.current += (accelRate - smoothAccel.current) * Math.min(1, dt * 4);
    lastSpeed.current = speed;

    const half = Math.sin(phase.current) > 0;
    if (speed > 0.7 && half !== stepFlag.current) {
      stepFlag.current = half;
      sfx.footstep(running);
    }

    if (holder.current) {
      holder.current.position.set(playerState.x, 0, playerState.z);
      holder.current.rotation.y = facing.current;
      // The phone camera is a first-person camera, so the character is stood
      // exactly where the lens is. Leaving them drawn puts the inside of their
      // own head across every photograph.
      holder.current.visible = !useGraffiti.getState().photoMode;
    }

    poseRig(rig, {
      phase: phase.current,
      intensity,
      run: smoothRun.current,
      turn: smoothTurn.current,
      accel: smoothAccel.current,
      aiming,
      aimPitch: -playerState.camPitch,
      down: player.dead ? Math.min(1, player.deadTimer * 2.6) : 0,
      recoil: player.recoil,
      hipFire: aiming ? 0 : player.fireAnim,
      time: state.clock.elapsedTime,
    });
    // FREE PAINT sends you in with a backpack of cans and nothing else
    rig.armed = !world.peaceful;
    if (world.peaceful) rig.gun.visible = false;

    // ── what can we paint from here? ─────────────────────────────────────
    if (gamePhase === "playing" && !player.dead) {
      let best: string | null = null;
      let bestD = Infinity;
      let nearest: string | null = null;
      let nearestD = Infinity;
      for (const { spot, n } of spots) {
        const ddx = playerState.x - spot.position[0];
        const ddz = playerState.z - spot.position[2];
        const d = Math.hypot(ddx, ddz);
        if (d < nearestD) {
          nearestD = d;
          nearest = spot.id;
        }
        if (ddx * n[0] + ddz * n[2] < -0.25) continue;
        if (d < spot.radius && d < bestD) {
          bestD = d;
          best = spot.id;
        }
      }
      playerState.nearestSpotId = nearest;
      if (best !== lastNear.current) {
        if (best) sfx.spotFound();
        lastNear.current = best;
        setNear(best);
      }
    } else if (lastNear.current !== null && gamePhase !== "editor") {
      lastNear.current = null;
      setNear(null);
    }

    // The key light rides two metres from whatever wall the writer is facing,
    // which is exactly where it burns a hotspot into the middle of their piece
    // — in the reveal, and in the photograph the black book keeps of it. While
    // the camera is showing a piece off it drops to a glow.
    const light = keyLight.current;
    if (light) {
      const showing = gamePhase === "reveal" || gamePhase === "editor";
      const want = showing ? KEY_LIGHT_SHOWING : KEY_LIGHT;
      // straight down in the studio: its street view is a single frame
      light.intensity =
        gamePhase === "editor" ? want : light.intensity + (want - light.intensity) * Math.min(1, dt * 5);
    }
  });

  return (
    <>
      <group ref={holder} position={[playerState.x, 0, playerState.z]}>
        {/* A single travelling key light. The block is lit almost entirely by
            bounce and emissive signage, which looks right but leaves the
            character a silhouette — this keeps whoever you're looking at
            readable without touching the scene's mood. */}
        <pointLight
          ref={keyLight}
          position={[0, 2.9, 0.15]}
          intensity={KEY_LIGHT}
          distance={6.5}
          decay={2}
          color="#ffd6ad"
        />
      </group>
      <MuzzleFlash target={gunAnchor} />
    </>
  );
}
