/**
 * Keyboard + mouse-look, kept outside React for the same reason as
 * `playerState`: it changes every frame and nothing should re-render for it.
 */

export const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
  /** accumulated mouse movement, consumed and zeroed by the camera each frame */
  lookX: 0,
  lookY: 0,
  /** wheel delta for camera distance */
  zoom: 0,
  pointerLocked: false,
  /** true while the player is dragging to look without pointer lock */
  dragging: false,
  /** right mouse held */
  aiming: false,
  /**
   * The browser refused pointer lock, so click-drag is the only way to look.
   * Combat has to stay available in that mode, which is what the two flags
   * below are for.
   */
  lockDenied: false,
  /**
   * Set on the click that captures the pointer so that same click doesn't also
   * loose a round. Read *and cleared* by whoever handles the trigger.
   */
  capturedThisClick: false,
  /** true once the player has looked around or moved at all */
  engaged: false,
};

export function clearInput() {
  input.forward = input.back = input.left = input.right = input.sprint = false;
  input.lookX = input.lookY = input.zoom = 0;
  input.dragging = false;
  input.aiming = false;
  input.capturedThisClick = false;
}

const CODE_MAP: Record<string, keyof typeof input> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
};

export interface InputHandlers {
  onInteract: () => void;
  onEscape: () => void;
  onToggleMute?: () => void;
  onGallery?: () => void;
  onPhoto?: () => void;
  /** allowed to capture keys right now? (false while the studio is open) */
  isActive: () => boolean;
}

/** Wires up window-level listeners. Returns the detach function. */
export function attachInput(handlers: InputHandlers): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      handlers.onEscape();
      return;
    }
    if (!handlers.isActive()) return;

    const slot = CODE_MAP[e.code];
    if (slot) {
      (input[slot] as boolean) = true;
      input.engaged = true;
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (e.code === "KeyE") {
      handlers.onInteract();
      e.preventDefault();
    } else if (e.code === "KeyM") {
      handlers.onToggleMute?.();
    } else if (e.code === "KeyG") {
      handlers.onGallery?.();
      e.preventDefault();
    } else if (e.code === "KeyC") {
      handlers.onPhoto?.();
      e.preventDefault();
    }
  };

  const up = (e: KeyboardEvent) => {
    const slot = CODE_MAP[e.code];
    if (slot) (input[slot] as boolean) = false;
  };

  const blur = () => clearInput();

  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    clearInput();
  };
}

/**
 * Mouse-look on the WebGL canvas: pointer lock, or click-drag as a fallback.
 * Left mouse also captures the pointer; right mouse held is the aim modifier
 * and is handled here so it survives losing focus.
 */
export function attachMouseLook(
  el: HTMLElement,
  isActive: () => boolean,
  onAim?: (down: boolean) => void,
): () => void {
  const move = (e: MouseEvent) => {
    if (!isActive()) return;
    if (input.pointerLocked || input.dragging) {
      input.lookX += e.movementX || 0;
      input.lookY += e.movementY || 0;
      if (e.movementX || e.movementY) input.engaged = true;
    }
  };
  const downMouse = (e: MouseEvent) => {
    if (!isActive()) return;
    if (e.button === 2) {
      input.aiming = true;
      onAim?.(true);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    input.capturedThisClick = false;
    if (!input.pointerLocked) {
      input.dragging = true;
      // Once the browser has made it clear it will not hand over the pointer,
      // every click is an ordinary click again — otherwise the drag fallback
      // can look around but can never pull the trigger.
      if (!input.lockDenied) {
        input.capturedThisClick = true;
        requestLock(el);
      }
    }
  };
  const upMouse = (e: MouseEvent) => {
    if (e.button === 2) {
      input.aiming = false;
      onAim?.(false);
      return;
    }
    input.dragging = false;
  };
  const blockMenu = (e: Event) => e.preventDefault();
  const lockChange = () => {
    input.pointerLocked = document.pointerLockElement === el;
    if (input.pointerLocked) {
      input.lockDenied = false;
      input.engaged = true;
    } else {
      input.dragging = false;
    }
  };
  const wheel = (e: WheelEvent) => {
    if (!isActive()) return;
    input.zoom += Math.sign(e.deltaY);
    e.preventDefault();
  };

  el.addEventListener("mousedown", downMouse);
  window.addEventListener("mouseup", upMouse);
  window.addEventListener("mousemove", move);
  el.addEventListener("wheel", wheel, { passive: false });
  el.addEventListener("contextmenu", blockMenu);
  document.addEventListener("pointerlockchange", lockChange);

  return () => {
    el.removeEventListener("mousedown", downMouse);
    window.removeEventListener("mouseup", upMouse);
    window.removeEventListener("mousemove", move);
    el.removeEventListener("wheel", wheel);
    el.removeEventListener("contextmenu", blockMenu);
    document.removeEventListener("pointerlockchange", lockChange);
    if (document.pointerLockElement === el) document.exitPointerLock();
  };
}

/**
 * Chrome hands back a promise that rejects when the lock is refused — clicking
 * again while a previous lock is still unwinding, or a document that has lost
 * focus. There is nothing to do about it, but leaving it unhandled puts an
 * uncaught rejection in the console (and the dev overlay in front of the game)
 * on what is otherwise an ordinary click.
 */
function requestLock(el: HTMLElement) {
  const pending = el.requestPointerLock?.() as unknown;
  if (pending instanceof Promise) pending.catch(() => markLockDenied(el));
  // Firefox and Safari hand back nothing at all, so the refusal has to be
  // noticed by looking: if the pointer still isn't ours a beat later, it never
  // will be, and the drag fallback becomes the real control scheme.
  window.setTimeout(() => markLockDenied(el), 700);
}

function markLockDenied(el: HTMLElement) {
  if (document.pointerLockElement === el) return;
  input.lockDenied = true;
  input.capturedThisClick = false;
}

export function releasePointerLock() {
  if (document.pointerLockElement) document.exitPointerLock();
  input.pointerLocked = false;
  input.dragging = false;
}
