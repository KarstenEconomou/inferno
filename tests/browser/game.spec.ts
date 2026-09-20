import { test, expect } from "./harness";
import { writeFileSync } from "node:fs";
test("save recovery and 1080p layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("inferno-best", "{broken");
      localStorage.setItem("inferno-settings", "{broken");
    } catch {
      /* The second load deliberately blocks storage. */
    }
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "TRACKS", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".course-card")).toHaveCount(0);
  await expect(page.locator(".warning")).toHaveCount(0);
  await page.screenshot({ path: "test-results/title-1920.png" });
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    }),
  );
  await page.reload();
  await expect(page.getByText("Local saves unavailable.")).toBeVisible();
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.waitForTimeout(3200);
  await page.keyboard.down("w");
  await page.waitForTimeout(1000);
  await page.keyboard.up("w");
  await page.screenshot({ path: "test-results/race-1920.png" });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  expect(errors).toEqual([]);
});
test("title, controls, pause, restart and preferences", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "TRACKS", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/title-1280.png" });
  await page.getByRole("button", { name: "SETTINGS" }).click();
  await page.getByRole("button", { name: "GHOST", exact: true }).click();
  await page.locator("#ghost-setting").uncheck();
  await page.getByRole("button", { name: "BACK", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "SETTINGS" }).click();
  await page.getByRole("button", { name: "GHOST", exact: true }).click();
  await expect(page.locator("#ghost-setting")).not.toBeChecked();
  await page.getByRole("button", { name: "BACK", exact: true }).click();
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.waitForTimeout(3300);
  await page.keyboard.down("w");
  await page.waitForTimeout(1800);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  const t = await page.locator("#time").textContent();
  await page.waitForTimeout(400);
  await expect(page.locator("#time")).toHaveText(t!);
  await page.getByRole("button", { name: "RESUME RUN" }).click();
  await page.keyboard.press("r");
  expect((await page.evaluate(() => (window as any).__inferno)).state).toBe(
    "ready",
  );
  await expect(page.locator("#ready")).toHaveCount(0);
  await expect(page.locator("#time")).toHaveText("00:00.000");
  await page.screenshot({ path: "test-results/grid-1280.png" });
  expect(errors).toEqual([]);
});
test("complete a lap using keyboard input, save a ghost and replay it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?audio");
  await page.waitForFunction(
    () =>
      (window as any).__infernoAudio && (window as any).__inferno.audio.ready,
  );
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.waitForTimeout(3300);
  await page.evaluate(async () => {
    const path = "/src/track/index.ts";
    (window as any).__testTrack = await import(/* @vite-ignore */ path);
    const driverPath = "/tests/driver.ts";
    (window as any).__testDrive = (
      await import(/* @vite-ignore */ driverPath)
    ).drivingInput;
  });
  await page.evaluate(() => {
    const destination = (window as any).__infernoAudio.record();
    const recorder = new MediaRecorder(destination.stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    (window as any).__lapRecording = { recorder, chunks, destination };
    recorder.start();
  });
  const held = new Set<string>();
  const screenshots = new Set<number>();
  const jumpShots = new Set<number>();
  const driftShots = new Set<string>();
  const featureShots = new Set<string>();
  let poweredDriftFrames = 0;
  let result: any;
  let minFps = Infinity;
  for (let step = 0; step < 2500; step++) {
    const d = await page.evaluate(() => {
      const s = (window as any).__inferno,
        t = (window as any).__testTrack;
      const current = t.frame(s.progress);
      const input = (window as any).__testDrive(
        {
          ...s,
          position: current.p.clone().fromArray(s.position),
          up: current.up.clone().fromArray(s.up),
          heading: current.forward.clone().fromArray(s.heading),
        },
        { drift: true },
      );
      const feature = t.track.features.find(
        (f: any) => s.progress > (f.start + f.end) / 2 && s.progress < f.end,
      );
      return { ...s, ...input, feature: feature?.kind };
    });
    result = d;
    if (
      held.has("w") &&
      held.has("s") &&
      d.grounded &&
      d.driftPhase === "drift"
    ) {
      expect(d.audio.params.throttle).toBe(1);
      expect(d.audio.params.brake).toBe(0);
      poweredDriftFrames++;
    }
    minFps = Math.min(minFps, d.fps);
    if (d.state === "finished") break;
    const desired = new Set<string>();
    if (d.throttle > 0) desired.add("w");
    if (d.brake) desired.add("s");
    if (d.steer > 0.018) desired.add("d");
    if (d.steer < -0.018) desired.add("a");
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
    if (d.feature && !featureShots.has(d.feature)) {
      featureShots.add(d.feature);
      await page.screenshot({ path: `test-results/feature-${d.feature}.png` });
    }
    // Slip can peak while brake release is already restoring rear grip.
    const phase =
      Math.abs(d.slipAngle) > 0.07 && d.driftBlend > 0.05
        ? "sustained"
        : d.driftPhase === "recovery"
          ? "recovery"
          : d.driftPhase === "drift"
            ? "entry"
            : null;
    if (phase && !driftShots.has(phase)) {
      driftShots.add(phase);
      await page.screenshot({ path: `test-results/drift-${phase}.png` });
      if (phase === "sustained") {
        // Read just the WebGL canvas: CSS text antialiasing is outside the
        // three-ink scene palette. Capture in the same animation frame.
        const colors = await page.evaluate(
          () =>
            new Promise<string[]>((resolve) => {
              requestAnimationFrame(() => {
                const source =
                  document.querySelector<HTMLCanvasElement>("#game")!;
                const canvas = document.createElement("canvas");
                canvas.width = source.width;
                canvas.height = source.height;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(source, 0, 0);
                const pixels = ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                ).data;
                const palette = new Set<string>();
                for (let i = 0; i < pixels.length; i += 4)
                  palette.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
                resolve([...palette].sort());
              });
            }),
        );
        expect(colors).toEqual(["15,0,143", "152,254,66", "225,61,25"]);
      }
    }
    if (d.checkpoint > 0 && !screenshots.has(d.checkpoint)) {
      screenshots.add(d.checkpoint);
      await expect(page.locator(".sector .done")).toHaveCount(d.checkpoint);
      await expect(page.locator(".sector .current")).toHaveCount(1);
      await expect(page.locator("#split-notice")).not.toContainText(
        /GAINED|LOST|AHEAD|BEHIND/,
      );
      const colors = await page.evaluate(() =>
        [".sector .done", ".sector .current"].map(
          (s) => getComputedStyle(document.querySelector(s)!).backgroundColor,
        ),
      );
      expect(colors[0]).not.toBe(colors[1]);
      await page.screenshot({
        path: `test-results/sector-${d.checkpoint}.png`,
      });
    }
    if (!d.grounded) {
      const jump = d.progress < 0.5 ? 1 : 2;
      if (!jumpShots.has(jump)) {
        jumpShots.add(jump);
        await page.screenshot({ path: `test-results/jump-${jump}.png` });
      }
    }
    await page.waitForTimeout(45);
  }
  for (const key of held) await page.keyboard.up(key);
  await page.screenshot({ path: "test-results/lap-end.png" });
  console.log("Browser lap:", { ...result, minFps });
  expect(result.state).toBe("finished");
  expect(result.checkpoint).toBe(result.checkpointCount);
  expect(jumpShots.size).toBe(2);
  expect([...featureShots].sort()).toEqual([
    "hairpin",
    "helix",
    "inverted",
    "wallride",
  ]);
  expect([...driftShots].sort()).toEqual(["entry", "recovery", "sustained"]);
  expect(poweredDriftFrames).toBeGreaterThan(0);
  expect(result.fps).toBeGreaterThan(55);
  expect(result.frameMsP95).toBeLessThan(25);
  expect(result.learnedLessons.sort()).toEqual([
    "boost",
    "drift",
    "hop",
    "jump",
  ]);
  expect(result.sectorCount).toBe(4);
  await expect(page.locator(".sector span.done")).toHaveCount(4);
  expect(result.resetSerial).toBe(3); // Construction, title, start: no automatic respawns.
  await expect(page.locator("#checkpoint")).toHaveCount(0);
  await expect(
    page.locator("#finish-strip, .toast, #driving-status, .split-sheet"),
  ).toHaveCount(0);
  await expect(page.locator(".sector .current")).toHaveCount(0);
  await expect(page.locator("#time")).toBeVisible();
  const finishTime = result.time;
  const finishPosition = result.position;
  await page.keyboard.down("w");
  await page.waitForTimeout(200);
  await page.keyboard.up("w");
  const afterFinish = await page.evaluate(() => (window as any).__inferno);
  expect(afterFinish.time).toBe(finishTime);
  expect(
    Math.hypot(
      ...afterFinish.position.map(
        (v: number, i: number) => v - finishPosition[i],
      ),
    ),
  ).toBeGreaterThan(1);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "PERSONAL BEST" }),
  ).toBeVisible();
  await expect(page.locator("#results tbody tr")).toHaveCount(4);
  await expect(page.locator("#results tbody tr").first()).toContainText("—");
  await page.screenshot({ path: "test-results/results.png" });
  await page.waitForTimeout(1900);
  const captured = await page.evaluate(async () => {
    const r = (window as any).__lapRecording;
    await new Promise<void>((resolve) => {
      r.recorder.onstop = () => resolve();
      r.recorder.stop();
    });
    r.destination.disconnect();
    return Array.from(new Uint8Array(await new Blob(r.chunks).arrayBuffer()));
  });
  writeFileSync("test-results/audio-clean-lap.webm", Buffer.from(captured));
  const audio = await page.evaluate(() => (window as any).__inferno.audio);
  expect(audio.events["vehicle.jump"]).toBe(2);
  expect(audio.events["vehicle.land"]).toBe(2);
  expect(audio.events["vehicle.boost.enter"]).toBe(7);
  expect(audio.events["vehicle.boost.loop"] ?? 0).toBe(0);
  expect(audio.events["checkpoint.hit"]).toBe(3);
  expect(audio.events["race.pb"]).toBe(1);
  expect(audio.events["race.respawn"] ?? 0).toBe(0);
  expect(audio.fault).toBe("");
  await page.reload();
  await page.locator("#start").click();
  await expect(page.locator(".track-copy")).not.toContainText("—.———");
  await page.locator("#drive").click();
  await page.keyboard.down("w");
  await page.waitForTimeout(3000);
  await expect(page.locator(".run-state")).toBeVisible();
  await expect(page.locator("#split-notice")).toHaveText("—");
  expect(
    await page.evaluate(() => (window as any).__inferno.ghostVisible),
  ).toBe(true);
  expect(errors).toEqual([]);
});
