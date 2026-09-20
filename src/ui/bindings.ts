/** Player-facing actions and their keyboard and gamepad bindings. */

export const defaults = {
  throttle: "KeyW",
  brake: "KeyS",
  left: "KeyA",
  right: "KeyD",
  brakeSecondary: "Space",
  restart: "KeyR",
  respawn: "Backspace",
  ghost: "KeyG",
  splits: "Tab",
  camera: "KeyC",
  camera1: "Numpad1",
  camera2: "Numpad2",
  camera3: "Numpad3",
  hud: "KeyH",
  menu: "Escape",
  confirm: "Enter",
};
export type Action = keyof typeof defaults;
export type Bindings = Record<Action, string>;
export type PadBindings = Record<Action, number>;

/** Standard-mapping button indexes. A negative index is an unbound action. */
export const defaultPad: PadBindings = {
  throttle: 7,
  brake: 6,
  left: 14,
  right: 15,
  brakeSecondary: 0,
  restart: 3,
  respawn: 1,
  ghost: 2,
  splits: 4,
  camera: 5,
  camera1: -1,
  camera2: -1,
  camera3: -1,
  hud: 11,
  menu: 9,
  confirm: 0,
};
export const actions = Object.keys(defaults) as Action[];

const padLabels = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "BACK",
  "START",
  "LS",
  "RS",
  "↑",
  "↓",
  "←",
  "→",
  "HOME",
];

/** Merge a saved binding set into the defaults, one action at a time. Invalid
 * or missing entries keep their default, so an older save stays usable. */
export function migrateBindings<T extends string | number>(
  defaults: Record<Action, T>,
  saved: unknown,
) {
  const result = { ...defaults };
  if (!saved || typeof saved !== "object") return result;
  const values = { ...saved } as Record<string, unknown>;
  values.brakeSecondary ??= values.drift;
  for (const action of actions) {
    const value = values[action];
    if (
      typeof value === typeof defaults[action] &&
      (typeof value === "string"
        ? /^[A-Za-z][A-Za-z0-9]*$/.test(value)
        : Number.isInteger(value) && Number(value) >= -1 && Number(value) <= 16)
    )
      if (typeof value === "string") {
        const other = actions.find((a) => a !== action && result[a] === value);
        if (other) result[other] = result[action];
        result[action] = value as T;
      } else result[action] = value as T;
  }
  return result;
}

/** Bind a key to an action. An action that already holds the key exchanges
 * bindings with it, so no action becomes unreachable. */
export function rebind(bindings: Bindings, action: Action, code: string) {
  const other = actions.find((a) => a !== action && bindings[a] === code);
  if (other) bindings[other] = bindings[action];
  bindings[action] = code;
  return other;
}

/** Bind a gamepad button to an action, with the same exchange rule. Confirm
 * shares its button with the secondary brake, because their contexts differ. */
export function rebindPad(
  bindings: PadBindings,
  action: Action,
  index: number,
) {
  const other = actions.find(
    (a) =>
      a !== action &&
      a !== "confirm" &&
      action !== "confirm" &&
      bindings[a] === index,
  );
  if (other) bindings[other] = bindings[action];
  bindings[action] = index;
  return other;
}

export function actionName(action: Action) {
  return (
    (
      {
        brakeSecondary: "BRAKE (SECONDARY)",
        splits: "TOGGLE SPLIT TIME",
        camera1: "CAMERA 1 / OVERVIEW",
        camera2: "CAMERA 2 / CLOSE",
        camera3: "CAMERA 3 / INTERIOR",
      } as Partial<Record<Action, string>>
    )[action] ?? action.toUpperCase()
  );
}

export const keyName = (code: string) =>
  ({
    Backspace: "⌫",
    Escape: "ESC",
    Space: "SPACE",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  })[code] ??
  code
    .replace(/^Numpad/, "NUM ")
    .replace(/^Key|^Digit/, "")
    .toUpperCase();

export const padName = (bindings: PadBindings, action: Action) =>
  bindings[action] < 0
    ? "UNBOUND"
    : (padLabels[bindings[action]] ?? `BUTTON ${bindings[action]}`);
