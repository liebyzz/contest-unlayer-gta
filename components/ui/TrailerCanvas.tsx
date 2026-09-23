"use client";

import { useEffect, useRef } from "react";

/**
 * The opening cinematic's backdrop.
 *
 * Every shot is painted on a 2D canvas — rain, neon, wet tarmac, silhouettes —
 * and the call shots lay a graded photographic plate underneath when one is
 * available.
 */
export type ShotKind = "call" | "wall" | "covered" | "studio";

/**
 * Photographic plates for the briefing.
 *
 * Kept in `public/imgs/` and referenced by name. Anything missing simply
 * falls back to the procedurally drawn caller, so the trailer never breaks on
 * a file that isn't there.
 */
export const PLATES = {
  doorway: "/imgs/boss-doorway.png",
  spotlight: "/imgs/boss-spotlight.png",
  alley: "/imgs/boss-alley.png",
} as const;

export type PlateName = keyof typeof PLATES;

const plateCache = new Map<string, HTMLImageElement | null>();

function plate(name: PlateName): HTMLImageElement | null {
  const src = PLATES[name];
  if (plateCache.has(src)) return plateCache.get(src) ?? null;
  plateCache.set(src, null);
  const img = new Image();
  img.onload = () => plateCache.set(src, img);
  img.onerror = () => plateCache.set(src, null);
  img.src = src;
  return null;
}

/** Preload the plates so the first cut doesn't land on an empty frame. */
export function preloadPlates() {
  (Object.keys(PLATES) as PlateName[]).forEach(plate);
}

/**
 * Cover-fit a photograph and grade it into the game's palette — sunk into
 * purple, then hit with magenta from one side and cyan from the other, so a
 * plate cuts against the procedural shots instead of looking pasted on.
 */
function drawPlate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  p: number,
) {
  const scale = Math.max(w / img.width, h / img.height) * (1.06 + p * 0.06);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 - h * 0.02, dw, dh);

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(58,26,72,0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const left = ctx.createLinearGradient(0, 0, w * 0.55, 0);
  left.addColorStop(0, "rgba(255,40,120,0.34)");
  left.addColorStop(1, "rgba(255,40,120,0)");
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, w, h);

  const right = ctx.createLinearGradient(w, 0, w * 0.45, 0);
  right.addColorStop(0, "rgba(60,150,255,0.26)");
  right.addColorStop(1, "rgba(60,150,255,0)");
  ctx.fillStyle = right;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

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

interface Drop {
  x: number;
  y: number;
  len: number;
  v: number;
  a: number;
}

/* ── shared pieces ───────────────────────────────────────────────────────── */
function rain(ctx: CanvasRenderingContext2D, drops: Drop[], w: number, h: number, dt: number, tilt: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(200,220,255,0.5)";
  ctx.lineWidth = 1.1;
  for (const d of drops) {
    d.y += d.v * dt;
    d.x += d.v * dt * tilt;
    if (d.y > h) {
      d.y = -20;
      d.x = Math.random() * w;
    }
    ctx.globalAlpha = d.a;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - d.len * tilt, d.y - d.len);
    ctx.stroke();
  }
  ctx.restore();
}

function haze(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, r: number, colour: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function neonText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  flicker = 1,
) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size}px Anton, Impact, "Arial Black", sans-serif`;
  ctx.globalAlpha = flicker;
  ctx.shadowColor = colour;
  ctx.shadowBlur = size * 0.9;
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.shadowBlur = size * 0.25;
  ctx.fillStyle = "#fff4f8";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Vance, on the phone.
 *
 * A graphic portrait rather than an attempt at realism: flat shapes, a very
 * limited palette, and the whole read carried by a hot magenta rim down one
 * side against a cold fill on the other. That's the look of a club-lit night
 * scene, and it's a lighting idea rather than anybody else's artwork.
 */
function caller(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Framed so head, chains and shoulders all sit between the letterbox bars
  // and above the dialogue — anchoring at the very bottom put everything below
  // the neck off-screen.
  const s = Math.min(w / 1300, h / 760);
  const breathe = Math.sin(t * 1.1) * 4;
  const talk = 0.5 + Math.sin(t * 7.3) * 0.5; // jaw movement while he speaks

  ctx.save();
  ctx.translate(w * 0.36, h * 0.72 + breathe);
  ctx.scale(s, s);

  const SKIN = "#6b4433";
  const SKIN_LIT = "#8a5a44";
  const JACKET = "#241a24";
  const JACKET_LIT = "#3a2836";

  // silhouette paths, kept as functions so the rim light can stroke the exact
  // same edge the fill used
  const shoulderPath = () => {
    ctx.beginPath();
    ctx.moveTo(-420, 340);
    ctx.quadraticCurveTo(-380, 60, -190, -10);
    ctx.quadraticCurveTo(-90, -58, 0, -58);
    ctx.quadraticCurveTo(90, -58, 190, -10);
    ctx.quadraticCurveTo(380, 60, 420, 340);
    ctx.closePath();
  };
  const headPath = () => {
    ctx.beginPath();
    ctx.ellipse(0, -252, 116, 138, 0, 0, Math.PI * 2);
  };

  /* shoulders and chest ---------------------------------------------------- */
  ctx.fillStyle = JACKET;
  shoulderPath();
  ctx.fill();

  // lit side of the jacket
  ctx.save();
  shoulderPath();
  ctx.clip();
  ctx.fillStyle = JACKET_LIT;
  ctx.beginPath();
  ctx.moveTo(120, -80);
  ctx.lineTo(460, -80);
  ctx.lineTo(460, 360);
  ctx.lineTo(210, 360);
  ctx.closePath();
  ctx.fill();

  // open shirt beneath
  ctx.fillStyle = "#12101a";
  ctx.beginPath();
  ctx.moveTo(0, -50);
  ctx.lineTo(105, 100);
  ctx.lineTo(0, 340);
  ctx.lineTo(-105, 100);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  /* gold chains ------------------------------------------------------------ */
  for (const [rad, yOff] of [
    [96, 74],
    [132, 116],
  ]) {
    ctx.strokeStyle = "#d9a441";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, yOff - 40, rad, 0.32, Math.PI - 0.32);
    ctx.stroke();
    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, yOff - 42, rad, 0.5, Math.PI - 0.9);
    ctx.stroke();
  }

  /* neck ------------------------------------------------------------------- */
  ctx.fillStyle = "#4e3126";
  ctx.beginPath();
  ctx.moveTo(-62, -40);
  ctx.lineTo(62, -40);
  ctx.lineTo(56, -150);
  ctx.lineTo(-56, -150);
  ctx.closePath();
  ctx.fill();

  /* head ------------------------------------------------------------------- */
  ctx.fillStyle = SKIN;
  headPath();
  ctx.fill();

  // lit right side
  ctx.save();
  headPath();
  ctx.clip();
  ctx.fillStyle = SKIN_LIT;
  ctx.fillRect(28, -400, 200, 320);
  ctx.restore();

  // ear
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.ellipse(-112, -246, 20, 32, 0, 0, Math.PI * 2);
  ctx.fill();

  // short hair / hairline
  ctx.fillStyle = "#191319";
  ctx.beginPath();
  ctx.ellipse(0, -330, 118, 78, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-118, -336, 236, 26);

  // beard, jaw down
  ctx.fillStyle = "#1d161c";
  ctx.beginPath();
  ctx.moveTo(-104, -262);
  ctx.quadraticCurveTo(-96, -132 + talk * 6, 0, -118 + talk * 8);
  ctx.quadraticCurveTo(96, -132 + talk * 6, 104, -262);
  ctx.quadraticCurveTo(60, -206, 0, -210);
  ctx.quadraticCurveTo(-60, -206, -104, -262);
  ctx.closePath();
  ctx.fill();

  // mouth, mostly hidden in the beard
  ctx.fillStyle = "#0b0810";
  ctx.beginPath();
  ctx.ellipse(0, -186, 19, 3 + talk * 5, 0, 0, Math.PI * 2);
  ctx.fill();

  /* sunglasses ------------------------------------------------------------- */
  ctx.fillStyle = "#0a0810";
  const lens = (cx: number) => {
    ctx.beginPath();
    ctx.roundRect(cx - 46, -300, 92, 54, 12);
    ctx.fill();
  };
  lens(-50);
  lens(50);
  ctx.fillRect(-8, -286, 16, 10);
  ctx.fillRect(-118, -292, 24, 9);
  ctx.fillRect(94, -292, 24, 9);

  // specular streak across the lenses
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#ff87b6";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-84, -258);
  ctx.lineTo(-26, -292);
  ctx.moveTo(16, -258);
  ctx.lineTo(74, -292);
  ctx.stroke();
  ctx.restore();

  /* the arm, and the phone held to his ear --------------------------------- */
  // forearm coming up out of the shoulder, so the hand isn't floating
  ctx.fillStyle = JACKET_LIT;
  ctx.save();
  ctx.translate(-196, 30);
  ctx.rotate(0.34);
  ctx.beginPath();
  ctx.roundRect(-52, -180, 104, 300, 46);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(-158, -212);
  ctx.rotate(-0.14);
  // hand
  ctx.fillStyle = "#5c392b";
  ctx.beginPath();
  ctx.roundRect(-42, -30, 84, 132, 30);
  ctx.fill();
  // thumb over the front of the handset
  ctx.fillStyle = "#6b4433";
  ctx.beginPath();
  ctx.roundRect(10, -14, 26, 74, 13);
  ctx.fill();
  // handset
  ctx.fillStyle = "#0c0b12";
  ctx.beginPath();
  ctx.roundRect(-32, -122, 64, 138, 13);
  ctx.fill();
  ctx.strokeStyle = "rgba(140,200,255,0.7)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-25, -114, 50, 118, 9);
  ctx.stroke();
  ctx.restore();

  /* rim light ---------------------------------------------------------------
     Stroked along the very paths the fills used and clipped to one side, so it
     hugs the silhouette instead of floating beside it. */
  const rim = (colour: string, width: number, left: boolean) => {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.rect(left ? -700 : 0, -700, 700, 1400);
    ctx.clip();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    headPath();
    ctx.stroke();
    shoulderPath();
    ctx.stroke();
    ctx.restore();
  };
  rim("rgba(255,60,130,0.9)", 9, true);
  rim("rgba(90,190,255,0.45)", 5, false);

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

/** scratch canvas the studio shot sprays the tag onto */
let sprayLayer: HTMLCanvasElement | null = null;

/** the tools on the editor's rail, in the order the real one lists them */
const RAIL_TOOLS = ["Filter", "Crop", "Resize", "Spray", "Text", "Shapes", "Stickers", "Frame"];

/**
 * A glyph for each tool on that rail.
 *
 * The briefing's whole job is to say "this is a real image editor" before the
 * player has pressed a key, and the rail used to say it with seven identical
 * empty squares under seven labels — the one part of the shot that looked
 * like a wireframe of the thing rather than the thing. Drawn at whatever size
 * the shot has room for, with the stroke and fill the caller has already set.
 */
function toolGlyph(
  ctx: CanvasRenderingContext2D,
  tool: string,
  x: number,
  y: number,
  s: number,
) {
  const p = new Path2D();
  switch (tool) {
    case "Filter":
      // three sliders
      for (let i = 0; i < 3; i++) {
        const ly = y + (i - 1) * s * 0.6;
        p.moveTo(x - s * 0.8, ly);
        p.lineTo(x + s * 0.8, ly);
      }
      ctx.stroke(p);
      // and their handles, staggered
      ctx.beginPath();
      ctx.arc(x - s * 0.3, y - s * 0.6, s * 0.22, 0, Math.PI * 2);
      ctx.arc(x + s * 0.35, y, s * 0.22, 0, Math.PI * 2);
      ctx.arc(x - s * 0.1, y + s * 0.6, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "Crop":
      p.moveTo(x - s * 0.9, y - s * 0.4);
      p.lineTo(x + s * 0.5, y - s * 0.4);
      p.lineTo(x + s * 0.5, y + s * 0.9);
      p.moveTo(x - s * 0.4, y - s * 0.9);
      p.lineTo(x - s * 0.4, y + s * 0.5);
      p.lineTo(x + s * 0.9, y + s * 0.5);
      ctx.stroke(p);
      return;
    case "Resize":
      // a box with a diagonal pulling its corner out
      p.rect(x - s * 0.85, y - s * 0.85, s * 1.35, s * 1.35);
      p.moveTo(x + s * 0.1, y + s * 0.1);
      p.lineTo(x + s * 0.9, y + s * 0.9);
      p.moveTo(x + s * 0.9, y + s * 0.4);
      p.lineTo(x + s * 0.9, y + s * 0.9);
      p.lineTo(x + s * 0.4, y + s * 0.9);
      ctx.stroke(p);
      return;
    case "Text":
      p.moveTo(x - s * 0.8, y - s * 0.7);
      p.lineTo(x + s * 0.8, y - s * 0.7);
      p.moveTo(x, y - s * 0.7);
      p.lineTo(x, y + s * 0.85);
      ctx.stroke(p);
      return;
    case "Shapes":
      p.moveTo(x - s * 0.25, y - s * 0.85);
      p.lineTo(x + s * 0.85, y + s * 0.35);
      p.lineTo(x - s * 0.85, y + s * 0.35);
      p.closePath();
      ctx.stroke(p);
      ctx.beginPath();
      ctx.arc(x + s * 0.3, y + s * 0.5, s * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case "Stickers": {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + s * 0.05, s * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - s * 0.32, y - s * 0.25, s * 0.13, 0, Math.PI * 2);
      ctx.arc(x + s * 0.32, y - s * 0.25, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    default:
      // Frame: corner brackets
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        p.moveTo(x + sx * s * 0.85, y + sy * s * 0.3);
        p.lineTo(x + sx * s * 0.85, y + sy * s * 0.85);
        p.lineTo(x + sx * s * 0.3, y + sy * s * 0.85);
      }
      ctx.stroke(p);
  }
}

/**
 * YOUR CAN — the one shot in the briefing that shows the actual mechanic, so
 * it copies the real thing: the editor's toolbar with *Leave* and *Paint the
 * wall*, its tool rail with Spray lit, a roller shutter on the canvas, and a
 * can writing the player's own tag across it before it goes up and presses
 * Paint the wall. Everything is drawn here; nothing is a screenshot.
 */
function studioShot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: number,
  t: number,
  tag: string,
) {
  ctx.fillStyle = "#0c0716";
  ctx.fillRect(0, 0, w, h);

  // the editor window — kept above the middle, where the line is not
  const fw = Math.min(w * 0.72, h * 1.5);
  const fh = Math.min(h * 0.4, fw * 0.44);
  const fx = (w - fw) / 2;
  const fy = h * 0.125;
  haze(ctx, w, h, w / 2, fy + fh * 0.55, fw * 0.55, "rgba(200,255,50,0.2)", 0.35);

  /* The studio's action bar, under the editor rather than inside it.
   *
   * The real studio takes the editor's own save and cancel off its toolbar and
   * puts one neon PAINT THE WALL along the bottom of the screen instead (see
   * `useOneCallToAction` in GraffitiStudio) — so this shot, which exists to
   * show the player exactly what they are about to do, shows that button and
   * that toolbar. It is also what the can flies up and presses. */
  const bh = Math.max(26, fh * 0.13);
  const by = fy + fh + Math.max(9, fh * 0.05);
  const btnPx = Math.max(11, Math.min(15, bh * 0.42));
  ctx.font = `700 ${btnPx}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const paintW = ctx.measureText("PAINT THE WALL").width + bh * 1.5;
  const paintX = fx + fw - paintW;
  const pressed = p > 0.86;
  // cancel, outlined, at the other end — the studio's footer in miniature
  const cancelW = ctx.measureText("CANCEL").width + bh * 1.1;
  roundRect(ctx, fx, by, cancelW, bh, 4);
  ctx.strokeStyle = "rgba(246,241,232,0.3)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = "rgba(246,241,232,0.62)";
  ctx.fillText("CANCEL", fx + cancelW / 2, by + bh / 2 + 0.5);
  if (pressed) {
    ctx.save();
    ctx.shadowColor = "rgba(200,255,50,0.85)";
    ctx.shadowBlur = bh * 1.2;
  }
  roundRect(ctx, paintX, by, paintW, bh, 4);
  ctx.fillStyle = "#c8ff32";
  ctx.fill();
  if (pressed) ctx.restore();
  ctx.fillStyle = "#0c0716";
  ctx.fillText("PAINT THE WALL", paintX + paintW / 2, by + bh / 2 + 0.5);

  ctx.save();
  roundRect(ctx, fx, fy, fw, fh, 10);
  ctx.fillStyle = "#121822";
  ctx.fill();
  ctx.clip();

  // toolbar
  const barH = Math.max(30, fh * 0.105);
  ctx.fillStyle = "#1c2330";
  ctx.fillRect(fx, fy, fw, barH);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(fx, fy + barH - 1, fw, 1);
  ctx.strokeStyle = "rgba(200,210,225,0.55)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const cx = fx + 22 + i * 28;
    ctx.beginPath();
    ctx.arc(cx, fy + barH / 2, 6, Math.PI * 0.2, Math.PI * 1.7);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(fx + fw * 0.46 + i * 28, fy + barH / 2, 5.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // the tool rail, Spray lit
  const railW = Math.max(54, fw * 0.085);
  const railX = fx + fw - railW;
  const railY = fy + barH;
  const railH = fh - barH;
  ctx.fillStyle = "#18202b";
  ctx.fillRect(railX, railY, railW, railH);
  const slot = (railH - 10) / RAIL_TOOLS.length;
  const labelPx = Math.max(8, Math.min(11, slot * 0.2));
  RAIL_TOOLS.forEach((tool, i) => {
    const sy = railY + 5 + i * slot;
    const on = tool === "Spray";
    if (on) {
      roundRect(ctx, railX + 5, sy + 2, railW - 10, slot - 4, 6);
      ctx.fillStyle = "#28313f";
      ctx.fill();
    }
    const colour = on ? "#f4f5f7" : "rgba(170,180,196,0.72)";
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 1.4;
    const ix = railX + railW / 2;
    const iy = sy + slot * 0.36;
    const s = Math.min(8, slot * 0.17);
    if (on) {
      // a can
      roundRect(ctx, ix - s * 0.55, iy - s * 0.45, s * 1.1, s * 1.5, 2);
      ctx.stroke();
      ctx.strokeRect(ix - s * 0.3, iy - s * 0.8, s * 0.6, s * 0.35);
      ctx.beginPath();
      ctx.arc(ix + s * 0.9, iy - s * 0.95, 1, 0, Math.PI * 2);
      ctx.arc(ix + s * 1.3, iy - s * 0.6, 1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      toolGlyph(ctx, tool, ix, iy, s);
    }
    ctx.font = `500 ${labelPx}px Inter, system-ui, sans-serif`;
    ctx.fillText(tool, ix, sy + slot * 0.74);
  });

  // the canvas: a roller shutter, the same look the real studio opens with
  const areaX = fx;
  const areaW = fw - railW;
  const sw = Math.min(areaW * 0.84, (railH - 24) * 2.05);
  const sh = sw / 2.05;
  const sx = areaX + (areaW - sw) / 2;
  const sy = railY + (railH - sh) / 2;
  ctx.fillStyle = "#26232b";
  ctx.fillRect(sx, sy, sw, sh);
  for (let y = sy; y < sy + sh; y += Math.max(6, sh / 26)) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(sx, y, sw, sh / 70);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(sx, y + sh / 52, sw, sh / 70);
  }
  const shade = ctx.createLinearGradient(sx, 0, sx + sw, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.45)");
  shade.addColorStop(0.5, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = shade;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - 0.5, sy - 0.5, sw + 1, sh + 1);
  ctx.setLineDash([]);

  // the player's tag, written left to right by the can
  const word = tag || "JASON";
  const size = sh * 0.46;
  ctx.font = `${size}px Anton, Impact, "Arial Black", sans-serif`;
  const textW = Math.min(ctx.measureText(word).width, sw * 0.8);
  const textX = sx + (sw - textW) / 2;
  const textY = sy + sh * 0.5;
  const u = smooth(clamp01((p - 0.1) / 0.62));
  const wiggle = Math.sin(u * Math.PI * 9) * size * 0.3;
  let canX = textX - size * 0.2 + u * (textW + size * 0.4);
  let canY = textY + wiggle;
  if (u > 0) {
    // drawn off to one side and faded out ahead of the nozzle, so the paint
    // arrives as a spray rather than behind a hard vertical wipe
    const fitted = Math.min(size, (size * sw * 0.8) / Math.max(1, ctx.measureText(word).width));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const off = (sprayLayer ??= document.createElement("canvas"));
    const ow = Math.ceil(sw * dpr);
    const oh = Math.ceil(sh * dpr);
    if (off.width !== ow || off.height !== oh) {
      off.width = ow;
      off.height = oh;
    }
    const octx = off.getContext("2d");
    if (octx) {
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.globalCompositeOperation = "source-over";
      octx.clearRect(0, 0, sw, sh);
      neonText(octx, word, sw / 2, sh / 2, fitted, "#c8ff32", 1);
      const edge = canX - sx + size * 0.1;
      const feather = size * 0.45;
      const mask = octx.createLinearGradient(edge - feather, 0, edge, 0);
      mask.addColorStop(0, "rgba(0,0,0,1)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      octx.globalCompositeOperation = "destination-in";
      octx.fillStyle = mask;
      octx.fillRect(0, 0, sw, sh);
      octx.globalCompositeOperation = "source-over";
      ctx.drawImage(off, sx, sy, sw, sh);
    }
  }

  // ...then up to the toolbar to paint the wall
  const toButton = smooth(clamp01((p - 0.74) / 0.12));
  canX += (paintX + paintW * 0.5 - canX) * toButton;
  canY += (by + bh * 0.62 - canY) * toButton;
  const spraying = u > 0 && u < 1;

  if (spraying) {
    // overspray: a cloud of droplets round the nozzle, fresh every frame
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const mist = ctx.createRadialGradient(canX, canY, 0, canX, canY, size * 0.55);
    mist.addColorStop(0, "rgba(200,255,50,0.5)");
    mist.addColorStop(1, "rgba(200,255,50,0)");
    ctx.fillStyle = mist;
    ctx.fillRect(canX - size, canY - size, size * 2, size * 2);
    ctx.fillStyle = "#d6ff5a";
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 1.6) * size * 0.42;
      ctx.globalAlpha = 0.35 + Math.random() * 0.55;
      ctx.fillRect(canX + Math.cos(a) * r, canY + Math.sin(a) * r, 1.6, 1.6);
    }
    ctx.restore();
  }

  // the canvas takes the paint
  if (p > 0.86) {
    const k = clamp01((p - 0.86) / 0.14);
    haze(ctx, w, h, sx + sw / 2, sy + sh / 2, sw * 0.55, "rgba(214,255,90,0.9)", (1 - k) * 0.5);
  }
  ctx.restore();

  // ...and the ring off the button, which stands below the frame and so has
  // to be drawn outside its clip
  if (p > 0.86) {
    const k = clamp01((p - 0.86) / 0.14);
    ctx.save();
    ctx.strokeStyle = `rgba(200,255,50,${1 - k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(paintX + paintW / 2, by + bh / 2, 8 + k * 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // the can itself, nozzle on the point it is spraying
  const cs = Math.max(12, size * 0.26);
  ctx.save();
  ctx.translate(canX, canY);
  ctx.rotate(-0.42 + (spraying ? Math.sin(t * 30) * 0.03 : 0));
  ctx.translate(cs * 0.35, -cs * 0.2);
  ctx.fillStyle = "#f2f2ef";
  roundRect(ctx, 0, -cs * 0.2, cs * 1.1, cs * 2.2, cs * 0.18);
  ctx.fill();
  ctx.fillStyle = "#c8ff32";
  ctx.fillRect(0, cs * 0.55, cs * 1.1, cs * 0.5);
  ctx.fillStyle = "#1a1a1a";
  roundRect(ctx, cs * 0.2, -cs * 0.55, cs * 0.7, cs * 0.4, cs * 0.1);
  ctx.fill();
  ctx.fillRect(-cs * 0.1, -cs * 0.48, cs * 0.35, cs * 0.18);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1;
  roundRect(ctx, 0, -cs * 0.2, cs * 1.1, cs * 2.2, cs * 0.18);
  ctx.stroke();
  ctx.restore();
}

/* ── the component ───────────────────────────────────────────────────────── */
export function TrailerCanvas({
  shot,
  progress,
  index = 0,
  photo,
  tag = "",
}: {
  shot: ShotKind;
  progress: number;
  index?: number;
  photo?: PlateName;
  /** the player's tag, which the studio shot writes on the shutter */
  tag?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shotRef = useRef(shot);
  const progRef = useRef(progress);
  const indexRef = useRef(index);
  const plateRef = useRef(photo);
  const tagRef = useRef(tag);
  shotRef.current = shot;
  progRef.current = progress;
  indexRef.current = index;
  plateRef.current = photo;
  tagRef.current = tag;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let drops: Drop[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = mulberry32(5);
      drops = Array.from({ length: 220 }, () => ({
        x: r() * w,
        y: r() * h,
        len: 14 + r() * 26,
        v: 700 + r() * 700,
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
      const p = progRef.current;
      const kind = shotRef.current;

      ctx.clearRect(0, 0, w, h);

      // base grade — every shot is a wet purple night
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#0a0614");
      sky.addColorStop(0.55, "#231032");
      sky.addColorStop(1, "#3d1430");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Push in and drift sideways, alternating direction shot to shot. A
      // still frame with a caption on it reads as a slideshow; a frame that
      // moves reads as a trailer.
      // ...except the studio, whose mock has to stay clear of the letterbox
      // and of the line under it
      const studio = kind === "studio";
      const zoom = studio ? 1 + p * 0.04 : 1.02 + p * 0.14;
      const pan = (indexRef.current % 2 === 0 ? 1 : -1) * (p - 0.5) * w * (studio ? 0.015 : 0.06);
      ctx.save();
      ctx.translate(w / 2 + pan, h / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -h / 2);

      if (kind === "call") {
        // club interior: dark room, a wall of bokeh and a sign burning behind him
        ctx.fillStyle = "#150a18";
        ctx.fillRect(0, 0, w, h);

        // a graded photographic plate if one is available for this shot
        const img = plateRef.current ? plate(plateRef.current) : null;
        if (img) {
          drawPlate(ctx, img, w, h, p);
          haze(ctx, w, h, w * 0.18, h * 0.3, h * 0.5, "rgba(255,40,120,0.4)", 0.3);
          ctx.restore();
          rain(ctx, drops, w, h, dt, 0.22);
          const vigP = ctx.createRadialGradient(w / 2, h * 0.48, h * 0.22, w / 2, h * 0.5, h);
          vigP.addColorStop(0, "rgba(0,0,0,0)");
          vigP.addColorStop(1, "rgba(4,2,8,0.92)");
          ctx.fillStyle = vigP;
          ctx.fillRect(0, 0, w, h);
          if (p < 0.09) {
            ctx.fillStyle = `rgba(255,235,245,${(0.09 - p) * 7})`;
            ctx.fillRect(0, 0, w, h);
          }
          raf = requestAnimationFrame(draw);
          return;
        }

        haze(ctx, w, h, w * 0.74, h * 0.32, h * 0.62, "rgba(255,40,120,0.55)", 0.4);
        haze(ctx, w, h, w * 0.12, h * 0.5, h * 0.5, "rgba(90,60,255,0.5)", 0.28);

        // out-of-focus lights across the back wall
        const rb = mulberry32(404);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 26; i++) {
          const bx = rb() * w;
          const by = h * 0.12 + rb() * h * 0.5;
          const br = 10 + rb() * 34;
          const pulse = 0.5 + Math.sin(t * 1.6 + i) * 0.5;
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          const tint = i % 3 === 0 ? "255,90,160" : i % 3 === 1 ? "120,120,255" : "255,180,90";
          g.addColorStop(0, `rgba(${tint},${0.22 + pulse * 0.2})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // the sign in the back room
        // kept left of centre so the incoming-call card never covers it
        neonText(
          ctx,
          "JACK OF WANDS",
          w * 0.62,
          h * 0.18,
          Math.min(w * 0.036, 46),
          "#ff2f6e",
          Math.sin(t * 27) > -0.9 ? 0.85 : 0.4,
        );

        caller(ctx, w, h, t);
      }

      if (kind === "wall" || kind === "covered") {
        // a brick wall carrying the Kings' mark
        ctx.fillStyle = "#3b2a2c";
        ctx.fillRect(0, 0, w, h);
        const r = mulberry32(77);
        const bh = h / 16;
        const bw = bh * 2.7;
        for (let row = 0, y = 0; y < h; row++, y += bh) {
          const off = row % 2 ? bw / 2 : 0;
          for (let x = -bw; x < w + bw; x += bw) {
            const v = r() * 26 - 13;
            ctx.fillStyle = `rgb(${88 + v},${54 + v},${50 + v})`;
            ctx.fillRect(x + off + 3, y + 3, bw - 6, bh - 6);
          }
        }
        haze(ctx, w, h, w * 0.5, h * 0.5, h * 0.9, "rgba(255,60,120,0.22)", 0.6);

        // the crown mark, dripping
        const cx = w * 0.5;
        const cy = h * 0.44;
        const s = Math.min(w, h) * 0.0016;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.fillStyle = "#e01e37";
        ctx.shadowColor = "#ff3355";
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.moveTo(-150, 60);
        ctx.lineTo(-190, -90);
        ctx.lineTo(-90, -10);
        ctx.lineTo(0, -120);
        ctx.lineTo(90, -10);
        ctx.lineTo(190, -90);
        ctx.lineTo(150, 60);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(i * 44 - 5, 60, 11, 40 + Math.abs(i) * 26);
        }
        ctx.restore();

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = `${Math.min(w * 0.03, 38)}px Anton, Impact, sans-serif`;
        ctx.fillStyle = "rgba(255,80,110,0.85)";
        ctx.letterSpacing = "10px";
        ctx.fillText("CARMINE KINGS", w * 0.5, h * 0.78);
        ctx.restore();

        // ...and then somebody buries it
        if (kind === "covered") {
          const cover = Math.min(1, Math.max(0, (p - 0.08) * 2.1));
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, h * (1 - cover), w, h * cover);
          ctx.clip();
          neonText(ctx, "NEON", w * 0.5, h * 0.5, Math.min(w * 0.19, h * 0.42), "#c8ff32", 1);
          // overspray
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = "#c8ff32";
          for (let i = 0; i < 160; i++) {
            const sx = w * 0.18 + Math.random() * w * 0.64;
            const sy = h * 0.28 + Math.random() * h * 0.44;
            ctx.fillRect(sx, sy, 2 + Math.random() * 3, 2 + Math.random() * 3);
          }
          ctx.restore();
        }
      }

      if (kind === "studio") studioShot(ctx, w, h, p, t, tagRef.current);

      ctx.restore();

      if (kind !== "studio") rain(ctx, drops, w, h, dt, 0.22);

      // vignette + grade
      const vig = ctx.createRadialGradient(w / 2, h * 0.48, h * 0.2, w / 2, h * 0.5, h * 1.0);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(4,2,8,0.9)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // a hard cut flash at the very start of each shot
      if (p < 0.09) {
        ctx.fillStyle = `rgba(255,235,245,${(0.09 - p) * 7})`;
        ctx.fillRect(0, 0, w, h);
      }

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
