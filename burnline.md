# BURNLINE

### Palette

Keep Desert Indigo as the dark field rather than using brown or black. This is important for maintaining continuity with Vertigo Works.

Use Oxide Red for mesas, earth, concrete, structures, and large environmental masses.

Use Solar Yellow as the scorching highlight: horizon, signage, radar details, boost surfaces, track cues, etc.

The resulting landscape should resemble a hyper-saturated desert screen print, not a naturalistic desert.

### Environment

A remote desert proving ground / research installation.

Major visual elements:

- huge mesas
- dry lakebed
- radar dishes
- microwave towers
- transmission pylons
- buried facilities
- bunkers
- blast walls
- antenna arrays
- research structures
- long roads disappearing toward the horizon
- canyon infrastructure

Keep the environment sparse enough that individual landmarks can function as racing references.

### Track identity

**Line discovery + terrain exploitation.**

Burnline should initially appear to be a conventional desert road circuit, but increasingly skilled players discover that portions of the surrounding terrain are intentional racing surfaces.

Do not make it fully open-world.

Instead, create a small number of clearly authored advanced lines.

Suggested structure:

`DRY LAKE → MESA CLIMB → CANYON JUMP → RESEARCH STATION → DESERT CUTS → DOWNHILL FINISH`

### Sector design

**Dry lake**

Begin with an extremely high-speed crossing of an open dry lakebed.

Use distant objects such as:

- pylons
- radar dishes
- mesa gaps

as alignment references.

The player's optimization problem is maintaining the shortest possible trajectory while setting up the entrance into the mesa.

**Mesa climb**

Move into elevated terrain.

Use flowing elevation changes rather than constant hairpins.

The road should occasionally make nearby terrain look temptingly usable.

Introduce one relatively easy off-road apex here so players begin to understand the map's philosophy.

**Signature feature — Canyon jump**

Build a major jump near or underneath an enormous radar installation.

The preceding corners should exist largely to determine entry speed and angle.

Create a long downhill landing zone so different trajectories land at meaningfully different points.

The jump should reward optimizing the entire preceding sequence.

**Research station**

Immediately contrast the open desert with a dense, brutalist installation:

- blast walls
- bunker entrances
- radar infrastructure
- narrow concrete channels

Use several hard 90-degree turns.

This is Burnline's main precision/braking section.

Keep it short enough that the map retains its high-speed identity.

**Advanced desert cuts**

Author approximately three intentional terrain exploits across the entire map:

**Cut 1 — Dirt apex**
- obvious
- easy
- saves roughly a small fraction of a second
- teaches that leaving asphalt can be advantageous

**Cut 2 — Embankment jump**
- requires correct speed and position
- bypasses a meaningful amount of road
- noticeably faster when executed well

**Cut 3 — Canyon-side line**
- difficult
- narrow margin for error
- substantial leaderboard-level gain
- should feel discovered rather than explicitly signposted

These are intentional racing lines, not bugs. Ensure reset/checkpoint logic permits them.

Terrain collision and vehicle response must remain deterministic.

Do not use randomized surface bumps.

**Finale**

Leave the research installation and terrain cuts into a huge descending desert straight.

Give the player an uninterrupted view toward the finish and distant landscape.

This should produce a strong sensation that a good final-sector exit is converting directly into time gained.

### Mastery progression

Optimize:

1. dry-lake alignment;
2. carrying speed through elevation changes;
3. setup for the canyon jump;
4. landing distance;
5. braking through the research station;
6. progressively mastering the three terrain cuts.

A new player should simply learn the road. An intermediate player should discover the cuts. An expert should learn how to enter those cuts quickly enough that they actually save time.
