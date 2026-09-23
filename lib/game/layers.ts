import type * as THREE from "three";

/**
 * Render layers.
 *
 * The wet road is a MeshReflectorMaterial, which draws the whole scene a second
 * time from under the tarmac every frame. Under that much blur a pedestrian's
 * reflection is a smudge nobody can see, and the crowd is hundreds of draw
 * calls — so people live on a layer the main camera sees and the reflection
 * camera does not. The neon, the lit windows, the lamps and the pieces on the
 * walls still reflect, which is all the after-the-rain look is made of.
 */
export const LAYER_NO_REFLECT = 1;

/** Take a whole subtree out of the road's reflection. */
export function skipReflection(object: THREE.Object3D) {
  object.traverse((o) => o.layers.set(LAYER_NO_REFLECT));
}
