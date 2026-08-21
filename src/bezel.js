// Faceplate input: maps a clicked region (or a key press) to the event the
// state machine consumes.
//
// Geometry lives in units.js; this module only knows what each control *means*,
// which is identical across the 400W/500W family.

/** Region id -> state machine event. Knob rotations collapse to (knob, dir). */
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
  HOME: { type: 'press', key: 'HOME' },
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
  VNAV: { type: 'press', key: 'VNAV' },
  PROC: { type: 'press', key: 'PROC' },
  NRST: { type: 'press', key: 'NRST' },
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
  n: 'VNAV',
  h: 'HOME',
  '[': 'LEFT_LARGE_CCW',
  ']': 'LEFT_LARGE_CW',
  '-': 'LEFT_SMALL_CCW',
  '=': 'LEFT_SMALL_CW',
  v: 'LEFT_SMALL_PUSH',
  ',': 'RNG_UP',
  '.': 'RNG_DOWN',
};

// CLR doubles as "go to Default NAV" when held; the guide calls it press-and-hold.
export const CLR_HOLD_MS = 600;
