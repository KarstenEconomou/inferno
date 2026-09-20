# Vertigo Works

Vertigo Works is the first of the two built circuits. It is an elevated
industrial figure eight of 3 451 m, with a road 21 m wide that opens to 35 m at the
widest corner and jump.

One move makes the whole circuit: the road turns about its own axis and then
holds that attitude through a long constant-radius arc. Each sector takes that
move to a different amplitude.

| Sector             | Position in the lap | The move, and what it holds               |
| ------------------ | ------------------- | ----------------------------------------- |
| 01 The climb       | 0 % – 22.0 %        | Quarter turn: a wall ride, held 430 m     |
| 02 The helix       | 22.0 % – 44.5 %     | One angle for one revolution down a tower |
| 03 The switchbacks | 44.5 % – 64.3 %     | A hard lean through two linked hairpins   |
| 04 The underworks  | 64.3 % – 100 %      | Half turn: inverted along the ceiling     |

| Feature            | Position in the lap | Notes                                  |
| ------------------ | ------------------- | -------------------------------------- |
| Wall ride          | 8.0 % – 20.5 %      | Sustained, climbing at 15°             |
| First jump         | 23.2 %              | 12.0 m gap, taken over the crossover   |
| Helix              | 30.3 % – 44.1 %     | 405° of turn at 60 m radius, 58 m down |
| Upper hairpin      | 54.2 % – 59.4 %     | 152° with 85 m spirals, banked 26°     |
| Lower hairpin      | 58.0 % – 64.9 %     | 154° the other way, the road at 34 m   |
| Inverted traversal | 69.6 % – 78.6 %     | Half turn of roll, held and released   |
| Second jump        | 82.2 %              | 21.0 m gap, longer 48 m ramp           |

The deck climbs from 95 m at the timing line to 236 m at the exposed upper
crossing, then descends through the tower and the switchbacks to 41 m and
passes 192 m below the other branch. There are three checkpoint gates, four
sectors and seven boost pads. The gantry over the grid carries the name of the
circuit; the others are numbered. Every gate stands on flat, straight road,
because a checkpoint is also a respawn.

## Boost placement

1. Launch straight, before the road turns on its edge.
2. Off the wall and onto the crest.
3. Landed from the hop, committing to the tower.
4. Out of the tower, into the east sweep.
5. Switchbacks done, pointing at the ceiling.
6. Under the crossover, winding up for the long gap.
7. Final climb to the timing line.

The hairpins stay a braking and drift decision. They are deliberately banked
less than their curvature would ask for, because a corner banked to the limit
simply grips; these have to be placed. The second jump has a longer ramp and a
wider landing corridor, so a cautious approach and a boosted approach both
work.

## The road surface

The centreline is a periodic cubic spline with chord-length knots. It passes
through every authored node, and its curvature is continuous at each node and
at the lap seam.

The bank angle comes from the curvature of the centreline through a Gaussian
filter with a standard deviation of 8 m, and then a lookup that is continuous
in its second derivative. Authored bank zones, frame corrections and widening
all use quintic blends, so their ends add no first or second derivative.

A ramp adds no slope and no curvature at its entry, and keeps its authored
height and launch slope at the takeoff edge. The timing grid stays level for a
fixed distance on each side and then rejoins the grade.

The rendered strips and the collision strips share the same segments. No
segment is longer than 0.5 m, and the list includes the exact lip stations, so
no segment crosses the edge of a gap. The contact-load prediction stops at the
takeoff lip instead of sampling the missing deck beyond it, which prevents a
false landing on the lip and the loss of launch momentum.

## Deck-mounted machinery

`src/render/environment/landmarks.ts` uses one road-relative mount: saddle
plates clasp the slab, an outrigger below the deck carries an outer
box-section mast, and triangular knees brace the joint. Three assemblies share
that mount:

- Maintenance booms, with a trolley and a short hoist.
- Open service bridges, with a fabricated truss web and a walkway.
- Process-pipe gantries, with visible saddles and collars.

The service gallery uses the same mount. Its longitudinal members sample the
actual road between frames, so they follow the grade and the bank. Every
component must reach a deck clamp; a contact-graph test in
`tests/layout.test.ts` finds a floating part. Oriented clearance volumes
separate a real obstruction in the lane from a mount below a banked or
inverted deck.

## The district

`src/render/city/plan.ts` plans a repeatable 34 m parcel grid around the whole
course. The plan holds 4 566 plots, of which 728 are skyline facades, across
3 072 core parcels. Every core parcel is built, and narrow alleys and service
streets separate the blocks.

The ground datum is −58 m. A building below the course is 18 m to 52 m tall,
and the race architecture limits its roof further. The planner reserves the
road ribbons, the supports, the gates and the overhead structures with a 3 m
margin, plus a separate corridor for the flight paths and the chase camera. A
parcel subdivides around a structural column instead of staying empty.

One service truck moves in the reserved margin of an alley, for every
thirteenth wide district plot. The trucks are one instanced mesh, and their
bounds cover the whole of each path.

Tests check the coverage below every course station, the clearance between
buildings, the clearance between a building and the course, the containment of
each mesh in its declared volume, and the bounds of the moving traffic.
