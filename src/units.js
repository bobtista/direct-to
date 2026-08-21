// Unit profiles.
//
// Each entry describes one box: the faceplate size, where the display sits in
// it, the display's real pixel resolution, and the clickable regions in the
// faceplate's own coordinate space. Geometry was measured off the artwork in
// Garmin's Windows trainer (bitmap 142 for the 400W-series, 132 for the 530).
//
// Everything else in the app reads from here, so adding a unit is data plus a
// faceplate drawing.

import { bezel430Svg, bezel530Svg } from './bezelart.js';
import { bezel650XiSvg } from './bezelart-gtn.js';

/** @typedef {{id:string, x:number, y:number, w:number, h:number, title:string}} Region */

// --- GNS 430 (446x186 faceplate, 240x128 display) --------------------------

/** @type {Region[]} */
const REGIONS_430 = [
  { id: 'COM_VOL_CCW', x: 20, y: 16, w: 13, h: 26, title: 'COM volume down' },
  { id: 'COM_VOL_CW', x: 33, y: 16, w: 13, h: 26, title: 'COM volume up' },
  { id: 'COM_SQ', x: 26, y: 22, w: 14, h: 14, title: 'Push: COM squelch' },
  { id: 'VLOC_VOL_CCW', x: 20, y: 60, w: 13, h: 26, title: 'VLOC volume down' },
  { id: 'VLOC_VOL_CW', x: 33, y: 60, w: 13, h: 26, title: 'VLOC volume up' },
  { id: 'VLOC_ID', x: 26, y: 66, w: 14, h: 14, title: 'Push: VLOC ident' },

  { id: 'COM_FF', x: 79, y: 29, w: 22, h: 29, title: 'COM flip-flop' },
  { id: 'VLOC_FF', x: 79, y: 75, w: 22, h: 29, title: 'VLOC flip-flop' },

  { id: 'LEFT_LARGE_CCW', x: 15, y: 112, w: 18, h: 16, title: 'Large left knob CCW' },
  { id: 'LEFT_LARGE_CW', x: 33, y: 112, w: 19, h: 16, title: 'Large left knob CW' },
  { id: 'LEFT_SMALL_CCW', x: 14, y: 129, w: 16, h: 16, title: 'Small left knob CCW' },
  { id: 'LEFT_SMALL_CW', x: 30, y: 129, w: 18, h: 16, title: 'Small left knob CW' },
  { id: 'LEFT_SMALL_PUSH', x: 14, y: 146, w: 34, h: 20, title: 'Push C/V' },

  { id: 'RNG_DOWN', x: 369, y: 17, w: 26, h: 22, title: 'Range out' },
  { id: 'RNG_UP', x: 412, y: 17, w: 26, h: 22, title: 'Range in' },

  { id: 'DTO', x: 369, y: 47, w: 33, h: 23, title: 'Direct-To' },
  { id: 'MENU', x: 407, y: 47, w: 33, h: 23, title: 'MENU' },
  { id: 'CLR', x: 369, y: 75, w: 33, h: 23, title: 'CLR (hold for Default NAV)' },
  { id: 'ENT', x: 407, y: 75, w: 33, h: 23, title: 'ENT' },

  { id: 'RIGHT_LARGE_CCW', x: 391, y: 113, w: 22, h: 15, title: 'Large right knob CCW' },
  { id: 'RIGHT_LARGE_CW', x: 413, y: 113, w: 23, h: 15, title: 'Large right knob CW' },
  { id: 'RIGHT_SMALL_CCW', x: 400, y: 129, w: 20, h: 16, title: 'Small right knob CCW' },
  { id: 'RIGHT_SMALL_CW', x: 420, y: 129, w: 20, h: 16, title: 'Small right knob CW' },
  { id: 'RIGHT_SMALL_PUSH', x: 400, y: 146, w: 40, h: 20, title: 'Push CRSR' },

  { id: 'CDI', x: 116, y: 162, w: 28, h: 16, title: 'CDI' },
  { id: 'OBS', x: 166, y: 162, w: 28, h: 16, title: 'OBS' },
  { id: 'MSG', x: 216, y: 162, w: 29, h: 16, title: 'MSG' },
  { id: 'FPL', x: 266, y: 162, w: 29, h: 16, title: 'FPL' },
  { id: 'PROC', x: 316, y: 162, w: 31, h: 16, title: 'PROC' },
];

// --- GNS 530 (464x338 faceplate, 320x234 display) --------------------------
//
// The 530 is the same firmware in a taller box: the RNG rocker runs vertically,
// the flip-flops sit above their volume knobs, and the bottom row gains VNAV.

/** @type {Region[]} */
const REGIONS_530 = [
  { id: 'COM_FF', x: 44, y: 30, w: 19, h: 29, title: 'COM flip-flop' },
  { id: 'COM_VOL_CCW', x: 24, y: 67, w: 12, h: 24, title: 'COM volume down' },
  { id: 'COM_VOL_CW', x: 36, y: 67, w: 12, h: 24, title: 'COM volume up' },
  { id: 'COM_SQ', x: 30, y: 73, w: 12, h: 12, title: 'Push: COM squelch' },

  { id: 'VLOC_FF', x: 44, y: 107, w: 19, h: 29, title: 'VLOC flip-flop' },
  { id: 'VLOC_VOL_CCW', x: 24, y: 143, w: 12, h: 24, title: 'VLOC volume down' },
  { id: 'VLOC_VOL_CW', x: 36, y: 143, w: 12, h: 24, title: 'VLOC volume up' },
  { id: 'VLOC_ID', x: 30, y: 149, w: 12, h: 12, title: 'Push: VLOC ident' },

  { id: 'LEFT_LARGE_CCW', x: 17, y: 264, w: 20, h: 16, title: 'Large left knob CCW' },
  { id: 'LEFT_LARGE_CW', x: 37, y: 264, w: 21, h: 16, title: 'Large left knob CW' },
  { id: 'LEFT_SMALL_CCW', x: 17, y: 281, w: 19, h: 15, title: 'Small left knob CCW' },
  { id: 'LEFT_SMALL_CW', x: 36, y: 281, w: 20, h: 15, title: 'Small left knob CW' },
  { id: 'LEFT_SMALL_PUSH', x: 17, y: 297, w: 39, h: 20, title: 'Push C/V' },

  // Vertical rocker: up on top, RNG legend between, down beneath.
  { id: 'RNG_UP', x: 414, y: 38, w: 30, h: 25, title: 'Range in' },
  { id: 'RNG_DOWN', x: 414, y: 75, w: 30, h: 25, title: 'Range out' },

  { id: 'DTO', x: 413, y: 109, w: 32, h: 21, title: 'Direct-To' },
  { id: 'MENU', x: 413, y: 140, w: 32, h: 21, title: 'MENU' },
  { id: 'CLR', x: 413, y: 169, w: 32, h: 21, title: 'CLR (hold for Default NAV)' },
  { id: 'ENT', x: 413, y: 198, w: 32, h: 21, title: 'ENT' },

  { id: 'RIGHT_LARGE_CCW', x: 400, y: 264, w: 20, h: 16, title: 'Large right knob CCW' },
  { id: 'RIGHT_LARGE_CW', x: 420, y: 264, w: 21, h: 16, title: 'Large right knob CW' },
  { id: 'RIGHT_SMALL_CCW', x: 401, y: 281, w: 19, h: 15, title: 'Small right knob CCW' },
  { id: 'RIGHT_SMALL_CW', x: 420, y: 281, w: 20, h: 15, title: 'Small right knob CW' },
  { id: 'RIGHT_SMALL_PUSH', x: 401, y: 297, w: 39, h: 20, title: 'Push CRSR' },

  { id: 'CDI', x: 97, y: 275, w: 46, h: 21, title: 'CDI' },
  { id: 'OBS', x: 145, y: 275, w: 45, h: 21, title: 'OBS' },
  { id: 'MSG', x: 192, y: 275, w: 46, h: 21, title: 'MSG' },
  { id: 'FPL', x: 240, y: 275, w: 46, h: 21, title: 'FPL' },
  { id: 'VNAV', x: 288, y: 275, w: 46, h: 21, title: 'VNAV' },
  { id: 'PROC', x: 336, y: 275, w: 46, h: 21, title: 'PROC' },
];

// --- GTN 650Xi (500x213 faceplate, 840x372 touchscreen) --------------------
//
// Almost every control is on the glass. The faceplate has only these.

/** @type {Region[]} */
const REGIONS_650XI = [
  { id: 'COM_VOL_CCW', x: 12, y: 16, w: 15, h: 30, title: 'Volume down' },
  { id: 'COM_VOL_CW', x: 27, y: 16, w: 15, h: 30, title: 'Volume up' },
  { id: 'COM_SQ', x: 19, y: 23, w: 16, h: 16, title: 'Push: squelch' },

  { id: 'HOME', x: 455, y: 68, w: 38, h: 23, title: 'HOME (hold for Map)' },
  { id: 'DTO', x: 455, y: 108, w: 38, h: 23, title: 'Direct-To' },

  { id: 'RIGHT_LARGE_CCW', x: 450, y: 153, w: 24, h: 17, title: 'Large knob CCW' },
  { id: 'RIGHT_LARGE_CW', x: 474, y: 153, w: 24, h: 17, title: 'Large knob CW' },
  { id: 'RIGHT_SMALL_CCW', x: 452, y: 170, w: 22, h: 15, title: 'Small knob CCW' },
  { id: 'RIGHT_SMALL_CW', x: 474, y: 170, w: 22, h: 15, title: 'Small knob CW' },
  { id: 'RIGHT_SMALL_PUSH', x: 458, y: 186, w: 32, h: 16, title: 'Push knob' },
];

export const UNITS = {
  GNS430: {
    id: 'GNS430',
    name: 'GNS 430W',
    short: '430',
    bezel: { w: 446, h: 186 },
    // Box the display occupies in faceplate coordinates.
    screen: { x: 110, y: 26, w: 240, h: 128 },
    // The unit's real display resolution, which the screen grid is drawn in.
    px: { w: 240, h: 128 },
    family: 'GNS',
    regions: REGIONS_430,
    softKeys: ['CDI', 'OBS', 'MSG', 'FPL', 'PROC'],
    hasVloc: true,
    art: bezel430Svg,
    // Only the original artwork we can extract has a bitmap skin available.
    bitmap: 'assets/bezel-430.png',
  },
  GNS530: {
    id: 'GNS530',
    name: 'GNS 530W',
    short: '530',
    bezel: { w: 464, h: 338 },
    screen: { x: 83, y: 28, w: 303, h: 225 },
    px: { w: 320, h: 234 },
    family: 'GNS',
    regions: REGIONS_530,
    softKeys: ['CDI', 'OBS', 'MSG', 'FPL', 'VNAV', 'PROC'],
    hasVloc: true,
    art: bezel530Svg,
    bitmap: 'assets/bezel-530.png',
  },
  GTN650XI: {
    id: 'GTN650XI',
    name: 'GTN 650Xi',
    short: '650Xi',
    family: 'GTN',
    bezel: { w: 500, h: 213 },
    screen: { x: 44, y: 19, w: 402, h: 176 },
    // 4.9" display at 187 DPI; the Xi series is 1.39x the original GTN 650's
    // 600x266, matching the published 834x986 of the 750Xi.
    px: { w: 840, h: 372 },
    regions: REGIONS_650XI,
    softKeys: [],
    hasVloc: true,
    art: bezel650XiSvg,
    // Nothing to extract: a touchscreen unit has no faceplate artwork worth
    // lifting, so this drawing is entirely our own.
    bitmap: null,
  },
};

export const DEFAULT_UNIT = 'GNS430';

export const unitFor = (id) => UNITS[id] ?? UNITS[DEFAULT_UNIT];
