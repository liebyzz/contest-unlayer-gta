"use client";

import { useEffect, useRef } from "react";
import { GANG, WANTED_TIERS, alertCountdown, player, respawn, world } from "@/lib/game/world";
import { playerState } from "@/lib/game/playerState";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";

const HEALTH_SEGMENTS = 10;
/** Damage arcs drawn at once — one per direction you are being shot from. */
const HIT_MARKS = 4;

/**
 * Health, wanted level, ammo and the crosshair.
 *
 * These change every frame, so the component renders once and then pokes the
 * DOM from a requestAnimationFrame loop — no React re-render is involved.
 */
export function CombatHUD() {
  const phase = useGraffiti((s) => s.phase);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const healthNum = useRef<HTMLSpanElement>(null);
  const ammoBox = useRef<HTMLDivElement>(null);
  const ammoNum = useRef<HTMLSpanElement>(null);
  const reserveNum = useRef<HTMLSpanElement>(null);
  const reloadBar = useRef<HTMLSpanElement>(null);
  const reloadCard = useRef<HTMLDivElement>(null);
  const reloadFill = useRef<HTMLSpanElement>(null);
  const stars = useRef<(HTMLSpanElement | null)[]>([]);
  const wantedBox = useRef<HTMLDivElement>(null);
  const tierLabel = useRef<HTMLSpanElement>(null);
  const gangBox = useRef<HTMLDivElement>(null);
  const gangFill = useRef<HTMLSpanElement>(null);
  const cross = useRef<HTMLDivElement>(null);
  const hurt = useRef<HTMLDivElement>(null);
  const marks = useRef<(HTMLSpanElement | null)[]>([]);
  const alertBox = useRef<HTMLDivElement>(null);
  const alertFill = useRef<HTMLSpanElement>(null);
  const alertSecs = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const pct = player.health / player.maxHealth;
      const lit = Math.ceil(pct * HEALTH_SEGMENTS);
      for (let i = 0; i < HEALTH_SEGMENTS; i++) {
        const el = bars.current[i];
        if (!el) continue;
        const on = i < lit;
        el.style.background = on
          ? pct > 0.55
            ? "var(--acid)"
            : pct > 0.25
              ? "var(--gold)"
              : "#ff3b3b"
          : "rgba(246,241,232,0.13)";
        el.style.boxShadow = on ? "0 0 8px currentColor" : "none";
        el.style.color = on ? (pct > 0.55 ? "#c8ff32" : pct > 0.25 ? "#ffc542" : "#ff3b3b") : "transparent";
      }
      if (healthNum.current) healthNum.current.textContent = String(Math.ceil(player.health));

      if (ammoBox.current) {
        ammoBox.current.style.borderColor = player.aiming
          ? "rgba(255,47,134,0.6)"
          : "rgba(246,241,232,0.1)";
      }
      if (ammoNum.current) ammoNum.current.textContent = String(player.ammo).padStart(2, "0");
      if (reserveNum.current) reserveNum.current.textContent = String(player.reserve);
      const reloading = player.reloading > 0;
      if (reloadBar.current) {
        const r = reloading ? 1 - player.reloading / 1.35 : 0;
        reloadBar.current.style.transform = `scaleX(${r})`;
        reloadBar.current.style.opacity = reloading ? "1" : "0";
      }
      if (reloadCard.current) {
        reloadCard.current.style.opacity = reloading ? "1" : "0";
        reloadCard.current.style.transform = `translate(-50%, ${reloading ? "0" : "8px"})`;
      }
      if (reloadFill.current) {
        reloadFill.current.style.transform = `scaleX(${reloading ? 1 - player.reloading / 1.35 : 0})`;
      }

      if (wantedBox.current) {
        // Out of the way until there is something to say. A ghosted "CLEAN"
        // panel parked over the street read as a rendering fault, not a HUD.
        wantedBox.current.style.opacity = player.wanted > 0 ? "1" : "0";
      }
      for (let i = 0; i < 5; i++) {
        const el = stars.current[i];
        if (!el) continue;
        const on = i < player.wanted;
        el.style.color = on ? "#ffc542" : "rgba(246,241,232,0.18)";
        el.style.textShadow = on ? "0 0 12px rgba(255,197,66,0.9)" : "none";
        el.style.animation = on && i === player.wanted - 1 ? "nw-pulse 0.8s ease-in-out infinite" : "none";
      }
      if (tierLabel.current) {
        const tier = WANTED_TIERS[player.wanted];
        tierLabel.current.textContent = tier.label;
        tierLabel.current.style.color = player.wanted >= 4 ? "#ff3b3b" : player.wanted > 0 ? "#ffc542" : "var(--ash)";
      }

      if (gangBox.current) {
        const heat = world.gangHeat;
        gangBox.current.style.opacity = heat > 0.02 ? "1" : "0";
        // with no stars up, the wanted panel is hidden: close the gap under the radar
        const lift = player.wanted > 0 ? 0 : -94;
        gangBox.current.style.transform = `translateY(${lift + (heat > 0.02 ? 0 : -6)}px)`;
      }
      if (gangFill.current) gangFill.current.style.transform = `scaleX(${world.gangHeat})`;

      if (cross.current) {
        // always up, but it only tightens into a precise sight while aiming
        cross.current.style.opacity = player.dead ? "0" : player.aiming ? "1" : "0.42";
        const hip = player.aiming ? 0 : 9;
        const spread =
          5 + hip + player.recoil * 14 + Math.min(7, playerState.speed * 1.6);
        cross.current.style.setProperty("--spread", `${spread}px`);
      }

      if (hurt.current) hurt.current.style.opacity = String(Math.min(0.62, player.hurt * 0.62));

      // The Kings' countdown, dead centre: what just happened and what to do
      // about it, while there is still time to do it.
      if (alertBox.current) {
        const { left, total } = alertCountdown();
        const show = left > 0.05 && !player.dead && !player.safe;
        alertBox.current.style.opacity = show ? "1" : "0";
        alertBox.current.style.transform = `translate(-50%, ${show ? "0" : "-10px"}) scale(${show ? 1 : 0.96})`;
        if (alertFill.current) alertFill.current.style.transform = `scaleX(${Math.min(1, left / total)})`;
        if (alertSecs.current) alertSecs.current.textContent = String(Math.ceil(left));
      }

      // Damage arcs. The bearing is world-space; what the player needs is where
      // it is relative to the way they are facing, so the camera yaw comes off
      // it and the wedge sits at that angle around the crosshair.
      for (let i = 0; i < HIT_MARKS; i++) {
        const el = marks.current[i];
        if (!el) continue;
        const h = player.hits[i];
        if (!h || player.dead) {
          el.style.opacity = "0";
          continue;
        }
        const rel = h.angle - playerState.camYaw;
        el.style.opacity = String(Math.min(1, h.life / 0.6) * 0.9);
        el.style.transform = `translate(-50%, -50%) rotate(${-rel}rad)`;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const arrived = useGraffiti((s) => s.arrived);
  // The reveal puts a big title card in the bottom-left corner, which is
  // exactly where condition and ammo live — so they step back for it, the same
  // way the rest of the HUD does.
  const photoMode = useGraffiti((s) => s.photoMode);
  // FREE PAINT has no pistol, no heat and nothing that can hurt you, so none
  // of this is anything but clutter over the walls
  const freePaint = useGraffiti((s) => s.freePaint);
  const visible =
    arrived && !photoMode && !freePaint && (phase === "playing" || phase === "wasted");

  return (
    <>
      {/* damage flash */}
      <div
        ref={hurt}
        className="pointer-events-none absolute inset-0 z-30 opacity-0 transition-opacity duration-150"
        style={{
          // held to the edges: at 35% the flash covered the thing you had just
          // been shot by, which is the one thing you need to see
          background:
            "radial-gradient(ellipse at center, transparent 52%, rgba(180,20,30,0.9) 100%)",
        }}
      />

      {/* Drops out the instant the reveal starts, and waits for its card to
          clear before coming back — otherwise the two crossfade through each
          other in the same corner. */}
      <div
        className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-500"
        style={{ opacity: visible ? 1 : 0, transitionDelay: visible ? "550ms" : "0ms" }}
      >
        {/* crosshair */}
        <div
          ref={cross}
          className="absolute left-1/2 top-1/2 opacity-0 transition-opacity duration-150"
          style={{ ["--spread" as string]: "8px" }}
        >
          <span className="absolute h-[2px] w-[9px] bg-paper" style={{ transform: "translate(calc(-100% - var(--spread)), -50%)" }} />
          <span className="absolute h-[2px] w-[9px] bg-paper" style={{ transform: "translate(var(--spread), -50%)" }} />
          <span className="absolute h-[9px] w-[2px] bg-paper" style={{ transform: "translate(-50%, calc(-100% - var(--spread)))" }} />
          <span className="absolute h-[9px] w-[2px] bg-paper" style={{ transform: "translate(-50%, var(--spread))" }} />
          <span className="absolute h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-magenta" />
        </div>

        {/* where the last few hits came from, as wedges around the crosshair */}
        <div className="absolute left-1/2 top-1/2">
          {Array.from({ length: HIT_MARKS }, (_, i) => (
            <span
              key={i}
              ref={(el) => {
                marks.current[i] = el;
              }}
              className="absolute left-0 top-0 opacity-0 transition-opacity duration-200"
              style={{ transform: "translate(-50%, -50%)" }}
            >
              <svg width="240" height="240" viewBox="0 0 240 240" style={{ display: "block" }}>
                {/* the wedge points up; the rotation above aims it */}
                <path
                  d="M120 120 L88 44 A82 82 0 0 1 152 44 Z"
                  fill={`url(#nw-hit-${i})`}
                  stroke="rgba(255,70,70,0.85)"
                  strokeWidth="1.5"
                />
                <defs>
                  <linearGradient id={`nw-hit-${i}`} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="rgba(255,50,50,0)" />
                    <stop offset="100%" stopColor="rgba(255,60,60,0.55)" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
          ))}
        </div>

        {/* the Kings saw that — run */}
        <div
          ref={alertBox}
          className="absolute left-1/2 top-[19%] w-[min(440px,86vw)] text-center opacity-0 transition-all duration-300"
          style={{ transform: "translate(-50%, -10px)" }}
        >
          <p
            className="display text-[clamp(28px,3.6vw,46px)] leading-none"
            style={{
              color: GANG.accent,
              transform: "skewX(-6deg)",
              textShadow: `0 0 28px ${GANG.colour}, 0 6px 24px rgba(0,0,0,0.9)`,
            }}
          >
            THE KINGS SAW THAT
          </p>
          <p className="stencil mt-2 text-[12px] text-paper" style={{ textShadow: "0 2px 12px #000" }}>
            RUN — BREAK LINE OF SIGHT · THEY SHOOT IN{" "}
            <span ref={alertSecs} className="text-gold">
              3
            </span>
          </p>
          <span className="mx-auto mt-2.5 block h-[4px] w-[70%] bg-black/50">
            <span
              ref={alertFill}
              className="block h-full w-full origin-center"
              style={{ background: GANG.colour, boxShadow: `0 0 12px ${GANG.colour}` }}
            />
          </span>
        </div>

        {/* auto-reload readout, right under the crosshair */}
        <div
          ref={reloadCard}
          className="hud-panel corner-cut absolute left-1/2 top-[calc(50%+46px)] w-[178px] -translate-x-1/2 px-3 py-2 opacity-0 transition-all duration-200"
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full bg-magenta"
              style={{ animation: "nw-pulse 0.6s ease-in-out infinite" }}
            />
            <span className="stencil text-[10px] text-magenta">RELOADING</span>
          </div>
          <span className="mt-1.5 block h-[3px] w-full bg-white/10">
            <span
              ref={reloadFill}
              className="block h-full w-full origin-left bg-magenta"
              style={{ transform: "scaleX(0)" }}
            />
          </span>
        </div>

        {/* health + ammo, bottom left above the district stamp */}
        <div className="absolute bottom-16 left-5 flex flex-col gap-2 md:bottom-20 md:left-7">
          <div className="hud-panel corner-cut px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="stencil text-[10px] text-ash">CONDITION</span>
              <span ref={healthNum} className="mono ml-auto text-[10px] text-paper">
                100
              </span>
            </div>
            <div className="mt-2 flex gap-[3px]">
              {Array.from({ length: HEALTH_SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    bars.current[i] = el;
                  }}
                  className="h-[10px] w-[9px]"
                />
              ))}
            </div>
          </div>

          <div
            ref={ammoBox}
            className="hud-panel corner-cut relative overflow-hidden px-4 py-2.5 transition-opacity"
          >
            <div className="flex items-baseline gap-2">
              <span className="stencil text-[10px] text-ash">PISTOL</span>
              <span className="display ml-auto text-[19px] leading-none text-paper">
                <span ref={ammoNum}>12</span>
                <span className="mono text-[10px] text-ash"> / </span>
                <span ref={reserveNum} className="mono text-[11px] text-ash">
                  48
                </span>
              </span>
            </div>
            <p className="mono mt-1 text-[9px] text-ash/60">LMB FIRE · RMB AIM · AUTO RELOAD</p>
            <span
              ref={reloadBar}
              className="absolute bottom-0 left-0 h-[2px] w-full origin-left bg-magenta opacity-0"
            />
          </div>
        </div>

        {/* wanted level, under the radar */}
        <div
          ref={wantedBox}
          className="hud-panel corner-cut absolute right-5 top-[232px] min-w-[136px] px-3 py-2 transition-opacity md:right-7 md:top-[244px]"
        >
          <span className="stencil text-[9px] text-ash">WANTED</span>
          <div className="mt-1 flex gap-[3px] text-[15px] leading-none">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                ref={(el) => {
                  stars.current[i] = el;
                }}
              >
                ★
              </span>
            ))}
          </div>
          <span ref={tierLabel} className="mono mt-1 block text-[8px] tracking-[0.12em]">
            CLEAN
          </span>
        </div>

        {/* how badly the Kings want a word */}
        <div
          ref={gangBox}
          className="hud-panel corner-cut absolute right-5 top-[326px] w-[136px] px-3 py-2 opacity-0 transition-all duration-300 md:right-7 md:top-[340px]"
          style={{ borderColor: "rgba(224,30,55,0.45)" }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: GANG.colour, boxShadow: `0 0 10px ${GANG.colour}` }}
            />
            <span className="stencil text-[9px]" style={{ color: GANG.accent }}>
              {GANG.short} HEAT
            </span>
          </div>
          <span className="mt-1.5 block h-[3px] w-full bg-white/10">
            <span
              ref={gangFill}
              className="block h-full w-full origin-left"
              style={{ background: GANG.colour, transform: "scaleX(0)" }}
            />
          </span>
          <span className="mono mt-1.5 block text-[8px] tracking-[0.1em] text-ash/80">
            BREAK LINE OF SIGHT
          </span>
        </div>
      </div>
    </>
  );
}

/** The knockout card. */
export function WastedOverlay() {
  const phase = useGraffiti((s) => s.phase);
  const active = phase === "wasted";

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => respawn(), 4200);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[55] flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, rgba(60,0,10,0.5) 0%, rgba(4,2,6,0.94) 75%)",
          backdropFilter: "grayscale(1) blur(2px)",
        }}
      />
      <div className="anim-pop relative text-center">
        <h2
          className="display text-[clamp(56px,13vw,170px)] leading-[0.8] text-[#c8203a]"
          style={{
            transform: "skewX(-6deg)",
            textShadow: "0 0 60px rgba(200,32,58,0.55), 0 10px 40px rgba(0,0,0,0.9)",
          }}
        >
          WASTED
        </h2>
        <p className="mono mt-4 text-[11px] tracking-[0.3em] text-ash">
          THE STREET TAKES ITS CUT · RESPAWNING
        </p>
        <p className="mt-2 text-[12px] text-ash/70">Your pieces stay up. They always do.</p>
      </div>
    </div>
  );
}
