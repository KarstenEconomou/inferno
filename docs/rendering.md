# Rendering

The world uses three printing inks and nothing else. The interface uses the
same three values, with quiet backing panels for legibility.

Vertigo Works prints in:

| Ink         | Colour    | Role                                                       |
| ----------- | --------- | ---------------------------------------------------------- |
| Ultramarine | `#0F008F` | Sky, asphalt, cut-outs and building masses                 |
| Vermilion   | `#E13D19` | Road shoulders, structural outlines, facade detail         |
| Acid green  | `#98FE42` | Car highlights, continuous road edges, checkpoints, boosts |

Burnline prints in:

| Ink           | Colour    | Role                                                      |
| ------------- | --------- | --------------------------------------------------------- |
| Desert indigo | `#21106F` | Sky, asphalt, and any slope turned away from the sun      |
| Oxide red     | `#E0441F` | Mesas, earth, concrete, structures, the lines on the road |
| Solar yellow  | `#FFD62E` | The edge of the graded corridor, boosts, dish rims        |

`src/circuits.ts` holds one such set for each circuit identity. The renderer
reads it through `src/render/ink.ts`, and the interface reads it through
`src/ui/theme.ts`, which publishes the values as CSS custom properties.
Choosing a circuit repaints the inks in place: `setInk` moves the colour of
every material the renderer has built, rather than building new ones.

## The print pass

The scene renders into a target of the viewport height, up to 900 pixels, with
four-sample multisampling. A full-screen pass then maps each resolved pixel to
the nearest of the three inks.

The order matters. Coverage resolves first, so a thin contour loses coverage
and fades in weight instead of switching between a full pixel and nothing.
There is no blur, no fourth colour and no temporal filter. Hard boundaries
still show discrete pixel steps; this is a reduction of undersampling, not
continuous-tone antialiasing.

The camera near plane is 0.5 m, which keeps enough depth precision between the
close layers of the deck surface.

## Surfaces

Shading uses solid ink planes. There is no dither pattern, no bloom, no
surface noise and no additional colour.

- Metal and concrete select their ink from the angle to one fixed light
  direction, with different thresholds.
- Open ground uses a third threshold, low enough that earth stays oxide
  almost everywhere and only a real slope falls into the dark field.
- The road returns one flat ink.
- The car uses its own object-space rule: lime above the shoulder line, cobalt
  on the vertical and lower planes. The boundary follows the body, not the
  light, so it cannot flicker while the car banks or rolls.

Contours are separate line geometry, not an outline shader, so a hidden edge
obeys the same depth buffer as the faces around it.

A deck is drawn as a set of strips along the road. A strip may scale with the
corridor, which is what an edge marking wants, or hold the metres it was
given and follow a line of its own, which is how Burnline paints a fixed-width
road down the middle of a corridor three times as wide.

## No particles

The visual language excludes particle effects: no boost particles, sparks,
dust, exhaust or celebration emitters. Tire marks are ink on the deck, bound
to the contact patch, and they use a fixed pool with one draw call.

Sliding leaves structure-ink rear-wheel tracks; grounded boost uses signal ink
even without slip. Boost takes precedence during a slide. Each segment keeps
its own ink for its three-second lifetime, with no marks across gaps or resets.

## Wheel animation

Each tire, rim, hub and spoke assembly rolls around its axle from signed
forward travel and a 0.5 m radius. Front-wheel steering pivots contain those
rolling assemblies, and follow the simulation's smoothed, speed-dependent
steering angle, including countersteering. Suspension motion affects the body
separately. Paused poses stay still; respawns reset the rolling history.

Ghosts use the same animation. New recordings store an optional steering angle;
older recordings keep their front wheels centered. Replay cuts reset wheel
travel history instead of spinning through the teleport.

## Shape before texture

- Keep the racing line quiet. Narrow vermilion shoulders and continuous green
  edges describe the width, the bank and the way ahead. A side fascia makes an
  elevated section read as a slab instead of a wire.
- Reserve green for the car and for driving cues. The car uses dark glazing,
  wheel rings, sloping panels and louvres instead of one green silhouette.
- Draw the district with blue masses and fine vermilion outlines. Large red
  background blocks are excluded, so the red line work never competes with the
  continuous green edge of the course.
- Attach overhead scenery to the deck. Saddle plates, outriggers and knee
  braces carry the trusses, hoists and pipes. Nothing floats beside the road.
- Keep roof and facade detail sparse, so the silhouette stays readable.

## Batching

`bake()` merges the static architecture into one mesh for each material, plus
one line set for each contour ink. The district reuses a small number of
source geometries thousands of times, so each source expands and outlines once
and then copies per instance.

A full capture of the course holds about 1.2 million triangles in 81 draw
calls at 1280 × 720.

## Vehicle motion

Game interpolates the last two physics poses before rendering. World applies
that position and orientation together; a second chassis rotation filter would
make short steering taps look like sideways translation. Camera smoothing is
independent of the car’s visible pose.

## Verification

`npm run test:visual -- <name>` captures 36 views of the course, the edges,
the car, the structures, the district and the skyline. It writes the images, a
report of the exact world colours and the draw calls to
`/tmp/inferno-visual/<name>/`. The capture fails on a browser error, on any
colour outside the three inks, or when the car shading moves under a matched
rotation of the camera and the car.
