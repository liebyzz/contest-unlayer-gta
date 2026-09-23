/**
 * Start fetching the Unlayer editor before anyone asks for it.
 *
 * `<ImageEditor>` loads its embed script on mount, and the embed then pulls a
 * versioned editor bundle of about a megabyte from Unlayer's CDN. Mounted cold,
 * that is the first press of E on a fresh visit spent watching "Shaking the
 * can…" — the one moment in the game that should feel instant. The briefing
 * runs for eighteen seconds with nothing else on the network, so the download
 * goes there.
 *
 * This leans on how the wrapper's loader behaves: it resolves at once when
 * `window.ImageEditor` already exists, and waits on a matching script tag that
 * is still loading rather than adding a second one. A tag that fails is
 * removed, so the studio's own attempt starts clean instead of waiting thirty
 * seconds on a request that is never coming back.
 */
const EMBED_URL = "https://cdn.unlayer.com/image-editor/embed.js";

let started = false;

export function warmEditor() {
  if (started || typeof window === "undefined") return;
  started = true;

  if (window.ImageEditor) {
    void window.ImageEditor.load().catch(() => {});
    return;
  }

  const tag = document.createElement("script");
  tag.src = EMBED_URL;
  tag.async = true;
  tag.addEventListener(
    "load",
    () => {
      void window.ImageEditor?.load().catch(() => {});
    },
    { once: true },
  );
  tag.addEventListener(
    "error",
    () => {
      tag.remove();
      started = false;
    },
    { once: true },
  );
  document.head.appendChild(tag);
}
