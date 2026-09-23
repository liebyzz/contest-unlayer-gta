"use client";

import { useEffect, useState } from "react";
import { MenuBackdrop } from "./MenuBackdrop";
import { DEFAULT_TAG, selectPieceCount, useGraffiti } from "@/lib/graffiti/graffitiStore";
import { GRAFFITI_SPOTS, SPOT_BY_ID } from "@/lib/graffiti/spots";
import {
  tagDraft,
  composeArtOnSurface,
  surfaceImage,
  tagPiece,
  type TagStyle,
} from "@/lib/graffiti/surfaces";
import { sfx, unlockAudio } from "@/lib/game/audio";

/**
 * Is this a machine that can actually play it?
 *
 * The menu is responsive and looks perfectly inviting on a phone, which is the
 * problem: tap ENTER CITY there and you get a briefing, a city, and no way to
 * move — WASD and mouse-look are the whole control scheme. Better to say so on
 * the way in than to let someone conclude the game is broken.
 */
function useNeedsDesktop() {
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      setNeeds(coarse || window.innerWidth < 860);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return needs;
}

/** The walls the menu shows off, and the hand each one is written in. */
const SHOWCASE: { spot: string; style: TagStyle; seed: number }[] = [
  { spot: "bodega-shutter", style: "wild", seed: 5 },
  { spot: "alley-side", style: "chrome", seed: 3 },
  { spot: "arclight-board", style: "bubble", seed: 7 },
];

const LOOP_STEPS = [
  { n: "01", label: "FIND A WALL", note: "Fourteen spots on Carmine turf" },
  { n: "02", label: "OPEN THE STUDIO", note: "Unlayer's image editor, in-game" },
  { n: "03", label: "PAINT THE CITY", note: "Replayed on the wall, step by step" },
];

/** How long each beat of the loop holds: the bare wall, the studio, the piece. */
const BEAT_MS = [1500, 1500, 3200];

/**
 * The pitch, played rather than listed.
 *
 * A wall with the marker on it, the studio coming up over it, and then the
 * player's own tag sprayed across it left to right — round three different
 * surfaces. Three stills in a column said the same thing, but only to someone
 * who stopped to read them; this says it to anyone who glances right. Every
 * picture is drawn by the game's own surface and tag generators.
 */
function LoopShowcase({ tag }: { tag: string }) {
  // the pieces follow the tag field a beat behind: three canvases a keystroke is visible lag
  const [word, setWord] = useState(tag);
  useEffect(() => {
    const t = window.setTimeout(() => setWord(tag), 350);
    return () => window.clearTimeout(t);
  }, [tag]);

  const [slides, setSlides] = useState<{ bare: string; done: string; name: string }[] | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    void Promise.all(
      SHOWCASE.map(async ({ spot: id, style, seed }) => {
        const spot = SPOT_BY_ID.get(id) ?? GRAFFITI_SPOTS[0];
        const bare = surfaceImage(spot);
        const done = await composeArtOnSurface(spot, tagPiece(word, style, seed, 900, 470)).catch(
          () => bare,
        );
        return { bare, done, name: spot.name };
      }),
    )
      .then((ready) => {
        if (alive) setSlides(ready);
      })
      // A throw building one slide (e.g. tagPiece on an odd word) would
      // otherwise reject the whole batch silently and freeze the showcase on
      // whatever it last had — this menu's centrepiece, stuck forever on one
      // keystroke's art. Keep the previous slides rather than show nothing.
      .catch((err) => {
        if (alive) console.error("[LoopShowcase] slide render failed", err);
      });
    return () => {
      alive = false;
    };
  }, [word]);

  const [slide, setSlide] = useState(0);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!slides) return;
    const t = window.setTimeout(() => {
      if (beat < 2) {
        setBeat(beat + 1);
      } else {
        setBeat(0);
        setSlide((i) => (i + 1) % slides.length);
      }
    }, BEAT_MS[beat]);
    return () => window.clearTimeout(t);
  }, [beat, slides]);

  return (
    <div className="anim-rise w-[min(480px,34vw)]" style={{ animationDelay: "520ms" }}>
      <div className="hud-panel corner-cut relative aspect-[16/10] overflow-hidden">
        {slides?.map((sl, i) => {
          const active = i === slide;
          // an outgoing slide stays painted while it fades
          const open = active ? beat === 2 : true;
          return (
            <div
              key={i}
              className="absolute inset-0 transition-opacity duration-700"
              // a paste-up billboard is white paper; held down to sit with the brick
              style={{ opacity: active ? 1 : 0, filter: "brightness(0.8) contrast(1.06)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sl.bare} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sl.done}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  clipPath: `inset(0 ${open ? 0 : 100}% 0 0)`,
                  transition:
                    active && beat === 2 ? "clip-path 1.2s cubic-bezier(0.45, 0, 0.25, 1)" : "none",
                }}
              />
            </div>
          );
        })}

        {/* pulled down into the menu's night, so the wall sits in the scene behind it */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(7,5,12,0.62) 100%), linear-gradient(180deg, rgba(20,10,40,0.25), rgba(7,5,12,0.35))",
          }}
        />

        {/* the aerosol edge riding the wipe */}
        {slides && beat === 2 && (
          <span
            key={`sweep-${slide}`}
            className="pointer-events-none absolute inset-y-0 w-[3px] bg-acid"
            style={{
              boxShadow: "0 0 18px 4px rgba(200,255,50,0.75)",
              animation: "nw-sweep 1.2s cubic-bezier(0.45, 0, 0.25, 1) both",
            }}
          />
        )}

        {/* beat 1: the wall, marked */}
        <div
          className="pointer-events-none absolute inset-[9%] transition-opacity duration-300"
          style={{ opacity: slides && beat === 0 ? 1 : 0 }}
        >
          {(["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"] as const).map(
            (c) => (
              <span key={c} className={`anim-pulse absolute h-7 w-10 border-acid ${c}`} />
            ),
          )}
          <span className="mono absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 bg-ink/85 px-2 py-1 text-[10px] text-paper">
            <kbd className="border border-acid/60 bg-acid/15 px-1.5 text-acid">E</kbd>
            OPEN GRAFFITI STUDIO
          </span>
        </div>

        {/* beat 2: the studio comes up over it */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{ opacity: slides && beat === 1 ? 1 : 0 }}
        >
          <div className="absolute inset-[7%] right-[15%] border border-dashed border-white/35" />
          <div className="absolute inset-y-[7%] right-[4%] flex w-[8%] flex-col items-center gap-[7%] bg-ink/80 py-[3%]">
            {Array.from({ length: 7 }, (_, k) => (
              <span
                key={k}
                className="block aspect-square w-[55%] rounded-[2px]"
                style={{ background: k === 3 ? "var(--acid)" : "rgba(246,241,232,0.28)" }}
              />
            ))}
          </div>
          <span className="mono absolute left-[7%] top-[2%] bg-ink/85 px-1.5 py-[2px] text-[9px] text-acid">
            @unlayer/react-image-editor
          </span>
        </div>

        {/* beat 3: signed */}
        {slides && (
          <div
            className="pointer-events-none absolute bottom-3 left-3 transition-all duration-500"
            style={{
              opacity: beat === 2 ? 1 : 0,
              transform: beat === 2 ? "none" : "translateY(6px)",
              transitionDelay: beat === 2 ? "900ms" : "0ms",
            }}
          >
            <span className="stencil block text-[9px] text-acid">A PIECE BY {word}</span>
            <span className="display block text-[22px] leading-none text-paper">
              {slides[slide].name}
            </span>
          </div>
        )}

        {!slides && (
          <span className="mono absolute inset-0 flex items-center justify-center text-[10px] text-ash/60">
            shaking the can…
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {LOOP_STEPS.map((st, i) => {
          const on = beat === i;
          return (
            <div key={st.n} className="min-w-0">
              <span className="relative block h-[2px] w-full overflow-hidden bg-white/10">
                {on && slides && (
                  <span
                    key={`${slide}-${beat}`}
                    className="absolute inset-y-0 left-0 w-full origin-left bg-acid"
                    style={{ animation: `nw-fill ${BEAT_MS[i]}ms linear both` }}
                  />
                )}
              </span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="mono text-[10px]" style={{ color: on ? "var(--acid)" : "rgba(164,152,184,0.6)" }}>
                  {st.n}
                </span>
                <span
                  className="display truncate text-[14px] leading-none tracking-wide transition-colors"
                  style={{ color: on ? "var(--paper)" : "rgba(246,241,232,0.45)" }}
                >
                  {st.label}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-tight text-ash/80">{st.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How the block behaves while you paint.
 *
 * Two honest ways to play rather than a difficulty slider: the turf war, or
 * the city with the safety on. Whichever is selected is what ENTER CITY does,
 * so there is exactly one button to press.
 */
const MODES = [
  {
    id: "story" as const,
    label: "STORY",
    note: "The Kings come for every piece you put up.",
  },
  {
    id: "free" as const,
    label: "FREE PAINT",
    note: "Same city, nobody shoots. Just you and fourteen walls.",
  },
];

/**
 * The writer's name, asked for up front.
 *
 * One field, optional, and everything downstream uses it: the briefing opens
 * with it, the studio draws it four ways, the black book is signed with it.
 */
function TagField() {
  const tag = useGraffiti((s) => s.tag);
  const setTag = useGraffiti((s) => s.setTag);
  const hydrated = useGraffiti((s) => s.hydrated);
  const [draft, setDraft] = useState(tag);
  // the saved tag arrives a moment after mount
  useEffect(() => {
    if (hydrated) setDraft(useGraffiti.getState().tag);
  }, [hydrated]);

  return (
    <label className="flex items-center gap-3">
      <span className="stencil shrink-0 text-[10px] text-ash">YOUR TAG</span>
      <input
        value={draft}
        onChange={(e) => {
          const next = tagDraft(e.target.value);
          setDraft(next);
          setTag(next);
        }}
        placeholder={DEFAULT_TAG}
        maxLength={10}
        spellCheck={false}
        className="display w-[190px] border-b-2 border-acid/40 bg-transparent px-1 py-1 text-[22px] leading-none tracking-[0.14em] text-acid outline-none placeholder:text-ash/35 focus:border-acid"
      />
    </label>
  );
}

/** "Your city is saved", and the way to wipe it. */
function SavedCity() {
  const pieces = useGraffiti(selectPieceCount);
  const photos = useGraffiti((s) => s.photos.length);
  const startOver = useGraffiti((s) => s.startOver);
  const [arming, setArming] = useState(false);

  useEffect(() => {
    if (!arming) return;
    const t = window.setTimeout(() => setArming(false), 3200);
    return () => window.clearTimeout(t);
  }, [arming]);

  if (pieces === 0 && photos === 0) return null;

  return (
    <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ash/80">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
      <span>
        YOUR CITY IS SAVED ·{" "}
        <span className="text-gold">
          {pieces}/{GRAFFITI_SPOTS.length} WALLS
        </span>
        {photos > 0 ? ` · ${photos} PHOTO${photos === 1 ? "" : "S"}` : ""}
      </span>
      <button
        onClick={() => {
          if (!arming) {
            sfx.hover();
            setArming(true);
            return;
          }
          sfx.back();
          setArming(false);
          void startOver();
        }}
        className="underline-offset-4 transition-colors hover:underline"
        style={{ color: arming ? "var(--magenta)" : "rgba(164,152,184,0.7)" }}
      >
        {arming ? "CLICK AGAIN TO BUFF EVERY WALL" : "START OVER"}
      </button>
    </div>
  );
}

export function MainMenu() {
  const enterCity = useGraffiti((s) => s.enterCity);
  const showHowTo = useGraffiti((s) => s.showHowTo);
  const tag = useGraffiti((s) => s.tag) || DEFAULT_TAG;
  const needsDesktop = useNeedsDesktop();
  // Kept in the store rather than here, so HOW TO PLAY's own ENTER CITY
  // button honours whichever mode was picked before going in to read it.
  const mode = useGraffiti((s) => (s.freePaint ? "free" : "story"));
  const setMode = (m: "story" | "free") => useGraffiti.setState({ freePaint: m === "free" });

  const start = () => {
    unlockAudio();
    sfx.click();
    enterCity(mode === "free");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT";
      // a space in the tag field is a space, not a start button
      if (e.code === "Enter" || (e.code === "Space" && !typing)) {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="grain vignette absolute inset-0 overflow-hidden bg-ink">
      <MenuBackdrop />

      <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto p-6 md:p-12 [@media(max-height:800px)]:gap-4 [@media(max-height:800px)]:md:px-12 [@media(max-height:800px)]:md:py-7">
        <header className="anim-rise flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-acid" />
            <span className="stencil text-[11px] text-ash">ARC DISTRICT · EAST SIDE</span>
          </div>
          <span className="mono text-[10px] text-ash/70">21:14 · AFTER THE RAIN</span>
        </header>

        <div className="flex flex-1 items-center">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="max-w-[720px]">
              <p
                className="stencil anim-rise text-[12px] text-magenta"
                style={{ animationDelay: "80ms" }}
              >
                AN ORIGINAL OPEN-WORLD GRAFFITI SANDBOX
              </p>

              <h1
                className="display anim-rise mt-3 leading-[0.82]"
                style={{
                  animationDelay: "160ms",
                  // bounded by height as well: on a 720p laptop the width-only size
                  // pushed ENTER CITY off the bottom of the screen
                  fontSize: "clamp(56px, min(12vw, 18vh), 168px)",
                  transform: "skewX(-6deg)",
                }}
              >
                {/* `w-fit`, because a background-clip gradient is laid across
                    the *box*: as a full-width block the ramp spent its cyan and
                    its magenta on the empty half of the line, and the wordmark
                    got white-to-green and stopped. Shrunk to the glyphs, the
                    whole city's palette crosses the word. */}
                <span
                  className="block w-fit"
                  style={{
                    background:
                      "linear-gradient(96deg, #ffffff 0%, #c8ff32 34%, #22e0ff 62%, #ff2f86 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    filter: "drop-shadow(0 0 34px rgba(200,255,50,0.22))",
                  }}
                >
                  NEON
                </span>
                <span
                  className="anim-flicker block text-paper"
                  style={{ textShadow: "0 0 44px rgba(255,47,134,0.45)" }}
                >
                  WALLS
                </span>
              </h1>

              <p
                className="display anim-rise mt-5 [@media(max-height:800px)]:mt-3 text-[clamp(16px,2.2vw,26px)] tracking-[0.22em] text-paper/85"
                style={{ animationDelay: "300ms" }}
              >
                The city is your canvas.
              </p>

              <p
                className="anim-rise mt-4 [@media(max-height:800px)]:mt-2.5 max-w-[540px] text-[13px] leading-relaxed text-ash"
                style={{ animationDelay: "380ms" }}
              >
                Vance is paying you to write your name across{" "}
                <span className="font-semibold" style={{ color: "#ff5470" }}>
                  Carmine Kings
                </span>{" "}
                turf. Find a wall, press{" "}
                <kbd className="mono rounded border border-acid/40 bg-acid/10 px-1.5 py-0.5 text-[11px] text-acid">
                  E
                </kbd>{" "}
                and the{" "}
                <span className="font-semibold text-paper">Unlayer React Image Editor</span> opens
                as your spray can. Whatever you make goes up on that exact wall — and every King on
                the block comes looking for you.
              </p>

              <div
                className="anim-rise mt-6 [@media(max-height:800px)]:mt-4 flex flex-col gap-2.5"
                style={{ animationDelay: "400ms" }}
              >
                <TagField />
                <SavedCity />
              </div>

              <div className="anim-rise mt-5 [@media(max-height:800px)]:mt-3.5 flex flex-wrap gap-2.5" style={{ animationDelay: "420ms" }}>
                {MODES.map((m) => {
                  const on = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        sfx.hover();
                        setMode(m.id);
                      }}
                      onMouseEnter={() => sfx.hover()}
                      className="corner-cut w-[250px] max-w-full border px-4 py-2.5 text-left transition-colors"
                      style={{
                        borderColor: on ? "rgba(200,255,50,0.75)" : "rgba(246,241,232,0.16)",
                        background: on ? "rgba(200,255,50,0.09)" : "transparent",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-[7px] w-[7px] rounded-full transition-colors"
                          style={{
                            background: on ? "var(--acid)" : "rgba(246,241,232,0.22)",
                            boxShadow: on ? "0 0 9px var(--acid)" : "none",
                          }}
                        />
                        <span
                          className="display text-[13px] tracking-[0.14em]"
                          style={{ color: on ? "var(--acid)" : "rgba(246,241,232,0.62)" }}
                        >
                          {m.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-tight text-ash/75">{m.note}</p>
                    </button>
                  );
                })}
              </div>

              <div
                className="anim-rise mt-5 [@media(max-height:800px)]:mt-3.5 flex flex-wrap items-center gap-4"
                style={{ animationDelay: "460ms" }}
              >
                <button
                  onClick={start}
                  onMouseEnter={() => sfx.hover()}
                  className="corner-cut group relative overflow-hidden border border-acid/70 bg-acid px-9 py-4 transition-transform hover:scale-[1.02] active:scale-[0.99]"
                >
                  <span className="display relative z-10 text-[20px] tracking-[0.14em] text-ink">
                    ENTER CITY
                  </span>
                  <span className="absolute inset-0 -translate-x-full bg-white/40 transition-transform duration-500 group-hover:translate-x-full" />
                </button>

                <button
                  onClick={() => {
                    sfx.hover();
                    showHowTo();
                  }}
                  onMouseEnter={() => sfx.hover()}
                  className="corner-cut border border-paper/25 px-7 py-4 text-paper/80 transition-colors hover:border-paper/60 hover:text-paper"
                >
                  <span className="display text-[16px] tracking-[0.14em]">HOW TO PLAY</span>
                </button>

                <span className="mono text-[10px] text-ash/70">or press ENTER</span>
              </div>

              {needsDesktop && (
                <div
                  className="hud-panel corner-cut mt-5 max-w-[430px] px-4 py-3"
                  style={{ borderColor: "rgba(255,197,66,0.4)" }}
                >
                  <span className="stencil text-[10px] text-gold">KEYBOARD AND MOUSE</span>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ash">
                    You walk this block with <span className="text-paper">WASD</span> and look
                    with the mouse, so it wants a desktop. Everything still opens on a phone —
                    the briefing, the studio, the editor — you just won&apos;t be able to walk.
                  </p>
                </div>
              )}
            </div>

            <div className="hidden lg:block">
              <LoopShowcase tag={tag} />
            </div>
          </div>
        </div>

        <footer className="anim-rise flex flex-wrap items-center justify-between gap-3 text-[10px] text-ash/70">
          <span className="mono">
            WASD MOVE · SHIFT RUN · MOUSE LOOK · E PAINT · G BLACK BOOK · M MUTE
          </span>
          <span className="mono">
            GRAFFITI POWERED BY{" "}
            <span className="text-acid">@unlayer/react-image-editor</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
