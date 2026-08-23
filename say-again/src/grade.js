// Grading a readback.
//
// The point of the app: not "did you say something", but "did you read back the
// items you are required to read back". AIM 4-4-7 and the .65 make some items
// mandatory — runway assignments, hold short instructions, altitude and heading
// assignments, frequency changes — and those are graded as critical. Everything
// else is a nicety.
//
// No DOM, so it runs under plain node.

import { contains, normalize, soundsLikeCallsign } from './phraseology.js';

/**
 * Is this just a callup — "Boston Approach, Skyhawk 725SP" — rather than a
 * request?
 *
 * On a busy frequency you check in first and wait for "go ahead" before using
 * up airtime with the whole request. Grading that as a failed readback is both
 * wrong and discouraging, so it gets recognised as its own move.
 */
const CONTENT_WORDS =
  /\b(squawk|ident|runway|hold|holding|short|cleared|clear|contact|maintain|climb|climbing|descend|descending|turn|heading|request|requesting|with|information|altimeter|traffic|taxi|ready|departure|departing|landing|land|inbound|miles|mile|radar|transit|following|downwind|base|final|crosswind|midfield|pattern|straight|approved|roger|wilco|negative|affirm|point|decimal|remaining|entering|position|advise)\b/;

/** Words that name a facility rather than say anything. */
const FACILITY_WORDS =
  /\b(ground|tower|approach|departure|clearance|delivery|center|centre|radio|unicom|ctaf|control)\b/g;

export function isCallup(said, { facility = '', tail = '' } = {}) {
  // Any instruction or request word means this is real content, not a callup.
  // "squawk 4680, 5SP" strips down to almost nothing but is clearly a readback.
  if (CONTENT_WORDS.test(String(said).toLowerCase())) return false;

  let rest = ` ${String(said).toLowerCase()} `;
  // Strip the two things every callup contains: who you are calling, and who
  // you are. Whatever is left is the actual content.
  for (const word of facility.toLowerCase().split(/\s+/).filter(Boolean)) {
    rest = rest.replaceAll(word, ' ');
  }
  rest = rest
    .replace(FACILITY_WORDS, ' ')
    .replace(/\b(november|skyhawk|warrior|cessna|cirrus|piper|arrow|bonanza|diamond|skylane)\b/g, ' ')
    .replace(/[a-z]?\d[\d\s]*[a-z]{0,2}/g, ' ') // the tail number, spoken or written
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|niner|nine|tree|fower|fife)\b/g, ' ')
    .replace(/\b(alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india|juliet|juliett|kilo|lima|mike|oscar|papa|quebec|romeo|sierra|tango|uniform|victor|whiskey|xray|yankee|zulu)\b/g, ' ')
    .replace(/\b(good\s+(morning|afternoon|evening)|hello|hi|sir|maam)\b/g, ' ')
    .replace(/[^a-z]/g, ' ')
    .trim();
  // Whatever survives is the airport or facility name, which a callup may name.
  return rest.split(/\s+/).filter(Boolean).length <= 2;
}

/** Habits that mark a pilot out as sloppy on frequency. */
const BAD_HABITS = [
  {
    id: 'roger-instead-of-readback',
    test: (said, req, ctx) =>
      ctx?.mode !== 'announce' &&
      /\broger\b/.test(said.toLowerCase()) &&
      req.some((r) => r.critical),
    note: '"Roger" does not substitute for a required readback.',
  },
  {
    id: 'filler',
    test: (said) => /\b(um+|uh+|er+|like|you know)\b/i.test(said),
    note: 'Filler words. Compose the transmission before keying the mic.',
  },
  {
    id: 'with-you',
    test: (said) => /\bwith you\b/i.test(said),
    note: '"With you" is chatter — the controller knows you are there.',
  },
  {
    id: 'any-traffic-please-advise',
    test: (said) => /any (other )?traffic please advise/i.test(said),
    note: 'The AIM specifically discourages "any traffic please advise".',
  },
  {
    id: 'no-callsign',
    // Lenient on purpose: browser speech recognition mangles the phonetic
    // alphabet, and failing a correct call because "papa" came back as "pop"
    // teaches nothing.
    test: (said, req, ctx) => ctx?.tail && !soundsLikeCallsign(said, ctx.tail),
    note: 'Every transmission ends with your callsign.',
  },
];

/**
 * @typedef {{key: string, value: string, label: string, critical?: boolean}} Requirement
 *
 * @param {string} said        what the pilot transmitted
 * @param {Requirement[]} required
 * @param {{tail?: string}} ctx
 */
export function grade(said, required = [], ctx = {}) {
  // Untowered calls are announcements, not readbacks; saying "readback" there
  // is just confusing.
  const mode = ctx.mode === 'announce' ? 'announce' : 'readback';
  const heard = normalize(said);
  // A requirement may list several acceptable forms; any one of them counts.
  const items = required.map((r) => ({
    ...r,
    ok: [].concat(r.value).some((v) => contains(said, v)),
  }));

  const missed = items.filter((i) => !i.ok);
  const missedCritical = missed.filter((i) => i.critical);

  const habits = BAD_HABITS.filter((h) => {
    try {
      return h.test(said, required, ctx);
    } catch {
      return false;
    }
  }).map((h) => ({ id: h.id, note: h.note }));

  // A readback is correct when every mandatory item is present. Habits are
  // reported but do not fail it.
  const pass = missedCritical.length === 0 && missed.length === 0;

  return {
    pass,
    safe: missedCritical.length === 0,
    heard,
    items,
    missed,
    missedCritical,
    habits,
    summary: summarise({ pass, missed, missedCritical, habits, mode }),
  };
}

function summarise({ pass, missed, missedCritical, habits, mode = 'readback' }) {
  const announce = mode === 'announce';
  if (pass && !habits.length) return announce ? 'Good call.' : 'Good readback.';
  const parts = [];
  if (missedCritical.length) {
    const label = missedCritical.map((m) => m.label).join(', ');
    parts.push(announce ? `Your call is missing: ${label}.` : `Missing required readback: ${label}.`);
  }
  const soft = missed.filter((m) => !m.critical);
  if (soft.length) {
    const label = soft.map((m) => m.label).join(', ');
    parts.push(announce ? `Also worth including: ${label}.` : `Also worth reading back: ${label}.`);
  }
  if (pass && habits.length) parts.push(announce ? 'Call complete, but:' : 'Readback complete, but:');
  for (const h of habits) parts.push(h.note);
  return parts.join(' ');
}

// --- requirement builders ---------------------------------------------------
//
// Small helpers so a scenario can declare what it expects without repeating the
// "is this mandatory" judgement each time.

/** Every written shape an altitude readback might legitimately take. */
export function altitudeForms(ft) {
  const n = Math.round(ft);
  const forms = [String(n)];
  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    const hundreds = Math.round((n % 1000) / 100);
    forms.push(`${thousands}thousand${hundreds ? `${hundreds}hundred` : ''}`);
  } else if (n >= 100) {
    forms.push(`${Math.round(n / 100)}hundred`);
  }
  return forms;
}

export const req = {
  runway: (rwy) => ({ key: 'runway', value: rwy, label: `runway ${rwy}`, critical: true }),
  holdShort: (rwy) => ({
    key: 'holdShort',
    value: 'hold short',
    label: `hold short of runway ${rwy}`,
    critical: true,
  }),
  altitude: (ft) => ({
    key: 'altitude',
    // "three thousand five hundred", "3500" and "three five zero zero" all
    // count. Matching on the leading digit alone would pass any readback that
    // merely contained that digit somewhere.
    value: altitudeForms(ft),
    label: `${ft} ft`,
    critical: true,
  }),
  heading: (deg) => ({
    key: 'heading',
    value: String(deg).padStart(3, '0'),
    label: `heading ${String(deg).padStart(3, '0')}`,
    critical: true,
  }),
  squawk: (code) => ({ key: 'squawk', value: String(code), label: `squawk ${code}`, critical: true }),
  frequency: (mhz) => ({
    key: 'frequency',
    value: String(mhz),
    label: `frequency ${mhz}`,
    critical: true,
  }),
  altimeter: (inHg) => ({
    key: 'altimeter',
    value: String(inHg).replace('.', ''),
    label: `altimeter ${inHg}`,
    critical: false,
  }),
  taxiway: (id) => ({ key: 'taxiway', value: id, label: `taxiway ${id}`, critical: false }),
};
