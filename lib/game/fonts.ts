/**
 * Font readiness for the canvas textures.
 *
 * Every sign, every shop front and all fourteen surface photographs are text
 * drawn onto a 2D canvas. Canvas text is not laid out — it is rasterised with
 * whatever face is loaded at the instant `fillText` runs, and nothing reflows
 * afterwards. Draw a shop sign a beat too early and it is baked in the fallback
 * face, cached under that, and wrong for the rest of the session.
 *
 * `document.fonts.ready` on its own is not enough: it resolves once *pending*
 * loads have settled, and a face nothing has asked for yet is not pending. So
 * the faces are requested explicitly first, then the wait.
 *
 * This is also why the fonts come in through a plain stylesheet link rather
 * than `next/font`: the canvas call sites name `Anton` and `Inter` literally,
 * and `next/font` would rename both to a generated family they could not
 * resolve. It is a deliberate trade, not an oversight.
 */

/** The faces the canvas code draws with, matching the tokens in globals.css. */
const FACES = ['400 16px "Anton"', '400 16px "Inter"', '400 16px "Permanent Marker"'];

let settled: Promise<void> | null = null;

/**
 * Resolves once the display faces are usable, or after `timeoutMs` — a font
 * that never arrives must not cost us the city.
 */
export function fontsReady(timeoutMs = 2500): Promise<void> {
  if (settled) return settled;

  settled = new Promise<void>((resolve) => {
    if (typeof document === "undefined" || !document.fonts) {
      resolve();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);

    Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => undefined)))
      .then(() => document.fonts.ready)
      .then(() => {
        window.clearTimeout(timer);
        finish();
      })
      .catch(() => {
        window.clearTimeout(timer);
        finish();
      });
  });

  return settled;
}
