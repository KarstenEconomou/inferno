# Burnline

Burnline is a desert proving ground of 4 935 m. Its road is 17 m wide at the
narrowest and the corridor around it opens to 48 m at the widest.

One idea makes the whole circuit: **the graded corridor is the course, and the
asphalt is only a line drawn on it.** The paint is a surveyor's line, laid
where a road crew would lay it. Open ground beside it still carries the car,
with 90 % of the cornering grip and a little more rolling drag, so leaving the
asphalt is a decision rather than an escape. The lakebed teaches it at three
hundred, the mesa offers one plain dirt apex, and two authored cuts on the way
home pay for it properly.

| Sector              | Position in the lap | What it asks for                              |
| ------------------- | ------------------- | --------------------------------------------- |
| 01 Dry lake         | 0 % – 22.3 %        | The shortest trajectory through two bends     |
| 02 Mesa climb       | 22.3 % – 42.9 %     | 135 m of climb, and the first dirt apex       |
| 03 Canyon jump      | 42.9 % – 61.4 %     | Entry speed at the lip, and landing distance  |
| 04 Research station | 61.4 % – 75.8 %     | The only hard braking on the circuit          |
| 05 The descent      | 75.8 % – 100 %      | The embankment, the rim, and a kilometre home |

| Feature            | Position in the lap | Notes                                      |
| ------------------ | ------------------- | ------------------------------------------ |
| Lakebed bends      | 1.4 % – 21.0 %      | 45° and 50° at 420 m and 400 m radius      |
| Mesa gate          | 22.3 %              | 84° at 48 m radius, from 290 to 204 km/h   |
| Dirt apex (cut 1)  | 35.4 % – 43.1 %     | 73° at 62 m radius, corridor open to 34 m  |
| Canyon             | 48.1 % – 48.9 %     | 42 m gap from a level lip at 165 m         |
| Landing slope      | 48.9 % – 57.4 %     | Falls at one in seven for 300 m            |
| Concrete channel   | 65.7 % – 74.7 %     | Three square turns, poured flat, 17 m wide |
| Embankment (cut 2) | 77.0 % – 83.3 %     | 68° at 100 m radius, corridor open to 48 m |
| Rim (cut 3)        | 83.3 % – 89.9 %     | 54° at 135 m radius, downhill at 300 km/h  |

The road starts at 16 m on the lakebed, climbs to 165 m at the canyon lip,
falls to 94 m at the installation and gives the rest back down the closing
straight. There are four checkpoint gates, five sectors and seven boost pads.
The gantry over the grid carries the name of the circuit; the others are
numbered. Every gate stands on straight road at no more than 26 m wide,
because a checkpoint is also a respawn.

## The painted lane

`lane` in the course definition is a list of stations, each with the centre of
the asphalt and half its width, in metres, relative to the middle of the
corridor. The compiler interpolates them with the same closed cubic the
elevation profile uses, so the paint never kinks.

Three figures come out of it:

- `lane(t)` — where the asphalt is, used by the renderer and by boost pads.
- `paved(t, lateral)` — 1 on the asphalt, 0 on open ground, blended over
  1.6 m at the edge.
- `surfaceGrip(t, lateral)` and `surfaceDrag(t, lateral)` — what the car
  feels. The vehicle scales its tire grip by the first and adds the second to
  rolling drag. Nothing else in the simulation knows about the paint.

Both figures belong to the course, not to the moment, so a cut repeats
exactly. A course with no `lane` is paved from edge to edge and none of this
applies; Vertigo Works is unchanged by it.

## The four open-ground lines

Each one is authored the same way: the paint bows to the outside of a corner
and the corridor stays open on the inside. The line across the inside is
shorter, and slower per metre. Executing it well is the difference.

1. **The lakebed**, 3 % – 21 %. Two opposed bends of 45° and 50°, held at full
   speed, with the paint on the outside of both. The diagonal across the pan
   saves about 40 m. It is the first thing the circuit says.
2. **Cut 1 — the dirt apex**, 35 % – 43 %. Obvious, forgiving and worth about
   two tenths. It exists so that an intermediate driver works out what the
   rest of the map is for.
3. **Cut 2 — the embankment**, 77 % – 83 %. The paint runs round a bunker
   field; the chord across the inside crosses a crest in the elevation
   profile. Taken straight and fast the car leaves the ground there, and the
   landing decides the next 300 m. Overrunning it reaches the rim marker.
4. **Cut 3 — the rim of the wash**, 83 % – 90 %. Downhill, at over 300 km/h,
   with the corridor edge on the inside and nothing to say it is there. The
   gain is comparable to cut 2 and the margin is a car's width.

The boost pads sit on the paint. Two of them — mid-lakebed and out of the dirt
apex — are on a part of the paint a cut line leaves, so a cut can cost a pad.
That is the point: the fast lap is not "always cut" and not "never cut".

## The canyon

The last stretch into the lip is level, so the ramp alone launches the car:
54 m long and 4.4 m high, for a launch slope of about one in seven. The
landing slope beyond the gap falls faster than the flight does, which is what
makes the jump a continuous problem instead of a pass or a fail.

| Entry speed | Lands past the lip |
| ----------- | ------------------ |
| 45 m/s      | about 95 m         |
| 60 m/s      | about 120 m        |
| 75 m/s      | about 150 m        |
| 90 m/s      | about 190 m        |

Entry speed is set by the saddle, a 54° corner of 45 m radius, 130 m before
the lip, and by the pad on the run to it. Everything from the dirt apex
forward is therefore part of the jump.

## Boost placement

1. Off the grid and onto the lakebed.
2. Mid-bend, on the paint: the pad or the short way, not both.
3. Out of the dirt apex, pointing at the saddle.
4. The last fifty metres before the lip.
5. Landed, straightened and running down the slope.
6. The concrete channel, between the square turns.
7. Both lines are back together: the descent begins.

## The proving ground

`src/render/desert/` builds the world. Nothing in it is placed in world
coordinates by hand: every piece states a lap distance and a lateral offset,
so a change to the course carries the landmarks with it, and every piece is
tested against `drivingEnvelope` before it is kept.

`terrain.ts` derives the ground from the road. A regional height field is
spread out from the course samples by inverse distance, which puts the high
country where the circuit climbs and the low ground where it runs flat. Five
octaves of undulation and a terrace operator are added on top of it, and both
are held back inside 70 m of the road and released over the next 260 m. The
circuit therefore sits in an open basin with high country on the rim: no
relief is ever put where it could take a sightline away.

Two authored figures are cut into the result:

- The **dry lake**, a level pan of oxide with a hard edge. It carries no
  contour, because it has no relief; it carries five strand lines instead,
  the rings a lake leaves behind as it dries.
- The **canyon**, 148 m deep. It is a 40 m slot where the road crosses it, a
  chasm with a floor 170 m wide 300 m out, and closed before it reaches the
  lakebed. The narrow point is the reason the circuit jumps here and nowhere
  else.

A corridor is then graded along the course so the deck always sits on its own
bench, 1.7 m under it. The bench follows the banked section of the road and
not its centreline: a corridor of 48 m at a bank of 0.3 rad drops nearly 8 m
from one edge to the other, and a level bench under it would stand through the
low edge of the road. The undulation is a hash of the coordinate, so the same
place has the same height in every build.

`structures.ts` holds the silhouettes: a paraboloid dish on a lattice
pedestal, microwave masts, transmission pylons, half-buried bunkers, blast
walls on splayed buttresses, portal frames over the concrete channel, phased
array fields and flat-topped mesas.

Their jobs are racing jobs:

- The **pylon line** is straight where the road is not. It is the edge the
  lakebed is aimed along.
- The **big dish**, 58 m across, stands over the far side of the canyon. It is
  what the whole approach is aimed under.
- The **masts** on the mesa mark the climb and the dirt apex.
- The **blast walls** stand 15 m out from the edge of the concrete, close
  enough to be the braking reference, and the **portals** give the
  installation a roofline. Each wall is short, because the channel turns
  square corners and a long wall laid beside one turn reaches across the
  next.
- The **mesas** stand one to two kilometres out. At that size they are
  horizon silhouettes, and anything nearer would put a talus skirt across the
  part of the lap the circuit loops back to.

## Drawing the ground

The desert is drawn as well as shaded. Every triangle of the ground is read a
second time as a line, and the lines are indigo:

| Line    | Where it is drawn                                   |
| ------- | --------------------------------------------------- |
| Contour | Every 16 m of height, on ground gentler than 35°    |
| Break   | Along the 35° line: the edge of every bluff and rim |
| Strand  | Five rings inside the dry lake                      |

Contours describe a hillside and stop at a bluff, because contours on a face
that steep only stack up into a texture. The bluff carries one line along its
edge instead, and its own shading does the rest. Between them a driver reads
height, fall and edge at three hundred, from a surface that would otherwise be
a field of flat oxide. Mesas are drawn in the same indigo, because a mesa is
landform and not structure.

Nothing is drawn on the graded bench beside the road: the deck covers it.

## The fence

The guardrail stands at half the corridor width and is 1.8 m high, and the
fence is that rail, drawn where it is. Short posts every 8 m, a solar yellow
top rail on the line that cannot be crossed, and one oxide rail below it. The
bays are empty, so the desert and the line a driver wants across it stay in
view. There is no fence over the canyon, because there is no rail there.

On this circuit the open ground beside the asphalt is a racing surface. The
fence is the one thing that says where the course stops.

## Inks

Desert Indigo `#21106F` is the field: the sky, any slope that turns away from
the sun, and every line drawn on the ground itself — contours, bluff edges,
strand lines and the edges of a mesa. Oxide Red `#E0441F` is everything solid
— earth, concrete, structures, the fence posts and the lines on the asphalt.
Solar Yellow `#FFD62E` is kept for one thing on the ground: the edge of the
graded corridor, which is where the course stops. It marks that edge twice,
once on the deck and once along the top rail of the fence, and it also carries
the boost chevrons, the dish rims, the mast tips and the gate type.

The asphalt itself is unmarked indigo, the same ink as the sky, which is why
the red lines on it and the yellow rim beyond it do all the work of saying
where the road is and where the course ends.
