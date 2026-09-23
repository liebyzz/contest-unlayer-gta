"use client";

import { useEffect, useState } from "react";
import { selectTag, useGraffiti } from "@/lib/graffiti/graffitiStore";
import { SPOT_BY_ID } from "@/lib/graffiti/spots";
import { sfx } from "@/lib/game/audio";
import { requestPhoto } from "@/lib/game/photo";
import { STOP_MOTION_MIN_FRAMES, stopMotionTiming } from "@/lib/graffiti/timelapse";

const HOLD_MS = 4400;
/**
 * When to photograph the wall.
 *
 * The paint dissolves on over about two seconds and the camera takes roughly
 * the same time to settle into the push-in, so anything earlier catches a
 * half-sprayed piece from a moving camera. This is late enough to be the shot
 * the player is looking at and early enough that skipping the reveal is rare.
 */
const WALL_SHOT_MS = 3000;
/**
 * Matches the letterbox: the grab is the framed picture, not the whole canvas,
 * so the saved image is the cinematic the player just watched.
 */
const WALL_SHOT_CROP = { x: 0.02, y: 0.11, w: 0.96, h: 0.78 };

/**
 * The payoff. The editor closes, the camera swings around to the wall, the
 * piece sprays itself on and this sits over the top of it: letterbox bars, the
 * name of the spot, the rep it earned.
 */
export function RevealSequence() {
  const phase = useGraffiti((s) => s.phase);
  const revealId = useGraffiti((s) => s.revealSpotId);
  const endReveal = useGraffiti((s) => s.endReveal);
  const tag = useGraffiti(selectTag);
  const rankUp = useGraffiti((s) => s.rankUp);
  const [flash, setFlash] = useState(false);
  /**
   * The street photograph, shown as it is taken.
   *
   * Without this the grab is invisible: the piece is quietly filed away and a
   * player who never presses G never learns their work was photographed where
   * it stands. A print sliding into the corner of the letterbox at the moment
   * the shutter goes says the whole feature in one beat.
   */
  const [print, setPrint] = useState<string | null>(null);
  /**
   * How many steps the wall is replaying, if it is replaying at all. Said out
   * loud in the corner, because a wall flickering through versions of itself
   * reads as a glitch until something tells you it is your own session.
   */
  const steps = useGraffiti((s) =>
    s.revealSpotId ? (s.painted[s.revealSpotId]?.process?.length ?? 0) : 0,
  );
  const [replayed, setReplayed] = useState(false);

  const active = phase === "reveal" && Boolean(revealId);
  const spot = revealId ? SPOT_BY_ID.get(revealId) : undefined;

  useEffect(() => {
    if (!active) return;
    setPrint(null);
    setReplayed(false);
    setFlash(true);
    sfx.spray(1.15);
    const flashOff = setTimeout(() => setFlash(false), 60);
    const sting = setTimeout(() => {
      if (useGraffiti.getState().rankUp) sfx.rankUp();
      else sfx.confirm();
    }, 1500);
    const done = setTimeout(() => endReveal(), HOLD_MS);
    const count = useGraffiti.getState().painted[revealId ?? ""]?.process?.length ?? 0;
    const replayMs =
      count >= STOP_MOTION_MIN_FRAMES ? (0.45 + stopMotionTiming(count).total) * 1000 : 0;
    const landed = setTimeout(() => setReplayed(true), replayMs);

    // Keep the piece as it looks in the street. This is the picture the black
    // book shows and the one the contact sheet exports — the editor's flat
    // canvas is the artwork, this is the artwork hanging on a wall at night.
    const id = revealId;
    const portrait = setTimeout(() => {
      if (!id) return;
      requestPhoto(
        (url) => {
          if (!url) return;
          useGraffiti.getState().attachWallShot(id, url);
          setPrint(url);
          sfx.click();
        },
        { crop: WALL_SHOT_CROP, width: 1280, quality: 0.9 },
      );
    }, WALL_SHOT_MS);

    // only allow skipping once the piece has actually landed, so the click
    // that opened the reveal can't immediately dismiss it
    const skip = () => endReveal();
    // ...and never in the middle of the wall replaying how it was made
    const armSkip = setTimeout(() => {
      window.addEventListener("keydown", skip);
      window.addEventListener("mousedown", skip);
    }, Math.max(2000, replayMs + 250));

    return () => {
      clearTimeout(flashOff);
      clearTimeout(sting);
      clearTimeout(done);
      clearTimeout(landed);
      clearTimeout(portrait);
      clearTimeout(armSkip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("mousedown", skip);
    };
  }, [active, revealId, endReveal]);

  return (
    <>
      {/* the aerosol flash as we come back out of the studio */}
      <div
        className="pointer-events-none absolute inset-0 z-50 bg-white transition-opacity duration-[600ms]"
        style={{ opacity: flash ? 0.92 : 0 }}
      />

      {/* letterbox */}
      <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 bg-ink transition-transform duration-[700ms] ease-out"
          style={{ height: "11vh", transform: active ? "translateY(0)" : "translateY(-100%)" }}
        />
        <div
          className="absolute inset-x-0 bottom-0 bg-ink transition-transform duration-[700ms] ease-out"
          style={{ height: "11vh", transform: active ? "translateY(0)" : "translateY(100%)" }}
        />

        {spot && (
          <div
            className="absolute bottom-[13vh] left-8 transition-all duration-700 md:left-14"
            style={{
              opacity: active ? 1 : 0,
              transform: active ? "translateY(0)" : "translateY(20px)",
              transitionDelay: active ? "900ms" : "0ms",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="h-[2px] w-10 bg-acid" />
              <span className="stencil text-[11px] text-acid neon-text">
                A PIECE BY {tag}
              </span>
            </div>
            <h2
              className="display mt-2 text-[clamp(34px,6vw,72px)] leading-[0.85] text-paper"
              style={{ transform: "skewX(-5deg)", textShadow: "0 8px 40px rgba(0,0,0,0.8)" }}
            >
              {spot.name}
            </h2>
            <p className="mono mt-2 text-[11px] text-ash">
              {spot.district} · <span className="text-acid">+{spot.rep} REP</span> · painted with
              the Unlayer image editor
            </p>
          </div>
        )}

        {/* the time-lapse caption, while the wall plays back how it was made */}
        {active && steps >= STOP_MOTION_MIN_FRAMES && (
          <div className="anim-rise absolute left-8 top-[calc(11vh+20px)] md:left-14">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-[7px] w-[7px] rounded-full"
                style={{
                  background: replayed ? "var(--acid)" : "#ff3b3b",
                  boxShadow: replayed ? "0 0 10px var(--acid)" : "0 0 10px #ff3b3b",
                  animation: replayed ? "none" : "nw-pulse 0.7s ease-in-out infinite",
                }}
              />
              <span className="mono text-[10px] tracking-[0.14em] text-paper">
                {replayed
                  ? "FINISHED · ON THE WALL"
                  : `TIME-LAPSE · ${steps - 1} STEPS IN THE EDITOR`}
              </span>
            </div>
            <span className="mt-2 block h-[3px] w-[230px] overflow-hidden bg-white/10">
              <span
                className="block h-full w-full origin-left bg-acid"
                style={{
                  animation: `nw-fill ${stopMotionTiming(steps).total}s linear 0.45s both`,
                }}
              />
            </span>
          </div>
        )}

        {/* a new rank, stamped on as the sting plays */}
        {active && rankUp && (
          <div
            className="absolute right-8 top-[14vh] text-right md:right-14"
            style={{ animation: "nw-stamp 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) 1.45s both" }}
          >
            <span className="stencil mb-2 block text-[11px] text-gold">NEW RANK</span>
            <span
              className="display block text-[clamp(40px,6.4vw,84px)] leading-[0.85] text-gold"
              style={{
                transform: "rotate(-3deg) skewX(-6deg)",
                textShadow: "0 0 34px rgba(255,197,66,0.55), 0 8px 30px rgba(0,0,0,0.8)",
              }}
            >
              {rankUp}
            </span>
          </div>
        )}

        {active && print && (
          <div className="anim-pop absolute bottom-[13vh] right-8 w-[196px] border border-paper/25 bg-ink/85 p-1.5 shadow-2xl md:right-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={print} alt="" className="block h-auto w-full" />
            <div className="flex items-center gap-1.5 px-0.5 pt-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-acid" />
              <span className="mono text-[8px] leading-none text-ash">
                FILED IN THE BLACK BOOK · G
              </span>
            </div>
          </div>
        )}

        {active && (
          <span className="mono absolute inset-x-0 bottom-[4vh] text-center text-[10px] text-ash/60">
            PRESS ANY KEY TO CONTINUE
          </span>
        )}
      </div>
    </>
  );
}
