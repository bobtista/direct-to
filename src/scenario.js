// Scenarios: a scripted sequence of exchanges with real facilities.
//
// Each step is one thing you say and one reply you get, plus the items you are
// required to read back. Frequencies, runways and field names come from
// data/airports.json, so a scenario at your home field uses the numbers you
// would actually be given.
//
// This is deliberately scripted rather than LLM-driven: it costs nothing, works
// offline, and grades deterministically. An LLM controller is a later upgrade
// for free-form practice, not a prerequisite.

import { SPOKEN, WRITTEN } from './phraseology.js';
import { req } from './grade.js';

/** Pick a plausible active runway from the wind. */
export function activeRunway(airport, windDir) {
  if (!airport.rwy?.length) return null;
  let best = airport.rwy[0];
  let bestDiff = 999;
  for (const r of airport.rwy) {
    const hdg = r.hdg ?? Number(r.id.replace(/[LCR]/, '')) * 10;
    // Angular difference in [0,180]; 0 means the wind is straight down it.
    const diff = Math.abs(((windDir - hdg + 540) % 360) - 180);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

const pad4 = (n) => String(n).padStart(4, '0');

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Initial great-circle bearing from one field to another. */
export function bearing(a, b) {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const POINTS = [
  'north', 'northeast', 'east', 'southeast',
  'south', 'southwest', 'west', 'northwest',
];

/** "southeast" — the direction of flight you give Ground. */
export const compassPoint = (brg) => POINTS[Math.round(((brg % 360) / 45)) % 8];

/**
 * What Tower adds to a takeoff clearance.
 *
 * A VFR departure at a Class D normally comes with a turn: the controller needs
 * to know which way you are going and approves it. Straight-ish courses get a
 * straight-out departure instead.
 */
export function departureTurn(runwayHdg, courseBrg) {
  const delta = ((courseBrg - runwayHdg + 540) % 360) - 180; // -180..180
  if (Math.abs(delta) <= 30) return { turn: 'straight', phrase: 'straight out departure approved' };
  return delta < 0
    ? { turn: 'left', phrase: 'left turn approved' }
    : { turn: 'right', phrase: 'right turn approved' };
}

/**
 * Departing a towered field and picking up VFR flight following.
 *
 * @param {{home: object, dest: object, ac: object, wx: object}} setup
 */
export function departureWithFlightFollowing({ home, dest, ac, wx }) {
  const ctx = {
    home,
    dest,
    ac,
    wx,
    rwy: activeRunway(home, wx.windDir)?.id ?? '35',
    field: home.spoken,
    gnd: home.freq.ground?.mhz ?? home.freq.tower?.mhz,
    twr: home.freq.tower?.mhz,
    dep: (home.freq.departure ?? home.freq.approach)?.mhz,
    depName: depFacilityName(home),
    code: pad4(4600 + Math.floor(Math.random() * 99)),
    cruise: 4500,
  };
  ctx.next = nextFreq(dest, ctx.dep);
  ctx.course = Math.round(bearing(home, dest));
  ctx.direction = compassPoint(ctx.course);
  const rwyHdg =
    activeRunway(home, wx.windDir)?.hdg ?? Number(String(ctx.rwy).replace(/[LCR]/, '')) * 10;
  ctx.departure = departureTurn(rwyHdg, ctx.course);

  // Build the same script twice: once as it sounds, once as it reads.
  const spoken = buildSteps(SPOKEN, ctx);
  const written = buildSteps(WRITTEN, ctx);

  const steps = spoken
    .map((s, i) => ({
      ...s,
      // What the screen shows; `speech` is what the radio says.
      reply: written[i].reply,
      example: written[i].example,
      replySpeech: s.reply,
      exampleSpeech: s.example,
      prompt: written[i].prompt,
    }))
    .filter((s) => s.freq);

  return {
    id: 'departure-flight-following',
    title: `${home.id} departure to ${dest.id} with flight following`,
    home,
    dest,
    ac,
    wx,
    rwy: ctx.rwy,
    squawk: ctx.code,
    steps,
  };
}

/**
 * The script, in terms of a renderer.
 *
 * @param {typeof import('./phraseology.js').SPOKEN} r
 */
function buildSteps(r, ctx) {
  const { home, dest, ac, wx, rwy, field, gnd, twr, dep, depName, code, cruise, next,
    direction, departure } = ctx;
  const full = r.callsign(ac);
  const abbr = r.callsign(ac, { abbreviated: true });

  return [
    {
      id: 'ground',
      facility: `${field} Ground`,
      freq: gnd,
      prompt: `Call ${field} Ground for taxi. You are at the ramp with information ${r.atis(wx.atis)}, ${r.vfr} to ${dest.spoken} — ${direction}bound. Ground wants your direction of flight.`,
      example: `${field} Ground, ${full}, at the ramp with information ${r.atis(wx.atis)}, ${r.vfr} to ${dest.spoken}, ${direction}bound, request taxi.`,
      reply: `${abbr}, ${field} Ground, runway ${r.runway(rwy)}, taxi via alpha, hold short of runway ${r.runway(rwy)}.`,
      requires: [req.runway(rwy), req.holdShort(rwy)],
    },
    {
      id: 'tower',
      facility: `${field} Tower`,
      freq: twr,
      prompt: `Holding short of runway ${r.runway(rwy)}. Call Tower, ready for departure.`,
      example: `${field} Tower, ${abbr}, holding short runway ${r.runway(rwy)}, ready for departure.`,
      reply: `${abbr}, ${field} Tower, wind ${r.wind({ dir: wx.windDir, kt: wx.windKt })}, runway ${r.runway(rwy)}, ${departure.phrase}, cleared for takeoff.`,
      requires: [
        req.runway(rwy),
        { key: 'clearedTakeoff', value: 'cleared for takeoff', label: 'cleared for takeoff', critical: true },
        departure.turn === 'straight'
          ? { key: 'departure', value: 'straight out', label: 'straight out departure', critical: false }
          : {
              key: 'departure',
              value: `${departure.turn} turn`,
              label: `${departure.turn} turn approved`,
              critical: true,
            },
      ],
    },
    {
      id: 'tower-handoff',
      facility: `${field} Tower`,
      freq: twr,
      prompt: 'Off the ground and clear of the pattern. Tower sends you on your way.',
      example: null,
      reply: `${abbr}, contact ${depName} on ${r.frequency(dep)}, good day.`,
      requires: [req.frequency(dep)],
      controllerFirst: true,
    },
    {
      id: 'approach',
      facility: depName,
      freq: dep,
      prompt: `Now on ${r.frequency(dep)}. Call ${depName}: who you are, where you are, and what you want. Altitude belongs here, not on the ground.`,
      example: `${depName}, ${full}, off ${field}, climbing through ${r.altitude(1500)}, request flight following to ${dest.spoken} at ${r.altitude(cruise)}.`,
      reply: `${full}, ${depName}, squawk ${r.squawk(code)} and ident.`,
      requires: [req.squawk(code)],
    },
    {
      id: 'radar-contact',
      facility: depName,
      freq: dep,
      prompt: 'Squawk set and identing. Wait for radar contact.',
      example: null,
      reply: `${abbr}, radar contact ${r.digits('2')} miles south of ${field}, maintain ${r.vfr}, altimeter ${r.altimeter(wx.altimeter)}.`,
      requires: [],
      controllerFirst: true,
    },
    {
      id: 'traffic',
      facility: depName,
      freq: dep,
      prompt: 'Traffic call. Acknowledge it properly.',
      example: `Looking for traffic, ${abbr}.`,
      reply: `${abbr}, traffic ten o'clock, three miles, northbound, altitude indicates ${r.altitude(2500)}.`,
      requires: [],
      controllerFirst: true,
      note: 'Say "traffic in sight" or "looking" — never just "roger".',
    },
    {
      id: 'handoff',
      facility: depName,
      freq: dep,
      prompt: 'Handoff to the next sector. Read it back.',
      example: null,
      reply: `${abbr}, contact ${dest.spoken} Approach on ${r.frequency(next)}, good day.`,
      requires: [req.frequency(next)],
      controllerFirst: true,
    },
  ];
}

/** Whatever the departure facility is called on the radio. */
function depFacilityName(airport) {
  const label = (airport.freq.departure ?? airport.freq.approach)?.label ?? '';
  const m = /^([A-Z][A-Za-z ]+?)\s+(APP|DEP|APP\/DEP)/.exec(label.trim());
  if (m) return `${title(m[1])} Approach`;
  return `${airport.spoken} Approach`;
}

function nextFreq(dest, fallback) {
  return (dest.freq.approach ?? dest.freq.tower ?? { mhz: fallback }).mhz;
}

const title = (s) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();

/** Plausible weather, so the numbers change between runs. */
export function randomWx() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return {
    windDir: Math.floor(Math.random() * 36) * 10,
    windKt: 3 + Math.floor(Math.random() * 12),
    altimeter: (29.7 + Math.random() * 0.5).toFixed(2),
    atis: letters[Math.floor(Math.random() * 26)],
  };
}
