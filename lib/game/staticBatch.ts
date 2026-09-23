import * as THREE from "three";

/**
 * Static batching for the city.
 *
 * The block is built the readable way — one React element per bollard,
 * pilaster, string course and crate — and three.js draws every one of them as
 * its own call, twice when it casts a shadow. Measured, that was 657 meshes and
 * over a thousand draw calls a frame for architecture that never moves, and the
 * frame rate was set by the CPU submitting them rather than the GPU drawing
 * them: dropping to a quarter of the pixels bought nothing at all.
 *
 * So once the city has mounted, the static meshes that share a material, the
 * same shadow flags and roughly the same patch of the map are baked into one
 * geometry and drawn once. The originals come out of the scene graph and go
 * back if the city ever unmounts.
 *
 * Anything the caller says to `keep` is left exactly as it was — in practice
 * the props the reveal camera may have to lift out of its shot, which only
 * works while they are separate objects.
 */

/**
 * Batches are split on a grid so frustum culling still has something to cull.
 * Coarse, because triangles are cheap here and draw calls are not.
 */
const CELL = 64;

interface Part {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  start: number;
  count: number;
}

interface Bucket {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  entries: { mesh: THREE.Mesh; part: Part }[];
}

function batchable(material: THREE.Material) {
  const m = material as THREE.MeshStandardMaterial & { isShaderMaterial?: boolean };
  // Transparent pieces depend on being sorted one by one — except additive
  // light that writes no depth, which comes out the same in any order (every
  // pool of lamplight on the pavement). Anything wanting attributes beyond
  // position/normal/uv is not worth the special case.
  const orderFree = m.blending === THREE.AdditiveBlending && !m.depthWrite;
  return !(
    (m.transparent && !orderFree) ||
    m.isShaderMaterial ||
    m.vertexColors ||
    m.aoMap ||
    m.lightMap ||
    m.displacementMap
  );
}

const TEXTURE_SLOTS = [
  "map",
  "emissiveMap",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "alphaMap",
  "bumpMap",
  "envMap",
  "specularMap",
] as const;
const defaultCompile = new THREE.Material().onBeforeCompile;

/**
 * Two materials that would draw the same pixels batch together.
 *
 * Props make their own material far more often than they need to — every
 * dumpster, every pool of lamplight — so matching on identity alone left most
 * of the block in buckets of one.
 */
function materialKey(material: THREE.Material) {
  const m = material as THREE.MeshStandardMaterial;
  if (m.onBeforeCompile !== defaultCompile || !(m.isMeshStandardMaterial || (m as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial)) {
    return material.uuid;
  }
  const slots = TEXTURE_SLOTS.map((k) => (m as unknown as Record<string, THREE.Texture | null>)[k]?.uuid ?? "-");
  return [
    m.type,
    m.color?.getHexString(),
    m.emissive?.getHexString(),
    m.emissiveIntensity,
    m.roughness,
    m.metalness,
    m.opacity,
    m.transparent,
    m.blending,
    m.depthWrite,
    m.depthTest,
    m.side,
    m.toneMapped,
    m.fog,
    m.flatShading,
    m.alphaTest,
    m.polygonOffset ? `${m.polygonOffsetFactor},${m.polygonOffsetUnits}` : "-",
    m.normalScale ? `${m.normalScale.x},${m.normalScale.y}` : "-",
    m.envMapIntensity,
    ...slots,
  ].join("|");
}

/** Flatten triangle runs from many geometries into one, in the root's space. */
function bake(parts: Part[]): THREE.BufferGeometry {
  let total = 0;
  for (const p of parts) total += p.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let o = 0;

  for (const p of parts) {
    const g = p.geometry;
    const P = g.attributes.position as THREE.BufferAttribute;
    const N = g.attributes.normal as THREE.BufferAttribute | undefined;
    const U = g.attributes.uv as THREE.BufferAttribute | undefined;
    const index = g.index;
    normalMatrix.getNormalMatrix(p.matrix);
    // a mirrored transform turns every triangle inside out
    const flip = p.matrix.determinant() < 0;

    for (let t = 0; t + 2 < p.count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const src = p.start + t + (flip ? 2 - k : k);
        const i = index ? index.getX(src) : src;
        v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
        pos[o * 3] = v.x;
        pos[o * 3 + 1] = v.y;
        pos[o * 3 + 2] = v.z;
        if (N) {
          n.fromBufferAttribute(N, i).applyMatrix3(normalMatrix).normalize();
          nor[o * 3] = n.x;
          nor[o * 3 + 1] = n.y;
          nor[o * 3 + 2] = n.z;
        }
        if (U) {
          uv[o * 2] = U.getX(i);
          uv[o * 2 + 1] = U.getY(i);
        }
        o++;
      }
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, o * 3), 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor.subarray(0, o * 3), 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv.subarray(0, o * 2), 2));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * Bake the static meshes under `root` into batches. Returns the undo.
 *
 * Nothing under `root` may move afterwards: the batches are built from where
 * everything stands right now.
 */
export function batchStatic(
  root: THREE.Object3D,
  keep: (mesh: THREE.Mesh, box: THREE.Box3) => boolean,
): () => void {
  root.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  /** every bucket each mesh has triangles in */
  const homes = new Map<THREE.Mesh, Bucket[]>();
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if ((mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (mesh.userData.nwKeep || !mesh.visible) return;
    for (let p = mesh.parent; p && p !== root; p = p.parent) if (!p.visible) return;
    const g = mesh.geometry;
    if (!g?.attributes.position || g.morphAttributes.position) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.every(batchable)) return;

    if (!g.boundingBox) g.computeBoundingBox();
    box.copy(g.boundingBox!).applyMatrix4(mesh.matrixWorld);
    if (keep(mesh, box)) return;

    box.getCenter(centre);
    const cell = `${Math.floor(centre.x / CELL)},${Math.floor(centre.z / CELL)}`;
    const matrix = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
    const drawCount = g.index ? g.index.count : g.attributes.position.count;
    const mine: Bucket[] = [];

    const add = (material: THREE.Material, start: number, count: number) => {
      const key = `${materialKey(material)}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}|${cell}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          material,
          castShadow: mesh.castShadow,
          receiveShadow: mesh.receiveShadow,
          renderOrder: mesh.renderOrder,
          entries: [],
        };
        buckets.set(key, bucket);
      }
      bucket.entries.push({ mesh, part: { geometry: g, matrix, start, count } });
      if (!mine.includes(bucket)) mine.push(bucket);
    };

    if (Array.isArray(mesh.material)) {
      // a box with a material per face is a draw call per face anyway
      for (const group of g.groups) {
        const material = mesh.material[group.materialIndex ?? 0];
        const count = Math.min(group.count, drawCount - group.start);
        if (material && count > 0) add(material, group.start, count);
      }
    } else {
      add(mesh.material, 0, drawCount);
    }
    if (mine.length) homes.set(mesh, mine);
  });

  // A mesh comes out whole or not at all, and only into buckets that end up
  // holding at least two meshes — one mesh on its own gains nothing from being
  // copied. Pulling one mesh back can leave a bucket it shared too thin, so
  // settle it until nothing changes.
  const out = new Set(homes.keys());
  const population = (b: Bucket) => new Set(b.entries.filter((e) => out.has(e.mesh)).map((e) => e.mesh)).size;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [mesh, mine] of homes) {
      if (!out.has(mesh)) continue;
      if (mine.some((b) => population(b) < 2)) {
        out.delete(mesh);
        changed = true;
      }
    }
  }

  const batches: THREE.Mesh[] = [];
  for (const bucket of buckets.values()) {
    const parts = bucket.entries.filter((e) => out.has(e.mesh)).map((e) => e.part);
    if (!parts.length) continue;
    const merged = new THREE.Mesh(bake(parts), bucket.material);
    merged.castShadow = bucket.castShadow;
    merged.receiveShadow = bucket.receiveShadow;
    merged.renderOrder = bucket.renderOrder;
    merged.matrixAutoUpdate = false;
    merged.name = "nw-static-batch";
    // Everything in here was checked clear of every reveal shot one piece at a
    // time; the batch's bounds as a whole can still straddle one, and must not
    // take a row of bollards out of the picture for it.
    merged.userData.nwKeep = true;
    batches.push(merged);
  }

  const removed: { mesh: THREE.Mesh; parent: THREE.Object3D }[] = [];
  for (const mesh of out) {
    if (!mesh.parent) continue;
    removed.push({ mesh, parent: mesh.parent });
    mesh.parent.remove(mesh);
  }
  for (const batch of batches) root.add(batch);

  return () => {
    for (const batch of batches) {
      root.remove(batch);
      batch.geometry.dispose();
    }
    for (const { mesh, parent } of removed) parent.add(mesh);
  };
}
