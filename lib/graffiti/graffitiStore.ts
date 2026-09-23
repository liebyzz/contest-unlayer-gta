"use client";

import { create } from "zustand";
import type { GamePhase, PaintedPiece, Toast } from "./graffitiTypes";
import { GRAFFITI_SPOTS, SPOT_BY_ID, TOTAL_REP } from "./spots";
import { GANG, gangAlert, piecesAdmired, player, world } from "@/lib/game/world";
import { cleanTag } from "./surfaces";
import { clearSession, loadSession, writeSession } from "./persist";
import { planTour } from "@/lib/game/tour";
import { playerState } from "@/lib/game/playerState";

interface GraffitiState {
  phase: GamePhase;
  /** spot the player is standing in front of, if any */
  nearSpotId: string | null;
  /** spot currently open in the studio */
  activeSpotId: string | null;
  /** spot being shown off after a save */
  revealSpotId: string | null;
  /** finished work, keyed by spot id — the session's gallery */
  painted: Record<string, PaintedPiece>;
  rep: number;
  toasts: Toast[];
  muted: boolean;
  /** true once the player has painted anything — gates the tutorial nudges */
  firstPieceDone: boolean;
  /**
   * The arrival is a sequence: drone shot → street card → HUD. Nothing in the
   * corners may appear until this flips, or the card lands on top of it.
   */
  arrived: boolean;
  /** the phone is out */
  photoMode: boolean;
  /** shots taken in the city, newest first — raw material for the editor */
  photos: string[];
  /** the black book is up over the city */
  galleryOpen: boolean;
  /** ...and it's the end-of-game version of it */
  galleryFinale: boolean;
  /** last wall is done; show the finale once the reveal has played out */
  pendingFinale: boolean;
  /**
   * FREE PAINT: the block carries on around you but nobody draws on you.
   *
   * Chosen once, on the menu. The game is a showcase for an image editor and
   * a good number of the people who open it want to go straight at the walls;
   * making them survive a turf war first is a good way to lose them.
   */
  freePaint: boolean;
  /**
   * The writer's name. Asked for on the menu, and then used everywhere the
   * game would otherwise have to make one up: the call in the briefing, the
   * pieces the studio draws for you, the black book you take home.
   */
  tag: string;
  /** the saved city has been read back (or there wasn't one) */
  hydrated: boolean;
  /** the rank this reveal's piece earned, if it earned a new one */
  rankUp: string | null;
  /** the walls the city tour visits, in flying order */
  tourStops: string[];
  /**
   * Where the tour is: `stop` indexes `tourStops` (one past the end is the
   * aerial that closes it), `holding` is true once the camera has arrived.
   */
  tourBeat: { stop: number; holding: boolean };
  /** this tour is the STREET KING victory lap, and ends on the finale book */
  tourFinale: boolean;
  /** the camera has flown the last leg; the overlay fades out and ends it */
  tourDone: boolean;

  enterCity: (freePaint?: boolean) => void;
  beginEntering: () => void;
  showMenu: () => void;
  showHowTo: () => void;
  beginPlay: () => void;
  setNear: (id: string | null) => void;
  openStudio: (id: string) => void;
  closeStudio: () => void;
  /** `process` is the stop-motion of the piece being made, oldest step first */
  paintSpot: (id: string, dataUrl: string, process?: string[]) => void;
  endReveal: () => void;
  toast: (t: Omit<Toast, "id">) => void;
  dropToast: (id: number) => void;
  toggleMute: () => void;
  openGallery: (finale?: boolean) => void;
  closeGallery: () => void;
  setPhotoMode: (on: boolean) => void;
  addPhoto: (dataUrl: string) => void;
  /** the street card has finished; the HUD may come up */
  finishArrival: () => void;
  /** the in-world photograph of a finished piece, taken during its reveal */
  attachWallShot: (id: string, dataUrl: string) => void;
  /** the player ran out of health */
  die: () => void;
  /** back on your feet at the spawn point */
  revive: () => void;
  setTag: (tag: string) => void;
  /** fly the city from piece to piece */
  startTour: (finale?: boolean) => void;
  setTourBeat: (stop: number, holding: boolean) => void;
  finishTourFlight: () => void;
  endTour: () => void;
  /** read the saved city back out of the browser, once */
  hydrate: () => Promise<void>;
  /** wipe every wall and every photo, here and in storage */
  startOver: () => Promise<void>;
}

let toastSeq = 1;
/** the black book has been opened since the first piece went up */
let bookOpened = false;
/** the city tour has been flown this session */
let tourTaken = false;
/**
 * Toasts raised while the reveal is on screen, waiting for it to finish.
 *
 * The reveal is the game's one cinematic — letterbox bars, the piece spraying
 * itself onto the wall, its name and its rep along the bottom. PIECE CREATED
 * used to land across the top bar a third of a second into it, saying the same
 * two facts the card underneath was already saying, on every single piece.
 * Nothing pops up over the film; whatever was raised during it comes out the
 * other side.
 */
let heldToasts: Omit<Toast, "id">[] = [];
/** What the writer is called until they say otherwise. */
export const DEFAULT_TAG = "JASON";
const TAG_KEY = "neon-walls:tag";

function repFor(painted: Record<string, unknown>) {
  let rep = 0;
  for (const id of Object.keys(painted)) rep += SPOT_BY_ID.get(id)?.rep ?? 0;
  return Math.min(TOTAL_REP, rep);
}
/** How many shots the phone keeps. */
const PHOTO_LIMIT = 12;

export const useGraffiti = create<GraffitiState>((set, get) => ({
  phase: "menu",
  nearSpotId: null,
  activeSpotId: null,
  revealSpotId: null,
  painted: {},
  rep: 0,
  toasts: [],
  muted: false,
  firstPieceDone: false,
  arrived: false,
  photoMode: false,
  photos: [],
  galleryOpen: false,
  galleryFinale: false,
  pendingFinale: false,
  freePaint: false,
  tag: "",
  hydrated: false,
  rankUp: null,
  tourStops: [],
  tourBeat: { stop: 0, holding: false },
  tourFinale: false,
  tourDone: false,

  /** ENTER CITY runs the briefing first; the drone shot follows it. */
  enterCity: (freePaint = false) => set({ phase: "trailer", freePaint }),
  beginEntering: () => set({ phase: "entering" }),
  showMenu: () => set({ phase: "menu" }),
  showHowTo: () => set({ phase: "howto" }),
  beginPlay: () => set({ phase: "playing" }),

  setNear: (id) => {
    if (get().nearSpotId !== id) set({ nearSpotId: id });
  },

  openStudio: (id) => set({ phase: "editor", activeSpotId: id }),

  closeStudio: () => set({ phase: "playing", activeSpotId: null }),

  paintSpot: (id, dataUrl, process) => {
    const spot = SPOT_BY_ID.get(id);
    if (!spot) return;
    const already = Boolean(get().painted[id]);
    const wasFirst = !get().firstPieceDone;
    const rankBefore = rankFor(Object.keys(get().painted).length);
    const rankAfter = rankFor(Object.keys(get().painted).length + (already ? 0 : 1));
    set((s) => {
      const painted = {
        ...s.painted,
        [id]: { graffitiTexture: dataUrl, paintedAt: Date.now(), ...(process ? { process } : null) },
      };
      return {
        painted,
        // Counted from the walls themselves rather than added up as it goes.
        // A running total only stays right for as long as every path through
        // here agrees about what counts, and the one screen that shows it next
        // to the rank — the STREET KING finale — is the worst place in the
        // game to find out they had drifted apart.
        rep: repFor(painted),
        phase: "reveal" as const,
        revealSpotId: id,
        activeSpotId: null,
        firstPieceDone: true,
        rankUp: rankAfter !== rankBefore ? rankAfter : null,
      };
    });

    const done = Object.keys(get().painted).length;
    // Only the wall that completes the block. Once all fourteen are up, every
    // rework also leaves the count at fourteen, and used to throw the whole
    // STREET KING finale at the player again for touching up one shutter.
    if (!already && done === GRAFFITI_SPOTS.length) {
      // hold the finale until the reveal has finished playing over the wall
      set({ pendingFinale: true });
      get().toast({
        title: "STREET KING",
        body: `Every wall on the block is yours. The ${GANG.name} are finished here.`,
        tone: "gold",
      });
    } else {
      get().toast({
        title: already ? "PIECE REWORKED" : "PIECE CREATED",
        body: already
          ? `${spot.name} has been painted over.`
          : `${spot.name} · +${spot.rep} rep · ${done}/${GRAFFITI_SPOTS.length} pieces`,
        tone: already ? "magenta" : "acid",
      });
    }

    // The first piece is the moment the black book stops being an empty shelf,
    // and it is also the only place the artwork can be saved out of. Said once,
    // after the reveal has had the screen to itself.
    //
    // In STORY mode the reveal (RevealSequence's HOLD_MS, 4.4s) hands control
    // back right into the first "THE KINGS SAW THAT" alert and its six-second
    // grace — a fixed ~4.6s delay used to land this tip in the same breath as
    // that danger banner, on literally every player's first piece. Free paint
    // has no alert to collide with, so it keeps the short delay.
    //
    // A fixed delay still put it in the middle of the shoot-out that follows,
    // where nobody reads anything. In STORY it waits for the street to calm
    // down — the Kings' heat drained, no stars, back on your feet — and it is
    // dropped altogether if the book has been opened in the meantime.
    /** say it once the street has calmed down, unless `moot` has come true by then */
    const whenCalm = (tip: () => void, moot: () => boolean, after = 9000) => {
      if (get().freePaint) {
        setTimeout(() => !moot() && tip(), after - 4400);
        return;
      }
      const since = Date.now();
      const wait = window.setInterval(() => {
        const s = get();
        const calm =
          s.phase === "playing" &&
          !s.galleryOpen &&
          !player.dead &&
          player.wanted === 0 &&
          world.gangHeat < 0.05;
        const waited = Date.now() - since;
        if (moot()) {
          window.clearInterval(wait);
        } else if ((calm && waited > after) || waited > 90000) {
          window.clearInterval(wait);
          tip();
        }
      }, 1000);
    };
    if (wasFirst) {
      bookOpened = false;
      whenCalm(
        () =>
          get().toast({
            title: "THE BLACK BOOK",
            body: "Press G for every piece, its street photograph and its time-lapse. Save any of them — the time-lapse as a video.",
            tone: "gold",
          }),
        () => bookOpened,
      );
    }
    // Two walls is a tour. Said once, the same way, and only to someone who
    // has not already found the button.
    if (!already && done === 2 && !tourTaken) {
      whenCalm(
        () =>
          get().toast({
            title: "TOUR YOUR CITY",
            body: "Two walls up. Open the black book (G) and hit ▶ TOUR YOUR CITY — the camera flies the roofs from piece to piece.",
            tone: "magenta",
          }),
        () => tourTaken,
        // behind the black book's own tip, which is often still waiting too
        15000,
      );
    }

    // You just wrote over a Carmine mark in the middle of their block. They
    // notice immediately, and they are not reasonable people.
    gangAlert(spot.position[0], spot.position[2]);
    // ...and everybody else on the pavement stops to look at it.
    piecesAdmired(spot);
  },

  endReveal: () => {
    if (get().phase !== "reveal") return;
    const finale = get().pendingFinale;
    set({ phase: "playing", revealSpotId: null, pendingFinale: false, rankUp: null });
    const held = heldToasts;
    heldToasts = [];
    if (finale) {
      // The last wall takes the camera up over the roofs for a victory lap of
      // everything the player put up, which ends on the black book's finale
      // page — the celebration. A STREET KING banner sliding in behind it would
      // only be saying the same thing to nobody.
      get().startTour(true);
    } else {
      for (const t of held) get().toast(t);
    }
  },

  toast: (t) => {
    if (get().phase === "reveal" || get().phase === "tour") {
      heldToasts.push(t);
      return;
    }
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => get().dropToast(id), 5200);
  },

  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toggleMute: () => set((s) => ({ muted: !s.muted })),

  openGallery: (finale = false) => {
    if (get().galleryOpen) return;
    bookOpened = true;
    set({ galleryOpen: true, galleryFinale: finale });
  },

  closeGallery: () => set({ galleryOpen: false, galleryFinale: false }),

  setPhotoMode: (on) => {
    if (get().photoMode === on) return;
    set({ photoMode: on, nearSpotId: on ? null : get().nearSpotId });
  },

  addPhoto: (dataUrl) =>
    set((s) => ({
      // capped: each of these is most of a megabyte of base64 and they only
      // live for the session anyway
      photos: [dataUrl, ...s.photos].slice(0, PHOTO_LIMIT),
    })),

  finishArrival: () => set({ arrived: true }),

  attachWallShot: (id, dataUrl) =>
    set((s) => {
      const piece = s.painted[id];
      // The reveal can be skipped, and the player can be back in the studio
      // repainting the same wall by the time a grab lands. Only ever decorate
      // the piece that is still there.
      if (!piece) return s;
      return { painted: { ...s.painted, [id]: { ...piece, wallShot: dataUrl } } };
    }),

  die: () => {
    if (get().phase === "wasted") return;
    // the only other way out of a reveal; nothing held for it is worth saying
    // over a WASTED screen
    heldToasts = [];
    set({
      phase: "wasted",
      nearSpotId: null,
      activeSpotId: null,
      revealSpotId: null,
      galleryOpen: false,
      photoMode: false,
    });
  },

  revive: () => {
    if (get().phase === "wasted") set({ phase: "playing" });
  },

  setTag: (raw) => {
    const tag = cleanTag(raw);
    set({ tag });
    try {
      localStorage.setItem(TAG_KEY, tag);
    } catch {
      /* storage can be switched off; the tag just won't survive a reload */
    }
  },

  startTour: (finale = false) => {
    const stops = planTour(get().painted, playerState.x, playerState.z);
    if (!stops.length) {
      if (finale) get().openGallery(true);
      return;
    }
    tourTaken = true;
    set({
      phase: "tour",
      // whatever was still up in the corner has no business in the film
      toasts: [],
      galleryOpen: false,
      galleryFinale: false,
      photoMode: false,
      nearSpotId: null,
      tourStops: stops,
      tourBeat: { stop: 0, holding: false },
      tourFinale: finale,
      tourDone: false,
    });
  },

  setTourBeat: (stop, holding) => {
    const b = get().tourBeat;
    if (b.stop !== stop || b.holding !== holding) set({ tourBeat: { stop, holding } });
  },

  finishTourFlight: () => {
    if (get().phase === "tour") set({ tourDone: true });
  },

  endTour: () => {
    if (get().phase !== "tour") return;
    const finale = get().tourFinale;
    set({ phase: "playing", tourDone: false, tourFinale: false });
    const held = heldToasts;
    heldToasts = [];
    if (finale) get().openGallery(true);
    else for (const t of held) get().toast(t);
  },

  hydrate: async () => {
    if (get().hydrated) return;
    let tag = "";
    try {
      tag = cleanTag(localStorage.getItem(TAG_KEY) ?? "");
    } catch {
      tag = "";
    }
    const saved = await loadSession();
    // Only ever fill an empty city: if the player got a piece up before the
    // read came back, that piece wins.
    const s = get();
    const painted = Object.keys(s.painted).length ? s.painted : (saved?.painted ?? {});
    // keep only walls that still exist in this build of the block
    for (const id of Object.keys(painted)) if (!SPOT_BY_ID.has(id)) delete painted[id];
    set({
      painted,
      rep: repFor(painted),
      firstPieceDone: Object.keys(painted).length > 0,
      photos: s.photos.length ? s.photos : (saved?.photos ?? []).slice(0, PHOTO_LIMIT),
      tag: s.tag || tag || cleanTag(saved?.tag ?? ""),
      hydrated: true,
    });
  },

  startOver: async () => {
    set({ painted: {}, rep: 0, photos: [], firstPieceDone: false });
    await clearSession();
  },
}));

/* ── persistence ─────────────────────────────────────────────────────────── */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof window !== "undefined") {
  useGraffiti.subscribe((s, prev) => {
    // never write the empty city over a saved one before it has been read
    if (!s.hydrated) return;
    if (s.painted === prev.painted && s.photos === prev.photos && s.tag === prev.tag) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const now = useGraffiti.getState();
      void writeSession({
        painted: now.painted,
        photos: now.photos,
        tag: now.tag,
        savedAt: Date.now(),
      });
    }, 700);
  });
}

/** The name to put on things: what the player typed, or the default. */
export const selectTag = (s: GraffitiState) => s.tag || DEFAULT_TAG;

/* ── derived helpers ─────────────────────────────────────────────────────── */

export const selectPieceCount = (s: GraffitiState) => Object.keys(s.painted).length;

export const selectLevel = (s: GraffitiState) =>
  Math.min(5, 1 + Math.floor((s.rep / TOTAL_REP) * 5 + 0.0001));

export const selectRank = (s: GraffitiState) => rankFor(Object.keys(s.painted).length);

/** The ladder, by walls hit. */
export function rankFor(done: number) {
  if (done >= GRAFFITI_SPOTS.length) return "STREET KING";
  if (done >= 11) return "ALL CITY";
  if (done >= 8) return "KING KILLER";
  if (done >= 5) return "BOMBER";
  if (done >= 3) return "WRITER";
  if (done >= 1) return "TOY";
  return "NOBODY";
};

/** Is the simulation allowed to advance this frame? */
export const selectRunning = (s: GraffitiState) =>
  s.phase === "playing" || s.phase === "reveal" || s.phase === "entering" || s.phase === "tour";
