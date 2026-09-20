import { test, expect } from "./harness";
import { writeFileSync } from "node:fs";
const info = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as any).__inferno.audio);
async function lab(page: import("@playwright/test").Page) {
  await page.goto("/?audio");
  await page.waitForFunction(
    () =>
      (window as any).__infernoAudio && (window as any).__inferno.audio.ready,
  );
  await page.locator("#audio-trigger").click();
}
test("audio preloads, stays gesture-locked and exposes no normal-player lab", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__inferno.audio.ready);
  expect((await info(page)).context).toBe("locked");
  await expect(page.locator(".audio-lab")).toHaveCount(0);
  await page.locator("#settings").click();
  await page.getByRole("button", { name: "AUDIO", exact: true }).click();
  await page.locator("#mix-vehicle").fill("0.35");
  await page.locator("#mix-ambience").fill("0.2");
  await page.locator("#mix-sfx").fill("0.55");
  await page.waitForFunction(
    () => (window as any).__inferno.audio.context === "running",
  );
  expect((await info(page)).fault).toBe("");
  await page.reload();
  expect((await info(page)).mix.vehicle).toBe(0.35);
  expect((await info(page)).mix.ambience).toBe(0.2);
  expect((await info(page)).mix.sfx).toBe(0.55);
  expect(errors).toEqual([]);
});
test("every semantic event and theme auditions without clipping or unbounded voices", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await lab(page);
  const report = await page.evaluate(async () => {
    const api = (window as any).__infernoAudio;
    const events = Array.from(
      document.querySelector<HTMLSelectElement>("#audio-event")!.options,
    ).map((o) => o.value);
    let peak = 0,
      maxVoices = 0;
    for (const theme of [
      "vertigo",
      "spillway",
      "terminal",
      "mirage",
      "burnline",
    ]) {
      api.theme(theme);
      for (const event of events) {
        api.trigger(event, 0.7);
        await new Promise((r) => setTimeout(r, 35));
        const d = api.snapshot();
        peak = Math.max(peak, d.masterPeak);
        maxVoices = Math.max(maxVoices, d.voices);
      }
    }
    return {
      peak,
      maxVoices,
      events: api.snapshot().events,
      fault: api.snapshot().fault,
    };
  });
  expect(report.peak).toBeGreaterThan(0.001);
  expect(report.peak).toBeLessThan(0.9);
  expect(report.maxVoices).toBeLessThanOrEqual(16);
  expect(Object.keys(report.events)).toHaveLength(25);
  expect(report.fault).toBe("");
  expect(errors).toEqual([]);
  console.log("Audio event audit", report);
  await page.screenshot({ path: "test-results/audio-lab.png" });
});
test("500 rapid restarts clear PB, boost, scrape and delayed countdown voices", async ({
  page,
}) => {
  await lab(page);
  await page.locator("#audio-countdown").click();
  const report = await page.evaluate(() => {
    const api = (window as any).__infernoAudio;
    api.trigger("race.pb");
    api.trigger("vehicle.boost.loop");
    api.trigger("vehicle.scrape");
    let max = 0;
    for (let i = 0; i < 500; i++) {
      api.trigger("race.restart");
      max = Math.max(max, api.snapshot().voices);
    }
    return { max, after: api.snapshot() };
  });
  expect(report.max).toBe(1);
  expect(report.after.voiceEvents).toEqual(["race.restart"]);
  await page.waitForTimeout(150);
  expect((await info(page)).voices).toBe(0);
  expect((await info(page)).masterPeak).toBeLessThan(0.02);
  await page.waitForTimeout(1500);
  expect((await info(page)).voices).toBe(0);
  expect((await info(page)).transport.beats).toBeGreaterThan(
    report.after.transport.beats,
  );
});
test("vehicle contact changes the mix, solo/mute work, and messy audio remains bounded", async ({
  page,
}) => {
  await lab(page);
  await page.evaluate(() => {
    const api = (window as any).__infernoAudio;
    api.reset();
    api.override({
      active: true,
      paused: false,
      speed: 48,
      forward: 46,
      throttle: 1,
      grounded: true,
      slip: 0,
      boost: false,
      scrape: false,
    });
    const destination = api.record();
    const recorder = new MediaRecorder(destination.stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    (window as any).__record = { recorder, chunks, destination };
    recorder.start();
  });
  await page.waitForTimeout(1000);
  const clean = await info(page);
  await page.evaluate(() => {
    const a = (window as any).__infernoAudio;
    a.override({
      active: true,
      speed: 38,
      forward: 28,
      throttle: 1,
      grounded: true,
      slip: 0.9,
      scrape: true,
    });
    a.trigger("vehicle.impact", 0.8);
  });
  await page.waitForTimeout(1000);
  const bad = await info(page);
  expect(bad.params.tire).toBeGreaterThan(clean.params.tire);
  expect(bad.params.load).toBeLessThan(clean.params.load);
  expect(bad.masterPeak).toBeLessThan(0.9);
  await page.evaluate(() => {
    const a = (window as any).__infernoAudio;
    a.override({
      active: true,
      speed: 48,
      forward: 46,
      throttle: 1,
      grounded: false,
      slip: 0.9,
      scrape: false,
    });
    a.trigger("vehicle.jump");
  });
  await page.waitForTimeout(700);
  const air = await info(page);
  expect(air.params.coupling).toBe(0.24);
  expect(air.params.tire).toBe(0);
  await page.evaluate(() => {
    const a = (window as any).__infernoAudio;
    a.trigger("vehicle.land", 0.7);
    a.override({
      active: true,
      speed: 35,
      forward: 34,
      throttle: 1,
      grounded: true,
      slip: 0.1,
      scrape: false,
    });
  });
  await page.waitForTimeout(700);
  const bytes = await page.evaluate(async () => {
    const r = (window as any).__record;
    await new Promise<void>((resolve) => {
      r.recorder.onstop = () => resolve();
      r.recorder.stop();
    });
    r.destination.disconnect();
    return Array.from(new Uint8Array(await new Blob(r.chunks).arrayBuffer()));
  });
  writeFileSync("test-results/audio-contact-study.webm", Buffer.from(bytes));
  await page.evaluate(() => (window as any).__infernoAudio.solo("ui"));
  await page.waitForTimeout(350);
  expect((await info(page)).masterPeak).toBeLessThan(0.0001);
  await page.evaluate(() => {
    const a = (window as any).__infernoAudio;
    a.solo(null);
    a.mix({ master: 0 });
  });
  await page.waitForTimeout(350);
  expect((await info(page)).masterPeak).toBeLessThan(0.0001);
});
test("track selection changes the audible theme with the visual identity", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#start").click();
  for (const theme of [
    "vertigo",
    "burnline",
    "burnline",
    "spillway",
    "terminal",
    "spillway",
    "spillway",
    "terminal",
    "mirage",
  ]) {
    expect((await info(page)).theme).toBe(theme);
    await page.keyboard.press("ArrowDown");
  }
  expect((await info(page)).theme).toBe("vertigo");
});
test("missing banks fall back to the same original synthesis without blocking controls", async ({
  page,
}) => {
  await page.route("**/audio/manifest.json", (route) => route.abort());
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__inferno.audio.ready);
  expect((await info(page)).fault).toContain("procedural fallback");
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.down("w");
  await page.waitForTimeout(250);
  expect((await info(page)).events["race.start"]).toBe(1);
  expect(
    (await page.evaluate(() => (window as any).__inferno)).speed,
  ).toBeGreaterThan(0);
});

test("pause ducks world immediately without relying on the next render frame", async ({
  page,
}) => {
  await lab(page);
  await page.locator("#start").click();
  await page.locator("#drive").click();
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(60);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect((await info(page)).paused).toBe(true);
  await page.waitForTimeout(150);
  expect((await info(page)).worldGain).toBeLessThan(0.001);
  await page.locator("#resume").click();
  expect((await info(page)).paused).toBe(false);
  await page.waitForTimeout(150);
  expect((await info(page)).worldGain).toBeGreaterThan(0.9);
});

test("Vertigo keeps its tonal stack in key while speed opens the spectrum", async ({
  page,
}) => {
  await lab(page);
  const root = 440 * 2 ** ((32 - 69) / 12);
  let previousRegister = -1;
  let highOvertone = 0;
  for (const speed of [0, 25, 60, 85]) {
    await page.evaluate(
      (speed) =>
        (window as any).__infernoAudio.override({
          active: true,
          speed,
          forward: speed,
          throttle: 1,
          grounded: speed < 80,
        }),
      speed,
    );
    await page.waitForTimeout(600);
    const d = await info(page);
    expect(d.layerLevels.air).toBeLessThan(1e-7);
    expect(d.layerLevels.ambientAir).toBeLessThan(1e-7);
    expect(d.drivetrain.register).toBeGreaterThan(previousRegister);
    previousRegister = d.drivetrain.register;
    if (speed === 0) expect(d.layerLevels.overtone).toBeLessThan(1e-7);
    if (speed === 60) highOvertone = d.layerLevels.overtone;
    expect(d.harmony).toBe("G♯ minor");
    expect(d.tonalLayers.body).toBeCloseTo(root / 2, 1);
    expect(d.tonalLayers.harmonic).toBeCloseTo(root, 1);
    expect(d.layerLevels.whine).toBe(0);
    expect(d.masterPeak).toBeLessThan(0.9);
  }
  expect(highOvertone).toBeGreaterThan(0.001);
  await page.evaluate(() =>
    (window as any).__infernoAudio.override({
      active: true,
      speed: 60,
      forward: 60,
      grounded: true,
      throttle: 1,
    }),
  );
  await page.waitForTimeout(350);
  const loaded = await info(page);
  await page.evaluate(() =>
    (window as any).__infernoAudio.override({
      active: true,
      speed: 60,
      forward: 60,
      grounded: true,
      throttle: 0,
    }),
  );
  await page.waitForTimeout(350);
  const coast = await info(page);
  expect(coast.layerLevels.overtone + coast.layerLevels.upper).toBeLessThan(
    (loaded.layerLevels.overtone + loaded.layerLevels.upper) * 0.4,
  );
});

test("record isolated drivetrain transitions and a settled hold", async ({
  page,
}) => {
  await lab(page);
  const result = await page.evaluate(async () => {
    const api = (window as any).__infernoAudio;
    api.reset();
    api.solo("vehicle");
    const pose = {
      active: true,
      paused: false,
      finished: false,
      speed: 0,
      forward: 0,
      throttle: 0,
      grounded: true,
      slip: 0,
      scrape: false,
      boost: false,
    };
    api.override(pose);
    const tap = api.record(),
      recorder = new MediaRecorder(tap.stream),
      chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
    const beginning = performance.now(),
      cues: { event: string; seconds: number }[] = [];
    const mark = (event: string) =>
      cues.push({ event, seconds: (performance.now() - beginning) / 1000 });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const set = (patch: object) => {
      Object.assign(pose, patch);
      api.override({ ...pose });
    };
    mark("idle");
    await wait(1000);
    mark("throttle / accelerate");
    for (let step = 0; step <= 120; step++) {
      set({
        throttle: 1,
        speed: (step / 120) * 72,
        forward: (step / 120) * 72,
      });
      await wait(25);
    }
    mark("hold");
    await wait(1000);
    const holdStart = api.snapshot();
    await wait(1800);
    const holdEnd = api.snapshot();
    mark("lift / coast");
    set({ throttle: 0 });
    await wait(1500);
    mark("reapply");
    set({ throttle: 1 });
    await wait(1000);
    mark("airborne");
    set({ grounded: false });
    await wait(1000);
    mark("contact restored");
    set({ grounded: true });
    await wait(1000);
    mark("boost flag / unchanged engine");
    set({ boost: true });
    await wait(1000);
    mark("lift");
    set({ boost: false, throttle: 0 });
    await wait(1000);
    // Add gameplay impact to the recording for a physically distinct wall comparison.
    api.solo(null);
    api.mute("environment", true);
    api.mute("ui", true);
    mark("wall approach");
    set({ speed: 45, forward: 45, throttle: 1 });
    await wait(800);
    mark("head-on impact / held throttle");
    set({ speed: 0, forward: 0, scrape: true });
    api.trigger("vehicle.impact", 1);
    await wait(160);
    const stopped = api.snapshot();
    await wait(840);
    const held = api.snapshot();
    mark("release against wall");
    set({ throttle: 0 });
    await wait(700);
    mark("glancing contact / retained momentum");
    set({ speed: 35, forward: 34, throttle: 1, scrape: true });
    api.trigger("vehicle.impact", 0.2);
    await wait(1000);
    mark("contact ends");
    set({ scrape: false, throttle: 0 });
    await wait(600);
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    tap.disconnect();
    api.override(null);
    api.solo(null);
    return {
      bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
      cues,
      holdStart,
      holdEnd,
      stopped,
      held,
    };
  });
  writeFileSync(
    "test-results/audio-drivetrain-study.webm",
    Buffer.from(result.bytes),
  );
  writeFileSync(
    "test-results/audio-drivetrain-cues.json",
    JSON.stringify(result.cues, null, 2),
  );
  for (const layer of ["body", "harmonic", "overtone", "upper"]) {
    expect(result.holdEnd.layerLevels[layer]).toBeCloseTo(
      result.holdStart.layerLevels[layer],
      6,
    );
  }
  expect(result.holdEnd.layerLevels.air).toBe(0);
  expect(result.holdEnd.masterPeak).toBeLessThan(0.9);
  expect(result.stopped.layerLevels.upper).toBeLessThan(0.0001);
  expect(result.stopped.layerLevels.whine).toBe(0);
  expect(result.held.layerLevels.scrape).toBeLessThan(1e-7);
  expect(result.held.events["vehicle.scrape"] ?? 0).toBe(
    result.stopped.events["vehicle.scrape"] ?? 0,
  );
});

test("boost adds no engine swell or filter sweep in any sound theme", async ({
  page,
}) => {
  await lab(page);
  const reports = await page.evaluate(async () => {
    const api = (window as any).__infernoAudio;
    const reports = [];
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    for (const theme of [
      "vertigo",
      "spillway",
      "terminal",
      "mirage",
      "burnline",
    ]) {
      api.reset();
      api.theme(theme);
      const pose = {
        active: true,
        paused: false,
        finished: false,
        grounded: true,
        speed: 60,
        forward: 60,
        throttle: 1,
        brake: false,
        slip: 0,
        scrape: false,
        boost: false,
      };
      api.override(pose);
      await wait(1000);
      const before = api.snapshot();
      api.override({ ...pose, boost: true });
      await wait(450);
      const boost = api.snapshot();
      api.override(pose);
      await wait(450);
      reports.push({ theme, before, boost, after: api.snapshot() });
    }
    api.override(null);
    return reports;
  });
  for (const { before, boost, after } of reports) {
    for (const layer of ["body", "harmonic", "overtone", "upper", "air"]) {
      for (const state of [boost, after]) {
        expect(state.layerLevels[layer]).toBeCloseTo(
          before.layerLevels[layer],
          5,
        );
        expect(state.layerFilters[layer]).toBeCloseTo(
          before.layerFilters[layer],
          2,
        );
      }
    }
    for (const layer of ["harmonic", "overtone", "upper"]) {
      expect(boost.layerDrives[layer]).toBeCloseTo(
        before.layerDrives[layer],
        5,
      );
      expect(after.layerDrives[layer]).toBeCloseTo(
        before.layerDrives[layer],
        5,
      );
    }
    expect(boost.layerLevels).not.toHaveProperty("boostAir");
    expect(boost.fault).toBe("");
  }
});

test("collision synths select severity and rail contact sustains without repeated hits", async ({
  page,
}) => {
  await lab(page);
  const reports = await page.evaluate(async () => {
    const api = (window as any).__infernoAudio;
    api.reset();
    api.override({ active: false, scrape: false });
    api.solo("gameplay");
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const reports = [];
    for (const theme of [
      "vertigo",
      "spillway",
      "terminal",
      "mirage",
      "burnline",
    ]) {
      api.theme(theme);
      const hits = [];
      for (const strength of [0.2, 0.5, 1]) {
        api.trigger("vehicle.impact", strength);
        const variant = api
          .snapshot()
          .voiceVariants.find(
            (v: any) => v.event === "vehicle.impact",
          )?.variant;
        let peak = 0;
        for (let i = 0; i < 24; i++) {
          await wait(10);
          peak = Math.max(peak, api.snapshot().masterPeak);
        }
        await wait(100);
        hits.push({ variant, peak });
      }
      api.solo(null);
      const pose = {
        active: true,
        paused: false,
        finished: false,
        grounded: true,
        speed: 40,
        forward: 38,
        throttle: 0,
        brake: false,
        slip: 0,
        scrape: true,
        boost: false,
      };
      api.override(pose);
      await wait(550);
      const scrape = api.snapshot();
      await wait(350);
      const held = api.snapshot();
      api.override({ ...pose, speed: 0, forward: 0 });
      await wait(180);
      const stopped = api.snapshot();
      api.override({ ...pose, grounded: false });
      await wait(180);
      const air = api.snapshot();
      reports.push({ theme, hits, scrape, held, stopped, air });
      api.override({ active: false, scrape: false });
      api.solo("gameplay");
      await wait(200);
    }
    api.override(null);
    api.solo(null);
    return reports;
  });
  for (const r of reports) {
    expect(r.hits.map((h) => h.variant)).toEqual([0, 1, 2]);
    expect(r.hits[1].peak).toBeGreaterThan(r.hits[0].peak * 1.5);
    expect(r.hits[2].peak).toBeGreaterThan(r.hits[1].peak * 1.3);
    expect(r.hits[2].peak).toBeLessThan(0.9);
    expect(r.scrape.tonalLayers.scrape).toBeGreaterThan(80);
    expect(r.scrape.layerLevels.scrape).toBeGreaterThan(0.01);
    expect(r.held.layerLevels.scrape).toBeCloseTo(
      r.scrape.layerLevels.scrape,
      5,
    );
    expect(r.held.events["vehicle.scrape"] ?? 0).toBe(0);
    expect(r.stopped.layerLevels.scrape).toBeLessThan(1e-7);
    expect(r.air.layerLevels.scrape).toBeLessThan(1e-7);
    expect(r.held.fault).toBe("");
  }
});

test("engine weight, decaying boost line and tire synths follow the rendered vehicle graph", async ({
  page,
}) => {
  await lab(page);
  const result = await page.evaluate(async () => {
    const api = (window as any).__infernoAudio;
    api.reset();
    for (const bus of ["music", "environment", "ui"]) api.mute(bus, true);
    const pose = {
      active: true,
      paused: false,
      finished: false,
      grounded: true,
      speed: 20,
      forward: 20,
      throttle: 1,
      brake: false,
      poweredDrift: false,
      slip: 0,
      scrape: false,
      boost: false,
    };
    const set = (patch: object) => {
      Object.assign(pose, patch);
      api.override({ ...pose });
    };
    set({});
    const tap = api.record(),
      recorder = new MediaRecorder(tap.stream),
      chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.start();
    const beginning = performance.now(),
      cues: { event: string; seconds: number }[] = [];
    const mark = (event: string) =>
      cues.push({ event, seconds: (performance.now() - beginning) / 1000 });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const states: Record<string, any> = {};
    mark("low engine / 72 km/h");
    await wait(1200);
    states.low = api.snapshot();
    mark("accelerate");
    for (let i = 1; i <= 40; i++) {
      set({ speed: 20 + i * 1.5, forward: 20 + i * 1.5 });
      await wait(50);
    }
    mark("high engine / 288 km/h");
    await wait(1400);
    states.high = api.snapshot();
    mark("boost / long synth decay");
    set({ boost: true });
    api.trigger("vehicle.boost.enter");
    await wait(750);
    states.boost = api.snapshot();
    await wait(150);
    mark("boost release");
    set({ boost: false });
    api.trigger("vehicle.boost.exit");
    await wait(900);
    states.release = api.snapshot();
    mark("straight braking");
    set({ brake: true });
    for (let i = 1; i <= 20; i++) {
      set({ speed: 80 - i * 2.25, forward: 80 - i * 2.25 });
      await wait(30);
    }
    await wait(400);
    states.brake = api.snapshot();
    mark("brake release / engine resumes");
    set({ brake: false, speed: 65, forward: 65 });
    await wait(900);
    states.drive = api.snapshot();
    mark("powered drift / engine and slide synth together");
    set({ brake: true, poweredDrift: true, slip: 0.45, forward: 62 });
    await wait(1300);
    states.drift = api.snapshot();
    mark("drift recovery");
    set({ brake: false });
    for (let i = 1; i <= 20; i++) {
      set({ slip: 0.45 * (1 - i / 20) });
      await wait(40);
    }
    await wait(400);
    states.recovery = api.snapshot();
    // The same mix makes the brake, boost and new collision timbres reviewable.
    for (const strength of [0.2, 0.5, 1]) {
      mark(`collision synth / ${strength}`);
      set({ active: false });
      await wait(150);
      api.trigger("vehicle.impact", strength);
      await wait(600);
    }
    mark("glancing contact / sustained tonal rasp");
    set({ active: true, speed: 40, forward: 38, throttle: 0, scrape: true });
    api.trigger("vehicle.impact", 0.2);
    await wait(1100);
    states.scrape = api.snapshot();
    mark("stopped / brake held");
    set({
      speed: 0,
      forward: 0,
      throttle: 0,
      brake: true,
      poweredDrift: false,
      slip: 1,
      scrape: true,
    });
    await wait(600);
    states.stopped = api.snapshot();
    mark("airborne / brake held");
    set({ speed: 65, forward: 65, grounded: false });
    await wait(600);
    states.air = api.snapshot();
    mark("reset");
    api.override({
      active: false,
      grounded: true,
      speed: 0,
      forward: 0,
      throttle: 0,
      brake: false,
      poweredDrift: false,
      slip: 0,
      boost: false,
      scrape: false,
    });
    api.reset();
    await wait(200);
    states.reset = api.snapshot();
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    tap.disconnect();
    api.override(null);
    return {
      states,
      cues,
      bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
    };
  });
  writeFileSync(
    "test-results/audio-driving-feedback.webm",
    Buffer.from(result.bytes),
  );
  writeFileSync(
    "test-results/audio-driving-feedback.json",
    JSON.stringify({ states: result.states, cues: result.cues }, null, 2),
  );
  const s = result.states;
  expect(s.high.layerLevels.harmonic).toBeGreaterThan(
    s.low.layerLevels.harmonic * 0.7,
  );
  expect(s.high.layerLevels.upper).toBeLessThan(
    s.high.layerLevels.harmonic * 0.15,
  );
  for (const layer of ["body", "harmonic", "overtone", "upper"]) {
    expect(s.boost.layerLevels[layer]).toBeCloseTo(
      s.high.layerLevels[layer],
      5,
    );
    expect(s.boost.layerFilters[layer]).toBeCloseTo(
      s.high.layerFilters[layer],
      2,
    );
  }
  expect(s.boost.layerDrives.harmonic).toBeCloseTo(
    s.high.layerDrives.harmonic,
    5,
  );
  expect(s.boost.layerLevels).not.toHaveProperty("boostAir");
  expect(s.boost.voiceEvents).toContain("vehicle.boost.enter");
  expect(s.release.voiceEvents).not.toContain("vehicle.boost.enter");
  expect(s.boost.events["vehicle.boost.enter"]).toBe(1);
  expect(s.boost.events["vehicle.boost.loop"] ?? 0).toBe(0);
  expect(s.brake.params.throttle).toBe(0);
  expect(s.brake.layerLevels.brake).toBeGreaterThan(0.03);
  expect(s.brake.tonalLayers.brake).toBeGreaterThan(60);
  expect(s.brake.tonalLayers.brake).toBeLessThan(s.high.tonalLayers.brake);
  expect(s.brake.layerLevels.tire).toBeLessThan(1e-7);
  expect(s.drift.params.throttle).toBe(1);
  expect(s.drift.layerLevels.harmonic).toBeGreaterThan(
    s.drive.layerLevels.harmonic * 0.9,
  );
  expect(s.drift.layerLevels.tire).toBeGreaterThan(0.015);
  expect(s.drift.tonalLayers.tire).toBeGreaterThan(s.drive.tonalLayers.tire);
  expect(s.drift.layerLevels.brake).toBeLessThan(1e-7);
  expect(s.scrape.tonalLayers.scrape).toBeGreaterThan(80);
  expect(s.scrape.events["vehicle.scrape"] ?? 0).toBe(0);
  expect(s.stopped.layerLevels.scrape).toBeLessThan(1e-7);
  for (const state of [s.recovery, s.stopped, s.air, s.reset]) {
    expect(state.layerLevels.tire).toBeLessThan(0.0001);
    expect(state.layerLevels.brake).toBeLessThan(0.0001);
  }
  for (const state of Object.values(s) as any[]) {
    expect(state.masterPeak).toBeLessThan(0.9);
    expect(state.fault).toBe("");
  }
});
