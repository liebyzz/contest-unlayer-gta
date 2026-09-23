/**
 * Per-frame player data lives outside React.
 *
 * The HUD minimap and the interaction check need the player's transform every
 * frame; pushing that through zustand would re-render the whole UI 60 times a
 * second. This is a plain mutable singleton the render loop writes and anyone
 * else reads.
 */
import { SPAWN } from "./city";

export const playerState = {
  x: SPAWN.x,
  z: SPAWN.z,
  /** direction the character is facing */
  yaw: SPAWN.yaw,
  /** direction the camera is looking */
  camYaw: SPAWN.yaw,
  /** camera elevation, radians — positive means the camera sits above */
  camPitch: 0.26,
  speed: 0,
  running: false,
  /**
   * Closest graffiti spot, whether or not it's in range. Only this one lights
   * its beam at full strength — four spots share the alley and lighting them
   * all at once turns it into green fog.
   */
  nearestSpotId: null as string | null,
};

export function resetPlayerState() {
  playerState.x = SPAWN.x;
  playerState.z = SPAWN.z;
  playerState.yaw = SPAWN.yaw;
  playerState.camYaw = SPAWN.yaw;
  playerState.camPitch = 0.26;
  playerState.speed = 0;
  playerState.running = false;
}
