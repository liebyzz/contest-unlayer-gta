"use client";

import { useEffect, useState } from "react";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { requestPhoto } from "@/lib/game/photo";
import { sfx } from "@/lib/game/audio";

/**
 * The framed rectangle, as a fraction of the canvas.
 *
 * This is the one number the viewfinder and the capture have to agree on. The
 * frame used to be decoration over a grab of the whole canvas, so a shot
 * carefully composed inside the corner marks came back with a band of extra
 * street on every side — the player was framing one picture and saving
 * another. The corner marks below are positioned from these same values.
 */
const FRAME = { x: 0.08, y: 0.13, w: 0.84, h: 0.74 };
const PCT = (n: number) => `${(n * 100).toFixed(2)}%`;

/**
 * The viewfinder.
 *
 * Deliberately thin: bars, a frame, a readout. You keep full control of the
 * character and the camera while it is up, because half the shots worth taking
 * need you to walk somewhere first.
 */
export function PhotoMode() {
  const on = useGraffiti((s) => s.photoMode);
  const setPhotoMode = useGraffiti((s) => s.setPhotoMode);
  const addPhoto = useGraffiti((s) => s.addPhoto);
  const count = useGraffiti((s) => s.photos.length);
  const latest = useGraffiti((s) => s.photos[0]);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!on) return;

    const shoot = () => {
      // the shutter fires now; the frame arrives on the next draw
      setFlash(true);
      sfx.click();
      window.setTimeout(() => setFlash(false), 90);
      requestPhoto(
        (url) => {
          if (url) addPhoto(url);
        },
        { crop: FRAME, width: 1280, quality: 0.9 },
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        shoot();
      } else if (e.code === "KeyC" || e.code === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        sfx.back();
        setPhotoMode(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (e.button === 0) shoot();
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onClick);
    };
  }, [on, addPhoto, setPhotoMode]);

  if (!on) return null;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-[46] bg-white transition-opacity duration-150"
        style={{ opacity: flash ? 0.85 : 0 }}
      />

      <div className="pointer-events-none absolute inset-0 z-[45]">
        {/* bars */}
        <div className="absolute inset-x-0 top-0 h-[9vh] bg-ink/90" />
        <div className="absolute inset-x-0 bottom-0 h-[9vh] bg-ink/90" />

        {/* frame — the exact rectangle that gets saved */}
        <div
          className="absolute"
          style={{
            left: PCT(FRAME.x),
            right: PCT(1 - FRAME.x - FRAME.w),
            top: PCT(FRAME.y),
            bottom: PCT(1 - FRAME.y - FRAME.h),
          }}
        >
          {(
            [
              ["left-0 top-0", "border-l-2 border-t-2"],
              ["right-0 top-0", "border-r-2 border-t-2"],
              ["left-0 bottom-0", "border-l-2 border-b-2"],
              ["right-0 bottom-0", "border-r-2 border-b-2"],
            ] as const
          ).map(([pos, border]) => (
            <span
              key={pos}
              className={`absolute ${pos} ${border} h-8 w-8 border-paper/70`}
            />
          ))}
          <span className="absolute left-1/2 top-1/2 h-4 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-paper/40" />
          <span className="absolute left-1/2 top-1/2 h-[1px] w-4 -translate-x-1/2 -translate-y-1/2 bg-paper/40" />
        </div>

        {/* readout */}
        <div className="absolute left-[8%] top-[9vh] mt-3 flex items-center gap-3">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#ff2f86]" />
          <span className="mono text-[10px] text-paper/80">REC · 21:14</span>
        </div>
        <div className="absolute right-[8%] top-[9vh] mt-3">
          <span className="mono text-[10px] text-paper/80">
            {count} SHOT{count === 1 ? "" : "S"}
          </span>
        </div>

        {/* The last frame, stuck to the corner like a print coming out of the
            phone. Without it there is no evidence the shutter did anything
            beyond a number going up. */}
        {latest && (
          <div
            key={count}
            className="anim-pop absolute bottom-[9vh] right-[8%] mb-3 w-[124px] border border-paper/25 bg-ink/80 p-1 shadow-2xl"
          >
            {/* Its own proportions, not a fixed box — the print is meant to be
                the frame that was saved, and cropping it again here would be
                telling the same lie the viewfinder used to tell. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={latest} alt="" className="block h-auto w-full" />
            <span className="mono mt-1 block text-center text-[8px] text-ash/70">LAST SHOT</span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-[9vh] mb-3 text-center">
          <span className="mono text-[10px] text-ash">
            SPACE OR CLICK TO SHOOT · WASD TO MOVE · C TO PUT THE PHONE AWAY
          </span>
          <p className="mono mt-1 text-[9px] text-acid/80">
            YOUR SHOTS SHOW UP IN THE GRAFFITI STUDIO
          </p>
        </div>
      </div>
    </>
  );
}
