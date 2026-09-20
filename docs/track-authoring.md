# Writing a course

Vertigo Works is defined in `src/track/courses/vertigo-works.ts` and Burnline in `src/track/courses/burnline.ts`. A course is data: coordinates, width, checkpoints, boosts, jumps and whatever else the schema offers. `createTrack()` compiles that data into the shared geometry API. The renderer, the vehicle, the collision triangles, the minimap and the checkpoint rules all read the selected course through `src/track/index.ts`. The schema is in `src/track/definition.ts` and its checks are in `src/track/validate.ts`.

To build another course, write the definition in `src/track/courses/<name>.ts` and add it to the registry in `src/track/courses/index.ts` under the id of its circuit in `src/circuits.ts`. Set that circuit `available` and give it a `grade`. `createTrack()` also compiles any definition independently, for tests, for the selection sheet and for tools. Change the ID whenever the geometry or the gameplay changes: an existing best time and its ghost belong to their original course.

## Selecting a course

One course is selected at a time. `selectCourse(id)` swaps it and calls every listener registered with `onCourseChange`, which is how the collision strips, the boost pad frames and the renderer's station cache are built again for the new road. `courseFor(id)` compiles a course without selecting it, which is what the selection sheet draws its plan from. Swap a course before a run, never during one: `Game.loadCircuit` does it, and the world, the plan and the records follow.

## Drafting a plan

Nodes can be written by hand, but Vertigo Works is drawn. `src/track/layout.ts` takes a closed polygon of corner marks and replaces each mark with the corner that belongs there: a ramp that winds curvature on, a constant-radius arc, and a ramp that winds it off again. Curvature is therefore continuous around the whole lap, which is what keeps the compiled bank sweeping rather than stepping, and what stops any choice of node spacing from putting a ripple into the deck.

A mark states a plan position, the radius of its arc, and the length of its ramps. Because marks are positions, the polygon closes by construction and a draft is edited by moving a corner on the map rather than by solving for its angle. `revolutions` adds complete extra turns inside one arc: one of them is a helix, and the road passes over itself once for every turn added. The lap begins where the last corner lets go of its curvature, which is the natural place for a timing line.

The arc has to fit between its neighbours. `draftPlan` throws when two corners want more of a run than the run holds; move a mark apart or cut a radius. `elevation` is a separate closed cubic profile through authored heights at the same distances, continuous in grade and in the rate of change of grade, so the road never kinks over a crest. `planCrossings` reports every place the drawing crosses itself, which is where the elevation profile has to hold two branches apart.

## Coordinates and markers

Nodes are `[x, y, z]` in metres with Y up. The spline is closed; do not duplicate the first node at the end. Use `curveType: "smooth"` for a periodic, chord-parameterized cubic spline. It passes through every node with continuous position, tangent and curvature, including the lap seam. This is Vertigo’s curve type. Legacy Catmull–Rom modes remain available; `tension` applies only to their uniform mode. Vertigo Works is sampled from its drawing every sixteen metres; markers are authored as distances around that drawing and converted once, through the same curve the compiler will build.

All marker positions are normalized **distance around the lap**, from 0 inclusive to 1 exclusive. They are not spline control-point indices. Checkpoints must be ordered; gaps are `[takeoff, landing]`. Place boosts with a specific purpose: introduce acceleration on a straight, amplify a jump, or reward the final corner exit. A boost before a jump needs enough run-up to align the car. Road width expands around jumps automatically, and banking fades around their landing zones.

`scenery` chooses the world built around the road: `"works"` for the industrial district, `"desert"` for the proving ground. It selects the deck treatment as well as the surroundings.

Optional `jump` settings expose ramp length/height, extra road width and width-blend distance (metres). `jumpProfiles` supplies per-gap overrides in gap order. `widthZones` smoothly widens selected corners, with edge blending in metres. Optional `banking` settings expose maximum angle (radians) and curvature strength. Defaults match the current vehicle. `resolution` defaults to 1200 navigation samples. Rendering and collision share independent deck segments no longer than 0.5 m, with exact jump lips and cross-road subdivisions of approximately 1.5 m.

Ramp height uses a quartic profile with zero added slope and curvature at the ramp entry, while retaining the authored launch height and slope. Quintic blends give width and bank transitions zero first and second derivatives at their endpoints. Curvature-derived banking uses a Gaussian filter with an 8m standard deviation and a C2 lookup. `startPlatform: { halfLength, blendLength }` keeps the timing grid level for `halfLength` metres on each side, then smoothly rejoins the grade.

`bankZones` override bank angle over a distance interval with blended edges. A zone must lean the way its corner already leans, or the road rolls back through flat and snaps to the far side; check the sign of the compiled bank before and after the zone. `rolls` can add complete twists. `frameAnchors` constrain the reference orientation at selected stations; provide an up vector, begin at 0, and end at 1. Their transported frames remain valid through vertical tangents. Vertigo pins world up at regular stations so no transported roll can drift into the deck. `features` records the bounds of wallride, loop, helix, inverted, hairpin, sweeper, jump and terrain-cut sections for verification, for the selection sheet and for the visual capture; it does not constrain the car. `sectors` names the timed movements of the lap, one more entry than there are checkpoints.

Use `frame(t)` for track-relative placement: `p` is the deck centre, `forward` points along the lap, `right` across it and `up` normal to the banked deck. `surface(t, lateral)` returns the normal of the twisted ribbon at a lateral offset. `nearest(position, optionalProgressHint)` uses all three coordinates and can retain local branch continuity through close geometry.

## The painted lane

A course may state a `lane`: a road painted on a corridor that is wider than it. Its `marks` give, at distances around the lap, the centre of the asphalt and half its width in metres, relative to the middle of the corridor. They are interpolated with the same closed cubic the elevation profile uses, so the paint cannot kink, and `validate.ts` requires at least four ordered marks. Keep `|offset| + halfWidth` inside `roadWidth(t) / 2` at every station; nothing stops you painting a road off the edge of its own corridor, and a test is the only thing that will notice.

The compiled course then offers `lane(t)`, `paved(t, lateral)` — one on the asphalt, zero on open ground, blended over `blend` metres — and the two figures the car feels: `surfaceGrip` scales its tire grip and `surfaceDrag` adds to its rolling drag. Boost pads are placed on the lane automatically. Both figures belong to the course and not to the moment, so a line across open ground repeats exactly. A course without a `lane` is paved from edge to edge and none of it applies.

A lane is how an authored terrain cut is made: bow the paint to the outside of a corner, open the corridor on the inside, and the shorter line is the one that costs grip. Measure the gain, because a cut that does not pay is only decoration. [Burnline](burnline.md) describes four of them.

## Asset clearance

A crossing in plan view is allowed; intersecting road volumes are not. Layout tests require more than 30m vertical separation wherever non-adjacent road widths approach each other, at crossings. Edge intersections are tested in actual 3D, so vertical road projections can overlap without false collisions. This reserves space for vehicles, the camera and overhead architecture.

`drivingEnvelope(course)` builds conservative oriented bounds for the drivable width and 4.5m above it. Each oriented strip encloses both endpoint sections, so banked and inverted roads do not acquire false axis-aligned wedges below their decks. `assetIntersections(asset, envelope)` checks each actual mesh’s oriented bounds before batching. Support generation omits assemblies that touch that envelope and excludes piers near the crossover. Anchored gates and gallery pieces are tested against other branches. Check new scenery with these helpers before adding it to the environment.

City planning runs after the complete race architecture exists. Ribbon triangles are reserved in local groups; piers, gates, gallery structures and landmark meshes contribute their actual transformed bounds, expanded by 3m. A separate road-relative envelope reserves jumps and chase-camera space. Dense 34m ground parcels are height-limited against these volumes and subdivided around columns. All buildings and service vehicles stay inside their declared parcel volume. Four shallow facade rows surround the district. Background buildings use blue massing and thin red contours; continuous green edges identify the race track. Clearance and coverage are tested against the complete course.

## Iteration and verification

1. Edit the definition and run `npm run test:track` for authoring and clearance checks.
2. Run `npm test` for full simulated laps, jumps and collision regressions.
3. Run `npm run dev` and open `http://localhost:5173/tests/visual/scene.html`. From the browser console, `inspectScene(0.789)` inspects the underpass and `inspectScene(0.228)` inspects the overpass. Any normalised progress works.
4. Run `npm run test:visual -- course-name` to capture the grid, corners, jumps, both crossing levels and gallery in `/tmp/inferno-visual/course-name`. Update capture positions if landmarks move.
5. Run `npm run test:browser` for a real keyboard lap, the checkpoints and a saved ghost, then `npm run build`.

The feasibility drivers use the same inputs available to a player; they do not move the car directly. Passing geometry checks alone does not prove a jump is drivable. Inspect the rendered course as well as the test results.

`landmarks` and `gallery` belong to the works. A desert course states neither, and builds its own world instead; see [Burnline](burnline.md). A desert course grades its own bench under the deck, draws the ground it stands on in indigo contour and break lines, and fences the edge of its corridor where the guardrail is.

Architectural sequences live in `landmarks`: choose `cantilever`, `rib-vault` or `pipe-bridge`, a starting progress, a count and spacing in normalized lap distance. The legacy `rib-vault` identifier now builds an open rectangular service bridge; the other kinds build maintenance hoists and saddle-mounted process pipes. Keep sequences short and separated; `src/render/environment/landmarks.ts` builds them in track-local coordinates. Each has deck clamps, outer masts and connected bracing. The gallery uses the same mounts with continuous longitudinal members following the bank and grade. Tests require all components to connect back to a clamp intersecting the deck slab. Entire assemblies are checked against the driving envelope. Freestanding direction and jump signs are intentionally absent.

`sectors` contains one more entry than `checkpoints`: each gate ends the previous sector and starts the next. Vertigo uses four sectors and three gates, Burnline five and four, and every gate stands on straight road of a width a car can be put back on, because a checkpoint is also a respawn. `lessons` supplies once-per-course-version approach windows and short guidance; place each window early enough to read before the mechanic. `crossings` records the two branch positions for geometry checks.

## What Vertigo Works is made of

One idea runs through the lap: the road turns about its own axis and then holds that attitude through a long constant-radius arc. The wall ride holds a quarter turn, the helix holds half of one while it spirals down a tower, the switchbacks hold a hard lean through two linked hairpins, and the ceiling holds a full half turn upside down. Four sectors, four amplitudes of the same move.

A corner that is banked to the limit simply grips, so the switchbacks are deliberately banked less than their curvature would ask for, and are the widest road on the circuit. That is what makes them the place to slide. The helix is the opposite: one angle held for one whole revolution, and the elevation profile has to drop far enough over a turn that the coil clears the coil beneath it.

The road is finely subdivided across its width as well as along the centreline so rendered and collision triangles match on changing banks. Tangent sampling stays on one side of a takeoff lip; sampling across its discontinuity would pitch a slow car downward. Test both centre and offset approaches across a range of speeds after changing ramps.
