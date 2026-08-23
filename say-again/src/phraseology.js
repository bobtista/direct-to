// Turning values into what you actually hear on the radio.
//
// Follows FAA phraseology (AIM 4-2-x and the .65): digits spoken individually,
// "niner" for 9, altitudes grouped in thousands and hundreds, frequencies with
// "point", and callsigns abbreviated once the controller has used the short
// form first.
//
// No DOM here, so it can be tested under plain node.

const DIGIT = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'niner',
};

const PHONETIC = {
  A: 'alpha', B: 'bravo', C: 'charlie', D: 'delta', E: 'echo', F: 'foxtrot',
  G: 'golf', H: 'hotel', I: 'india', J: 'juliet', K: 'kilo', L: 'lima',
  M: 'mike', N: 'november', O: 'oscar', P: 'papa', Q: 'quebec', R: 'romeo',
  S: 'sierra', T: 'tango', U: 'uniform', V: 'victor', W: 'whiskey',
  X: 'xray', Y: 'yankee', Z: 'zulu',
};

/** A single letter as its phonetic word: "T" -> "tango". */
export const phonetic = (letter) =>
  PHONETIC[String(letter).toUpperCase()] ?? String(letter).toLowerCase();

/** Each character spoken separately: "725SP" -> "seven two five sierra papa". */
export function digits(value) {
  return [...String(value)]
    .map((c) => DIGIT[c] ?? PHONETIC[c.toUpperCase()] ?? '')
    .filter(Boolean)
    .join(' ');
}

/** A frequency: 124.1 -> "one two four point one". Trailing zeros are dropped. */
export function frequency(mhz) {
  const [whole, frac = ''] = String(Number(mhz).toFixed(3)).split('.');
  const trimmed = frac.replace(/0+$/, '');
  return `${digits(whole)} point ${digits(trimmed || '0')}`;
}

/** A heading is always three digits: 90 -> "zero niner zero". */
export const heading = (deg) => digits(String(Math.round(deg) % 360).padStart(3, '0'));

/** A transponder code, spoken as four separate digits. */
export const squawk = (code) => digits(String(code).padStart(4, '0'));

/**
 * Altitudes are grouped, not spelled out: 3500 -> "three thousand five
 * hundred", 10500 -> "one zero thousand five hundred", 500 -> "five hundred".
 */
export function altitude(ft) {
  const n = Math.round(ft);
  if (n >= 18000) return `flight level ${digits(String(Math.round(n / 100)))}`;
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.round((n % 1000) / 100);
  const parts = [];
  if (thousands >= 10) parts.push(`${digits(String(thousands))} thousand`);
  else if (thousands > 0) parts.push(`${DIGIT[thousands]} thousand`);
  if (hundreds > 0) parts.push(`${DIGIT[hundreds]} hundred`);
  return parts.join(' ') || 'zero';
}

/** Runway 35 -> "three five"; 17L -> "one seven left". */
export function runway(id) {
  const m = /^(\d{1,2})([LCR])?$/.exec(String(id).toUpperCase());
  if (!m) return digits(id);
  const side = { L: 'left', C: 'center', R: 'right' }[m[2]] ?? '';
  return `${digits(m[1].padStart(2, '0'))}${side ? ` ${side}` : ''}`;
}

/** An altimeter setting: 30.12 -> "three zero one two". */
export const altimeter = (inHg) => digits(Number(inHg).toFixed(2).replace('.', ''));

/** Wind: {dir:240, kt:8} -> "two four zero at eight". */
export function wind({ dir, kt, gust }) {
  if (kt === 0) return 'calm';
  const base = `${heading(dir)} at ${digits(String(kt))}`;
  return gust ? `${base} gusting ${digits(String(gust))}` : base;
}

// --- callsigns --------------------------------------------------------------

/** Common GA types, so "N725SP" can be said as "Skyhawk 725SP". */
export const TYPES = {
  C172: 'Skyhawk',
  C182: 'Skylane',
  C152: 'Cessna',
  PA28: 'Warrior',
  PA28R: 'Arrow',
  SR20: 'Cirrus',
  SR22: 'Cirrus',
  DA40: 'Diamond',
  BE36: 'Bonanza',
};

/**
 * How a callsign is spoken.
 *
 * Full form on initial contact ("Skyhawk seven two five sierra papa"), then
 * abbreviated to the last three characters once the controller has used the
 * short form — which is the controller's call to make, not the pilot's.
 *
 * @param {{tail: string, type?: string}} ac
 * @param {{abbreviated?: boolean, withType?: boolean}} opts
 */
export function callsign(ac, { abbreviated = false, withType = true } = {}) {
  const tail = ac.tail.toUpperCase().replace(/^N/, '');
  // Abbreviating drops digits, never the prefix: "Skyhawk 5SP" (AIM 4-2-4).
  const spoken = abbreviated ? tail.slice(-3) : tail;
  const prefix = withType && ac.type && TYPES[ac.type] ? TYPES[ac.type] : 'november';
  return `${prefix} ${digits(spoken)}`.trim();
}

/** The written form for transcripts and grading: "N725SP". */
export const tailOf = (ac) => ac.tail.toUpperCase();

// --- normalising what the pilot said ---------------------------------------

// Only spellings that cannot be ordinary English. Homophones like "to", "for",
// "won" and "ate" were here to catch recogniser slips, but they wrecked plain
// phrases: "cleared for takeoff" became "cleared 4 takeoff" and never matched,
// and "climb to three thousand" became "climb 23 thousand".
const WORD_TO_DIGIT = {
  zero: '0', one: '1', two: '2', three: '3', tree: '3', four: '4', fower: '4',
  five: '5', fife: '5', six: '6', seven: '7', eight: '8', nine: '9', niner: '9',
};

/** Words that are unambiguously a digit, used to judge "oh" by its neighbours. */
const DIGITISH = new Set([...Object.keys(WORD_TO_DIGIT)]);
const isDigitish = (w) => w !== undefined && (DIGITISH.has(w) || /^\d+$/.test(w));

const WORD_TO_LETTER = Object.fromEntries(
  Object.entries(PHONETIC).map(([letter, word]) => [word, letter])
);
// Speech recognition spells these a few different ways.
Object.assign(WORD_TO_LETTER, {
  juliett: 'J', alfa: 'A', xray: 'X', 'x-ray': 'X', 'x ray': 'X',
});

/**
 * Collapse a spoken readback into something comparable.
 *
 * "niner five sierra papa" and "95SP" both become "95SP", so grading can look
 * for required elements without caring how the recogniser spelled them.
 */
export function normalize(text) {
  const words = String(text)
    .toLowerCase()
    .replace(/[.,!?]/g, ' ')
    .replace(/-/g, ' ')
    // Recognisers split these; rejoin before lookup.
    .replace(/\bx\s+ray\b/g, 'xray')
    .replace(/\bdouble\s+/g, '')
    .split(/\s+/)
    .filter(Boolean);

  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // "point"/"decimal" separate a frequency but carry nothing to grade, and
    // dropping them lets "one two four point one" match "124.1".
    if (w === 'point' || w === 'decimal') continue;
    // "oh" is zero in "three oh one two" but an interjection everywhere else,
    // so it only counts as a digit next to one.
    if (w === 'oh') {
      out.push(isDigitish(words[i - 1]) || isDigitish(words[i + 1]) ? '0' : ' oh ');
      continue;
    }
    if (WORD_TO_DIGIT[w] !== undefined) out.push(WORD_TO_DIGIT[w]);
    else if (WORD_TO_LETTER[w]) out.push(WORD_TO_LETTER[w]);
    else if (/^[a-z]$/.test(w)) out.push(w.toUpperCase()); // a spelled letter
    else if (/^\d+$/.test(w)) out.push(...w); // "124" -> 1,2,4
    else out.push(` ${w} `);
  }
  return out
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Does a normalised readback contain this run of characters? */
export function contains(readback, expected) {
  const hay = normalize(readback).replace(/\s+/g, '');
  const needle = String(expected).toUpperCase().replace(/[\s.]/g, '');
  return hay.includes(needle);
}

// --- renderers --------------------------------------------------------------
//
// The same transmission has two forms: what the controller says, and what you
// would write on a kneeboard. A scenario is built once against a renderer and
// rendered twice, so the radio speaks "seven two five sierra papa" while the
// screen shows "725SP".

/** Everything spelled out the way it goes over the air. */
export const SPOKEN = {
  digits,
  frequency,
  heading,
  squawk,
  altitude,
  runway,
  altimeter,
  wind,
  callsign,
  vfr: 'V-F-R',
  // An ATIS code is a letter of the phonetic alphabet, never a letter name.
  atis: (letter) => phonetic(letter),
};

const comma = (n) => Number(n).toLocaleString('en-US');

/** Everything in the compact form you would write down. */
export const WRITTEN = {
  digits: (v) => String(v),
  frequency: (mhz) => String(Number(mhz)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
  heading: (deg) => String(Math.round(deg) % 360).padStart(3, '0'),
  squawk: (code) => String(code).padStart(4, '0'),
  altitude: (ft) => (ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${comma(ft)} ft`),
  runway: (id) => String(id).toUpperCase(),
  altimeter: (inHg) => Number(inHg).toFixed(2),
  wind: ({ dir, kt, gust }) =>
    kt === 0
      ? 'calm'
      : `${String(dir).padStart(3, '0')} at ${kt}${gust ? `G${gust}` : ''}`,
  /** "Skyhawk N725SP" on first reference, "Skyhawk 5SP" once abbreviated. */
  callsign: (ac, { abbreviated = false, withType = true } = {}) => {
    const tail = ac.tail.toUpperCase().replace(/^N/, '');
    const shown = abbreviated ? tail.slice(-3) : `N${tail}`;
    const prefix = withType && ac.type && TYPES[ac.type] ? TYPES[ac.type] : '';
    return `${prefix ? `${prefix} ` : ''}${shown}`;
  },
  vfr: 'VFR',
  // Written the same way it is said — a broadcast is "Information Tango", and
  // showing a bare "T" would invite reading it out as the letter.
  atis: (letter) => {
    const word = phonetic(letter);
    return word.charAt(0).toUpperCase() + word.slice(1);
  },
};

// --- coping with speech recognition ------------------------------------------
//
// Browser recognisers are trained on ordinary English and mangle the phonetic
// alphabet: "five sierra papa" comes back as "50 pop". That is a transcription
// problem, not a pilot problem, so the callsign check tolerates it rather than
// failing a correct transmission.
//
// This tolerance is deliberately confined to the callsign. Loosening the
// general matcher is how "cleared for takeoff" got broken once already.

/** What a recogniser tends to produce instead of each phonetic letter. */
const MISHEARD = {
  A: ['alpha', 'alfa', 'alfalfa'],
  B: ['bravo', 'bravado'],
  C: ['charlie', 'charley', 'charly'],
  D: ['delta'],
  E: ['echo', 'eco'],
  F: ['foxtrot', 'fox', 'foxtrap'],
  G: ['golf', 'gulf'],
  H: ['hotel'],
  I: ['india', 'indio'],
  J: ['juliet', 'juliett', 'juliette', 'julieta'],
  K: ['kilo', 'keelo'],
  L: ['lima', 'leema', 'limo'],
  M: ['mike', 'mic'],
  N: ['november'],
  O: ['oscar', 'oskar'],
  P: ['papa', 'poppa', 'pop', 'popper', 'pappa', 'pa'],
  Q: ['quebec', 'kebec'],
  R: ['romeo'],
  S: ['sierra', 'sarah', 'sara', 'cierra', 'serra', 'sienna'],
  T: ['tango', 'mango'],
  U: ['uniform', 'unicorn'],
  V: ['victor', 'vector'],
  W: ['whiskey', 'whisky'],
  X: ['xray', 'exray'],
  Y: ['yankee', 'yanky'],
  Z: ['zulu', 'zoolu'],
};

const HEARD_AS = {};
for (const [letter, words] of Object.entries(MISHEARD)) {
  for (const w of words) HEARD_AS[w] = letter;
}

/**
 * Did the pilot end the transmission with something callsign-shaped?
 *
 * Compares the tail of what was heard against the last three characters of the
 * registration, allowing one character to have been lost — which is what
 * happens when "sierra" is transcribed as part of a number.
 */
export function soundsLikeCallsign(said, tail) {
  const want = String(tail).toUpperCase().replace(/^N/, '').slice(-3);
  if (!want) return false;

  // Only the end of the transmission: the callsign goes last.
  const words = String(said).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const chars = words
    .slice(-6)
    .flatMap((w) => {
      if (HEARD_AS[w]) return [HEARD_AS[w]];
      // A typed callsign arrives whole ("5SP", "725SP"); spread it out. Only
      // tokens carrying a digit, so "runway" is not read as R-U-N-W-A-Y.
      if (/\d/.test(w)) return [...w.toUpperCase()];
      if (/^[a-z]$/.test(w)) return [w.toUpperCase()];
      return [];
    })
    .join('');

  // Subsequence match, tolerating one miss.
  let missed = 0;
  let at = 0;
  for (const c of want) {
    const found = chars.indexOf(c, at);
    if (found === -1) missed += 1;
    else at = found + 1;
  }
  return missed <= 1;
}

/**
 * Of several recogniser guesses, the one that best fits what was expected.
 *
 * Recognisers often get aviation speech right in the second or third
 * alternative, so scoring them against the required elements beats taking the
 * first every time.
 */
export function bestAlternative(alternatives, expectedValues = []) {
  const alts = [...alternatives].filter(Boolean);
  if (alts.length < 2 || !expectedValues.length) return alts[0] ?? '';
  let best = alts[0];
  let bestScore = -1;
  for (const alt of alts) {
    const score = expectedValues.filter((v) => [].concat(v).some((x) => contains(alt, x))).length;
    if (score > bestScore) {
      bestScore = score;
      best = alt;
    }
  }
  return best;
}
