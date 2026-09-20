import { test, expect } from "./harness";
import { writeFileSync } from "node:fs";

test("migrates keyboard/controller brake bindings and persists camera settings and direct presets", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "inferno-settings",
      JSON.stringify({
        bindings: { throttle: "KeyI", drift: "ShiftLeft", restart: "KeyT" },
        padBindings: { drift: 2, throttle: 7 },
        ui: { hints: "OFF" },
        camera: { preset: 2, fov: 82, speedFov: true },
      }),
    ),
  );
  await page.goto("/");
  await page.locator("#settings").click();
  await page.getByRole("button", { name: "CONTROLS", exact: true }).click();
  await expect(page.locator('[data-action="brakeSecondary"]')).toHaveText(
    "SHIFTLEFT",
  );
  await expect(page.locator('[data-pad="brakeSecondary"]')).toHaveText("X");
  await expect(page.locator('[data-action="throttle"]')).toHaveText("I");
  await expect(page.locator('[data-pad="throttle"]')).toHaveText("RT");
  await page.getByRole("button", { name: "CAMERA", exact: true }).click();
  await expect(page.locator("#camera-preset")).toHaveValue("2");
  await expect(page.locator("#camera-fov")).toHaveValue("82");
  await page.locator("#camera-preset").selectOption("1");
  await page.locator("#camera-speed-fov").uncheck();
  await page.keyboard.press("Escape");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  expect(
    (await page.evaluate(() => (window as any).__inferno)).cameraMode,
  ).toBe(1);
  await page.keyboard.press("Numpad3");
  await page.waitForTimeout(60);
  let state = await page.evaluate(() => (window as any).__inferno);
  expect(state.cameraMode).toBe(2);
  expect(state.carVisible).toBe(false);
  expect(state.cameraFov).toBe(82);
  await page.keyboard.down("i");
  await page.waitForTimeout(600);
  await page.keyboard.up("i");
  await page.keyboard.press("t");
  state = await page.evaluate(() => (window as any).__inferno);
  expect(state.time).toBe(0);
  expect(state.cameraMode).toBe(2);
  const distance = Math.hypot(
    ...state.cameraPosition.map(
      (v: number, i: number) => v - state.position[i],
    ),
  );
  expect(distance).toBeLessThan(1.5);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("inferno-settings")!),
  );
  expect(saved.camera).toEqual({ preset: 2, fov: 82, speedFov: false });
  expect(saved.bindings.drift).toBeUndefined();
  expect(saved.bindings.brakeSecondary).toBe("ShiftLeft");
});

for (const preset of [0, 1, 2])
  test(`Chrome lap in camera ${preset + 1}, both jumps, seven boosts, checkpoints and palette`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.locator("#start").click();
    await page.locator("#drive").click();
    await page.keyboard.press(`Numpad${preset + 1}`);
    await page.evaluate(async (preset) => {
      const tp = "/src/track/index.ts",
        dp = "/tests/driver.ts";
      const track = await import(/* @vite-ignore */ tp),
        { drivingInput } = await import(/* @vite-ignore */ dp);
      const held = new Set<string>(),
        trace: any[] = [];
      let oldAir = false,
        oldBoost = 0,
        oldCheckpoint = 0;
      let landings = 0,
        boosts = 0,
        rails = 0,
        frames = 0;
      const checkpoints: number[] = [];
      const startSerial = (window as any).__inferno.resetSerial;
      const pad = {
        id: "Simulated standard controller",
        index: 0,
        connected: true,
        mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          touched: false,
          value: 0,
        })),
        timestamp: performance.now(),
      };
      if (preset === 1)
        Object.defineProperty(navigator, "getGamepads", { value: () => [pad] });
      const tick = () => {
        const s = (window as any).__inferno;
        if (s.state === "finished") {
          for (const code of held)
            document.dispatchEvent(
              new KeyboardEvent("keyup", { code, bubbles: true }),
            );
          pad.buttons.forEach((b) => {
            b.value = 0;
            b.pressed = false;
          });
          return;
        }
        const f = track.frame(s.progress),
          input = drivingInput(
            {
              ...s,
              position: f.p.fromArray(s.position),
              heading: f.forward.fromArray(s.heading),
              up: f.up.fromArray(s.up),
            },
            { analog: preset === 1, drift: true },
          );
        if (preset === 1) {
          pad.axes[0] = input.steer;
          pad.buttons[7].value = input.throttle;
          pad.buttons[7].pressed = input.throttle > 0;
          pad.buttons[6].value = +input.brake;
          pad.buttons[6].pressed = input.brake;
          pad.timestamp = performance.now();
        } else {
          const desired = new Set<string>([
            ...(input.throttle > 0 ? ["KeyW"] : []),
            ...(input.brake ? ["Space"] : []),
            ...(input.steer > 0 ? ["KeyD"] : input.steer < 0 ? ["KeyA"] : []),
          ]);
          for (const code of held)
            if (!desired.has(code)) {
              document.dispatchEvent(
                new KeyboardEvent("keyup", { code, bubbles: true }),
              );
              held.delete(code);
            }
          for (const code of desired)
            if (!held.has(code)) {
              document.dispatchEvent(
                new KeyboardEvent("keydown", { code, bubbles: true }),
              );
              held.add(code);
            }
        }
      };
      tick();
      // Camera comparisons need the same driving decisions in each preset.
      // A wall-clock timer can drift across physics ticks around screenshots
      // and make a different racing line look like a camera regression.
      let nextDecision = 0.05;
      const frameTimes: number[] = [];
      let previousFrame = 0;
      const sample = (now: number) => {
        if (previousFrame) frameTimes.push(now - previousFrame);
        previousFrame = now;
        const s = (window as any).__inferno;
        if (s.time + 1e-8 >= nextDecision) {
          tick();
          nextDecision = (Math.floor((s.time + 1e-8) / 0.05) + 1) * 0.05;
        }
        frames++;
        if (oldAir && s.grounded) landings++;
        oldAir = !s.grounded;
        if (s.boost > oldBoost + 0.02) boosts++;
        oldBoost = s.boost;
        if (s.checkpoint !== oldCheckpoint) {
          checkpoints.push(s.checkpoint);
          oldCheckpoint = s.checkpoint;
        }
        if (s.railContact) rails++;
        const feature = track.track.features.find(
          (f: any) => s.progress > (f.start + f.end) / 2 && s.progress < f.end,
        )?.kind;
        trace.push({
          time: s.time,
          t: s.progress,
          preset: s.cameraMode,
          q: s.cameraQuaternion,
          camera: s.cameraPosition,
          ground: s.grounded,
          rail: s.railContact,
          speed: s.speed,
          slip: s.slipAngle,
          feature,
          fps: s.fps,
          p95: s.frameMsP95,
        });
        (window as any).__cameraRun = {
          landings,
          boosts,
          checkpoints,
          rails,
          startSerial,
          frames,
          trace,
          frameTimes,
        };
        if (s.state === "finished") {
          tick();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, preset);
    const captured = new Set<string>();
    for (let i = 0; i < 140; i++) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => (window as any).__inferno);
      const feature = await page.evaluate(
        () => (window as any).__cameraRun?.trace.at(-1)?.feature,
      );
      expect(s.cameraMode).toBe(preset);
      expect(s.carVisible).toBe(preset !== 2);
      if (feature && !captured.has(feature)) {
        captured.add(feature);
        await page.screenshot({
          path: `test-results/camera-${preset + 1}-${feature}.png`,
        });
      }
      if (s.state === "finished") break;
    }
    const s = await page.evaluate(() => (window as any).__inferno),
      r = await page.evaluate(() => (window as any).__cameraRun);
    writeFileSync(
      `/tmp/inferno-camera-${preset + 1}.json`,
      JSON.stringify({ state: s, run: r }, null, 2),
    );
    expect(s.state).toBe("finished");
    expect(s.resetSerial).toBe(r.startSerial);
    expect(r.landings).toBe(2);
    expect(r.boosts).toBe(7);
    expect(r.checkpoints).toEqual([1, 2, 3]);
    expect(r.rails).toBe(0);
    expect(errors).toEqual([]);
    expect(s.fps).toBeGreaterThan(55);
    expect(s.frameMsP95).toBeLessThan(25);
    const p95 = [...r.frameTimes].sort((a: number, b: number) => a - b)[
      Math.floor(r.frameTimes.length * 0.95)
    ];
    expect(p95).toBeLessThan(25);
    for (let i = 1; i < r.trace.length; i++) {
      const a = r.trace[i - 1].q,
        b = r.trace[i].q;
      expect(b.every(Number.isFinite)).toBe(true);
      const dot = Math.abs(
        a.reduce((sum: number, v: number, j: number) => sum + v * b[j], 0),
      );
      expect(dot).toBeGreaterThan(0.9);
    }
    const colors = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) =>
          requestAnimationFrame(() => {
            const source = document.querySelector<HTMLCanvasElement>("#game")!,
              c = document.createElement("canvas");
            c.width = source.width;
            c.height = source.height;
            const ctx = c.getContext("2d")!;
            ctx.drawImage(source, 0, 0);
            const p = ctx.getImageData(0, 0, c.width, c.height).data,
              colors = new Set<string>();
            for (let i = 0; i < p.length; i += 4)
              colors.add(`${p[i]},${p[i + 1]},${p[i + 2]}`);
            resolve([...colors].sort());
          }),
        ),
    );
    expect(colors).toEqual(["15,0,143", "152,254,66", "225,61,25"]);
  });
