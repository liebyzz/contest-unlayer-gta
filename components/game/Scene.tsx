"use client";

import { Suspense } from "react";
import * as THREE from "three";
import { Environment, Lightformer } from "@react-three/drei";
import { GRAFFITI_SPOTS } from "@/lib/graffiti/spots";
import { City } from "./City";
import { Effects } from "./Effects";
import { GameCamera } from "./GameCamera";
import { GraffitiSpots } from "./GraffitiSpot";
import { Ground } from "./Ground";
import { Player, Simulation } from "./Player";
import { CombatFx, People, Traffic } from "./Actors";
import { Waypoint } from "./Waypoint";
import { PhotoCapture } from "./PhotoCapture";
import { RevealClearance } from "./RevealClearance";
import { WallPreviewRig } from "./WallPreviewRig";
import { FOG_COLOUR, SUN_DIRECTION, SkyDome } from "./Sky";

const SUN_POSITION = SUN_DIRECTION.clone().multiplyScalar(90);

export function Scene() {
  return (
    <>
      <fogExp2 attach="fog" args={[FOG_COLOUR, 0.0125]} />
      <SkyDome />

      {/* the last of the sun, low and to the west */}
      <directionalLight
        position={[SUN_POSITION.x, SUN_POSITION.y + 42, SUN_POSITION.z]}
        intensity={1.45}
        color="#ffb066"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0006}
        shadow-normalBias={0.045}
      />
      {/* sky bounce: cold from above, warm sodium from the street */}
      {/* the street is mostly in the buildings' shadow at this hour, so most of
          the readable light is bounce: cold from the sky, warm off the tarmac.
          Kept deliberately low — too much fill and the whole block goes milky. */}
      {/* Warm key, cold fill. Keeping the shade genuinely blue is what stops
          the whole block reading as one flat salmon wash. */}
      <hemisphereLight args={["#4f63c0", "#241c26", 0.95]} />
      <ambientLight intensity={0.3} color="#41509b" />

      {/* A four-panel studio light rendered into a cube map once. Without it
          every metal surface in a night scene resolves to black; with it the
          cars, glass and wet road pick up the sunset and the neon. */}
      <Suspense fallback={null}>
        <Environment resolution={64} frames={1} environmentIntensity={0.5}>
          <Lightformer
            intensity={2.6}
            color="#ff9a4d"
            position={[-9, 2.5, -7]}
            scale={[12, 7, 1]}
          />
          <Lightformer
            intensity={1.1}
            color="#7d6ac2"
            position={[0, 9, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[24, 24, 1]}
          />
          <Lightformer intensity={1.3} color="#22e0ff" position={[9, 3, 7]} scale={[7, 4, 1]} />
          <Lightformer intensity={1.1} color="#ff2f86" position={[7, 2.5, -9]} scale={[7, 4, 1]} />
          <Lightformer intensity={0.5} color="#1a1226" position={[0, -6, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[30, 30, 1]} />
        </Environment>
      </Suspense>

      <Simulation />
      <Ground />
      <City />
      <GraffitiSpots spots={GRAFFITI_SPOTS} />
      <Traffic />
      <People />
      <CombatFx />
      <Waypoint />
      <PhotoCapture />
      <Player />
      <GameCamera />
      <WallPreviewRig />
      <RevealClearance />
      <Effects />
    </>
  );
}

export const TONE_MAPPING = THREE.ACESFilmicToneMapping;
