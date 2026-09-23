# NEON WALLS

**A GTA-inspired open-world graffiti game where the Unlayer React Image Editor *is* the spray can.**

Built for the *Build with React Image Editor* challenge.

```bash
npm install
npm run dev
# http://localhost:3000
```

---

## The idea in one line

You walk a neon-lit city block, find a wall, press **E**, and
[`@unlayer/react-image-editor`](https://github.com/unlayer/react-image-editor) opens as a
full-screen game mode called the **GRAFFITI STUDIO**. Whatever you make in it is sprayed onto
that exact surface in the 3D world and stays there.

The editor is not a feature bolted onto a demo. It is the only way to make anything in this game.

## Why the hand-off is seamless

Every paintable surface has a **procedurally generated photograph of itself** — brick, corrugated
shutter, paste-up billboard, plywood hoarding, a van's flank — drawn on a 2D canvas at runtime
(`lib/graffiti/surfaces.ts`).

That same data URL is used for **both**:

- the texture on the wall in three.js, and
- the `image` prop handed to `<ImageEditor>`.

So the editor opens on the literal pixels you were just looking at. When you hit **PAINT THE
WALL**, the flattened canvas comes back out of the editor (`editor.getImage()`), becomes a
`THREE.Texture`, and lands on the wall — after the wall has replayed every step you took to make it
(see *Every step is filmed*).

The editor can hand back any shape — a crop, a resize or a quarter turn all change it — and the
wall stays the shape it is. A piece that no longer matches is hung on the bare surface at its own
proportions instead of being stretched across it (`fitToSurface()`), so a square crop on a 2:1
shutter still reads as the lettering you drew.

Same pixels in, same pixels out — which is why the result registers perfectly instead of looking
like a sticker. It also means **no CORS problems and no image assets to host**.

## Watch it land while you work

The studio is full-screen and the city behind it is stopped, which is right for the editor and
wrong for the piece: you are making something for a wall at night, under a sodium lamp, seen from
the pavement. So the top of the studio's rail is **ON THE STREET · LIVE** — that wall, rendered by
the game engine, with your work in progress on it.

Every time the canvas may have changed — a stroke finished, a slider let go, a key released, a tag
dropped in from the rail — and the hand has been still for a moment, the studio calls
`editor.getImage()`, fits the result to the wall exactly as **PAINT THE WALL** would, and asks the
renderer for one frame. The piece is hung on that surface at full strength, the camera stands
where the reveal will stand, one frame goes through the whole post-processing stack, it is grabbed,
and the camera goes back. Click it for the big version; it keeps updating.

Nothing else renders while the studio is up: the canvas drops to R3F's `frameloop="demand"` and only
draws when the street view asks (`lib/game/wallPreview.ts`, `components/game/WallPreviewRig.tsx`).
It never reads the canvas mid-gesture, so typing in a text layer or dragging a brush is untouched.

## Every step is filmed

Those same flattenings are kept. Each time the canvas settles in the studio — the bare shutter,
the tag dropped on it, every stroke of spray, the text layer, the filter — a small JPEG of it
joins a queue, in order (`lib/graffiti/timelapse.ts`). A **TIME-LAPSE** counter under the street
view ticks up as you work.

That film is used four times:

- **On the wall.** When you hit **PAINT THE WALL** the piece does not simply spray on. The wall
  itself replays how it was made, one settled canvas every tenth of a second or so, a hiss of can
  on each step, while the corner of the letterbox reads `TIME-LAPSE · 12 STEPS IN THE EDITOR`.
  Then the full-size canvas lands with a flare. It is capped at about two seconds so the reveal's
  photograph still catches the finished wall.
- **In the black book**, as a fourth face beside the street photograph, the artwork and the
  before/after: a flipbook that loops, pauses on a click and jumps to any step.
- **As a video.** **SAVE THE TIME-LAPSE · VIDEO** films that flipbook onto a 1280×720 canvas —
  title card, every step with a progress bar, a stamp on the finished piece, and the photograph of
  it in the street to close — through `MediaRecorder`, MP4 where the browser can and WebM where it
  can't. You watch it being drawn while it records. Eight seconds or so, made locally, ready to post.
- **On the city tour**, every wall the camera lands on plays its film again, faster, as the
  camera touches down (see *The city tour*).

A piece with only one or two steps behind it (a tag dropped straight on the wall) just sprays on the
way it always did.

## The loop

```
explore  →  find a spot  →  press E  →  edit in Unlayer  →  PAINT THE WALL
   ↑                                                             ↓
   └────────  the block reacts, and you leave  ←──────  the reveal
```

Fourteen surfaces. Each one is worth reputation; all fourteen makes you **STREET KING**.

The ladder runs TOY, WRITER, BOMBER, KING KILLER, ALL CITY, STREET KING, and a piece that earns a new
rank has it stamped across the corner of its reveal as the sting plays.

### Two ways to play

The menu asks before you go in, because the game is a showcase for an image editor and a good
number of the people who open it want to go straight at the walls:

- **STORY** — Carmine turf. Every piece you put up brings them out of the doorways.
- **FREE PAINT** — the same block, the same traffic, the same crowd on the corners, and nobody
  draws on you. No pistol, no heat, no combat HUD: fourteen walls, a backpack of cans and an image
  editor.

Nothing else changes between them: the same city, the same studio, the same export.

### Your tag

The menu asks for one more thing: **YOUR TAG**, the name you write under. It is optional and it
is used everywhere the game would otherwise have to make a name up:

- Vance opens the briefing with it — `JASON. I got a job for you.` if you leave it blank.
- The studio draws it for you in four hands — **WILDSTYLE**, **CHROME**, **BUBBLE** and
  **STENCIL** — generated on a canvas from whatever you typed, ready to drop on the wall and work
  over in the editor. **SHUFFLE** re-rolls the colours.
- The reveal signs the piece with it, and the black book and its exported contact sheet are
  *by* it.

### The street notices

In FREE PAINT a piece landing is the most interesting thing that has happened on the block all
night. The nearest passers-by stop, turn, hurry over, stand in front of your work and get their
phones out — screens glowing, flashes going off — and a couple of them say what they think. If
nobody is in sight of that wall, someone comes round the corner.

### Your city is kept

Everything you put up — every piece, its street photograph, every phone shot and your tag — is
saved in the browser (IndexedDB; the data URLs are megabytes, far past localStorage) and brought
back the next time the page opens. The menu says so, with a two-step **START OVER** if you want
the walls bare again. Nothing is uploaded anywhere.

### The city is also your source material

Press `C` anywhere in the street and the phone comes out: bars, a viewfinder, and
full control of the character while you frame the shot. `Space` takes it. The
capture is the renderer's own canvas *after* post-processing, so the photo comes
back with the bloom, the grade and the ambient occlusion baked in — it looks like
the game, not like a screen grab. The HUD is DOM and never touches the canvas, so
the frame is clean without hiding anything.

Raising the phone goes **first person** and stops drawing the character: a
third-person camera photographs the back of your own head, which is the one
thing in the city nobody wants on a wall. The lens levels off as it comes up and
the walking angle is put back when it goes away.

What the viewfinder frames is exactly what is saved — the corner marks and the
crop are the same four numbers. The last frame stays stuck in the corner of the
viewfinder like a print coming out of the phone, so there is something to look
at besides a counter.

Every shot then appears in the graffiti studio under **YOUR PHOTOS**, one click
from being composed onto the wall you are standing at. Photograph the sunset down
Marlow Street, crop it in the Unlayer editor, letter over it, and spray the result
onto a shop shutter. It is the shortest path in the game from *seeing something*
to *putting it on a wall*, and it runs entirely through the image editor.

Every finished piece is kept in **the black book** — press `G` at any time for a gallery of
everything you have put up, each one clickable for a full-size look. Paint the fourteenth
wall and the camera takes a victory lap of the block (see *The city tour*) that lands on the
book as the end screen, with the whole session's work on one page.

### The city tour

Every piece gets its moment — the reveal — and then you walk away from it. After a few walls
the only place the whole body of work exists together is the black book, as a grid of
thumbnails. But the city *is* the gallery.

So once two walls are up, the black book has **▶ TOUR YOUR CITY**, and the camera goes up
over the roofs and flies it (`lib/game/tour.ts`). It climbs out of the street, crosses the
block looking where it is going, drops onto each wall at the reveal's own framing and holds a
beat with a slow push-in — and as it lands, the wall makes itself again: the bare surface,
every step you took in the editor, then the finished piece with its flare (the frames start
decoding while the camera is still in the air). The letterbox names the piece and pins the
flat canvas that came out of the editor beside the street view of it. It closes on an oblique aerial of the
district turning slowly, with every piece you painted given a little extra light so the work
reads as the lights of the block, and a cut to black puts you back on the pavement where you
were. There is a soundtrack for it — a four-bar synthwave loop on Am–F–C–G, synthesised on the
audio clock like everything else — and `Esc` skips it.

The flight is three overlapping moves rather than one curve. A Bézier with its handles over
each end cut corners: it was already travelling sideways a third of the way up, and every
reveal shot has a wall behind the lens. Here the climb is mostly done before the camera starts
to cross, the cruising height is the tallest roof under the line plus a margin (a hop between
two walls in the same alley stays low), and the descent begins once it is across.

A tour visits at most six walls, chosen for the work in them — the longest time-lapses, the
biggest surfaces, always the newest — chained nearest-first from where you stand, and ending on
the newest piece, the last thing you made, before the camera pulls out over the block. Painting
the fourteenth wall plays it as the **VICTORY LAP** and ends on the STREET KING book, which
will fly it again.

### Every piece is photographed where it stands

The flattened canvas out of the editor is the *artwork*. It is not the best picture of the work.

So three seconds into the reveal — after the paint has finished dissolving on and the camera has
settled — the game photographs the wall out of the live renderer: your piece where you put it, at
night, with the sodium lamps on it, the fog, the ambient occlusion and the grade, and the writer
stood off to one side looking at it. That frame is kept with the piece.

The black book shows those photographs rather than the flat canvases, every piece opens as
**IN THE STREET**, **THE ARTWORK** or **BEFORE / AFTER** — the bare surface the editor opened on
and your piece, with a line that sweeps across once on its own and can then be dragged — and the
contact sheet is built out of them.

If something small is standing between the reveal camera and the wall — a lamp post, a parked car
— it steps out of the frame for the few seconds the camera is there
(`components/game/RevealClearance.tsx`, a box-against-pyramid test between the lens and the four
corners of the piece). People never do: the passers-by admiring the piece are the best thing that
can be in that photograph. It costs one frame grab per wall and it is the difference between leaving with fourteen
pictures and leaving with fourteen pictures *of a city you changed*.

The shot is looked after in three more ways. The writer, who pressed E wherever they happened to be
standing — usually square in front of the middle of the wall — steps along it out of the view of
the piece as the reveal's white flash goes off, and turns to look at it; on a low wall like the lot
hoarding they used to stand across the middle of the photograph. The light they carry through the
street (so the character reads in the dark) drops to a glow while a piece is on show, because two
metres from a wall it burned a hotspot into the middle of the artwork. And the green beams marking
the walls still to paint are game UI, so they go out for the reveal the way they already did for
the phone — the next wall's beam no longer glares in from the edge of the frame.

The paint lands the way paint does. It mists on from the bottom of the wall through a speckled
aerosol front (a coarse noise for where the can has been, finer octaves and a per-texel grain for
the droplets at its edge), and when the finished canvas is up the piece itself flares — the
material's own emissive spikes and the bloom catches it — so the flash is exactly the shape of the
work. It used to be a flat quad hung in front of the wall, which read as a pane of green glass and
spilled round the corners of the building.

It reuses the phone camera's machinery exactly — same queue, same post-processed buffer, just a
different crop.

### And you can keep it

A game about making pictures should let you leave with them. From the black book:

- **DOWNLOAD PNG** on any piece saves that exact artwork — the flattened canvas the editor
  handed back, the same pixels that are on the wall.
- **COPY IMAGE** puts whichever face you are looking at on the clipboard, ready to paste.
- **SAVE THE TIME-LAPSE · VIDEO** on the TIME-LAPSE face films the piece being made (see *Every
  step is filmed*).
- **SAVE THE BOOK · PNG** draws the whole session as a contact sheet: every piece you made,
  laid out under your rank and reputation, with the editor credited in the footer. It is
  composed on a canvas at export time, sized to however many walls you actually hit, and it
  is the one image that shows a whole playthrough at a glance.

Both are drawn locally and handed straight to the browser. Nothing is uploaded anywhere.

## The story

*(STORY mode. In FREE PAINT none of the following happens.)*

Vance is paying you to write your name across **Carmine Kings** turf. Half the people on the
street wear their colour — a red bandana and a mark across the shoulders. Every piece you put up
is an insult, so the moment a piece lands the Kings within earshot stop, shout, and come for you.
Pull a gun and the police escalate one star at a time — more officers, better shots:

| Stars | Response |
| ----- | -------- |
| ★ | A beat cop walking your way |
| ★★ | Two units, called in |
| ★★★ | Citywide — officers from every corner |
| ★★★★ | Tactical officers, and they shoot straight |
| ★★★★★ | Manhunt |

The heat is deliberately officers on foot and nothing more. Convoys, air support and armour all
got built and then cut: on a block this size they turned a graffiti game into noise.

Only the nearest three of them shoot at once — the rest close in. A piece landing rouses ten
people, and ten at eleven metres with a one-second cadence is fifteen damage a second and nothing
you can do about it: measured, that was eight seconds and a WASTED card. Capping the shooters
keeps the crowd bearing down on you and leaves the answer as *move* — it works out at just under
four damage a second, so standing in the open doing nothing kills you in about twenty-five
seconds. The budget goes up to four at ★★★ and five at ★★★★★, so the manhunt still escalates.

They also shout for three seconds before the first round — six the first time it ever happens —
because you are walking back out of a full-screen editor and need a beat to work out which way to
face. The HUD says so in the middle of the screen, **THE KINGS SAW THAT · RUN**, with the seconds
left on a draining bar. That grace only counts down once you have the controls back. It used to run through the reveal, while every shooter's cooldown
banked, so the first frame of play after the first piece was three rounds at once. Break away and
the heat drains in about twenty seconds; stand still and you heal.

Holding right mouse bends the shot most of the way onto whoever is nearest the crosshair, inside a
three-degree cone, and only onto someone who is armed — so the assist can never drag a round onto a
bystander. Hip fire is left exactly as inaccurate as it was.

Reach zero health and you get a **WASTED** card and respawn. Your pieces stay up. They always do.

## The briefing

Pressing **ENTER CITY** plays a ~18 second opening: Vance calls Jason and tells him what the job
is. It's skippable with `Esc`.

It opens on the phone ringing — **INCOMING CALL · VANCE** — for a second and a half before anyone
speaks, and that beat is doing a job. The city is mounted behind the briefing the moment it starts,
on `frameloop="demand"`, and draws its first frames there: scene graph, shaders, texture uploads,
well over a second of busy main thread. Spent on a ringing phone (whose rings are CSS on the
compositor and keep moving through it) it is invisible; spent after the briefing, as it used to be,
it was a second and a half of black before the drone shot.

Three of its shots will use a photographic plate if one is present, graded into the game's palette
so it cuts against the procedural shots rather than looking pasted on:

```
public/imgs/boss-doorway.png     Vance, front on   — "Jason. I got a job for you."
public/imgs/boss-alley.png       Vance by a wall   — "That crown is on every shutter…"
public/imgs/boss-spotlight.png   Vance, backlit    — "Go put our name over theirs."
```

Any of those that are missing fall back to a drawn portrait, so the trailer still plays without
them.

The one shot that shows the mechanic, **YOUR CAN**, is a drawn mock of the real studio rather
than a generic "editor": the tool rail with its real icons and Spray lit, a roller shutter on the
canvas, the studio's own action bar underneath with **CANCEL** and the neon **PAINT THE WALL** —
and a spray can writing the player's own tag across the shutter behind a soft aerosol edge, then
going up and pressing that button. It is laid out the way the studio actually is, down to which
buttons the editor's toolbar does and does not carry. Its line sits under the mock instead of
across it.

## Controls

| Input | Action |
| ----- | ------ |
| `W A S D` | Move |
| `Shift` | Run |
| Mouse | Look (click to capture, `Esc` to release) |
| Wheel | Camera distance |
| `E` | Open the graffiti studio at a spot |
| Left mouse | Fire (reloads itself when the clip runs dry) — STORY only |
| Right mouse | Hold to aim — steadier, over the shoulder — STORY only |
| `C` | Phone camera — photograph the city (`Space` shoots) |
| `G` | Open the black book — every piece you have painted |
| `M` | Mute |

The black book also holds every shot you took with the phone, and will save any of them.

## In the studio

- **ON THE STREET · LIVE** — the wall in the city, re-rendered with your work in progress on it
  (see *Watch it land while you work*).
- **YOUR TAG** — your name in four graffiti styles, drawn from what you type, for when you want
  to see the loop immediately and still have it be yours.
- **IMPORT AN IMAGE** — drops a picture from your machine onto the surface, blended with the wall,
  then hands it to the editor so you can crop, filter and draw over it.
- **YOUR PHOTOS** — every shot from the phone camera, one click from the wall.
- **THE RACK** — eight cans along the bottom of the studio, in the colours the city is lit in.
  Clicking one opens the Spray panel if it is shut and loads that colour into the editor's brush,
  so the can in the tray and the brush on the canvas are the same object. It lives in the action
  bar rather than on the rail because the rail is taller than a laptop screen and this is the
  thing you reach for the second you pick up Spray.
- **The editor's own rail** — crop, resize, filter, spray (draw), text, shapes, stickers, frame.
  All of it is live; all of it ends up on the wall. The draw tool is renamed **Spray** and, the
  first time it opens on a visit, comes loaded with the editor's own spray brush at a nozzle wide
  enough to read on a shutter instead of a thin pencil — and with the can that is in the rack
  rather than the editor's default red, which on brick is very nearly invisible (found by the
  panel's `data-testid`s; if a future editor renames them, the tool simply opens the way it
  ships).
- **PAINT THE WALL** / **CANCEL**.

The editor speaks the game's language through the component's `translations` option — Draw is
**Spray**, and its toolbar's save and cancel read **Paint the wall** and **Leave**.
`features.imageEditor.tools.draw.icon` swaps the pencil on that tool for a spray can drawn in raw
SVG.

Teaching the toolbar the game's words stopped its buttons reading as a different pair of actions
from the studio's own — and left the player looking at *Paint the wall* twice, forty centimetres
apart, which is worse. So the toolbar's pair steps back: a small hook walks the editor's DOM,
marks any button carrying one of those two labels, and one CSS rule hides it. The toolbar keeps
undo, redo, layers and zoom; the studio's footer keeps the one neon button, and it is the one that
calls `editor.getImage()`. Matched on the labels the translations put there, so a toolbar that
ever stops carrying them is simply left alone — both routes still work, and both are still wired
to the same two handlers.

Walking away from a piece that isn't on the wall yet asks first. `editor.hasChanges()` answers for
edits made in the editor; a tag, photo or import dropped in from the rail counts too, because
`reset()` clears the editor's history. `Esc` belongs to the editor first — finishing a text
layer, closing a colour picker — and only asks to leave when the editor didn't use it.

The same question guards the other way out. **PAINT THE WALL** on a surface nobody has touched
used to put up the bare wall — a reveal of nothing and a *PIECE CREATED* for it, which is exactly
what a first-timer's first press of the biggest button on the screen produced. Now the studio says
the wall is still bare and lights up the tag card on the rail instead.

On a short laptop screen the rail drops its explanatory paragraphs so all four of your tags sit
above the fold.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **@react-three/fiber 9** / **drei** / **three** for the city
- **@react-three/postprocessing** — bloom, ACES tone mapping, vignette
- **zustand** for game state
- **Tailwind CSS 4** for the HUD and menus
- **@unlayer/react-image-editor** — the graffiti mechanic

No backend. No model, audio or font assets in the repo — the city's textures, the character
rigs and the sound are all generated at runtime. The only images shipped are the three briefing
plates in `public/imgs/`.

## Architecture

```
app/
  page.tsx                 thin server page
components/
  NeonWalls.tsx            shell: menu → trailer → city → studio → reveal
  game/
    Game.tsx               <Canvas>, input wiring, pause
    Scene.tsx              lights, fog, environment, assembly
    Player.tsx             movement, animation, firing, Simulation tick
    GameCamera.tsx         follow / drone / aim / reveal / tour / death camera
    WallPreviewRig.tsx     one frame of the reveal shot, for the studio's live street view
    City.tsx  Ground.tsx  Sky.tsx  Actors.tsx  GraffitiSpot.tsx  Effects.tsx
    RevealClearance.tsx    keeps lamp posts and cars out of the reveal shot
    props/                 Building, StreetProps, LightPool
  editor/
    GraffitiStudio.tsx     ← the Unlayer editor, dressed as a game mode
  ui/                      MainMenu, IntroTrailer, GameHUD, CombatHUD,
                           InteractionPrompt, RevealSequence, Minimap,
                           PieceGallery (the black book), TourOverlay, …
lib/
  game/
    world.ts               traffic, pedestrians, gang, police, combat — the whole sim
    characterRig.ts        one articulated humanoid, shared by everyone
    carModel.ts            saloons, hatchbacks, pickups and vans — traffic and kerbside
    geometry.ts            rounded / tapered primitives
    facades.ts             canvas-generated building, road and sign textures
    movement.ts            kinematic collision + slide, and the camera arm (walls, low cover)
    city.ts                the neighbourhood as plain data
    audio.ts               fully synthesised sound (no audio files)
    wallPreview.ts         the studio's live street view: work in progress → one rendered frame
    revealShot.ts          where the camera stands to show a piece off (reveal + street view)
    tour.ts                the city tour: which walls, in what order, and the flight between them
    staticBatch.ts         bakes the block's static meshes into a few dozen draw calls
    layers.ts              who the wet road reflects (not the crowd)
    input.ts  playerState.ts  graffitiMaterial.ts  fonts.ts
  graffiti/
    surfaces.ts            the procedural surface photography, tag styles, fit-to-wall
    persist.ts             the saved city (IndexedDB)
    spots.ts               the fourteen paintable surfaces
    export.ts              single-piece download + the contact sheet
    timelapse.ts           every settled canvas, kept in order: the replay, the flipbook, the video
    graffitiStore.ts       zustand store
    graffitiTypes.ts
```

### Looking like a city rather than a pile of boxes

Three things do most of that work, and none of them ship an asset:

- **Ambient occlusion** (`N8AO`, already a dependency of
  `@react-three/postprocessing`) runs first in the composer. Without a contact
  shadow nothing sits on the ground, every alcove is as bright as the wall it is
  cut into, and the whole scene reads as flat-shaded voxels however good the
  textures are. It costs about a millisecond at half resolution.
- **Normal maps derived from the textures themselves.** `normalFromTexture()`
  runs a Sobel filter over a canvas texture's own albedo, so the brick courses,
  window reveals, panel seams and road grain that were already being painted
  become real relief that catches the street lamps. Highlights are flattened
  first, so a lit window recesses like a pane instead of bulging out.
- **Nothing has a raw 90° edge** where the player can get close to it:
  `geometry.ts` hands out rounded and chamfered boxes, and crates, bins,
  barriers and every part of the character rig use them. The highlight running
  along a soft edge is most of the difference between "modelled" and "blocky".

### Sixty frames on a laptop

Measured on a mid-range GPU, the street was running at 35 frames a second on a retina screen —
and a quarter of the pixels bought nothing, because the frame was never waiting on the GPU. It
was waiting on the CPU submitting **2,215 draw calls**. Four changes took that to **938** and the
same screen to a locked 60, with the picture unchanged:

- **The block is baked.** Once the city has mounted, `staticBatch.ts` merges every static mesh
  that draws the same way — same material by value (props made their own identical materials),
  same shadow flags, same patch of the map — into one geometry: 617 draw objects become about
  220. Props the reveal might need to lift out of its shot are left alone, found by asking the
  reveal's own pyramid test up front, for every wall and every place its camera can stand.
- **A joint is one mesh.** A head is a skull, a jaw, a brow, two eyes, a nose and a haircut that
  never move relative to each other. `characterRig.ts` folds each joint's parts into one
  vertex-coloured mesh, so a person is fifteen draws instead of thirty and the pose still works.
- **The crowd isn't in the puddles.** The wet road re-renders the whole scene from under the
  tarmac every frame; under that much blur a pedestrian's reflection is a smudge, so people live
  on a layer the reflection camera skips (`layers.ts`).
- **Ambient occlusion stays out of the glass.** N8AO sees transparent materials in the scene —
  every pool of lamplight — and switches into a mode that renders the scene twice more a frame,
  shadow map included. It is told not to.

On top of that the canvas watches its own frame rate in open play and gives up resolution when
it is struggling — but only keeps the lower resolution if it actually bought frames. A machine
that is slow for reasons resolution cannot fix keeps a sharp picture.

### Walking and running are one gait, not two clips

The character animation is hand-authored, and the thing that separates a walk
from a run is not stride length or playback speed — it is the **duty factor**,
the share of each leg's cycle spent on the ground. At 0.5 both feet are down for
part of every cycle and the body is never airborne: that is what walking *is*.
Take it below 0.5 and the two stance windows stop overlapping, gaps appear where
neither foot is down, and the character is running. `characterRig.ts` blends that
one number from 0.5 to 0.35 and everything else follows — the vertical
oscillation flips phase (a walker is highest over mid-stance, a runner in
mid-flight) and roughly doubles, the knee folds to 128° instead of 62°, the
elbows lock near a right angle, and the foot lands under the body instead of
reaching out onto the heel.

The invariant that keeps it honest: while a foot is planted it must travel
backwards relative to the hip by exactly the ground the body covers in that
time, which works out as `duty × stride` with the speed cancelling out. At a
duty of 0.5 that is half the stride, which is why the walk never skated — and
why lowering the duty for a run without shortening the stance excursion to match
made the foot drag. Measured after the fix: the planted ankle moves 0.1–0.3 cm a
frame while the body moves 9.7.

### One rule that shapes the whole codebase

**React never renders a frame of the simulation.** Traffic, pedestrians, bullets and the player's
transform live in plain mutable modules (`lib/game/world.ts`, `playerState.ts`). The renderers read
them inside `useFrame` and push values straight onto three.js objects. Only rare events — a piece
landing, a death, a wanted-level change — go through zustand. The HUD's fast-changing readouts
(health, ammo, radar) drive the DOM from their own `requestAnimationFrame` loop.

That is also why `eslint.config.mjs` disables `react-hooks/immutability` for `components/game` —
mutating the camera inside `useFrame` is R3F's contract, not a bug.

### Canvas text does not reflow

Every sign in the city, every shouted line and all fourteen surface photographs
are text rasterised onto a 2D canvas. DOM text swaps to the real face the moment
a webfont lands; canvas text does not — `fillText` bakes whichever face is loaded
at that instant, and nothing revisits it.

The warm-up used to start 60 ms after mount. Measured on a machine with
everything already cached, the Google Fonts stylesheet does not even begin
loading until **393 ms**, so the shop fronts and the surface photographs were
being drawn in the fallback face and then cached under it for the rest of the
session — a bug with no error, no warning, and a different outcome depending on
how warm your cache was.

`lib/game/fonts.ts` fixes it by asking for the faces explicitly and waiting for
them, raced against a deadline so a font that never arrives costs a fallback
rather than the city. It is also why the fonts come in through a plain
stylesheet link rather than `next/font`: the canvas call sites name `Anton` and
`Inter` literally, and `next/font` renames both to a generated family that
`ctx.font` cannot resolve.

## Notes

- `npm run dev` uses webpack. Turbopack's HMR panics on this project; `npm run dev:turbo` is left
  in place if you want to try it.
- The editor bundle is loaded from Unlayer's CDN. It is fetched while the briefing plays
  (`lib/graffiti/editorWarmup.ts`), so the first press of E opens a ready editor instead of a
  download — measured with the cache off, about a third of a second from key to canvas. If the CDN
  can't be reached the studio degrades gracefully: you can still import a picture or pick a
  ready-made piece and paint the wall.
- Best on a desktop with a keyboard and mouse.

## Originality

The look takes its cues from the open-world crime genre — dusk, neon, wet tarmac, a wanted-star
escalation. The city itself is drawn by code in this repository at runtime: every texture, sign,
character and sound. The briefing's three photographic plates live in `public/imgs/`.
