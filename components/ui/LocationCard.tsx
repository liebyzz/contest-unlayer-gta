"use client";

import { useEffect, useRef, useState } from "react";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { GRAFFITI_SPOTS } from "@/lib/graffiti/spots";
import { GANG } from "@/lib/game/world";

const HOLD_MS = 3600;
const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
]);

/**
 * The arrival card: district, street, the job.
 *
 * Timed to land *after* the drone shot rather than during it, and it owns the
 * `arrived` flag — the corner HUD stays down until this has gone, so the two
 * never sit on top of each other.
 */
export function LocationCard() {
  const phase = useGraffiti((s) => s.phase);
  const finishArrival = useGraffiti((s) => s.finishArrival);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (phase !== "playing" || started.current) return;
    started.current = true;
    setMounted(true);
    setVisible(true);

    const hide = window.setTimeout(() => setVisible(false), HOLD_MS);
    let done = window.setTimeout(finish, HOLD_MS + 900);

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      finishArrival();
      setMounted(false);
    }

    // The moment the player takes control, this card is in the way of the
    // thing they are steering. Touch a movement key and it leaves at once,
    // taking the HUD's cue with it.
    const dismiss = () => {
      window.clearTimeout(hide);
      window.clearTimeout(done);
      setVisible(false);
      done = window.setTimeout(finish, 320);
      detach();
    };
    const onKey = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) dismiss();
    };
    function detach() {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", dismiss);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", dismiss);

    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(done);
      detach();
      // The phase can move out from under the card before it has finished its
      // exit — a wall opened, a beating taken. This effect only ever runs once,
      // so cancelling the timer without finishing would leave `arrived` false
      // and the entire corner HUD down for the rest of the session.
      finish();
    };
  }, [phase, finishArrival]);

  if (!mounted) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-20 left-8 z-30 transition-all duration-[900ms] md:bottom-24 md:left-14"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="h-[2px] w-12" style={{ background: GANG.colour }} />
        <span className="stencil text-[11px] magenta-glow" style={{ color: GANG.accent }}>
          ARC DISTRICT · {GANG.name} TURF
        </span>
      </div>
      <h2
        className="display mt-2 text-[clamp(40px,7vw,86px)] leading-[0.85] text-paper"
        style={{ transform: "skewX(-5deg)", textShadow: "0 10px 44px rgba(0,0,0,0.85)" }}
      >
        Marlow Street
      </h2>
      <p className="mono mt-2 text-[11px] text-ash">
        21:14 · AFTER THE RAIN · {GRAFFITI_SPOTS.length} WALLS WAITING
      </p>
    </div>
  );
}
