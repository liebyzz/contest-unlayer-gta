"use client";

import { useEffect } from "react";
import {
  selectLevel,
  selectPieceCount,
  selectRank,
  useGraffiti,
} from "@/lib/graffiti/graffitiStore";
import { GRAFFITI_SPOTS, TOTAL_REP } from "@/lib/graffiti/spots";
import { setMuted } from "@/lib/game/audio";
import { Minimap } from "./Minimap";

const KEYS: [string, string][] = [
  ["WASD", "MOVE"],
  ["SHIFT", "RUN"],
  ["MOUSE", "LOOK"],
  ["E", "PAINT"],
  ["LMB", "FIRE"],
  ["RMB", "AIM"],
  ["G", "BLACK BOOK"],
  ["C", "CAMERA"],
];

function RepBar({ value }: { value: number }) {
  const filled = Math.round((value / TOTAL_REP) * 12);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[3px]">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="h-[10px] w-[7px] transition-all duration-500"
            style={{
              background: i < filled ? "var(--acid)" : "rgba(246,241,232,0.13)",
              boxShadow: i < filled ? "0 0 8px rgba(200,255,50,0.6)" : "none",
              transitionDelay: `${i * 30}ms`,
            }}
          />
        ))}
      </div>
      <span className="mono text-[11px] text-acid">{value}</span>
    </div>
  );
}

export function GameHUD() {
  const rep = useGraffiti((s) => s.rep);
  const level = useGraffiti(selectLevel);
  const rank = useGraffiti(selectRank);
  const pieces = useGraffiti(selectPieceCount);
  const muted = useGraffiti((s) => s.muted);
  const toggleMute = useGraffiti((s) => s.toggleMute);
  const phase = useGraffiti((s) => s.phase);

  useEffect(() => {
    setMuted(muted);
  }, [muted]);

  const arrived = useGraffiti((s) => s.arrived);
  const photoMode = useGraffiti((s) => s.photoMode);
  const freePaint = useGraffiti((s) => s.freePaint);
  const keys = freePaint ? KEYS.filter(([k]) => k !== "LMB" && k !== "RMB") : KEYS;
  const dimmed = phase === "reveal" || phase === "tour";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-500"
      style={{
        // The reveal is a cinematic: a HUD ghosting through the letterbox put
        // the radar and the key list inside the shot of the piece.
        opacity: !arrived || photoMode || dimmed ? 0 : 1,
        // let the reveal's card get out of the way before coming back up
        transitionDelay: arrived && !dimmed ? "550ms" : "0ms",
        // ...but get out of the reveal's first frame
        transitionDuration: dimmed ? "160ms" : "500ms",
      }}
    >
      {/* ── reputation ─────────────────────────────────────────────── */}
      <div className="anim-rise absolute left-5 top-5 md:left-7 md:top-7">
        <button
          onClick={() => useGraffiti.getState().openGallery(false)}
          className="hud-panel corner-cut pointer-events-auto block px-4 py-3 text-left transition-colors hover:border-acid/40"
        >
          <div className="flex items-center gap-2">
            <span className="stencil text-[10px] text-ash">GRAFFITI REP</span>
            <span className="mono text-[10px] text-magenta">LVL {String(level).padStart(2, "0")}</span>
          </div>
          <div className="mt-2">
            <RepBar value={rep} />
          </div>
          <div className="mt-2 flex items-center gap-3 border-t border-white/10 pt-2">
            <span className="display text-[15px] leading-none tracking-wider text-paper">
              {rank}
            </span>
            <span className="mono text-[10px] text-ash">
              PIECES {pieces}/{GRAFFITI_SPOTS.length}
            </span>
          </div>
          <span className="mono mt-2 block text-[9px] text-ash/45">G · OPEN BLACK BOOK</span>
        </button>
      </div>

      {/* ── radar ──────────────────────────────────────────────────── */}
      <div className="anim-rise absolute right-5 top-5 flex flex-col items-end gap-2 md:right-7 md:top-7">
        <div className="hud-panel rounded-full p-1.5">
          <Minimap />
        </div>
        <button
          onClick={toggleMute}
          className="hud-panel pointer-events-auto corner-cut mono px-3 py-1.5 text-[10px] text-ash transition-colors hover:text-paper"
        >
          {muted ? "SOUND OFF" : "SOUND ON"} · M
        </button>
      </div>

      {/* ── controls ───────────────────────────────────────────────── */}
      <div className="anim-rise absolute bottom-5 right-5 md:bottom-7 md:right-7">
        <div className="hud-panel corner-cut flex flex-col gap-1.5 px-4 py-3">
          {keys.map(([key, action]) => (
            <div key={key} className="flex items-center gap-3">
              <kbd className="mono min-w-[46px] border border-white/15 bg-white/5 px-1.5 py-0.5 text-center text-[10px] text-paper/90">
                {key}
              </kbd>
              <span className="stencil text-[10px] text-ash">{action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── district stamp ─────────────────────────────────────────── */}
      <div className="anim-rise absolute bottom-5 left-5 md:bottom-7 md:left-7">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-acid" />
          <span className="stencil text-[10px] text-ash/80">
            NEON WALLS · ARC DISTRICT
          </span>
        </div>
        <p className="mono mt-1 text-[9px] text-ash/50">
          editor by @unlayer/react-image-editor
        </p>
      </div>
    </div>
  );
}
