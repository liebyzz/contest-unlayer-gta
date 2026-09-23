"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { SPOT_BY_ID } from "@/lib/graffiti/spots";
import { surfaceImage } from "@/lib/graffiti/surfaces";
import { sfx } from "@/lib/game/audio";
import { player } from "@/lib/game/world";

/** How long after a round lands the prompt stays out of the way. */
const UNDER_FIRE = 3.5;

const SURFACE_LABEL: Record<string, string> = {
  wall: "WALL",
  shutter: "SHUTTER",
  billboard: "BILLBOARD",
  fence: "HOARDING",
  vehicle: "VEHICLE",
};

/** The prompt that appears when a paintable surface is in reach. */
export function InteractionPrompt() {
  const nearId = useGraffiti((s) => s.nearSpotId);
  const phase = useGraffiti((s) => s.phase);
  const painted = useGraffiti((s) => (nearId ? s.painted[nearId] : undefined));
  const openStudio = useGraffiti((s) => s.openStudio);

  const spot = nearId ? SPOT_BY_ID.get(nearId) : undefined;
  const thumb = useMemo(() => (spot ? surfaceImage(spot) : null), [spot]);

  const card = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLDivElement>(null);

  /**
   * A 440-pixel card parked across the bottom of the screen is exactly what you
   * do not want while somebody is shooting at you — it sits over the street you
   * are trying to back out of. Under fire it collapses to a chip that still
   * says the wall is there, and comes back a few seconds after the last round.
   *
   * Driven from a frame loop because `sinceHit` lives outside React.
   */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const hot = player.sinceHit < UNDER_FIRE && !player.dead;
      if (card.current) {
        card.current.style.opacity = hot ? "0" : "1";
        card.current.style.transform = hot ? "translateY(14px) scale(0.97)" : "none";
        card.current.style.pointerEvents = hot ? "none" : "auto";
      }
      if (mini.current) {
        mini.current.style.opacity = hot ? "1" : "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!spot || phase !== "playing") return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
      <div
        ref={mini}
        className="hud-panel corner-cut absolute bottom-0 flex items-center gap-2.5 px-3 py-2 opacity-0 transition-opacity duration-200"
      >
        <kbd className="mono border border-acid/60 bg-acid/15 px-1.5 py-[2px] text-[10px] text-acid">
          E
        </kbd>
        <span className="stencil text-[9px] text-ash">{spot.name.toUpperCase()}</span>
      </div>

      <div
        ref={card}
        className="hud-panel corner-cut anim-pop pointer-events-auto relative w-full max-w-[440px] overflow-hidden transition-all duration-300"
      >
        {/* colour rail */}
        <span
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{
            background: painted ? "var(--gold)" : "var(--acid)",
            boxShadow: `0 0 18px ${painted ? "rgba(255,197,66,0.8)" : "rgba(200,255,50,0.8)"}`,
          }}
        />

        <div className="flex items-stretch gap-4 p-4 pl-5">
          <div className="relative h-[74px] w-[104px] shrink-0 overflow-hidden border border-white/12">
            {thumb && (
              // a canvas data URL — there is nothing for next/image to optimise
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={painted?.graffitiTexture ?? thumb}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
            <span className="mono absolute bottom-0 left-0 bg-ink/85 px-1 py-[1px] text-[8px] text-ash">
              {SURFACE_LABEL[spot.surfaceType]}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px]">🎨</span>
              <span
                className="stencil text-[10px]"
                style={{ color: painted ? "var(--gold)" : "var(--acid)" }}
              >
                {painted ? "YOUR PIECE" : "GRAFFITI SPOT"}
              </span>
              <span className="mono ml-auto text-[9px] text-ash">+{spot.rep} REP</span>
            </div>

            <h3 className="display mt-1 text-[19px] leading-none tracking-wide text-paper">
              {spot.name}
            </h3>
            <p className="mono mt-[3px] text-[9px] text-ash/80">{spot.district}</p>
            <p className="mt-2 truncate text-[11px] italic text-ash/70">{spot.hint}</p>
          </div>
        </div>

        <button
          onClick={() => {
            sfx.click();
            openStudio(spot.id);
          }}
          className="group flex w-full items-center justify-center gap-3 border-t border-white/10 bg-white/[0.03] py-3 transition-colors hover:bg-acid/15"
        >
          <kbd className="mono anim-pulse border border-acid/60 bg-acid/15 px-2 py-1 text-[12px] font-bold text-acid">
            E
          </kbd>
          <span className="display text-[15px] tracking-[0.16em] text-paper">
            {painted ? "REPAINT THIS SURFACE" : "OPEN GRAFFITI STUDIO"}
          </span>
        </button>
      </div>
    </div>
  );
}
