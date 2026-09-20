/** Every control that a dialog can move focus to. */
export const DIALOG_CONTROLS = "button,input,select";
/** Controls that the menu cursor can land on. Anything marked as decoration
 * stays out of the cursor's path while remaining clickable with a pointer. */
export const CURSOR_CONTROLS =
  "button:not(:disabled):not([data-cursor-skip]),input:not(:disabled),select:not(:disabled)";

export type Direction = "up" | "down" | "left" | "right";

/** Weight applied to the distance across the direction of travel, so that a
 * control in the same lane wins over a nearer one beside it. */
const ALIGNED = 0.5;
const OFFSET = 4;
/** Tolerance, in pixels, for deciding that a control is past the current edge. */
const EDGE = 2;
/** Separation between the bands that a candidate can fall in. A control in
 * the same lane always beats one in another lane, and a control in the
 * direction of travel always beats the wrap to the far end of its lane. */
const BAND = 1e6;

/** The control that the cursor last stood on inside each marked group. A
 * group is a list that the cursor leaves and comes back to, such as the
 * circuit list: it should come back to the row it left, not to whichever row
 * happens to lie beside the control it returns from. */
const lastInGroup = new WeakMap<HTMLElement, HTMLElement>();
const GROUP = "[data-cursor-group]";

/** Record where the cursor stands, for every group that contains it. */
export function rememberFocus(el: Element) {
  if (!(el instanceof HTMLElement)) return;
  const group = el.closest<HTMLElement>(GROUP);
  if (group) lastInGroup.set(group, el);
}

type Box = { el: HTMLElement; x: number; y: number; rect: DOMRect };

const box = (el: HTMLElement): Box => {
  const rect = el.getBoundingClientRect();
  return {
    el,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect,
  };
};

/** True when the control lies past the current control's edge on the axis of
 * travel. Neighbours inside the same band, such as two buttons of one row,
 * are not above or below each other however their centres fall. */
function ahead(from: Box, to: Box, direction: Direction) {
  if (direction === "up") return to.y < from.rect.top + EDGE;
  if (direction === "down") return to.y > from.rect.bottom - EDGE;
  if (direction === "left") return to.x < from.rect.left + EDGE;
  return to.x > from.rect.right - EDGE;
}

/** Rank one candidate. A lower score wins. The three bands, in order: the
 * same lane ahead, the same lane wrapping round, another lane ahead. Inside a
 * band the candidates ahead rank by nearness and the wrapping ones by
 * distance, so a step past the last row of a lane lands on its first. A lane
 * never wraps into another lane, so a press can only move the cursor the way
 * it points, or round the lane it already stands in. */
function score(from: Box, to: Box, direction: Direction) {
  const vertical = direction === "up" || direction === "down";
  const lane = vertical
    ? to.rect.right > from.rect.left && to.rect.left < from.rect.right
    : to.rect.bottom > from.rect.top && to.rect.top < from.rect.bottom;
  const along = Math.abs(vertical ? to.y - from.y : to.x - from.x);
  const across =
    Math.abs(vertical ? to.x - from.x : to.y - from.y) *
    (lane ? ALIGNED : OFFSET);
  const forward = ahead(from, to, direction);
  if (!lane && !forward) return Infinity;
  const band = lane ? (forward ? 0 : 1) : 2;
  return band * BAND + (forward ? along + across : across - along);
}

/** Move the cursor to the control that lies in one direction of the focused
 * one. The choice is geometric, so the cursor always goes where the player
 * sees it go, and a lane — a column of rows, or a row of plates — is never
 * left by a press along it. */
export function navigate(
  root: ParentNode,
  direction: Direction,
  selector = CURSOR_CONTROLS,
) {
  const active = document.activeElement;
  const items = [...root.querySelectorAll<HTMLElement>(selector)]
    .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0)
    .map(box);
  if (!items.length) return false;
  const current = items.find((item) => item.el === active);
  if (!current) return focusItem(items[0].el);
  let best: HTMLElement | null = null,
    bestScore = Infinity;
  for (const item of items) {
    if (item.el === current.el) continue;
    const value = score(current, item, direction);
    if (value < Infinity && value < bestScore) {
      bestScore = value;
      best = item.el;
    }
  }
  if (!best) return false;
  // Entering a group from outside it returns the cursor to the row it left.
  const group = best.closest<HTMLElement>(GROUP);
  if (group && !group.contains(current.el)) {
    const remembered = lastInGroup.get(group);
    if (remembered?.isConnected && group.contains(remembered))
      best = remembered;
  }
  return focusItem(best);
}

function focusItem(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

/** Move focus by one step through a list of controls, wrapping at both ends.
 * With nothing focused, a forward step selects the first control. */
export function cycleFocus(root: ParentNode, selector: string, step: number) {
  const items = [...root.querySelectorAll<HTMLElement>(selector)];
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  items[(index + step + items.length) % items.length]?.focus();
}

/** Adjust the value of a control with a horizontal step, the way a console
 * options list does. Returns false for controls that carry no value, so the
 * cursor moves instead. */
export function adjustValue(el: Element, step: number) {
  if (el instanceof HTMLInputElement && el.type === "range") {
    const min = Number(el.min || 0),
      max = Number(el.max || 100),
      size = Number(el.step || 1);
    const next = Math.min(max, Math.max(min, Number(el.value) + step * size));
    if (next === Number(el.value)) return true;
    el.value = String(next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    el.checked = step > 0;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLSelectElement) {
    const next = Math.max(
      0,
      Math.min(el.options.length - 1, el.selectedIndex + step),
    );
    if (next === el.selectedIndex) return true;
    el.selectedIndex = next;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}
