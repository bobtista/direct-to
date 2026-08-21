// Hit regions for the GNS 430 faceplate, in the native coordinate space of
// assets/bezel-430.png (446x186) — the artwork Garmin's own trainer draws.
//
// Knobs follow the trainer convention documented in the 400W/500W Trainer
// Guide: you click the arrow on the side you want to rotate toward, and click
// the centre of a small knob to press it.

export const BEZEL = { w: 446, h: 186 };

// The dark cutout measures 243x132; the active LCD is the 240x128 inside it.
export const SCREEN = { x: 110, y: 26, w: 240, h: 128 };

/** @typedef {{id: string, x: number, y: number, w: number, h: number, title: string}} Region */

/** @type {Region[]} */
export const REGIONS = [
  // --- Left: volume knobs -------------------------------------------------
  { id: 'COM_VOL_CCW', x: 20, y: 16, w: 13, h: 26, title: 'COM volume down' },
  { id: 'COM_VOL_CW', x: 33, y: 16, w: 13, h: 26, title: 'COM volume up' },
  { id: 'COM_SQ', x: 26, y: 22, w: 14, h: 14, title: 'Push: COM squelch' },
  { id: 'VLOC_VOL_CCW', x: 20, y: 60, w: 13, h: 26, title: 'VLOC volume down' },
  { id: 'VLOC_VOL_CW', x: 33, y: 60, w: 13, h: 26, title: 'VLOC volume up' },
  { id: 'VLOC_ID', x: 26, y: 66, w: 14, h: 14, title: 'Push: VLOC ident' },

  // --- Left: flip-flop keys ----------------------------------------------
  { id: 'COM_FF', x: 79, y: 29, w: 22, h: 29, title: 'COM flip-flop' },
  { id: 'VLOC_FF', x: 79, y: 75, w: 22, h: 29, title: 'VLOC flip-flop' },

  // --- Left: dual COM/VLOC tuning knob ------------------------------------
  { id: 'LEFT_LARGE_CCW', x: 15, y: 112, w: 18, h: 16, title: 'Large left knob CCW' },
  { id: 'LEFT_LARGE_CW', x: 33, y: 112, w: 19, h: 16, title: 'Large left knob CW' },
  { id: 'LEFT_SMALL_CCW', x: 14, y: 129, w: 16, h: 16, title: 'Small left knob CCW' },
  { id: 'LEFT_SMALL_CW', x: 30, y: 129, w: 18, h: 16, title: 'Small left knob CW' },
  { id: 'LEFT_SMALL_PUSH', x: 14, y: 146, w: 34, h: 20, title: 'Push C/V' },

  // --- Right: RNG rocker --------------------------------------------------
  { id: 'RNG_DOWN', x: 369, y: 17, w: 26, h: 22, title: 'Range out' },
  { id: 'RNG_UP', x: 412, y: 17, w: 26, h: 22, title: 'Range in' },

  // --- Right: keys --------------------------------------------------------
  { id: 'DTO', x: 369, y: 47, w: 33, h: 23, title: 'Direct-To' },
  { id: 'MENU', x: 407, y: 47, w: 33, h: 23, title: 'MENU' },
  { id: 'CLR', x: 369, y: 75, w: 33, h: 23, title: 'CLR (hold for Default NAV)' },
  { id: 'ENT', x: 407, y: 75, w: 33, h: 23, title: 'ENT' },

  // --- Right: dual GPS/CRSR knob ------------------------------------------
  { id: 'RIGHT_LARGE_CCW', x: 391, y: 113, w: 22, h: 15, title: 'Large right knob CCW' },
  { id: 'RIGHT_LARGE_CW', x: 413, y: 113, w: 23, h: 15, title: 'Large right knob CW' },
  { id: 'RIGHT_SMALL_CCW', x: 400, y: 129, w: 20, h: 16, title: 'Small right knob CCW' },
  { id: 'RIGHT_SMALL_CW', x: 420, y: 129, w: 20, h: 16, title: 'Small right knob CW' },
  { id: 'RIGHT_SMALL_PUSH', x: 400, y: 146, w: 40, h: 20, title: 'Push CRSR' },

  // --- Bottom row ---------------------------------------------------------
  { id: 'CDI', x: 116, y: 162, w: 28, h: 16, title: 'CDI' },
  { id: 'OBS', x: 166, y: 162, w: 28, h: 16, title: 'OBS' },
  { id: 'MSG', x: 216, y: 162, w: 29, h: 16, title: 'MSG' },
  { id: 'FPL', x: 266, y: 162, w: 29, h: 16, title: 'FPL' },
  { id: 'PROC', x: 316, y: 162, w: 31, h: 16, title: 'PROC' },
];

// Region id -> the event the state machine consumes. Knob rotations collapse
// to a (knob, dir) pair so gns.js never has to think about geometry.
const EVENTS = {
  COM_VOL_CCW: { type: 'knob', knob: 'COM_VOL', dir: -1 },
  COM_VOL_CW: { type: 'knob', knob: 'COM_VOL', dir: 1 },
  COM_SQ: { type: 'press', key: 'COM_SQ' },
  VLOC_VOL_CCW: { type: 'knob', knob: 'VLOC_VOL', dir: -1 },
  VLOC_VOL_CW: { type: 'knob', knob: 'VLOC_VOL', dir: 1 },
  VLOC_ID: { type: 'press', key: 'VLOC_ID' },
  COM_FF: { type: 'press', key: 'COM_FF' },
  VLOC_FF: { type: 'press', key: 'VLOC_FF' },
  LEFT_LARGE_CCW: { type: 'knob', knob: 'LEFT_LARGE', dir: -1 },
  LEFT_LARGE_CW: { type: 'knob', knob: 'LEFT_LARGE', dir: 1 },
  LEFT_SMALL_CCW: { type: 'knob', knob: 'LEFT_SMALL', dir: -1 },
  LEFT_SMALL_CW: { type: 'knob', knob: 'LEFT_SMALL', dir: 1 },
  LEFT_SMALL_PUSH: { type: 'press', key: 'CV' },
  RNG_DOWN: { type: 'press', key: 'RNG_DOWN' },
  RNG_UP: { type: 'press', key: 'RNG_UP' },
  DTO: { type: 'press', key: 'DTO' },
  MENU: { type: 'press', key: 'MENU' },
  CLR: { type: 'press', key: 'CLR' },
  ENT: { type: 'press', key: 'ENT' },
  RIGHT_LARGE_CCW: { type: 'knob', knob: 'RIGHT_LARGE', dir: -1 },
  RIGHT_LARGE_CW: { type: 'knob', knob: 'RIGHT_LARGE', dir: 1 },
  RIGHT_SMALL_CCW: { type: 'knob', knob: 'RIGHT_SMALL', dir: -1 },
  RIGHT_SMALL_CW: { type: 'knob', knob: 'RIGHT_SMALL', dir: 1 },
  RIGHT_SMALL_PUSH: { type: 'press', key: 'CRSR' },
  CDI: { type: 'press', key: 'CDI' },
  OBS: { type: 'press', key: 'OBS' },
  MSG: { type: 'press', key: 'MSG' },
  FPL: { type: 'press', key: 'FPL' },
  PROC: { type: 'press', key: 'PROC' },
};

export const eventForRegion = (id) => EVENTS[id] ?? null;

// Keyboard shortcuts, so you can drill without reaching for the mouse.
export const KEYBOARD = {
  ArrowLeft: 'RIGHT_LARGE_CCW',
  ArrowRight: 'RIGHT_LARGE_CW',
  ArrowDown: 'RIGHT_SMALL_CCW',
  ArrowUp: 'RIGHT_SMALL_CW',
  Enter: 'ENT',
  Backspace: 'CLR',
  ' ': 'RIGHT_SMALL_PUSH',
  d: 'DTO',
  m: 'MENU',
  f: 'FPL',
  p: 'PROC',
  c: 'CDI',
  o: 'OBS',
  g: 'MSG',
  '[': 'LEFT_LARGE_CCW',
  ']': 'LEFT_LARGE_CW',
  '-': 'LEFT_SMALL_CCW',
  '=': 'LEFT_SMALL_CW',
  v: 'LEFT_SMALL_PUSH',
};

// CLR doubles as "go to Default NAV" when held; the guide calls it press-and-hold.
export const CLR_HOLD_MS = 600;
