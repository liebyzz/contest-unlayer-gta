/**
 * Frame grabs out of the live renderer.
 *
 * Two things use this. The phone camera, so the player can photograph the city
 * and take the shot straight into the Unlayer editor as the base of the next
 * piece. And the reveal, which grabs the finished piece *on the wall* — the
 * flat canvas the editor hands back is the artwork, but the picture worth
 * keeping is that artwork hanging in the street with the fog and the sodium
 * lamps on it.
 *
 * Either way the capture is the renderer's own canvas *after* post-processing,
 * so a frame comes out with the bloom, the grade and the ambient occlusion on
 * it — it looks like the game, not like a debug grab. The HUD is DOM and never
 * touches the canvas, so the frame is clean without having to hide anything.
 *
 * Getting at that canvas is the fiddly part. `preserveDrawingBuffer` on the
 * renderer would make it readable at any moment, but it stops the driver
 * discarding the buffer between frames and measured out at 15 ms a frame here
 * against 6 — more than doubling the frame time for something used a handful
 * of times a session. So instead a request is parked, and served from inside
 * the render loop on the next frame, after the composer has drawn and while
 * the buffer is still intact.
 */
import type * as THREE from "three";

/** Longest edge of a saved frame. Full canvas size makes for enormous data URLs. */
const DEFAULT_WIDTH = 1024;

export interface CaptureOptions {
  /**
   * Region of the canvas to keep, in 0-1 units from the top left.
   *
   * The viewfinder draws a frame inside the letterbox bars and the player
   * composes to it, so the saved shot has to be that rectangle and not the
   * whole canvas — otherwise what you framed is not what you get.
   */
  crop?: { x: number; y: number; w: number; h: number };
  width?: number;
  /** 0-1. Wall shots are kept a little richer than phone snaps. */
  quality?: number;
}

interface Request extends CaptureOptions {
  done: (url: string | null) => void;
}

/**
 * A queue rather than a single slot: the reveal can ask for its wall shot on
 * the same frame the player is holding the shutter, and dropping one of the
 * two silently is the kind of bug that only shows up in someone else's
 * playthrough.
 */
const queue: Request[] = [];

/** Ask for a frame. The callback fires once the next one has been drawn. */
export function requestPhoto(done: (url: string | null) => void, options: CaptureOptions = {}) {
  queue.push({ ...options, done });
}

/** Driven from inside the render loop, at a priority that runs after the composer. */
export function servePhoto(gl: THREE.WebGLRenderer) {
  if (queue.length === 0) return;
  const pending = queue.splice(0, queue.length);
  for (const req of pending) {
    let url: string | null = null;
    try {
      url = captureFrom(gl, req);
    } catch {
      url = null;
    }
    req.done(url);
  }
}

function captureFrom(gl: THREE.WebGLRenderer, options: CaptureOptions): string | null {
  const canvas = gl.domElement;
  if (!canvas.width || !canvas.height) return null;

  const crop = options.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(canvas.width * crop.x);
  const sy = Math.round(canvas.height * crop.y);
  const sw = Math.max(1, Math.round(canvas.width * crop.w));
  const sh = Math.max(1, Math.round(canvas.height * crop.h));

  const w = Math.min(options.width ?? DEFAULT_WIDTH, sw);
  const h = Math.max(1, Math.round((sh / sw) * w));

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, w, h);
  return out.toDataURL("image/jpeg", options.quality ?? 0.86);
}
