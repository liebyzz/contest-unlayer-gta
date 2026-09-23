/**
 * Canvas-generated textures for the neighbourhood.
 *
 * A building is a box; everything that makes it *look* like a building —
 * windows, lit rooms, brick courses, floor lines — is painted into a tileable
 * texture here. Cheap to draw once, free to render, and it means the whole
 * city ships with zero image assets.
 */
import * as THREE from "three";
import { CITY_PALETTE, type FacadeStyle } from "./city";

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

function make(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng, n: number, alpha: number) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = rand(r, 0.02, alpha);
    ctx.fillStyle = r() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(rand(r, 0, w), rand(r, 0, h), rand(r, 1, 3), rand(r, 1, 3));
  }
  ctx.restore();
}

/**
 * A normal map derived from a texture's own canvas.
 *
 * Everything in this city is drawn as a flat image — brick courses, window
 * reveals, panel seams, road grain — and a flat image lit by a moving light is
 * precisely what reads as a sticker on a cube. Running a Sobel filter over the
 * albedo turns all of that painted detail into real relief for nothing: mortar
 * lines cut in, window reveals recess, the asphalt gets grain that catches the
 * street lamps.
 *
 * Highlights are flattened off before the gradient is taken, so a lit window
 * dents inwards like a pane instead of bulging out of the wall.
 *
 * Cached against the source canvas: every clone of a texture shares its image,
 * so a whole street of buildings computes this once per facade design.
 */
const normalCache = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>();

export function normalFromTexture(
  tex: THREE.Texture,
  strength = 2.2,
): THREE.CanvasTexture | null {
  const src = tex.image as HTMLCanvasElement | undefined;
  if (!src?.width) return null;
  const hit = normalCache.get(src);
  if (hit) return hit;

  const w = src.width;
  const h = src.height;
  const sctx = src.getContext("2d");
  if (!sctx) return null;
  const px = sctx.getImageData(0, 0, w, h).data;

  const height = new Float32Array(w * h);
  for (let i = 0, p = 0; i < height.length; i++, p += 4) {
    const l = (px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114) / 255;
    height[i] = Math.min(l, 0.55);
  }
  // wrap the lookup so the map tiles as seamlessly as the albedo does
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];

  const [c, ctx] = make(w, h);
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) +
        2 * at(x - 1, y) +
        at(x - 1, y + 1) -
        at(x + 1, y - 1) -
        2 * at(x + 1, y) -
        at(x + 1, y + 1);
      const dy =
        at(x - 1, y - 1) +
        2 * at(x, y - 1) +
        at(x + 1, y - 1) -
        at(x - 1, y + 1) -
        2 * at(x, y + 1) -
        at(x + 1, y + 1);
      let nx = dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      out.data[i] = (nx * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.NoColorSpace;
  map.anisotropy = 4;
  normalCache.set(src, map);
  return map;
}

/** A clone of `source` tiled to match whatever the albedo is doing. */
export function matchRepeat(
  source: THREE.CanvasTexture | null,
  albedo: THREE.Texture,
): THREE.CanvasTexture | null {
  if (!source) return null;
  const t = source.clone();
  t.repeat.copy(albedo.repeat);
  t.offset.copy(albedo.offset);
  t.needsUpdate = true;
  return t;
}

/** One 8 m × 8 m tile of building front: 5 × 5 windows. */
export interface Facade {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

const WINDOW_LIGHTS = ["#ffc98a", "#ffb066", "#ffe3b0", "#9fd8ff", "#ff9ad0", "#cfe9ff"];
const facadeCache = new Map<string, Facade>();

export function facadeTexture(style: FacadeStyle, tint: number): Facade {
  const key = `${style}:${tint}`;
  const hit = facadeCache.get(key);
  if (hit) return hit;

  const S = 512;
  const [cMap, m] = make(S, S);
  const [cEm, e] = make(S, S);
  const r = mulberry32(tint * 977 + style.length * 131 + 17);
  const base = CITY_PALETTE[tint % CITY_PALETTE.length];

  e.fillStyle = "#000000";
  e.fillRect(0, 0, S, S);
  m.fillStyle = base;
  m.fillRect(0, 0, S, S);

  // material detail
  if (style === "brick") {
    const bh = S / 32;
    const bw = bh * 2.6;
    for (let row = 0, y = 0; y < S; row++, y += bh) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < S + bw; x += bw) {
        const v = rand(r, -10, 12);
        m.fillStyle = `rgba(${255 + v},${255 + v},${255 + v},0.06)`;
        m.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
  } else if (style === "panel") {
    for (let i = 0; i <= 4; i++) {
      m.fillStyle = "rgba(0,0,0,0.22)";
      m.fillRect(0, (S / 4) * i - 1, S, 3);
      m.fillStyle = "rgba(255,255,255,0.06)";
      m.fillRect(0, (S / 4) * i + 2, S, 1.5);
    }
    for (let i = 0; i <= 4; i++) {
      m.fillStyle = "rgba(0,0,0,0.16)";
      m.fillRect((S / 4) * i - 1, 0, 2.5, S);
    }
  } else {
    // poured block: broad vertical shading bands
    const g = m.createLinearGradient(0, 0, S, 0);
    g.addColorStop(0, "rgba(255,255,255,0.05)");
    g.addColorStop(0.5, "rgba(0,0,0,0.10)");
    g.addColorStop(1, "rgba(255,255,255,0.04)");
    m.fillStyle = g;
    m.fillRect(0, 0, S, S);
  }

  // floor line every window row
  const cells = 5;
  const cell = S / cells;
  for (let i = 0; i < cells; i++) {
    m.fillStyle = "rgba(0,0,0,0.2)";
    m.fillRect(0, i * cell + cell * 0.94, S, 3);
  }

  // windows
  const ww = cell * 0.52;
  const wh = cell * 0.6;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const x = cx * cell + (cell - ww) / 2;
      const y = cy * cell + cell * 0.14;

      // reveal / frame
      m.fillStyle = "rgba(0,0,0,0.45)";
      m.fillRect(x - 4, y - 4, ww + 8, wh + 8);

      const lit = r() < 0.34;
      const colour = WINDOW_LIGHTS[Math.floor(r() * WINDOW_LIGHTS.length)];

      if (lit) {
        const gg = m.createLinearGradient(x, y, x, y + wh);
        gg.addColorStop(0, colour);
        gg.addColorStop(1, "rgba(120,80,40,0.85)");
        m.fillStyle = gg;
        m.fillRect(x, y, ww, wh);

        e.fillStyle = colour;
        e.globalAlpha = rand(r, 0.55, 1);
        e.fillRect(x, y, ww, wh);
        e.globalAlpha = 1;

        // silhouette of a blind, half drawn
        if (r() < 0.5) {
          const bh2 = wh * rand(r, 0.15, 0.55);
          m.fillStyle = "rgba(0,0,0,0.55)";
          m.fillRect(x, y, ww, bh2);
          e.fillStyle = "#000000";
          e.fillRect(x, y, ww, bh2);
        }
      } else {
        const gg = m.createLinearGradient(x, y, x + ww, y + wh);
        gg.addColorStop(0, "rgba(22,20,30,0.95)");
        gg.addColorStop(1, "rgba(46,44,60,0.9)");
        m.fillStyle = gg;
        m.fillRect(x, y, ww, wh);
      }

      // mullion
      m.fillStyle = "rgba(0,0,0,0.4)";
      m.fillRect(x + ww / 2 - 1.5, y, 3, wh);

      // a couple of air-con boxes
      if (r() < 0.14) {
        m.fillStyle = "rgba(150,150,155,0.55)";
        m.fillRect(x + ww * 0.2, y + wh - 4, ww * 0.6, cell * 0.11);
        e.fillStyle = "#000000";
        e.fillRect(x + ww * 0.2, y + wh - 4, ww * 0.6, cell * 0.11);
      }
    }
  }

  speckle(m, S, S, r, 900, 0.1);

  const map = new THREE.CanvasTexture(cMap);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const emissive = new THREE.CanvasTexture(cEm);
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  emissive.colorSpace = THREE.SRGBColorSpace;

  const facade = { map, emissive };
  facadeCache.set(key, facade);
  return facade;
}

/* ── ground materials ────────────────────────────────────────────────────── */

let asphalt: THREE.CanvasTexture | null = null;
export function asphaltTexture(): THREE.CanvasTexture {
  if (asphalt) return asphalt;
  const S = 512;
  const [c, ctx] = make(S, S);
  const r = mulberry32(4242);
  ctx.fillStyle = "#23222a";
  ctx.fillRect(0, 0, S, S);
  // aggregate
  for (let i = 0; i < 9000; i++) {
    const v = rand(r, 24, 74);
    ctx.fillStyle = `rgba(${v},${v},${v + 6},${rand(r, 0.15, 0.5)})`;
    ctx.fillRect(rand(r, 0, S), rand(r, 0, S), rand(r, 1, 3.4), rand(r, 1, 3.4));
  }
  // tar-sealed cracks
  ctx.strokeStyle = "rgba(10,10,14,0.85)";
  for (let i = 0; i < 12; i++) {
    ctx.lineWidth = rand(r, 1.5, 5);
    let x = rand(r, 0, S);
    let y = rand(r, 0, S);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += rand(r, -60, 60);
      y += rand(r, -60, 60);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // patched repairs
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(40,38,46,${rand(r, 0.25, 0.5)})`;
    ctx.fillRect(rand(r, 0, S), rand(r, 0, S), rand(r, 40, 140), rand(r, 30, 110));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  asphalt = t;
  return t;
}

let concrete: THREE.CanvasTexture | null = null;
export function concreteTexture(): THREE.CanvasTexture {
  if (concrete) return concrete;
  const S = 512;
  const [c, ctx] = make(S, S);
  const r = mulberry32(9111);
  ctx.fillStyle = "#33313a";
  ctx.fillRect(0, 0, S, S);
  // paving slabs, 4 × 4
  const cell = S / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = rand(r, -12, 12);
      ctx.fillStyle = `rgb(${58 + v},${56 + v},${65 + v})`;
      ctx.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
    }
  }
  for (let i = 0; i < 5000; i++) {
    const v = rand(r, 40, 110);
    ctx.fillStyle = `rgba(${v},${v},${v + 8},${rand(r, 0.05, 0.25)})`;
    ctx.fillRect(rand(r, 0, S), rand(r, 0, S), 2, 2);
  }
  // stains
  for (let i = 0; i < 22; i++) {
    const x = rand(r, 0, S);
    const y = rand(r, 0, S);
    const rad = rand(r, 12, 70);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(20,18,24,${rand(r, 0.1, 0.35)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  concrete = t;
  return t;
}

let dirt: THREE.CanvasTexture | null = null;
export function dirtTexture(): THREE.CanvasTexture {
  if (dirt) return dirt;
  const S = 512;
  const [c, ctx] = make(S, S);
  const r = mulberry32(3131);
  ctx.fillStyle = "#3a332b";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 14000; i++) {
    const v = rand(r, 30, 90);
    ctx.fillStyle = `rgba(${v + 18},${v + 8},${v},${rand(r, 0.1, 0.45)})`;
    ctx.fillRect(rand(r, 0, S), rand(r, 0, S), rand(r, 1, 4), rand(r, 1, 4));
  }
  // scattered rubble
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(${rand(r, 90, 140)},${rand(r, 85, 130)},${rand(r, 80, 120)},0.6)`;
    ctx.fillRect(rand(r, 0, S), rand(r, 0, S), rand(r, 3, 9), rand(r, 3, 7));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  dirt = t;
  return t;
}

/* ── neon shop signs ─────────────────────────────────────────────────────── */

const signCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

export function signTexture(text: string, colour: string) {
  const key = `${text}|${colour}`;
  const hit = signCache.get(key);
  if (hit) return hit;

  const W = 1024;
  const H = 256;
  const [c, ctx] = make(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let size = 130;
  const setFont = () => {
    ctx.font = `${size}px Anton, Impact, "Arial Narrow", sans-serif`;
  };
  setFont();
  while (ctx.measureText(text).width > W * 0.88 && size > 30) {
    size -= 6;
    setFont();
  }

  // tube glow, then the bright core
  ctx.shadowColor = colour;
  ctx.shadowBlur = 46;
  ctx.fillStyle = colour;
  ctx.fillText(text, W / 2, H / 2);
  ctx.fillText(text, W / 2, H / 2);
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#fffdf6";
  ctx.fillText(text, W / 2, H / 2);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const out = { texture, aspect: W / H };
  signCache.set(key, out);
  return out;
}

/** Soft radial sprite reused for light pools, lamp haze and spray dust. */
let glow: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const S = 256;
  const [c, ctx] = make(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.42)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glow = t;
  return t;
}

/* ── plywood hoarding around the vacant lot ──────────────────────────────── */
let plank: THREE.CanvasTexture | null = null;
export function plankTexture(): THREE.CanvasTexture {
  if (plank) return plank;
  const S = 512;
  const [c, ctx] = make(S, S);
  const r = mulberry32(5150);
  ctx.fillStyle = "#5b4a3a";
  ctx.fillRect(0, 0, S, S);
  const planks = 8;
  const pw = S / planks;
  for (let i = 0; i < planks; i++) {
    const v = rand(r, -20, 20);
    ctx.fillStyle = `rgb(${100 + v},${80 + v},${60 + v})`;
    ctx.fillRect(i * pw + 2, 0, pw - 4, S);
    ctx.strokeStyle = "rgba(48,36,26,0.28)";
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const x = i * pw + rand(r, 4, pw - 4);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rand(r, -5, 5), S / 3, x + rand(r, -5, 5), (S * 2) / 3, x, S);
      ctx.stroke();
    }
  }
  speckle(ctx, S, S, r, 1400, 0.16);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  plank = t;
  return t;
}
