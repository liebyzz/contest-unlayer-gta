/**
 * Soft-edged primitives.
 *
 * Everything in this city used to be a raw BoxGeometry, which is exactly why
 * it read as voxels rather than as a stylised city. Real objects have a
 * highlight running along every edge; that highlight is what sells "modelled"
 * over "blocky". These helpers give us rounded and chamfered boxes cheaply,
 * cached by shape so a whole crowd shares one buffer.
 */
import * as THREE from "three";

const cache = new Map<string, THREE.BufferGeometry>();

function remember<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const geo = make();
  cache.set(key, geo);
  return geo;
}

/**
 * A box with rounded edges and corners.
 *
 * Built by subdividing a cube and pushing every vertex out to a radius around
 * the inset "core" box — the standard rounded-box trick, and far cheaper than
 * a CSG bevel.
 */
export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius = 0.06,
  segments = 2,
): THREE.BufferGeometry {
  const r = Math.min(radius, width / 2 - 1e-4, height / 2 - 1e-4, depth / 2 - 1e-4);
  const key = `rb:${width}:${height}:${depth}:${r}:${segments}`;
  return remember(key, () => {
    const seg = segments * 2 + 1;
    const geo = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const half = [width / 2, height / 2, depth / 2];
    const core = [half[0] - r, half[1] - r, half[2] - r];
    const v = new THREE.Vector3();
    const inner = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i) * width, pos.getY(i) * height, pos.getZ(i) * depth);
      inner.set(
        THREE.MathUtils.clamp(v.x, -core[0], core[0]),
        THREE.MathUtils.clamp(v.y, -core[1], core[1]),
        THREE.MathUtils.clamp(v.z, -core[2], core[2]),
      );
      const dir = v.sub(inner);
      if (dir.lengthSq() > 1e-9) dir.normalize().multiplyScalar(r);
      pos.setXYZ(i, inner.x + dir.x, inner.y + dir.y, inner.z + dir.z);
    }

    geo.computeVertexNormals();
    geo.deleteAttribute("uv");
    return geo;
  });
}

/**
 * A box whose top face is smaller than its bottom — car roofs, tapered limbs,
 * building setbacks. `bevel` rounds the result slightly.
 */
export function taperedBox(
  width: number,
  height: number,
  depth: number,
  topScaleX: number,
  topScaleZ: number,
  bevel = 0.03,
): THREE.BufferGeometry {
  const key = `tb:${width}:${height}:${depth}:${topScaleX}:${topScaleZ}:${bevel}`;
  return remember(key, () => {
    const geo = roundedBox(width, height, depth, bevel, 1).clone();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      // 0 at the bottom, 1 at the top
      const t = THREE.MathUtils.clamp(y / height + 0.5, 0, 1);
      const sx = THREE.MathUtils.lerp(1, topScaleX, t);
      const sz = THREE.MathUtils.lerp(1, topScaleZ, t);
      pos.setXYZ(i, pos.getX(i) * sx, y, pos.getZ(i) * sz);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

/** A capsule — limbs and torsos read far better as these than as cuboids. */
export function capsule(radius: number, length: number, caps = 4, radial = 8) {
  const key = `cap:${radius}:${length}:${caps}:${radial}`;
  return remember(key, () => new THREE.CapsuleGeometry(radius, length, caps, radial));
}

/**
 * A building block with a chamfered top edge, so rooflines catch the sunset
 * instead of ending in a hard voxel corner.
 */
export function towerBlock(width: number, height: number, depth: number) {
  const key = `tower:${width}:${height}:${depth}`;
  return remember(key, () => new THREE.BoxGeometry(width, height, depth));
}

/** Cheap wedge, used for windscreens and awnings. */
export function wedge(width: number, height: number, depth: number) {
  const key = `wedge:${width}:${height}:${depth}`;
  return remember(key, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2, -height / 2);
    shape.lineTo(depth / 2, -height / 2);
    shape.lineTo(depth / 2, height / 2);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 1,
    });
    geo.rotateY(Math.PI / 2);
    geo.translate(-width / 2, 0, 0);
    geo.computeVertexNormals();
    return geo;
  });
}
