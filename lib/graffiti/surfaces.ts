/**
 * Procedural surface photography.
 *
 * Every graffiti spot in the city needs a picture of itself: the *same* pixels
 * are used as the 3D texture on the wall and as the base image handed to the
 * Unlayer image editor. Generating them on a 2D canvas means there are no
 * asset downloads, no CORS problems when the editor loads the image, and the
 * player's saved artwork drops back onto the wall in perfect register.
 */
import type { GraffitiSpot, SurfaceType } from "./graffitiTypes";

/* ── tiny deterministic RNG ─────────────────────────────────────────────── */
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
type Rng = () => number;
const rand = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/* ── reusable grain pattern ─────────────────────────────────────────────── */
let grainTile: HTMLCanvasElement | null = null;
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  if (!grainTile) {
    const t = canvas(160, 160);
    const g = t.getContext("2d")!;
    const img = g.createImageData(160, 160);
    const r = mulberry32(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + r() * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTile = t;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  const pat = ctx.createPattern(grainTile, "repeat")!;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Dirt gathering in the corners and along the bottom edge. */
function weather(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Rng,
  strength = 1,
) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";

  const floor = ctx.createLinearGradient(0, h * 0.55, 0, h);
  floor.addColorStop(0, "rgba(255,255,255,1)");
  floor.addColorStop(1, `rgba(96,84,74,${0.85 * strength})`);
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, w, h);

  // streaks running down from the top edge
  for (let i = 0; i < 14 * strength; i++) {
    const x = r() * w;
    const wd = rand(r, 2, 26);
    const len = rand(r, h * 0.12, h * 0.8);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(70,62,55,${rand(r, 0.1, 0.3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, wd, len);
  }

  // damp blotches
  for (let i = 0; i < 10 * strength; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = rand(r, w * 0.04, w * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(88,80,72,${rand(r, 0.08, 0.24)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // corner vignette so the panel reads as lit from the street
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const v = ctx.createRadialGradient(w * 0.45, h * 0.4, h * 0.2, w * 0.5, h * 0.5, w * 0.78);
  v.addColorStop(0, "rgba(255,255,255,1)");
  v.addColorStop(1, "rgba(120,110,104,1)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Faint leftovers from whoever hit this wall before you. */
function oldTags(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng, n: number) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = rand(r, 0.05, 0.16);
    ctx.strokeStyle = pick(r, ["#1c1620", "#2b2440", "#3a1f28", "#20303a"]);
    ctx.lineWidth = rand(r, 2, 6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const x0 = rand(r, w * 0.05, w * 0.75);
    const y0 = rand(r, h * 0.2, h * 0.85);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    let x = x0;
    let y = y0;
    const segs = Math.floor(rand(r, 4, 9));
    for (let s = 0; s < segs; s++) {
      x += rand(r, -w * 0.05, w * 0.12);
      y += rand(r, -h * 0.14, h * 0.14);
      ctx.quadraticCurveTo(x + rand(r, -20, 20), y + rand(r, -30, 10), x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ── the surfaces ───────────────────────────────────────────────────────── */

function drawWall(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng) {
  const variant = Math.floor(r() * 3);

  if (variant === 0) {
    // painted breeze-block, half-covered in an old buff coat
    ctx.fillStyle = "#8d8479";
    ctx.fillRect(0, 0, w, h);
    const bh = h / 7;
    const bw = bh * 2.6;
    for (let row = 0, y = 0; y < h; row++, y += bh) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const v = rand(r, -16, 16);
        ctx.fillStyle = `rgb(${141 + v},${132 + v},${121 + v})`;
        ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
    // a rectangle of buff paint where the council covered someone else's piece
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = pick(r, ["#9c9184", "#7f7d78", "#a09383"]);
    ctx.fillRect(
      rand(r, -w * 0.1, w * 0.3),
      rand(r, h * 0.1, h * 0.4),
      rand(r, w * 0.4, w * 0.8),
      rand(r, h * 0.3, h * 0.55),
    );
    ctx.restore();
  } else if (variant === 1) {
    // old red brick
    ctx.fillStyle = "#6a5148";
    ctx.fillRect(0, 0, w, h);
    const bh = h / 12;
    const bw = bh * 2.9;
    for (let row = 0, y = 0; y < h; row++, y += bh) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const t = r();
        const base = t < 0.12 ? [122, 78, 66] : t < 0.3 ? [148, 96, 78] : [134, 84, 70];
        const v = rand(r, -20, 20);
        ctx.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.7},${base[2] + v * 0.6})`;
        ctx.fillRect(x + off + 2.5, y + 2.5, bw - 5, bh - 5);
      }
    }
  } else {
    // poured concrete with form-work seams
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#9a958d");
    g.addColorStop(1, "#7b756d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(60,56,52,0.35)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((w / 4) * i, 0);
      ctx.lineTo((w / 4) * i, h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, h * 0.42);
    ctx.lineTo(w, h * 0.42);
    ctx.stroke();
    // tie-rod holes
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = "rgba(50,46,42,0.5)";
      ctx.beginPath();
      ctx.arc(rand(r, 0, w), rand(r, 0, h), rand(r, 3, 6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // hairline cracks
  ctx.save();
  ctx.strokeStyle = "rgba(40,36,34,0.4)";
  for (let i = 0; i < 5; i++) {
    ctx.lineWidth = rand(r, 0.8, 2.2);
    let x = rand(r, 0, w);
    let y = rand(r, 0, h);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 10; s++) {
      x += rand(r, -18, 18);
      y += rand(r, 4, 30);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  oldTags(ctx, w, h, r, 3);
  weather(ctx, w, h, r, 1);
  grain(ctx, w, h, 0.32);
}

function drawShutter(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng) {
  const hue = pick(r, [
    ["#4a5560", "#2b333c"],
    ["#5d5148", "#332c26"],
    ["#3f4a4a", "#232b2b"],
    ["#5a4a58", "#302833"],
  ]);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hue[0]);
  g.addColorStop(1, hue[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // corrugation
  const rib = h / 26;
  for (let y = 0; y < h; y += rib) {
    const lg = ctx.createLinearGradient(0, y, 0, y + rib);
    lg.addColorStop(0, "rgba(255,255,255,0.14)");
    lg.addColorStop(0.45, "rgba(255,255,255,0.03)");
    lg.addColorStop(0.55, "rgba(0,0,0,0.16)");
    lg.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, y, w, rib);
  }

  // side rails
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, w * 0.02, h);
  ctx.fillRect(w * 0.98, 0, w * 0.02, h);

  // rust creeping up from the pavement
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < 18; i++) {
    const x = r() * w;
    const y = h - rand(r, 0, h * 0.42);
    const rad = rand(r, 10, 70);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, `rgba(140,74,38,${rand(r, 0.15, 0.4)})`);
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // handle + lock plate
  ctx.fillStyle = "rgba(20,18,18,0.75)";
  ctx.fillRect(w * 0.45, h * 0.9, w * 0.1, h * 0.045);
  ctx.fillStyle = "rgba(200,200,200,0.14)";
  ctx.fillRect(w * 0.45, h * 0.9, w * 0.1, h * 0.012);

  oldTags(ctx, w, h, r, 2);
  weather(ctx, w, h, r, 0.75);
  grain(ctx, w, h, 0.26);
}

function drawBillboard(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng) {
  ctx.fillStyle = "#e9e3d6";
  ctx.fillRect(0, 0, w, h);

  // paper seams — the sheets a billboard is pasted up from
  const cols = 4;
  for (let i = 1; i < cols; i++) {
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect((w / cols) * i, 0, 2, h);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect((w / cols) * i + 2, 0, 2, h);
  }
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  ctx.fillRect(0, h * 0.5, w, 2);

  // torn paper from the last campaign
  ctx.save();
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = rand(r, 0.06, 0.16);
    ctx.fillStyle = pick(r, ["#3a4a8a", "#a33b3b", "#2f6b4f", "#8a6a2f"]);
    const x = rand(r, 0, w * 0.8);
    const y = rand(r, 0, h * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      ctx.lineTo(x + rand(r, -60, 160), y + rand(r, -40, 120));
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // house frame
  ctx.strokeStyle = "rgba(40,36,34,0.55)";
  ctx.lineWidth = Math.max(6, w * 0.012);
  ctx.strokeRect(
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    w - ctx.lineWidth,
    h - ctx.lineWidth,
  );

  // bolts
  ctx.fillStyle = "rgba(60,56,52,0.55)";
  const inset = w * 0.028;
  for (const [bx, by] of [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ]) {
    ctx.beginPath();
    ctx.arc(bx, by, w * 0.008, 0, Math.PI * 2);
    ctx.fill();
  }

  // faint "space available" ghost
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "#231d18";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.floor(h * 0.16)}px Anton, Impact, sans-serif`;
  ctx.fillText("SPACE AVAILABLE", w / 2, h / 2);
  ctx.font = `${Math.floor(h * 0.07)}px Inter, sans-serif`;
  ctx.fillText("ARCLIGHT OUTDOOR MEDIA", w / 2, h / 2 + h * 0.14);
  ctx.restore();

  weather(ctx, w, h, r, 0.55);
  grain(ctx, w, h, 0.2);
}

function drawFence(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng) {
  ctx.fillStyle = "#5b4a3a";
  ctx.fillRect(0, 0, w, h);
  const planks = 14;
  const pw = w / planks;
  for (let i = 0; i < planks; i++) {
    const v = rand(r, -22, 22);
    ctx.fillStyle = `rgb(${104 + v},${84 + v},${64 + v})`;
    ctx.fillRect(i * pw + 1.5, 0, pw - 3, h);
    // grain lines
    ctx.strokeStyle = "rgba(50,38,28,0.25)";
    ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const x = i * pw + rand(r, 3, pw - 3);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rand(r, -4, 4), h * 0.33, x + rand(r, -4, 4), h * 0.66, x, h);
      ctx.stroke();
    }
    // nail heads
    ctx.fillStyle = "rgba(30,26,22,0.6)";
    for (const ny of [h * 0.14, h * 0.86]) {
      ctx.beginPath();
      ctx.arc(i * pw + pw / 2, ny, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // horizontal rails behind
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, h * 0.12, w, h * 0.03);
  ctx.fillRect(0, h * 0.85, w, h * 0.03);

  oldTags(ctx, w, h, r, 4);
  weather(ctx, w, h, r, 1.1);
  grain(ctx, w, h, 0.3);
}

function drawVehicle(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng) {
  const body = pick(r, ["#d8d4cc", "#b9c3c9", "#cbb9a8", "#c9ccd2"]);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.18, body);
  g.addColorStop(0.8, body);
  g.addColorStop(1, "#7d7a74");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // body swage line + panel gaps
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(0, h * 0.62, w, 3);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, h * 0.62 + 3, w, 2);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(w * 0.63, 0, 3, h);

  // rivet run
  ctx.fillStyle = "rgba(90,86,80,0.45)";
  for (let x = w * 0.03; x < w; x += w * 0.045) {
    ctx.beginPath();
    ctx.arc(x, h * 0.08, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // scuffs
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "#4a453e";
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = rand(r, 1, 3);
    const y = rand(r, h * 0.5, h * 0.95);
    ctx.beginPath();
    ctx.moveTo(rand(r, 0, w), y);
    ctx.lineTo(rand(r, 0, w), y + rand(r, -4, 4));
    ctx.stroke();
  }
  ctx.restore();

  weather(ctx, w, h, r, 0.5);
  grain(ctx, w, h, 0.18);
}

const PAINTERS: Record<
  SurfaceType,
  (ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng) => void
> = {
  wall: drawWall,
  shutter: drawShutter,
  billboard: drawBillboard,
  fence: drawFence,
  vehicle: drawVehicle,
};

/* ── public API ─────────────────────────────────────────────────────────── */

export function surfacePixelSize(spot: GraffitiSpot): [number, number] {
  const W = 1024;
  const H = Math.round(Math.min(1024, Math.max(320, (W * spot.size[1]) / spot.size[0])));
  return [W, H];
}

const cache = new Map<string, string>();

/** The untouched photograph of a surface — cached, deterministic per spot. */
export function surfaceImage(spot: GraffitiSpot): string {
  const hit = cache.get(spot.id);
  if (hit) return hit;
  const [w, h] = surfacePixelSize(spot);
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  PAINTERS[spot.surfaceType](ctx, w, h, mulberry32(spot.seed));
  const url = c.toDataURL("image/jpeg", 0.9);
  cache.set(spot.id, url);
  return url;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image failed to load"));
    img.src = src;
  });
}

/**
 * Drops an imported picture onto the wall photo so the editor opens with the
 * artwork already *on* the surface — the wall texture is blended back over the
 * top so it reads as paint on brick rather than a sticker.
 */
export async function composeArtOnSurface(
  spot: GraffitiSpot,
  artSrc: string,
  opts: { cover?: number } = {},
): Promise<string> {
  const base = surfaceImage(spot);
  const [w, h] = surfacePixelSize(spot);
  const [bg, art] = await Promise.all([loadImage(base), loadImage(artSrc)]);
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bg, 0, 0, w, h);

  const cover = opts.cover ?? 0.86;
  const scale = Math.min((w * cover) / art.width, (h * cover) / art.height);
  const dw = art.width * scale;
  const dh = art.height * scale;
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.drawImage(art, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();

  // push the surface texture back through the paint
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(bg, 0, 0, w, h);
  ctx.restore();

  return c.toDataURL("image/jpeg", 0.92);
}

/**
 * Makes whatever came out of the editor the shape of the wall it is going on.
 *
 * The editor can hand back any proportions — a crop, a resize or a quarter turn
 * all change them — while the plane in the city is the size it is. Stretching a
 * square crop across a 2:1 shutter squashes the lettering into something the
 * player never drew, so a piece that no longer matches is hung on the bare
 * surface at its own proportions instead, the way a paste-up would be.
 */
export async function fitToSurface(spot: GraffitiSpot, src: string): Promise<string> {
  const target = spot.size[0] / spot.size[1];
  let art: HTMLImageElement;
  try {
    art = await loadImage(src);
  } catch {
    return src;
  }
  const aspect = art.width / art.height;
  if (Math.abs(aspect - target) / target < 0.025) return src;

  let bg: HTMLImageElement | null = null;
  try {
    bg = await loadImage(surfaceImage(spot));
  } catch {
    bg = null;
  }

  // keep the detail of a big piece, but never hand the GPU a poster
  const w = Math.round(Math.min(2048, Math.max(1024, art.width)));
  const h = Math.round(w / target);
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  if (bg) ctx.drawImage(bg, 0, 0, w, h);
  else {
    ctx.fillStyle = "#2a2430";
    ctx.fillRect(0, 0, w, h);
  }

  const scale = Math.min((w * 0.96) / art.width, (h * 0.96) / art.height);
  const dw = art.width * scale;
  const dh = art.height * scale;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = Math.round(w * 0.012);
  ctx.drawImage(art, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();

  return c.toDataURL("image/jpeg", 0.92);
}

/* ── the player's own name, four ways ────────────────────────────────────── */

export type TagStyle = "wild" | "chrome" | "bubble" | "stencil";

export const TAG_STYLES: { id: TagStyle; label: string }[] = [
  { id: "wild", label: "WILDSTYLE" },
  { id: "chrome", label: "CHROME" },
  { id: "bubble", label: "BUBBLE" },
  { id: "stencil", label: "STENCIL" },
];

/** Upper-case, letters and digits only, short enough to sit on a shutter. */
export function cleanTag(raw: string, max = 10): string {
  return tagDraft(raw, max).trim();
}

/**
 * The same, for a field that is still being typed in: a trailing space is the
 * start of the next word, not something to strip before it can be followed.
 */
export function tagDraft(raw: string, max = 10): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/^ /, "")
    .slice(0, max);
}

/**
 * The writer's name as a finished piece, on a transparent canvas.
 *
 * Every other ready-made in the game says somebody else's word. This is the one
 * a player actually wants on a wall — their own — and it is drawn fresh from
 * whatever they typed, in the four hands a writer would learn in.
 */
export function tagPiece(word: string, style: TagStyle, seed = 1, w = 900, h = 460): string {
  const r = mulberry32(Math.imul(seed + style.length * 97, 2246822519));
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  const text = cleanTag(word) || "WRITER";
  ctx.translate(w / 2, h / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (style === "wild") drawWild(ctx, text, w, h, r);
  else if (style === "chrome") drawChrome(ctx, text, w, h, r);
  else if (style === "bubble") drawBubble(ctx, text, w, h, r);
  else drawStencil(ctx, text, w, h, r);

  return c.toDataURL("image/png");
}

/** Biggest Anton size at which `text` fits `maxW` × `maxH`. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxH: number,
  family = 'Anton, Impact, "Arial Black", sans-serif',
) {
  let size = Math.floor(maxH);
  ctx.font = `${size}px ${family}`;
  while (ctx.measureText(text).width > maxW && size > 18) {
    size -= 4;
    ctx.font = `${size}px ${family}`;
  }
  return size;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.shadowColor = colour;
  ctx.shadowBlur = s * 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Rng,
  colour: string,
  count: number,
  spread = 1,
) {
  ctx.save();
  ctx.fillStyle = colour;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = rand(r, 0.05, 0.4);
    ctx.beginPath();
    ctx.arc(
      rand(r, (-w / 2) * spread, (w / 2) * spread),
      rand(r, (-h / 2) * spread, (h / 2) * spread),
      rand(r, 0.6, 2.8),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Letters that will not sit still: every one tipped and jostled, interlocked,
 * pushed out into a block shadow, with arrows breaking off the ends.
 */
function drawWild(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, r: Rng) {
  const palettes: [string, string, string, string][] = [
    ["#c8ff32", "#22e0ff", "#0b0714", "#ff2f86"],
    ["#ff2f86", "#ffc542", "#12040c", "#22e0ff"],
    ["#22e0ff", "#b45bff", "#050a14", "#c8ff32"],
    ["#ff8b3d", "#ffe14d", "#140800", "#ff2f86"],
  ];
  const [top, bottom, outline, accent] = pick(r, palettes);
  const chars = [...text];
  const size = fitFont(ctx, text, w * 0.66, h * 0.62);
  const overlap = size * 0.05;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) - overlap * (chars.length - 1);

  type Placed = { ch: string; x: number; y: number; rot: number; scale: number };
  const placed: Placed[] = [];
  let x = -total / 2;
  chars.forEach((ch, i) => {
    placed.push({
      ch,
      x: x + widths[i] / 2,
      y: rand(r, -h * 0.07, h * 0.07),
      rot: rand(r, -0.2, 0.2),
      scale: rand(r, 0.9, 1.12),
    });
    x += widths[i] - overlap;
  });

  const each = (fn: (p: Placed) => void) => {
    for (const p of placed) {
      if (p.ch === " ") continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(p.scale, p.scale);
      fn(p);
      ctx.restore();
    }
  };

  ctx.rotate(rand(r, -0.08, 0.02));

  // glow behind everything
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 60;
  each((p) => {
    ctx.fillStyle = accent;
    ctx.fillText(p.ch, 0, 0);
  });
  ctx.restore();

  // arrows off the first and last letters
  const arrow = (fromX: number, fromY: number, dir: number) => {
    const len = size * 0.55;
    ctx.save();
    ctx.translate(fromX, fromY);
    ctx.scale(dir, 1);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.05);
    ctx.quadraticCurveTo(len * 0.5, -size * 0.35, len, -size * 0.28);
    ctx.lineTo(len * 0.92, -size * 0.42);
    ctx.lineTo(len * 1.28, -size * 0.2);
    ctx.lineTo(len * 0.9, -size * 0.02);
    ctx.lineTo(len * 0.96, -size * 0.14);
    ctx.quadraticCurveTo(len * 0.45, -size * 0.18, 0, size * 0.08);
    ctx.closePath();
    ctx.lineWidth = size * 0.08;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
  };
  const first = placed[0];
  const last = placed[placed.length - 1];
  if (first && last) {
    arrow(last.x + size * 0.18, last.y - size * 0.12, 1);
    arrow(first.x - size * 0.18, first.y + size * 0.28, -1);
  }

  // block shadow
  const depth = Math.max(6, Math.round(size * 0.07));
  ctx.save();
  ctx.fillStyle = outline;
  for (let d = depth; d > 0; d -= 1.5) {
    each((p) => ctx.fillText(p.ch, d, d));
  }
  ctx.restore();

  // outline, then fill
  ctx.lineWidth = size * 0.13;
  ctx.strokeStyle = outline;
  each((p) => ctx.strokeText(p.ch, 0, 0));
  const grad = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, top);
  grad.addColorStop(0.56, bottom);
  grad.addColorStop(1, bottom);
  each((p) => {
    ctx.fillStyle = grad;
    ctx.fillText(p.ch, 0, 0);
  });

  // a highlight riding the top-left of every letter
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(2, size * 0.018);
  ctx.strokeStyle = "#ffffff";
  each((p) => ctx.strokeText(p.ch, -size * 0.02, -size * 0.025));
  ctx.restore();

  speckle(ctx, w, h, r, top, 220);
  for (let i = 0; i < 4; i++) {
    const p = pick(r, placed);
    sparkle(ctx, p.x + rand(r, -size * 0.3, size * 0.3), p.y - size * rand(r, 0.35, 0.55), size * 0.09, "#ffffff");
  }
}

/** Silver letters, a hard black keyline and a neon outer line — the classic. */
function drawChrome(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, r: Rng) {
  const neon = pick(r, ["#ff2f86", "#22e0ff", "#c8ff32", "#b45bff"]);
  const size = fitFont(ctx, text, w * 0.76, h * 0.6);
  ctx.rotate(rand(r, -0.06, 0.03));
  ctx.transform(1, 0, -0.14, 1, 0, 0);

  // drop shadow
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#000000";
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 24;
  ctx.fillText(text, size * 0.06, size * 0.08);
  ctx.restore();

  // neon outer line, glowing
  ctx.save();
  ctx.shadowColor = neon;
  ctx.shadowBlur = 38;
  ctx.lineWidth = size * 0.24;
  ctx.strokeStyle = neon;
  ctx.strokeText(text, 0, 0);
  ctx.restore();

  ctx.lineWidth = size * 0.13;
  ctx.strokeStyle = "#07050c";
  ctx.strokeText(text, 0, 0);

  // chrome: sky, horizon line, ground
  const g = ctx.createLinearGradient(0, -size * 0.48, 0, size * 0.48);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, "#cfd8e6");
  g.addColorStop(0.49, "#6f7d94");
  g.addColorStop(0.5, "#2b2f3a");
  g.addColorStop(0.62, "#8a93a6");
  g.addColorStop(1, "#f2f5fa");
  ctx.fillStyle = g;
  ctx.fillText(text, 0, 0);

  // a lick of the neon reflected in the lower half
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = neon;
  ctx.fillRect(-w / 2, size * 0.05, w, size * 0.5);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(2, size * 0.014);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(text, -size * 0.012, -size * 0.018);
  ctx.restore();

  const half = ctx.measureText(text).width / 2;
  sparkle(ctx, -half * 0.8, -size * 0.36, size * 0.13, "#ffffff");
  sparkle(ctx, half * 0.55, -size * 0.42, size * 0.09, "#ffffff");
  sparkle(ctx, half * 0.9, size * 0.3, size * 0.07, neon);
}

/** Fat, soft, rounded letters with a shine on them — each one blown up on its own. */
function drawBubble(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, r: Rng) {
  const palettes: [string, string, string][] = [
    ["#ff5fb0", "#2a0420", "#ffd1ea"],
    ["#4fe6ff", "#03202e", "#e3fcff"],
    ["#d4ff5a", "#172600", "#f4ffd1"],
    ["#ffb13d", "#2e1100", "#fff0d6"],
  ];
  const [fill, outline, shine] = pick(r, palettes);
  const family = '"Arial Black", "Arial Bold", Anton, sans-serif';
  const chars = [...text];

  // size so the letters, their fat outlines and the gaps between them all fit
  let size = Math.floor(h * 0.5);
  const spacing = () => size * 0.12;
  const measure = () => {
    ctx.font = `900 ${size}px ${family}`;
    return chars.reduce((n, ch) => n + ctx.measureText(ch).width, 0) + spacing() * (chars.length - 1);
  };
  while (measure() > w * 0.78 && size > 18) size -= 3;
  ctx.font = `900 ${size}px ${family}`;
  ctx.textBaseline = "alphabetic";
  const probe = ctx.measureText("H");
  const cy = (probe.actualBoundingBoxAscent - probe.actualBoundingBoxDescent) / 2;

  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing() * (chars.length - 1);
  let x = -total / 2;
  const placed = chars.map((ch, i) => {
    const p = { ch, x: x + widths[i] / 2, y: cy + Math.sin(i * 1.3 + r() * 2) * size * 0.05, rot: rand(r, -0.08, 0.08) };
    x += widths[i] + spacing();
    return p;
  });

  ctx.rotate(rand(r, -0.05, 0.03));
  const eachLetter = (fn: (p: (typeof placed)[number]) => void) => {
    for (const p of placed) {
      if (p.ch === " ") continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      fn(p);
      ctx.restore();
    }
  };

  // soft shadow on the wall, all at once so it pools under the word
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 26;
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = size * 0.26;
  eachLetter((p) => {
    ctx.strokeText(p.ch, size * 0.05, size * 0.08);
  });
  ctx.restore();

  // Letter by letter, left to right, so each one sits on top of the one before
  // — the overlap is what makes a row of letters read as inflated.
  eachLetter((p) => {
    ctx.lineWidth = size * 0.24;
    ctx.strokeStyle = outline;
    ctx.strokeText(p.ch, 0, 0);
    ctx.lineWidth = size * 0.1;
    ctx.strokeStyle = fill;
    ctx.strokeText(p.ch, 0, 0);
    const g = ctx.createLinearGradient(0, -size * 0.75, 0, size * 0.05);
    g.addColorStop(0, shine);
    g.addColorStop(0.35, fill);
    g.addColorStop(1, fill);
    ctx.fillStyle = g;
    ctx.fillText(p.ch, 0, 0);
    // the shine
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffffff";
    const wdt = ctx.measureText(p.ch).width;
    ctx.beginPath();
    ctx.ellipse(-wdt * 0.22, -size * 0.56, size * 0.035, size * 0.075, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-wdt * 0.22 + size * 0.04, -size * 0.44, size * 0.018, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  speckle(ctx, w, h, r, fill, 110, 0.9);
}

/** One colour through a cut card: crisp letters, a bridge through them, soft overspray round the edge. */
function drawStencil(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, r: Rng) {
  const colour = pick(r, ["#f6f1e8", "#c8ff32", "#ff2f86", "#22e0ff", "#ffc542"]);
  const size = fitFont(ctx, text, w * 0.72, h * 0.5);
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(text);
  const width = m.width;
  const asc = m.actualBoundingBoxAscent;
  const desc = m.actualBoundingBoxDescent;
  // baseline placed so the glyphs themselves are centred, not the em box
  const baseY = (asc - desc) / 2;
  const top = baseY - asc;
  const bottom = baseY + desc;
  const glyphH = bottom - top;

  // the letters on their own layer, so the bridge can be cut out of them
  const layer = canvas(w, h);
  const lc = layer.getContext("2d")!;
  lc.translate(w / 2, h / 2);
  lc.font = ctx.font;
  lc.textAlign = "center";
  lc.textBaseline = "alphabetic";
  lc.shadowColor = colour;
  lc.shadowBlur = 8;
  lc.fillStyle = colour;
  lc.fillText(text, 0, baseY);
  lc.shadowBlur = 0;
  lc.globalCompositeOperation = "destination-out";
  const bridge = Math.max(3, glyphH * 0.07);
  lc.fillRect(-w / 2, top + glyphH * 0.46, w, bridge);

  // the card the letters were cut from, sprayed round its edge
  const padX = size * 0.2;
  const padY = glyphH * 0.28;
  const bx = -width / 2 - padX;
  const by = top - padY;
  const bw = width + padX * 2;
  const bh = glyphH + padY * 2;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.28;
  ctx.shadowColor = colour;
  ctx.shadowBlur = 22;
  ctx.lineWidth = Math.max(6, size * 0.05);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.restore();

  ctx.drawImage(layer, -w / 2, -h / 2);

  // runs where it went on too heavy
  ctx.save();
  ctx.fillStyle = colour;
  for (let i = 0; i < 6; i++) {
    const x = rand(r, -width / 2, width / 2);
    const len = rand(r, glyphH * 0.08, glyphH * 0.32);
    const dw = rand(r, 2, 5);
    ctx.globalAlpha = rand(r, 0.5, 0.9);
    ctx.fillRect(x, bottom - 2, dw, len);
    ctx.beginPath();
    ctx.arc(x + dw / 2, bottom - 2 + len, dw * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  speckle(ctx, w, h, r, colour, 320, 0.95);

  // the district, cut into the same card under the name
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = colour;
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(12, Math.round(size * 0.11))}px ui-monospace, Menlo, monospace`;
  ctx.fillText("· ARC DISTRICT ·", 0, by + bh + Math.max(14, size * 0.12));
  ctx.restore();
}

/* ── ready-made pieces, for players who don't want to upload anything ────── */

const WORDS = ["NEON", "ARC", "VOLT", "HAZE", "RIOT", "DUSK", "WALLS", "FLUX", "KING"];
const PALETTES: [string, string, string][] = [
  ["#c8ff32", "#0b1a05", "#ff2f86"],
  ["#ff2f86", "#1b0616", "#22e0ff"],
  ["#22e0ff", "#04141c", "#c8ff32"],
  ["#ff8b3d", "#1c0d04", "#ffe14d"],
  ["#ffe14d", "#160f02", "#ff2f86"],
  ["#f6f1e8", "#0a0710", "#22e0ff"],
];

/**
 * What the Carmine Kings have already put up on this block. Their own words in
 * their own colours: the ambient tags used to come out of the same two lists as
 * the player's ready-mades, so the piece you had just painted could turn out to
 * be the same word, in the same style, as the tag on the next wall along.
 */
const RIVAL_WORDS = ["CARMINE", "KINGS", "CK", "CRWN", "OATH", "SPADE", "VENOM", "RUIN"];
const RIVAL_PALETTES: [string, string, string][] = [
  ["#e01e37", "#170203", "#ff5470"],
  ["#ff5470", "#1a0508", "#e01e37"],
  ["#c8102e", "#140204", "#ff8fa3"],
  ["#f6f1e8", "#1a0206", "#e01e37"],
];

/** A spray-can throw-up on a transparent canvas, in the player's palette. */
export function stockPiece(seed: number, w = 900, h = 460): string {
  return throwUp(seed, w, h, WORDS, PALETTES);
}

/** The same hand, on the other side of the beef. */
export function rivalTag(seed: number, w = 700, h = 360): string {
  return throwUp(seed, w, h, RIVAL_WORDS, RIVAL_PALETTES);
}

function throwUp(
  seed: number,
  w: number,
  h: number,
  words: string[],
  palettes: [string, string, string][],
): string {
  const r = mulberry32(Math.imul(seed, 2654435761));
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  const [fill, outline, halo] = pick(r, palettes);
  const word = pick(r, words);

  ctx.translate(w / 2, h / 2);
  ctx.rotate(rand(r, -0.09, 0.09));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let size = Math.floor(h * 0.62);
  const setFont = () => {
    ctx.font = `${size}px Anton, Impact, "Arial Black", sans-serif`;
  };
  setFont();
  while (ctx.measureText(word).width > w * 0.82 && size > 20) {
    size -= 6;
    setFont();
  }

  // halo glow
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.shadowColor = halo;
  ctx.shadowBlur = 46;
  ctx.fillStyle = halo;
  ctx.fillText(word, 0, 0);
  ctx.restore();

  // drips, drawn behind the letters
  ctx.save();
  ctx.fillStyle = fill;
  const width = ctx.measureText(word).width;
  for (let i = 0; i < 7; i++) {
    const x = rand(r, -width / 2, width / 2);
    const len = rand(r, 20, h * 0.3);
    const dw = rand(r, 5, 13);
    ctx.fillRect(x, size * 0.18, dw, len);
    ctx.beginPath();
    ctx.arc(x + dw / 2, size * 0.18 + len, dw / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // hard outline + fill
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = outline;
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(word, 0, 0);

  // highlight
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(word, -3, -4);
  ctx.restore();

  // overspray speckle
  ctx.save();
  ctx.fillStyle = fill;
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = rand(r, 0.05, 0.35);
    ctx.beginPath();
    ctx.arc(rand(r, -w / 2, w / 2), rand(r, -h / 2, h / 2), rand(r, 0.6, 2.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  return c.toDataURL("image/png");
}
