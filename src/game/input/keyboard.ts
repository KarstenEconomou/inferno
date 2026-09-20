import type { Input } from "../../sim";
import { actions, defaults, type Action, type Bindings } from "../../ui";

/** Arrow keys stay available for the four driving actions while those actions
 * keep their default key and no other action claims the arrow. */
const arrowAlias: Partial<Record<Action, string>> = {
  throttle: "ArrowUp",
  brake: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

export type DriveAxes = { throttle: number; brake: boolean; steer: number };

/** Keyboard state and the translation of that state into driving input. */
export class Keyboard {
  private pressed = new Set<string>();
  private aliases = new Set<Action>();

  constructor(private bindings: Bindings) {
    this.rebound(bindings);
  }

  /** Recompute the arrow-key aliases. Call this after any binding change. */
  rebound(bindings: Bindings) {
    this.bindings = bindings;
    const claimed = new Set(actions.map((a) => bindings[a]));
    this.aliases.clear();
    for (const [action, arrow] of Object.entries(arrowAlias) as [
      Action,
      string,
    ][])
      if (bindings[action] === defaults[action] && !claimed.has(arrow))
        this.aliases.add(action);
  }

  add(code: string) {
    this.pressed.add(code);
  }
  delete(code: string) {
    this.pressed.delete(code);
  }
  clear() {
    this.pressed.clear();
  }
  has(code: string) {
    return this.pressed.has(code);
  }
  get codes() {
    return [...this.pressed];
  }

  /** Action bound to a key code, if any. */
  actionFor(code: string) {
    return actions.find((a) => this.bindings[a] === code);
  }

  private down(action: Action) {
    return (
      this.pressed.has(this.bindings[action]) ||
      (this.aliases.has(action) && this.pressed.has(arrowAlias[action]!))
    );
  }

  /** Combine keyboard and gamepad into one driving input. */
  resolve(pad: DriveAxes): Input {
    return {
      throttle: this.down("throttle") ? 1 : pad.throttle,
      steer:
        (this.down("right") ? 1 : 0) - (this.down("left") ? 1 : 0) + pad.steer,
      brake:
        this.down("brake") ||
        this.pressed.has(this.bindings.brakeSecondary) ||
        pad.brake,
    };
  }
}
