"use client";

import { useEffect } from "react";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { sfx, unlockAudio } from "@/lib/game/audio";

const CONTROLS: [string, string][] = [
  ["W A S D", "Walk the block"],
  ["SHIFT", "Run"],
  ["MOUSE", "Look around (click to capture, ESC to release)"],
  ["WHEEL", "Pull the camera in and out"],
  ["E", "Open the graffiti studio at a spot"],
  ["LEFT MOUSE", "Fire the pistol (STORY) — it reloads itself when the clip runs dry"],
  ["RIGHT MOUSE", "Hold to aim (STORY) — steadier, over the shoulder"],
  ["C", "Phone camera — photograph the city, then paint the photo"],
  ["G", "Open the black book — every piece you've put up"],
  ["M", "Mute / unmute"],
];

const LOOP = [
  {
    n: "01",
    t: "Find a spot",
    d: "Fourteen surfaces are marked with a green beam — walls, shop shutters, a billboard, a hoarding, even a parked van. The radar points at the ones you haven't hit.",
  },
  {
    n: "02",
    t: "Press E",
    d: "The city freezes and the GRAFFITI STUDIO opens with a photograph of that exact surface loaded into the Unlayer React Image Editor.",
  },
  {
    n: "03",
    t: "Make the piece",
    d: "Start from your own tag — the studio draws it wildstyle, chrome, bubble or stencil — or import a picture, or a photo you took in the street. Then spray, letter, sticker, crop and filter over it. Every tool in the editor is a tool in the game — and ON THE STREET, top left, the game keeps rendering that wall at night with your work in progress on it.",
  },
  {
    n: "04",
    t: "Paint the wall",
    d: "Hit PAINT THE WALL. The studio closes, the camera swings round and the wall replays how you made it — every stroke, tag and filter you put down in the editor, as a stop-motion time-lapse — before the finished piece lands. It stays there.",
  },
  {
    n: "05",
    t: "Then run",
    d: "In STORY this is Carmine Kings turf: every piece you put up brings them out of the doorways shouting, and gunfire brings the police — one star at a time. Pick FREE PAINT on the menu and there is no pistol and nobody shooting — the street stops to take pictures of your work instead.",
  },
  {
    n: "06",
    t: "Keep it",
    d: "Every finished piece is photographed where it stands. Press G for the black book: each one opens as the artwork, the picture of it in the street, a before/after wipe, or its time-lapse — which saves as a video, title card to street shot. Download or copy any of them, or save the whole session as one contact sheet — or hit TOUR YOUR CITY and the camera flies the roofs from piece to piece. Paint all fourteen and that flight is your victory lap. Your city is kept in this browser for next time.",
  },
];

const HEAT = [
  ["★", "A beat cop walking your way"],
  ["★★", "Two units, called in"],
  ["★★★", "Officers from every corner"],
  ["★★★★", "Tactical — they shoot straight"],
  ["★★★★★", "Manhunt"],
];

export function HowToPlay() {
  const showMenu = useGraffiti((s) => s.showMenu);
  const enterCity = useGraffiti((s) => s.enterCity);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") showMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMenu]);

  return (
    <div className="grain absolute inset-0 z-40 overflow-y-auto bg-ink/92 backdrop-blur-md">
      <div className="mx-auto flex min-h-full w-full max-w-[1080px] flex-col justify-center px-6 py-14">
        <div className="anim-rise">
          <span className="stencil text-[11px] text-acid">HOW TO PLAY</span>
          <h2
            className="display mt-2 text-[clamp(36px,6vw,68px)] leading-[0.86]"
            style={{ transform: "skewX(-5deg)" }}
          >
            The editor is the spray can.
          </h2>
          <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-ash">
            NEON WALLS is a small open-world block built around one idea: the graffiti you make in
            the <span className="text-paper">Unlayer React Image Editor</span> is the graffiti that
            appears in the world. Same pixels in, same pixels out. The block belongs to the{" "}
            <span style={{ color: "#ff5470" }}>Carmine Kings</span>, and you are about to write over
            every mark they own.
          </p>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid gap-3">
            {LOOP.map((s, i) => (
              <div
                key={s.n}
                className="hud-panel corner-cut anim-rise flex gap-4 p-4"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                <span className="display text-[26px] leading-none text-acid/70">{s.n}</span>
                <div>
                  <h3 className="display text-[17px] tracking-wide text-paper">{s.t}</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-ash">{s.d}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="anim-rise" style={{ animationDelay: "260ms" }}>
            <div className="hud-panel corner-cut p-5">
              <span className="stencil text-[10px] text-ash">CONTROLS</span>
              <div className="mt-3 grid gap-2.5">
                {CONTROLS.map(([k, d]) => (
                  <div key={k} className="flex items-start gap-3">
                    <kbd className="mono min-w-[72px] border border-white/15 bg-white/5 px-2 py-1 text-center text-[10px] text-paper/90">
                      {k}
                    </kbd>
                    <span className="pt-1 text-[11px] leading-tight text-ash">{d}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hud-panel corner-cut mt-3 p-5">
              <span className="stencil text-[10px] text-ash">HEAT</span>
              <div className="mt-2 grid gap-1.5">
                {HEAT.map(([stars, what]) => (
                  <div key={stars} className="flex items-baseline gap-3">
                    <span className="min-w-[64px] text-[11px] text-gold">{stars}</span>
                    <span className="text-[11px] leading-tight text-ash">{what}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hud-panel corner-cut mt-3 p-5">
              <span className="stencil text-[10px] text-ash">PROGRESSION</span>
              <p className="mt-2 text-[12px] leading-relaxed text-ash">
                Every surface is worth reputation. Paint all fourteen and the block is yours —{" "}
                <span className="display text-gold">STREET KING</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Sticky, because on a 900px-tall laptop the page scrolls and this is
            the only way out of it — including the button that starts the game. */}
        <div
          className="anim-rise sticky bottom-0 -mx-6 mt-10 flex flex-wrap items-center gap-4 border-t border-white/10 bg-ink/92 px-6 py-5 backdrop-blur-md"
          style={{ animationDelay: "420ms" }}
        >
          {/* On a 768px laptop the page runs to roughly twice the window and
              this bar sat on the content with a hard edge, which reads as the
              bottom of the page rather than the middle of it. Softening the
              cut is what says there is more below. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-full h-14"
            style={{ background: "linear-gradient(to top, rgba(7,5,12,0.92), transparent)" }}
          />
          <button
            onClick={() => {
              unlockAudio();
              sfx.click();
              enterCity(useGraffiti.getState().freePaint);
            }}
            onMouseEnter={() => sfx.hover()}
            className="corner-cut border border-acid/70 bg-acid px-8 py-3.5 transition-transform hover:scale-[1.02]"
          >
            <span className="display text-[17px] tracking-[0.14em] text-ink">ENTER CITY</span>
          </button>
          <button
            onClick={() => {
              sfx.back();
              showMenu();
            }}
            className="corner-cut border border-paper/25 px-7 py-3.5 text-paper/80 transition-colors hover:border-paper/60 hover:text-paper"
          >
            <span className="display text-[15px] tracking-[0.14em]">BACK</span>
          </button>
          <span className="mono ml-auto hidden text-[10px] text-ash/50 sm:inline">
            SCROLL FOR CONTROLS, HEAT AND THE BLACK BOOK
          </span>
        </div>
      </div>
    </div>
  );
}
