/** A menu row. Every menu is built from the same row, so the cursor, the
 * pointer and the controller all find the same targets, and the caret always
 * sits in the same column. A row may carry its current value on the right. */
export const row = (id: string, label: string, value = "") =>
  `<button class="menu-row" id="${id}"><span class="row-label">${label}</span>${
    value ? `<span class="row-value mono">${value}</span>` : ""
  }</button>`;

/** How far along its travel a slider stands, as a percentage, for the printed
 * fill behind the thumb. */
export const fill = (min: number, max: number, value: number) =>
  `${(((value - min) / (max - min || 1)) * 100).toFixed(1)}%`;

/** A slider value in its own unit. */
export function readout(unit: string, value: number) {
  if (unit === "percent") return `${Math.round(value * 100)}%`;
  if (unit === "px") return `${Math.round(value)} PX`;
  if (unit === "deg") return `${Math.round(value)}°`;
  return value.toFixed(2);
}

/** The readout beside a settings control. A switch reads as ON or OFF. */
export const valueText = (el: HTMLInputElement) =>
  el.type === "checkbox"
    ? el.checked
      ? "ON"
      : "OFF"
    : readout(el.dataset.unit ?? "", Number(el.value));

/** One settings row: the name on the left, the value on the right, and the
 * help line that the panel shows while the row holds the cursor. */
const setting = (help: string, name: string, control: string) =>
  `<label class="setting"${help ? ` data-help="${help}"` : ""}><span class="setting-name">${name}</span><span class="setting-value">${control}</span></label>`;

export const checkbox = (
  id: string,
  label: string,
  value: boolean,
  help = "",
) =>
  setting(
    help,
    label,
    `<input id="${id}" type="checkbox" ${value ? "checked" : ""}><b class="state mono" data-state="${id}">${value ? "ON" : "OFF"}</b>`,
  );

export const range = (
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit = "",
  help = "",
) =>
  setting(
    help,
    label,
    `<input id="${id}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="--fill:${fill(
      min,
      max,
      value,
    )}"${unit ? ` data-unit="${unit}"` : ""}><b class="state mono" data-state="${id}">${readout(unit, value)}</b>`,
  );

export const select = (
  id: string,
  label: string,
  options: string[],
  selected: number,
  help = "",
) =>
  setting(
    help,
    label,
    `<select id="${id}" aria-label="${label}">${options
      .map(
        (name, i) =>
          `<option value="${i}" ${selected === i ? "selected" : ""}>${name}</option>`,
      )
      .join("")}</select>`,
  );
