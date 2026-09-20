# INFERNO agent guide

## Language

Use ASD-STE100 Simplified Technical English throughout: replies, documentation,
code comments, UI text, commit messages and PR descriptions. Use short sentences,
active voice and one term for each meaning. Keep code identifiers and commands exact.

## Project

INFERNO is a browser racing game. It uses TypeScript, Vite, Three.js and Web Audio.
Vertigo Works and Burnline are the playable courses. Read [README.md](README.md)
and the applicable guide in [docs](docs) before a change.

## Rules

- Preserve unrelated changes. Make small, focused edits. Format only changed files.
- Keep physics in `src/sim/`, at 120 Hz, without browser dependencies.
- Use shared course data and marker dimensions. Change a course `id` when its
  geometry, the handling or the race rules affect saved runs.
- One course is selected at a time. Swap it with `selectCourse` before a run,
  never during one, and rebuild derived work through `onCourseChange`.
- Keep the three-ink style. Do not add dithering, bloom or particles.
- Keep boost, brake and collision sounds tonal.
- Keep audio imports explicit with `.ts`. After synthesis changes, run
  `npm run audio:generate`. Do not edit generated banks by hand.
- These rules describe the current design. An explicit user request can change it.

## Checks and handoff

- Run the relevant tests and `npm run build` for code changes.
- Use `npm test`, `npm run test:browser` and `npm run test:visual -- <name>`
  as needed. Check visual changes in motion from the normal driving camera.
- For documentation changes, check links and commands. There is no `just check`.
- Report the change, checks and remaining limits. Do not claim checks that did not run.
- Create commits only when requested. Use Conventional Commits `type(scope):
description` with a short, lowercase, imperative description.
