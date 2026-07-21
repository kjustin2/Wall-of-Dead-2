/**
 * Optional CC0 audio clips (see public/audio/LICENSES.md). Loaded into AudioBuffers
 * by AudioFX at init and used *alongside* the procedural synthesis — never required:
 * if a fetch/decode fails, the synth path is the guaranteed fallback, so dev/CI and
 * the packaged .exe never depend on these files being present.
 *
 * Served from /public at the site root (dev) and copied to dist/ in the build, which
 * the Electron host serves over its fixed app://dead-air scheme — so absolute paths resolve.
 */

/** looping background score, keyed by the act it underscores */
export const MUSIC: Record<string, string> = {
  dread: "/music/dread-bed.mp3",   // Act I–II: sparse low drone bed
  unease: "/music/unease.mp3",     // after the sighting / power: eerie tension
  chase: "/music/chase.mp3"        // final flight: agitated
};

/** one-shot samples layered onto the synth one-shots */
export const SAMPLES: Record<string, string> = {
  stinger: "/audio/stinger.mp3",
  step1: "/audio/footstep-metal-01.mp3",
  step2: "/audio/footstep-metal-02.mp3",
  step3: "/audio/footstep-metal-03.mp3",
  step4: "/audio/footstep-metal-04.mp3"
};
