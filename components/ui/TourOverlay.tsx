"use client";

import { useEffect, useRef, useState } from "react";
import { selectPieceCount, selectTag, useGraffiti } from "@/lib/graffiti/graffitiStore";
import { GRAFFITI_SPOTS, SPOT_BY_ID } from "@/lib/graffiti/spots";
import { sfx, startTourMusic } from "@/lib/game/audio";

/** How long the cut to black takes at either end of the tour. */
const FADE_MS = 420;

/**
 * The city tour's titles.
 *
 * The camera does the flying (`GameCamera`); this is the film around it —
 * letterbox, a name for each wall as the camera lands on it with the flat
 * artwork out of the editor pinned beside the street view of it, a closing
 * title over the block, a soundtrack, and a cut to black on the way out.
 */
export function TourOverlay() {
  const phase = useGraffiti((s) => s.phase);
  const stops = useGraffiti((s) => s.tourStops);
  const beat = useGraffiti((s) => s.tourBeat);
  const finale = useGraffiti((s) => s.tourFinale);
  const done = useGraffiti((s) => s.tourDone);
  const painted = useGraffiti((s) => s.painted);
  const tag = useGraffiti(selectTag);
  const count = useGraffiti(selectPieceCount);
  const endTour = useGraffiti((s) => s.endTour);

  const active = phase === "tour";
  const [veil, setVeil] = useState(false);
  const closing = useRef(false);

  // the soundtrack, for exactly as long as the tour runs
  useEffect(() => {
    if (!active) return;
    closing.current = false;
    const stop = startTourMusic();
    return () => stop();
  }, [active]);

  // air past the lens as each flight starts
  useEffect(() => {
    if (active && !beat.holding) sfx.whoosh(beat.stop === 0 ? 2.6 : 3);
  }, [active, beat.stop, beat.holding]);

  // Out through black: fade, hand back (or open the finale book), fade in.
  const close = useRef(() => {});
  close.current = () => {
    if (closing.current || useGraffiti.getState().phase !== "tour") return;
    closing.current = true;
    setVeil(true);
    window.setTimeout(() => {
      endTour();
      window.setTimeout(() => setVeil(false), 80);
    }, FADE_MS);
  };

  useEffect(() => {
    if (active && done) close.current();
  }, [active, done]);

  // skippable, but not by whatever click or key started it
  useEffect(() => {
    if (!active) return;
    const skip = (e: KeyboardEvent | MouseEvent) => {
      if ("code" in e && !["Escape", "Space", "Enter"].includes(e.code)) return;
      e.preventDefault();
      close.current();
    };
    const arm = window.setTimeout(() => {
      window.addEventListener("keydown", skip);
      window.addEventListener("mousedown", skip);
    }, 700);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("mousedown", skip);
    };
  }, [active]);

  const aerial = active && beat.stop >= stops.length;
  const id = active && !aerial ? stops[beat.stop] : undefined;
  const spot = id ? SPOT_BY_ID.get(id) : undefined;
  const piece = id ? painted[id] : undefined;
  const landed = Boolean(spot && beat.holding);
  const steps = piece?.process?.length ?? 0;
  // the progress along the bottom: each wall is a segment, the aerial the last
  const segments = stops.length + 1;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
        {/* letterbox */}
        <div
          className="absolute inset-x-0 top-0 bg-ink transition-transform duration-[700ms] ease-out"
          style={{ height: "11vh", transform: active ? "translateY(0)" : "translateY(-100%)" }}
        />
        <div
          className="absolute inset-x-0 bottom-0 bg-ink transition-transform duration-[700ms] ease-out"
          style={{ height: "11vh", transform: active ? "translateY(0)" : "translateY(100%)" }}
        />

        {active && (
          <>
            {/* where we are in it */}
            <div className="anim-rise absolute left-8 top-[calc(11vh+20px)] md:left-14">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-[7px] w-[7px] rounded-full"
                  style={{
                    background: finale ? "var(--gold)" : "var(--acid)",
                    boxShadow: `0 0 10px ${finale ? "var(--gold)" : "var(--acid)"}`,
                  }}
                />
                <span className="mono text-[10px] tracking-[0.14em] text-paper">
                  {finale ? "VICTORY LAP" : "CITY TOUR"} ·{" "}
                  {aerial ? "ARC DISTRICT" : `WALL ${beat.stop + 1} OF ${stops.length}`}
                </span>
              </div>
              <div className="mt-2 flex gap-[3px]">
                {Array.from({ length: segments }, (_, i) => (
                  <span
                    key={i}
                    className="block h-[3px] w-[28px] transition-colors duration-500"
                    style={{
                      background:
                        i < beat.stop || (i === beat.stop && beat.holding)
                          ? finale
                            ? "var(--gold)"
                            : "var(--acid)"
                          : i === beat.stop
                            ? "rgba(246,241,232,0.45)"
                            : "rgba(246,241,232,0.12)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* the wall's name, as the camera lands on it */}
            {spot && (
              <div
                key={spot.id}
                className="absolute bottom-[13vh] left-8 transition-all duration-500 md:left-14"
                style={{
                  opacity: landed ? 1 : 0,
                  transform: landed ? "translateY(0)" : "translateY(16px)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="h-[2px] w-10 bg-acid" />
                  <span className="stencil text-[11px] text-acid neon-text">A PIECE BY {tag}</span>
                </div>
                <h2
                  className="display mt-2 text-[clamp(30px,5.4vw,66px)] leading-[0.85] text-paper"
                  style={{ transform: "skewX(-5deg)", textShadow: "0 8px 40px rgba(0,0,0,0.8)" }}
                >
                  {spot.name}
                </h2>
                <p className="mono mt-2 text-[11px] text-ash">
                  {spot.district} · <span className="text-acid">+{spot.rep} REP</span>
                  {steps >= 2 ? ` · ${steps - 1} steps in the editor` : ""}
                </p>
              </div>
            )}

            {/* ...and the artwork that came out of the editor, beside the wall it went on */}
            {spot && piece && (
              <div
                key={`art-${spot.id}`}
                className="absolute bottom-[13vh] right-8 w-[210px] border border-paper/25 bg-ink/85 p-1.5 shadow-2xl transition-all duration-500 md:right-14"
                style={{
                  opacity: landed ? 1 : 0,
                  transform: landed ? "translateY(0) rotate(1.5deg)" : "translateY(18px) rotate(1.5deg)",
                  transitionDelay: landed ? "180ms" : "0ms",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={piece.graffitiTexture} alt="" className="block h-auto w-full" />
                <div className="flex items-center gap-1.5 px-0.5 pt-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-magenta" />
                  <span className="mono text-[8px] leading-none text-ash">
                    THE ARTWORK · OUT OF THE UNLAYER EDITOR
                  </span>
                </div>
              </div>
            )}

            {/* over the block */}
            <div
              className="absolute inset-x-0 top-[34vh] flex flex-col items-center text-center transition-all duration-[900ms]"
              style={{
                opacity: aerial && beat.holding ? 1 : 0,
                transform: aerial && beat.holding ? "translateY(0)" : "translateY(14px)",
              }}
            >
              <span
                className={`stencil text-[12px] ${finale ? "text-gold neon-text" : "text-acid neon-text"}`}
              >
                {finale ? `EVERY WALL ON THE BLOCK · ${tag}` : `A CITY BY ${tag}`}
              </span>
              <h2
                className="display mt-3 text-[clamp(44px,8.5vw,120px)] leading-[0.82]"
                style={{
                  transform: "skewX(-6deg)",
                  textShadow: "0 10px 50px rgba(0,0,0,0.75)",
                  ...(finale
                    ? {
                        background: "linear-gradient(96deg,#ffc542 0%,#c8ff32 50%,#22e0ff 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }
                    : { color: "var(--paper)" }),
                }}
              >
                {finale ? "STREET KING" : "ARC DISTRICT"}
              </h2>
              <p className="mono mt-4 text-[11px] tracking-[0.12em] text-paper/80">
                {count} OF {GRAFFITI_SPOTS.length} WALLS · EVERY ONE OF THEM MADE IN THE IMAGE EDITOR
              </p>
            </div>

            <span className="mono absolute inset-x-0 bottom-[4vh] text-center text-[10px] text-ash/60">
              ESC · SKIP
            </span>
          </>
        )}
      </div>

      {/* the cut to black on the way out */}
      <div
        className="pointer-events-none absolute inset-0 z-[59] bg-ink"
        style={{
          opacity: veil ? 1 : 0,
          transition: `opacity ${veil ? FADE_MS : 600}ms ease`,
        }}
      />
    </>
  );
}
