"use client";

import { useGraffiti } from "@/lib/graffiti/graffitiStore";

const TONE: Record<string, { rail: string; text: string }> = {
  acid: { rail: "var(--acid)", text: "var(--acid)" },
  magenta: { rail: "var(--magenta)", text: "var(--magenta)" },
  gold: { rail: "var(--gold)", text: "var(--gold)" },
};

export function Notifications() {
  const toasts = useGraffiti((s) => s.toasts);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 z-40 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const tone = TONE[t.tone] ?? TONE.acid;
        return (
          <div
            key={t.id}
            className="hud-panel corner-cut anim-pop relative w-full max-w-[380px] overflow-hidden pl-5 pr-4 py-3"
          >
            <span
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ background: tone.rail, boxShadow: `0 0 16px ${tone.rail}` }}
            />
            <div className="flex items-center gap-2">
              <span className="text-[13px]">🎨</span>
              <span className="display text-[16px] tracking-[0.12em]" style={{ color: tone.text }}>
                {t.title}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ash">{t.body}</p>
            {/* life bar */}
            <span
              className="absolute bottom-0 left-0 h-[2px] w-full origin-left"
              style={{
                background: tone.rail,
                opacity: 0.5,
                animation: "nw-toast 5.2s linear forwards",
              }}
            />
          </div>
        );
      })}
      <style>{`@keyframes nw-toast { from { transform: scaleX(1) } to { transform: scaleX(0) } }`}</style>
    </div>
  );
}
