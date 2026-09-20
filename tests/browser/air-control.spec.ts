import { test, expect } from "./harness";
import { writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";

async function firstJump(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.evaluate(async () => {
    const trackPath = "/src/track/index.ts",
      driverPath = "/tests/driver.ts";
    (window as any).__airTrack = await import(/* @vite-ignore */ trackPath);
    (window as any).__airDrive = (
      await import(/* @vite-ignore */ driverPath)
    ).drivingInput;
  });
  const read = () =>
    page.evaluate(() => {
      const s = (window as any).__inferno,
        t = (window as any).__airTrack;
      const f = t.frame(s.progress);
      return {
        ...s,
        alignment: f.up.dot(f.up.clone().fromArray(s.up)),
        input: (window as any).__airDrive({
          ...s,
          position: f.p.fromArray(s.position),
          heading: f.forward.fromArray(s.heading),
          up: f.up.fromArray(s.up),
        }),
      };
    });
  const held = new Set<string>();
  async function keys(desired: string[]) {
    for (const key of held)
      if (!desired.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of desired)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
  }
  let takeoff: any;
  for (let i = 0; i < 650; i++) {
    const s = await read();
    if (!s.grounded) {
      takeoff = s;
      break;
    }
    const input = s.input;
    await keys([
      ...(input.throttle > 0 ? ["w"] : []),
      ...(input.brake ? ["s"] : []),
      ...(input.steer > 0 ? ["d"] : input.steer < 0 ? ["a"] : []),
    ]);
    await page.waitForTimeout(35);
  }
  expect(takeoff).toBeDefined();
  return { read, keys, takeoff, errors };
}

test("keyboard airbrake arrests pitch without powering roll; restart recovers immediately", async ({
  page,
}) => {
  const { read, keys, takeoff, errors } = await firstJump(page);
  await keys(["w", "Space"]);
  await page.waitForTimeout(60);
  const arrested = await read();
  expect(arrested.grounded).toBe(false);
  expect(Math.abs(arrested.pitchRate)).toBeLessThan(0.01);
  await keys(["w", "d"]);
  await page.waitForTimeout(200);
  const steer = await read();
  expect(Math.abs(steer.rollRate)).toBeLessThan(
    Math.abs(arrested.rollRate) + 0.01,
  );
  expect(steer.resetSerial).toBe(takeoff.resetSerial);
  await page.screenshot({ path: "test-results/airbrake.png" });
  await keys([]);
  await page.keyboard.press("r");
  const reset = await read();
  expect(reset.grounded).toBe(true);
  expect(reset.angularVelocity).toEqual([0, 0, 0]);
  expect(reset.time).toBe(0);
  expect(errors).toEqual([]);
});
