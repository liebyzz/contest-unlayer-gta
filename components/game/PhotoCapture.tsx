"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { servePhoto } from "@/lib/game/photo";

/**
 * Serves a pending photo request from inside the render loop.
 *
 * Priority 2 is the whole point: `<EffectComposer>` takes over rendering at
 * priority 1, so this runs immediately after it has drawn the finished,
 * post-processed frame — the one moment the drawing buffer holds the picture
 * the player is actually looking at, and the reason the renderer does not need
 * `preserveDrawingBuffer` to pay for this all the time.
 */
export function PhotoCapture() {
  const gl = useThree((s) => s.gl);
  useFrame(() => servePhoto(gl), 2);
  return null;
}
