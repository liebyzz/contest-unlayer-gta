"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { SPOT_BY_ID } from "@/lib/graffiti/spots";
import { playerState } from "@/lib/game/playerState";
import { requestPhoto } from "@/lib/game/photo";
import { REVEAL_FOV, revealFraming } from "@/lib/game/revealShot";
import { bindWallPreview, wallPreview } from "@/lib/game/wallPreview";

/** Trim the vignette off the edges; the card shows it 16:10. */
const CROP = { x: 0.05, y: 0.06, w: 0.9, h: 0.88 };

/**
 * Serves the studio's live street view (see `lib/game/wallPreview.ts`).
 *
 * Priority 0.5: after the follow camera has placed itself for the frame
 * (priority 0), so this can take the lens for one frame, and before the
 * composer draws (priority 1) and the grab is served (priority 2). The camera
 * is put back in the grab's callback, before anything else can see it.
 */
export function WallPreviewRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => bindWallPreview(() => invalidate()), [invalidate]);

  useFrame(() => {
    const job = wallPreview.job;
    if (!job) return;
    wallPreview.job = null;

    const spot = SPOT_BY_ID.get(job.spotId);
    if (!spot || useGraffiti.getState().phase !== "editor") {
      job.done(null);
      return;
    }

    const saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
    };
    const shot = revealFraming(spot, 1, playerState.x, playerState.z);
    camera.position.set(...shot.position);
    camera.lookAt(...shot.target);
    camera.fov = REVEAL_FOV;
    camera.updateProjectionMatrix();
    wallPreview.framing = true;

    requestPhoto(
      (url) => {
        wallPreview.framing = false;
        camera.position.copy(saved.position);
        camera.quaternion.copy(saved.quaternion);
        camera.fov = saved.fov;
        camera.updateProjectionMatrix();
        job.done(url);
      },
      { crop: CROP, width: 960, quality: 0.86 },
    );
  }, 0.5);

  return null;
}
