"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  selectLevel,
  selectPieceCount,
  selectRank,
  selectTag,
  useGraffiti,
} from "@/lib/graffiti/graffitiStore";
import { GRAFFITI_SPOTS, TOTAL_REP } from "@/lib/graffiti/spots";
import { surfaceImage } from "@/lib/graffiti/surfaces";
import {
  buildContactSheet,
  copyImage,
  downloadDataUrl,
  pieceFilename,
} from "@/lib/graffiti/export";
import type { GraffitiSpot } from "@/lib/graffiti/graffitiTypes";
import { recordTimelapse, videoFormat } from "@/lib/graffiti/timelapse";
import { GANG } from "@/lib/game/world";
import { sfx } from "@/lib/game/audio";

const SURFACE_LABEL: Record<string, string> = {
  wall: "WALL",
  shutter: "SHUTTER",
  billboard: "BILLBOARD",
  fence: "HOARDING",
  vehicle: "VEHICLE",
};

/**
 * The wall before and after, one picture, with a line you drag across it.
 *
 * The flat canvas on its own undersells what happened: the editor opened on a
 * photograph of a bare shutter and the player turned it into this. The wipe
 * says that in one gesture. It sweeps across once on its own when it opens, so
 * nobody has to discover that it can be dragged.
 */
function BeforeAfter({ spot, after }: { spot: GraffitiSpot; after: string }) {
  const [pos, setPos] = useState(0);
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (touched.current) return;
      const t = Math.min(1, (now - start) / 1500);
      // across to the far side, then settle in the middle
      const e = t < 0.6 ? (t / 0.6) ** 0.8 * 100 : 100 - ((t - 0.6) / 0.4) ** 1.4 * 50;
      setPos(e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    touched.current = true;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  const aspect = spot.size[0] / spot.size[1];
  return (
    <div
      ref={box}
      className="anim-pop relative cursor-ew-resize touch-none select-none overflow-hidden border border-white/12 shadow-2xl"
      style={{ aspectRatio: `${aspect}`, width: `min(92vw, 1100px, calc(62vh * ${aspect}))` }}
      onPointerDown={(e) => {
        setDragging(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging) move(e.clientX);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={surfaceImage(spot)}
        alt=""
        className="absolute inset-0 h-full w-full"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={after}
        alt={spot.name}
        className="absolute inset-0 h-full w-full"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      <span
        className="absolute inset-y-0 w-[2px] bg-acid"
        style={{ left: `${pos}%`, boxShadow: "0 0 14px rgba(200,255,50,0.9)" }}
      >
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-acid bg-ink/85 text-[13px] text-acid">
          ⇆
        </span>
      </span>
      <span className="mono absolute left-2 top-2 bg-ink/80 px-1.5 py-[2px] text-[9px] text-acid">
        YOUR PIECE
      </span>
      <span className="mono absolute right-2 top-2 bg-ink/80 px-1.5 py-[2px] text-[9px] text-ash">
        THE BARE WALL
      </span>
    </div>
  );
}

/**
 * The piece being made, as a flipbook.
 *
 * Every step the studio filmed — the bare wall, the tag dropped on it, each
 * stroke, the filter — played back on a loop, holding on the finished piece
 * before it starts again. Click to pause; click a tick to jump to that step.
 */
function TimeLapse({
  spot,
  frames,
  filming,
  canvasRef,
}: {
  spot: GraffitiSpot;
  frames: string[];
  /** recording progress, 0-1, while the video is being filmed */
  filming: number | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = frames.length - 1;

  useEffect(() => {
    if (!playing || filming !== null) return;
    const step = Math.min(450, Math.max(140, 2600 / frames.length));
    // the finished piece holds before the loop comes round again
    const hold = index === last ? 1500 : index === 0 ? 700 : step;
    const t = window.setTimeout(() => setIndex((i) => (i >= last ? 0 : i + 1)), hold);
    return () => window.clearTimeout(t);
  }, [index, playing, frames.length, last, filming]);

  const aspect = spot.size[0] / spot.size[1];
  const recording = filming !== null;
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="anim-pop relative overflow-hidden border border-white/12 bg-black shadow-2xl"
        style={
          recording
            ? { aspectRatio: "16 / 9", width: "min(92vw, 1100px, calc(62vh * 16 / 9))" }
            : { aspectRatio: `${aspect}`, width: `min(92vw, 1100px, calc(62vh * ${aspect}))` }
        }
      >
        {/* the film is drawn here while it records, so you watch it being made */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ display: recording ? "block" : "none" }}
        />
        {!recording && (
          <button
            type="button"
            onClick={() => {
              sfx.hover();
              setPlaying((p) => !p);
            }}
            className="group absolute inset-0 block h-full w-full cursor-pointer"
            aria-label={playing ? "Pause the time-lapse" : "Play the time-lapse"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frames[index]}
              alt={`${spot.name}, step ${index} of ${last}`}
              className="absolute inset-0 h-full w-full"
              draggable={false}
            />
            <span className="mono absolute left-2 top-2 flex items-center gap-1.5 bg-ink/80 px-1.5 py-[3px] text-[9px] text-paper">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: playing ? "#ff3b3b" : "var(--ash)",
                  animation: playing ? "nw-pulse 0.9s ease-in-out infinite" : "none",
                }}
              />
              TIME-LAPSE
            </span>
            <span
              className="mono absolute right-2 top-2 bg-ink/80 px-1.5 py-[3px] text-[9px]"
              style={{ color: index === last ? "var(--acid)" : "var(--paper)" }}
            >
              {index === 0 ? "WHERE IT STARTED" : index === last ? "FINISHED" : `STEP ${index} / ${last}`}
            </span>
            {!playing && (
              <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-acid bg-ink/80 text-[20px] text-acid">
                ▶
              </span>
            )}
          </button>
        )}
        {recording && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
            <span
              className="block h-full bg-[#ff3b3b]"
              style={{ width: `${Math.round(filming * 100)}%` }}
            />
          </span>
        )}
      </div>

      {!recording && (
        <div className="flex w-full max-w-[520px] gap-[3px]">
          {frames.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                sfx.hover();
                setPlaying(false);
                setIndex(i);
              }}
              className="h-3 flex-1 cursor-pointer py-1"
              aria-label={`Step ${i}`}
            >
              <span
                className="block h-full w-full transition-colors"
                style={{ background: i <= index ? "var(--acid)" : "rgba(246,241,232,0.16)" }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The black book.
 *
 * Every piece the player made in the image editor, kept together in one place.
 * Without it the artwork only ever exists on a wall you have to walk back to,
 * and finishing all fourteen ends with nothing but a toast — which is a poor
 * reward for fourteen deliberate pieces of work.
 */
export function PieceGallery() {
  const open = useGraffiti((s) => s.galleryOpen);
  const finale = useGraffiti((s) => s.galleryFinale);
  const painted = useGraffiti((s) => s.painted);
  const closeGallery = useGraffiti((s) => s.closeGallery);
  const rep = useGraffiti((s) => s.rep);
  const rank = useGraffiti(selectRank);
  const level = useGraffiti(selectLevel);
  const count = useGraffiti(selectPieceCount);
  const tag = useGraffiti(selectTag);
  const [zoom, setZoom] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "no" | null>(null);
  const [exporting, setExporting] = useState(false);
  /**
   * Which of a piece's two faces the zoom is showing.
   *
   * Every finished piece exists twice: the flat canvas the editor handed back,
   * and the photograph of it hanging in the street. They are both worth having
   * and they are not interchangeable — one is the artwork, the other is the
   * proof — so the zoom shows both and will save either.
   */
  const [face, setFace] = useState<"wall" | "art" | "wipe" | "film">("wall");
  /** the time-lapse video being filmed: progress 0-1, or null when idle */
  const [filming, setFilming] = useState<number | null>(null);
  const [filmFailed, setFilmFailed] = useState(false);
  const filmCanvas = useRef<HTMLCanvasElement>(null);
  const [canFilm] = useState(() => typeof window !== "undefined" && videoFormat() !== null);
  const photos = useGraffiti((s) => s.photos);

  /** The session as one poster, saved to disk. */
  const exportSheet = useCallback(async () => {
    if (exporting || count === 0) return;
    setExporting(true);
    sfx.confirm();
    try {
      const sheet = await buildContactSheet(GRAFFITI_SPOTS, painted, {
        tag,
        rank,
        rep,
        totalRep: TOTAL_REP,
        count,
        total: GRAFFITI_SPOTS.length,
      });
      if (sheet) downloadDataUrl(sheet, pieceFilename(`${tag} black book`));
    } finally {
      setExporting(false);
    }
  }, [exporting, count, painted, rank, rep, tag]);

  // opening sting; the finale gets a second one on top of it
  useEffect(() => {
    if (!open) {
      setZoom(null);
      return;
    }
    setFace("wall");
    sfx.confirm();
    if (!finale) return;
    const t = window.setTimeout(() => sfx.spotFound(), 420);
    return () => window.clearTimeout(t);
  }, [open, finale]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyG") {
        e.stopPropagation();
        if (filming !== null) return;
        if (zoom) setZoom(null);
        else closeGallery();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, closeGallery, zoom, filming]);

  if (!open) return null;

  const zoomed = zoom ? GRAFFITI_SPOTS.find((s) => s.id === zoom) : null;
  const zoomedPiece = zoom ? painted[zoom] : null;
  const zoomedArt = zoomedPiece?.graffitiTexture ?? null;
  const zoomedWall = zoomedPiece?.wallShot ?? null;
  const zoomedSteps = zoomedPiece?.process ?? [];
  const film = face === "film" && zoomedSteps.length >= 2;
  // A grab can fail — a lost context, a reveal skipped before the shutter —
  // and a piece with no street shot must still open.
  const showing = face === "wall" && zoomedWall ? zoomedWall : zoomedArt;
  const faces = (
    [
      ["wall", "IN THE STREET"],
      ["art", "THE ARTWORK"],
      ["wipe", "BEFORE / AFTER"],
      ["film", "▶ TIME-LAPSE"],
    ] as const
  ).filter(
    ([id]) =>
      (id !== "wall" || Boolean(zoomedWall)) && (id !== "film" || zoomedSteps.length >= 2),
  );

  const saveFilm = async () => {
    if (!zoomed || filming !== null || zoomedSteps.length < 2) return;
    sfx.confirm();
    setFilming(0);
    setFilmFailed(false);
    let ok = false;
    try {
      const out = await recordTimelapse(
        {
          frames: zoomedSteps,
          wallShot: zoomedWall ?? undefined,
          spotName: zoomed.name,
          district: zoomed.district,
          tag,
        },
        { canvas: filmCanvas.current ?? undefined, onProgress: setFilming },
      );
      if (out) {
        const url = URL.createObjectURL(out.blob);
        downloadDataUrl(url, pieceFilename(`${zoomed.name} time-lapse`).replace(/\.png$/, `.${out.ext}`));
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        sfx.rankUp();
        ok = true;
      }
    } catch {
      ok = false;
    } finally {
      setFilming(null);
    }
    if (!ok) {
      sfx.back();
      setFilmFailed(true);
      window.setTimeout(() => setFilmFailed(false), 2800);
    }
  };

  return (
    <div className="absolute inset-0 z-[58]">
      <div className="grain absolute inset-0 overflow-y-auto bg-ink/94 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1240px] px-6 py-10 md:px-10">
          {/* ── header ─────────────────────────────────────────────────── */}
          <div className="anim-rise flex flex-wrap items-end justify-between gap-5">
            <div>
              <p
                className={`stencil mb-2 text-[12px] ${finale ? "text-gold neon-text" : "text-acid"}`}
              >
                {finale ? `EVERY WALL ON THE BLOCK · ${tag}` : `BY ${tag}`}
              </p>
              <h2
                className="display text-[clamp(34px,6vw,72px)] leading-[0.85]"
                style={{ transform: "skewX(-5deg)" }}
              >
                {finale ? (
                  <span
                    style={{
                      background: "linear-gradient(96deg,#ffc542 0%,#c8ff32 50%,#22e0ff 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    STREET KING
                  </span>
                ) : (
                  "The Black Book"
                )}
              </h2>
              <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-ash">
                {finale ? (
                  <>
                    Fourteen walls, fourteen pieces, all of them yours. The{" "}
                    <span style={{ color: GANG.accent }}>{GANG.name}</span> can paint over them
                    in the morning — everyone already saw.
                  </>
                ) : (
                  <>
                    Everything you&apos;ve put up in Arc District. Each one came out of the
                    Unlayer image editor and went straight onto that wall.
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div>
                <span className="stencil block text-[10px] text-ash">RANK</span>
                <span className="display text-[22px] leading-none text-paper">{rank}</span>
              </div>
              <div>
                <span className="stencil block text-[10px] text-ash">REP</span>
                <span className="display text-[22px] leading-none text-acid">
                  {rep}
                  <span className="mono text-[11px] text-ash">/{TOTAL_REP}</span>
                </span>
              </div>
              <div>
                <span className="stencil block text-[10px] text-ash">PIECES</span>
                <span className="display text-[22px] leading-none text-paper">
                  {count}
                  <span className="mono text-[11px] text-ash">/{GRAFFITI_SPOTS.length}</span>
                </span>
              </div>
              <div>
                <span className="stencil block text-[10px] text-ash">LEVEL</span>
                <span className="display text-[22px] leading-none text-magenta">
                  {String(level).padStart(2, "0")}
                </span>
              </div>
            </div>
          </div>

          {/* ── the pieces ─────────────────────────────────────────────── */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {GRAFFITI_SPOTS.map((spot, i) => {
              const piece = painted[spot.id];
              // the street photograph if we got one, otherwise the flat canvas
              const art = piece?.wallShot ?? piece?.graffitiTexture ?? surfaceImage(spot);
              return (
                <button
                  key={spot.id}
                  onClick={() => {
                    if (!piece) return;
                    sfx.hover();
                    setZoom(spot.id);
                  }}
                  className="hud-panel corner-cut anim-rise group overflow-hidden text-left transition-transform hover:scale-[1.015]"
                  style={{
                    animationDelay: `${60 + i * 35}ms`,
                    cursor: piece ? "zoom-in" : "default",
                    borderColor: piece ? "rgba(200,255,50,0.28)" : "rgba(246,241,232,0.08)",
                  }}
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-black/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={art}
                      alt={spot.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      style={{
                        filter: piece ? "none" : "grayscale(0.85) brightness(0.42)",
                      }}
                    />
                    {!piece && (
                      <span className="stencil absolute inset-0 flex items-center justify-center text-[11px] text-ash/80">
                        NOT HIT YET
                      </span>
                    )}
                    <span className="mono absolute bottom-0 left-0 bg-ink/85 px-1.5 py-[2px] text-[8px] text-ash">
                      {SURFACE_LABEL[spot.surfaceType]}
                    </span>
                    {piece?.process && piece.process.length >= 2 && (
                      <span className="mono absolute bottom-0 right-0 bg-ink/85 px-1.5 py-[2px] text-[8px] text-magenta">
                        ▶ TIME-LAPSE · {piece.process.length - 1}
                      </span>
                    )}
                    {piece?.wallShot && (
                      <span
                        className="mono absolute right-0 top-0 px-1.5 py-[2px] text-[8px]"
                        style={{ background: "rgba(10,7,16,0.85)", color: "var(--acid)" }}
                      >
                        IN THE STREET
                      </span>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="display text-[15px] leading-none text-paper">
                        {spot.name}
                      </span>
                      <span
                        className="mono text-[9px]"
                        style={{ color: piece ? "var(--acid)" : "var(--ash)" }}
                      >
                        {piece ? `+${spot.rep}` : `${spot.rep} REP`}
                      </span>
                    </div>
                    <p className="mono mt-1 text-[9px] text-ash/70">{spot.district}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── the phone roll ─────────────────────────────────────────── */}
          {photos.length > 0 && (
            <div className="anim-rise mt-10">
              <div className="flex items-baseline gap-3">
                <span className="stencil text-[11px] text-magenta">SHOTS FROM THE STREET</span>
                <span className="mono text-[9px] text-ash/60">
                  {photos.length} · C IN THE CITY · PAINT ONE ONTO A WALL FROM THE STUDIO
                </span>
              </div>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {photos.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      sfx.confirm();
                      downloadDataUrl(src, `neon-walls-shot-${photos.length - i}.png`);
                    }}
                    onMouseEnter={() => sfx.hover()}
                    className="group relative h-[104px] shrink-0 overflow-hidden border border-white/12 bg-black/50 transition-colors hover:border-magenta/70"
                    title="Save this shot"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="block h-full w-auto" />
                    <span className="mono absolute inset-x-0 bottom-0 bg-ink/85 py-[3px] text-center text-[8px] text-ash opacity-0 transition-opacity group-hover:opacity-100">
                      SAVE PNG
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            className="anim-rise sticky bottom-0 z-10 -mx-6 mt-8 flex flex-wrap items-center gap-4 px-6 pb-4 pt-12 md:-mx-10 md:px-10"
            style={{
              // A taller ramp than it used to have. Thirty pixels of fade left
              // the buttons sitting on see-through ink with a row of tiles
              // showing between them, which read as two layers of UI stuck
              // together rather than a page with a footer.
              background:
                "linear-gradient(to top, rgba(6,4,10,0.985) 52%, rgba(6,4,10,0.86) 74%, rgba(6,4,10,0))",
            }}
          >
            <button
              onClick={() => {
                sfx.back();
                closeGallery();
              }}
              className="corner-cut border border-acid/70 bg-acid px-8 py-3.5 transition-transform hover:scale-[1.02]"
            >
              <span className="display text-[16px] tracking-[0.14em] text-ink">
                {finale ? "BACK TO THE STREET" : "KEEP PAINTING"}
              </span>
            </button>
            {count >= 2 && (
              <button
                onClick={() => {
                  sfx.confirm();
                  useGraffiti.getState().startTour(false);
                }}
                onMouseEnter={() => sfx.hover()}
                className="corner-cut border border-magenta/70 px-7 py-3.5 text-magenta transition-colors hover:border-magenta hover:bg-magenta/10"
                title="The camera flies the city from piece to piece"
              >
                <span className="display text-[15px] tracking-[0.14em]">▶ TOUR YOUR CITY</span>
              </button>
            )}
            <button
              onClick={exportSheet}
              disabled={exporting || count === 0}
              onMouseEnter={() => count > 0 && sfx.hover()}
              className="corner-cut border border-cyan/60 px-7 py-3.5 text-cyan transition-colors hover:border-cyan hover:bg-cyan/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span className="display text-[15px] tracking-[0.14em]">
                {exporting ? "PRINTING…" : "SAVE THE BOOK · PNG"}
              </span>
            </button>
            <span className="mono text-[10px] text-ash/60">G or ESC to close</span>
          </div>
        </div>
      </div>

      {/* ── one piece, full size ─────────────────────────────────────── */}
      {zoomed && showing && (
        <div
          onClick={() => {
            // closing mid-film would leave the recording running on nothing
            if (filming === null) setZoom(null);
          }}
          className="absolute inset-0 z-10 flex cursor-zoom-out flex-col items-center justify-center gap-4 bg-ink/95 p-8 backdrop-blur-sm"
        >
          {film ? (
            <div onClick={(e) => e.stopPropagation()}>
              <TimeLapse
                key={zoomed.id}
                spot={zoomed}
                frames={zoomedSteps}
                filming={filming}
                canvasRef={filmCanvas}
              />
            </div>
          ) : face === "wipe" && zoomedArt ? (
            <div onClick={(e) => e.stopPropagation()}>
              <BeforeAfter key={zoomed.id} spot={zoomed} after={zoomedArt} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={face}
              src={showing}
              alt={zoomed.name}
              className="anim-pop max-h-[62vh] max-w-full border border-white/12 object-contain shadow-2xl"
            />
          )}
          <div className="text-center">
            <p className="display text-[22px] leading-none text-paper">{zoomed.name}</p>
            <p className="mono mt-1.5 text-[10px] text-ash">
              {zoomed.district} · {SURFACE_LABEL[zoomed.surfaceType]} · +{zoomed.rep} REP
            </p>
          </div>

          {/* Stops any of this from closing the zoom underneath it. */}
          <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            {faces.length > 1 && (
              <div className="flex border border-white/12">
                {faces.map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      sfx.hover();
                      setFace(id);
                    }}
                    className="mono cursor-pointer px-4 py-2 text-[9px] tracking-[0.14em] transition-colors"
                    style={{
                      background: face === id ? "rgba(200,255,50,0.13)" : "transparent",
                      color: face === id ? "var(--acid)" : "rgba(246,241,232,0.55)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {film ? (
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => void saveFilm()}
                disabled={!canFilm || filming !== null}
                onMouseEnter={() => filming === null && sfx.hover()}
                className="corner-cut cursor-pointer border border-acid/70 bg-acid px-7 py-3 transition-transform hover:scale-[1.03] disabled:cursor-default disabled:hover:scale-100"
                style={{ opacity: canFilm ? 1 : 0.4 }}
              >
                <span className="display text-[14px] tracking-[0.14em] text-ink">
                  {filming !== null
                    ? `FILMING… ${Math.round(filming * 100)}%`
                    : filmFailed
                      ? "COULDN'T FILM IT · TRY AGAIN"
                      : canFilm
                      ? "SAVE THE TIME-LAPSE · VIDEO"
                      : "VIDEO NOT SUPPORTED HERE"}
                </span>
              </button>
              <span className="mono max-w-[300px] text-[9px] leading-relaxed text-ash/70">
                {filming !== null
                  ? "Recording in real time — title card, every step, and the wall in the street."
                  : `${zoomedSteps.length - 1} steps in the Unlayer editor, filmed as you worked.`}
              </span>
              <button
                onClick={() => setZoom(null)}
                disabled={filming !== null}
                className="mono cursor-pointer text-[10px] text-ash/70 underline-offset-4 hover:text-paper hover:underline disabled:opacity-30"
              >
                CLOSE · ESC
              </button>
            </div>
            ) : (
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  sfx.confirm();
                  downloadDataUrl(
                    showing,
                    pieceFilename(zoomed.name + (face === "wall" && zoomedWall ? " in the street" : "")),
                  );
                }}
                onMouseEnter={() => sfx.hover()}
                className="corner-cut cursor-pointer border border-acid/70 bg-acid px-7 py-3 transition-transform hover:scale-[1.03]"
              >
                <span className="display text-[14px] tracking-[0.14em] text-ink">
                  DOWNLOAD PNG
                </span>
              </button>
              <button
                onClick={async () => {
                  sfx.hover();
                  const ok = await copyImage(showing);
                  setCopied(ok ? "ok" : "no");
                  window.setTimeout(() => setCopied(null), 1800);
                }}
                onMouseEnter={() => sfx.hover()}
                className="corner-cut cursor-pointer border border-cyan/60 px-6 py-3 text-cyan transition-colors hover:border-cyan hover:bg-cyan/10"
              >
                <span className="display text-[14px] tracking-[0.14em]">
                  {copied === "ok" ? "COPIED ✓" : copied === "no" ? "CANNOT COPY HERE" : "COPY IMAGE"}
                </span>
              </button>
              <button
                onClick={() => setZoom(null)}
                className="mono cursor-pointer text-[10px] text-ash/70 underline-offset-4 hover:text-paper hover:underline"
              >
                CLOSE · ESC
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
