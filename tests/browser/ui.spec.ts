import { test, expect } from "./harness";
const drive = async (page: import("@playwright/test").Page) => {
  await page.locator("#start").click();
  await page.locator("#drive").click();
};
test("nine circuit identities share one interface, two of them built", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#start")).toHaveText("TRACKS");
  await expect(page.locator("#game")).toBeHidden();
  await expect(page.locator(".title-screen")).not.toContainText("VERTIGO");
  await expect(page.locator(".title-screen .controls")).toHaveCount(0);
  await page.screenshot({ path: "test-results/ui-title.png" });
  await page.locator("#start").click();
  const names = [
    "VERTIGO WORKS",
    "BURNLINE",
    "KARST",
    "CONTAINMENT",
    "TERMINAL ZERO",
    "THE SPILLWAY",
    "FROSTLINE",
    "INTERMODAL",
    "AFTERIMAGE",
  ];
  const taglines = [
    "Industry turned vertical.",
    "Desert under test.",
    "Excavated racing lines.",
    "Hazardous.",
    "Aviation after dark.",
    "Hydraulic monument.",
    "Whiteout.",
    "Switchyard.",
    "City in reflection.",
  ];
  const palettes = [
    ["#0F008F", "#E13D19", "#98FE42"],
    ["#21106F", "#E0441F", "#FFD62E"],
    ["#92948D", "#242829", "#A94A32"],
    ["#293726", "#48BE68", "#E0EB51"],
    ["#07137F", "#FF3B1F", "#6CFAFF"],
    ["#081B8F", "#00E7E7", "#EFFF32"],
    ["#10254B", "#D9F0EB", "#FF572A"],
    ["#2C3437", "#F43139", "#F6F46D"],
    ["#30579A", "#A8BFEA", "#C1B3EF"],
  ];
  await expect(page.locator(".circuit-option strong")).toHaveText(names);
  await expect(page.locator(".track-status")).toHaveText("READY");
  for (let i = 0; i < names.length; i++) {
    await expect(page.locator(".track-copy h1")).toHaveText(names[i]);
    await expect(page.locator(".track-tagline")).toHaveText(taglines[i]);
    const d = await page.evaluate(() => (window as any).__inferno);
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--field")
          .trim(),
      ),
    ).toBe(d.theme.field);
    expect([d.theme.field, d.theme.structure, d.theme.signal]).toEqual(
      palettes[i],
    );
    if (names[i] === "KARST")
      await expect(page.locator(".track-copy h1")).toHaveCSS(
        "color",
        "rgb(169, 74, 50)",
      );
    await page.screenshot({ path: `test-results/identity-${i}.png` });
    const built = names[i] === "VERTIGO WORKS" || names[i] === "BURNLINE";
    await expect(page.locator(".track-status")).toHaveText(
      built ? "READY" : "NOT BUILT",
    );
    await expect(page.locator("#drive")).toHaveCount(built ? 1 : 0);
    await page.keyboard.press("ArrowDown");
  }
  await page.locator('[data-circuit="8"]').click();
  await expect(page.locator('[data-circuit="8"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator("#drive")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-circuit="0"]')).toBeFocused();
  await page.keyboard.press("Enter");
  expect((await page.evaluate(() => (window as any).__inferno)).state).toBe(
    "ready",
  );
});
test("instant restart, sparse HUD and one-press run actions", async ({
  page,
}) => {
  await page.goto("/");
  await drive(page);
  await expect(page.locator(".race-map")).toHaveCount(0);
  await expect(page.locator(".timing #split-notice")).toBeVisible();
  await expect(page.locator(".run-state .sector span")).toHaveCount(4);
  await expect(
    page.locator(
      "#delta, #sector-name, #toast, #ready, #boost, #driving-status, .hotkey-strip",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".sector .current")).toHaveCount(1);
  await expect(page.locator(".sector .done")).toHaveCount(0);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const box = (s: string) => {
        const r = document.querySelector(s)!.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      };
      return {
        time: box("#time"),
        split: box("#split-notice"),
        progress: box(".run-state"),
        speed: box(".speedometer"),
        fonts: [
          "#time",
          "#split-notice",
          "#speed",
          ".speed-unit",
          "#direction",
        ].map((s) => getComputedStyle(document.querySelector(s)!).fontSize),
      };
    });
    expect(new Set(layout.fonts).size).toBe(1);
    expect(parseFloat(layout.fonts[0])).toBeGreaterThanOrEqual(24);
    expect(layout.time.x).toBeLessThan(80);
    expect(layout.time.y).toBeLessThan(80);
    expect(layout.split.y).toBeGreaterThan(layout.time.y);
    expect(layout.progress.x).toBeLessThan(80);
    expect(viewport.height - layout.progress.bottom).toBeLessThan(80);
    expect(viewport.width - layout.speed.right).toBeLessThan(80);
    expect(viewport.height - layout.speed.bottom).toBeLessThan(80);
    await page.screenshot({ path: `test-results/hud-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.press("c");
  expect(
    (await page.evaluate(() => (window as any).__inferno)).cameraMode,
  ).toBe(1);
  await page.keyboard.press("r");
  const restarted = await page.evaluate(() => (window as any).__inferno);
  expect(restarted.time).toBeLessThan(0.1);
  expect(restarted.cameraMode).toBe(1);
  await page.keyboard.press("g");
  await expect(page.locator("#ghost-label, #checkpoint")).toHaveCount(0);
  await page.keyboard.down("Tab");
  await expect(page.locator("#split-notice")).toBeHidden();
  await expect(page.locator("#split-sheet")).toHaveCount(0);
  await page.keyboard.up("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator("#split-notice")).toBeVisible();
  await page.keyboard.press("h");
  await expect(page.locator("#race-hud")).toHaveClass(/hud-off/);
  await page.keyboard.press("h");
  await page.screenshot({ path: "test-results/ui-driving.png" });
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "test-results/ui-pause.png" });
  await page.keyboard.press("r");
  expect((await page.evaluate(() => (window as any).__inferno)).state).toBe(
    "ready",
  );
});
test("HUD preferences and conflicting rebindings persist", async ({ page }) => {
  await page.goto("/");
  await page.locator("#settings").click();
  await page.locator("#hud-checkpoint").uncheck();
  await page.getByRole("button", { name: "CONTROLS", exact: true }).click();
  await page.locator('[data-action="restart"]').click();
  await page.keyboard.press("Space");
  await expect(page.locator('[data-action="brakeSecondary"]')).toHaveText("R");
  await expect(page.locator('[data-pad="brakeSecondary"]')).toHaveText("A");
  await expect(page.locator('[data-action="restart"]')).toHaveText("SPACE");
  await page.keyboard.press("Escape");
  await page.reload();
  await drive(page);
  await page.keyboard.down("w");
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
  expect(
    (await page.evaluate(() => (window as any).__inferno)).time,
  ).toBeLessThan(0.1);
  await expect(page.locator(".run-state")).toBeHidden();
  await expect(page.locator(".hotkey-strip")).toHaveCount(0);
});
test("small viewport and large HUD preserve timing and menu access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto("/");
  await page.locator("#settings").click();
  await page.locator("#hud-scale").fill("1.4");
  await page.screenshot({ path: "test-results/ui-small-settings.png" });
  await page.keyboard.press("Escape");
  await drive(page);
  const timer = await page.locator(".timing").boundingBox();
  expect(timer!.x).toBeGreaterThanOrEqual(0);
  expect(timer!.x + timer!.width).toBeLessThanOrEqual(640);
  await page.screenshot({ path: "test-results/ui-small-driving.png" });
});

test("standard controller navigates settings, drives, retries and rebinds buttons", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    (window as any).__pad = {
      connected: true,
      mapping: "standard",
      buttons,
      axes: [0, 0, 0, 0],
    };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [(window as any).__pad],
    });
  });
  const button = async (i: number, down: boolean) => {
    await page.evaluate(
      ({ i, down }) => {
        (window as any).__pad.buttons[i] = {
          pressed: down,
          touched: down,
          value: down ? 1 : 0,
        };
      },
      { i, down },
    );
    await page.waitForTimeout(40);
  };
  const tap = async (i: number) => {
    await button(i, true);
    await button(i, false);
  };
  await page.goto("/");
  await tap(0);
  await expect(page.locator("#drive")).toBeVisible();
  await tap(0);
  expect((await page.evaluate(() => (window as any).__inferno)).state).toBe(
    "ready",
  );
  await expect(page.locator("#ready")).toHaveCount(0);
  await button(7, true);
  await page.waitForTimeout(400);
  expect(
    (await page.evaluate(() => (window as any).__inferno)).speed,
  ).toBeGreaterThan(3);
  await tap(3);
  expect(
    (await page.evaluate(() => (window as any).__inferno)).time,
  ).toBeLessThan(0.2);
  await button(7, false);
  await tap(9);
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  await page.locator("#setup-menu").click();
  await page.locator("#hud-timer").focus();
  await tap(0);
  await expect(page.locator("#hud-timer")).not.toBeChecked();
  await page.getByRole("button", { name: "CONTROLS", exact: true }).click();
  await page.locator('[data-pad="restart"]').click();
  await tap(2);
  await expect(page.locator('[data-pad="restart"]')).toContainText("X");
  await expect(page.locator('[data-pad="ghost"]')).toContainText("Y");
  await tap(9);
  await button(7, true);
  await page.waitForTimeout(350);
  await tap(2);
  expect(
    (await page.evaluate(() => (window as any).__inferno)).time,
  ).toBeLessThan(0.2);
  await button(7, false);
  await expect(page.locator(".hotkey-strip")).toHaveCount(0);
});

test("the menu cursor follows the screen on every layout", async ({ page }) => {
  const traverse = async () => {
    // A vertical press stays in the list; the list wraps at both ends.
    await expect(page.locator('[data-circuit="0"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-circuit="1"]')).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('[data-circuit="0"]')).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('[data-circuit="8"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-circuit="0"]')).toBeFocused();
    // A horizontal press crosses to the plates beside the sheet, which are
    // their own column, and comes back to the row it left.
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#drive")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#back-title")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#drive")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-circuit="0"]')).toBeFocused();
  };
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto("/");
  await page.locator("#start").click();
  await traverse();
  await page.screenshot({ path: "test-results/track-navigation-small.png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await traverse();
  // The cursor selects as it travels, so the sheet always describes the row
  // the cursor stands on.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".track-copy h1")).toHaveText("BURNLINE");
  await expect(page.locator('[data-circuit="1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // An unbuilt circuit withdraws its DRIVE plate, so the cursor crossing to
  // the actions lands on the one plate that is left.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".track-copy h1")).toHaveText("KARST");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#back-title")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#start")).toBeVisible();
});

test("the settings book pages with the shoulder keys and adjusts with the arrows", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#settings").click();
  await expect(page.getByRole("button", { name: "DISPLAY" })).toHaveClass(
    /selected/,
  );
  await expect(page.locator("#hud-timer")).toBeFocused();
  // Left and right change the value under the cursor; they never move it.
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#hud-timer")).not.toBeChecked();
  await expect(page.locator('[data-state="hud-timer"]')).toHaveText("OFF");
  await expect(page.locator("#hud-timer")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#hud-timer")).toBeChecked();
  // Down runs to the next row, and the help line follows the cursor.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#hud-delta")).toBeFocused();
  await expect(page.locator("#settings-help")).toHaveText(
    /gap to the personal/,
  );
  // The last row falls through to the closing plate, and wraps from there.
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
  await expect(page.locator("#resume")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#hud-timer")).toBeFocused();
  // A slider answers the same two arrows.
  await page.locator("#hud-scale").focus();
  const scale = await page.locator("#hud-scale").inputValue();
  await page.keyboard.press("ArrowRight");
  expect(Number(await page.locator("#hud-scale").inputValue())).toBeGreaterThan(
    Number(scale),
  );
  await expect(page.locator("#hud-scale")).toBeFocused();
  // E and Q turn the pages, in both directions, and wrap.
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("button", { name: "CONTROLS" })).toHaveClass(
    /selected/,
  );
  await expect(page.locator('[data-action="throttle"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-pad="throttle"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-pad="brake"]')).toBeFocused();
  await page.keyboard.press("KeyQ");
  await expect(page.getByRole("button", { name: "DISPLAY" })).toHaveClass(
    /selected/,
  );
  await page.keyboard.press("KeyQ");
  await expect(page.getByRole("button", { name: "RULES" })).toHaveClass(
    /selected/,
  );
  await page.screenshot({ path: "test-results/settings-rules.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-overlay")).toHaveCount(0);
});
