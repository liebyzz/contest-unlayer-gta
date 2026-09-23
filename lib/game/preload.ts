/**
 * Builds the city before anyone asks to see it.
 *
 * Every texture in this game is drawn at runtime, and the bill for that lands
 * in one lump the moment the <Canvas> mounts: fourteen surface photographs at
 * a megapixel each, a normal map per facade design, the road, the pavement.
 * On this machine that is well over a second of blocked main thread, and the
 * player spends it looking at a black screen straight after the briefing.
 *
 * None of it has to happen then. The menu and the briefing are on screen for
 * several seconds doing almost nothing, so the work is spread across those
 * frames instead — one item per frame, so neither the menu animation nor the
 * trailer drops a beat. Everything here is cached by the module that makes it,
 * so the mount later finds it all sitting ready.
 */
import { BUILDINGS } from "./city";
import { fontsReady } from "./fonts";
import {
  asphaltTexture,
  concreteTexture,
  dirtTexture,
  facadeTexture,
  glowTexture,
  normalFromTexture,
  plankTexture,
} from "./facades";
import { GRAFFITI_SPOTS } from "@/lib/graffiti/spots";
import { surfaceImage } from "@/lib/graffiti/surfaces";

let running = false;

/**
 * How long to wait for the display face before building the city anyway.
 *
 * Every one of these textures paints text onto a canvas, and canvas text takes
 * whatever font is loaded *at the moment it draws* — there is no reflow later.
 * Warming started 60 ms after mount, which is well inside the window where the
 * webfont is still in flight, so the shop signs and all fourteen surface
 * photographs were being baked in the fallback face and then cached under that
 * for the rest of the session. Waiting costs nothing: the menu and the briefing
 * are several seconds of screen time before any of this is looked at.
 */
const FONT_WAIT_MS = 2500;

/** Starts warming. Safe to call more than once. Returns a cancel function. */
export function warmCity(): () => void {
  if (typeof window === "undefined" || running) return () => {};
  running = true;

  const jobs: (() => void)[] = [];

  const designs = new Set<string>();
  for (const b of BUILDINGS) {
    const key = `${b.style}:${b.tint}`;
    if (designs.has(key)) continue;
    designs.add(key);
    jobs.push(() => normalFromTexture(facadeTexture(b.style, b.tint).map, 2.6));
  }

  jobs.push(() => normalFromTexture(asphaltTexture(), 1.6));
  jobs.push(() => normalFromTexture(concreteTexture(), 1.9));
  jobs.push(() => {
    dirtTexture();
    plankTexture();
    glowTexture();
  });

  // the expensive ones: a full surface photograph per paintable wall
  for (const spot of GRAFFITI_SPOTS) jobs.push(() => void surfaceImage(spot));

  let i = 0;
  let cancelled = false;
  // A timer rather than requestAnimationFrame: rAF stops dead in a background
  // tab, and someone who opens the game and looks away for ten seconds should
  // come back to a city that is ready, not one that never started building.
  let timer = 0;
  const tick = () => {
    if (cancelled) return;
    if (i < jobs.length) {
      try {
        jobs[i]();
      } catch {
        // a warm-up that fails just means the mount pays for it instead
      }
      i += 1;
      timer = window.setTimeout(tick, 16);
    } else {
      running = false;
    }
  };

  const start = () => {
    if (cancelled) return;
    timer = window.setTimeout(tick, 16);
  };

  void fontsReady(FONT_WAIT_MS).then(start);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    running = false;
  };
}
