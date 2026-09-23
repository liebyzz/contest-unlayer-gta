"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImageEditor, { type ImageEditorOptions, type ImageEditorRef } from "@unlayer/react-image-editor";
import { DEFAULT_TAG, useGraffiti } from "@/lib/graffiti/graffitiStore";
import { SPOT_BY_ID } from "@/lib/graffiti/spots";
import {
  TAG_STYLES,
  cleanTag,
  composeArtOnSurface,
  fitToSurface,
  surfaceImage,
  tagDraft as draftTag,
  tagPiece,
} from "@/lib/graffiti/surfaces";
import { sfx } from "@/lib/game/audio";
import { endWallPreview, previewOnWall } from "@/lib/game/wallPreview";
import { STOP_MOTION_MIN_FRAMES, createProcessRecorder } from "@/lib/graffiti/timelapse";

const SURFACE_LABEL: Record<string, string> = {
  wall: "BRICK / CONCRETE WALL",
  shutter: "ROLLER SHUTTER",
  billboard: "PASTE-UP BILLBOARD",
  fence: "PLYWOOD HOARDING",
  vehicle: "VEHICLE PANEL",
};

const TOOL_NOTES: [string, string][] = [
  ["SPRAY", "Loaded with a spray nozzle — Pencil for a hard line"],
  ["TEXT", "Letters, outlines, shadows"],
  ["STICKERS", "Drop in shapes and marks"],
  ["SHAPES", "Fills, gradients, outlines"],
  ["FILTER", "Push the colour till it pops"],
  ["CROP", "Frame it — it still fits the wall"],
];

/** A rack of cans, one cap colour each — purely so the tool list reads as paint. */
const CAN_CAPS = ["#c8ff32", "#ff2f86", "#22e0ff", "#ffc542", "#ff8b3d", "#f6f1e8"];

/**
 * The rack, as actual paint.
 *
 * The editor ships its draw tool loaded with a red that is all but invisible
 * on brick — the first thing a new player does is pick Spray, drag, and see
 * almost nothing happen. These are the city's own colours, and clicking one
 * loads it into the editor's brush. `hex` is what goes into the editor; the
 * name is what a can would have on it.
 */
const CANS: { hex: string; name: string }[] = [
  { hex: "#c8ff32", name: "Acid" },
  { hex: "#ff2f86", name: "Hot pink" },
  { hex: "#22e0ff", name: "Ice" },
  { hex: "#ffc542", name: "Gold" },
  { hex: "#ff8b3d", name: "Sodium" },
  { hex: "#f6f1e8", name: "Chrome white" },
  { hex: "#9d4bff", name: "Violet" },
  { hex: "#0b0710", name: "Outline black" },
];

/** The can the studio opens with — anything but the editor's default red. */
const DEFAULT_CAN = CANS[0].hex;

/**
 * The freehand tool is renamed Spray below, and gets a can to match. The editor
 * takes raw SVG for a tool icon; `currentColor` lets it follow the rail's own
 * hover and active states.
 */
const SPRAY_CAN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M5 11.5a2.5 2.5 0 0 1 2.5-2.5h5a2.5 2.5 0 0 1 2.5 2.5V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>' +
  '<path d="M7.5 9V6.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V9"/>' +
  '<path d="M10 5V2.5h2.8"/>' +
  '<path d="M5 14.5h10"/>' +
  '<g fill="currentColor" stroke="none"><circle cx="16.6" cy="2.6" r="1"/><circle cx="19.6" cy="4.4" r="1"/>' +
  '<circle cx="16.9" cy="6.4" r="0.9"/><circle cx="21.6" cy="2" r="0.8"/><circle cx="21" cy="7.2" r="0.8"/></g>' +
  "</svg>";

/**
 * The editor's own toolbar says Save and Cancel, and the studio's footer says
 * PAINT THE WALL and CANCEL. Two vocabularies for the same two actions made the
 * pair look like different things, so the editor is told to speak the game's.
 *
 * Declared once at module scope: `options` is compared by value, and anything
 * but theme/locale/translations changing would remount the editor.
 */
const EDITOR_OPTIONS: ImageEditorOptions = {
  theme: "dark",
  features: {
    imageEditor: {
      tools: {
        draw: { icon: SPRAY_CAN_ICON },
      },
    },
  },
  translations: {
    en: {
      "image_editor.toolbar.save": "Paint the wall",
      "image_editor.toolbar.cancel": "Leave",
      // the freehand tool is a can here; its spray brush is the one to reach for
      "image_editor.tools.draw": "Spray",
    },
  },
};

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wall-bg grain absolute inset-0 z-50 flex flex-col backdrop-blur-xl">
      {children}
    </div>
  );
}

/**
 * One panel on the rail: a card taped to the wall rather than a HUD chip.
 *
 * The tiny rotation is the whole trick — nothing stuck up by hand is ever
 * square to anything, and half a degree is enough for the eye to register that
 * without the layout noticing.
 */
function Card({
  title,
  accent = "var(--ash)",
  tilt = 0,
  aside,
  callout = false,
  ref,
  children,
}: {
  title: string;
  accent?: string;
  tilt?: number;
  aside?: React.ReactNode;
  /** light the card up: this is where to start */
  callout?: boolean;
  ref?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      className="paper-card p-4"
      style={{
        transform: `rotate(${tilt}deg)`,
        animation: callout ? "nw-callout 0.9s ease-in-out infinite" : undefined,
      }}
    >
      <span className="tape tape-tl" />
      <span className="tape tape-br" />
      <div className="flex items-start justify-between gap-3">
        <span className="marker drip text-[15px] leading-none" style={{ color: accent }}>
          {title}
        </span>
        {aside}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** The pulsing tally light on the street view. */
function LiveBadge({ busy }: { busy: boolean }) {
  return (
    <span className="mono flex shrink-0 items-center gap-1.5 text-[9px] text-magenta">
      <span
        className="inline-block h-[7px] w-[7px] rounded-full bg-magenta"
        style={{
          boxShadow: "0 0 10px var(--magenta)",
          animation: `nw-pulse ${busy ? 0.5 : 1.6}s ease-in-out infinite`,
        }}
      />
      LIVE
    </span>
  );
}

/**
 * The wall, at night, with the piece in progress on it — rendered by the game
 * rather than faked in CSS. See `lib/game/wallPreview.ts`.
 */
function StreetView({
  shot,
  busy,
  onOpen,
  className = "",
}: {
  shot: string | null;
  busy: boolean;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className={`group relative block w-full overflow-hidden border border-white/10 bg-black/60 outline-none transition-colors hover:border-acid/60 focus-visible:border-acid ${className}`}
    >
      {shot ? (
        // a frame grabbed off the renderer — nothing for next/image to do
        // eslint-disable-next-line @next/next/no-img-element
        <img key={shot.length} src={shot} alt="" className="anim-develop h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span
            className="h-6 w-6 rounded-full border-2 border-acid/25 border-t-acid"
            style={{ animation: "nw-spin 0.9s linear infinite" }}
          />
          <span className="mono text-[9px] text-ash/70">LIGHTING THE STREET…</span>
        </span>
      )}
      {busy && shot && (
        <span className="absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-white/10">
          <span
            className="block h-full w-1/3 bg-magenta"
            style={{ animation: "nw-scan 0.9s linear infinite" }}
          />
        </span>
      )}
      {onOpen && (
        <span className="mono absolute bottom-1 right-1 bg-ink/85 px-1.5 py-[2px] text-[8px] text-ash/90 transition-colors group-hover:text-acid">
          ⤢ BIGGER
        </span>
      )}
    </button>
  );
}

/**
 * Set a slider the editor owns, the way a hand on it would.
 *
 * The value has to go through the prototype's setter or a React-controlled
 * input ignores the event and snaps back.
 */
function setRange(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/* ── reaching into the editor ─────────────────────────────────────────────
 *
 * Everything below drives the editor through the test ids its own panels
 * carry, the way a hand on the mouse would. If a future editor renames them
 * none of it matches, nothing throws, and the tool simply behaves the way the
 * editor ships it.
 */
const byTestId = <T extends Element>(id: string) =>
  document.querySelector<T>(`[data-testid="${id}"]`);
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

/** Open the Spray panel if it isn't already up. Resolves once it is. */
async function openSprayPanel() {
  if (byTestId("native-draw-panel")) return true;
  byTestId<HTMLButtonElement>("native-tool-draw")?.click();
  for (let i = 0; i < 20; i++) {
    await nextFrame();
    if (byTestId("native-draw-panel")) return true;
  }
  return false;
}

/**
 * Load a colour into the editor's brush.
 *
 * The swatch is a button that opens a popover holding a hex field; the field
 * is React-controlled, so the value has to go in through the prototype's
 * setter or the editor ignores it and snaps back.
 */
async function loadCan(hex: string) {
  if (!(await openSprayPanel())) return false;
  const want = hex.toLowerCase();
  const loaded = () =>
    byTestId<HTMLButtonElement>("native-draw-color")?.dataset.value?.toLowerCase() === want;

  // The popover's dismiss listens on the document, so a click that arrives
  // while the one that opened this is still propagating closes it again.
  await nextFrame();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (loaded()) return true;
    const swatch = byTestId<HTMLButtonElement>("native-draw-color");
    if (!swatch) return false;

    if (!byTestId("native-draw-color-hex")) {
      swatch.click();
      for (let i = 0; i < 12 && !byTestId("native-draw-color-hex"); i++) await nextFrame();
    }
    const field = byTestId<HTMLInputElement>("native-draw-color-hex");
    if (!field) return false;

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, hex.replace("#", ""));
    field.dispatchEvent(new Event("input", { bubbles: true }));
    // The field holds a draft and only commits the colour on Enter — typing
    // six characters into it and walking away leaves the brush on whatever it
    // was, which is the whole bug this rack exists to fix.
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.blur();
    await nextFrame();
    await nextFrame();
  }

  // put the popover away again — the swatch itself toggles it
  if (byTestId("native-draw-color-hex")) byTestId<HTMLButtonElement>("native-draw-color")?.click();
  return loaded();
}

/**
 * The editor's draw tool is renamed Spray here and wears a can — and then
 * opened as a 1px pencil loaded with red, which is the first thing anyone who
 * clicks it finds out. Red on brick is all but invisible, and a 1px pencil on
 * a shutter is a scratch: between them they make the headline tool of the
 * whole game look broken on first use.
 *
 * So the first time its panel comes up on a visit to a wall, the brush is
 * switched to the editor's own spray, given a nozzle wide enough to read on a
 * shutter, and loaded with the acid green the city is lit in. Once only: pick
 * Pencil and a red after that and that is what stays.
 *
 * Found through the panel's test ids. If a future editor renames them this
 * simply never matches, and the tool opens the way the editor ships it.
 */
function useLoadedCan(ready: boolean, can: React.RefObject<string>) {
  useEffect(() => {
    if (!ready) return;
    let seen = false;
    let alive = true;
    let timer = 0;
    const q = <T extends Element>(id: string) =>
      document.querySelector<T>(`[data-testid="${id}"]`);
    const frame = () => new Promise((r) => requestAnimationFrame(r));

    // The panel initialises its own brush a moment after it mounts, and a
    // choice made before that is quietly put back to Pencil — so wait for it
    // to settle, then check the choice actually held, and try again if not.
    const load = async () => {
      for (let attempt = 0; attempt < 3 && alive; attempt++) {
        const type = q<HTMLButtonElement>("native-draw-brush-type");
        if (!type || type.dataset.value !== "pencil") return;
        if (!q("native-draw-brush-menu")) type.click();
        await frame();
        q<HTMLButtonElement>("native-draw-brush-option-spray")?.click();
        await frame();
        await frame();
        if (q<HTMLButtonElement>("native-draw-brush-type")?.dataset.value === "spray") {
          const size = q<HTMLInputElement>("native-draw-size");
          if (size && Number(size.value) < 20) setRange(size, 28);
          // ...and a colour you can actually see on a wall.
          //
          // Whatever is in the rack, not a constant: opening the panel is
          // exactly what picking a can off the rack does when the panel is
          // shut, so a constant here raced that click and put the default
          // back over the colour the player had just chosen.
          if (alive) await loadCan(can.current);
          return;
        }
        await new Promise((r) => window.setTimeout(r, 120));
      }
    };

    const observer = new MutationObserver(() => {
      if (seen || !q("native-draw-brush-type")) return;
      seen = true;
      observer.disconnect();
      timer = window.setTimeout(() => void load(), 160);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      alive = false;
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [ready, can]);
}

/**
 * One PAINT THE WALL on the screen, not two.
 *
 * The editor's toolbar carries its own save and cancel, and this studio wraps
 * it in a header that says ESC · LEAVE THE WALL and a footer that says Cancel
 * and PAINT THE WALL. Teaching the editor the game's words (see
 * `EDITOR_OPTIONS`) stopped them reading as four different actions — and left
 * the player looking at the same two words twice, forty centimetres apart,
 * which is worse. The footer is the one that belongs to the game, so the
 * toolbar's pair steps back and its row keeps only the tool controls.
 *
 * Matched on the labels the translations above put there, so a toolbar that
 * ever stops carrying them is simply left alone — both buttons still work,
 * and both are still wired to `paint` and `requestLeave`.
 */
const DUPLICATE_ACTIONS = new Set(["paint the wall", "leave"]);

function useOneCallToAction(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const root = document.querySelector(".image-editor-root");
    if (!root) return;

    const mark = () => {
      if (!alive) return;
      for (const b of root.querySelectorAll<HTMLButtonElement>("button")) {
        if (b.dataset.nwDuplicate) continue;
        const label = (b.textContent ?? "").trim().toLowerCase();
        if (DUPLICATE_ACTIONS.has(label)) b.dataset.nwDuplicate = "1";
      }
    };
    mark();
    // the toolbar re-renders (undo/redo state, tool changes) and brings them back
    const observer = new MutationObserver(mark);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [ready]);
}

/** Is this keystroke meant for a text field rather than for the studio? */
function typingInto(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export function GraffitiStudio() {
  const activeSpotId = useGraffiti((s) => s.activeSpotId);
  const closeStudio = useGraffiti((s) => s.closeStudio);
  const paintSpot = useGraffiti((s) => s.paintSpot);
  const photos = useGraffiti((s) => s.photos);
  const storedTag = useGraffiti((s) => s.tag);
  const setTag = useGraffiti((s) => s.setTag);
  const alreadyPainted = useGraffiti((s) =>
    activeSpotId ? s.painted[activeSpotId] : undefined,
  );

  const spot = activeSpotId ? SPOT_BY_ID.get(activeSpotId) : undefined;

  const base = useMemo(() => (spot ? surfaceImage(spot) : ""), [spot]);
  // The studio is keyed on the spot id by its parent, so this initialiser runs
  // fresh for every wall: start from the piece already up there, or the bare
  // surface if it has never been hit.
  //
  // It is the editor's *mount* image and never changes after that. Loading a
  // tag, a photo or an import goes through `reset()` directly — changing this
  // prop as well used to reset the editor twice for every click.
  const [initialImage] = useState(() => alreadyPainted?.graffitiTexture ?? base);
  /** what is on the canvas, as far as the studio knows — the offline fallback shows it */
  const [preview, setPreview] = useState(initialImage);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [painting, setPainting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** the street view: the latest frame, whether one is being drawn, and the big version */
  const [street, setStreet] = useState<string | null>(null);
  const [streetBusy, setStreetBusy] = useState(false);
  const [streetOpen, setStreetOpen] = useState(false);
  const previewRef = useRef(initialImage);
  /** something may have changed on the canvas since the street was last drawn */
  const streetDirty = useRef(false);
  const streetInput = useRef(0);
  const editorRef = useRef<ImageEditorRef>(null);
  const paintingRef = useRef(false);
  /**
   * Something was dropped onto the surface from the rail.
   *
   * `reset()` clears the editor's history, so `hasChanges()` reports a clean
   * canvas straight after a tag or a photo lands — even though what is on it is
   * nothing like what is on the wall. This remembers that it isn't.
   */
  const seeded = useRef(false);
  /**
   * The rack.
   *
   * Which can is loaded, and the click that loads it: picking one opens the
   * Spray panel if it isn't up and puts the colour in the editor's brush, so
   * a can in the tray and the brush on the canvas are the same object. The
   * ref is what the panel's own first-open setup reads, so the two never
   * disagree about which can is in hand.
   */
  const [can, setCan] = useState(DEFAULT_CAN);
  const canRef = useRef(DEFAULT_CAN);
  const pickCan = useCallback((hex: string) => {
    sfx.hover();
    setCan(hex);
    canRef.current = hex;
    void loadCan(hex);
  }, []);

  useLoadedCan(ready, canRef);
  useOneCallToAction(ready);
  /**
   * The time-lapse: every settled state of the canvas, in order, starting from
   * the surface the editor opened on. The reveal replays it on the wall and the
   * black book films it.
   */
  const [steps, setSteps] = useState(0);
  const [timelapse] = useState(() => createProcessRecorder((n) => setSteps(n)));
  useEffect(() => {
    void timelapse.record(initialImage);
  }, [timelapse, initialImage]);

  /* ── the writer's tag ─────────────────────────────────────────────────── */
  const [tagDraft, setTagDraft] = useState(storedTag);
  const [tagSeed, setTagSeed] = useState(1);
  const [tagWord, setTagWord] = useState(storedTag || DEFAULT_TAG);
  // Redrawing four canvases on every keystroke is visible lag, so the pieces
  // follow the field a beat behind.
  useEffect(() => {
    const t = window.setTimeout(() => setTagWord(cleanTag(tagDraft) || DEFAULT_TAG), 220);
    return () => window.clearTimeout(t);
  }, [tagDraft]);

  const tagTiles = useMemo(
    () =>
      TAG_STYLES.map((style, i) => ({
        ...style,
        src: tagPiece(tagWord, style.id, tagSeed * 31 + i * 7, 640, 330),
      })),
    [tagWord, tagSeed],
  );

  const loadArt = useCallback(
    async (src: string) => {
      if (!spot) return;
      setBusy(true);
      try {
        const composed = await composeArtOnSurface(spot, src);
        seeded.current = true;
        setPreview(composed);
        previewRef.current = composed;
        await editorRef.current?.editor?.reset(composed);
      } finally {
        setBusy(false);
        streetDirty.current = true;
        streetInput.current = performance.now();
      }
    },
    [spot],
  );

  const onFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") void loadArt(reader.result);
      };
      reader.readAsDataURL(file);
    },
    [loadArt],
  );

  const reset = useCallback(() => {
    sfx.back();
    seeded.current = false;
    setPreview(base);
    previewRef.current = base;
    void Promise.resolve(editorRef.current?.editor?.reset(base)).finally(() => {
      streetDirty.current = true;
      streetInput.current = performance.now();
    });
  }, [base]);

  /** PAINT THE WALL was pressed with nothing done to the wall */
  const [bare, setBare] = useState(false);
  const tagCard = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bare) return;
    tagCard.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = window.setTimeout(() => setBare(false), 3400);
    return () => window.clearTimeout(t);
  }, [bare]);

  const paint = useCallback(
    async (fromSave?: string) => {
      if (!spot || paintingRef.current) return;
      // Nothing has been done to the surface since the studio opened. Painting
      // now would put up the bare wall — a reveal of nothing, and a PIECE
      // CREATED for it — which is exactly what a first-timer's first press of
      // the biggest button on the screen does. Point at where to start instead.
      let untouched = !seeded.current;
      try {
        untouched = untouched && !editorRef.current?.editor?.hasChanges();
      } catch {
        /* an editor that can't answer is treated as untouched */
      }
      if (untouched) {
        sfx.back();
        setConfirmLeave(false);
        setBare(true);
        return;
      }
      paintingRef.current = true;
      setPainting(true);
      setConfirmLeave(false);
      sfx.spray(0.9);
      // the flattened canvas straight out of the editor — this data URL is the
      // texture that gets hung on the wall
      const fromEditor = fromSave ?? editorRef.current?.editor?.getImage();
      const raw = fromEditor && fromEditor.length > 64 ? fromEditor : preview;
      // A crop, a resize or a quarter turn in the editor changes the shape of
      // the picture; the wall stays the shape it is.
      const [fitted] = await Promise.all([fitToSurface(spot, raw), wait(260)]);
      // the last step of the time-lapse is exactly what goes on the wall
      void timelapse.record(fitted);
      const film = await timelapse.finish();
      paintSpot(spot.id, fitted, film.length >= 2 ? film : undefined);
    },
    [spot, preview, paintSpot, timelapse],
  );

  const leave = useCallback(() => {
    sfx.back();
    setConfirmLeave(false);
    closeStudio();
  }, [closeStudio]);

  /**
   * Every way out of the studio comes through here: ESC, the header button,
   * CANCEL in the footer and the editor's own toolbar. Walking away from a
   * piece that isn't on the wall yet throws it away, so that asks first.
   */
  const requestLeave = useCallback(() => {
    if (paintingRef.current) return;
    let dirty = seeded.current;
    try {
      dirty = dirty || Boolean(editorRef.current?.editor?.hasChanges());
    } catch {
      /* an editor that can't answer has nothing worth keeping */
    }
    if (dirty) {
      sfx.hover();
      setConfirmLeave(true);
    } else {
      leave();
    }
  }, [leave]);

  /*
   * The live street view.
   *
   * Drawn once as the studio opens — the wall as it stands tonight — and then
   * again whenever the canvas may have changed: a stroke finished, a key let
   * go, a slider released, a tag or photo dropped in from the rail. Never
   * mid-gesture, and only once the hand has been still for a moment, because
   * flattening the editor's canvas costs a few tens of milliseconds and there
   * is no reason to spend them while someone is drawing.
   */
  useEffect(() => {
    if (!spot) return;
    let alive = true;
    let inflight = false;
    let first = true;
    let pointerDown = false;
    let lastImage: string | null = null;

    const touched = () => {
      streetDirty.current = true;
      streetInput.current = performance.now();
    };
    const onDown = () => {
      pointerDown = true;
      streetInput.current = performance.now();
    };
    const onUp = () => {
      pointerDown = false;
      touched();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("keyup", touched, true);

    const draw = (image: string | null) => {
      inflight = true;
      setStreetBusy(true);
      // a frame that never comes back (a lost context, a hidden tab) must not
      // wedge the view for the rest of the visit
      const guard = window.setTimeout(() => {
        inflight = false;
        if (alive) setStreetBusy(false);
      }, 4000);
      void previewOnWall(spot.id, image, (url) => {
        window.clearTimeout(guard);
        inflight = false;
        if (!alive) return;
        setStreetBusy(false);
        if (url) setStreet(url);
      });
    };

    const tick = async () => {
      if (!alive || inflight) return;
      if (first) {
        first = false;
        draw(null);
        return;
      }
      if (!streetDirty.current || pointerDown) return;
      if (performance.now() - streetInput.current < 420) return;
      streetDirty.current = false;

      let image: string | null = null;
      try {
        image = editorRef.current?.editor?.getImage() ?? null;
      } catch {
        image = null;
      }
      if (!image || image.length < 64) image = previewRef.current;
      if (!image || image === lastImage) return;
      lastImage = image;

      inflight = true;
      // exactly what PAINT THE WALL would hang there
      const fitted = await fitToSurface(spot, image);
      inflight = false;
      if (!alive) return;
      void timelapse.record(fitted);
      draw(fitted);
    };
    const id = window.setInterval(() => void tick(), 350);

    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keyup", touched, true);
      endWallPreview();
    };
  }, [spot, timelapse]);

  // ESC belongs to the editor first — finishing a text layer, closing a colour
  // picker. This used to listen in the capture phase and stop the event dead,
  // so the editor never saw the key at all and the studio closed from under
  // the player, taking the piece with it. Now it listens *after* the editor
  // (bubble phase), stands aside for anything the editor has already handled
  // or anything being typed, and even then only asks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (confirmLeave) {
        setConfirmLeave(false);
        return;
      }
      if (streetOpen) {
        setStreetOpen(false);
        return;
      }
      if (e.defaultPrevented || typingInto(e.target)) return;
      requestLeave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmLeave, streetOpen, requestLeave]);

  if (!spot) return null;

  return (
    <StudioShell>
      {/* ── header ───────────────────────────────────────────────────── */}
      <header className="anim-rise flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-white/10 bg-ink/55 px-5 py-3 md:px-8">
        <div className="overspray flex items-baseline gap-3">
          <h1
            className="marker relative text-[26px] leading-none text-paper md:text-[32px]"
            style={{ transform: "rotate(-1.6deg)" }}
          >
            Graffiti <span className="text-acid neon-text">Studio</span>
          </h1>
          <span className="mono hidden text-[10px] text-ash/70 sm:inline">
            @unlayer/react-image-editor
          </span>
        </div>

        <div className="flex items-center gap-3 border-l border-white/10 pl-6">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-magenta" />
          <div>
            <p className="marker text-[17px] leading-none text-paper">{spot.name}</p>
            <p className="mono mt-1 text-[9px] text-ash">
              {spot.district} · {SURFACE_LABEL[spot.surfaceType]} · +{spot.rep} REP
            </p>
          </div>
        </div>

        <button
          onClick={requestLeave}
          className="mono ml-auto border border-white/15 px-3 py-1.5 text-[10px] text-ash transition-colors hover:border-white/40 hover:text-paper"
        >
          ESC · LEAVE THE WALL
        </button>
      </header>

      {/* ── body ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row md:p-6">
        {/* rail */}
        {/* The rail is taller than the viewport on a laptop. Softening the cut
            at the bottom is what tells you there is more of it below. */}
        <aside
          className="anim-rise flex w-full shrink-0 flex-col gap-4 overflow-y-auto px-1 pb-8 pt-2 md:w-[292px]"
          style={{
            maskImage: "linear-gradient(to bottom, #000 calc(100% - 34px), transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 34px), transparent 100%)",
          }}
        >
          <Card
            title="On the street"
            accent="var(--acid)"
            tilt={-0.4}
            aside={<LiveBadge busy={streetBusy} />}
          >
            <StreetView
              shot={street}
              busy={streetBusy}
              className="mt-2 aspect-[16/10]"
              onOpen={() => {
                sfx.hover();
                setStreetOpen(true);
              }}
            />
            <div className="mt-2 flex items-center gap-2 border border-white/10 bg-black/35 px-2 py-1.5">
              <span
                className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-[#ff3b3b]"
                style={{ boxShadow: "0 0 8px #ff3b3b", animation: "nw-pulse 1.2s ease-in-out infinite" }}
              />
              <span className="mono text-[9px] text-paper/90">TIME-LAPSE</span>
              <span key={steps} className="mono anim-pop ml-auto text-[9px] text-acid">
                {Math.max(0, steps - 1)} {steps === 2 ? "STEP" : "STEPS"}
              </span>
            </div>
            {/* The wall needs a few settled states before replaying them is a
                film rather than a flicker, so below that it does not replay at
                all — and the quickest route through the studio (drop a tag,
                paint) lands exactly one step short of it. Left silent, the
                best thing in the game is a feature that quietly does not
                happen on a first visit. This says how close it is. */}
            {steps < STOP_MOTION_MIN_FRAMES && (
              <p className="mono mt-1 text-[9px] leading-relaxed text-gold/75">
                {steps < 2
                  ? "MAKE A MARK AND THE WALL REPLAYS IT"
                  : "ONE MORE EDIT AND THE WALL REPLAYS THE WHOLE PIECE"}
              </p>
            )}
            {/* the explanations give way on a short laptop screen, so all four
                of the writer's tags fit above the fold */}
            <p className="mt-2 text-[11px] leading-relaxed text-ash [@media(max-height:820px)]:hidden">
              <span className="text-paper">{spot.name}</span>, tonight — drawn by the game engine
              while you work. Every step is filmed, and replays on the wall when you paint it.
            </p>
            <p className="marker mt-1.5 text-[13px] leading-snug text-ash/75">“{spot.hint}”</p>
          </Card>

          <Card
            ref={tagCard}
            callout={bare}
            title="Your tag"
            accent="var(--paper)"
            tilt={0.35}
            aside={
              <button
                onClick={reset}
                className="mono shrink-0 text-[9px] text-ash/70 underline-offset-2 hover:text-paper hover:underline"
              >
                RESET SURFACE
              </button>
            }
          >
            <div className="mt-2 flex items-stretch gap-2">
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(draftTag(e.target.value))}
                onBlur={() => setTag(tagDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder={DEFAULT_TAG}
                maxLength={10}
                spellCheck={false}
                aria-label="Your tag"
                className="display min-w-0 flex-1 border border-white/15 bg-black/40 px-2.5 py-1.5 text-[16px] tracking-[0.12em] text-paper outline-none placeholder:text-ash/40 focus:border-acid/70"
              />
              <button
                onClick={() => {
                  sfx.hover();
                  setTagSeed((s) => s + 1);
                }}
                title="New colours"
                className="mono shrink-0 border border-white/15 px-2.5 text-[10px] text-ash transition-colors hover:border-acid/60 hover:text-acid"
              >
                SHUFFLE
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {tagTiles.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    sfx.hover();
                    if (tagDraft !== storedTag) setTag(tagDraft);
                    void loadArt(t.src);
                  }}
                  className="group relative aspect-[2/1] overflow-hidden border border-white/10 bg-black/40 transition-colors hover:border-acid/70"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.src} alt={`${tagWord} in ${t.label}`} className="h-full w-full object-contain p-1" />
                  <span className="mono absolute bottom-0 left-0 bg-ink/80 px-1 py-[1px] text-[7px] text-ash/80">
                    {t.label}
                  </span>
                  <span className="absolute inset-0 bg-acid/0 transition-colors group-hover:bg-acid/10" />
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-ash/70 [@media(max-height:820px)]:hidden">
              Drawn fresh from whatever you type. Drop one on the wall, then work over it.
            </p>
          </Card>

          <Card title="Bring your own" accent="var(--cyan)" tilt={-0.5}>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-cyan/45 bg-cyan/5 px-3 py-3 transition-colors hover:border-cyan hover:bg-cyan/10">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <span className="display text-[13px] tracking-[0.12em] text-cyan">
                IMPORT AN IMAGE
              </span>
            </label>
            <p className="mt-2 text-[10px] leading-relaxed text-ash/70">
              Dropped straight onto the surface, blended with the wall — then crop, filter and
              draw over it in the editor.
            </p>
          </Card>

          {photos.length > 0 && (
            <Card
              title="Your photos"
              accent="var(--magenta)"
              tilt={0.45}
              aside={<span className="mono shrink-0 text-[9px] text-ash/60">C IN THE CITY</span>}
            >
              <div className="mt-2 grid grid-cols-2 gap-2">
                {photos.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      sfx.hover();
                      void loadArt(src);
                    }}
                    className="group relative aspect-[16/10] overflow-hidden border border-white/10 bg-black/40 transition-colors hover:border-magenta/70"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 bg-magenta/0 transition-colors group-hover:bg-magenta/15" />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-ash/70">
                Shots you took out there. Drop one on the wall and paint over it.
              </p>
            </Card>
          )}

          <Card title="What each tool does" accent="var(--paper)" tilt={-0.5}>
            <div className="mt-2 grid gap-2">
              {TOOL_NOTES.map(([tool, note], i) => (
                <div key={tool} className="flex items-baseline gap-2.5">
                  {/* a cap of a different colour on every can */}
                  <span
                    className="mt-[3px] inline-block h-[9px] w-[9px] shrink-0 rounded-[2px]"
                    style={{ background: CAN_CAPS[i % CAN_CAPS.length] }}
                  />
                  <span className="stencil min-w-[58px] text-[9px] text-paper/85">{tool}</span>
                  <span className="text-[10px] leading-tight text-ash/80">{note}</span>
                </div>
              ))}
            </div>
          </Card>
        </aside>

        {/* the editor itself */}
        <section
          className="anim-rise relative min-h-[420px] flex-1"
          style={{ animationDelay: "90ms" }}
        >
          {/* the working surface is stuck up on the same wall as the rail */}
          <span className="tape" style={{ top: -8, left: 28, transform: "rotate(-3deg)", zIndex: 2 }} />
          <span className="tape" style={{ top: -8, right: 28, transform: "rotate(2deg)", zIndex: 2 }} />
          <div className="studio-frame h-full w-full">
            {!failed ? (
              <ImageEditor
                ref={editorRef}
                image={initialImage}
                minHeight="100%"
                style={{ height: "100%", width: "100%" }}
                options={EDITOR_OPTIONS}
                onLoad={() => setReady(true)}
                onError={() => setFailed(true)}
                onSave={({ dataUrl }) => void paint(dataUrl)}
                onCancel={requestLeave}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="the surface"
                  className="max-h-[46vh] border border-white/10 object-contain"
                />
                <div>
                  <p className="display text-[17px] text-magenta">EDITOR OFFLINE</p>
                  <p className="mt-1 max-w-[420px] text-[12px] text-ash">
                    The Unlayer editor bundle could not be reached. You can still drop your tag,
                    a photo or an imported picture from the rail and paint the wall with it.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* boot veil */}
          {!ready && !failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/90">
              <div
                className="h-9 w-9 rounded-full border-2 border-acid/25 border-t-acid"
                style={{ animation: "nw-spin 0.9s linear infinite" }}
              />
              <p className="marker text-[16px] text-acid">Shaking the can…</p>
              <p className="mono text-[10px] text-ash/60">loading the image editor</p>
            </div>
          )}

          {busy && (
            <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-white/10">
              <span
                className="block h-full w-1/3 bg-acid"
                style={{ animation: "nw-scan 0.9s linear infinite" }}
              />
            </div>
          )}
        </section>
      </div>

      {/* ── action bar ───────────────────────────────────────────────── */}
      <footer className="anim-rise flex flex-wrap items-center gap-4 border-t border-white/10 bg-ink/80 px-5 py-4 md:px-8">
        <button
          onClick={requestLeave}
          className="corner-cut border border-paper/25 px-6 py-3 text-paper/75 transition-colors hover:border-paper/60 hover:text-paper"
        >
          <span className="marker text-[17px] leading-none">Cancel</span>
        </button>

        {/* ── the rack ──────────────────────────────────────────────────
            Along the bottom of the studio rather than on the rail, because
            the rail is taller than a laptop screen and this is the thing a
            player reaches for the moment they pick up Spray — it cannot be
            two scrolls down. Here it is a paint tray under the canvas, on
            screen the whole time. */}
        <div className="flex items-center gap-3 border-l border-white/10 pl-4">
          <div className="flex items-end gap-[5px]">
            {CANS.map((c) => {
              const on = c.hex === can;
              return (
                <button
                  key={c.hex}
                  onClick={() => pickCan(c.hex)}
                  title={`${c.name} — load it into the spray can`}
                  aria-label={`${c.name} spray paint`}
                  aria-pressed={on}
                  className="group relative flex h-[38px] w-[15px] flex-col items-stretch outline-none transition-transform hover:-translate-y-[3px] focus-visible:-translate-y-[3px]"
                  style={{ transform: on ? "translateY(-4px)" : undefined }}
                >
                  {/* cap */}
                  <span
                    className="mx-auto block h-[5px] w-[8px] rounded-t-[2px]"
                    style={{ background: c.hex, opacity: on ? 1 : 0.7 }}
                  />
                  {/* body, with the colour banded across it */}
                  <span
                    className="relative mt-[1px] block flex-1 rounded-[2px] border"
                    style={{
                      background:
                        "linear-gradient(103deg, rgba(255,255,255,0.16), rgba(0,0,0,0.45))",
                      borderColor: on ? c.hex : "rgba(246,241,232,0.18)",
                      boxShadow: on ? `0 0 11px ${c.hex}77` : undefined,
                    }}
                  >
                    <span
                      className="absolute inset-x-0 top-[32%] h-[28%]"
                      style={{ background: c.hex, opacity: on ? 1 : 0.78 }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="hidden leading-tight xl:block">
            <p className="mono text-[9px] text-acid">
              {CANS.find((c) => c.hex === can)?.name.toUpperCase() ?? "LOADED"}
            </p>
            <p className="mono text-[9px] text-ash/55">IN THE CAN</p>
          </div>
        </div>

        {bare ? (
          <p
            key="bare"
            role="status"
            className="marker anim-pop ml-auto max-w-[440px] text-right text-[17px] leading-snug text-acid"
          >
            {alreadyPainted ? "Nothing's changed on it yet" : "The wall's still bare"} — drop your
            tag from the rail, or grab <span className="text-paper">Spray</span> and go.
          </p>
        ) : (
          <p className="mono hidden max-w-[360px] text-[10px] leading-relaxed text-ash/60 lg:block">
            The flattened canvas comes straight out of the editor and becomes the texture on{" "}
            {spot.name}.
          </p>
        )}

        <button
          onClick={() => void paint()}
          disabled={painting}
          onMouseEnter={() => sfx.hover()}
          className={`paint-btn corner-cut group relative border border-acid bg-acid px-10 py-4 transition-transform hover:scale-[1.02] active:scale-[0.99] disabled:opacity-60 ${
            bare ? "" : "ml-auto"
          }`}
        >
          <span className="marker relative z-10 flex items-center gap-3 text-[22px] leading-none text-ink">
            <span>🎨</span>
            {painting ? "Spraying…" : "Paint the wall"}
          </span>
          <span className="absolute inset-0 -translate-x-full bg-white/50 transition-transform duration-500 group-hover:translate-x-full" />
        </button>
      </footer>

      {/* ── the street view, big ──────────────────────────────────────── */}
      {streetOpen && (
        <div
          className="absolute inset-0 z-[65] flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm"
          onClick={() => setStreetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${spot.name}, live`}
        >
          <div
            className="anim-pop w-full max-w-[min(1180px,calc((100vh-190px)*1.6))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <LiveBadge busy={streetBusy} />
                <p className="display mt-1 text-[clamp(24px,3.4vw,40px)] leading-none text-paper">
                  {spot.name}
                </p>
                <p className="mono mt-1.5 text-[10px] text-ash">
                  {spot.district} · RENDERED IN THE CITY, STRAIGHT FROM THE EDITOR&apos;S CANVAS
                </p>
              </div>
              <button
                onClick={() => setStreetOpen(false)}
                className="mono border border-white/15 px-3 py-1.5 text-[10px] text-ash transition-colors hover:border-white/40 hover:text-paper"
              >
                BACK TO THE EDITOR · ESC
              </button>
            </div>
            <StreetView shot={street} busy={streetBusy} className="aspect-[16/10] border-white/20" />
          </div>
        </div>
      )}

      {/* ── walking away from an unfinished piece ────────────────────── */}
      {confirmLeave && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-ink/75 p-6 backdrop-blur-sm"
          onClick={() => setConfirmLeave(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-title"
        >
          <div
            className="paper-card anim-pop w-full max-w-[420px] p-6"
            style={{ transform: "rotate(-0.6deg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="tape tape-tl" />
            <span className="tape tape-br" />
            <h2 id="leave-title" className="marker drip text-[26px] leading-none text-magenta">
              Leave the wall?
            </h2>
            <p className="mt-4 text-[13px] leading-relaxed text-ash">
              This piece isn&apos;t on {spot.name} yet. Walk away now and it&apos;s
              gone — nothing you made here is kept until you paint it.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                autoFocus
                onClick={() => {
                  sfx.hover();
                  setConfirmLeave(false);
                }}
                className="corner-cut border border-acid bg-acid px-6 py-3 transition-transform hover:scale-[1.02]"
              >
                <span className="display text-[14px] tracking-[0.14em] text-ink">KEEP PAINTING</span>
              </button>
              <button
                onClick={() => void paint()}
                className="corner-cut border border-acid/50 px-5 py-3 text-acid transition-colors hover:border-acid hover:bg-acid/10"
              >
                <span className="display text-[14px] tracking-[0.14em]">PAINT IT</span>
              </button>
              <button
                onClick={leave}
                className="mono ml-auto text-[10px] text-ash/70 underline-offset-4 hover:text-magenta hover:underline"
              >
                LEAVE IT
              </button>
            </div>
          </div>
        </div>
      )}
    </StudioShell>
  );
}

export default GraffitiStudio;
