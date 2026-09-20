import { test as base, expect } from "@playwright/test";
/** Chrome renders the real Web Audio graph to a virtual output in automation.
 * Host sound-device availability must not decide whether its audio clock runs.
 * MediaStreamDestination captures still contain the generated stereo mix. */
export const test = base.extend<{ virtualAudio: void }>({
  virtualAudio: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        const Native = window.AudioContext;
        window.AudioContext = class extends Native {
          constructor(options?: AudioContextOptions) {
            super({
              ...options,
              sinkId: { type: "none" },
            } as AudioContextOptions);
          }
        };
      });
      await use();
    },
    { auto: true },
  ],
});
export { expect };
