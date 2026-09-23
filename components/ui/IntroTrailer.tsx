"use client";

import { useEffect, useRef, useState } from "react";
import { selectTag, useGraffiti } from "@/lib/graffiti/graffitiStore";
import { GANG } from "@/lib/game/world";
import { sfx } from "@/lib/game/audio";
import {
  TrailerCanvas,
  preloadPlates,
  type PlateName,
  type ShotKind,
} from "./TrailerCanvas";

interface Shot {
  kind: ShotKind;
  seconds: number;
  /** small label, bottom left, like a slate */
  slate?: string;
  speaker?: string;
  line: string;
  /** optional second line, shown as a control hint */
  hint?: string;
  /** show the incoming-call card in the corner */
  call?: boolean;
  /** a photographic plate from public/imgs for this shot */
  photo?: PlateName;
  /** render the wordmark instead of a spoken line */
  title?: boolean;
}

/**
 * Vance only ever calls the player by their tag — whatever they wrote on the
 * menu — so the very first line of the game is addressed to them.
 */
const TAG_SLOT = "{TAG}";

/**
 * The briefing.
 *
 * Vance is paying you to go and write your name all over somebody else's
 * block. The trailer exists to make two things obvious before the player has
 * pressed a single key: who they're stealing walls from, and that the image
 * editor is the thing they'll be painting with.
 */
/**
 * Five shots, about thirteen seconds. It opens mid-call — no establishing
 * shot, no preamble — and the last beat carries the payoff and the title
 * together rather than spending a shot on each.
 */
const SHOTS: Shot[] = [
  {
    kind: "call",
    seconds: 2.3,
    slate: "INCOMING · VANCE",
    speaker: "VANCE",
    line: `${TAG_SLOT}. I got a job for you.`,
    call: true,
    photo: "doorway",
  },
  {
    // twice the words of any other beat, and it is the one that has to land:
    // it needs the reading time the short lines don't
    kind: "call",
    seconds: 4.8,
    speaker: "VANCE",
    line: `Downtown Arc is ${GANG.name} turf. Their crown is on every wall on it.`,
    call: true,
    photo: "alley",
  },
  {
    kind: "call",
    seconds: 2.6,
    speaker: "VANCE",
    line: "Put our name over theirs. All fourteen.",
    call: true,
    photo: "spotlight",
  },
  {
    kind: "studio",
    seconds: 2.9,
    slate: "YOUR CAN",
    line: "Walk up and press E — the image editor is your spray can.",
    hint: "Draw it, letter it, sticker it, import a picture, then PAINT THE WALL.",
  },
  {
    // two beats: the piece goes over their crown, then the lights drop and the
    // wordmark lands — drawn at once, the two NEONs read as one smeared word
    kind: "covered",
    seconds: 3.4,
    title: true,
    line: "GO PAINT THEIR BLOCK.",
  },
];

const TOTAL = SHOTS.reduce((n, s) => n + s.seconds, 0);

/**
 * The call rings before it is answered.
 *
 * It is a cold open, and it is also cover: the city is mounted behind the
 * briefing the moment it starts (`NeonWalls`), and building it — the scene
 * graph, every shader, every texture upload — is well over a second of busy
 * main thread. Spent here, on a black screen with a phone ringing, that is
 * invisible; the rings are CSS on the compositor and keep moving through it.
 * Spent after the briefing, it was a second and a half of black before the
 * drone shot.
 */
const RING_MS = 1700;

export function IntroTrailer() {
  const beginEntering = useGraffiti((s) => s.beginEntering);
  const tag = useGraffiti(selectTag);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [ringing, setRinging] = useState(true);
  const done = useRef(false);

  const finish = useRef(() => {
    if (done.current) return;
    done.current = true;
    sfx.click();
    beginEntering();
  });
  finish.current = () => {
    if (done.current) return;
    done.current = true;
    sfx.click();
    beginEntering();
  };

  useEffect(() => {
    preloadPlates();
    sfx.ring();
    let raf = 0;
    const openedAt = performance.now();
    let answered = false;
    let last = performance.now();
    let shotTime = 0;
    let shotIndex = 0;
    let total = 0;

    const tick = (now: number) => {
      // the clock only starts once the call is picked up
      if (!answered) {
        last = now;
        if (now - openedAt < RING_MS) {
          raf = requestAnimationFrame(tick);
          return;
        }
        answered = true;
        setRinging(false);
        sfx.click();
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      shotTime += dt;
      total += dt;
      setElapsed(total);

      const shot = SHOTS[shotIndex];
      if (shotTime >= shot.seconds) {
        shotTime = 0;
        shotIndex += 1;
        if (shotIndex >= SHOTS.length) {
          finish.current();
          return;
        }
        setIndex(shotIndex);
        sfx.hover();
      }
      setProgress(shotTime / SHOTS[shotIndex].seconds);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    const skip = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "Space" || e.code === "Enter") finish.current();
    };
    window.addEventListener("keydown", skip);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  // lets us jump straight to a shot while working on the cinematic
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __trailerShot?: (i: number) => void }).__trailerShot = (i: number) => {
      setIndex(Math.max(0, Math.min(SHOTS.length - 1, i)));
      setProgress(0.5);
    };
  }, []);

  const shot = SHOTS[index];

  // words land over the first 45% of the shot, so the sentence is complete
  // well before the cut and there's time to actually read it
  const words = shot.line.replace(TAG_SLOT, tag).split(" ");
  const shown = Math.ceil(words.length * Math.min(1, progress / 0.45));

  return (
    <div className="grain absolute inset-0 z-50 overflow-hidden bg-ink">
      <TrailerCanvas
        shot={shot.kind}
        progress={progress}
        index={index}
        photo={shot.photo}
        tag={tag}
      />

      {shot.title && (
        <div
          className="pointer-events-none absolute inset-0 bg-ink"
          style={{ opacity: Math.min(1, Math.max(0, (progress - 0.4) / 0.2)) * 0.8 }}
        />
      )}

      {/* letterbox */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[10vh] bg-ink" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[10vh] bg-ink" />

      {/* the call, top right, like a phone you can't put down */}
      {shot.call && (
        <div
          className="hud-panel corner-cut anim-rise absolute right-8 top-[13vh] w-[224px] px-4 py-3 md:right-14"
          style={{ borderColor: "rgba(255,47,134,0.4)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: GANG.accent, boxShadow: `0 0 12px ${GANG.accent}` }}
            />
            <span className="mono text-[9px] tracking-[0.18em] text-ash">ON THE LINE</span>
          </div>
          <p className="display mt-1.5 text-[22px] leading-none text-paper">VANCE</p>
          <p className="mono mt-1 text-[9px] text-ash/70">MOBILE · ARC DISTRICT</p>
          <div className="mt-2.5 flex items-end gap-[3px]">
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className="w-[6px]"
                style={{
                  height: `${4 + ((i * 7 + index * 5) % 13)}px`,
                  background: GANG.accent,
                  opacity: 0.25 + ((i * 3 + index) % 5) * 0.15,
                  animation: `nw-pulse ${0.5 + (i % 4) * 0.18}s ease-in-out infinite`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* slate */}
      {shot.slate && (
        <div
          key={`slate-${index}`}
          className="anim-rise absolute left-8 top-[12vh] flex items-center gap-3 md:left-14"
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-magenta" />
          <span className="stencil text-[10px] text-paper/70">{shot.slate}</span>
        </div>
      )}

      {/* The line, centre screen. It used to sit in the bottom-left corner,
          which is nowhere near where anyone is looking during a cut. Words
          arrive in sequence so the eye is pulled along the sentence instead of
          being handed a finished block to find. */}
      <div
        key={`line-${index}`}
        className={`pointer-events-none absolute inset-x-0 flex flex-col items-center px-8 text-center md:px-14 ${
          // the studio shot's mock of the editor fills the top half; its line
          // goes underneath rather than across the canvas and the rail
          shot.kind === "studio" ? "top-[64%]" : "top-[46%]"
        }`}
      >
        {/* a soft scrim so the type stays readable over a photograph */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -z-10 h-[320px] w-[min(1100px,92vw)] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(6,3,12,0.82) 0%, rgba(6,3,12,0.5) 45%, rgba(6,3,12,0) 72%)",
          }}
        />

        {shot.title ? (
          progress > 0.5 && (
          <div className="anim-pop">
            <h1
              className="display leading-[0.82]"
              style={{ fontSize: "clamp(52px,10vw,140px)", transform: "skewX(-6deg)" }}
            >
              <span
                style={{
                  background:
                    "linear-gradient(96deg,#ffffff 0%,#c8ff32 34%,#22e0ff 62%,#ff2f86 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                NEON WALLS
              </span>
            </h1>
            <p className="display mt-4 text-[clamp(14px,2vw,24px)] tracking-[0.3em] text-paper/85">
              {shot.line}
            </p>
          </div>
          )
        ) : (
          <div className="max-w-[900px]">
            {shot.speaker && (
              <p
                className="stencil anim-rise mb-3 text-[12px]"
                style={{ color: GANG.accent, animationDuration: "0.28s" }}
              >
                {shot.speaker}
              </p>
            )}
            <p
              className="display text-[clamp(22px,3.6vw,50px)] leading-[1.1] text-paper"
              style={{ textShadow: "0 6px 34px rgba(0,0,0,0.95)" }}
            >
              {words.map((word, i) => (
                <span
                  key={`${index}-${i}`}
                  style={{
                    display: "inline-block",
                    marginRight: "0.28em",
                    opacity: i < shown ? 1 : 0,
                    transform: i < shown ? "translateY(0)" : "translateY(0.24em)",
                    transition: "opacity 180ms ease-out, transform 180ms ease-out",
                  }}
                >
                  {word}
                </span>
              ))}
            </p>
            {shot.hint && (
              <p
                className="mx-auto mt-4 max-w-[640px] text-[13px] leading-relaxed text-ash transition-opacity duration-300"
                style={{ opacity: shown >= words.length ? 1 : 0 }}
              >
                {shot.hint}
              </p>
            )}
          </div>
        )}
      </div>

      {/* the phone, ringing, before anyone speaks */}
      <div
        className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center bg-ink transition-opacity duration-300"
        style={{ opacity: ringing ? 1 : 0 }}
        aria-hidden={!ringing}
      >
        <div className="relative flex h-24 w-24 items-center justify-center">
          {[0, 0.45, 0.9].map((delay) => (
            <span
              key={delay}
              className="absolute inset-0 rounded-full border-2"
              style={{
                borderColor: GANG.accent,
                animation: `nw-ring 1.35s cubic-bezier(0.2,0.6,0.4,1) ${delay}s infinite both`,
              }}
            />
          ))}
          <span
            className="relative flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: GANG.accent, boxShadow: `0 0 40px ${GANG.accent}` }}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="#07050c" aria-hidden>
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
            </svg>
          </span>
        </div>
        <p className="mono mt-7 text-[11px] tracking-[0.34em]" style={{ color: GANG.accent }}>
          INCOMING CALL
        </p>
        <p className="display mt-2 text-[clamp(40px,6vw,72px)] leading-none text-paper">VANCE</p>
        <p className="mono mt-2 text-[10px] tracking-[0.2em] text-ash/70">MOBILE · ARC DISTRICT</p>
      </div>

      {/* progress + skip */}
      <div className="absolute inset-x-0 bottom-[4vh] flex items-center gap-4 px-8 md:px-14">
        <div className="h-[2px] flex-1 bg-white/10">
          <span
            className="block h-full origin-left bg-acid"
            style={{ transform: `scaleX(${Math.min(1, elapsed / TOTAL)})` }}
          />
        </div>
        <button
          onClick={() => finish.current()}
          onMouseEnter={() => sfx.hover()}
          className="mono border border-paper/25 px-4 py-2 text-[10px] text-paper/70 transition-colors hover:border-paper/60 hover:text-paper"
        >
          SKIP BRIEFING · ESC
        </button>
      </div>
    </div>
  );
}
