// Scenarios: scripted exchanges with real facilities.
//
// Frequencies, runways and field names come from data/airports.json, so a
// scenario at your home field uses the numbers you would actually be given.
//
// Every step carries four things:
//   prompt    what the situation is
//   example   the model call, written the way you would note it down
//   reply     what the controller says back (absent when nobody answers)
//   why       what is required here and the reason, for the Peek panel
//
// Steps come in two modes. A `readback` step grades what you say *after* the
// controller speaks. An `announce` step grades the call itself — that is what
// untowered flying is, since nobody replies.
//
// Scripted rather than LLM-driven on purpose: it costs nothing, works offline
// and grades the same way twice.

import { SPOKEN, WRITTEN } from './phraseology.js';
import { req } from './grade.js';

// --- geometry ---------------------------------------------------------------

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

const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** "southeast" — the direction of flight you give Ground. */
export const compassPoint = (brg) => POINTS[Math.round((brg % 360) / 45) % 8];

/** Great-circle distance, near enough over the ranges a scenario covers. */
export function distanceNm(a, b) {
  const dLat = (b.lat - a.lat) * 60;
  const dLon = (b.lon - a.lon) * 60 * Math.cos(rad((a.lat + b.lat) / 2));
  return Math.hypot(dLat, dLon);
}

/**
 * Where you end up `nm` along `brg` from a point.
 *
 * Used to put the aeroplane where each step says it is, so the box agrees with
 * the words: "five miles southeast of Norwood" and the GPS should not disagree.
 */
export function project(from, brg, nm) {
  const lat = from.lat + (nm / 60) * Math.cos(rad(brg));
  const lon =
    from.lon + ((nm / 60) * Math.sin(rad(brg))) / Math.max(0.05, Math.cos(rad(from.lat)));
  return { lat, lon };
}

/** Pick a plausible active runway from the wind. */
export function activeRunway(airport, windDir) {
  if (!airport.rwy?.length) return null;
  let best = airport.rwy[0];
  let bestDiff = 999;
  for (const r of airport.rwy) {
    const hdg = r.hdg ?? Number(String(r.id).replace(/[LCR]/, '')) * 10;
    // Angular difference in [0,180]; 0 means the wind is straight down it.
    const diff = Math.abs(((windDir - hdg + 540) % 360) - 180);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

/**
 * What Tower adds to a takeoff clearance. A VFR departure normally comes with
 * a turn: the controller needs to know which way you are going and approves it.
 */
export function departureTurn(runwayHdg, courseBrg) {
  const delta = ((courseBrg - runwayHdg + 540) % 360) - 180;
  if (Math.abs(delta) <= 30) return { turn: 'straight', phrase: 'straight out departure approved' };
  return delta < 0
    ? { turn: 'left', phrase: 'left turn approved' }
    : { turn: 'right', phrase: 'right turn approved' };
}

/** Which way you turn onto downwind. Most fields are left traffic. */
export const patternSide = () => 'left';

const pad4 = (n) => String(n).padStart(4, '0');

// --- shared context ---------------------------------------------------------

function contextFor({ home, dest, ac, wx }) {
  const rwyObj = activeRunway(home, wx.windDir);
  const rwy = rwyObj?.id ?? '35';
  const rwyHdg = rwyObj?.hdg ?? Number(String(rwy).replace(/[LCR]/, '')) * 10;
  const course = dest ? Math.round(bearing(home, dest)) : rwyHdg;
  return {
    home,
    dest,
    ac,
    wx,
    rwy,
    rwyHdg,
    course,
    direction: compassPoint(course),
    departure: departureTurn(rwyHdg, course),
    field: home.spoken,
    gnd: home.freq.ground?.mhz ?? home.freq.tower?.mhz,
    twr: home.freq.tower?.mhz,
    clr: home.freq.clearance?.mhz,
    dep: (home.freq.departure ?? home.freq.approach)?.mhz,
    ctaf: home.freq.ctaf?.mhz ?? home.freq.tower?.mhz,
    depName: facilityName(home),
    code: pad4(4600 + Math.floor(Math.random() * 99)),
    cruise: 4500,
  };
}

/** Whatever the radar facility is called on the radio. */
function facilityName(airport) {
  const label = (airport.freq.departure ?? airport.freq.approach)?.label ?? '';
  const m = /^([A-Z][A-Za-z ]+?)\s+(APP|DEP|APP\/DEP)/.exec(label.trim());
  if (m) return `${titleCase(m[1])} Approach`;
  return `${airport.spoken} Approach`;
}

const titleCase = (s) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();

/** Build a script twice — as it sounds, and as it reads — and merge them. */
function render(build, ctx) {
  const spoken = build(SPOKEN, ctx);
  const written = build(WRITTEN, ctx);
  return spoken
    .map((s, i) => ({
      ...s,
      // A step with no example call is one the controller opens. Deriving it
      // beats a hand-set flag that can drift away from the script.
      controllerFirst: s.mode === 'readback' && !s.example,
      reply: written[i].reply,
      example: written[i].example,
      prompt: written[i].prompt,
      readback: written[i].readback,
      replySpeech: s.reply,
      exampleSpeech: s.example,
    }))
    .filter((s) => s.freq);
}

// --- towered departure with flight following --------------------------------

function departureSteps(r, ctx) {
  const { home, dest, ac, wx, rwy, rwyHdg, course, field, gnd, twr, dep, depName, code, cruise, direction, departure } = ctx;
  // Where the aeroplane is at each stage, so the GPS agrees with the words.
  const onField = { lat: home.lat, lon: home.lon, trk: rwyHdg };
  const enRoute = (nm) => ({ ...project(home, course, nm), trk: course });
  const legNm = distanceNm(home, dest);
  const full = r.callsign(ac);
  const abbr = r.callsign(ac, { abbreviated: true });
  const next = (dest.freq.approach ?? dest.freq.tower ?? { mhz: dep }).mhz;

  return [
    {
      id: 'ground',
      where: onField,
      mode: 'readback',
      facility: `${field} Ground`,
      freq: gnd,
      prompt: `At the ramp with information ${r.atis(wx.atis)}, VFR to ${dest.spoken} — ${direction}bound. Call Ground for taxi.`,
      example: `${field} Ground, ${full}, at the ramp with information ${r.atis(wx.atis)}, ${r.vfr} to ${dest.spoken}, ${direction}bound, request taxi.`,
      reply: `${abbr}, ${field} Ground, runway ${r.runway(rwy)}, taxi via alpha, hold short of runway ${r.runway(rwy)}.`,
      readback: `Runway ${r.runway(rwy)}, taxi via alpha, hold short of runway ${r.runway(rwy)}, ${abbr}.`,
      requires: [req.runway(rwy), req.holdShort(rwy)],
      why:
        'Ground wants who you are, where you are on the field, that you have the ATIS, and where you are going. ' +
        'Hold short instructions and runway assignments are mandatory readbacks (AIM 4-4-7) — a missed hold short is how runway incursions start.',
    },
    {
      id: 'tower',
      where: onField,
      mode: 'readback',
      facility: `${field} Tower`,
      freq: twr,
      prompt: `Holding short of runway ${r.runway(rwy)}, run-up complete. Call Tower.`,
      example: `${field} Tower, ${abbr}, holding short runway ${r.runway(rwy)}, ready for departure.`,
      reply: `${abbr}, ${field} Tower, wind ${r.wind({ dir: wx.windDir, kt: wx.windKt })}, runway ${r.runway(rwy)}, ${departure.phrase}, cleared for takeoff.`,
      readback: `Runway ${r.runway(rwy)}, ${departure.phrase}, cleared for takeoff, ${abbr}.`,
      requires: [
        req.runway(rwy),
        { key: 'clearedTakeoff', value: 'cleared for takeoff', label: 'cleared for takeoff', critical: true },
        departure.turn === 'straight'
          ? { key: 'departure', value: 'straight out', label: 'straight out departure', critical: false }
          : { key: 'departure', value: `${departure.turn} turn`, label: `${departure.turn} turn approved`, critical: true },
      ],
      why:
        'Tower is telling you three things: the runway, which way you may turn, and that you are cleared. ' +
        'All three come back. The turn is a control instruction, so it is not optional.',
    },
    {
      id: 'tower-handoff',
      where: enRoute(3),
      mode: 'readback',
      facility: `${field} Tower`,
      freq: twr,
      prompt: 'Airborne and clear of the pattern. Tower sends you on your way.',
      example: null,
      reply: `${abbr}, contact ${depName} on ${r.frequency(dep)}, good day.`,
      readback: `${r.frequency(dep)}, ${abbr}.`,
      requires: [req.frequency(dep)],
      why: 'Every frequency change is read back, so both of you know you went to the right place.',
    },
    {
      id: 'approach',
      where: enRoute(5),
      mode: 'readback',
      facility: depName,
      freq: dep,
      prompt: `Now on ${r.frequency(dep)}. Call ${depName} and ask for flight following. Altitude belongs here, not on the ground.`,
      example: `${depName}, ${full}, ${r.digits('5')} miles ${direction} of ${field}, climbing through ${r.altitude(2000)}, en route ${dest.spoken}, requesting flight following at ${r.altitude(cruise)}.`,
      reply: `${full}, ${depName}, squawk ${r.squawk(code)} and ident.`,
      readback: `Squawk ${r.squawk(code)}, ${abbr}.`,
      requires: [req.squawk(code)],
      why:
        'Your CFI sheet is the template: callsign, distance and direction from a known field, altitude, destination, then the request. ' +
        'On a busy frequency you may check in with just the facility and your callsign and wait for "go ahead" — that works here too.',
    },
    {
      id: 'radar-contact',
      where: enRoute(6),
      mode: 'readback',
      facility: depName,
      freq: dep,
      prompt: 'Squawk set and identing. Wait for radar contact.',
      example: null,
      reply: `${abbr}, radar contact ${r.digits('6')} miles ${direction} of ${field}, maintain ${r.vfr}, altimeter ${r.altimeter(wx.altimeter)}.`,
      readback: `${abbr}.`,
      requires: [],
      why:
        '"Radar contact" means they see you and you are getting advisories. It is not a clearance and it does not mean you may enter Class B. ' +
        'Acknowledging with your callsign is enough.',
    },
    {
      id: 'traffic',
      where: enRoute(Math.min(12, legNm * 0.5)),
      mode: 'readback',
      facility: depName,
      freq: dep,
      prompt: 'A traffic call. Acknowledge it properly.',
      example: null,
      reply: `${abbr}, traffic ten o'clock, three miles, northbound, altitude indicates ${r.altitude(2500)}.`,
      readback: `Looking for traffic, ${abbr}.`,
      requires: [],
      note: 'Say "traffic in sight" or "looking" — never just "roger".',
      why:
        'A traffic call needs a real answer: "traffic in sight" or "negative contact, looking". ' +
        '"Roger" tells the controller nothing about whether you found it.',
    },
    {
      id: 'handoff',
      where: enRoute(Math.min(25, legNm * 0.8)),
      mode: 'readback',
      facility: depName,
      freq: dep,
      prompt: 'Handoff to the next sector.',
      example: null,
      reply: `${abbr}, contact ${dest.spoken} Approach on ${r.frequency(next)}, good day.`,
      readback: `${r.frequency(next)}, ${abbr}.`,
      requires: [req.frequency(next)],
      why: 'Read back the frequency. If you never check in on the new one, nobody is watching you.',
    },
  ];
}

// --- untowered: nobody answers ----------------------------------------------

function untoweredSteps(r, ctx) {
  const { home, ac, wx, rwy, rwyHdg, course, field, ctaf, direction } = ctx;
  const full = r.callsign(ac);
  const side = patternSide();
  const bookend = `${field} traffic`;

  const onField = { lat: home.lat, lon: home.lon, trk: rwyHdg };
  // The pattern legs sit a mile or two off the field, on the runway heading.
  const offField = (nm, brg = course) => ({ ...project(home, brg, nm), trk: brg });

  const announce = (id, where, prompt, example, requires, why, note) => ({
    id,
    where,
    mode: 'announce',
    facility: `${field} CTAF`,
    freq: ctaf,
    prompt,
    example,
    reply: null,
    readback: example,
    requires,
    why,
    note,
  });

  return [
    announce(
      'taxi',
      onField,
      `Ramp to the run-up area, runway ${r.runway(rwy)} in use. Nobody will answer — announce anyway.`,
      `${bookend}, ${full}, taxiing to runway ${r.runway(rwy)}, ${field}.`,
      [
        { key: 'field', value: field, label: `the field name, "${field}"`, critical: true },
        req.runway(rwy),
      ],
      'Bookend every call with the field name — first word and last. On a shared CTAF the other pilot needs to know which airport you are at before they process anything else.'
    ),
    announce(
      'departing',
      onField,
      `Run-up complete, holding short of ${r.runway(rwy)}. Announce departure and your intention.`,
      `${bookend}, ${full}, departing runway ${r.runway(rwy)}, ${side} closed traffic, ${field}.`,
      [
        { key: 'field', value: field, label: `the field name, "${field}"`, critical: true },
        req.runway(rwy),
        { key: 'intent', value: 'traffic', label: 'your intention after departure', critical: false },
      ],
      'Say what you are doing next, not just that you are departing: staying in the pattern, or leaving and in which direction. That is the part other traffic needs.'
    ),
    announce(
      'departing-pattern',
      offField(4),
      'Off and climbing. Announce leaving the pattern.',
      `${bookend}, ${full}, departing the pattern to the ${direction}, ${field}.`,
      [
        { key: 'field', value: field, label: `the field name, "${field}"`, critical: true },
        { key: 'direction', value: direction, label: 'the direction you are leaving in', critical: true },
      ],
      'The last call at the field. Direction matters because it tells inbound traffic where you will not be.'
    ),
    announce(
      'inbound',
      offField(10),
      'Returning. First inbound call — about ten miles out.',
      `${bookend}, ${full}, ${r.digits('10')} miles ${direction}, inbound for landing, ${field}.`,
      [
        { key: 'field', value: field, label: `the field name, "${field}"`, critical: true },
        { key: 'distance', value: '10', label: 'your distance', critical: true },
        { key: 'direction', value: direction, label: 'your direction from the field', critical: true },
      ],
      'The AIM suggests around ten miles for the first call. Distance and direction let everyone build a picture of where you are without seeing you.'
    ),
    announce(
      'overfly',
      offField(5),
      `Five miles out. You plan to overfly midfield and teardrop onto the ${side} downwind for ${r.runway(rwy)}.`,
      `${bookend}, ${full}, ${r.digits('5')} miles ${direction}, will overfly midfield and join ${side} downwind runway ${r.runway(rwy)}, ${field}.`,
      [
        { key: 'field', value: field, label: `the field name, "${field}"`, critical: true },
        req.runway(rwy),
        { key: 'intent', value: 'downwind', label: 'how you will join the pattern', critical: true },
      ],
      'State how you are joining, not just that you are arriving. "Overfly midfield and teardrop" is a very different track from a straight-in, and the difference is what keeps you apart.'
    ),
    announce(
      'downwind',
      offField(1.5, (rwyHdg + 90) % 360),
      `Established ${side} downwind for ${r.runway(rwy)}.`,
      `${bookend}, ${full}, ${side} downwind runway ${r.runway(rwy)}, ${field}.`,
      [
        { key: 'field', value: field, label: `the field name, "${field}"`, critical: true },
        req.runway(rwy),
        { key: 'leg', value: 'downwind', label: 'which leg you are on', critical: true },
      ],
      'Pattern legs are announced as you turn onto them: downwind, base, final. Short and frequent beats long and occasional.'
    ),
    announce(
      'final',
      offField(2, (rwyHdg + 180) % 360),
      `Turning final for ${r.runway(rwy)}.`,
      `${bookend}, ${full}, ${side} base to final runway ${r.runway(rwy)}, ${field}.`,
      [
        { key: 'field', value: field, label: `the field name, "${field}"`, critical: true },
        req.runway(rwy),
        { key: 'leg', value: 'final', label: 'that you are on final', critical: true },
      ],
      'The call anyone holding short is listening for. Never add "any traffic please advise" — the AIM specifically discourages it.'
    ),
    announce(
      'clear',
      onField,
      'Down and clear of the runway.',
      `${bookend}, ${full}, clear of runway ${r.runway(rwy)}, ${field}.`,
      [
        { key: 'field', value: field, label: `the field name, "${field}"`, critical: true },
        { key: 'clear', value: 'clear', label: 'that you are clear of the runway', critical: true },
      ],
      'Tells the aircraft on final that the runway is theirs. Easy to forget and genuinely useful.'
    ),
  ];
}

// --- Class B transition -----------------------------------------------------

function classBSteps(r, ctx) {
  const { home, dest, ac, wx, cruise } = ctx;
  const full = r.callsign(ac);
  const abbr = r.callsign(ac, { abbreviated: true });
  const bravo = ctx.bravo;
  const appName = facilityName(bravo);
  const appFreq = (bravo.freq.approach ?? bravo.freq.departure)?.mhz;
  const dirFromBravo = compassPoint(bearing(bravo, home));
  const code = ctx.code;
  // The transition runs in past the Bravo and out the other side toward the
  // destination, so positions are measured from the Bravo, not from home.
  const inbound = bearing(bravo, home);
  const outbound = bearing(bravo, dest);
  const nearBravo = (nm, brg) => ({ ...project(bravo, brg, nm), trk: (brg + 180) % 360 });

  return [
    {
      id: 'request',
      where: nearBravo(20, inbound),
      mode: 'readback',
      facility: appName,
      freq: appFreq,
      prompt: `Level ${r.altitude(cruise)}, ${r.digits('20')} miles ${dirFromBravo} of ${bravo.spoken}. Ask for a Bravo transition.`,
      example: `${appName}, ${full}, ${r.digits('20')} miles ${dirFromBravo} of ${bravo.spoken} at ${r.altitude(cruise)}, en route ${dest.spoken}, request transition through the Class Bravo.`,
      reply: `${full}, ${appName}, squawk ${r.squawk(code)}, remain clear of the Class Bravo.`,
      readback: `Squawk ${r.squawk(code)}, remain clear of the Bravo, ${abbr}.`,
      requires: [
        req.squawk(code),
        { key: 'remainClear', value: 'remain clear', label: 'remain clear of the Bravo', critical: true },
      ],
      why:
        'This is the single most important difference from Class C or D. Two-way radio contact is NOT permission to enter Class B — ' +
        '"remain clear" means exactly that, and busting the Bravo without a clearance is a certificate action. 14 CFR 91.131.',
    },
    {
      id: 'cleared',
      where: nearBravo(12, inbound),
      mode: 'readback',
      facility: appName,
      freq: appFreq,
      prompt: 'Radar contact. Now wait for the words that actually let you in.',
      example: null,
      reply: `${abbr}, radar contact, cleared into the Class Bravo, maintain ${r.altitude(cruise)}, heading ${r.heading(ctx.course)}.`,
      readback: `Cleared into the Bravo, maintain ${r.altitude(cruise)}, heading ${r.heading(ctx.course)}, ${abbr}.`,
      requires: [
        { key: 'clearedBravo', value: 'cleared into', label: 'cleared into the Class Bravo', critical: true },
        req.altitude(cruise),
        req.heading(ctx.course),
      ],
      why:
        'You may not enter until you hear "cleared into the Class Bravo" — those words, not "radar contact", not "proceed on course". ' +
        'Read them back along with any altitude or heading, because inside the Bravo they are assignments, not suggestions.',
    },
    {
      id: 'altitude-change',
      where: nearBravo(3, inbound),
      mode: 'readback',
      facility: appName,
      freq: appFreq,
      prompt: 'A new altitude for traffic.',
      example: null,
      reply: `${abbr}, descend and maintain ${r.altitude(3500)}.`,
      readback: `Descend and maintain ${r.altitude(3500)}, ${abbr}.`,
      requires: [req.altitude(3500)],
      why: 'Assigned altitudes are mandatory readbacks. Inside Class B you fly what you are given.',
    },
    {
      id: 'leaving',
      where: nearBravo(10, outbound),
      mode: 'readback',
      facility: appName,
      freq: appFreq,
      prompt: 'Clear of the Bravo on the far side.',
      example: null,
      reply: `${abbr}, you are leaving the Class Bravo, resume own navigation, squawk VFR, frequency change approved.`,
      readback: `Own navigation, squawk VFR, ${abbr}.`,
      requires: [
        { key: 'squawkVfr', value: 'squawk vfr', label: 'squawk VFR', critical: false },
        { key: 'ownNav', value: 'own navigation', label: 'resume own navigation', critical: false },
      ],
      why: '"Squawk VFR" means 1200. Once you are out and squawking VFR, the service has ended — you are on your own again.',
    },
  ];
}

// --- public builders --------------------------------------------------------

export function departureWithFlightFollowing({ home, dest, ac, wx }) {
  const ctx = contextFor({ home, dest, ac, wx });
  return {
    id: 'departure',
    title: `${home.id} departure to ${dest.id} with flight following`,
    kind: 'Towered departure',
    home,
    dest,
    ac,
    wx,
    rwy: ctx.rwy,
    squawk: ctx.code,
    steps: render(departureSteps, ctx),
  };
}

export function untoweredPattern({ home, dest, ac, wx }) {
  const ctx = contextFor({ home, dest: dest ?? home, ac, wx });
  return {
    id: 'untowered',
    title: `${home.id} — untowered departure, pattern and return`,
    kind: 'Untowered',
    home,
    dest: dest ?? home,
    ac,
    wx,
    rwy: ctx.rwy,
    squawk: ctx.code,
    steps: render(untoweredSteps, ctx),
  };
}

export function classBTransition({ home, dest, bravo, ac, wx }) {
  const ctx = { ...contextFor({ home, dest, ac, wx }), bravo };
  return {
    id: 'class-b',
    title: `Class Bravo transition through ${bravo.id}`,
    kind: 'Class B transition',
    home,
    dest,
    bravo,
    ac,
    wx,
    rwy: ctx.rwy,
    squawk: ctx.code,
    steps: render(classBSteps, ctx),
  };
}

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
