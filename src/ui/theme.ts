import type { TrackTheme } from "../circuits";

/** Publish the circuit inks as CSS custom properties. The interface and the
 * renderer then read the same three colors from one source. */
export function applyTheme(theme: TrackTheme) {
  for (const role of ["field", "structure", "signal"] as const)
    document.documentElement.style.setProperty(`--${role}`, theme[role]);
  const pattern = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><path fill="${theme.field}" d="M0 0h2v2H0zM2 2h2v2H2z"/></svg>`;
  document.documentElement.style.setProperty(
    "--screen",
    `url("data:image/svg+xml,${encodeURIComponent(pattern)}")`,
  );
  document.documentElement.dataset.circuit = theme.display_name;
}
