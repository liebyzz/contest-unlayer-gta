/**
 * The piece, as it was made.
 *
 * The studio already flattens the editor's canvas every time the hand comes to
 * rest — that is what keeps the live street view up to date. Each of those
 * flattenings is one step of the work: the bare shutter, the tag dropped on it,
 * the first stroke of spray, the text layer, the filter. Kept, in order, they
 * are a stop-motion film of the piece being painted in the Unlayer editor.
 *
 * Three things are built from them:
 *
 * - the reveal plays them on the wall itself, in the street, before the finished
 *   piece lands (`components/game/GraffitiSpot.tsx`);
 * - the black book has a TIME-LAPSE face that flips through them;
 * - and it will film that flipbook, with a title card and the street photograph
 *   at the end, as a video file to keep (`recordTimelapse`).
 *
 * Frames are small JPEGs. They are the process, not the artwork — the full-size
 * canvas is kept separately — and a whole book of them has to fit in IndexedDB.
 */

/** Width of one stored step. Small enough to keep dozens, big enough for a video. */
const FRAME_WIDTH = 640;
/** Steps kept with a finished piece. Long sessions are thinned evenly down to this. */
export const PROCESS_MAX = 32;
/** Fewer distinct steps than this and there is nothing to replay — the piece just sprays on. */
export const STOP_MOTION_MIN_FRAMES = 3;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** One step of the process: the flattened canvas, shrunk to a small JPEG. */
export async function shrinkFrame(src: string, width = FRAME_WIDTH): Promise<string | null> {
  const img = await loadImage(src);
  if (!img || !img.naturalWidth) return null;
  const w = Math.min(width, img.naturalWidth);
  const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.8);
}

/** Evenly thin a run of steps to `max`, always keeping where it started and where it ended. */
export function sampleFrames<T>(frames: T[], max = PROCESS_MAX): T[] {
  if (frames.length <= max) return frames.slice();
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    out.push(frames[Math.round((i * (frames.length - 1)) / (max - 1))]);
  }
  return out;
}

/**
 * How long each step holds when the reveal replays it on the wall.
 *
 * Quick enough to read as motion rather than a slideshow, and never longer
 * than about two seconds in all: the reveal photographs the finished wall three
 * seconds in, and the last step has to have landed well before the shutter.
 */
export function stopMotionTiming(count: number) {
  const frameDur = Math.min(0.26, Math.max(0.075, 1.9 / Math.max(1, count)));
  return { frameDur, total: frameDur * count };
}

/**
 * Records the steps as a stop-motion film, one call per settled canvas.
 *
 * Shrinking a frame is asynchronous and the canvas keeps changing, so every
 * call joins a queue: the steps land in the order they happened.
 */
export function createProcessRecorder(onStep?: (steps: number) => void, limit = PROCESS_MAX * 3) {
  const frames: string[] = [];
  let lastSource: string | null = null;
  let queue: Promise<void> = Promise.resolve();

  return {
    record(src: string | null | undefined) {
      if (!src || src.length < 64 || src === lastSource) return queue;
      lastSource = src;
      queue = queue.then(async () => {
        const frame = await shrinkFrame(src);
        if (!frame || frame === frames[frames.length - 1]) return;
        frames.push(frame);
        onStep?.(frames.length);
        // a very long session: keep the shape of it, not every step
        if (frames.length > limit) {
          const thinned = sampleFrames(frames, Math.ceil(limit / 2));
          frames.length = 0;
          frames.push(...thinned);
        }
      });
      return queue;
    },
    /** Every step so far, thinned for keeping — once the queue has caught up. */
    async finish(): Promise<string[]> {
      await queue;
      return sampleFrames(frames);
    },
  };
}

/* ── the film ────────────────────────────────────────────────────────────── */

const INK = "#07050c";
const PAPER = "#f6f1e8";
const ASH = "#a498b8";
const ACID = "#c8ff32";
const MAGENTA = "#ff2f86";
const DISPLAY = 'Anton, Impact, "Arial Narrow", sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, monospace';
const MARKER = '"Permanent Marker", "Comic Sans MS", cursive';

export interface TimelapseInput {
  frames: string[];
  /** the piece photographed in the street, if the reveal got one */
  wallShot?: string;
  spotName: string;
  district: string;
  tag: string;
}

export interface VideoFormat {
  mime: string;
  ext: "mp4" | "webm";
}

/**
 * The best container this browser can record into. MP4 first, because that is
 * the one every phone and every social site will take without complaint.
 */
export function videoFormat(): VideoFormat | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates: VideoFormat[] = [
    { mime: "video/mp4;codecs=avc1.42E01E", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9", ext: "webm" },
    { mime: "video/webm;codecs=vp8", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {
      /* some implementations throw on codecs they have never heard of */
    }
  }
  return null;
}

const W = 1280;
const H = 720;
const FPS = 30;

function ease(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function ground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, H * 1.1);
  wash.addColorStop(0, "rgba(92,26,86,0.55)");
  wash.addColorStop(0.55, "rgba(28,14,40,0.35)");
  wash.addColorStop(1, "rgba(7,5,12,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
}

/** Where a step sits on the card: as big as it goes, above the caption strip. */
function stage(img: HTMLImageElement) {
  const maxW = W - 120;
  const maxH = H - 210;
  const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  return { x: (W - w) / 2, y: 70 + (maxH - h) / 2, w, h };
}

/**
 * Films the flipbook as a video: a title card, every step, a beat on the
 * finished piece, and the photograph of it in the street to close.
 *
 * MediaRecorder only records in real time, so this takes as long as the film
 * runs — about eight seconds. Pass a canvas to watch it being made.
 */
export async function recordTimelapse(
  input: TimelapseInput,
  opts: { canvas?: HTMLCanvasElement; onProgress?: (p: number) => void } = {},
): Promise<{ blob: Blob; ext: VideoFormat["ext"] } | null> {
  const format = videoFormat();
  if (!format || input.frames.length === 0) return null;

  try {
    await document.fonts?.ready;
  } catch {
    /* the fallback faces are close enough */
  }

  const loaded = await Promise.all(input.frames.map(loadImage));
  const frames = loaded.filter((f): f is HTMLImageElement => Boolean(f));
  if (frames.length === 0) return null;
  const street = input.wallShot ? await loadImage(input.wallShot) : null;

  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") return null;

  const TITLE = 1.4;
  const step = Math.min(0.5, Math.max(0.16, 4.4 / frames.length));
  const PROCESS = step * frames.length;
  const HOLD = 1.5;
  const STREET = street ? 2.6 : 0;
  const total = TITLE + PROCESS + HOLD + STREET;

  const draw = (t: number) => {
    ground(ctx);
    ctx.textBaseline = "alphabetic";

    if (t < TITLE) {
      const a = ease(t / 0.5) * (1 - ease((t - TITLE + 0.25) / 0.25));
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.fillStyle = ACID;
      ctx.font = `600 20px ${MONO}`;
      ctx.fillText("N E O N   W A L L S   ·   T I M E - L A P S E", W / 2, 250);
      ctx.fillStyle = PAPER;
      ctx.font = `124px ${DISPLAY}`;
      ctx.save();
      ctx.translate(W / 2, 400);
      ctx.transform(1, 0, -0.09, 1, 0, 0);
      ctx.fillText(input.spotName.toUpperCase(), 0, 0);
      ctx.restore();
      ctx.fillStyle = MAGENTA;
      ctx.font = `44px ${MARKER}`;
      ctx.fillText(`a piece by ${input.tag}`, W / 2, 478);
      ctx.fillStyle = ASH;
      ctx.font = `18px ${MONO}`;
      ctx.fillText(input.district.toUpperCase(), W / 2, 530);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      return;
    }

    const inProcess = t < TITLE + PROCESS;
    const index = inProcess
      ? Math.min(frames.length - 1, Math.floor((t - TITLE) / step))
      : frames.length - 1;

    // the finished piece stays underneath while the street photograph fades up over it
    if (!street || t < TITLE + PROCESS + HOLD + 0.5) {
      const img = frames[index];
      const box = stage(img);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16);
      ctx.drawImage(img, box.x, box.y, box.w, box.h);
      ctx.strokeStyle = "rgba(246,241,232,0.16)";
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16);

      // the step counter and a tick for every step
      const barY = H - 104;
      const barW = W - 120;
      const gap = frames.length > 20 ? 3 : 6;
      const seg = (barW - gap * (frames.length - 1)) / frames.length;
      for (let i = 0; i < frames.length; i++) {
        ctx.fillStyle = i <= index ? ACID : "rgba(246,241,232,0.14)";
        ctx.fillRect(60 + i * (seg + gap), barY, seg, 5);
      }
      ctx.fillStyle = PAPER;
      ctx.font = `34px ${DISPLAY}`;
      ctx.fillText(input.spotName.toUpperCase(), 60, H - 44);
      ctx.textAlign = "right";
      ctx.fillStyle = inProcess ? ACID : PAPER;
      ctx.font = `600 18px ${MONO}`;
      // step 0 is the surface the editor opened on, not something the writer did
      const label = !inProcess
        ? "FINISHED"
        : index === 0
          ? "WHERE IT STARTED"
          : `STEP ${index} / ${frames.length - 1}`;
      ctx.fillText(label, W - 60, H - 64);
      ctx.fillStyle = ASH;
      ctx.font = `15px ${MONO}`;
      ctx.fillText("MADE IN @unlayer/react-image-editor", W - 60, H - 40);
      ctx.textAlign = "left";

      // the finished piece gets a flash and a stamp
      if (!inProcess) {
        const h = t - TITLE - PROCESS;
        const flash = Math.max(0, 1 - h / 0.35);
        if (flash > 0) {
          ctx.fillStyle = `rgba(214,255,90,${flash * 0.45})`;
          ctx.fillRect(0, 0, W, H);
        }
        const pop = Math.min(1, h / 0.22);
        ctx.save();
        ctx.translate(box.x + box.w - 40, box.y + 46);
        ctx.rotate(-0.12);
        ctx.scale(1.6 - pop * 0.6, 1.6 - pop * 0.6);
        ctx.globalAlpha = pop;
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(7,5,12,0.82)";
        ctx.fillRect(-268, -42, 280, 58);
        ctx.fillStyle = ACID;
        ctx.font = `44px ${DISPLAY}`;
        ctx.fillText("ON THE WALL", 0, 4);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
      }
    }

    if (street && t >= TITLE + PROCESS + HOLD) {
      const s = t - TITLE - PROCESS - HOLD;
      const a = ease(s / 0.45);
      // a slow push into the photograph
      const zoom = 1.04 + (s / STREET) * 0.06;
      const scale = Math.max(W / street.naturalWidth, H / street.naturalHeight) * zoom;
      const sw = street.naturalWidth * scale;
      const sh = street.naturalHeight * scale;
      ctx.globalAlpha = a;
      ctx.drawImage(street, (W - sw) / 2, (H - sh) / 2, sw, sh);
      const shade = ctx.createLinearGradient(0, H * 0.55, 0, H);
      shade.addColorStop(0, "rgba(7,5,12,0)");
      shade.addColorStop(1, "rgba(7,5,12,0.88)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = ACID;
      ctx.font = `600 17px ${MONO}`;
      ctx.fillText(`IN THE STREET  ·  A PIECE BY ${input.tag}`, 60, H - 116);
      ctx.fillStyle = PAPER;
      ctx.font = `76px ${DISPLAY}`;
      ctx.fillText(input.spotName.toUpperCase(), 60, H - 44);
      ctx.textAlign = "right";
      ctx.fillStyle = ASH;
      ctx.font = `16px ${MONO}`;
      ctx.fillText(input.district.toUpperCase(), W - 60, H - 48);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  };

  draw(0);
  const stream = canvas.captureStream(FPS);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: format.mime,
      videoBitsPerSecond: 6_000_000,
    });
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    // a timer rather than requestAnimationFrame: the film keeps going if the
    // tab loses focus for a moment, instead of freezing on one frame
    const id = window.setInterval(() => {
      const t = (performance.now() - start) / 1000;
      draw(Math.min(t, total));
      opts.onProgress?.(Math.min(1, t / total));
      if (t >= total + 0.15) {
        window.clearInterval(id);
        resolve();
      }
    }, 1000 / FPS);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());

  if (chunks.length === 0) return null;
  return { blob: new Blob(chunks, { type: format.mime.split(";")[0] }), ext: format.ext };
}
