"use client";

import { useEffect, useRef } from "react";
import { BUILDINGS, ALLEY, VACANT_LOT } from "@/lib/game/city";
import { playerState } from "@/lib/game/playerState";
import { GRAFFITI_SPOTS } from "@/lib/graffiti/spots";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";

const SIZE = 160;
const SCALE = 2.15; // pixels per metre

const ROADS: [number, number, number, number][] = [
  [-46, 44, -8, 8],
  [13.4, 27, -28, 36],
  [ALLEY.x0, ALLEY.x1, ALLEY.z0, ALLEY.z1],
];

/** North-up radar centred on the player, with edge chevrons for spots you
 *  haven't hit yet — the only wayfinding the game needs. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const painted = useGraffiti((s) => s.painted);
  const paintedRef = useRef(painted);
  paintedRef.current = painted;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const c = SIZE / 2;
    const radius = c - 4;

    const draw = () => {
      const px = playerState.x;
      const pz = playerState.z;
      const toX = (x: number) => c + (x - px) * SCALE;
      const toY = (z: number) => c + (z - pz) * SCALE;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = "#0a0713";
      ctx.fillRect(0, 0, SIZE, SIZE);

      // roads
      ctx.fillStyle = "#1d1826";
      for (const [x0, x1, z0, z1] of ROADS) {
        ctx.fillRect(toX(x0), toY(z0), (x1 - x0) * SCALE, (z1 - z0) * SCALE);
      }
      ctx.fillStyle = "#241d1a";
      ctx.fillRect(
        toX(VACANT_LOT.x0),
        toY(VACANT_LOT.z0),
        (VACANT_LOT.x1 - VACANT_LOT.x0) * SCALE,
        (VACANT_LOT.z1 - VACANT_LOT.z0) * SCALE,
      );

      // buildings
      ctx.fillStyle = "#2c2438";
      ctx.strokeStyle = "rgba(246,241,232,0.07)";
      ctx.lineWidth = 1;
      for (const b of BUILDINGS) {
        const x = toX(b.x0);
        const y = toY(b.z0);
        const w = (b.x1 - b.x0) * SCALE;
        const h = (b.z1 - b.z0) * SCALE;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }

      // spots
      const pulse = 0.55 + Math.sin(performance.now() / 340) * 0.45;
      for (const s of GRAFFITI_SPOTS) {
        const done = Boolean(paintedRef.current[s.id]);
        const x = toX(s.position[0]);
        const y = toY(s.position[2]);
        const inside = Math.hypot(x - c, y - c) < radius - 6;

        if (inside) {
          if (!done) {
            ctx.fillStyle = `rgba(200,255,50,${0.16 + pulse * 0.2})`;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = done ? "#ffc542" : "#c8ff32";
          ctx.beginPath();
          ctx.arc(x, y, done ? 2.6 : 3.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (!done) {
          // chevron on the rim pointing the way
          const a = Math.atan2(y - c, x - c);
          const rx = c + Math.cos(a) * (radius - 7);
          const ry = c + Math.sin(a) * (radius - 7);
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(a);
          ctx.fillStyle = `rgba(200,255,50,${0.35 + pulse * 0.45})`;
          ctx.beginPath();
          ctx.moveTo(4, 0);
          ctx.lineTo(-3.5, 3.4);
          ctx.lineTo(-3.5, -3.4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // player
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(playerState.yaw + Math.PI);
      ctx.fillStyle = "#f6f1e8";
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(4.6, 5);
      ctx.lineTo(0, 2.6);
      ctx.lineTo(-4.6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // scan sweep for a bit of life
      const t = performance.now() / 2600;
      const sweep = ctx.createConicGradient?.(t * Math.PI * 2, c, c);
      if (sweep) {
        sweep.addColorStop(0, "rgba(200,255,50,0.10)");
        sweep.addColorStop(0.12, "rgba(200,255,50,0)");
        sweep.addColorStop(1, "rgba(200,255,50,0)");
        ctx.fillStyle = sweep;
        ctx.fillRect(0, 0, SIZE, SIZE);
      }

      ctx.restore();

      // rim
      ctx.strokeStyle = "rgba(246,241,232,0.22)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <canvas ref={ref} style={{ width: SIZE, height: SIZE }} />
      <span className="mono absolute left-1/2 top-[2px] -translate-x-1/2 text-[9px] text-paper/60">
        N
      </span>
    </div>
  );
}
