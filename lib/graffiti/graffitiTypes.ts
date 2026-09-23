/** Every paintable surface in the city is described by one of these. */
export type SurfaceType = "wall" | "shutter" | "billboard" | "fence" | "vehicle";

export interface GraffitiSpot {
  id: string;
  /** Street name shown in the HUD and in the studio header. */
  name: string;
  district: string;
  /** World-space centre of the paintable plane. */
  position: [number, number, number];
  /** Euler rotation of the plane (radians). Y-rotation decides which way it faces. */
  rotation: [number, number, number];
  /** Metres, [width, height]. Drives the aspect ratio of the generated image. */
  size: [number, number];
  surfaceType: SurfaceType;
  /** Horizontal (XZ) distance at which the interaction prompt appears. */
  radius: number;
  /** Reputation awarded for painting this spot. */
  rep: number;
  /** Flavour line shown under the prompt. */
  hint: string;
  /** Deterministic seed so a surface looks identical every session. */
  seed: number;
}

export interface PaintedPiece {
  /** Data URL handed back by the Unlayer image editor. */
  graffitiTexture: string;
  paintedAt: number;
  /**
   * The piece as it actually looks in the street, grabbed off the renderer
   * during the reveal.
   *
   * The editor's flat canvas is the artwork; this is the artwork *on the wall*,
   * with the fog, the lamps and the grade on it. It is the thing worth putting
   * in the black book and the thing worth exporting, so the contact sheet
   * prefers it and falls back to the flat canvas when a grab failed.
   */
  wallShot?: string;
  /**
   * The piece as it was made: the flattened canvas each time the hand came to
   * rest in the studio, oldest first, as small JPEGs. The reveal replays it on
   * the wall and the black book films it. See `lib/graffiti/timelapse.ts`.
   */
  process?: string[];
}

export type GamePhase =
  | "menu"
  | "howto"
  | "trailer"
  | "entering"
  | "playing"
  | "editor"
  | "reveal"
  /** the camera flying the city from piece to piece — see `lib/game/tour.ts` */
  | "tour"
  | "wasted";

export interface Toast {
  id: number;
  title: string;
  body: string;
  tone: "acid" | "magenta" | "gold";
}
