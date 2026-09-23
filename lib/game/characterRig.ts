/**
 * One articulated humanoid rig, used by the player, the pedestrians, the gang
 * and the police.
 *
 * Joints: hips → torso → head, hips → (thigh → shin → foot) ×2,
 * torso → (upper arm → forearm) ×2. Every part is a rounded or capsule form
 * rather than a cuboid — that alone is most of the difference between "voxel"
 * and "stylised".
 *
 * The walk is hand-authored rather than sampled from a clip, so the things
 * that make it read as a person are explicit here: the ankle rolls through
 * heel-strike and toe-off, the arms lag a little behind the opposite leg, the
 * body leans into acceleration and banks into turns, and walk blends
 * continuously into a run instead of switching between two poses.
 */
import * as THREE from "three";
import { capsule, roundedBox, taperedBox } from "./geometry";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(colour: string, rough = 0.82, metal = 0) {
  const key = `${colour}|${rough}|${metal}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness: metal });
    materialCache.set(key, m);
  }
  return m;
}

const glowCache = new Map<string, THREE.MeshBasicMaterial>();
function glowMat(colour: string) {
  let m = glowCache.get(colour);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: colour, toneMapped: false });
    glowCache.set(colour, m);
  }
  return m;
}

/**
 * The Kings' mark across the shoulders: their crown, glowing, in the gang's
 * colour. It used to be a plain lit rectangle — from behind, which is how you
 * see anyone chasing you, a red square on a jacket.
 */
let crownTexture: THREE.CanvasTexture | null = null;
const crownCache = new Map<string, THREE.MeshBasicMaterial>();
function crownMat(colour: string) {
  let m = crownCache.get(colour);
  if (m) return m;
  if (!crownTexture) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 104;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 6;
    // five points over a band, the same crown the briefing's wall is marked with
    ctx.beginPath();
    ctx.moveTo(14, 84);
    ctx.lineTo(8, 22);
    ctx.lineTo(38, 52);
    ctx.lineTo(64, 12);
    ctx.lineTo(90, 52);
    ctx.lineTo(120, 22);
    ctx.lineTo(114, 84);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(14, 88, 100, 10);
    for (const x of [8, 64, 120]) {
      ctx.beginPath();
      ctx.arc(x, x === 64 ? 11 : 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    crownTexture = new THREE.CanvasTexture(c);
    crownTexture.colorSpace = THREE.SRGBColorSpace;
  }
  m = new THREE.MeshBasicMaterial({
    color: colour,
    map: crownTexture,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
  });
  crownCache.set(colour, m);
  return m;
}

export interface Limb {
  root: THREE.Group;
  lower: THREE.Group;
  /** ankle pivot — legs only */
  foot?: THREE.Group;
}

export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  /**
   * Both pairs are ordered [right, left]. The model faces +Z, and in a
   * right-handed Y-up frame that puts the character's right side on −X — the
   * opposite of what reading the numbers suggests, which is how the pistol
   * ended up in the wrong hand.
   */
  legs: [Limb, Limb];
  arms: [Limb, Limb];
  gun: THREE.Group;
  /** the barrel tip — where a muzzle flash belongs */
  muzzle: THREE.Object3D;
  /** whether this character has a pistol in hand at all */
  armed: boolean;
  /** per-instance idle offset so a crowd doesn't breathe in unison */
  seed: number;
}

export interface RigLook {
  jacket: string;
  legs: string;
  skin: string;
  hat: string | null;
  /** glowing stripe across the chest */
  trim?: string;
  pack?: boolean;
  badge?: boolean;
  /** carries a pistol — always in hand, raised only when aiming */
  armed?: boolean;
  /** gang colours: a bandana and a mark on the back of the jacket */
  gangColour?: string;
  /** build multiplier — heavies read as heavies */
  bulk?: number;
  height?: number;

  /* ── the things that turn a mannequin into somebody ──────────────────── */
  /** cropped hair, instead of or under a cap */
  hair?: string;
  /** a darker jaw: a couple of days of not shaving */
  stubble?: string;
  /** forearms bare, with the sleeve ending above the elbow */
  shortSleeves?: boolean;
  /** a chain at the collar */
  chain?: string;
  /** a vest showing down the middle of an open shirt */
  vest?: string;
}

const HIP_HEIGHT = 0.92;

/**
 * Everything a joint carries, as one mesh.
 *
 * A head is a skull, a jaw, a brow, two eyes, a nose and a haircut — nine
 * meshes that never move relative to one another, and nine draw calls. With
 * twenty-odd people on the block the crowd was a third of the frame's draw
 * calls, and the frame rate was the CPU submitting them. The pieces are baked
 * into the joint's own space with their colour carried per vertex, so a joint
 * is one draw however much is hung on it, and the pose still moves it whole.
 *
 * Only plain solid parts: the glowing trim and the gang mark keep their own
 * materials. Metal (the pistol, a chain) keeps its sheen by baking separately.
 */
const FLAT_MATTE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
const FLAT_METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85 });

function flattenJoint(joint: THREE.Object3D) {
  const byFinish = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of joint.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) continue;
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (!m.isMeshStandardMaterial || m.transparent || m.map) continue;
    const finish = m.metalness >= 0.5 ? FLAT_METAL : FLAT_MATTE;
    const list = byFinish.get(finish) ?? [];
    list.push(mesh);
    byFinish.set(finish, list);
  }

  for (const [finish, parts] of byFinish) {
    if (parts.length < 2) continue;
    let total = 0;
    for (const p of parts) total += p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    let o = 0;
    for (const p of parts) {
      p.updateMatrix();
      normalMatrix.getNormalMatrix(p.matrix);
      const g = p.geometry;
      const P = g.attributes.position as THREE.BufferAttribute;
      const N = g.attributes.normal as THREE.BufferAttribute;
      const count = g.index ? g.index.count : P.count;
      // colours are linear already; that is what a vertex colour expects
      const c = (p.material as THREE.MeshStandardMaterial).color;
      for (let k = 0; k < count; k++) {
        const i = g.index ? g.index.getX(k) : k;
        v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
        n.fromBufferAttribute(N, i).applyMatrix3(normalMatrix).normalize();
        pos.set([v.x, v.y, v.z], o * 3);
        nor.set([n.x, n.y, n.z], o * 3);
        col.set([c.r, c.g, c.b], o * 3);
        o++;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geometry.computeBoundingSphere();
    // this one belongs to the rig, unlike the shared primitives it was cut from
    geometry.userData.nwOwned = true;
    const merged = new THREE.Mesh(geometry, finish);
    merged.castShadow = parts.some((p) => p.castShadow);
    merged.receiveShadow = parts.some((p) => p.receiveShadow);
    for (const p of parts) joint.remove(p);
    joint.add(merged);
  }
}

/** Free what a rig owns once its person has left the block for good. */
export function disposeRig(rig: Rig) {
  rig.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry?.userData.nwOwned) mesh.geometry.dispose();
  });
}

export function createRig(look: RigLook, castShadow = false): Rig {
  const root = new THREE.Group();
  const bulk = look.bulk ?? 1;
  if (look.height && look.height !== 1) root.scale.setScalar(look.height);

  const jacket = mat(look.jacket);
  const trousers = mat(look.legs, 0.94);
  const skin = mat(look.skin, 0.74);
  const shoe = mat("#141319", 0.6);

  const hips = new THREE.Group();
  hips.position.y = HIP_HEIGHT;
  root.add(hips);

  /* legs ------------------------------------------------------------------ */
  const legs: Limb[] = [];
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.125 * bulk, 0, 0);
    const thighMesh = new THREE.Mesh(capsule(0.105 * bulk, 0.3), trousers);
    thighMesh.position.y = -0.22;
    thighMesh.castShadow = castShadow;
    thigh.add(thighMesh);

    const shin = new THREE.Group();
    shin.position.y = -0.44;
    const shinMesh = new THREE.Mesh(capsule(0.09 * bulk, 0.28), trousers);
    shinMesh.position.y = -0.21;
    shinMesh.castShadow = castShadow;
    shin.add(shinMesh);

    // the ankle gets its own pivot so the foot can roll through the step
    const foot = new THREE.Group();
    foot.position.y = -0.42;
    const footMesh = new THREE.Mesh(roundedBox(0.19, 0.11, 0.33, 0.05), shoe);
    footMesh.position.z = 0.07;
    footMesh.castShadow = castShadow;
    foot.add(footMesh);
    shin.add(foot);

    thigh.add(shin);
    hips.add(thigh);
    legs.push({ root: thigh, lower: shin, foot });
  }

  /* torso ----------------------------------------------------------------- */
  const torso = new THREE.Group();
  torso.position.y = 0.04;
  hips.add(torso);

  const chest = new THREE.Mesh(
    taperedBox(0.5 * bulk, 0.58, 0.3 * bulk, 0.86, 0.88, 0.075),
    jacket,
  );
  chest.position.y = 0.29;
  chest.rotation.x = Math.PI; // wide end at the shoulders
  chest.castShadow = castShadow;
  torso.add(chest);

  const waist = new THREE.Mesh(roundedBox(0.42 * bulk, 0.18, 0.27 * bulk, 0.07), trousers);
  waist.position.y = -0.02;
  torso.add(waist);

  const collar = new THREE.Mesh(capsule(0.115 * bulk, 0.05), jacket);
  collar.position.y = 0.56;
  collar.rotation.z = Math.PI / 2;
  torso.add(collar);

  if (look.trim) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.06), glowMat(look.trim));
    stripe.position.set(0, 0.26, 0.152 * bulk + 0.005);
    torso.add(stripe);
  }

  if (look.gangColour) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), crownMat(look.gangColour));
    mark.position.set(0, 0.32, -0.152 * bulk - 0.005);
    mark.rotation.y = Math.PI;
    torso.add(mark);
  }

  if (look.vest) {
    // A light panel down the middle of a darker shirt reads as an open shirt
    // over a vest, and standing slightly proud of the chest it catches its own
    // highlight instead of looking like a printed stripe.
    const vest = new THREE.Mesh(
      roundedBox(0.155 * bulk, 0.46, 0.06, 0.025),
      mat(look.vest, 0.92),
    );
    vest.position.set(0, 0.26, 0.128 * bulk);
    vest.castShadow = castShadow;
    torso.add(vest);

    // Two lapels angled away from the neck. Without them the panel is a bib;
    // with them the eye reads a shirt worn open over it, which is the whole
    // point of putting a second colour on the chest.
    for (const sx of [-1, 1]) {
      const lapel = new THREE.Mesh(roundedBox(0.075 * bulk, 0.3, 0.05, 0.02), jacket);
      lapel.position.set(sx * 0.105 * bulk, 0.36, 0.132 * bulk);
      lapel.rotation.z = sx * 0.22;
      lapel.castShadow = castShadow;
      torso.add(lapel);
    }
  }

  if (look.chain) {
    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.082, 0.0105, 5, 14),
      mat(look.chain, 0.22, 0.92),
    );
    chain.position.set(0, 0.5, 0.05 * bulk);
    chain.rotation.x = 1.18;
    torso.add(chain);
  }

  if (look.pack) {
    const pack = new THREE.Mesh(roundedBox(0.36, 0.44, 0.2, 0.07), mat("#3a2f24", 0.95));
    pack.position.set(0, 0.28, -0.23 * bulk);
    pack.castShadow = castShadow;
    torso.add(pack);
  }

  if (look.badge) {
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), glowMat("#ffd76a"));
    badge.position.set(0.13, 0.37, 0.152 * bulk + 0.005);
    torso.add(badge);
  }

  /* head ------------------------------------------------------------------ */
  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);

  const skull = new THREE.Mesh(roundedBox(0.24, 0.27, 0.25, 0.085, 3), skin);
  skull.castShadow = castShadow;
  head.add(skull);

  const jaw = new THREE.Mesh(
    roundedBox(0.19, 0.1, 0.2, 0.05),
    look.stubble ? mat(look.stubble, 0.95) : skin,
  );
  jaw.position.set(0, -0.11, 0.02);
  head.add(jaw);

  // One dark band across the eyes reads as a welding visor. A brow with two
  // eyes under it and a nose below reads as a face, for four more small pieces
  // — and it is the single thing that stops these characters looking like shop
  // dummies at conversational distance.
  const dark = mat("#17161e", 0.9);
  const brow = new THREE.Mesh(roundedBox(0.185, 0.026, 0.035, 0.011), dark);
  brow.position.set(0, 0.058, 0.121);
  head.add(brow);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.03), dark);
    eye.position.set(sx * 0.05, 0.014, 0.1265);
    head.add(eye);
  }
  const nose = new THREE.Mesh(roundedBox(0.042, 0.08, 0.055, 0.017), skin);
  nose.position.set(0, -0.028, 0.117);
  head.add(nose);

  if (look.hair) {
    const hairMat = mat(look.hair, 0.96);
    const crop = new THREE.Mesh(roundedBox(0.253, 0.135, 0.262, 0.062, 3), hairMat);
    crop.position.y = 0.075;
    crop.castShadow = castShadow;
    head.add(crop);
    // down the back of the neck and in front of the ears, so it is a haircut
    // rather than a helmet sitting on top of the skull
    const nape = new THREE.Mesh(roundedBox(0.247, 0.14, 0.07, 0.028), hairMat);
    nape.position.set(0, 0.005, -0.115);
    head.add(nape);
    for (const sx of [-1, 1]) {
      const sideburn = new THREE.Mesh(roundedBox(0.028, 0.13, 0.185, 0.018), hairMat);
      sideburn.position.set(sx * 0.118, 0.01, -0.012);
      head.add(sideburn);
    }
  }

  if (look.hat) {
    const cap = new THREE.Mesh(roundedBox(0.26, 0.12, 0.25, 0.055), mat(look.hat));
    cap.position.y = 0.15;
    cap.castShadow = castShadow;
    head.add(cap);
    const peak = new THREE.Mesh(roundedBox(0.23, 0.03, 0.11, 0.015), mat(look.hat));
    peak.position.set(0, 0.11, 0.16);
    head.add(peak);
  }

  if (look.gangColour) {
    const band = new THREE.Mesh(roundedBox(0.255, 0.06, 0.26, 0.03), mat(look.gangColour, 0.7));
    band.position.y = 0.09;
    head.add(band);
  }

  /* arms ------------------------------------------------------------------ */
  const arms: Limb[] = [];
  for (const side of [-1, 1]) {
    const upper = new THREE.Group();
    upper.position.set(side * 0.29 * bulk, 0.48, 0);
    const upperMesh = new THREE.Mesh(capsule(0.075 * bulk, 0.24), jacket);
    upperMesh.position.y = -0.17;
    upperMesh.castShadow = castShadow;
    upper.add(upperMesh);

    if (look.shortSleeves) {
      // the hem of the sleeve, sitting proud of the arm above the elbow
      const hem = new THREE.Mesh(capsule(0.088 * bulk, 0.045), jacket);
      hem.position.y = -0.25;
      hem.castShadow = castShadow;
      upper.add(hem);
    }

    const fore = new THREE.Group();
    fore.position.y = -0.35;
    const foreMesh = new THREE.Mesh(
      capsule(0.062 * bulk, 0.22),
      look.shortSleeves ? skin : jacket,
    );
    foreMesh.position.y = -0.16;
    foreMesh.castShadow = castShadow;
    fore.add(foreMesh);
    const hand = new THREE.Mesh(roundedBox(0.1, 0.11, 0.12, 0.045), skin);
    hand.position.y = -0.33;
    fore.add(hand);

    upper.add(fore);
    torso.add(upper);
    arms.push({ root: upper, lower: fore });
  }

  /* the piece, in the right hand ------------------------------------------ */
  // The barrel runs down the forearm's OWN axis, not across the palm. A wrist
  // locks straight when the arm comes up, so a pistol modelled across the hand
  // swings round and points at the sky the moment you aim — which is exactly
  // what this was doing.
  const gun = new THREE.Group();
  gun.visible = Boolean(look.armed);
  const slide = new THREE.Mesh(roundedBox(0.05, 0.27, 0.075, 0.018), mat("#23252d", 0.32, 0.85));
  slide.position.set(0, -0.115, 0.012);
  gun.add(slide);
  const grip = new THREE.Mesh(roundedBox(0.05, 0.15, 0.085, 0.025), mat("#171820", 0.55, 0.3));
  grip.position.set(0, 0.035, -0.05);
  grip.rotation.x = 0.28;
  gun.add(grip);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.25, 0.012);
  gun.add(muzzle);
  gun.position.set(0, -0.33, 0.025);
  // The wrist break, measured rather than guessed: at 0.3 the barrel comes out
  // level with the ground in the aiming pose (0.5° of pitch), which is where a
  // sighted pistol has to be, and the arm's own bend does the rest.
  gun.rotation.x = 0.3;
  arms[0].lower.add(gun); // arms[0] is the −X arm: the right one

  for (const joint of [
    hips,
    torso,
    head,
    ...legs.flatMap((l) => [l.root, l.lower, l.foot!]),
    ...arms.flatMap((a) => [a.root, a.lower]),
    gun,
  ]) {
    flattenJoint(joint);
  }

  return {
    root,
    hips,
    torso,
    head,
    legs: legs as [Limb, Limb],
    arms: arms as [Limb, Limb],
    gun,
    muzzle,
    armed: Boolean(look.armed),
    seed: Math.random() * Math.PI * 2,
  };
}

export interface PoseParams {
  /** stride phase, in radians */
  phase: number;
  /** 0 = standing, 1 = full walking speed */
  intensity: number;
  /** 0 = walking, 1 = flat out. Continuous, so there is no pop at the change */
  run: number;
  /** raise the gun and point it forward */
  aiming: boolean;
  /** vertical aim, radians */
  aimPitch: number;
  /** 0 = upright, 1 = flat on the pavement */
  down: number;
  /** kick from the last shot, 0-1 */
  recoil: number;
  time: number;
  /** 0-1, arms up and shouting */
  taunt?: number;
  /** 0-1, decaying after a shot from the hip — swings the gun arm up level */
  hipFire?: number;
  /** −1..1, how hard we're turning; the body banks into it */
  turn?: number;
  /** −1..1, speeding up or slowing down; the body leans with it */
  accel?: number;
  /** 0-1, both hands up in front of the face holding a phone */
  phone?: number;
}

const IDLE_ARM = 0.07;
const TAU = Math.PI * 2;

/**
 * The gait.
 *
 * One leg's cycle runs θ ∈ [0, 2π) with θ = 0 at heel strike:
 *
 *   θ ∈ [0, π)   STANCE — the foot is planted. The hip rotates from flexed
 *                (forward) to extended (behind), the knee stays nearly
 *                straight apart from a shallow dip as weight lands on it, and
 *                the ankle rolls heel → flat → toe-off.
 *   θ ∈ [π, 2π)  SWING  — the foot is in the air. The knee bends hard to lift
 *                the toe clear, then straightens for the next strike.
 *
 * Getting that split right is the whole thing. The previous version bent the
 * knee during *stance* and held it straight through *swing* — the planted leg
 * was doing the swinging leg's job — which is exactly why the legs read as
 * working against each other.
 *
 * Hip travel is deliberately asymmetric: people swing a leg further forward
 * than they push it back behind them.
 */
/** Segment lengths, taken straight from how the rig is assembled above. */
const THIGH_LEN = 0.44; // hip → knee
const SHIN_LEN = 0.42; // knee → ankle
const ANKLE_HEIGHT = 0.075; // ankle above the sole
const MAX_REACH = THIGH_LEN + SHIN_LEN - 0.01;
const MIN_REACH = Math.abs(THIGH_LEN - SHIN_LEN) + 0.03;

/** Ground covered per full two-step cycle. */
export const STRIDE_WALK = 1.3;
export const STRIDE_RUN = 2.2;

/**
 * Two-bone IK, solved analytically in the sagittal plane.
 *
 * Give it where the ankle should be, relative to the hip joint, and it returns
 * the hip and knee angles that put it there. The knee direction is chosen here
 * rather than emerging from a curve, which is the whole reason for doing it
 * this way: a knee has exactly one way it can bend, and hand-authored sine
 * curves have no idea which way that is.
 */
function solveLeg(targetY: number, targetZ: number) {
  const d = clamp(Math.hypot(targetY, targetZ), MIN_REACH, MAX_REACH);

  // angle from straight-down to the target, positive towards the front
  const toTarget = Math.atan2(targetZ, -targetY);
  const hipOffset = Math.acos(
    clamp((THIGH_LEN * THIGH_LEN + d * d - SHIN_LEN * SHIN_LEN) / (2 * THIGH_LEN * d), -1, 1),
  );
  const kneeInterior = Math.acos(
    clamp(
      (THIGH_LEN * THIGH_LEN + SHIN_LEN * SHIN_LEN - d * d) / (2 * THIGH_LEN * SHIN_LEN),
      -1,
      1,
    ),
  );

  // Positive rotation.x carries a limb's far end BEHIND the character, so the
  // thigh swings forward on a negative angle and the knee — whose heel must
  // travel backwards — flexes on a positive one. Getting this sign wrong
  // hyperextends the leg, which is what made the old walk look folded up.
  return {
    thigh: -(toTarget + hipOffset),
    knee: Math.PI - kneeInterior,
  };
}

/**
 * Duty factor: the share of one leg's cycle spent on the ground.
 *
 * This single number is what separates a walk from a run, and getting it from
 * a blend rather than a switch is what lets one gait become the other.
 *
 * At 0.5 both feet are down for part of every cycle (double support) and the
 * body is never airborne — that is the definition of walking. Take it below
 * 0.5 and the two stance windows stop overlapping: there are now stretches
 * where neither foot is down, and the character is in flight. That is the
 * definition of running, and it is why a walk played faster never reads as a
 * run however much you stretch the stride.
 */
const DUTY_WALK = 0.5;
const DUTY_RUN = 0.35;

/**
 * Where the ankle should be at this point in the cycle, relative to the hip.
 *
 * Stance drags the foot backwards at exactly the speed the body is moving
 * forwards, which is what stops it skating. Swing lifts it and carries it back
 * to the front for the next contact.
 *
 * The stance window is deliberately lopsided, and it swaps over as the gait
 * changes. A walker reaches out in front and lands on the heel; a runner lands
 * much closer underneath themselves and drives further out behind — overstride
 * is the thing that makes a run look like someone falling forwards, and it is
 * also what would put the ankle beyond the leg's reach at this speed.
 */
function footTarget(t: number, stride: number, hipHeight: number, run: number) {
  const ground = -hipHeight + ANKLE_HEIGHT;
  const duty = lerp(DUTY_WALK, DUTY_RUN, run);
  const stanceEnd = TAU * duty;

  // The invariant that stops the foot skating: while it is planted the ankle
  // must travel backwards, relative to the hip, by exactly the ground the body
  // covers in that time — which is speed x stance time, and stance time is
  // duty x the cycle. It comes out as duty x stride with the speed cancelling,
  // so it holds at any pace. At a duty of 0.5 that is stride/2, which is why
  // the walk never skated; drop the duty for a run without shortening the
  // excursion to match and the foot suddenly drags backwards under you.
  //
  // The rest of the stride — the majority of it, at a run — is covered in the
  // air, which is what makes a running step so much longer than its contact.
  const excursion = duty * stride;
  const ahead = excursion * lerp(0.5, 0.4, run);
  const behind = excursion - ahead;

  if (t < stanceEnd) {
    const s = t / stanceEnd;
    // the ankle rises a little at heel-strike and toe-off, where the foot is
    // pivoting on one end rather than lying flat
    const pivot = lerp(0.05, 0.02, run) * (1 - Math.sin(s * Math.PI));
    // and a runner finishes stance up on the toe, driving the ankle upwards
    const drive = Math.max(0, (s - 0.55) / 0.45);
    const push = lerp(0, 0.2, run) * drive * drive;
    return { y: ground + pivot + push, z: ahead - (ahead + behind) * s };
  }

  const s = (t - stanceEnd) / (TAU - stanceEnd);
  const eased = s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s);
  // The heel comes up towards the backside at a run. Because the solver works
  // from the ankle, lifting it this far is also what folds the knee right up —
  // no separate "tuck the knee" term needed.
  const lift = Math.sin(s * Math.PI) * lerp(0.09, 0.34, run);
  return { y: ground + lift, z: -behind + (ahead + behind) * eased };
}

/** One leg, posed from its own place in the cycle. */
function poseLeg(limb: Limb, theta: number, k: number, run: number, hipHeight: number) {
  const t = ((theta % TAU) + TAU) % TAU;
  const stride = lerp(STRIDE_WALK, STRIDE_RUN, run) * k;
  const target = footTarget(t, stride, hipHeight, run);
  const { thigh, knee } = solveLeg(target.y, target.z);

  limb.root.rotation.x = thigh;
  limb.lower.rotation.x = knee;

  if (limb.foot) {
    // cancel the chain so the sole sits parallel to the road, then roll it.
    // The split has to follow the same duty factor the leg is using, or the
    // ankle keeps rolling through toe-off for a while after the foot has
    // actually left the ground.
    const level = -(thigh + knee);
    const stanceEnd = TAU * lerp(DUTY_WALK, DUTY_RUN, run);
    let roll: number;
    if (t < stanceEnd) {
      const s = t / stanceEnd;
      // A walker lands toe-up on the heel. A runner lands nearly flat, on the
      // ball of the foot — so the heel-strike dip fades out as the pace rises.
      const strike = lerp(0.18, 0.02, run);
      roll = -strike * (1 - s) * (1 - s) + lerp(0.62, 0.78, run) * s * s * s;
    } else {
      const s = (t - stanceEnd) / (TAU - stanceEnd);
      roll = lerp(0.5, 0.72, run) * (1 - s) * (1 - s) - 0.26 * Math.sin(s * Math.PI);
    }
    limb.foot.rotation.x = level + roll * k;
  }
}

/** Applies a walk/run/idle/aim pose. Call once per character per frame. */
export function poseRig(rig: Rig, p: PoseParams) {
  const k = clamp(p.intensity, 0, 1);
  const run = clamp(p.run, 0, 1);
  const stride = p.phase;
  const swing = Math.sin(stride);
  const turn = p.turn ?? 0;
  const accel = p.accel ?? 0;

  const armAmp = lerp(0.46, 0.9, run) * k;

  /* body ------------------------------------------------------------------
     Settled first, because the legs are solved against wherever the hips end
     up. The pelvis is lowest at each heel strike and highest over mid-stance,
     so it rises twice per cycle; it also lists towards the swinging leg and
     rotates forward with it, against the shoulders. */
  // A walker is at their highest over mid-stance, vaulting over a straight
  // leg. A runner is at their highest in mid-FLIGHT and at their lowest at
  // mid-stance, where the knee is absorbing the landing — the oscillation is
  // the other way round and about twice as deep. Blending between the two
  // curves is most of what sells the change of gait from the waist up.
  const walkRise = (1 - Math.cos(stride * 2)) / 2;
  const runRise = (1 - Math.cos((stride - 1.1) * 2)) / 2;
  const rise = lerp(walkRise, runRise, run);
  // The pelvis has to sit below full leg extension or there is no room left to
  // take a step — and it drops further at a run to make room for the knee lift.
  const hipHeight =
    HIP_HEIGHT - lerp(0.03, 0.13, run) * k + rise * lerp(0.05, 0.095, run) * k;
  rig.hips.position.y = hipHeight;
  // Measured on a person at this speed the pelvis lists about 3 degrees and
  // rotates about 4; this used to yaw 7.4 each way, which is runway-model
  // territory and reads as a stagger.
  rig.hips.rotation.z = -swing * 0.048 * k + turn * 0.06;
  rig.hips.rotation.y = swing * 0.075 * k;
  rig.hips.rotation.x = -turn * turn * 0.03;

  /* legs ------------------------------------------------------------------ */
  const [legR, legL] = rig.legs;
  poseLeg(legR, stride, k, run, hipHeight);
  poseLeg(legL, stride + Math.PI, k, run, hipHeight);

  const idle = Math.sin(p.time * 1.5 + rig.seed);
  // slow weight shift from one foot to the other while standing still
  const shift = Math.sin(p.time * 0.6 + rig.seed * 1.7);
  const still = 1 - k;

  rig.torso.rotation.x = lerp(0.06, 0.26, run) * k + still * 0.02 + accel * 0.07;
  rig.torso.rotation.y = -swing * 0.115 * k + still * shift * 0.05;
  // The shoulders roll AGAINST the pelvis. That counter-roll is what keeps a
  // walking head travelling in a near-straight line — rolling both the same way
  // stacked the two and swung the head 6.5 cm each way per step, which is
  // exactly what drunk looks like.
  rig.torso.rotation.z = swing * 0.016 * k - turn * 0.075 + still * shift * 0.03;
  rig.torso.position.y = 0.04 + still * idle * 0.014;
  rig.torso.position.x = still * shift * 0.018;

  // the head leads the turn and stays level whatever the torso is doing
  // hips + torso + this comes to roughly zero: the head keeps pointing where
  // you are going, however much the body underneath it is rotating
  rig.head.rotation.y = swing * 0.045 * k + turn * 0.13 + still * shift * 0.22;
  rig.head.rotation.x = -rig.torso.rotation.x * 0.7 + still * idle * 0.03;
  rig.head.rotation.z = turn * -0.06;

  /* arms ------------------------------------------------------------------ */
  const [armR, armL] = rig.arms;
  const taunt = p.taunt ?? 0;
  // Each arm opposes the leg on its own side: at heel strike the right leg is
  // forward, so the right arm is back. cos() rather than sin() puts the arms in
  // the right place in the cycle relative to the new gait.
  const armSwingR = Math.cos(stride);
  const armSwingL = Math.cos(stride + Math.PI);

  if (p.aiming) {
    const kick = p.recoil * 0.5;
    // Both hands converge on the centreline: a pistol held out at arm's length
    // on one side is a stance nobody uses. Note it is rotation.z that swings an
    // arm sideways here, not .y — Euler XYZ applies Z first, while the limb is
    // still hanging straight down, and .y at that point only twists it.
    armR.root.rotation.set(-Math.PI / 2 + p.aimPitch + kick, 0.1, 0.3);
    armR.lower.rotation.set(-0.14, 0, 0);
    armL.root.rotation.set(-Math.PI / 2 + p.aimPitch + kick + 0.06, -0.1, -0.52);
    armL.lower.rotation.set(-0.42, 0, 0);
    rig.torso.rotation.y -= 0.22;
    rig.head.rotation.x = -p.aimPitch * 0.5;
    rig.gun.visible = rig.armed;
  } else if (taunt > 0) {
    const shake = Math.sin(p.time * 9 + rig.seed) * 0.25 * taunt;
    armL.root.rotation.set(-1.5 * taunt, 0.5 * taunt, 0.8 * taunt + shake);
    armR.root.rotation.set(-1.5 * taunt, -0.5 * taunt, -0.8 * taunt - shake);
    armL.lower.rotation.x = -0.9 * taunt;
    armR.lower.rotation.x = -0.9 * taunt;
    rig.head.rotation.x += 0.18 * taunt;
    rig.gun.visible = rig.armed;
  } else {
    // arms swing across the body a little as well as fore-and-aft
    // the hands also come across the chest as the pace picks up
    const across = lerp(0.1, 0.24, run) * k;
    armL.root.rotation.set(
      armSwingL * armAmp,
      -armSwingL * across,
      IDLE_ARM + still * 0.04 + Math.max(0, armSwingL) * 0.06 * k,
    );
    armR.root.rotation.set(
      armSwingR * armAmp,
      -armSwingR * across,
      -IDLE_ARM - still * 0.04 - Math.max(0, armSwingR) * 0.06 * k,
    );
    // Walking, the elbow closes on the forward swing and opens as the arm goes
    // back — a pendulum. Running, it locks near a right angle and stays there,
    // and the whole arm drives from the shoulder instead. That fixed elbow is
    // the most recognisable thing about a running upper body.
    const elbow = lerp(0.22, 1.3, run);
    const elbowGive = lerp(0.5, 0.3, run);
    armL.lower.rotation.x = -elbow - Math.max(0, armSwingL) * elbowGive * k;
    armR.lower.rotation.x = -elbow - Math.max(0, armSwingR) * elbowGive * k;

    if (rig.armed) {
      // Carried low, but still a person walking — the old pose pinned the
      // elbow at ninety degrees and stopped the arm swinging altogether, which
      // read as a broken limb sticking out sideways.
      // The gun hand cannot pump like the free one, but it should not carry the
      // pistol at a stroll while the rest of the body is sprinting: at pace it
      // comes up and tucks in, the way you actually run holding something.
      armR.root.rotation.x = armSwingR * armAmp * 0.8 - 0.1 - run * 0.26;
      armR.root.rotation.y = 0.16;
      armR.root.rotation.z = 0.13;
      armR.lower.rotation.x =
        -lerp(0.34, 1.15, run) - Math.max(0, armSwingR) * lerp(0.28, 0.2, run) * k;
      rig.gun.visible = true;

      const f = p.hipFire ?? 0;
      if (f > 0) {
        const ease = f * f * (3 - 2 * f);
        const kick = p.recoil * 0.42;
        armR.root.rotation.x = lerp(
          armR.root.rotation.x,
          -Math.PI / 2 + p.aimPitch * 0.65 + kick + 0.16,
          ease,
        );
        armR.root.rotation.y = lerp(armR.root.rotation.y, 0.1, ease);
        armR.root.rotation.z = lerp(armR.root.rotation.z, 0.22, ease);
        armR.lower.rotation.x = lerp(armR.lower.rotation.x, -0.18, ease);
        armL.root.rotation.x = lerp(armL.root.rotation.x, -0.75, ease * 0.8);
        armL.root.rotation.z = lerp(armL.root.rotation.z, -0.34, ease * 0.8);
        armL.lower.rotation.x = lerp(armL.lower.rotation.x, -0.85, ease * 0.8);
        rig.torso.rotation.y = lerp(rig.torso.rotation.y, -0.2, ease);
        rig.head.rotation.x = lerp(rig.head.rotation.x, -p.aimPitch * 0.4, ease);
      }
    }
  }

  /* phone up: someone photographing a wall -------------------------------- */
  const phone = p.phone ?? 0;
  if (phone > 0.001 && !p.aiming) {
    const e = phone * phone * (3 - 2 * phone);
    armR.root.rotation.x = lerp(armR.root.rotation.x, -1.3, e);
    armR.root.rotation.y = lerp(armR.root.rotation.y, 0.3, e);
    armR.root.rotation.z = lerp(armR.root.rotation.z, 0.3, e);
    armR.lower.rotation.x = lerp(armR.lower.rotation.x, -0.85, e);
    armL.root.rotation.x = lerp(armL.root.rotation.x, -1.22, e);
    armL.root.rotation.y = lerp(armL.root.rotation.y, -0.3, e);
    armL.root.rotation.z = lerp(armL.root.rotation.z, -0.36, e);
    armL.lower.rotation.x = lerp(armL.lower.rotation.x, -0.95, e);
    rig.head.rotation.x = lerp(rig.head.rotation.x, -0.1, e);
  }

  /* ragdoll-lite: fall face down ------------------------------------------ */
  if (p.down > 0) {
    const d = p.down;
    rig.root.rotation.x = -d * (Math.PI / 2) * 0.98;
    rig.root.position.y = -d * 0.05;
    rig.hips.rotation.set(0, 0, 0);
    legL.root.rotation.x = -0.25 * d;
    legR.root.rotation.x = 0.3 * d;
    legL.lower.rotation.x = -0.5 * d;
    legR.lower.rotation.x = -0.2 * d;
    if (legL.foot) legL.foot.rotation.x = 0.2 * d;
    if (legR.foot) legR.foot.rotation.x = -0.1 * d;
    armL.root.rotation.set(-1.1 * d, 0.4 * d, 0.6 * d);
    armR.root.rotation.set(-0.6 * d, -0.5 * d, -0.9 * d);
    rig.gun.visible = false;
    rig.head.rotation.set(0, 0, 0);
  } else if (rig.root.rotation.x !== 0) {
    rig.root.rotation.x = 0;
    rig.root.position.y = 0;
  }
}
