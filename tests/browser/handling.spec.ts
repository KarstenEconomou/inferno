import { test, expect } from "./harness";
import { writeFileSync } from "node:fs";

for (const preset of [1, 2])
  test(`short keyboard taps turn the visible car with its path in camera ${preset}`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#start").click();
    await page.locator("#drive").click();
    await page.keyboard.press(`Numpad${preset}`);
    await page.keyboard.down("w");
    await page.waitForFunction(() => (window as any).__inferno.speed > 35);
    await page.evaluate(() => {
      (window as any).__tapTrace = [];
      (window as any).__sampleTaps = true;
      const sample = () => {
        const s = (window as any).__inferno;
        (window as any).__tapTrace.push({
          time: s.time,
          heading: s.heading,
          rendered: s.renderedHeading,
          velocity: s.velocity,
          position: s.position,
          rail: s.railContact,
          steeringAngle: s.steeringAngle,
          wheels: s.renderedWheels,
        });
        if ((window as any).__sampleTaps) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    for (const key of ["d", "a"]) {
      await page.keyboard.down(key);
      await page.waitForTimeout(150);
      await page.keyboard.up(key);
      await page.waitForTimeout(200);
    }
    await page.keyboard.up("w");
    const trace = await page.evaluate(() => {
      (window as any).__sampleTaps = false;
      return (window as any).__tapTrace as {
        time: number;
        heading: number[];
        rendered: number[];
        velocity: number[];
        position: number[];
        rail: boolean;
        steeringAngle: number;
        wheels: { front: boolean; steering: number; spin: number }[];
      }[];
    });
    const angle = (a: number[], b: number[]) =>
      Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            a.reduce((sum, n, i) => sum + n * b[i], 0) /
              (Math.hypot(...a) * Math.hypot(...b)),
          ),
        ),
      );
    const lag = Math.max(...trace.map((s) => angle(s.heading, s.rendered)));
    expect(trace.length).toBeGreaterThan(20);
    expect(
      Math.max(...trace.map((s) => angle(trace[0].heading, s.heading))),
    ).toBeGreaterThan(0.04);
    // Only fixed-step interpolation may separate the visible nose from the
    // simulated heading. An extra body filter used to lag several degrees.
    expect(lag).toBeLessThan(Math.PI / 180);
    expect(trace.every((s) => !s.rail)).toBe(true);
    expect(
      trace.some((s) => s.wheels.some((w) => w.front && w.steering < -0.01)),
    ).toBe(true);
    expect(
      trace.some((s) => s.wheels.some((w) => w.front && w.steering > 0.01)),
    ).toBe(true);
    expect(
      trace.every((s) =>
        s.wheels.every((w) =>
          w.front
            ? Math.abs(w.steering - s.steeringAngle) < 0.015
            : w.steering === 0,
        ),
      ),
    ).toBe(true);
    expect(
      new Set(trace.map((s) => s.wheels[0].spin.toFixed(3))).size,
    ).toBeGreaterThan(10);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const paused = await page.evaluate(
      () => (window as any).__inferno.renderedWheels,
    );
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => (window as any).__inferno.renderedWheels),
    ).toEqual(paused);
    writeFileSync(
      `/tmp/inferno-steering-taps-${preset}.json`,
      JSON.stringify({ lagDegrees: (lag * 180) / Math.PI, trace }, null, 2),
    );
    await page.screenshot({ path: `test-results/steering-taps-${preset}.png` });
  });
