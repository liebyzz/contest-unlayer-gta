/**
 * The living city.
 *
 * Traffic, pedestrians, the Carmine Kings, the police response and every
 * bullet live in this one plain-JS simulation. React never sees a frame of it —
 * the renderers read these arrays inside `useFrame` and push transforms
 * straight onto three objects. Only genuinely rare events (death, wanted level,
 * gang alert) are pushed back into the store.
 *
 * The job: Vance sent you into Carmine turf to paint over their marks. Every
 * piece you put up is an insult, and the block answers for it.
 *
 * Deliberately restrained: the heat is officers on foot, never a convoy. The
 * street should stay readable while you're looking for the next wall.
 */
import { SPAWN, insideAnyBox } from "./city";
import { playerState } from "./playerState";
import { resolveMove } from "./movement";
import { STRIDE_RUN, STRIDE_WALK } from "./characterRig";
import { CAB_WIDTH_SCALE, CAR_SHAPE, HULL_FLOOR, ROOF_CAP, VAN_FLOOR } from "./carShape";
import type { GraffitiSpot } from "@/lib/graffiti/graffitiTypes";

/* ── maths helpers ───────────────────────────────────────────────────────── */
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function wrapAngle(a: number) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function turnToward(current: number, target: number, maxStep: number) {
  const d = wrapAngle(target - current);
  return current + clamp(d, -maxStep, maxStep);
}

let seed = 1337;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const between = (a: number, b: number) => a + rnd() * (b - a);
const pickOne = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

/* ── paths ───────────────────────────────────────────────────────────────── */
export interface Path {
  pts: [number, number][];
  cum: number[];
  length: number;
}

function makePath(pts: [number, number][]): Path {
  const cum = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(total);
  }
  total += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return { pts, cum, length: total };
}

function sample(path: Path, s: number): [number, number, number] {
  const d = ((s % path.length) + path.length) % path.length;
  const n = path.pts.length;
  let i = 0;
  while (i < n - 1 && path.cum[i + 1] <= d) i++;
  const a = path.pts[i];
  const b = path.pts[(i + 1) % n];
  const segStart = path.cum[i];
  const segLen = (i === n - 1 ? path.length : path.cum[i + 1]) - segStart || 0.0001;
  const t = clamp((d - segStart) / segLen, 0, 1);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), Math.atan2(b[0] - a[0], b[1] - a[1])];
}

/**
 * A rounded U-turn at the end of a two-lane street.
 *
 * The sweep direction has to be derived from the heading the car arrives on,
 * not just from the two end angles: pick the wrong way round and the arc
 * doubles back into the street, which is what made traffic crab sideways at
 * the west end of Marlow Street.
 */
function uTurn(
  cx: number,
  cz: number,
  from: [number, number],
  to: [number, number],
  incoming: [number, number],
  steps = 9,
): [number, number][] {
  const a0 = Math.atan2(from[1] - cz, from[0] - cx);
  const a1 = Math.atan2(to[1] - cz, to[0] - cx);
  const r = Math.hypot(from[0] - cx, from[1] - cz);

  // tangent at the start for a positive sweep
  const tangentX = -Math.sin(a0);
  const tangentZ = Math.cos(a0);
  const sign = tangentX * incoming[0] + tangentZ * incoming[1] >= 0 ? 1 : -1;

  let delta = wrapAngle(a1 - a0);
  if (sign > 0 && delta <= 0) delta += TAU;
  if (sign < 0 && delta >= 0) delta -= TAU;
  if (Math.abs(delta) < 0.05) delta = sign * Math.PI;

  const out: [number, number][] = [];
  for (let i = 1; i < steps; i++) {
    const a = a0 + (delta * i) / steps;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

const LANE = 1.75;

const MAIN_LOOP = makePath([
  [-41, LANE],
  [38, LANE],
  ...uTurn(38, 0, [38, LANE], [38, -LANE], [1, 0]),
  [38, -LANE],
  [-41, -LANE],
  ...uTurn(-41, 0, [-41, -LANE], [-41, LANE], [-1, 0]),
]);

const SIDE_LOOP = makePath([
  [18.4, 30],
  [18.4, -23],
  ...uTurn(20.4, -23, [18.4, -23], [22.4, -23], [0, -1]),
  [22.4, -23],
  [22.4, 30],
  ...uTurn(20.4, 30, [22.4, 30], [18.4, 30], [0, 1]),
]);

const PED_ROUTES: Path[] = [
  makePath([
    [-38, -6.6],
    [9, -6.6],
    [9, 6.6],
    [-38, 6.6],
  ]),
  makePath([
    [15.2, -6.6],
    [39, -6.6],
    [39, 6.6],
    [15.2, 6.6],
  ]),
  makePath([
    [15.0, -22],
    [25.8, -22],
    [25.8, 28],
    [15.0, 28],
  ]),
  makePath([
    [-25.6, 10],
    [-25.6, 24],
    [-22.4, 24],
    [-22.4, 10],
  ]),
];

const COP_ROUTES: Path[] = [
  makePath([
    [-30, 6.6],
    [4, 6.6],
    [4, -6.6],
    [-30, -6.6],
  ]),
  makePath([
    [16.2, 10],
    [16.2, 26],
    [25.4, 26],
    [25.4, 10],
  ]),
  makePath([
    [26, -6.6],
    [40, -6.6],
    [40, 6.6],
    [26, 6.6],
  ]),
];

/* ── the Carmine Kings ───────────────────────────────────────────────────── */
export const GANG = {
  name: "CARMINE KINGS",
  short: "CARMINE",
  colour: "#e01e37",
  accent: "#ff5470",
};

const GANG_BARKS = [
  "THAT'S OUR WALL!",
  "WRONG BLOCK, WRITER!",
  "GET HIM!",
  "YOU DON'T PAINT HERE!",
  "CARMINE FOR LIFE!",
  "HE'S TAGGING OUR TURF!",
  "PUT HIM DOWN!",
];

const COP_BARKS = ["FREEZE!", "DROP THE CAN!", "HANDS UP!", "STOP RIGHT THERE!"];
const PANIC_BARKS = ["RUN!", "HE'S GOT A GUN!", "SOMEBODY CALL SOMEONE!"];
const ADMIRE_BARKS = [
  "YO, THAT'S FIRE",
  "WHO DID THIS?",
  "THAT WASN'T THERE A MINUTE AGO",
  "OKAY, I SEE YOU",
  "POSTING THIS",
  "THE KINGS ARE GONNA LOSE IT",
  "CLEAN LINES",
];

/* ── actors ──────────────────────────────────────────────────────────────── */
export type CarKind = "sedan" | "hatch" | "van" | "pickup";

export interface Car {
  id: number;
  path: Path;
  s: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  cruise: number;
  kind: CarKind;
  colour: string;
  damage: number;
  crashTimer: number;
  hornTimer: number;
  spin: number;
}

export type Faction = "civilian" | "gang" | "police";
export type PersonState = "walk" | "flee" | "taunt" | "chase" | "engage" | "down" | "admire";

export interface Person {
  id: number;
  faction: Faction;
  path: Path;
  s: number;
  offset: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  phase: number;
  state: PersonState;
  health: number;
  maxHealth: number;
  timer: number;
  fireCooldown: number;
  fleeX: number;
  fleeZ: number;
  jacket: string;
  legs: string;
  skin: string;
  hat: string | null;
  hair: string | null;
  gangColour?: string;
  bulk: number;
  height: number;
  armed: boolean;
  /** shot accuracy: smaller is deadlier */
  spread: number;
  damage: number;
  downTilt: number;
  taunt: number;
  bark: string | null;
  barkTimer: number;
  /** counts down before the line is shown, so a roused crowd doesn't shout in unison */
  barkDelay: number;
  /** called in by the wanted level rather than part of the ambient crowd */
  responder: boolean;
  /**
   * Seconds before this one is allowed to pull a trigger.
   *
   * A piece landing rouses everyone at once, and without this the whole block
   * opens up on the same frame the studio closes — the player comes back from
   * the editor into a crossfire they had no way to see coming. The pause is
   * long enough to turn round, read the wedges and start running.
   */
  holdFire: number;
  /** admiring a fresh piece: where to stand, and the wall to look at */
  standX: number;
  standZ: number;
  lookX: number;
  lookZ: number;
  /** 0-1, phone up to take a picture of it */
  phone: number;
  /** seconds left on the phone's flash */
  flash: number;
  /** seconds until the next picture */
  shutter: number;
}

export interface Bullet {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  life: number;
  fromPlayer: boolean;
}

export interface Impact {
  x: number;
  y: number;
  z: number;
  life: number;
  blood: boolean;
}

export interface Debris {
  x: number;
  y: number;
  z: number;
  life: number;
  scale: number;
}

export const world = {
  cars: [] as Car[],
  people: [] as Person[],
  bullets: [] as Bullet[],
  impacts: [] as Impact[],
  smoke: [] as Debris[],
  shake: 0,
  time: 0,
  /** how angry the Kings are, 0-1 — drives the HUD and how many turn up */
  gangHeat: 0,
  /**
   * Free-paint mode: the block still lives — traffic, pedestrians, the Kings
   * on their corners — but nobody draws on you and nothing can hurt you.
   *
   * This exists because the game is a showcase for an image editor, and the
   * fastest way to lose someone who came to look at the editor is to kill them
   * thirty seconds after their first piece.
   */
  peaceful: false,
};

/** Switch between STORY and FREE PAINT. Called once, from the menu. */
export function setPeaceful(on: boolean) {
  world.peaceful = on;
  if (!on) return;
  player.wanted = 0;
  player.heat = 0;
  world.gangHeat = 0;
  for (const p of world.people) {
    if (p.state === "down") continue;
    if (p.responder) continue;
    if (p.state !== "walk") {
      p.state = "walk";
      p.speed = between(1.1, 1.6);
      rejoinRoute(p);
    }
  }
  world.people = world.people.filter((p) => !p.responder || p.state === "down");
}

export const player = {
  health: 100,
  maxHealth: 100,
  aiming: false,
  ammo: 12,
  clip: 12,
  reserve: 96,
  reloading: 0,
  fireCooldown: 0,
  recoil: 0,
  /** 1 the instant a shot leaves the barrel, decays — drives the hip-fire pose */
  fireAnim: 0,
  /** 0-5 stars */
  wanted: 0,
  heat: 0,
  dead: false,
  deadTimer: 0,
  /**
   * True whenever the player is watching rather than playing — the arrival
   * shot, the reveal. The world carries on around them in both, so nothing may
   * take a swing at someone who cannot move out of the way.
   */
  safe: false,
  hurt: 0,
  kills: 0,
  muzzle: 0,
  /** seconds since anything last hurt us — gates regeneration */
  sinceHit: 99,
  /**
   * Where the last few hits came from, as world-space bearings.
   *
   * Half the shots that land come from someone off the edge of the frame, and
   * without this the only feedback is the health bar dropping — you know you
   * are being shot, not which way to turn. The HUD reads these straight off.
   */
  hits: [] as { angle: number; life: number }[],
};

/** How long a damage arc stays on screen. */
const HIT_MARK_LIFE = 1.5;

/**
 * Wait this long after the last hit, then heal at this rate.
 *
 * Tuned around running away rather than winning: breaking line of sight and
 * putting a corner between you and the block should have you back on your feet
 * in about eight seconds, which is roughly how long it takes to walk to the
 * next wall.
 */
const REGEN_DELAY = 4;
const REGEN_RATE = 13;

/**
 * How many of them may have the player in their sights at once.
 *
 * Ten gang members at eleven metres with a one-second cadence is fifteen damage
 * a second and nothing to do about it — a piece landing was followed by eight
 * seconds and a WASTED card. Only the nearest few actually shoot; the rest
 * close in, which reads as a crowd bearing down on you and is survivable
 * enough to be a fight rather than an execution.
 *
 * Three of them works out at a shade under four damage a second, so standing
 * in the open doing nothing kills you in about twenty-five seconds. That is
 * enough pressure to make you move and enough room to get a shot off, take a
 * photograph of the piece, and leave.
 */
const MAX_SHOOTERS = 3;

/** ...and how that loosens as the police response escalates. */
function shooterBudget() {
  if (player.wanted >= 5) return MAX_SHOOTERS + 2;
  if (player.wanted >= 3) return MAX_SHOOTERS + 1;
  return MAX_SHOOTERS;
}

// Anyone without a hat used to walk around bald, which is most of why a crowd
// of these reads as shop dummies rather than people.
const HAIR = ["#241b16", "#12100f", "#4a3524", "#6b5a44", "#2b1d1a", "#8a7358"];

const CIVILIAN_LOOKS = [
  { jacket: "#6d4a52", legs: "#2b2f3a", skin: "#c98d63", hat: null },
  { jacket: "#2f4a5e", legs: "#3a3630", skin: "#8a5a3c", hat: "#c8ff32" },
  { jacket: "#4a4636", legs: "#26242c", skin: "#e0b48c", hat: null },
  { jacket: "#4a3f5e", legs: "#2b3444", skin: "#6b4429", hat: "#ff8b3d" },
  { jacket: "#356052", legs: "#31303a", skin: "#c98d63", hat: null },
  { jacket: "#7a6236", legs: "#232630", skin: "#a06a42", hat: "#22e0ff" },
];

const GANG_LOOKS = [
  { jacket: "#2a1016", legs: "#1d1a20", skin: "#8a5a3c" },
  { jacket: "#3b1220", legs: "#232028", skin: "#c98d63" },
  { jacket: "#1c1418", legs: "#2a2028", skin: "#6b4429" },
  { jacket: "#33161e", legs: "#1f1c24", skin: "#a06a42" },
];

let nextId = 1;

function spawnCar(path: Path, s: number, kind: CarKind, colour: string): Car {
  const [x, z, yaw] = sample(path, s);
  return {
    id: nextId++,
    path,
    s,
    x,
    z,
    yaw,
    speed: between(5, 8),
    cruise: between(6.5, 10),
    kind,
    colour,
    damage: 0,
    crashTimer: 0,
    hornTimer: 0,
    spin: 0,
  };
}

function spawnPerson(path: Path, s: number, faction: Faction, responder = false): Person {
  const [x, z, yaw] = sample(path, s);
  const isCop = faction === "police";
  const isGang = faction === "gang";
  const tactical = isCop && responder && player.wanted >= 4;

  const look = isCop
    ? { jacket: tactical ? "#20242e" : "#18243f", legs: "#141a2a", skin: "#c98d63", hat: "#0f1626" }
    : isGang
      ? { ...pickOne(GANG_LOOKS), hat: null as string | null }
      : pickOne(CIVILIAN_LOOKS);

  return {
    id: nextId++,
    faction,
    path,
    s,
    offset: isCop ? 0 : between(-0.7, 0.7),
    x,
    z,
    yaw,
    speed: isCop ? between(1.25, 1.5) : between(1.05, 1.65),
    phase: rnd() * TAU,
    state: "walk",
    health: isCop ? (tactical ? 95 : 70) : isGang ? 55 : 45,
    maxHealth: isCop ? (tactical ? 95 : 70) : isGang ? 55 : 45,
    timer: 0,
    fireCooldown: between(0.6, 2),
    fleeX: 0,
    fleeZ: 0,
    jacket: look.jacket,
    legs: look.legs,
    skin: look.skin,
    hat: look.hat ?? null,
    // under a bandana as well as bare-headed; only a cap covers it
    hair: look.hat ? null : pickOne(HAIR),
    gangColour: isGang ? GANG.colour : undefined,
    bulk: isGang ? between(0.98, 1.12) : between(0.92, 1.05),
    height: between(0.96, 1.06),
    armed: isCop || isGang,
    spread: tactical ? 0.038 : isCop ? 0.06 : 0.085,
    // Deliberately soft. A block this small puts six of them around you the
    // moment a piece goes up, and at these ranges almost every round lands —
    // so a hit has to cost little enough that the answer is to run rather than
    // to reload a save.
    damage: tactical ? 7 : isCop ? 5 : 4,
    downTilt: 0,
    taunt: 0,
    bark: null,
    barkTimer: 0,
    barkDelay: 0,
    responder,
    holdFire: 0,
    standX: x,
    standZ: z,
    lookX: x,
    lookZ: z,
    phone: 0,
    flash: 0,
    shutter: 0,
  };
}

export function resetWorld() {
  seed = 1337;
  nextId = 1;
  world.cars = [];
  world.people = [];
  world.bullets = [];
  world.impacts = [];
  world.smoke = [];
  world.shake = 0;
  world.gangHeat = 0;

  // Light traffic on purpose. This is a walking game about looking at walls —
  // a full street of cars just gets between the player and the buildings.
  const bodies = ["#7d2c38", "#2f4a5e", "#b9b4ab", "#3b3f46", "#4d5a3a", "#7a5f2f", "#4f3a5e"];
  const kinds: CarKind[] = ["sedan", "hatch", "van", "pickup"];
  const MAIN_CARS = 3;
  const SIDE_CARS = 2;
  for (let i = 0; i < MAIN_CARS; i++) {
    world.cars.push(
      spawnCar(
        MAIN_LOOP,
        (MAIN_LOOP.length / MAIN_CARS) * i + between(-6, 6),
        pickOne(kinds),
        pickOne(bodies),
      ),
    );
  }
  for (let i = 0; i < SIDE_CARS; i++) {
    world.cars.push(
      spawnCar(
        SIDE_LOOP,
        (SIDE_LOOP.length / SIDE_CARS) * i + between(-6, 6),
        pickOne(kinds),
        pickOne(bodies),
      ),
    );
  }

  // the crowd: this is Carmine turf, so roughly half the block wears the colour
  PED_ROUTES.forEach((route, ri) => {
    const n = ri === 3 ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const faction: Faction = rnd() < 0.5 ? "gang" : "civilian";
      world.people.push(spawnPerson(route, (route.length / n) * i + between(-3, 3), faction));
    }
  });
  for (const route of COP_ROUTES) {
    world.people.push(spawnPerson(route, between(0, route.length), "police"));
  }

  player.health = player.maxHealth;
  player.aiming = false;
  player.ammo = player.clip;
  player.reserve = 96;
  player.reloading = 0;
  player.fireCooldown = 0;
  player.recoil = 0;
  player.fireAnim = 0;
  player.wanted = 0;
  player.heat = 0;
  player.dead = false;
  player.deadTimer = 0;
  player.hurt = 0;
  player.kills = 0;
  player.muzzle = 0;
  player.safe = false;
  player.sinceHit = 99;
  player.hits.length = 0;
}

/* ── events pushed back to React ─────────────────────────────────────────── */
export interface WorldHooks {
  onDeath?: () => void;
  onRespawn?: () => void;
  onWanted?: (level: number) => void;
  onReload?: () => void;
  onNotice?: (title: string, body: string, tone: "acid" | "magenta" | "gold") => void;
  onGangAlert?: () => void;
}
let hooks: WorldHooks = {};
export function setWorldHooks(next: WorldHooks) {
  hooks = next;
}

/** Text for the tier of response currently on the street. */
/**
 * Heat, in the Kings' own terms. There are no police on this block in this cut
 * of the game — the meter tracks how badly the gang whose turf you are painting
 * wants you off it, so it should not be talking about badges and tactical units.
 */
export const WANTED_TIERS = [
  { label: "CLEAN", detail: "Nobody's looking." },
  { label: "NOTICED", detail: "A lookout has you." },
  { label: "CALLED IN", detail: "The word is out on the block." },
  { label: "HUNTED", detail: "They're converging on you." },
  { label: "ALL OUT", detail: "Everyone they have is on the street." },
  { label: "BLOOD", detail: "The whole crew wants you gone." },
];

/**
 * Heat → stars. A threshold table rather than `floor(heat / 20)`: that only
 * ever reached five stars at exactly 100 heat, so the top tier was unreachable.
 */
const STAR_THRESHOLDS = [88, 68, 48, 28, 10];
function heatToLevel(heat: number) {
  for (let i = 0; i < STAR_THRESHOLDS.length; i++) {
    if (heat >= STAR_THRESHOLDS[i]) return 5 - i;
  }
  return 0;
}

function raiseHeat(amount: number, why?: string) {
  if (player.dead || world.peaceful) return;
  const before = player.wanted;
  player.heat = clamp(player.heat + amount, 0, 100);
  const after = heatToLevel(player.heat);
  if (after !== before) {
    player.wanted = after;
    hooks.onWanted?.(after);
    // No toast for a star going up. The stars themselves are already on screen
    // and the cards were stacking two deep over the middle of a fight — and
    // they talked about tactical units and badges that this cut of the game
    // does not have on the street any more.
    void why;
  }
}

/**
 * The last line used, so a crowd that all gets roused by the same event doesn't
 * end up shouting the identical sentence in overlapping slabs.
 */
let lastBark = "";

function bark(p: Person, lines: readonly string[]) {
  if (p.barkTimer > 0) return;
  let line = pickOne(lines);
  if (line === lastBark && lines.length > 1) line = pickOne(lines.filter((l) => l !== lastBark));
  lastBark = line;
  p.bark = line;
  p.barkTimer = between(2.2, 3.4);
  // Ten people reacting to the same piece landing used to pop ten slabs on the
  // same frame, stacked on each other and unreadable. Spreading the entrances
  // over a second turns that into a street answering back.
  p.barkDelay = rnd() * 0.95;
}

/** Seconds between a piece landing and the first round coming your way. */
const ALERT_GRACE = 3.2;
/**
 * ...and the first time it happens. Someone on their first piece has just come
 * out of a full-screen editor, has never seen the Kings turn on them, and does
 * not yet know the answer is to run — three seconds was WASTED before they had
 * worked out what the shouting was about.
 */
const FIRST_ALERT_GRACE = 6;
let alertsRaised = 0;
/** What the current countdown started at, for the HUD's bar. */
let graceTotal = ALERT_GRACE;

/**
 * How long until the Kings open fire, for the HUD: the longest any roused
 * member is still holding, and what that countdown started at. Zero once
 * anyone is allowed to shoot.
 */
export function alertCountdown() {
  if (world.peaceful) return { left: 0, total: graceTotal };
  let left = 0;
  for (const p of world.people) {
    if (p.faction !== "gang" || p.state === "down") continue;
    if (p.state !== "taunt" && p.state !== "chase" && p.state !== "engage") continue;
    left = Math.max(left, p.holdFire);
  }
  return { left, total: graceTotal };
}

/* ── the street notices ─────────────────────────────────────────────────── */
/**
 * A piece landing is the most interesting thing that has happened on the block
 * all night, and a street that walks straight past it is a street that did not
 * notice. So the nearest few people on the pavement stop, turn, walk over, and
 * get their phones out — which is also the best thing that can be in the frame
 * when the reveal photographs the wall.
 *
 * Only people who are just walking take part: in STORY the Kings have already
 * sent everyone within earshot running by the time this is called.
 */
export function piecesAdmired(spot: GraffitiSpot, max = 4) {
  const ny = spot.rotation[1];
  const nx = Math.sin(ny);
  const nz = Math.cos(ny);
  // along the wall
  const tx = nz;
  const tz = -nx;
  const [wx, , wz] = spot.position;

  // In FREE PAINT the Kings are only people on a corner, and they have eyes.
  const curious = (p: Person) =>
    (p.faction === "civilian" || (world.peaceful && p.faction === "gang")) &&
    p.state === "walk" &&
    !p.responder;
  const near = () =>
    world.people
      .filter((p) => curious(p) && Math.hypot(p.x - wx, p.z - wz) < 24)
      .sort((a, b) => Math.hypot(a.x - wx, a.z - wz) - Math.hypot(b.x - wx, b.z - wz));

  // The crowd is thin and spread over the whole block, so a wall at the far
  // end can have nobody within sight of it. A couple of passers-by come round
  // the corner rather than let the moment land on an empty street.
  const want = Math.min(2, max);
  let nearby = near();
  if (world.peaceful && nearby.length < want && world.people.length < 30) {
    const spots: [Path, number][] = [];
    for (const route of PED_ROUTES) {
      for (let at = 0; at < route.length; at += 2) {
        const [x, z] = sample(route, at);
        const d = Math.hypot(x - wx, z - wz);
        if (d > 9 && d < 17) spots.push([route, at]);
      }
    }
    for (let i = nearby.length; i < want && spots.length; i++) {
      const [route, at] = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
      world.people.push(spawnPerson(route, at, "civilian"));
    }
    nearby = near();
  }
  nearby = nearby.slice(0, max);

  nearby.forEach((p, i) => {
    // Spread out along the front of the piece rather than queueing on one
    // spot. A pavement with a car parked at the kerb (the Golden Noodle and
    // its pickup) has no room three metres out, and every try used to land in
    // the car — so nobody came. Closer in, then wider along, before giving up.
    for (let tries = 0; tries < 10; tries++) {
      const along =
        (i - (nearby.length - 1) / 2) * 1.25 +
        between(-0.35, 0.35) +
        (tries >= 7 ? between(-1.6, 1.6) : 0);
      const back = tries < 4 ? between(2.4, 3.8) : between(1.4, 2.4);
      const sx = wx + nx * back + tx * along;
      const sz = wz + nz * back + tz * along;
      if (insideAnyBox(sx, sz, 0.45)) continue;
      p.state = "admire";
      p.standX = sx;
      p.standZ = sz;
      p.lookX = wx + tx * along * 0.4;
      p.lookZ = wz + tz * along * 0.4;
      p.timer = between(9, 13);
      p.shutter = between(0.6, 1.8);
      // hurrying over — it is the most interesting thing on the block
      p.speed = between(2.6, 3.1);
      if (i < 2) {
        bark(p, ADMIRE_BARKS);
        // after the reveal has taken its photograph: a speech slab is drawn
        // over everything, and the middle of that picture is the piece
        p.barkDelay += 3.4 + i * 1.1;
      }
      break;
    }
  });
}

/* ── the gang answers ────────────────────────────────────────────────────── */
/**
 * A gang member on their usual route can end up standing right next to the
 * player when a piece lands — the sidewalk they walk is the same one you
 * stand on to paint. Without a shove back, the grace period is spent
 * standing shoulder-to-shoulder with someone about to shoot: no line of
 * sight to break, no reaction possible. So the alert itself buys distance,
 * not just time.
 */
const MIN_ENGAGE_DIST = 5.5;

/**
 * Called the moment a piece lands on one of their walls. Everyone in the
 * Carmine colours within earshot stops what they were doing, shouts, and comes
 * for you.
 */
export function gangAlert(x: number, z: number, radius = 46) {
  if (world.peaceful) return;
  let roused = 0;
  const grace = alertsRaised === 0 ? FIRST_ALERT_GRACE : ALERT_GRACE;
  alertsRaised++;
  graceTotal = grace;
  world.gangHeat = Math.min(1, world.gangHeat + 0.34);
  for (const p of world.people) {
    if (p.state === "down") continue;
    if (p.faction !== "gang") {
      if (p.faction === "civilian" && Math.hypot(p.x - x, p.z - z) < radius * 0.6) {
        p.state = "flee";
        p.timer = between(5, 9);
        const len = Math.hypot(p.x - x, p.z - z) || 1;
        p.fleeX = (p.x - x) / len;
        p.fleeZ = (p.z - z) / len;
        bark(p, PANIC_BARKS);
      }
      continue;
    }
    if (Math.hypot(p.x - x, p.z - z) > radius) continue;
    const pdx = p.x - playerState.x;
    const pdz = p.z - playerState.z;
    const pd = Math.hypot(pdx, pdz);
    if (pd < MIN_ENGAGE_DIST) {
      const dirX = pd > 0.001 ? pdx / pd : Math.sin(p.yaw);
      const dirZ = pd > 0.001 ? pdz / pd : Math.cos(p.yaw);
      const nx = playerState.x + dirX * MIN_ENGAGE_DIST;
      const nz = playerState.z + dirZ * MIN_ENGAGE_DIST;
      if (!insideAnyBox(nx, nz, 0.3)) {
        p.x = nx;
        p.z = nz;
      }
    }
    p.state = "taunt";
    p.timer = between(1.4, 2.2);
    p.speed = between(4.4, 5.2);
    // They shout first and shoot after. The player is walking back out of a
    // full-screen editor and needs a beat to work out which way to face.
    p.holdFire = Math.max(p.holdFire, grace);
    bark(p, GANG_BARKS);
    roused++;
  }
  // a couple of reinforcements walk in from the edges of the block
  const extra = Math.min(2, 1 + Math.floor(world.gangHeat));
  for (let i = 0; i < extra; i++) {
    const route = pickOne(PED_ROUTES);
    const g = spawnPerson(route, between(0, route.length), "gang", true);
    g.state = "chase";
    g.timer = 26;
    g.speed = between(4.4, 5.2);
    g.holdFire = grace;
    world.people.push(g);
    roused++;
  }
  if (roused > 0) hooks.onGangAlert?.();
}

/* ── the police response: officers on foot, nothing more ─────────────────── */
const SPAWN_EDGES: [number, number][] = [
  [-42, 6.4],
  [40, -6.4],
  [15.6, -24],
  [15.6, 32],
];

function ensureResponse() {
  const level = world.peaceful ? 0 : player.wanted;
  const want = level === 0 ? 0 : Math.min(6, level + 1);

  const onDuty = world.people.filter(
    (p) => p.responder && p.faction === "police" && p.state !== "down",
  ).length;

  if (onDuty < want) {
    const route = pickOne(COP_ROUTES);
    const p = spawnPerson(route, between(0, route.length), "police", true);
    const edge = pickOne(SPAWN_EDGES);
    p.x = edge[0];
    p.z = edge[1];
    p.state = "chase";
    p.timer = 60;
    world.people.push(p);
  }

  if (level === 0) {
    world.people = world.people.filter(
      (p) => !(p.responder && p.faction === "police") || p.state === "down",
    );
  }
}

/* ── traffic ─────────────────────────────────────────────────────────────── */
const CAR_HALF_LEN: Record<CarKind, number> = {
  sedan: CAR_SHAPE.sedan.length / 2,
  hatch: CAR_SHAPE.hatch.length / 2,
  van: CAR_SHAPE.van.length / 2,
  pickup: CAR_SHAPE.pickup.length / 2,
};

function stepCars(dt: number) {
  for (const car of world.cars) {
    car.spin += car.speed * dt;

    if (car.crashTimer > 0) {
      car.crashTimer -= dt;
      car.speed *= 0.85;
      if (car.crashTimer <= 0) car.speed = 0;
      continue;
    }

    let target = car.cruise * (car.damage > 0.5 ? 0.55 : 1);

    for (const other of world.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 16) continue;

      // Only ever brake for something in our own lane going our own way. The
      // two carriageways are 3.5 m apart, so without this a car brakes for the
      // one coming the other way — and since a stopped car never clears, both
      // sides of the street deadlock permanently.
      const ahead = (dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw)) / (dist || 1);
      if (ahead < 0.4) continue;
      const lateral = Math.abs(dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw));
      const sameWay = Math.cos(other.yaw - car.yaw) > 0.25;
      if (lateral > 1.8 || !sameWay) continue;

      const gap = dist - CAR_HALF_LEN[car.kind] - CAR_HALF_LEN[other.kind];
      if (gap < 0.8) {
        if (car.speed > 3 || other.speed > 3) crash(car, other);
        target = 0;
      } else if (gap < 9) {
        target = Math.min(target, (gap / 9) * car.cruise);
        if (gap < 4) car.hornTimer = Math.max(car.hornTimer, 0.35);
      }
    }

    target = Math.min(target, avoidPeople(car));
    target = Math.min(target, avoidPlayer(car));

    const accel = target > car.speed ? 3.4 : 9;
    car.speed += clamp(target - car.speed, -accel * dt, accel * dt);
    car.speed = Math.max(0, car.speed);

    const nextS = car.s + car.speed * dt;
    const [nx, nz] = sample(car.path, nextS);

    if (insideAnyBox(nx, nz, 0.35)) {
      car.crashTimer = between(2.2, 3.6);
      car.damage = Math.min(1, car.damage + 0.5);
      world.smoke.push({ x: nx, y: 1.0, z: nz, life: 2.6, scale: 1.1 });
      continue;
    }

    // Face wherever we actually travelled. Steering towards the path's own
    // heading let the yaw fall behind through the tight U-turns, which read as
    // the car sliding sideways down the street.
    const moveX = nx - car.x;
    const moveZ = nz - car.z;
    if (Math.hypot(moveX, moveZ) > 0.0015) {
      car.yaw = turnToward(car.yaw, Math.atan2(moveX, moveZ), dt * 9);
    }

    car.s = nextS;
    car.x = nx;
    car.z = nz;
    if (car.hornTimer > 0) car.hornTimer -= dt;
  }
}

function crash(a: Car, b: Car) {
  a.crashTimer = between(1.6, 2.8);
  b.crashTimer = between(1.4, 2.4);
  a.damage = Math.min(1, a.damage + 0.45);
  b.damage = Math.min(1, b.damage + 0.35);
  world.smoke.push({ x: (a.x + b.x) / 2, y: 1.1, z: (a.z + b.z) / 2, life: 2.4, scale: 1 });
  const near = Math.hypot(a.x - playerState.x, a.z - playerState.z);
  if (near < 22) world.shake = Math.max(world.shake, 0.5 * (1 - near / 22));
}

function avoidPeople(car: Car) {
  let target = Infinity;
  for (const p of world.people) {
    if (p.state === "down") continue;
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d > 10) continue;
    const forward = (dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw)) / (d || 1);
    // somebody on the pavement isn't in the way; somebody on the crossing is
    const lateral = Math.abs(dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw));
    if (forward > 0.55 && lateral < 2.2) {
      target = Math.min(target, Math.max(0, (d - 2.2) * 1.5));
    }
  }
  return target;
}

function avoidPlayer(car: Car) {
  if (player.dead) return Infinity;
  const dx = playerState.x - car.x;
  const dz = playerState.z - car.z;
  const d = Math.hypot(dx, dz);
  if (d > 14) return Infinity;
  const forward = (dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw)) / (d || 1);
  let target = Infinity;
  // someone stood on the pavement is not in the road — brake for the lane only
  const lateral = Math.abs(dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw));
  if (forward > 0.5 && d < 9 && lateral < 2.3) {
    target = Math.max(0, (d - 2.4) * 1.6);
    car.hornTimer = Math.max(car.hornTimer, 0.4);
  }
  if (d < 1.9 && car.speed > 2.2) {
    hitPlayer(4 + car.speed * 1.5, car.x, car.z);
    world.shake = Math.max(world.shake, 0.85);
    car.crashTimer = 1.2;
  }
  return target;
}

/* ── people ──────────────────────────────────────────────────────────────── */
function lineOfSight(ax: number, az: number, bx: number, bz: number) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.min(26, Math.ceil(d / 1.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (insideAnyBox(lerp(ax, bx, t), lerp(az, bz, t), -0.1)) return false;
  }
  return true;
}

export function scare(x: number, z: number, radius: number, alertCops: boolean) {
  for (const p of world.people) {
    if (p.state === "down") continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > radius) continue;
    if (p.faction === "police") {
      if (alertCops) {
        p.state = "chase";
        p.timer = 30;
        bark(p, COP_BARKS);
      }
    } else if (p.faction === "gang") {
      p.state = "chase";
      p.timer = 34;
      p.speed = between(4.4, 5.2);
      bark(p, GANG_BARKS);
    } else {
      p.state = "flee";
      p.timer = between(4.5, 8);
      const len = d || 1;
      p.fleeX = (p.x - x) / len;
      p.fleeZ = (p.z - z) / len;
      bark(p, PANIC_BARKS);
    }
  }
}

/**
 * How far to advance a walk cycle this frame.
 *
 * Tied to distance travelled rather than to a flat multiplier, so the cycle
 * rate always matches the ground the feet are covering and nobody moonwalks.
 */
function stridePhase(speed: number, running: boolean, dt: number) {
  const stride = running ? STRIDE_RUN : STRIDE_WALK;
  return (speed / stride) * TAU * dt;
}

/**
 * Nudge someone out of the player's space.
 *
 * Walkers follow their route by setting position directly rather than going
 * through `resolveMove`, so without this they stroll straight through you —
 * which looks broken from a metre away.
 */
const PERSONAL_SPACE = 0.78;
function separateFromPlayer(p: Person) {
  const dx = p.x - playerState.x;
  const dz = p.z - playerState.z;
  const d = Math.hypot(dx, dz);
  if (d >= PERSONAL_SPACE || d < 0.0001) return;
  const push = (PERSONAL_SPACE - d) / d;
  const nx = p.x + dx * push;
  const nz = p.z + dz * push;
  // don't shove anyone into a wall to get them off the player
  if (!insideAnyBox(nx, nz, 0.3)) {
    p.x = nx;
    p.z = nz;
  }
}

function rejoinRoute(p: Person) {
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s < p.path.length; s += 2) {
    const [sx, sz] = sample(p.path, s);
    const d = Math.hypot(sx - p.x, sz - p.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  p.s = best;
}

function stepPeople(dt: number) {
  // Who is allowed to shoot this frame: the nearest few, recomputed every tick
  // so the privilege moves with the fight rather than sticking to whoever
  // happened to spot you first.
  const contenders = world.people.filter(
    (p) => p.armed && (p.state === "chase" || p.state === "engage") && p.holdFire <= 0,
  );
  contenders.sort(
    (a, b) =>
      Math.hypot(a.x - playerState.x, a.z - playerState.z) -
      Math.hypot(b.x - playerState.x, b.z - playerState.z),
  );
  const allowedToFire = new Set(contenders.slice(0, shooterBudget()).map((p) => p.id));

  for (const p of world.people) {
    // The grace is for the player, so it only runs while they have the
    // controls. A piece landing calls this out *before* a four-second reveal
    // they cannot move during; counted down through it, the grace was spent by
    // the time the camera came back, and every shooter's cooldown had banked
    // meanwhile — three rounds on the first frame of play and WASTED seconds
    // after the first piece. When it does run out, the first shots are
    // staggered rather than all landing on the same frame.
    if (p.holdFire > 0 && !player.safe) {
      p.holdFire -= dt;
      if (p.holdFire <= 0) p.fireCooldown = between(0.25, 1.5);
    }
    if (p.barkDelay > 0) {
      p.barkDelay -= dt;
    } else if (p.barkTimer > 0) {
      p.barkTimer -= dt;
      if (p.barkTimer <= 0) p.bark = null;
    }
    p.taunt = Math.max(0, p.taunt - dt * 2.2);
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt);
    if (p.state !== "admire" && p.phone > 0) p.phone = Math.max(0, p.phone - dt * 3);

    if (p.state === "down") {
      p.downTilt = Math.min(1, p.downTilt + dt * 3.4);
      continue;
    }

    let moveX = 0;
    let moveZ = 0;
    let speed = p.speed;

    if (p.state === "taunt") {
      p.timer -= dt;
      p.taunt = 1;
      speed = 0;
      if (p.timer <= 0) {
        p.state = "chase";
        p.timer = 34;
      }
    } else if (p.state === "admire") {
      const dx = p.standX - p.x;
      const dz = p.standZ - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        speed = p.speed;
        moveX = dx / d;
        moveZ = dz / d;
        p.phone = Math.max(0, p.phone - dt * 3);
      } else {
        // stood in front of it: face the wall, phone up, a picture every so often
        p.yaw = turnToward(p.yaw, Math.atan2(p.lookX - p.x, p.lookZ - p.z), dt * 5);
        p.phase += dt * 0.6;
        p.phone = Math.min(1, p.phone + dt * 2.2);
        p.timer -= dt;
        if (p.phone > 0.9) {
          p.shutter -= dt;
          if (p.shutter <= 0) {
            p.flash = 0.14;
            p.shutter = between(1.6, 3.2);
          }
        }
        if (p.timer <= 0) {
          p.state = "walk";
          p.speed = between(1.05, 1.65);
          rejoinRoute(p);
        }
        separateFromPlayer(p);
        continue;
      }
    } else if (p.state === "flee") {
      p.timer -= dt;
      speed = 4.4;
      moveX = p.fleeX;
      moveZ = p.fleeZ;
      if (insideAnyBox(p.x + moveX * 0.9, p.z + moveZ * 0.9, 0.4)) {
        const t = p.fleeX;
        p.fleeX = p.fleeZ;
        p.fleeZ = -t;
      }
      if (p.timer <= 0) {
        p.state = "walk";
        rejoinRoute(p);
      }
    } else if (p.state === "chase" || p.state === "engage") {
      p.timer -= dt;
      const dx = playerState.x - p.x;
      const dz = playerState.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const sees = lineOfSight(p.x, p.z, playerState.x, playerState.z) && d < 36;
      const range = p.faction === "gang" ? 11 : 13;

      if (sees && d < range) {
        p.state = "engage";
        speed = 0;
        // no banking a volley while the player is watching a cutscene
        if (!player.safe) p.fireCooldown -= dt;
        const mayFire =
          allowedToFire.has(p.id) && p.holdFire <= 0 && !world.peaceful;
        if (p.fireCooldown <= 0 && mayFire && !player.dead && !player.safe) {
          p.fireCooldown = between(1.0, 1.7);
          npcFire(p);
          if (rnd() < 0.35) bark(p, p.faction === "gang" ? GANG_BARKS : COP_BARKS);
        }
      } else {
        p.state = "chase";
        speed = p.faction === "gang" ? 4.9 : 4.6;
        moveX = dx / d;
        moveZ = dz / d;
      }

      const stillWanted = p.faction === "gang" ? world.gangHeat > 0.05 : player.wanted > 0;
      if (p.timer <= 0 && !stillWanted) {
        p.state = "walk";
        p.speed = between(1.1, 1.6);
        rejoinRoute(p);
      }
    } else {
      p.s += p.speed * dt;
      const [px, pz, pyaw] = sample(p.path, p.s);
      p.x = px + Math.cos(pyaw) * p.offset;
      p.z = pz - Math.sin(pyaw) * p.offset;
      p.yaw = turnToward(p.yaw, pyaw, dt * 6);
      p.phase += stridePhase(p.speed, false, dt);
      separateFromPlayer(p);
      continue;
    }

    if (moveX || moveZ) {
      const [nx, nz] = resolveMove(p.x, p.z, moveX * speed * dt, moveZ * speed * dt, 0.36);
      // walked into a corner on the way over: give up and carry on
      if (p.state === "admire" && Math.hypot(nx - p.x, nz - p.z) < speed * dt * 0.2) {
        p.timer -= dt * 4;
        if (p.timer <= 0) {
          p.state = "walk";
          rejoinRoute(p);
        }
      }
      p.x = nx;
      p.z = nz;
      p.yaw = turnToward(p.yaw, Math.atan2(moveX, moveZ), dt * 8);
      p.phase += stridePhase(speed, speed > 3, dt);
      if (p.state === "flee" || p.state === "admire") separateFromPlayer(p);
    } else {
      p.yaw = turnToward(p.yaw, Math.atan2(playerState.x - p.x, playerState.z - p.z), dt * 6);
      p.phase += dt * 0.6;
    }
  }

  if (world.people.length > 34) {
    world.people = world.people.filter((p) => !(p.state === "down" && p.downTilt >= 1 && p.responder));
  }
}

/* ── shooting ────────────────────────────────────────────────────────────── */
interface RayHit {
  x: number;
  y: number;
  z: number;
  person?: Person;
  car?: Car;
  /** the round stopped on the player's own body */
  player?: boolean;
  blood: boolean;
}

/** Roughly shoulder width, matching the cylinder the NPCs are shot through. */
const PLAYER_HIT_RADIUS = 0.42;

/** One slab of a car, in the car's own frame. */
interface CarBox {
  /** centre on the nose-to-tail axis */
  along: number;
  halfLen: number;
  halfWidth: number;
  floor: number;
  top: number;
}

/**
 * A car is a stack of boxes, not one box.
 *
 * Testing a single slab standing full height over the whole footprint was wrong
 * in both directions: it ate rounds aimed over a bonnet or over a pickup's bed,
 * half a metre above anything solid — and being capped at a flat 2.2 m and
 * 1.15 m across, it left the top of a van as a hole you could shoot clean
 * through while soaking shots 20 cm off every saloon's flank. These follow the
 * meshes `createCar` actually draws.
 */
function carBoxes(kind: CarKind): CarBox[] {
  const s = CAR_SHAPE[kind];
  const halfWidth = s.width / 2;
  if (kind === "van") {
    return [
      { along: 0, halfLen: s.length / 2, halfWidth, floor: VAN_FLOOR, top: VAN_FLOOR + s.bodyH },
    ];
  }

  const hullTop = HULL_FLOOR + s.bodyH;
  const boxes: CarBox[] = [
    { along: 0, halfLen: s.length / 2, halfWidth, floor: HULL_FLOOR, top: hullTop },
    // the greenhouse: narrower than the body and set back along it. A pickup's
    // is bare metal with no roof panel on top.
    {
      along: s.cabOff,
      halfLen: s.cabLen / 2,
      halfWidth: (s.width * CAB_WIDTH_SCALE) / 2,
      floor: hullTop,
      top: hullTop + s.cabH + (kind === "pickup" ? 0 : ROOF_CAP),
    },
  ];
  if (s.bed) {
    boxes.push({
      along: s.bed.along,
      halfLen: s.bed.length / 2,
      halfWidth: (s.width * s.bed.widthScale) / 2,
      floor: hullTop,
      top: hullTop + s.bed.height,
    });
  }
  return boxes;
}

const CAR_BOXES: Record<CarKind, CarBox[]> = {
  sedan: carBoxes("sedan"),
  hatch: carBoxes("hatch"),
  pickup: carBoxes("pickup"),
  van: carBoxes("van"),
};

/**
 * How far the follow camera can stand from the player before it is inside a
 * car.
 *
 * The camera already stops at buildings, but traffic is not architecture: a
 * wall on the south side of Marlow Street puts the lens out over the near lane,
 * and a passing van used to drive straight through it — a second of the inside
 * of a van, the whole screen dark, usually while the player was lining up the
 * wall they had come to paint. Now the arm pulls in ahead of the car and lets
 * it go by, the way every third-person camera does.
 *
 * The line of sight rises from the player's eyes (`py`) to the lens (`topY`)
 * over `wanted` metres along (dirX, dirZ).
 */
export function cameraCarClearance(
  px: number,
  py: number,
  pz: number,
  dirX: number,
  dirZ: number,
  wanted: number,
  topY: number,
  minDist = 1.4,
): number {
  // a car's own clearance: the near plane must not clip into its flank
  const PAD = 0.4;
  let reach = wanted;
  for (const c of world.cars) {
    // nothing within a car's length of the arm, nothing to test
    const toX = c.x - px;
    const toZ = c.z - pz;
    const along = toX * dirX + toZ * dirZ;
    if (along < -3.5 || along > wanted + 3.5) continue;
    if (Math.abs(toX * dirZ - toZ * dirX) > 3.6) continue;
    const steps = Math.ceil(wanted / 0.2);
    for (let i = 1; i <= steps; i++) {
      const d = (wanted * i) / steps;
      if (d >= reach) break;
      if (d < minDist) continue;
      const y = py + (topY - py) * (d / wanted);
      if (hitsCar(c, px + dirX * d, y, pz + dirZ * d, PAD)) {
        reach = Math.max(minDist, d - 0.25);
        break;
      }
    }
  }
  return reach;
}

function hitsCar(c: Car, x: number, y: number, z: number, pad = 0) {
  const rx = x - c.x;
  const rz = z - c.z;
  // into the car's own frame: `along` runs nose to tail, `across` flank to flank
  const along = rx * Math.sin(c.yaw) + rz * Math.cos(c.yaw);
  const across = rx * Math.cos(c.yaw) - rz * Math.sin(c.yaw);
  for (const b of CAR_BOXES[c.kind]) {
    if (
      y >= b.floor - pad &&
      y <= b.top + pad &&
      Math.abs(along - b.along) <= b.halfLen + pad &&
      Math.abs(across) <= b.halfWidth + pad
    ) {
      return true;
    }
  }
  return false;
}

function castRay(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  range: number,
  skip?: Person,
  /**
   * Test the player's body too. Only incoming fire sets this: the player's own
   * ray is cast from the camera, which in third person sits behind their
   * shoulder, so every shot they took would stop on their own back.
   */
  includePlayer = false,
): RayHit {
  const step = 0.22;
  for (let t = 0.6; t < range; t += step) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;

    if (y <= 0.03) return { x, y: 0.03, z, blood: false };

    if (
      includePlayer &&
      !player.dead &&
      Math.hypot(x - playerState.x, z - playerState.z) < PLAYER_HIT_RADIUS &&
      y > 0.1 &&
      y < 1.95
    ) {
      return { x, y, z, player: true, blood: true };
    }

    for (const p of world.people) {
      if (p === skip || p.state === "down") continue;
      if (Math.hypot(x - p.x, z - p.z) < 0.42 && y > 0.1 && y < 1.95) {
        return { x, y, z, person: p, blood: true };
      }
    }
    for (const c of world.cars) {
      if (hitsCar(c, x, y, z)) return { x, y, z, car: c, blood: false };
    }
    if (y < 9 && insideAnyBox(x, z, -0.05)) return { x, y, z, blood: false };
  }
  return { x: ox + dx * range, y: oy + dy * range, z: oz + dz * range, blood: false };
}

function tracer(ox: number, oy: number, oz: number, hit: RayHit, fromPlayer: boolean) {
  world.bullets.push({
    x: ox,
    y: oy,
    z: oz,
    dx: hit.x - ox,
    dy: hit.y - oy,
    dz: hit.z - oz,
    life: 0,
    fromPlayer,
  });
  world.impacts.push({ x: hit.x, y: hit.y, z: hit.z, life: 0.42, blood: hit.blood });
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The player pulls the trigger.
 *
 * The hit is resolved along the camera ray so what sits under the crosshair is
 * what you hit, but the visible tracer is drawn from the muzzle — otherwise the
 * round appears to leave the character's chest.
 */
/**
 * Aim assist, and only while the right button is held.
 *
 * A pistol at eleven metres in a third-person camera with mouse-look is a
 * harder shot than it looks, and the fight this game wants is "six of them are
 * coming, pick your moment and move", not "can you land a 2px target". Holding
 * aim bends the ray most of the way onto whoever is nearest the crosshair
 * inside a three-degree cone; hip fire is left exactly as inaccurate as it was.
 *
 * Only armed actors are candidates, so the assist can never drag a round onto
 * a bystander.
 */
const ASSIST_CONE = 0.055;
const ASSIST_RANGE = 34;
const ASSIST_STRENGTH = 0.82;

function assisted(dir: Vec3, eye: Vec3): Vec3 {
  if (!player.aiming) return dir;
  let bx = 0;
  let by = 0;
  let bz = 0;
  let bestAngle = ASSIST_CONE;
  let found = false;

  for (const p of world.people) {
    if (!p.armed || p.state === "down") continue;
    const dx = p.x - eye.x;
    const dy = 1.15 - eye.y;
    const dz = p.z - eye.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > ASSIST_RANGE || d < 0.8) continue;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
    if (dot <= 0) continue;
    const angle = Math.acos(Math.min(1, dot));
    if (angle >= bestAngle) continue;
    if (!lineOfSight(eye.x, eye.z, p.x, p.z)) continue;
    bestAngle = angle;
    bx = dx / d;
    by = dy / d;
    bz = dz / d;
    found = true;
  }
  if (!found) return dir;

  const k = ASSIST_STRENGTH;
  const ax = dir.x + (bx - dir.x) * k;
  const ay = dir.y + (by - dir.y) * k;
  const az = dir.z + (bz - dir.z) * k;
  const n = Math.hypot(ax, ay, az) || 1;
  return { x: ax / n, y: ay / n, z: az / n };
}

export function playerFire(rawDir: Vec3, eye: Vec3, muzzle?: Vec3) {
  // FREE PAINT is a paint-only block: there is no pistol in it to fire
  if (player.dead || world.peaceful) return false;
  if (player.reloading > 0 || player.fireCooldown > 0) return false;
  if (player.ammo <= 0) {
    reload();
    return false;
  }

  player.ammo -= 1;
  player.fireCooldown = 0.16;
  player.recoil = player.aiming ? 0.7 : 1;
  player.fireAnim = 1;
  player.muzzle = 0.07;
  world.shake = Math.max(world.shake, player.aiming ? 0.16 : 0.24);

  const dir = assisted(rawDir, eye);
  const spread = player.aiming ? 0.004 : 0.032;
  const ax = dir.x + between(-spread, spread);
  const ay = dir.y + between(-spread, spread);
  const az = dir.z + between(-spread, spread);
  const n = Math.hypot(ax, ay, az) || 1;

  const hit = castRay(eye.x, eye.y, eye.z, ax / n, ay / n, az / n, 70);
  const from = muzzle ?? { x: eye.x, y: eye.y - 0.12, z: eye.z };
  tracer(from.x, from.y, from.z, hit, true);

  if (hit.person) {
    const p = hit.person;
    p.health -= p.faction === "police" ? 34 : 45;
    if (p.health <= 0) {
      p.state = "down";
      player.kills += 1;
      raiseHeat(p.faction === "police" ? 46 : 26, p.faction === "police" ? "You put an officer down." : undefined);
    } else {
      raiseHeat(p.faction === "police" ? 30 : 14);
      if (p.faction === "civilian") {
        p.state = "flee";
        p.timer = 9;
        const len = Math.hypot(p.x - eye.x, p.z - eye.z) || 1;
        p.fleeX = (p.x - eye.x) / len;
        p.fleeZ = (p.z - eye.z) / len;
      } else {
        p.state = "chase";
        p.timer = 34;
      }
    }
  } else if (hit.car) {
    hit.car.damage = Math.min(1, hit.car.damage + 0.2);
    if (hit.car.damage > 0.8) hit.car.crashTimer = Math.max(hit.car.crashTimer, 2);
    raiseHeat(6);
  } else {
    raiseHeat(4);
  }

  scare(playerState.x, playerState.z, 26, true);
  return true;
}

function npcFire(shooter: Person) {
  const eyeY = 1.5;
  const dx = playerState.x - shooter.x;
  const dz = playerState.z - shooter.z;
  const dy = 1.15 - eyeY;
  const len = Math.hypot(dx, dy, dz) || 1;
  const s = shooter.spread;
  const ux = dx / len + between(-s, s);
  const uy = dy / len + between(-s * 0.6, s * 0.6);
  const uz = dz / len + between(-s, s);
  const n = Math.hypot(ux, uy, uz) || 1;
  const dirX = ux / n;
  const dirZ = uz / n;

  const hit = castRay(shooter.x, eyeY, shooter.z, dirX, uy / n, dirZ, 40, shooter, true);
  tracer(shooter.x, eyeY, shooter.z, hit, false);

  if (hit.player) {
    hitPlayer(shooter.damage + between(-1, 2), shooter.x, shooter.z);
    return;
  }

  // A round that went by close still rattles the camera. Measure where the shot
  // passed the player rather than where it eventually stopped — the wall behind
  // them can be twenty metres further on.
  const along = (playerState.x - shooter.x) * dirX + (playerState.z - shooter.z) * dirZ;
  if (along <= 0) return;
  const missDist = Math.hypot(
    playerState.x - (shooter.x + dirX * along),
    playerState.z - (shooter.z + dirZ * along),
  );
  const travelled = Math.hypot(hit.x - shooter.x, hit.z - shooter.z);
  if (missDist < 1.2 && travelled >= along) {
    world.shake = Math.max(world.shake, 0.12);
  }
}

export function reload() {
  if (player.reloading > 0 || player.ammo === player.clip || player.reserve <= 0) return;
  player.reloading = 1.35;
  hooks.onReload?.();
}

export function hitPlayer(amount: number, fromX?: number, fromZ?: number) {
  if (player.dead || player.safe || world.peaceful) return;
  player.health = Math.max(0, player.health - amount);
  player.hurt = 1;
  player.sinceHit = 0;
  world.shake = Math.max(world.shake, 0.32);
  if (fromX !== undefined && fromZ !== undefined) {
    const angle = Math.atan2(fromX - playerState.x, fromZ - playerState.z);
    // one arc per direction: a burst from the same place should read as one
    // threat getting louder, not as four separate wedges
    const same = player.hits.find((h) => Math.abs(wrapAngle(h.angle - angle)) < 0.3);
    if (same) {
      same.angle = angle;
      same.life = HIT_MARK_LIFE;
    } else {
      player.hits.push({ angle, life: HIT_MARK_LIFE });
      if (player.hits.length > 4) player.hits.shift();
    }
  }
  if (player.health <= 0) {
    player.dead = true;
    player.deadTimer = 0;
    player.aiming = false;
    hooks.onDeath?.();
  }
}

export function setAiming(on: boolean) {
  // nothing to aim in FREE PAINT
  player.aiming = on && !player.dead && !world.peaceful;
}

export function respawn() {
  playerState.x = SPAWN.x;
  playerState.z = SPAWN.z;
  playerState.yaw = SPAWN.yaw;
  playerState.camYaw = SPAWN.yaw;
  playerState.speed = 0;
  player.health = player.maxHealth;
  player.dead = false;
  player.deadTimer = 0;
  player.wanted = 0;
  player.heat = 0;
  player.ammo = player.clip;
  player.reserve = 96;
  player.aiming = false;
  player.hurt = 0;
  player.fireAnim = 0;
  player.reloading = 0;
  player.fireCooldown = 0;
  player.recoil = 0;
  player.muzzle = 0;
  player.sinceHit = 99;
  player.hits.length = 0;
  world.gangHeat = 0;

  world.people = world.people.filter((p) => !p.responder);
  for (const p of world.people) {
    if (p.state !== "down") {
      p.state = "walk";
      p.timer = 0;
      p.taunt = 0;
      p.bark = null;
      rejoinRoute(p);
    }
  }
  hooks.onRespawn?.();
}

/* ── the tick ────────────────────────────────────────────────────────────── */
export function stepWorld(dt: number, running: boolean) {
  world.time += dt;

  world.shake = Math.max(0, world.shake - dt * 1.6);
  player.hurt = Math.max(0, player.hurt - dt * 1.3);
  for (let i = player.hits.length - 1; i >= 0; i--) {
    player.hits[i].life -= dt;
    if (player.hits[i].life <= 0) player.hits.splice(i, 1);
  }

  // Come back from a beating once you've broken away. Without this a couple of
  // firefights leave you permanently on a sliver of health with nothing in the
  // game able to put it back, and the only fix is dying on purpose.
  if (!player.dead) {
    player.sinceHit += dt;
    if (player.sinceHit > REGEN_DELAY && player.health < player.maxHealth) {
      player.health = Math.min(player.maxHealth, player.health + REGEN_RATE * dt);
    }
  }
  player.recoil = Math.max(0, player.recoil - dt * 6);
  player.fireAnim = Math.max(0, player.fireAnim - dt * 1.7);
  player.muzzle = Math.max(0, player.muzzle - dt);
  if (player.fireCooldown > 0) player.fireCooldown -= dt;

  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      const need = player.clip - player.ammo;
      const take = Math.min(need, player.reserve);
      player.ammo += take;
      player.reserve -= take;
    }
  } else if (player.ammo <= 0 && player.reserve > 0 && !player.dead) {
    reload();
  }

  for (let i = world.bullets.length - 1; i >= 0; i--) {
    world.bullets[i].life += dt;
    if (world.bullets[i].life > 0.09) world.bullets.splice(i, 1);
  }
  for (let i = world.impacts.length - 1; i >= 0; i--) {
    world.impacts[i].life -= dt;
    if (world.impacts[i].life <= 0) world.impacts.splice(i, 1);
  }
  for (let i = world.smoke.length - 1; i >= 0; i--) {
    const s = world.smoke[i];
    s.life -= dt;
    s.y += dt * 0.7;
    s.scale += dt * 0.9;
    if (s.life <= 0) world.smoke.splice(i, 1);
  }

  if (player.dead) {
    player.deadTimer += dt;
    stepCars(dt);
    stepPeople(dt);
    return;
  }

  if (!running) return;

  // heat cools off when nobody has eyes on you
  if (player.heat > 0) {
    let watched = false;
    for (const p of world.people) {
      if (p.faction === "police" && (p.state === "chase" || p.state === "engage")) {
        watched = true;
        break;
      }
    }
    player.heat = Math.max(0, player.heat - dt * (watched ? 1.6 : 4.5));
    const level = heatToLevel(player.heat);
    if (level !== player.wanted) {
      player.wanted = level;
      hooks.onWanted?.(level);
    }
  }

  // The Kings cool off. Standing in front of the wall you just hit keeps them
  // boiling; getting off the street drains it in about twenty seconds, which
  // is what makes running a real answer rather than a delay.
  let hunted = false;
  for (const p of world.people) {
    if (p.faction !== "gang" || p.state === "down") continue;
    if (p.state !== "chase" && p.state !== "engage" && p.state !== "taunt") continue;
    if (Math.hypot(p.x - playerState.x, p.z - playerState.z) < 24) {
      hunted = true;
      break;
    }
  }
  world.gangHeat = Math.max(0, world.gangHeat - dt * (hunted ? 0.02 : 0.085));

  ensureResponse();
  stepCars(dt);
  stepPeople(dt);
}

// build the city the moment this module is first imported
resetWorld();
