"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { input } from "@/lib/game/input";
import { warmCity } from "@/lib/game/preload";
import { warmEditor } from "@/lib/graffiti/editorWarmup";
import { MainMenu } from "./ui/MainMenu";
import { HowToPlay } from "./ui/HowToPlay";
import { GameHUD } from "./ui/GameHUD";
import { InteractionPrompt } from "./ui/InteractionPrompt";
import { Notifications } from "./ui/Notifications";
import { RevealSequence } from "./ui/RevealSequence";
import { LocationCard } from "./ui/LocationCard";
import { CombatHUD, WastedOverlay } from "./ui/CombatHUD";
import { IntroTrailer } from "./ui/IntroTrailer";
import { PieceGallery } from "./ui/PieceGallery";
import { PhotoMode } from "./ui/PhotoMode";
import { TourOverlay } from "./ui/TourOverlay";

const Game = dynamic(() => import("./game/Game"), { ssr: false });
const GraffitiStudio = dynamic(() => import("./editor/GraffitiStudio"), { ssr: false });

/**
 * "Click to look" nudge.
 *
 * It used to hang around for as long as the pointer was unlocked, which meant
 * that anyone playing with the click-drag fallback — or any browser that
 * refuses pointer lock — had a label parked across the middle of the screen for
 * the whole session, including inside the viewfinder. It is a tutorial, so it
 * retires the moment the player has actually looked around or taken a step.
 */
function PointerHint() {
  const phase = useGraffiti((s) => s.phase);
  const arrived = useGraffiti((s) => s.arrived);
  const photoMode = useGraffiti((s) => s.photoMode);
  const galleryOpen = useGraffiti((s) => s.galleryOpen);
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    if (engaged) return;
    const id = window.setInterval(() => {
      if (input.engaged || input.pointerLocked) setEngaged(true);
    }, 200);
    return () => window.clearInterval(id);
  }, [engaged]);

  if (phase !== "playing" || !arrived || photoMode || galleryOpen || engaged) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[22%] z-20 flex justify-center">
      <span className="hud-panel corner-cut mono anim-pulse px-4 py-2 text-[10px] text-ash">
        CLICK TO LOOK AROUND · WASD TO WALK
      </span>
    </div>
  );
}

export default function NeonWalls() {
  const phase = useGraffiti((s) => s.phase);
  const activeSpotId = useGraffiti((s) => s.activeSpotId);
  const [entered, setEntered] = useState(false);
  /**
   * The city goes up behind the briefing, not after it. The phone rings for a
   * second and a half before Vance speaks, and that is when the canvas mounts
   * and draws its first frame — so the cut out of the briefing lands on a
   * street that is already built rather than on a black screen.
   */
  const [cityMounted, setCityMounted] = useState(false);
  // latched: once built it stays built
  if (!cityMounted && phase !== "menu" && phase !== "howto") setCityMounted(true);

  // Fetch and evaluate the engine while the menu sits idle, so mounting it
  // later costs the build and not the download.
  useEffect(() => {
    const load = () => void import("./game/Game").catch(() => {});
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(load, { timeout: 2500 });
      return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(load, 1200);
    return () => window.clearTimeout(t);
  }, []);
  const [veil, setVeil] = useState(false);
  const arrived = useRef(false);

  // Draw the city's textures while the menu and briefing are on screen, so
  // the cut into the street is not a second and a half of black.
  useEffect(() => warmCity(), []);

  // The studio's code and Unlayer's editor bundle download during the
  // briefing, so the first E is not spent on a loading spinner.
  useEffect(() => {
    if (phase === "menu" || phase === "howto") return;
    warmEditor();
    void import("./editor/GraffitiStudio").catch(() => {});
  }, [phase]);

  // bring back whatever was left on the walls last time
  useEffect(() => {
    void useGraffiti.getState().hydrate();
  }, []);

  useEffect(() => {
    if (phase !== "entering" || arrived.current) return;
    arrived.current = true;
    setVeil(true);
    setEntered(true);
    const t = setTimeout(() => setVeil(false), 620);
    return () => clearTimeout(t);
  }, [phase]);



  return (
    <main className="relative h-full w-full overflow-hidden bg-ink">
      {cityMounted && <Game />}
      {entered && (
        <>
          <div className="vignette pointer-events-none absolute inset-0 z-10" />
          <div className="grain pointer-events-none absolute inset-0 z-10" />
          <GameHUD />
          <CombatHUD />
          <InteractionPrompt />
          <PointerHint />
          <LocationCard />
          <RevealSequence />
          <TourOverlay />
          <WastedOverlay />
          <PieceGallery />
          <PhotoMode />
        </>
      )}

      <Notifications />

      {/* keyed on the spot so every wall opens the studio from scratch */}
      {phase === "editor" && <GraffitiStudio key={activeSpotId ?? "none"} />}

      {phase === "trailer" && <IntroTrailer />}
      {phase === "menu" && <MainMenu />}
      {phase === "howto" && <HowToPlay />}

      {/* the cut from the menu into the city */}
      <div
        className="pointer-events-none absolute inset-0 z-[60] bg-ink transition-opacity duration-[620ms]"
        style={{ opacity: veil ? 1 : 0, visibility: veil ? "visible" : "hidden" }}
      />

    </main>
  );
}
