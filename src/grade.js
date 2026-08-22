// Grading a readback.
//
// The point of the app: not "did you say something", but "did you read back the
// items you are required to read back". AIM 4-4-7 and the .65 make some items
// mandatory — runway assignments, hold short instructions, altitude and heading
// assignments, frequency changes — and those are graded as critical. Everything
// else is a nicety.
//
// No DOM, so it runs under plain node.

import { contains, normalize } from './phraseology.js';

/** Habits that mark a pilot out as sloppy on frequency. */
const BAD_HABITS = [
  {
    id: 'roger-instead-of-readback',
    test: (said, req) =>
      /\broger\b/.test(said.toLowerCase()) && req.some((r) => r.critical),
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
    test: (said, req, ctx) => ctx?.tail && !contains(said, ctx.tail.slice(-3)),
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
    summary: summarise({ pass, missed, missedCritical, habits }),
  };
}

function summarise({ pass, missed, missedCritical, habits }) {
  if (pass && !habits.length) return 'Good readback.';
  const parts = [];
  if (missedCritical.length) {
    parts.push(
      `Missing required readback: ${missedCritical.map((m) => m.label).join(', ')}.`
    );
  }
  const soft = missed.filter((m) => !m.critical);
  if (soft.length) parts.push(`Also worth reading back: ${soft.map((m) => m.label).join(', ')}.`);
  if (pass && habits.length) parts.push('Readback complete, but:');
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
