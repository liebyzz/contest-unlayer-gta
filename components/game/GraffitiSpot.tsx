"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GraffitiSpot as Spot } from "@/lib/graffiti/graffitiTypes";
import { surfaceImage } from "@/lib/graffiti/surfaces";
import { spotNormal } from "@/lib/graffiti/spots";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { makeGraffitiMaterial, textureFromDataUrl } from "@/lib/game/graffitiMaterial";
import { glowTexture } from "@/lib/game/facades";
import { playerState } from "@/lib/game/playerState";
import { lightShaftMaterial } from "@/lib/game/lightShaft";
import { wallPreview } from "@/lib/game/wallPreview";
import { sfx } from "@/lib/game/audio";
import { world } from "@/lib/game/world";
import { STOP_MOTION_MIN_FRAMES, stopMotionTiming } from "@/lib/graffiti/timelapse";

const REVEAL_DELAY = 0.45;
const REVEAL_TIME = 1.5;
/** how hard the finished piece flares as it lands */
const LANDING_KICK = 0.34;
/** flare → extra emissive on the paint; bloom does the rest */
const FLARE_GAIN = 4.2;
/**
 * How much the piece lights its own pixels for the length of its reveal.
 *
 * Four of the fourteen walls stand under a lamp or a shop sign; the rest are
 * unlit brick at ten past nine at night. A piece on one of those came through
 * its reveal — the game's one cinematic, and the frame that becomes its
 * photograph in the black book — as a dim smudge, which is a poor way to show
 * somebody the thing they just spent five minutes making. Held only while the
 * reveal is on screen, and eased in and out, so walking past the same wall
 * afterwards shows it lit by the street the way everything else is.
 */
const REVEAL_GLOW = 0.42;
/**
 * The city tour's closing shot looks down on the whole block from forty metres
 * up, where a piece is a few dozen pixels of a wall at night. Every piece
 * holds this much more for it, so the work reads as the lights of the district.
 */
const AERIAL_GLOW = 0.9;

/**
 * The pillar of light that says "there is a wall here worth painting".
 *
 * Only ever mounted on a spot the player has NOT painted yet, so everything in
 * here is allowed to shout: a soft shaft standing off the wall, brackets that
 * breathe, and a ring that pings outwards across the pavement every couple of
 * seconds. Flat markers were getting lost against a street this busy.
 */
function SpotMarker({ spot, colour }: { spot: Spot; colour: string }) {
  const shaft = useRef<THREE.Mesh>(null);
  const frame = useRef<THREE.Group>(null);
  const pool = useRef<THREE.Mesh>(null);
  const ping = useRef<THREE.Mesh>(null);
  const [w, h] = spot.size;

  // bright at the pavement, thinning as it rises — the wall is the source
  const shaftMaterial = useMemo(() => lightShaftMaterial(colour, 0.5, true), [colour]);
  const edgeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colour),
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
      }),
    [colour],
  );
  const pingMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colour),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [colour],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 0.62 + Math.sin(t * 2.6) * 0.38;

    // Four spots share Cutthroat Alley, and lighting them all at once stacked
    // into a wall of green fog you couldn't see through. The closest one burns
    // at full strength; the rest hold a floor bright enough to navigate by.
    const away = Math.hypot(
      playerState.x - spot.position[0],
      playerState.z - spot.position[2],
    );
    const distance = THREE.MathUtils.clamp(1 - (away - 6) / 22, 0.34, 1);
    const lead = playerState.nearestSpotId === spot.id ? 1 : 0.5;
    const near = distance * lead;

    edgeMaterial.opacity = (0.4 + pulse * 0.6) * Math.max(near, 0.6);
    shaftMaterial.uniforms.uStrength.value = (0.24 + pulse * 0.3) * near;
    if (pool.current) {
      (pool.current.material as THREE.MeshBasicMaterial).opacity = (0.12 + pulse * 0.12) * near;
    }
    if (shaft.current) shaft.current.rotation.y = t * 0.5;
    if (frame.current) {
      const s = 1 + Math.sin(t * 2.6) * 0.02;
      frame.current.scale.set(s, s, 1);
    }

    // the ping: a ring travelling out across the ground, twice per cycle
    if (ping.current) {
      const cycle = (t % 2.4) / 2.4;
      const s = 0.5 + cycle * 3.4;
      ping.current.scale.set(s, s, 1);
      pingMaterial.opacity = (1 - cycle) * (1 - cycle) * 0.55 * near;
      ping.current.visible = pingMaterial.opacity > 0.01;
    }
  });

  // Corner brackets rather than a full box — reads cleaner at distance. One
  // geometry for all eight bars: fourteen spots of eight meshes each was a
  // hundred draw calls for a few thin rectangles.
  const brackets = useMemo(() => {
    const bar = 0.075;
    const bars: THREE.BufferGeometry[] = [];
    for (const [sx, sy] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ] as const) {
      const cx = (sx * w) / 2;
      const cy = (sy * h) / 2;
      bars.push(new THREE.PlaneGeometry(w / 5, bar).translate(cx - (sx * w) / 10, cy, 0.02));
      bars.push(new THREE.PlaneGeometry(bar, h / 4).translate(cx, cy - (sy * h) / 8, 0.02));
    }
    const merged = mergeGeometries(bars);
    for (const b of bars) b.dispose();
    return merged;
  }, [w, h]);
  useEffect(() => () => brackets.dispose(), [brackets]);

  return (
    <group>
      <group ref={frame}>
        <mesh geometry={brackets} material={edgeMaterial} />
      </group>

      {/* the shaft, and the light it throws on the ground in front of the wall */}
      <mesh
        ref={shaft}
        material={shaftMaterial}
        position={[0, -spot.position[1] + 2.1, 1.35]}
        renderOrder={3}
      >
        <cylinderGeometry args={[0.5, 0.62, 4.2, 20, 1, true]} />
      </mesh>
      <mesh
        ref={ping}
        position={[0, -spot.position[1] + 0.05, 1.35]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={pingMaterial}
        renderOrder={2}
      >
        <ringGeometry args={[0.86, 1, 40]} />
      </mesh>
      <mesh
        ref={pool}
        position={[0, -spot.position[1] + 0.13, 1.35]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[4.6, 4.6]} />
        <meshBasicMaterial
          map={glowTexture()}
          color={colour}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function GraffitiSpotMesh({ spot }: { spot: Spot }) {
  const painted = useGraffiti((s) => s.painted[spot.id]);
  // Keyed on what is actually on the wall. The piece record is replaced when
  // the reveal files its street photograph three seconds in, and reacting to
  // that new object re-loaded the texture and sprayed the whole piece on a
  // second time, flash and all, just as the reveal handed back control.
  const art = painted?.graffitiTexture;
  const paintedAt = painted?.paintedAt ?? 0;
  // the same array for the life of the piece: filing the street photograph
  // copies the record but not this
  const steps = painted?.process;
  const isNear = useGraffiti((s) => s.nearSpotId === spot.id);
  const [w, h] = spot.size;

  // the untouched surface — also the exact image the studio opens with
  const baseTexture = useMemo(() => textureFromDataUrl(surfaceImage(spot)), [spot]);
  const [pieceTexture, setPieceTexture] = useState<THREE.Texture | null>(null);
  const handle = useMemo(() => makeGraffitiMaterial(null), []);
  const startedAt = useRef<number | null>(null);
  const piece = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Group>(null);
  /** the texture of the piece actually up on this wall, if any */
  const pieceMap = useRef<THREE.Texture | null>(null);
  /** the studio's live street view has its work-in-progress on this wall */
  const previewing = useRef(false);
  /**
   * The time-lapse, replaying on the wall. A fresh piece with enough steps
   * behind it does not dissolve on: the wall plays back how it was made, one
   * settled canvas at a time, and the finished piece lands last.
   */
  const replay = useRef<{ textures: THREE.Texture[]; frameDur: number; shown: number } | null>(
    null,
  );
  /** a flare on the wall, kicked by each step and by the finished piece */
  const kick = useRef(0);
  /** the reveal's own hold on the paint, eased 0 → 1 → 0 with the cinematic */
  const limelight = useRef(0);
  /** this wall is the tour's current stop and the camera is on it */
  const toured = useRef(false);
  /** its time-lapse, decoding while the tour camera flies in to it */
  const tourFrames = useRef<THREE.Texture[] | null>(null);

  useEffect(() => {
    if (replay.current) {
      for (const t of replay.current.textures) t.dispose();
      replay.current = null;
    }
    if (!art) {
      pieceMap.current = null;
      setPieceTexture(null);
      startedAt.current = null;
      handle.setProgress(0);
      return;
    }
    const tex = textureFromDataUrl(art);
    pieceMap.current = tex;
    handle.setMap(tex);
    setPieceTexture(tex);
    // a piece painted long ago (i.e. we just remounted) is simply already there
    const fresh = Date.now() - paintedAt < 4000;
    startedAt.current = fresh ? performance.now() / 1000 : -Infinity;
    handle.setProgress(fresh ? 0 : 1);
    if (fresh && steps && steps.length >= STOP_MOTION_MIN_FRAMES) {
      replay.current = {
        textures: steps.map((url) => textureFromDataUrl(url)),
        frameDur: stopMotionTiming(steps.length).frameDur,
        shown: -1,
      };
    }
  }, [art, paintedAt, handle, steps]);

  useEffect(
    () => () => {
      handle.dispose();
      if (replay.current) for (const t of replay.current.textures) t.dispose();
      if (tourFrames.current) for (const t of tourFrames.current) t.dispose();
    },
    [handle],
  );

  useFrame((_, delta) => {
    // The studio's street view: the piece in progress, fully on, no marker
    // shouting over it. Only ever for a frame at a time while the studio is up.
    const { phase, photoMode, revealSpotId, tourStops, tourBeat } = useGraffiti.getState();
    const live = wallPreview.spotId === spot.id && phase === "editor";
    if (live) {
      // before the first edit there is no texture: the wall as it stands
      const wip = wallPreview.texture;
      if (wip) {
        if (handle.material.map !== wip) handle.setMap(wip);
        handle.setProgress(1);
      }
      previewing.current = true;
      handle.setFlare(0);
      if (piece.current) piece.current.visible = wip !== null || pieceMap.current !== null;
      if (marker.current) marker.current.visible = false;
      return;
    }
    if (previewing.current) {
      previewing.current = false;
      if (pieceMap.current) handle.setMap(pieceMap.current);
      if (startedAt.current === -Infinity) handle.setProgress(1);
      if (piece.current) piece.current.visible = pieceMap.current !== null;
    }
    // The beam and brackets are game UI standing in the street. A photograph
    // taken on the phone is raw material for the next piece, and nobody wants
    // a green light shaft baked into it — nor into the reveal, whose frame is
    // the photograph the black book keeps, and where the next wall's beam used
    // to glare in from the edge of the shot.
    if (marker.current) {
      marker.current.visible =
        !photoMode && phase !== "reveal" && phase !== "editor" && phase !== "tour";
    }

    if (startedAt.current === null) return;
    kick.current = Math.max(0, kick.current - Math.min(delta, 0.05) * 1.3);

    const run = replay.current;
    if (run) {
      const since = performance.now() / 1000 - startedAt.current;
      // step 0 is the wall as the studio found it, held through the beat
      // before the replay starts
      const i = since < REVEAL_DELAY ? 0 : Math.floor((since - REVEAL_DELAY) / run.frameDur);
      if (i < run.textures.length) {
        const step = run.textures[i];
        // a step still decoding just holds the one before it
        if (i !== run.shown && step.image) {
          handle.setMap(step);
          handle.setProgress(1);
          if (run.shown >= 0) {
            kick.current = Math.max(kick.current, 0.1);
            // at full speed every other step is plenty of noise
            if (i % 2 === 1 || run.frameDur > 0.12) sfx.psst();
          }
          run.shown = i;
        }
      } else {
        // the finished piece, at full size, lands with a flare
        if (pieceMap.current) handle.setMap(pieceMap.current);
        handle.setProgress(1);
        for (const t of run.textures) t.dispose();
        replay.current = null;
        startedAt.current = -Infinity;
        land();
      }
    } else if (startedAt.current !== -Infinity) {
      const elapsed = performance.now() / 1000 - startedAt.current - REVEAL_DELAY;
      const p = THREE.MathUtils.clamp(elapsed / REVEAL_TIME, 0, 1);
      handle.setProgress(p);
      // the aerosol edge does the work while it sprays on; the flare is the end
      if (p >= 1) {
        startedAt.current = -Infinity;
        land();
      }
    }

    // The flare is the paint itself lighting up and the bloom catching it —
    // exactly the shape of the piece. It used to be a quad hung in front of
    // the wall, which read as a pane of green glass and spilled round the
    // corners of the building onto the windows either side.
    const touring = phase === "tour";
    const aerial = touring && tourBeat.stop >= tourStops.length;
    const onStop = touring && tourStops[tourBeat.stop] === spot.id;
    // On the tour, the wall makes itself again as the camera lands on it: the
    // bare surface, every step out of the editor, then the finished piece with
    // its flare. The frames start decoding while the camera is still in the air.
    if (onStop && !tourBeat.holding && !tourFrames.current && !replay.current) {
      if (steps && steps.length >= STOP_MOTION_MIN_FRAMES) {
        tourFrames.current = steps.map((url) => textureFromDataUrl(url));
      }
    }
    if (onStop && tourBeat.holding && !toured.current) {
      if (tourFrames.current && !replay.current) {
        replay.current = {
          textures: tourFrames.current,
          // a short film still reads as steps; a long one fits in the hold
          frameDur: Math.min(0.24, Math.max(0.05, 1.6 / tourFrames.current.length)),
          shown: -1,
        };
        tourFrames.current = null;
        // straight in, without the reveal's opening beat on the bare wall
        startedAt.current = performance.now() / 1000 - REVEAL_DELAY + 0.25;
      } else {
        // no film behind it: just the flare, like it landing again
        kick.current = Math.max(kick.current, 0.16);
      }
    }
    if (!onStop && tourFrames.current) {
      // skipped before the camera got here
      for (const t of tourFrames.current) t.dispose();
      tourFrames.current = null;
    }
    toured.current = onStop && tourBeat.holding;
    const lit =
      (phase === "reveal" && revealSpotId === spot.id) || onStop
        ? REVEAL_GLOW
        : aerial
          ? AERIAL_GLOW
          : 0;
    limelight.current += (lit - limelight.current) * Math.min(1, delta * 3.4);
    handle.setFlare(kick.current * FLARE_GAIN + limelight.current);
  });

  /** the finished piece is on the wall */
  function land() {
    kick.current = LANDING_KICK;
    // and the street feels it land
    world.shake = Math.max(world.shake, 0.14);
  }

  const markerColour = isNear ? "#ffffff" : "#c8ff32";

  // Stand the panel off the wall far enough to clear the plinth, string
  // courses and pilasters the buildings now carry.
  const n = spotNormal(spot);
  const standoff: [number, number, number] = [
    spot.position[0] + n[0] * 0.19,
    spot.position[1],
    spot.position[2] + n[2] * 0.19,
  ];

  return (
    <group position={standoff} rotation={spot.rotation} userData={{ nwKeep: true }}>
      {/* the surface itself */}
      <mesh receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={baseTexture} roughness={0.96} metalness={0} />
      </mesh>

      {/* the player's piece, sprayed on */}
      <mesh
        ref={piece}
        position={[0, 0, 0.012]}
        material={handle.material}
        visible={pieceTexture !== null}
      >
        <planeGeometry args={[w, h]} />
      </mesh>

      <group ref={marker}>{!painted && <SpotMarker spot={spot} colour={markerColour} />}</group>

    </group>
  );
}

export function GraffitiSpots({ spots }: { spots: Spot[] }) {
  return (
    <group>
      {spots.map((s) => (
        <GraffitiSpotMesh key={s.id} spot={s} />
      ))}
    </group>
  );
}
