import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const name = process.argv[2] || "current";
const size =
  process.argv[3] === "1080"
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
/** Which circuit to walk. Each one has its own list of views, because a view
 * is named for the thing it is looking at. */
const circuit =
  process.argv[4] || (name.includes("burnline") ? "burnline" : "vertigo");
const directory = `/tmp/inferno-visual/${name}`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: size });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(
  `http://localhost:5173/tests/visual/scene.html?circuit=${circuit}`,
);
await page.waitForFunction(() => window.sceneReady === true);
const authored = await page.evaluate(() => {
  const t = window.testTrack.track;
  const features = {};
  // A course can use a kind more than once; the views want each of them.
  for (const f of t.features ?? [])
    (features[f.kind] ??= []).push({ start: f.start, end: f.end });
  return { ...t, features, theme: window.testCircuit };
});
const feature = (kind, mix = 0.5, index = 0) => {
  const f = authored.features[kind][index];
  return f.start + (f.end - f.start) * mix;
};
const desert = circuit === "burnline";
const scenes = desert
  ? [
      ["00-grid", 0],
      ["01-lakebed", feature("sweeper", 0.2)],
      ["02-lake-chord", feature("sweeper", 0.55)],
      ["03-lake-exit", feature("sweeper", 0.95)],
      ["04-mesa-gate", authored.checkpoints[0] + 0.012],
      ["05-climb", 0.3],
      ["06-dirt-apex", feature("terrain-cut", 0.5, 0)],
      ["07-saddle", feature("jump", 0.15, 0)],
      ["08-canyon-lip", authored.gaps[0][0] - 0.004],
      ["09-canyon-landing", authored.gaps[0][1] + 0.01],
      ["10-landing-slope", feature("jump", 0.8, 0)],
      ["11-station-approach", authored.checkpoints[2] - 0.01],
      ["12-blast-channel", 0.71],
      ["13-station-exit", authored.checkpoints[3]],
      ["14-embankment", feature("terrain-cut", 0.5, 1)],
      ["15-rim", feature("terrain-cut", 0.45, 2)],
      ["16-descent", 0.93],
      ["17-run-in", 0.985],
    ]
  : [
      ["00-grid", 0],
      ["01-wallride", feature("wallride")],
      ["02-jump", authored.gaps[0][0] - 0.003],
      ["03-helix-entry", feature("helix", 0)],
      ["04-helix-quarter", feature("helix", 0.25)],
      ["05-helix-half", feature("helix", 0.5)],
      ["06-helix-exit", feature("helix", 1)],
      ["07-hairpin", feature("hairpin")],
      ["08-inverted-entry", feature("inverted", 0.25)],
      ["09-inverted", feature("inverted")],
      ["10-inverted-exit", feature("inverted", 0.85)],
      ["11-jump-two", authored.gaps[1][0] - 0.003],
      ["12-gallery", authored.gallery.start + 0.02],
      ["13-return", 0.95],
      ["14-overpass", authored.crossings[0]],
      ["15-underpass", authored.crossings[1]],
      ...authored.landmarks.map((l, i) => [
        `landmark-${i}`,
        l.start + l.spacing * 2,
      ]),
    ];
const report = [];
for (const [id, progress] of scenes) {
  const metrics = await page.evaluate((t) => window.inspectScene(t), progress);
  report.push({ id, progress, ...metrics });
  await page.screenshot({ path: `${directory}/${id}.png` });
}
await page.evaluate(() => window.inspectScene(0, true));
await page.screenshot({ path: `${directory}/09-title.png` });
for (const [id, t, offset] of desert
  ? [
      ["18-off-paint", feature("terrain-cut", 0.5, 0), -13],
      ["19-rim-edge", feature("terrain-cut", 0.45, 2), -15],
      ["20-lake-edge", feature("sweeper", 0.55), 18],
    ]
  : [
      ["10-inside-bank", feature("helix", 0.5), 6],
      ["11-outside-bank", feature("helix", 0.5), -6],
      ["12-gallery-edge", authored.gallery.start + 0.02, 6],
    ]) {
  const metrics = await page.evaluate(
    ([t, x]) => window.inspectScene(t, false, x),
    [t, offset],
  );
  report.push({ id, progress: t, ...metrics });
  await page.screenshot({ path: `${directory}/${id}.png` });
}
// The country itself, seen from off the road: the canyon in profile, the
// bluffs of the mesa climb and the fall of the closing descent.
for (const [id, t, side, back, lift] of desert
  ? [
      ["21-canyon-wall", authored.gaps[0][0], 330, -320, 150],
      ["22-mesa-country", 0.3, -820, -420, 400],
      ["23-descent-country", 0.93, 720, -520, 430],
    ]
  : []) {
  const metrics = await page.evaluate(
    ([t, side, back, lift]) => window.inspectLand(t, side, back, lift),
    [t, side, back, lift],
  );
  report.push({ id, progress: t, ...metrics });
  await page.screenshot({ path: `${directory}/${id}.png` });
}
for (const [id, bank, side] of [
  ["18-print-rear-quarter", 0, 1],
  ["19-print-banked", 0.5, 1],
  ["20-print-opposite", -0.3, -1],
]) {
  const metrics = await page.evaluate(
    ([bank, side]) => window.inspectPrint(bank, side),
    [bank, side],
  );
  report.push({ id, ...metrics });
  await page.screenshot({ path: `${directory}/${id}.png` });
}
for (const view of desert
  ? []
  : ["overhead", "undertrack", "0", "1", "2", "3"]) {
  const metrics = await page.evaluate((v) => window.inspectCity(v), view);
  report.push({ id: `city-${view}`, ...metrics });
  await page.screenshot({ path: `${directory}/city-${view}.png` });
}
for (const kind of desert
  ? []
  : ["cantilever", "rib-vault", "pipe-bridge", "gallery"]) {
  const metrics = await page.evaluate((k) => window.inspectStructure(k), kind);
  report.push({ id: `structure-${kind}`, ...metrics });
  await page.screenshot({ path: `${directory}/structure-${kind}.png` });
}
const printStability = await page.evaluate(() =>
  window.inspectPrintStability(),
);
await writeFile(
  `${directory}/print-stability.json`,
  JSON.stringify(printStability, null, 2),
);
await writeFile(`${directory}/errors.json`, JSON.stringify(errors, null, 2));
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
const rgb = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
const palette = new Set(
  [authored.theme.field, authored.theme.structure, authored.theme.signal].map(
    rgb,
  ),
);
const unexpectedColors = report.flatMap((r) =>
  Object.keys(r.colors).filter((color) => !palette.has(color)),
);
console.log(
  JSON.stringify({
    directory,
    scenes: report.length + 1,
    errors,
    unexpectedColors,
    printStability,
    maxDrawCalls: Math.max(...report.map((r) => r.calls)),
  }),
);
await browser.close();
if (
  errors.length ||
  unexpectedColors.length ||
  printStability.changedFraction > 0.005
)
  process.exitCode = 1;
