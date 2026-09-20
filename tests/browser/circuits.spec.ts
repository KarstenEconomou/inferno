import { test, expect } from "./harness";

/** Two circuits are built. Choosing the second one has to change the course,
 * the world, the plan and the records, and has to change them back. */
test("selects Burnline, drives it, and returns to Vertigo Works", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#start").click();

  // The sheet reports the circuit under the cursor, not the one that is built.
  await page.getByRole("button", { name: /BURNLINE/ }).click();
  await expect(page.locator("#track-card h1")).toHaveText("BURNLINE");
  await expect(page.locator(".track-status")).toHaveText("READY");
  await expect(page.locator("#track-card")).toContainText("4 935 M");
  await expect(page.locator("#track-card")).toContainText("DRY LAKE");
  await expect(page.locator(".track-graphic svg")).toBeVisible();

  await page.locator("#drive").click();
  await expect
    .poll(async () => page.evaluate(() => (window as any).__inferno.track.id))
    .toBe("burnline-1");
  await page.waitForTimeout(2500);
  await page.keyboard.down("w");
  await page.waitForTimeout(3000);
  await page.keyboard.up("w");
  const driven = await page.evaluate(() => (window as any).__inferno);
  expect(driven.state).toBe("racing");
  expect(driven.theme.display_name).toBe("BURNLINE");
  // The car is on the desert course, not on a road belonging to another one.
  expect(driven.speed).toBeGreaterThan(20);
  await page.screenshot({ path: "test-results/burnline.png" });

  // Back out to the title, which is always the first circuit.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  await page.locator("#exit").click();
  await expect(
    page.getByRole("button", { name: "TRACKS", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => (window as any).__inferno.track.id))
    .toBe("vertigo-works-9");
  expect(errors).toEqual([]);
});
