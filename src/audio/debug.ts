import type { AudioDirector } from "./director.ts";
import {
  buses,
  events,
  GRID,
  idleTelemetry,
  type AudioEvent,
  type Bus,
} from "./model.ts";
import { soundThemes } from "./themes.ts";
/** Only imported in development with ?audio. Never part of the player's HUD. */
export function mountAudioLab(audio: AudioDirector) {
  const root = document.createElement("aside");
  root.dataset.audioDebug = "true";
  root.className = "audio-lab";
  root.innerHTML = `<details open><summary>AUDIO LAB / 128 BPM</summary><label>THEME <select id="audio-theme">${soundThemes.map((t) => `<option value="${t.id}">${t.id.toUpperCase()}</option>`).join("")}</select></label><label>EVENT <select id="audio-event">${events.map((e) => `<option>${e}</option>`).join("")}</select></label><button id="audio-trigger">TRIGGER</button><button id="audio-countdown">COUNTDOWN AUDITION</button><button id="audio-reset">CLEAR VOICES</button><label>SOLO <select id="audio-solo"><option value="">ALL BUSES</option>${buses.map((b) => `<option>${b}</option>`).join("")}</select></label><div>${buses.map((b) => `<label><input type="checkbox" data-bus="${b}"> MUTE ${b.toUpperCase()}</label>`).join("")}</div><button id="audio-record">RECORD OUTPUT</button><div id="audio-download"></div><pre id="audio-stats"></pre></details>`;
  document.body.append(root);
  root.addEventListener("keydown", (e) => e.stopPropagation());
  root.addEventListener("pointerdown", (e) => e.stopPropagation());
  root.querySelector<HTMLSelectElement>("#audio-theme")!.onchange = (e) =>
    audio.setTheme((e.target as HTMLSelectElement).value);
  root.querySelector<HTMLButtonElement>("#audio-trigger")!.onclick = () => {
    audio.init();
    audio.emit(
      root.querySelector<HTMLSelectElement>("#audio-event")!
        .value as AudioEvent,
    );
  };
  root.querySelector<HTMLButtonElement>("#audio-countdown")!.onclick = () => {
    audio.init();
    const t = audio.ctx!.currentTime;
    (
      [
        "race.count.3",
        "race.count.2",
        "race.count.1",
        "race.start",
      ] as AudioEvent[]
    ).forEach((event, i) => audio.emit(event, { at: t + i * GRID.quarter }));
  };
  root.querySelector<HTMLButtonElement>("#audio-reset")!.onclick = () =>
    audio.reset();
  root.querySelector<HTMLSelectElement>("#audio-solo")!.onchange = (e) =>
    audio.soloBus(
      ((e.target as HTMLSelectElement).value || null) as Bus | null,
    );
  root
    .querySelectorAll<HTMLInputElement>("[data-bus]")
    .forEach(
      (el) =>
        (el.onchange = () => audio.muteBus(el.dataset.bus as Bus, el.checked)),
    );
  let recorder: MediaRecorder | null = null,
    stop: () => void = () => {},
    url = "";
  root.querySelector<HTMLButtonElement>("#audio-record")!.onclick = () => {
    const button = root.querySelector<HTMLButtonElement>("#audio-record")!;
    if (recorder?.state === "recording") {
      recorder.stop();
      button.textContent = "RECORD OUTPUT";
      return;
    }
    audio.init();
    const destination = audio.recordingDestination();
    if (!destination) return;
    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(destination.stream);
    stop = destination.disconnect;
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      stop();
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob(chunks, { type: recorder!.mimeType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "inferno-audio-review.webm";
      link.textContent = "DOWNLOAD CAPTURE";
      root.querySelector("#audio-download")!.replaceChildren(link);
    };
    recorder.start();
    button.textContent = "STOP RECORDING";
  };
  const interval = setInterval(() => {
    if (!root.isConnected) {
      clearInterval(interval);
      return;
    }
    const d = audio.diagnostics;
    const themeSelect = root.querySelector<HTMLSelectElement>("#audio-theme")!;
    if (document.activeElement !== themeSelect) themeSelect.value = d.theme;
    root.querySelector("#audio-stats")!.textContent =
      `${d.context.toUpperCase()} / ${d.ready ? "KIT READY" : "PRELOADING"}\nTHEME ${d.theme}\nEVENT VOICES ${d.voices}/${d.maxVoices}\nLAYERS ${d.continuousLayers.join(" / ")}\nMASTER ${d.masterDb.toFixed(1)} dBFS\nBAR ${d.transport.bar} / PHASE ${d.transport.phase.toFixed(3)}\nSYNTH RPM ${d.params.rpm.toFixed(0)}\nLOAD ${d.params.load.toFixed(2)} / SLIP GAIN ${d.params.tire.toFixed(3)}\nAIR ${d.params.air.toFixed(3)} / CONTACT ${d.params.coupling.toFixed(2)}\nBASE LATENCY ${(d.baseLatency * 1000).toFixed(1)} ms\n${d.fault}`;
  }, 100);
  // Audition/control API exists only on this opt-in development page.
  Object.defineProperty(window, "__infernoAudio", {
    configurable: true,
    value: {
      trigger: (event: AudioEvent, strength = 1) => {
        audio.init();
        audio.emit(event, { strength });
      },
      theme: (id: string) => audio.setTheme(id),
      reset: () => audio.reset(),
      mix: (mix: unknown) => audio.setMix(mix),
      solo: (bus: Bus | null) => audio.soloBus(bus),
      mute: (bus: Bus, value: boolean) => audio.muteBus(bus, value),
      snapshot: () => audio.diagnostics,
      record: () => audio.recordingDestination(),
      override: (value: Partial<typeof idleTelemetry> | null) =>
        audio.setTelemetryOverride(value),
    },
  });
}
