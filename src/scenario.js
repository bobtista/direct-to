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
  const { home, dest, ac, wx, rwy, field, gnd, twr, dep, depName, code, cruise, next } = ctx;
  const full = r.callsign(ac);
  const abbr = r.callsign(ac, { abbreviated: true });

  return [
    {
      id: 'ground',
      facility: `${field} Ground`,
      freq: gnd,
      prompt: `Call ${field} Ground for taxi. You are at the ramp with ATIS ${wx.atis}, ${r.vfr} to ${dest.spoken}.`,
      example: `${field} Ground, ${full}, at the ramp with ${wx.atis}, ${r.vfr} to ${dest.spoken}, request taxi.`,
      reply: `${abbr}, ${field} Ground, runway ${r.runway(rwy)}, taxi via alpha, hold short of runway ${r.runway(rwy)}.`,
      requires: [req.runway(rwy), req.holdShort(rwy)],
    },
    {
      id: 'tower',
      facility: `${field} Tower`,
      freq: twr,
      prompt: `Holding short of runway ${r.runway(rwy)}. Call Tower, ready for departure.`,
      example: `${field} Tower, ${abbr}, holding short runway ${r.runway(rwy)}, ready for departure.`,
      reply: `${abbr}, ${field} Tower, wind ${r.wind({ dir: wx.windDir, kt: wx.windKt })}, runway ${r.runway(rwy)}, cleared for takeoff.`,
      requires: [
        req.runway(rwy),
        { key: 'clearedTakeoff', value: 'cleared for takeoff', label: 'cleared for takeoff', critical: true },
      ],
    },
    {
      id: 'approach',
      facility: depName,
      freq: dep,
      prompt: `Airborne and clear of the pattern. Call ${depName} for flight following to ${dest.spoken}, requesting ${r.altitude(cruise)}.`,
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
