import { writeFileSync } from "node:fs";
import { test, expect } from "./harness";

test("bottom-right speed readout and quick recovery from an inverted barrier crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await expect(page.locator("#speed")).toBeVisible();
  await expect(page.locator(".speed-unit")).toHaveText("KM/H");
  const box = await page.locator(".speedometer").boundingBox();
  const size = page.viewportSize()!;
  expect(size.width - (box!.x + box!.width)).toBeLessThan(100);
  expect(box!.y).toBeGreaterThan(500);
  await page.screenshot({ path: "test-results/speedometer-grid.png" });
  await page.evaluate(async () => {
    const trackPath = "/src/track/index.ts",
      driverPath = "/tests/driver.ts";
    (window as any).__physicsTrack = await import(/* @vite-ignore */ trackPath);
    (window as any).__physicsDrive = (
      await import(/* @vite-ignore */ driverPath)
    ).drivingInput;
  });
  const held = new Set<string>();
  let inverted = false;
  for (let i = 0; i < 1400; i++) {
    const data = await page.evaluate(() => {
      const s = (window as any).__inferno,
        t = (window as any).__physicsTrack,
        f = t.frame(s.progress);
      const zone = t.track.features.find((f: any) => f.kind === "inverted");
      return {
        ...s,
        input: (window as any).__physicsDrive({
          ...s,
          position: f.p.fromArray(s.position),
          heading: f.forward.fromArray(s.heading),
          up: f.up.fromArray(s.up),
        }),
        inverted: s.progress > zone.start && s.up[1] < -0.98,
      };
    });
    if (data.inverted) {
      inverted = true;
      break;
    }
    const desired = new Set<string>();
    if (data.input.throttle > 0) desired.add("w");
    if (data.input.brake) desired.add("s");
    if (data.input.steer > 0) desired.add("d");
    if (data.input.steer < 0) desired.add("a");
    for (const key of held)
      if (!desired.has(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of desired)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
    await page.waitForTimeout(45);
  }
  expect(inverted).toBe(true);
  for (const key of held) await page.keyboard.up(key);
  const before = await page.evaluate(() => (window as any).__inferno);
  await page.screenshot({ path: "test-results/speedometer-inverted.png" });
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await page.waitForTimeout(350); // Build lateral load before applying the shared brake.
  await page.keyboard.down("Space");
  const collisionTrace: any[] = [];
  let detached: number | undefined,
    hit = false,
    recovered: any;
  for (let i = 0; i < 100; i++) {
    const s = await page.evaluate(() => (window as any).__inferno);
    collisionTrace.push({
      time: s.time,
      t: s.progress,
      up: s.up[1],
      speed: s.speed,
      grounded: s.grounded,
      rail: s.railContact,
      impact: s.railImpact,
      serial: s.resetSerial,
    });
    if (!hit && (s.railContact || s.railImpact > 0)) {
      hit = true;
      // Throttle now sustains a controlled rail slide. Brake after contact
      // to shed the downforce and exercise the inverted crash recovery.
      await page.keyboard.up("w");
      await page.keyboard.up("d");
    }
    if (!s.grounded && hit && detached === undefined) detached = s.time;
    if (s.resetSerial > before.resetSerial) {
      recovered = s;
      break;
    }
    await page.waitForTimeout(35);
  }
  await page.keyboard.up("w");
  await page.keyboard.up("d");
  await page.keyboard.up("Space");
  writeFileSync(
    "/tmp/inferno-inverted-crash.json",
    JSON.stringify(collisionTrace, null, 2),
  );
  expect(hit).toBe(true);
  expect(detached).toBeDefined();
  expect(recovered).toBeDefined();
  expect(recovered.time - detached!).toBeLessThan(0.55);
  expect(recovered.grounded).toBe(true);
  expect(recovered.up[1]).toBeGreaterThan(0.65);
  expect(recovered.checkpoint).toBe(before.checkpoint);
  expect(recovered.time).toBeGreaterThan(before.time);
  expect(recovered.needsRespawn).toBe(false);
  await page.screenshot({ path: "test-results/inverted-crash-recovered.png" });
  const speed = await page.evaluate(() => ({
    shown: +document.querySelector("#speed")!.textContent!,
    actual: Math.round(Math.abs((window as any).__inferno.speed) * 3.6),
  }));
  expect(speed.shown).toBe(speed.actual);
  expect(errors).toEqual([]);
});
