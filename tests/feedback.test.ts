import { describe, expect, it } from "vitest";
import { Vehicle, STEP } from "../src/sim";
import { DrivingFeedback } from "../src/sim/feedback";
const drive = { throttle: 1, steer: 0, brake: false };
describe("driving feedback", () => {
  it("distinguishes deliberate reversing from driving the course backward", () => {
    const v = new Vehicle(),
      feedback = new DrivingFeedback();
    v.velocity.copy(v.heading).multiplyScalar(-10);
    for (let i = 0; i < 240; i++) feedback.update(v, drive, STEP);
    expect(feedback.message(v, drive)).toBe("");
    v.heading.negate();
    v.velocity.copy(v.heading).multiplyScalar(30);
    for (let i = 0; i < 60; i++) feedback.update(v, drive, STEP);
    expect(feedback.message(v, drive)).toBe("");
    for (let i = 0; i < 60; i++) feedback.update(v, drive, STEP);
    expect(feedback.message(v, drive)).toContain("WRONG WAY");
    for (let i = 0; i < 1200; i++) feedback.update(v, drive, STEP);
    v.velocity.negate();
    for (let i = 0; i < 24; i++) feedback.update(v, drive, STEP);
    expect(feedback.needsRecovery).toBe(false);
  });
  it("offers rail recovery only after sustained blocked throttle and clears it on reset", () => {
    const v = new Vehicle(),
      feedback = new DrivingFeedback();
    for (let i = 0; i < 240; i++) feedback.update(v, drive, STEP);
    expect(feedback.needsRecovery).toBe(false);
    v.railContact = true;
    for (let i = 0; i < 120; i++) feedback.update(v, drive, STEP);
    expect(feedback.message(v, drive)).toContain("RESPAWN");
    feedback.reset();
    expect(feedback.needsRecovery).toBe(false);
  });
  it("offers recovery across intermittent rail contact while the driver keeps accelerating", () => {
    const v = new Vehicle(),
      feedback = new DrivingFeedback();
    let offered = false,
      contacts = 0;
    for (let i = 0; i < 120 * 9; i++) {
      const input = { ...drive, steer: i >= 192 ? 1 : 0 };
      v.step(input);
      feedback.update(v, input, STEP);
      contacts += Number(v.railContact);
      offered ||= feedback.message(v, input).includes("RESPAWN");
    }
    console.log("Rail recovery", { speed: v.speed, contacts, offered });
    expect(contacts).toBeGreaterThan(50);
    expect(offered).toBe(true);
  });
});
