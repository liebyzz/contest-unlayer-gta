/**
 * The street, live, while the studio is open.
 *
 * The studio is a full-screen editor and the city behind it is stopped. That
 * is right for the editor and wrong for the piece: you are making something
 * for a wall at night, under a sodium lamp, seen from the pavement — and until
 * now the first time you saw it there was after you had committed to it.
 *
 * So the game keeps rendering that wall for you. Every so often the studio
 * hands over what is on the editor's canvas; it is hung on the wall at full
 * strength, the camera stands where the reveal will stand, one frame is drawn
 * through the whole post-processing stack and grabbed, and everything goes
 * back the way it was. The city does not advance: the canvas is on
 * `frameloop="demand"` while the studio is up, so nothing renders at all
 * between these frames.
 *
 * Plain module state rather than React, for the same reason as the rest of the
 * simulation: the renderer reads it inside `useFrame`.
 */
import * as THREE from "three";

interface PreviewJob {
  spotId: string;
  done: (url: string | null) => void;
}

export const wallPreview = {
  /** the wall the studio is open on, for as long as it is */
  spotId: null as string | null,
  /** the piece in progress, hung on that wall in place of whatever is there */
  texture: null as THREE.Texture | null,
  /** a frame has been asked for and not drawn yet */
  job: null as PreviewJob | null,
  /** true for the one frame the lens is standing at the wall */
  framing: false,
};

let wake: (() => void) | null = null;
let generation = 0;

/** The renderer registers how to ask it for a frame. */
export function bindWallPreview(invalidate: () => void) {
  wake = invalidate;
  return () => {
    if (wake === invalidate) wake = null;
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draw `spotId` as it would look with `image` on it, and hand back the frame.
 *
 * `image` null draws the wall as it stands — the bare surface, or the piece
 * already up there. `done` gets null if anything got in the way; a newer call
 * supersedes an older one that is still loading.
 */
export async function previewOnWall(
  spotId: string,
  image: string | null,
  done: (url: string | null) => void,
) {
  const mine = ++generation;
  let texture: THREE.Texture | null = null;
  if (image) {
    try {
      const img = await loadImage(image);
      if (mine !== generation) return done(null);
      texture = new THREE.Texture(img);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    } catch {
      return done(null);
    }
  }

  const previous = wallPreview.texture;
  wallPreview.spotId = spotId;
  if (texture) {
    wallPreview.texture = texture;
    // the wall swaps to the new one on the next frame; free the old after it
    if (previous) window.setTimeout(() => previous.dispose(), 1500);
  }

  if (!wake) return done(null);
  wallPreview.job?.done(null);
  wallPreview.job = { spotId, done };
  wake();
}

/** The studio has closed: put the wall back. */
export function endWallPreview() {
  generation++;
  wallPreview.job = null;
  wallPreview.spotId = null;
  wallPreview.framing = false;
  const texture = wallPreview.texture;
  wallPreview.texture = null;
  if (texture) window.setTimeout(() => texture.dispose(), 1500);
}
