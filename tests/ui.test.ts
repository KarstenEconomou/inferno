import { describe, expect, it } from "vitest";
import {
  circuits,
  comparisonTime,
  defaults,
  rebind,
  sectors,
  pace,
  validHistory,
} from "../src/ui";
describe("time-trial interface model", () => {
  it("orders nine identities and builds the two with authored geometry", () => {
    expect(circuits.filter((c) => c.available).map((c) => c.id)).toEqual([
      "vertigo",
      "burnline",
    ]);
    expect(circuits.map((c) => c.id)).toEqual([
      "vertigo",
      "burnline",
      "karst",
      "containment",
      "terminal",
      "spillway",
      "frostline",
      "intermodal",
      "afterimage",
    ]);
    expect(circuits.map((c) => c.tagline)).toEqual([
      "Industry turned vertical.",
      "Desert under test.",
      "Excavated racing lines.",
      "Hazardous.",
      "Aviation after dark.",
      "Hydraulic monument.",
      "Whiteout.",
      "Switchyard.",
      "City in reflection.",
    ]);
    for (const c of circuits) {
      expect(
        new Set([c.theme.field, c.theme.structure, c.theme.signal]).size,
      ).toBe(3);
      // A course that has not been built reports no demand on the driver.
      expect(!!c.grade).toBe(c.available);
    }
  });
  it("swaps conflicting controls rather than leaving unreachable actions", () => {
    const b = { ...defaults };
    expect(rebind(b, "restart", "Space")).toBe("brakeSecondary");
    expect(b.restart).toBe("Space");
    expect(b.brakeSecondary).toBe("KeyR");
    expect(new Set(Object.values(b)).size).toBe(Object.keys(defaults).length);
  });
  it("compares sector durations, including the finish sector", () => {
    expect(sectors([18, 40, 63], 85)).toEqual([18, 22, 23, 22]);
    expect(pace(-0.224)).toBe("−0.224 AHEAD");
    expect(pace(0.103)).toBe("+0.103 BEHIND");
  });
  it("projects pace only onto the current sector and never across a respawn", () => {
    const poses = [
      { t: 0, p: [0, 0, 0] },
      { t: 10, p: [10, 0, 0] },
      { t: 20, p: [20, 0, 0], cut: true },
      { t: 30, p: [30, 0, 0] },
    ];
    expect(comparisonTime(poses, [5, 1, 0], 0, 10)).toBe(5);
    expect(comparisonTime(poses, [25, 0, 0], 20, 30)).toBe(25);
    expect(comparisonTime(poses, [0, 80, 0], 0, 10)).toBeNull();
    expect(comparisonTime(poses.slice(1, 3), [15, 0, 0], 10, 20)).toBeNull();
  });
  it("rejects malformed timing history", () => {
    expect(
      validHistory(
        [
          { date: "2026-09-16", time: 10, sectors: [1, 2, 3, 4] },
          { date: "x", time: NaN, sectors: [1, 2, 3, 4] },
        ],
        4,
      ),
    ).toHaveLength(1);
    expect(validHistory({}, 4)).toEqual([]);
  });
});

import { migrateBindings } from "../src/ui";
it("migrates legacy drift to a second brake without discarding existing preferences", () => {
  const b = migrateBindings(defaults, {
    throttle: "KeyI",
    brake: "KeyK",
    drift: "ShiftLeft",
    restart: "KeyT",
    camera: "KeyV",
  });
  expect(b.brakeSecondary).toBe("ShiftLeft");
  expect(b.throttle).toBe("KeyI");
  expect(b.restart).toBe("KeyT");
  expect(b.camera1).toBe("Numpad1");
  expect("drift" in b).toBe(false);
});
it("keeps a saved numpad binding reachable when new camera actions are added", () => {
  const b = migrateBindings(defaults, { throttle: "Numpad1" });
  expect(b.throttle).toBe("Numpad1");
  expect(new Set(Object.values(b)).size).toBe(Object.keys(b).length);
});
