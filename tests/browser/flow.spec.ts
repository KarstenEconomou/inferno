import { test, expect } from "./harness";
const state = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as any).__inferno);

test("held throttle survives retry and brakes hold the ready grid", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.press("r");
  await page.keyboard.down("s");
  await page.keyboard.down("w");
  await page.waitForTimeout(300);
  expect((await state(page)).state).toBe("ready");
  expect((await state(page)).time).toBe(0);
  await page.keyboard.up("s");
  await page.waitForTimeout(500);
  expect((await state(page)).speed).toBeGreaterThan(5);
  await page.keyboard.press("r");
  await page.waitForTimeout(500);
  expect((await state(page)).state).toBe("racing");
  expect((await state(page)).speed).toBeGreaterThan(5);
});

test("Escape closes setup from a focused control and driving keys cannot leak from pause", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.press("r");
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await page.locator("#setup-menu").click();
  await page.getByRole("button", { name: "AUDIO", exact: true }).click();
  await page.locator("#volume-setting").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-overlay")).toHaveCount(0);
  expect((await state(page)).state).toBe("racing");
  await page.keyboard.press("Escape");
  await page.keyboard.down("w");
  const paused = await state(page);
  await page.waitForTimeout(250);
  expect((await state(page)).time).toBe(paused.time);
  await page.getByRole("button", { name: "RESUME RUN" }).click();
  await page.waitForTimeout(250);
  expect((await state(page)).keys).not.toContain("KeyW");
  await page.keyboard.up("w");
});

test("rail recovery and respawn retain only fixed HUD feedback", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.press("r");
  await page.keyboard.down("w");
  await page.waitForTimeout(150);
  await page.keyboard.down("Space");
  await expect(
    page.locator("#driving-status, #toast, #boost, #ready"),
  ).toHaveCount(0);
  await page.keyboard.up("Space");
  await page.waitForTimeout(1600);
  await page.keyboard.down("d");
  await page.waitForFunction(
    () => {
      const s = (window as any).__inferno;
      return s.railContact && Math.abs(s.speed) < 2;
    },
    undefined,
    { timeout: 7000 },
  );
  await page.screenshot({ path: "test-results/rail-recovery.png" });
  const crashed = await state(page);
  expect(crashed.grounded).toBe(true);
  expect(Math.abs(crashed.speed)).toBeLessThan(2);
  await page.keyboard.up("d");
  await page.keyboard.up("w");
  await page.keyboard.down("s");
  await expect(page.locator("#direction")).toHaveText("REV");
  await page.waitForTimeout(700);
  const reversed = await state(page);
  expect(reversed.speed).toBeLessThan(-4);
  expect(reversed.grounded).toBe(true);
  await page.keyboard.up("s");
  await page.keyboard.press("Backspace");
  const respawned = await state(page);
  expect(respawned.speed).toBe(0);
  expect(respawned.resetSerial).toBe(crashed.resetSerial + 1);
  expect(respawned.time).toBeGreaterThan(crashed.time);
  await expect(page.locator("#driving-status, #toast")).toHaveCount(0);
  await page.screenshot({ path: "test-results/respawn.png" });
});

test("ghost playback cuts at a recorded respawn instead of crossing the scenery", async ({
  page,
}) => {
  await page.goto("/");
  const poses = await page.evaluate(async () => {
    const path = "/src/track/index.ts";
    const track = await import(/* @vite-ignore */ path);
    const a = track.frame(0.03),
      b = track.frame(0);
    const pose = (f: any, t: number, cut = false) => ({
      t,
      p: f.p.clone().addScaledVector(f.up, 0.65).toArray(),
      h: f.forward.toArray(),
      u: f.up.toArray(),
      ...(cut ? { cut: true } : {}),
    });
    const before = pose(a, 0),
      after = pose(b, 0.6, true);
    localStorage.setItem(
      "inferno-best",
      JSON.stringify({
        version: track.TRACK_VERSION,
        time: 10,
        splits: track.track.checkpoints.map(
          (_: unknown, i: number) => (i + 1) * 2,
        ),
        poses: [before, pose(a, 0.6), after, pose(b, 10)],
      }),
    );
    return { before: before.p, after: after.p };
  });
  await page.reload();
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.down("w");
  await page.waitForFunction(
    () => (window as any).__inferno.state === "racing",
  );
  const samples = await page.evaluate(
    () =>
      new Promise<any[]>((resolve) => {
        const result: any[] = [];
        const sample = () => {
          const s = (window as any).__inferno;
          result.push({
            time: s.time,
            position: s.ghostPosition,
            visible: s.ghostVisible,
          });
          if (s.time >= 1) resolve(result);
          else requestAnimationFrame(sample);
        };
        sample();
      }),
  );
  expect(samples.some((s) => s.time < 0.5)).toBe(true);
  expect(samples.some((s) => s.time > 0.7)).toBe(true);
  for (const sample of samples) {
    expect(sample.visible).toBe(true);
    const target = sample.time < 0.6 ? poses.before : poses.after;
    expect(
      Math.hypot(
        ...sample.position.map((v: number, i: number) => v - target[i]),
      ),
    ).toBeLessThan(0.001);
  }
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 960, height: 600 },
]) {
  test(`controls and setup remain readable at ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.getByRole("button", { name: "SETTINGS" }).click();
    const panel = await page.locator(".panel").boundingBox();
    expect(panel!.y).toBeGreaterThanOrEqual(0);
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(size.height);
    await page.screenshot({ path: `test-results/setup-${size.width}.png` });
    await page.keyboard.press("Escape");
    await page.locator("#start").click();
    await page.locator("#drive").click();
    await page.keyboard.press("r");
    // The three corners stay inside the window at every supported size.
    for (const corner of [".timing", ".run-state", ".speedometer"]) {
      const box = (await page.locator(corner).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    }
    await page.screenshot({ path: `test-results/controls-${size.width}.png` });
  });
}

test("menu buttons retain native keyboard activation and dialog focus stays inside", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "SETTINGS" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document
          .querySelector("#settings-overlay")!
          .contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "SETTINGS" })).toBeFocused();
  await page.getByRole("button", { name: "TRACKS", exact: true }).focus();
  await page.keyboard.press("Space");
  expect((await state(page)).screen).toBe("tracks");
  await page.locator("#drive").click();
  expect((await state(page)).state).toBe("ready");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "RESUME RUN" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator("#settings-overlay")).toHaveCount(0);
});

test("arrow controls share the brake action and cannot slide below initiation speed", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.press("r");
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(() => (window as any).__inferno.speed > 28);
  await page.keyboard.down("Space");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(200);
  expect((await state(page)).driftPhase).not.toBe("drift");
  expect((await state(page)).yawRate).toBeLessThan(0);
  await page.keyboard.up("Space");
  await page.keyboard.up("ArrowRight");
  const before = (await state(page)).speed;
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(300);
  expect((await state(page)).speed).toBeLessThan(before - 8);
  await page.keyboard.up("ArrowDown");
  const slowed = (await state(page)).speed;
  await page.waitForTimeout(300);
  expect((await state(page)).speed).toBeGreaterThan(slowed + 3);
});

test("a held drift key cannot activate the pause menu's newly focused button", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.press("r");
  await page.keyboard.down("w");
  await page.waitForTimeout(200);
  await page.keyboard.down("Space");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "RESUME RUN" })).toBeFocused();
  await page.keyboard.down("Space"); // OS-style repeat of the already held key.
  await page.keyboard.up("Space");
  expect((await state(page)).state).toBe("paused");
  await expect(page.locator("#settings-overlay")).toBeVisible();
  await page.keyboard.up("w");
  await page.keyboard.press("Space"); // A fresh menu activation still works.
  expect((await state(page)).state).toBe("racing");
});

test("the advertised retry shortcut works from a focused setup control", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.press("Escape");
  await page.locator("#setup-menu").click();
  await page.getByRole("button", { name: "AUDIO", exact: true }).click();
  await page.locator("#volume-setting").focus();
  await page.keyboard.press("r");
  expect((await state(page)).state).toBe("ready");
  await expect(page.locator("#settings-overlay")).toHaveCount(0);
  await expect(page.locator("#time")).toHaveText("00:00.000");
});
