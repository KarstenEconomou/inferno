/** Threshold below which the left stick counts as centred. */
const STICK_DEADZONE = 0.15;
/** Larger threshold that decides whether the pad is the device in use. */
const STICK_ACTIVITY = 0.2;
/** Fraction of a trigger's travel that counts as a brake request. */
const TRIGGER_THRESHOLD = 0.1;
/** Stick travel that counts as one push of a menu cursor. */
const STICK_STEP = 0.6;

/** One standard-mapping gamepad, sampled once per frame. The source reports
 * button edges, so a held button acts once until it is released. */
export class GamepadSource {
  private pad: Gamepad | null = null;
  private buttons: boolean[] = [];
  private previous: boolean[] = [];
  private latch = { x: 0, y: 0 };

  /** Sample the first connected standard pad. Returns false when none is
   * present; the previous button state is then forgotten. */
  poll() {
    this.pad =
      Array.from(navigator.getGamepads?.() ?? []).find(
        (p) => p?.connected && p.mapping === "standard",
      ) ?? null;
    if (!this.pad) {
      this.previous = [];
      this.buttons = [];
      return false;
    }
    this.buttons = this.pad.buttons.map((b) => b.pressed);
    return true;
  }

  /** True while any button is down or the stick is clearly off centre. */
  get active() {
    return this.buttons.some(Boolean) || Math.abs(this.axis) > STICK_ACTIVITY;
  }

  get axis() {
    return this.pad?.axes[0] ?? 0;
  }

  get axisY() {
    return this.pad?.axes[1] ?? 0;
  }

  /** One menu step for each push of the left stick. The stick has to return
   * towards the centre before it steps again, so a held stick does not run
   * away down a list. */
  stickStep() {
    const step = { x: 0, y: 0 };
    for (const axis of ["x", "y"] as const) {
      const value = axis === "x" ? this.axis : this.axisY;
      const pushed = Math.abs(value) > STICK_STEP ? Math.sign(value) : 0;
      if (pushed && pushed !== this.latch[axis]) step[axis] = pushed;
      if (Math.abs(value) < STICK_DEADZONE) this.latch[axis] = 0;
      else if (pushed) this.latch[axis] = pushed;
    }
    return step;
  }

  /** Index of the first button pressed in this frame, or -1. */
  firstPressed() {
    return this.buttons.findIndex((value, i) => value && !this.previous[i]);
  }

  pressed(index: number) {
    return !!this.buttons[index] && !this.previous[index];
  }

  held(index: number) {
    return !!this.buttons[index];
  }

  /** Analogue travel of a button, for the triggers. */
  value(index: number) {
    return this.pad?.buttons[index]?.value ?? 0;
  }

  get steer() {
    const stick = Math.abs(this.axis) > STICK_DEADZONE ? this.axis : 0;
    return stick;
  }

  brakeHeld(brake: number, secondary: number) {
    return this.value(brake) > TRIGGER_THRESHOLD || this.held(secondary);
  }

  /** Remember this frame's buttons, so the next frame can find the edges. */
  commit() {
    this.previous = this.buttons;
  }
}
