"use client";

import { useEffect, useRef } from "react";

/**
 * The menu's living backdrop: a parallax skyline at dusk with lit windows,
 * drifting haze and a slow searchlight. Canvas rather than WebGL so the first
 * screen is on-screen instantly, before the city has loaded a single texture.
 */
type Layer = {
  depth: number;
  colour: string;
  blocks: { x: number; w: number; h: number; lights: [number, number][] }[];
  offset: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLayer(depth: number, colour: string, seed: number, span: number): Layer {
  const r = mulberry32(seed);
  const blocks: Layer["blocks"] = [];
  let x = -200;
  while (x < span + 200) {
    const w = 60 + r() * 150;
    const h = (110 + r() * 300) * (1.25 - depth * 0.45);
    const lights: [number, number][] = [];
    const cols = Math.max(2, Math.floor(w / 26));
    const rows = Math.max(2, Math.floor(h / 34));
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (r() < 0.3) lights.push([cx / cols, cy / rows]);
      }
    }
    blocks.push({ x, w, h, lights });
    x += w + 6 + r() * 26;
  }
  return { depth, colour, blocks, offset: 0 };
}

export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let layers: Layer[] = [];
    let dust: { x: number; y: number; v: number; s: number; a: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layers = [
        buildLayer(0, "#241a3a", 11, w * 1.6),
        buildLayer(1, "#1a1230", 23, w * 1.6),
        buildLayer(2, "#100b22", 37, w * 1.6),
      ];
      const r = mulberry32(99);
      dust = Array.from({ length: 90 }, () => ({
        x: r() * w,
        y: r() * h,
        v: 4 + r() * 22,
        s: 0.6 + r() * 1.8,
        a: 0.06 + r() * 0.22,
      }));
    };

    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#0a0718");
      sky.addColorStop(0.42, "#2c1740");
      sky.addColorStop(0.72, "#7a2f5e");
      sky.addColorStop(0.88, "#e2653a");
      sky.addColorStop(1, "#ffa049");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // sun sitting on the horizon
      const sunY = h * 0.9;
      const sunX = w * 0.24;
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.55);
      glow.addColorStop(0, "rgba(255,200,120,0.55)");
      glow.addColorStop(0.4, "rgba(255,120,60,0.18)");
      glow.addColorStop(1, "rgba(255,80,40,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // slow searchlight
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(w * 0.82, h * 1.02);
      ctx.rotate(Math.sin(t * 0.13) * 0.55 - 0.5);
      const beam = ctx.createLinearGradient(0, 0, 0, -h * 1.3);
      beam.addColorStop(0, "rgba(180,220,255,0.16)");
      beam.addColorStop(1, "rgba(180,220,255,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.lineTo(240, -h * 1.3);
      ctx.lineTo(-240, -h * 1.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Skyline, back to front. Each layer stands a little lower than the one
      // behind it, and the nearest runs past the bottom edge — the whole city
      // used to sit on a line 2% above the bottom, which left a strip of raw
      // orange sky showing underneath it with dust drifting over the top.
      const bases = [h * 0.99, h * 1.01, h * 1.04];
      layers.forEach((layer, li) => {
        const base = bases[li] ?? h * 1.02;
        layer.offset -= dt * (3 + li * 5);
        const span = w * 1.6;
        if (layer.offset < -span) layer.offset += span;
        ctx.save();
        ctx.translate(layer.offset, 0);
        ctx.fillStyle = layer.colour;
        for (let pass = 0; pass < 2; pass++) {
          ctx.save();
          ctx.translate(pass * span, 0);
          for (const b of layer.blocks) {
            const y = base - b.h;
            ctx.fillRect(b.x, y, b.w, b.h);
            // lit windows
            for (const [fx, fy] of b.lights) {
              const flicker = Math.sin(t * 1.4 + b.x * 0.07 + fy * 12) > -0.86 ? 1 : 0.25;
              ctx.fillStyle = `rgba(255, ${170 + li * 20}, ${90 + li * 40}, ${(0.5 - li * 0.11) * flicker})`;
              ctx.fillRect(b.x + fx * b.w + 4, y + fy * b.h + 5, 5, 8);
            }
            ctx.fillStyle = layer.colour;
          }
          ctx.restore();
        }
        ctx.restore();
      });

      // the street the city stands on, so the frame doesn't just stop
      const ground = ctx.createLinearGradient(0, h * 0.9, 0, h);
      ground.addColorStop(0, "rgba(8,5,15,0)");
      ground.addColorStop(0.5, "rgba(8,5,15,0.8)");
      ground.addColorStop(1, "rgba(5,3,10,1)");
      ctx.fillStyle = ground;
      ctx.fillRect(0, h * 0.9, w, h * 0.1);

      // haze over the rooftops
      const haze = ctx.createLinearGradient(0, h * 0.55, 0, h);
      haze.addColorStop(0, "rgba(120,60,110,0)");
      haze.addColorStop(1, "rgba(160,70,90,0.34)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);

      // dust in the air
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const d of dust) {
        d.x += d.v * dt * 0.6;
        d.y -= d.v * dt * 0.25;
        if (d.x > w + 10) d.x = -10;
        // recycle above the ground band, not below it
        if (d.y < -10) d.y = h * 0.88;
        ctx.fillStyle = `rgba(255,220,180,${d.a})`;
        ctx.fillRect(d.x, d.y, d.s, d.s);
      }
      ctx.restore();

      // vignette
      const vig = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.5, h * 0.95);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(5,3,10,0.82)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
