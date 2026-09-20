import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createTrack } from "../src/track/compile";
import { vertigoWorks } from "../src/track/courses/vertigo-works";

describe("track authoring API", () => {
  it("creates independent courses from data, with closed orthonormal frames", () => {
    const a = createTrack(vertigoWorks);
    const b = createTrack({
      ...vertigoWorks,
      id: "test-course",
      width: 25,
      nodes: vertigoWorks.nodes.map(([x, y, z]) => [x + 2000, y, z]),
      gaps: [],
      jumpProfiles: [],
      widthZones: [],
      boosts: [],
      resolution: 200,
    });
    expect(b.samples.length).toBe(200);
    expect(a.point(0).distanceTo(b.point(0))).toBeCloseTo(2000);
    expect(a.roadWidth(0)).toBe(vertigoWorks.width);
    expect(b.roadWidth(0)).toBe(25);
    expect(a.point(0).distanceTo(a.point(1))).toBeLessThan(1e-9);
    for (const f of a.samples) {
      expect(f.right.dot(f.forward)).toBeCloseTo(0, 6);
      expect(f.up.dot(f.forward)).toBeCloseTo(0, 6);
      expect(f.up.length()).toBeCloseTo(1, 6);
    }
  });
  it("rejects malformed marker order and geometry", () => {
    expect(() => createTrack({ ...vertigoWorks, width: -1 })).toThrow();
    expect(() =>
      createTrack({ ...vertigoWorks, checkpoints: [0.6, 0.2] }),
    ).toThrow();
    expect(() =>
      createTrack({ ...vertigoWorks, gaps: [[0.3, 0.2]] }),
    ).toThrow();
    expect(() => createTrack({ ...vertigoWorks, resolution: 1 })).toThrow();
  });
  it("selects the correct route at both levels of the crossing", () => {
    const c = createTrack(vertigoWorks);
    const upper = c.frame(vertigoWorks.crossings![0]),
      lower = c.frame(vertigoWorks.crossings![1]);
    expect(
      Math.hypot(upper.p.x - lower.p.x, upper.p.z - lower.p.z),
    ).toBeLessThan(1);
    expect(upper.p.y - lower.p.y).toBeGreaterThan(79);
    for (const t of vertigoWorks.crossings!) {
      const f = c.frame(t);
      const n = c.nearest(f.p.clone().add(new Vector3(0, 0.65, 0)));
      expect(n.t).toBeCloseTo(t, 3);
    }
  });
});

it("gives Vertigo a high crossing, sustained banking and a third-sector hairpin", () => {
  const c = createTrack(vertigoWorks);
  const heights = c.samples.map((s) => s.p.y);
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(149);
  expect(
    c.samples.filter((s) => Math.abs(s.bank) > 0.55).length,
  ).toBeGreaterThan(100);
  // The tight apex belongs to sector three, with a generous drift recovery lane.
  const hairpin = vertigoWorks.features!.find((f) => f.kind === "hairpin")!;
  const apex = (hairpin.start + hairpin.end) / 2;
  expect(vertigoWorks.checkpoints[1]).toBeLessThan(apex);
  expect(vertigoWorks.checkpoints[2]).toBeGreaterThan(apex);
  const entry = c
    .frame(hairpin.start + 0.009)
    .forward.clone()
    .setY(0)
    .normalize();
  const exit = c
    .frame(hairpin.end - 0.009)
    .forward.clone()
    .setY(0)
    .normalize();
  expect(entry.angleTo(exit)).toBeGreaterThan(1.8);
  expect(c.roadWidth(apex)).toBe(34);
});

it("uses half-metre deck segments and exact, unbridged jump lips", () => {
  const c = createTrack(vertigoWorks);
  for (const { a, b } of c.deckSegments) {
    expect((b - a) * c.length).toBeLessThanOrEqual(0.501);
    expect(c.inGap((a + b) / 2)).toBe(false);
    for (const lip of vertigoWorks.gaps.flat())
      expect(a < lip && b > lip).toBe(false);
  }
  for (const [start, end] of vertigoWorks.gaps) {
    expect(c.deckSegments.some((s) => s.b === start)).toBe(true);
    expect(c.deckSegments.some((s) => s.a === end)).toBe(true);
  }
});
