"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  attachInput,
  attachMouseLook,
  clearInput,
  input,
  releasePointerLock,
} from "@/lib/game/input";
import { playerState } from "@/lib/game/playerState";
import { insideAnyBox } from "@/lib/game/city";
import { GRAFFITI_SPOTS } from "@/lib/graffiti/spots";
import { sfx, startAmbience } from "@/lib/game/audio";
import { player, setAiming, setPeaceful, setWorldHooks, world } from "@/lib/game/world";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { LAYER_NO_REFLECT } from "@/lib/game/layers";
import { Scene } from "./Scene";

/**
 * Draws a handful of frames while the briefing is still up.
 *
 * The canvas sits on `frameloop="demand"` behind the briefing, which renders
 * once on mount — but the surface photographs and the Environment map arrive a
 * beat later, and each would otherwise compile and upload on the first frame of
 * the drone shot. A few more frames over the ringing phone take care of them.
 */
function Prewarm({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    const timers = [120, 450, 900, 1350].map((ms) => window.setTimeout(() => invalidate(), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, invalidate]);
  return null;
}

/** The sharpest the city is ever drawn, and the softest it may fall back to. */
const DPR_MAX = 1.75;
const DPR_MIN = 0.75;
const DPR_STEP = 0.25;

/**
 * Resolution that follows the frame rate.
 *
 * The composer runs ambient occlusion, bloom and 4× MSAA on every pixel, and a
 * retina laptop asks for three times the pixels of the screen it is on. On a
 * mid-range GPU that was the difference between 57 and 35 frames a second —
 * and on the integrated graphics most people judge a web game on, worse. So
 * the canvas measures itself while the game is actually being played, gives
 * up pixels when it is struggling and takes them back (twice at most, so it
 * cannot see-saw) when there is headroom.
 *
 * Pixels are only given up if giving them up works. A machine that is slow
 * because of how much it is asked to draw rather than how big — the CPU
 * submitting the frame, not the GPU filling it — gets nothing from a softer
 * image, so each step down is checked against the frame rate it bought, and
 * put back (for good) if it bought nothing.
 *
 * Only ever measured in open play: the studio and the black book draw on
 * demand, the reveal uploads textures, and none of that says anything about
 * how the street runs.
 */
function AdaptiveResolution({
  dpr,
  max,
  onChange,
}: {
  dpr: number;
  max: number;
  onChange: (dpr: number) => void;
}) {
  const sample = useRef({
    frames: 0,
    elapsed: 0,
    /** the resize itself is a hitch; don't count it against the new size */
    settle: 0,
    raised: 0,
    /** a step down waiting to prove itself */
    trial: null as { from: number; fps: number } | null,
    /** resolution turned out not to be what this machine is short of */
    locked: false,
  });
  const change = (next: number) => {
    const s = sample.current;
    s.frames = 0;
    s.elapsed = 0;
    s.settle = 0.6;
    onChange(next);
  };
  useFrame((_, delta) => {
    const s = sample.current;
    const { phase, galleryOpen, photoMode } = useGraffiti.getState();
    // a hitch longer than this is a stall, not a frame rate
    if (phase !== "playing" || galleryOpen || photoMode || delta > 0.25) {
      s.frames = 0;
      s.elapsed = 0;
      return;
    }
    if (s.settle > 0) {
      s.settle -= delta;
      return;
    }
    s.frames++;
    s.elapsed += delta;
    if (s.elapsed < 2) return;
    const fps = s.frames / s.elapsed;
    s.frames = 0;
    s.elapsed = 0;

    if (s.trial) {
      const { from, fps: before } = s.trial;
      s.trial = null;
      if (fps < before * 1.08) {
        s.locked = true;
        change(from);
      }
      return;
    }
    if (s.locked) return;
    if (fps < 42 && dpr > DPR_MIN) {
      s.trial = { from: dpr, fps };
      change(Math.max(DPR_MIN, dpr - DPR_STEP));
    } else if (fps > 57 && dpr < max && s.raised < 2) {
      s.raised++;
      change(Math.min(max, dpr + DPR_STEP));
    }
  });
  return null;
}

/**
 * The WebGL half of the game. Owns the canvas, the input wiring and the
 * pause: while the graffiti studio is open the render loop is stopped dead so
 * the editor gets the whole machine.
 */
export function Game() {
  const host = useRef<HTMLDivElement>(null);
  // Held here rather than set on the renderer directly: the Canvas re-applies
  // its `dpr` prop every time it re-renders, which it does on every phase change.
  const [maxDpr] = useState(() => Math.max(1, Math.min(window.devicePixelRatio || 1, DPR_MAX)));
  const [dpr, setDpr] = useState(maxDpr);
  const phase = useGraffiti((s) => s.phase);
  const galleryOpen = useGraffiti((s) => s.galleryOpen);
  // Both of these are full-screen and opaque; there is nothing behind them to
  // draw, and the black book doubles as the pause menu because of it.
  const frozen = phase === "editor" || galleryOpen;
  // mounted early, behind the briefing: draw only what Prewarm asks for
  const prewarming = phase === "trailer";

  const freePaint = useGraffiti((s) => s.freePaint);

  // the street's hum starts with the street, not under Vance's call
  useEffect(() => {
    if (!prewarming) startAmbience();
  }, [prewarming]);

  // the mode the player picked on the menu, pushed into the simulation
  useEffect(() => setPeaceful(freePaint), [freePaint]);

  // R3F sizes its canvas from a ResizeObserver, and in some embedded browsers
  // the initial observation never lands — leaving a 300×150 canvas and no
  // renderer at all. Nudging resize after mount forces the first measure.
  useEffect(() => {
    const nudge = () => window.dispatchEvent(new Event("resize"));
    const frame = requestAnimationFrame(nudge);
    const soon = window.setTimeout(nudge, 120);
    const later = window.setTimeout(nudge, 600);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(soon);
      window.clearTimeout(later);
    };
  }, []);

  // rare simulation events that React does need to know about
  useEffect(() => {
    setWorldHooks({
      onDeath: () => {
        sfx.wasted();
        useGraffiti.getState().die();
      },
      onRespawn: () => useGraffiti.getState().revive(),
      onWanted: (level) => {
        if (level > 0) sfx.spotFound();
      },
      onReload: () => sfx.reload(),
      onNotice: (title, body, tone) => useGraffiti.getState().toast({ title, body, tone }),
    });
    return () => setWorldHooks({});
  }, []);

  useEffect(() => {
    const detachKeys = attachInput({
      isActive: () => {
        const s = useGraffiti.getState();
        if (s.galleryOpen) return false;
        return s.phase === "playing" || s.phase === "reveal" || s.phase === "wasted";
      },
      onInteract: () => {
        const s = useGraffiti.getState();
        if (s.phase !== "playing" || !s.nearSpotId || player.dead) return;
        sfx.click();
        releasePointerLock();
        clearInput();
        s.openStudio(s.nearSpotId);
      },
      onEscape: () => {
        releasePointerLock();
        clearInput();
      },
      onToggleMute: () => useGraffiti.getState().toggleMute(),
      onPhoto: () => {
        const s = useGraffiti.getState();
        if (s.phase !== "playing" || player.dead) return;
        sfx.hover();
        setAiming(false);
        s.setPhotoMode(!s.photoMode);
      },
      onGallery: () => {
        const s = useGraffiti.getState();
        if (s.phase !== "playing" || player.dead) return;
        sfx.click();
        releasePointerLock();
        clearInput();
        s.openGallery(false);
      },
    });

    const el = host.current?.querySelector("canvas");
    const detachLook = el
      ? attachMouseLook(
          el as HTMLElement,
          () => {
        const s = useGraffiti.getState();
        return s.phase === "playing" && !s.galleryOpen;
      },
          (down) => setAiming(down),
        )
      : () => {};

    return () => {
      detachKeys();
      detachLook();
    };
  }, []);

  // never leave the pointer captured behind a modal
  useEffect(() => {
    if (frozen) {
      releasePointerLock();
      clearInput();
    }
  }, [frozen]);

  return (
    <div ref={host} className="absolute inset-0">
      <Canvas
        shadows="percentage"
        dpr={dpr}
        // "demand" rather than "never": nothing draws behind the studio unless
        // the studio's live street view asks for a frame
        frameloop={frozen || prewarming ? "demand" : "always"}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
        camera={{ fov: 55, near: 0.1, far: 600, position: [0, 24, -24] }}
        onCreated={(state) => {
          const { gl, scene } = state;
          // the crowd is drawn by this camera but not by the road's reflection
          state.camera.layers.enable(LAYER_NO_REFLECT);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          // Ambient occlusion and two vignettes all take light out of the
          // image, and the block was reading as a dark room rather than a
          // street at dusk — walls you were stood in front of were hard to
          // make out at all. A little over unity puts the sodium lamps and the
          // neon back without touching the grade.
          gl.toneMappingExposure = 1.16;
          scene.background = new THREE.Color("#1b1226");
          // the Lightformer rig exists to put highlights on metal and wet
          // tarmac, not to act as a second ambient light
          scene.environmentIntensity = 0.5;
          if (process.env.NODE_ENV === "development") {
            const w = window as unknown as { __nw?: unknown; __nwDebug?: unknown };
            w.__nw = state;
            w.__nwDebug = {
              playerState,
              world,
              player,
              input,
              store: useGraffiti,
              spots: GRAFFITI_SPOTS,
              insideAnyBox,
            };
          }
        }}
      >
        <Scene />
        <Prewarm active={prewarming} />
        <AdaptiveResolution dpr={dpr} max={maxDpr} onChange={setDpr} />
      </Canvas>
    </div>
  );
}

export default Game;
