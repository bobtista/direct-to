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

import * as p from './phraseology.js';
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
  const rwy = activeRunway(home, wx.windDir)?.id ?? '35';
  const field = home.spoken;
  const gnd = home.freq.ground?.mhz ?? home.freq.tower?.mhz;
  const twr = home.freq.tower?.mhz;
  const dep = (home.freq.departure ?? home.freq.approach)?.mhz;
  const depName = depFacilityName(home);
  const code = pad4(4600 + Math.floor(Math.random() * 99));
  const cruise = 4500;

  const full = p.callsign(ac);
  const abbr = p.callsign(ac, { abbreviated: true });

  const steps = [
    {
      id: 'ground',
      facility: `${field} Ground`,
      freq: gnd,
      prompt: `Call ${field} Ground for taxi. You are at the ramp with ATIS ${wx.atis}, VFR to ${dest.spoken}.`,
      example: `${field} Ground, ${full}, at the ramp with ${wx.atis}, V-F-R to ${dest.spoken}, request taxi.`,
      reply: `${abbr}, ${field} Ground, runway ${p.runway(rwy)}, taxi via alpha, hold short of runway ${p.runway(rwy)}.`,
      requires: [req.runway(rwy), req.holdShort(rwy)],
    },
    {
      id: 'tower',
      facility: `${field} Tower`,
      freq: twr,
      prompt: `Holding short of runway ${rwy}. Call Tower, ready for departure.`,
      example: `${field} Tower, ${abbr}, holding short runway ${p.runway(rwy)}, ready for departure.`,
      reply: `${abbr}, ${field} Tower, wind ${p.wind({ dir: wx.windDir, kt: wx.windKt })}, runway ${p.runway(rwy)}, cleared for takeoff.`,
      requires: [req.runway(rwy), { key: 'clearedTakeoff', value: 'cleared for takeoff', label: 'cleared for takeoff', critical: true }],
    },
    {
      id: 'approach',
      facility: depName,
      freq: dep,
      prompt: `Airborne and clear of the pattern. Call ${depName} for flight following to ${dest.spoken}, requesting ${cruise}.`,
      example: `${depName}, ${full}, off ${field}, climbing through one thousand five hundred, request flight following to ${dest.spoken} at ${p.altitude(cruise)}.`,
      reply: `${full}, ${depName}, squawk ${p.squawk(code)} and ident.`,
      requires: [req.squawk(code)],
    },
    {
      id: 'radar-contact',
      facility: depName,
      freq: dep,
      prompt: 'Squawk set and identing. Wait for radar contact.',
      example: null, // nothing to say; the controller speaks first
      reply: `${abbr}, radar contact ${p.digits('2')} miles south of ${field}, maintain V-F-R, altimeter ${p.altimeter(wx.altimeter)}.`,
      requires: [],
      controllerFirst: true,
    },
    {
      id: 'traffic',
      facility: depName,
      freq: dep,
      prompt: 'Traffic call. Acknowledge it properly.',
      example: `Looking for traffic, ${abbr}.`,
      reply: `${abbr}, traffic ten o'clock, three miles, northbound, altitude indicates ${p.altitude(2500)}.`,
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
      reply: `${abbr}, contact ${dest.spoken} Approach on ${p.frequency(nextFreq(dest, dep))}, good day.`,
      requires: [req.frequency(nextFreq(dest, dep))],
      controllerFirst: true,
    },
  ];

  return {
    id: 'departure-flight-following',
    title: `${home.id} departure to ${dest.id} with flight following`,
    home,
    dest,
    ac,
    wx,
    rwy,
    squawk: code,
    steps: steps.filter((s) => s.freq),
  };
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
