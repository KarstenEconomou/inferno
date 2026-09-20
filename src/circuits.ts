/** Circuit identities. Field, structure and signal are the three shared inks
 * used by the renderer and interface. Unauthored courses remain previews. */
export type TrackTheme = {
  field: string;
  structure: string;
  signal: string;
  display_name: string;
};
export type CircuitIdentity = {
  id: string;
  theme: TrackTheme;
  tagline: string;
  identity: string;
  mastery: string;
  character: string;
  paletteNames: [string, string, string];
  /** One-line class of circuit, shown on the selection sheet. */
  discipline: string;
  /** Demand of the circuit on each axis, from one to five. A course that has
   * not been built has no demand to report, and states none. */
  grade?: { speed: number; technical: number; air: number };
  available: boolean;
  motif: string;
  /** Existing sound kit for identity previews without an authored sound set. */
  audioTheme?: string;
};
export const circuits: CircuitIdentity[] = [
  {
    id: "vertigo",
    discipline: "VERTICAL TECHNICAL",
    grade: { speed: 3, technical: 5, air: 5 },
    available: true,
    motif: "figure-eight",
    tagline: "Industry turned vertical.",
    identity:
      "The brutal industrial heart of Inferno: cranes, factories, pipes, towers, elevated roadways, a spiral tower the road climbs inside, twisting vertical segments, and track geometry folded through itself",
    mastery:
      "Complete Inferno primer — a crash course in boosts, jumps, sustained banking, vertical driving, technical braking, high-speed commitment, recovery, and line optimization",
    character:
      "Compact, violent figure-eight geometry that repeatedly changes orientation: road becomes wall, wall becomes helix, helix becomes ceiling, and elevated track twists back through the skyline",
    paletteNames: ["Foundry Cobalt", "Furnace Orange", "Acid Lime"],
    theme: {
      field: "#0F008F",
      structure: "#E13D19",
      signal: "#98FE42",
      display_name: "VERTIGO WORKS",
    },
  },
  {
    id: "burnline",
    discipline: "OPEN DESERT",
    grade: { speed: 5, technical: 3, air: 3 },
    available: true,
    motif: "horizon",
    tagline: "Desert under test.",
    identity:
      "Remote desert proving ground: mesas, radar arrays, bunkers, dry lakebeds, pylons, and buried research infrastructure",
    mastery:
      "Line discovery & terrain exploitation — learning when the nominal road is slower than the terrain around it",
    character:
      "Huge open-speed sections broken by elevation, canyon jumps, brutalist compounds, and progressively harder off-road cuts",
    paletteNames: ["Desert Indigo", "Oxide Red", "Solar Yellow"],
    theme: {
      field: "#21106F",
      structure: "#E0441F",
      signal: "#FFD62E",
      display_name: "BURNLINE",
    },
  },
  {
    id: "karst",
    discipline: "BLIND GEOMETRY",
    available: false,
    motif: "quarry",
    audioTheme: "burnline",
    tagline: "Excavated racing lines.",
    identity:
      "Monumental quarry and subterranean civil-engineering complex: terraces, retaining walls, excavation voids, drainage tunnels, and shafts",
    mastery:
      "Geometry reading & commitment — blind crests, compression, changing camber, and committing before the road fully reveals itself",
    character:
      "Immense open quarry terraces alternate with claustrophobic tunnels, sudden drops, bowls, vertical cuts, and short violent climbs",
    paletteNames: ["Concrete Grey", "Asphalt Charcoal", "Iron Oxide"],
    theme: {
      field: "#92948D",
      structure: "#242829",
      signal: "#A94A32",
      display_name: "KARST",
    },
  },
  {
    id: "containment",
    discipline: "PRECISION",
    available: false,
    motif: "basin",
    audioTheme: "spillway",
    tagline: "Hazardous.",
    identity:
      "Hazardous-material treatment complex: pressure vessels, retention basins, pipes, blast walls, warning corridors, and service gantries",
    mastery:
      "Risk & precision — exploiting razor-thin fast lines without touching the surrounding infrastructure",
    character:
      "Tight corridors alternate with exposed containment basins; several corners offer extremely dangerous inside cuts with almost no runoff",
    paletteNames: ["Containment Green", "Reagent Green", "Sulfur Chartreuse"],
    theme: {
      field: "#293726",
      structure: "#48BE68",
      signal: "#E0EB51",
      display_name: "CONTAINMENT",
    },
  },
  {
    id: "terminal",
    discipline: "MAXIMUM SPEED",
    available: false,
    motif: "runway",
    tagline: "Aviation after dark.",
    identity:
      "Night cargo airport: runways, hangars, freighters, radar, fuel infrastructure, and service tunnels",
    mastery:
      "Velocity & braking precision — exact placement at extreme speed and perfect braking references",
    character:
      "Technical hangar opening gives way to enormous boost-assisted runways, a maximum-speed braking zone, tunnels, taxiways, and aircraft-scale slaloms",
    paletteNames: ["Runway Blue", "Beacon Red", "Arc Cyan"],
    theme: {
      field: "#07137F",
      structure: "#FF3B1F",
      signal: "#6CFAFF",
      display_name: "TERMINAL ZERO",
    },
  },
  {
    id: "spillway",
    discipline: "MOMENTUM",
    available: false,
    motif: "dam",
    tagline: "Hydraulic monument.",
    identity:
      "Colossal hydroelectric infrastructure: dam faces, turbine halls, penstocks, sluice gates, mist, and transmission equipment",
    mastery:
      "Momentum & verticality — preserving speed through descents, jumps, machinery, and the climb back upward",
    character:
      "Starts on the dam crest, drops to turbine level, clears a spillway, threads enclosed galleries, then climbs through enormous banked switchbacks",
    paletteNames: ["Reservoir Blue", "Hydro Cyan", "Safety Yellow"],
    theme: {
      field: "#081B8F",
      structure: "#00E7E7",
      signal: "#EFFF32",
      display_name: "THE SPILLWAY",
    },
  },
  {
    id: "frostline",
    discipline: "LOW GRIP",
    available: false,
    motif: "pipeline",
    audioTheme: "spillway",
    tagline: "Whiteout.",
    identity:
      "Arctic logistics corridor: frozen ports, pipelines, avalanche barriers, research stations, ice fields, and wind-scoured infrastructure",
    mastery:
      "Traction preservation & controlled rotation — carrying speed through low-grip arcs without over-sliding",
    character:
      "Broad frozen sweepers reward deliberate rotation while narrow pipeline-service sections punish excess slip; long exposed straights end in severe braking zones",
    paletteNames: ["Polar Navy", "Glacier White", "Flare Orange"],
    theme: {
      field: "#10254B",
      structure: "#D9F0EB",
      signal: "#FF572A",
      display_name: "FROSTLINE",
    },
  },
  {
    id: "intermodal",
    discipline: "RAIL YARD",
    available: false,
    motif: "interchange",
    audioTheme: "terminal",
    tagline: "Switchyard.",
    identity:
      "Working intermodal freight terminal: container stacks, gantry cranes, weighbridges, hump yards, signal gantries and the rails that thread between them",
    mastery:
      "Reading a route — committing to one line through a junction that offers several, and carrying the commitment out the far side",
    character:
      "Long straight running between container walls, broken by level crossings, points that split the road and tight yard turns under the cranes",
    paletteNames: ["Freight Slate", "Signal Red", "Sodium Yellow"],
    theme: {
      field: "#2C3437",
      structure: "#F43139",
      signal: "#F6F46D",
      display_name: "INTERMODAL",
    },
  },
  {
    id: "afterimage",
    discipline: "FLOW",
    available: false,
    motif: "tower",
    audioTheme: "mirage",
    tagline: "City in reflection.",
    identity:
      "Nocturnal architectural megacity: mirrored towers, elevated boulevards, skybridges, luminous voids, and impossible corporate infrastructure",
    mastery:
      "Trajectory discipline & flow — treating entire sequences as one continuous line",
    character:
      "Huge sweepers wrap around towers, compress into skybridges and helices, then release into elevated jumps and long descending motorway arcs",
    paletteNames: ["Night Azure", "Vapour Blue", "Pale Lilac"],
    theme: {
      field: "#30579A",
      structure: "#A8BFEA",
      signal: "#C1B3EF",
      display_name: "AFTERIMAGE",
    },
  },
];
