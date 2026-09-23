/**
 * Taking the work home.
 *
 * The whole game is about making a picture and putting it somewhere. Until now
 * the somewhere was a wall in a session that ends when the tab closes, which is
 * a strange place to leave fourteen deliberate pieces of artwork — especially
 * in a contest about an image editor.
 *
 * Two ways out: a single piece straight off the wall, and a contact sheet of
 * the whole session laid out as a poster. Both are drawn on a canvas here and
 * handed to the browser as a download; nothing leaves the machine.
 */
import type { GraffitiSpot, PaintedPiece } from "./graffitiTypes";

const INK = "#07050c";
const PAPER = "#f6f1e8";
const ASH = "#a498b8";
const ACID = "#c8ff32";

const DISPLAY = 'Anton, Impact, "Arial Narrow", sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, monospace';

/**
 * Put a picture on the clipboard, ready to paste into a chat or a post.
 *
 * Browsers only take PNG there, and the street photographs are JPEG, so
 * everything is redrawn through a canvas first. Resolves false where the
 * clipboard is not available (an insecure origin, an older browser).
 */
export async function copyImage(dataUrl: string): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    const img = await loadImage(dataUrl);
    if (!img) return false;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Kick a data URL out to the file system under a sensible name. */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** `24H Bodega` → `neon-walls-24h-bodega.png` */
export function pieceFilename(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `neon-walls-${slug || "piece"}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** `drawImage` with `object-fit: cover` semantics. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Trim a label to the available width with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
}

export interface SheetStats {
  /** the writer's tag — the book is theirs */
  tag: string;
  rank: string;
  rep: number;
  totalRep: number;
  count: number;
  total: number;
}

/**
 * The session as one shareable image.
 *
 * Only the walls that were actually hit go on it — a poster that is mostly
 * empty slots tells the wrong story, and the header carries the count anyway.
 */
export async function buildContactSheet(
  spots: GraffitiSpot[],
  painted: Record<string, PaintedPiece>,
  stats: SheetStats,
): Promise<string | null> {
  const hit = spots.filter((s) => painted[s.id]);
  if (hit.length === 0) return null;

  // Canvas text only picks up a webfont once it has actually loaded; without
  // this the poster falls back to Impact on the first export of a session.
  try {
    await document.fonts?.ready;
  } catch {
    /* not fatal — the fallback stack is chosen to be close */
  }

  const cols = hit.length <= 2 ? hit.length : hit.length <= 4 ? 2 : hit.length <= 9 ? 3 : 4;
  const rows = Math.ceil(hit.length / cols);

  const PAD = 72;
  const GAP = 26;
  const HEAD = 250;
  const FOOT = 112;
  const CAPTION = 76;

  const width = 1680;
  const tileW = Math.floor((width - PAD * 2 - GAP * (cols - 1)) / cols);
  const tileH = Math.round(tileW * 0.625) + CAPTION;
  const height = HEAD + rows * tileH + (rows - 1) * GAP + FOOT;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  /* ── ground ──────────────────────────────────────────────────────────── */
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width, height);

  // the same bruised wash the menus sit on, so the poster reads as the game
  const wash = ctx.createRadialGradient(width * 0.5, 0, 0, width * 0.5, 0, height * 0.95);
  wash.addColorStop(0, "rgba(92,26,86,0.5)");
  wash.addColorStop(0.55, "rgba(28,14,40,0.34)");
  wash.addColorStop(1, "rgba(7,5,12,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  /* ── header ──────────────────────────────────────────────────────────── */
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ACID;
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText("N E O N   W A L L S   ·   A R C   D I S T R I C T", PAD, 88);

  ctx.fillStyle = PAPER;
  ctx.font = `112px ${DISPLAY}`;
  ctx.fillText("THE BLACK BOOK", PAD, 188);

  ctx.fillStyle = ASH;
  ctx.font = `22px ${MONO}`;
  const byline = "BY ";
  ctx.fillText(byline, PAD, 226);
  const bylineW = ctx.measureText(byline).width;
  ctx.fillStyle = ACID;
  ctx.font = `600 22px ${MONO}`;
  ctx.fillText(stats.tag, PAD + bylineW, 226);
  const tagW = ctx.measureText(stats.tag).width;
  ctx.fillStyle = ASH;
  ctx.font = `22px ${MONO}`;
  ctx.fillText(
    `  ·  ${stats.count} OF ${stats.total} WALLS  ·  ${stats.rep}/${stats.totalRep} REP`,
    PAD + bylineW + tagW,
    226,
  );

  // rank, ranged right and sitting on the same eyebrow line as the district
  ctx.textAlign = "right";
  ctx.fillStyle = ASH;
  ctx.font = `600 18px ${MONO}`;
  ctx.fillText("R A N K", width - PAD, 88);
  ctx.fillStyle = ACID;
  ctx.font = `62px ${DISPLAY}`;
  ctx.fillText(stats.rank, width - PAD, 162);
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(246,241,232,0.14)";
  ctx.fillRect(PAD, HEAD - 34, width - PAD * 2, 2);

  /* ── the pieces ──────────────────────────────────────────────────────── */
  const images = await Promise.all(
    // The street photograph makes the better poster — it is the piece where
    // the player put it, at night, in the weather — so prefer it and fall back
    // to the editor's flat canvas when a grab never landed.
    hit.map((s) => loadImage(painted[s.id]!.wallShot ?? painted[s.id]!.graffitiTexture)),
  );

  for (let i = 0; i < hit.length; i++) {
    const spot = hit[i];
    const img = images[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (tileW + GAP);
    const y = HEAD + row * (tileH + GAP);
    const artH = tileH - CAPTION;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, tileW, artH);

    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, tileW, artH);
      ctx.clip();
      drawCover(ctx, img, x, y, tileW, artH);
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(200,255,50,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, tileW - 2, artH - 2);

    ctx.fillStyle = PAPER;
    ctx.font = `34px ${DISPLAY}`;
    ctx.fillText(fit(ctx, spot.name.toUpperCase(), tileW - 96), x, y + artH + 40);

    ctx.fillStyle = ASH;
    ctx.font = `17px ${MONO}`;
    ctx.fillText(fit(ctx, spot.district, tileW - 96), x, y + artH + 64);

    ctx.textAlign = "right";
    ctx.fillStyle = ACID;
    ctx.font = `19px ${MONO}`;
    ctx.fillText(`+${spot.rep}`, x + tileW, y + artH + 40);
    ctx.textAlign = "left";
  }

  /* ── footer ──────────────────────────────────────────────────────────── */
  const fy = height - FOOT + 46;
  ctx.fillStyle = "rgba(246,241,232,0.14)";
  ctx.fillRect(PAD, fy - 34, width - PAD * 2, 2);

  ctx.fillStyle = ASH;
  ctx.font = `19px ${MONO}`;
  ctx.fillText("EVERY PIECE MADE IN @unlayer/react-image-editor", PAD, fy + 6);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(164,152,184,0.7)";
  ctx.font = `19px ${MONO}`;
  ctx.fillText(new Date().toLocaleDateString(), width - PAD, fy + 6);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}
