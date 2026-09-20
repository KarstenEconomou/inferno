# Architecture

Inferno is a browser time-trial racer. It uses Vite, TypeScript and three.js.
There is no game engine, no physics library and no server.

## Layers

The source is divided into layers. A layer may only import from the layers
below it. This keeps the simulation testable without a browser and lets the
renderer change without touching the driving model.

| Layer      | Directory     | Depends on                    | Role                                                       |
| ---------- | ------------- | ----------------------------- | ---------------------------------------------------------- |
| Entry      | `src/main.ts` | game, render                  | Creates the world and the game, then starts the loop.      |
| Game       | `src/game/`   | sim, render, audio, ui, track | Race flow, input, screens, head-up display, storage.       |
| Renderer   | `src/render/` | track, sim, ui                | Scene, camera, course architecture, district, print pass.  |
| Sound      | `src/audio/`  | —                             | Semantic events, synthesis, mix and spatial sources.       |
| Simulation | `src/sim/`    | track                         | Vehicle, contact, race rules, ghosts, driving advice.      |
| Course     | `src/track/`  | —                             | Course schema, compiler and the selected course.           |
| Interface  | `src/ui/`     | —                             | Circuit identities, timing, bindings, display preferences. |

`src/circuits.ts` holds the circuit identities. Both the renderer and the
interface read the three inks from it, so neither owns the palette.

One course is selected at a time. `src/track/index.ts` compiles the course of
a circuit on demand, keeps it, and publishes it as the selected one;
`selectCourse` swaps it and `onCourseChange` tells the collision strips, the
boost pad frames and the renderer's station cache to build themselves again.
Nothing swaps the course while a car is moving: `Game.loadCircuit` does it
when a run begins, and the world, the plan and the records follow.

## Directories

```
src/
  main.ts            entry point
  circuits.ts        circuit identities and their three inks
  game/
    game.ts          race flow, persistence and the frame loop
    storage.ts       preferences, records and history in local storage
    hud.ts           head-up display markup and per-frame values
    minimap.ts       flat course outline for the sheet, the pause plan and the road
    diagnostics.ts   read-only state for browser verification
    input/           keyboard state, gamepad sampling, event routing
                     focus.ts chooses the menu cursor from screen geometry
    screens/         title, tracks, records, pause, settings, results
                     chrome.ts holds the frame that every screen shares
  sim/
    vehicle.ts       the car and one fixed step of its physics
    handling.ts      every handling constant, in metres and seconds
    contact.ts       deck sweep and the four wheel probes
    race.ts          checkpoint rules, ghost recording and validation
    feedback.ts      driving advice for the display
  track/
    definition.ts    the authoring schema
    validate.ts      schema checks and default settings
    compile.ts       spline, frames, banking, samples and deck segments
    smooth-curve.ts  periodic cubic spline through every node
    layout.ts        plan-view drafting: corner marks, ramps and elevation
    clearance.ts     driving envelope and asset intersection tests
    courses/         course data, and the registry that names it
    index.ts         the selected course, and how a course is swapped
  render/
    world.ts         scene, render target and the two-stage print pass
    camera.ts        three camera presets at the simulation rate
    obstructions.ts  triangle grid for the camera clearance sweep
    ink.ts           the three inks and the two-ink surface shader
    geometry.ts      shared parts, outlines and static batching
    car.ts           the car model and its ghost form
    trails.ts        tire marks from a slide
    environment/     deck surfaces, markings, landmarks, supports, signs
    city/            district plan, buildings and service traffic
    desert/          ground derived from the road, and what stands on it
  audio/
    index.ts         entry point for the game
    model.ts         events, recipes, buses and the tempo grid
    director.ts      graph, voices, layers and telemetry mapping
    kit.ts           bank loading and the procedural fallback
    synthesis.ts     every sound primitive
    themes.ts        one timbre set per circuit identity
    layers.ts        continuous oscillator and noise layers
    harmony.ts       scale and tuning helpers
    drivetrain.ts    speed and load to layer levels
    event-policy.ts  voice limits, priority and event gain
    bank.ts          layout of the pre-rendered bank
    debug.ts         development-only audition lab
  ui/
    bindings.ts      actions, keyboard and gamepad bindings
    timing.ts        lap-time arithmetic and history validation
    hud-prefs.ts     display preferences and their limits
    theme.ts         publish the circuit inks as CSS properties
  styles/            one stylesheet for each part of the interface
```

## Data flow in one frame

1. `Game.loop` samples the gamepad and measures the elapsed time.
2. The keyboard and the gamepad combine into one `Input`: throttle, steer,
   brake. Nothing else reaches the simulation.
3. While the clock runs, the game advances `Vehicle.step` at a fixed 120 Hz
   and calls `Race.update` after each step. State changes become semantic
   sound events.
4. The head-up display writes only the values that changed.
5. The sound director receives one telemetry record.
6. The renderer interpolates between the last two simulation poses and draws
   the frame.

The simulation never reads the clock, the document or the renderer. A render
frame never advances physics by a variable amount.

## Rules that keep the structure

- The simulation owns world velocity. Nothing outside `src/sim/` writes to it.
- Game code emits an event name such as `vehicle.land`. It never names a sound
  file, a frequency or a gain.
- The course is data. `createTrack` compiles it; the rest of the game reads it
  through `src/track/index.ts`.
- Every relative import inside `src/audio/` states its `.ts` extension. The
  offline sound generator loads those modules directly in Node.
- A change to the geometry of a course changes its `id`, and a change to the
  handling constants changes `TRACK_VERSION`. Either invalidates the saved
  records and ghosts, and each course keeps its own.
- A course states its geometry and, optionally, a painted lane and the
  scenery to build around it. The simulation reads the lane through
  `surfaceGrip` and `surfaceDrag`, and knows nothing else about it.
