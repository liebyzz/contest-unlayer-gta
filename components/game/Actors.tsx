"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GANG, player, world } from "@/lib/game/world";
import { playerState } from "@/lib/game/playerState";
import { createRig, disposeRig, poseRig, type Rig } from "@/lib/game/characterRig";
import { createCar, NOSE_OFFSET, type CarModel } from "@/lib/game/carModel";
import { glowTexture } from "@/lib/game/facades";
import { useGraffiti } from "@/lib/graffiti/graffitiStore";
import { keepInReveal, revealView } from "./RevealClearance";
import { skipReflection } from "@/lib/game/layers";

/* ── shouted lines ───────────────────────────────────────────────────────── */
const barkCache = new Map<string, THREE.Texture>();
function barkTexture(text: string, colour: string) {
  const key = `${text}|${colour}`;
  const hit = barkCache.get(key);
  if (hit) return hit;

  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '58px Anton, Impact, "Arial Black", sans-serif';

  const w = Math.min(500, ctx.measureText(text).width + 44);
  const x = 256 - w / 2;
  // speech slab
  ctx.fillStyle = "rgba(10,7,16,0.86)";
  ctx.fillRect(x, 22, w, 66);
  ctx.fillStyle = colour;
  ctx.fillRect(x, 22, 4, 66);
  ctx.beginPath();
  ctx.moveTo(240, 88);
  ctx.lineTo(272, 88);
  ctx.lineTo(256, 108);
  ctx.closePath();
  ctx.fillStyle = "rgba(10,7,16,0.86)";
  ctx.fill();

  ctx.fillStyle = "#f6f1e8";
  ctx.fillText(text, 256, 56);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  barkCache.set(key, tex);
  return tex;
}

/* ── phones out ──────────────────────────────────────────────────────────── */
const PHONE_POOL = 6;

/**
 * The glow of a phone screen held up at a wall, and the flash when it fires.
 * Sprites rather than lights: six real point lights popping on and off would
 * cost more than the rest of the crowd put together.
 */
function PhoneFlashes() {
  const group = useRef<THREE.Group>(null);
  const flashes = useRef<THREE.Sprite[]>([]);
  const screens = useRef<THREE.Sprite[]>([]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    flashes.current = [];
    screens.current = [];
    for (let i = 0; i < PHONE_POOL; i++) {
      const flash = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: "#fffbe8",
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      flash.visible = false;
      const screen = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: "#9fe8ff",
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      screen.visible = false;
      screen.scale.set(0.16, 0.16, 1);
      g.add(flash, screen);
      flashes.current.push(flash);
      screens.current.push(screen);
    }
    const all = [...flashes.current, ...screens.current];
    return () => all.forEach((s) => s.removeFromParent());
  }, []);

  useFrame(() => {
    // the first frame can arrive before the pool has been built
    if (flashes.current.length < PHONE_POOL || screens.current.length < PHONE_POOL) return;
    let n = 0;
    for (const p of world.people) {
      if (n >= PHONE_POOL) break;
      if (p.phone < 0.6 || p.state === "down") continue;
      const fx = p.x + Math.sin(p.yaw) * 0.42;
      const fz = p.z + Math.cos(p.yaw) * 0.42;
      const screen = screens.current[n];
      screen.visible = true;
      screen.position.set(fx, 1.5, fz);
      const flash = flashes.current[n];
      flash.visible = p.flash > 0;
      if (flash.visible) {
        const k = p.flash / 0.14;
        flash.position.set(fx + Math.sin(p.yaw) * 0.05, 1.52, fz + Math.cos(p.yaw) * 0.05);
        flash.scale.setScalar(0.6 + k * 1.4);
        (flash.material as THREE.SpriteMaterial).opacity = k;
      }
      n++;
    }
    for (let i = n; i < PHONE_POOL; i++) {
      flashes.current[i].visible = false;
      screens.current[i].visible = false;
    }
  });

  return <group ref={group} />;
}

/** Slabs on screen at once. More than this and a rousing reads as a wall of text. */
const BARK_POOL = 5;

function Barks() {
  const group = useRef<THREE.Group>(null);
  const sprites = useRef<THREE.Sprite[]>([]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    for (let i = 0; i < BARK_POOL; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false }),
      );
      s.renderOrder = 20;
      s.visible = false;
      s.scale.set(2.6, 0.65, 1);
      g.add(s);
      sprites.current.push(s);
    }
    const all = sprites.current;
    return () => all.forEach((s) => s.removeFromParent());
  }, []);

  useFrame(() => {
    // Only the nearest few get a speech slab, so a riot doesn't fill the screen.
    // None during the reveal: a slab is drawn over everything, the middle of
    // that shot is the piece, and the shot is the photograph the black book keeps.
    const { phase } = useGraffiti.getState();
    const revealing = phase === "reveal" || phase === "tour";
    const talking = revealing
      ? []
      : world.people.filter(
          (p) => p.bark && p.barkTimer > 0 && p.barkDelay <= 0 && p.state !== "down",
        );
    talking.sort(
      (a, b) =>
        Math.hypot(a.x - playerState.x, a.z - playerState.z) -
        Math.hypot(b.x - playerState.x, b.z - playerState.z),
    );
    for (let i = 0; i < sprites.current.length; i++) {
      const s = sprites.current[i];
      const p = talking[i];
      if (!p || !p.bark) {
        s.visible = false;
        continue;
      }
      const colour =
        p.faction === "gang" ? GANG.colour : p.faction === "police" ? "#2a6bff" : "#c8ff32";
      const m = s.material as THREE.SpriteMaterial;
      m.map = barkTexture(p.bark, colour);
      m.opacity = Math.min(1, p.barkTimer * 1.6);
      s.visible = true;
      // A stable per-person step in height so two people shouting shoulder to
      // shoulder don't hang their slabs at exactly the same altitude.
      const lift = 2.5 + (p.id % 3) * 0.3;
      s.position.set(p.x, lift + Math.sin(world.time * 6 + p.id) * 0.04, p.z);
      // A fixed world size means whoever is shouting in your face gets a slab
      // half the screen wide. Growing it with distance keeps every bark about
      // the same size to read, wherever it comes from.
      const dist = Math.hypot(p.x - playerState.x, p.z - playerState.z);
      const k = THREE.MathUtils.clamp(dist / 7, 0.5, 1.5);
      s.scale.set(2.6 * k, 0.65 * k, 1);
    }
  });

  return <group ref={group} />;
}

/** Beyond this the crowd is a few pixels tall and not worth a draw call. */
const CROWD_DRAW_DISTANCE = 48;

/** The dark disc under everyone's feet — one of each, shared by the whole crowd. */
const FOOT_SHADOW_GEOMETRY = new THREE.CircleGeometry(0.34, 12);
const FOOT_SHADOW = new THREE.MeshBasicMaterial({
  color: "#000000",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

/* ── pedestrians, gang, police, army ─────────────────────────────────────── */
export function People() {
  const group = useRef<THREE.Group>(null);
  const rigs = useRef(new Map<number, Rig>());
  const body = useMemo(() => new THREE.Sphere(new THREE.Vector3(), 0.6), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    // build a rig for anyone who has just walked onto the block
    for (const p of world.people) {
      if (rigs.current.has(p.id)) continue;
      const rig = createRig({
        jacket: p.jacket,
        legs: p.legs,
        skin: p.skin,
        hat: p.hat,
        hair: p.hair ?? undefined,
        trim: p.faction === "police" ? "#22e0ff" : undefined,
        badge: p.faction === "police",
        armed: p.armed,
        gangColour: p.gangColour,
        bulk: p.bulk,
        height: p.height,
      });
      const shadow = new THREE.Mesh(FOOT_SHADOW_GEOMETRY, FOOT_SHADOW);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      rig.root.add(shadow);
      // the crowd is part of the reveal, never something in the way of it
      keepInReveal(rig.root);
      skipReflection(rig.root);
      g.add(rig.root);
      rigs.current.set(p.id, rig);
    }

    // and retire anyone who has left it
    if (rigs.current.size > world.people.length) {
      const live = new Set(world.people.map((p) => p.id));
      for (const [id, rig] of rigs.current) {
        if (!live.has(id)) {
          rig.root.removeFromParent();
          disposeRig(rig);
          rigs.current.delete(id);
        }
      }
    }

    for (const p of world.people) {
      const rig = rigs.current.get(p.id);
      if (!rig) continue;
      rig.root.position.set(p.x, 0, p.z);
      rig.root.rotation.y = p.yaw;

      // A rig is nineteen meshes, and twenty-odd people on the block is most of
      // the draw calls in the frame. Anyone far enough away to be four pixels
      // tall gets switched off wholesale — one flag on the root skips the lot,
      // and skipping poseRig for them saves the IK as well.
      let hide =
        Math.hypot(p.x - playerState.x, p.z - playerState.z) > CROWD_DRAW_DISTANCE;
      // Anyone squaring up to the writer steps out of the reveal shot. The
      // crowd admiring the piece stays in it — they are the best part of it.
      if (
        !hide &&
        revealView.active &&
        p.armed &&
        (p.state === "taunt" || p.state === "chase" || p.state === "engage")
      ) {
        body.center.set(p.x, 0.95, p.z);
        hide = revealView.frustum.intersectsSphere(body);
      }
      if (hide !== !rig.root.visible) rig.root.visible = !hide;
      if (hide) continue;

      const running = p.state === "flee" || p.state === "chase";
      const standing =
        p.state === "engage" ||
        p.state === "taunt" ||
        p.state === "down" ||
        (p.state === "admire" && p.phone > 0);
      const intensity = standing ? 0 : running ? 1 : 0.72;

      poseRig(rig, {
        phase: p.phase,
        intensity,
        run: running ? 1 : 0,
        turn: 0,
        accel: 0,
        aiming: p.armed && p.state === "engage",
        aimPitch: 0,
        down: p.downTilt,
        recoil: p.fireCooldown > 1.2 ? 1 : 0,
        time: t,
        taunt: p.taunt,
        phone: p.phone,
      });
    }
  });

  return (
    <>
      <group ref={group} />
      <Barks />
      <PhoneFlashes />
    </>
  );
}

/* ── traffic, pursuit, air support and armour ────────────────────────────── */
export function Traffic() {
  const group = useRef<THREE.Group>(null);
  const models = useRef(new Map<number, CarModel>());

  useFrame((state, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;

    for (const car of world.cars) {
      if (models.current.has(car.id)) continue;
      const model = createCar(car.kind, car.colour);
      g.add(model.root);
      models.current.set(car.id, model);
    }
    if (models.current.size > world.cars.length) {
      const live = new Set(world.cars.map((c) => c.id));
      for (const [id, m] of models.current) {
        if (!live.has(id)) {
          m.root.removeFromParent();
          models.current.delete(id);
        }
      }
    }

    void t;
    for (const car of world.cars) {
      const m = models.current.get(car.id);
      if (!m) continue;
      m.root.position.set(car.x, 0, car.z);
      // car.yaw is a simulated heading (+Z forward); the mesh is nose-along-+X
      m.root.rotation.y = car.yaw + NOSE_OFFSET;

      const spin = (car.speed / 0.34) * dt;
      for (const w of m.wheels) w.rotation.y -= spin;

      const braking = car.speed < 2.5;
      for (const b of m.brake) {
        (b.material as THREE.MeshBasicMaterial).opacity = braking ? 0.95 : 0.4;
      }

      if (car.damage > 0.4) {
        m.root.rotation.z = Math.sin(car.id * 2.3) * car.damage * 0.06;
      }
    }
  });

  return <group ref={group} />;
}

/* ── bullets, sparks, smoke, explosions ──────────────────────────────────── */
const POOL = 24;

export function CombatFx() {
  const tracers = useRef<THREE.Mesh[]>([]);
  const sparks = useRef<THREE.Sprite[]>([]);
  const puffs = useRef<THREE.Sprite[]>([]);
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    const g = group.current;
    if (!g) return;

    const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: "#ffe9a8",
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < POOL; i++) {
      // its own material: each streak fades on its own clock
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      g.add(m);
      tracers.current.push(m);
    }

    const sparkMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: "#ffd27a",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (let i = 0; i < POOL; i++) {
      const s = new THREE.Sprite(sparkMat.clone());
      s.visible = false;
      g.add(s);
      sparks.current.push(s);
    }

    const smokeMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: "#3a3138",
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.visible = false;
      g.add(s);
      puffs.current.push(s);
    }

    const all = [...tracers.current, ...sparks.current, ...puffs.current];
    return () => all.forEach((o) => o.removeFromParent());
  }, []);

  useFrame(() => {
    for (let i = 0; i < tracers.current.length; i++) {
      const m = tracers.current[i];
      const b = world.bullets[i];
      if (!b) {
        m.visible = false;
        continue;
      }
      // A short streak flying down the line, not the line itself. Drawing the
      // whole muzzle-to-impact segment made every shot look like a laser beam
      // stapled across the street.
      const len = Math.hypot(b.dx, b.dy, b.dz) || 1;
      const streak = Math.min(5, len * 0.45);
      const travel = Math.min(1, b.life / 0.075);
      // centre of the streak slides from the muzzle to the impact point
      const at = streak / 2 / len + travel * (1 - streak / len);
      m.visible = true;
      m.position.set(b.x + b.dx * at, b.y + b.dy * at, b.z + b.dz * at);
      m.scale.set(1, 1, streak);
      m.lookAt(b.x + b.dx, b.y + b.dy, b.z + b.dz);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - travel * 0.6);
    }

    for (let i = 0; i < sparks.current.length; i++) {
      const s = sparks.current[i];
      const imp = world.impacts[i];
      if (!imp) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.position.set(imp.x, imp.y, imp.z);
      const k = imp.life / 0.42;
      s.scale.setScalar(0.32 + (1 - k) * 0.5);
      const m = s.material as THREE.SpriteMaterial;
      m.opacity = k;
      m.color.set(imp.blood ? "#c8203a" : "#ffd27a");
    }

    for (let i = 0; i < puffs.current.length; i++) {
      const s = puffs.current[i];
      const d = world.smoke[i];
      if (!d) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.position.set(d.x, d.y, d.z);
      s.scale.setScalar(1.4 * d.scale);
      (s.material as THREE.SpriteMaterial).opacity = Math.min(0.55, d.life * 0.3);
    }
  });

  return <group ref={group} />;
}

/** The flash at the muzzle, parented to the player's hand position. */
export function MuzzleFlash({ target }: { target: React.RefObject<THREE.Object3D | null> }) {
  const sprite = useRef<THREE.Sprite>(null);

  useFrame(() => {
    const s = sprite.current;
    if (!s) return;
    const on = player.muzzle > 0;
    s.visible = on;
    if (!on) return;
    const t = target.current;
    if (t) t.getWorldPosition(s.position);
    s.scale.setScalar(0.5 + Math.random() * 0.5);
  });

  return (
    <sprite ref={sprite} visible={false}>
      <spriteMaterial
        map={glowTexture()}
        color="#ffdf9a"
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}
