// Vector redraws of the Garmin faceplates.
//
// Geometry is traced from the original trainer bitmaps (measured with a pixel
// grid): 446x186 for the 400W-series, 464x338 for the 500-series. Each drawing
// shares its coordinate space with the hit regions in units.js, so the artwork
// and the clickable areas cannot drift apart.
//
// Colours are sampled from that same bitmap: body #2b2c2e-#4f4f53, key faces
// around #4f5051 with a #717272 top highlight, soft keys noticeably lighter at
// #9d9a98.

const P = (n) => Math.round(n * 100) / 100;

/** Ticks around a knob rim, which is what reads as knurling at any zoom. */
function knurl(cx, cy, rOuter, rInner, count, opacity = 0.55) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const sx = cx + Math.cos(a) * rInner;
    const sy = cy + Math.sin(a) * rInner;
    const ex = cx + Math.cos(a) * rOuter;
    const ey = cy + Math.sin(a) * rOuter;
    d += `M${P(sx)} ${P(sy)}L${P(ex)} ${P(ey)}`;
  }
  return `<path d="${d}" stroke="#0c0c0d" stroke-width="0.9" opacity="${opacity}"/>`;
}

/**
 * The printed rotate indicators: a broken ring of two curved arrows, one
 * pointing counter-clockwise on the left and one clockwise on the right.
 */
function rotArrows(cx, cy, r, sweepDeg = 52, head = 3.4) {
  const rad = (d) => (d * Math.PI) / 180;
  const pt = (deg) => [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r];

  const arc = (fromDeg, toDeg, tipDeg) => {
    const [x1, y1] = pt(fromDeg);
    const [x2, y2] = pt(toDeg);
    const sweep = toDeg > fromDeg ? 1 : 0;
    // Arrowhead sits at the tip, rotated to the tangent.
    const [tx, ty] = pt(tipDeg);
    const tangent = tipDeg + (sweep ? 90 : -90);
    return (
      `<path d="M${P(x1)} ${P(y1)}A${r} ${r} 0 0 ${sweep} ${P(x2)} ${P(y2)}" ` +
      `fill="none" stroke="#f2f2f2" stroke-width="2.6" stroke-linecap="butt"/>` +
      `<path d="M${P(-head)} ${P(-head * 1.25)}L${P(head * 1.5)} 0L${P(-head)} ${P(head * 1.25)}Z" ` +
      `fill="#f2f2f2" transform="translate(${P(tx)} ${P(ty)}) rotate(${P(tangent)})"/>`
    );
  };

  // Left arrow runs anticlockwise from just left of top; right one clockwise.
  return (
    arc(188, 188 + sweepDeg, 188) +
    arc(352, 352 - sweepDeg, 352)
  );
}

/** A dual concentric knob: knurled outer ring, smaller inner knob, centre cap. */
function dualKnob(cx, cy, { rOuter = 30, rInner = 18.5 } = {}) {
  return `
    <g class="knob">
      <circle cx="${cx}" cy="${cy}" r="${rOuter + 1.2}" fill="#131416"/>
      <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="url(#knobOuter)"/>
      ${knurl(cx, cy, rOuter - 0.5, rOuter - 6.5, 68)}
      <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="none" stroke="#0a0a0b" stroke-width="1"/>
      <circle cx="${cx}" cy="${cy}" r="${rInner + 1.6}" fill="#0e0f11"/>
      <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="url(#knobInner)"/>
      ${knurl(cx, cy, rInner - 0.5, rInner - 4.5, 46, 0.45)}
      <circle cx="${cx}" cy="${cy}" r="${rInner - 5.5}" fill="url(#knobCap)"/>
    </g>`;
}

/** Round volume knob with its pointer notch. */
function volKnob(cx, cy, letter) {
  const r = 13;
  return `
    <g class="knob">
      <circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="#111214"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#knobOuter)"/>
      ${knurl(cx, cy, r - 0.5, r - 4, 40, 0.5)}
      <circle cx="${cx}" cy="${cy}" r="${r - 4.5}" fill="url(#knobCap)"/>
      <circle cx="${P(cx - 7.2)}" cy="${P(cy + 4.6)}" r="1.25" fill="#e9e9e9"/>
      <text class="lbl" x="${cx}" y="${P(cy + 2.6)}" font-size="9.5" text-anchor="middle">${letter}</text>
    </g>`;
}

/** Raised key with a lit top bevel, matching the moulded rubber keys. */
function key(id, x, y, w, h, inner, { rx = 3.4 } = {}) {
  return `
    <g class="key" id="art-${id}">
      <rect x="${P(x + 0.6)}" y="${P(y + 1.2)}" width="${w}" height="${h}" rx="${rx}" fill="#0c0c0d" opacity="0.75"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#keyFace)" stroke="#191a1c" stroke-width="0.7"/>
      <path d="M${P(x + 2)} ${P(y + 1.4)}h${P(w - 4)}" stroke="#8b8c8e" stroke-width="1.1" opacity="0.85" stroke-linecap="round"/>
      ${inner}
    </g>`;
}

/** The lighter, flatter keys on the bottom rail. */
function softKey(id, x, y, w, h, label) {
  return `
    <g class="key" id="art-${id}">
      <rect x="${P(x + 0.5)}" y="${P(y + 1)}" width="${w}" height="${h}" rx="3" fill="#3a3a3c" opacity="0.8"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#softFace)" stroke="#5d5d5f" stroke-width="0.6"/>
      <text class="lbl dark" x="${P(x + w / 2)}" y="${P(y + h / 2 + 3.1)}" font-size="8.4" text-anchor="middle">${label}</text>
    </g>`;
}

/** Recessed data card slot with the card's white pull tab. */
function cardSlot(x, y, w, h) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="#0a0a0b"/>
      <rect x="${P(x + 1.6)}" y="${P(y + 1.6)}" width="${P(w - 3.2)}" height="${P(h - 3.2)}"
            rx="1.8" fill="#1c1d1f"/>
      <rect x="${P(x + 1.6)}" y="${P(y + h / 2 - 2.2)}" width="${P(w - 3.2)}" height="4.4"
            rx="0.6" fill="#dcdcda"/>
    </g>`;
}

/** Gradients shared by every faceplate. */
const DEFS = `
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#55565a"/>
      <stop offset="0.18" stop-color="#3d3e42"/>
      <stop offset="0.75" stop-color="#2b2c2e"/>
      <stop offset="1" stop-color="#202124"/>
    </linearGradient>
    <linearGradient id="keyFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#65666a"/>
      <stop offset="0.45" stop-color="#4a4b4d"/>
      <stop offset="1" stop-color="#38393b"/>
    </linearGradient>
    <linearGradient id="softFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b6b3b1"/>
      <stop offset="0.5" stop-color="#9d9a98"/>
      <stop offset="1" stop-color="#7e7c7b"/>
    </linearGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a8a6a4"/>
      <stop offset="0.35" stop-color="#878583"/>
      <stop offset="1" stop-color="#5b5957"/>
    </linearGradient>
    <radialGradient id="knobOuter" cx="0.35" cy="0.28" r="0.85">
      <stop offset="0" stop-color="#4a4b4f"/>
      <stop offset="0.6" stop-color="#2b2c30"/>
      <stop offset="1" stop-color="#141517"/>
    </radialGradient>
    <radialGradient id="knobInner" cx="0.36" cy="0.28" r="0.85">
      <stop offset="0" stop-color="#3f4044"/>
      <stop offset="0.65" stop-color="#232427"/>
      <stop offset="1" stop-color="#101113"/>
    </radialGradient>
    <radialGradient id="knobCap" cx="0.38" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#35363a"/>
      <stop offset="1" stop-color="#1b1c1e"/>
    </radialGradient>
    <radialGradient id="led" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd98a"/>
      <stop offset="0.55" stop-color="#e0952b"/>
      <stop offset="1" stop-color="#6b4715"/>
    </radialGradient>
    <linearGradient id="recess" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#17181a"/>
      <stop offset="1" stop-color="#3a3b3f"/>
    </linearGradient>
  </defs>`;

/** The moulded well the display sits in. */
const screenRecess = (s) => `
    <rect x="${s.x - 6}" y="${s.y - 8}" width="${s.w + 12}" height="${s.h + 16}"
          rx="4" fill="url(#recess)"/>
    <rect x="${s.x - 2}" y="${s.y - 2}" width="${s.w + 4}" height="${s.h + 4}"
          rx="1.5" fill="#000"/>`;

/** The Direct-To glyph, drawn at a given centre. */
const dtoGlyph = (cx, cy) => `
      <g stroke="#e9e9e9" stroke-width="1.5" fill="none">
        <path d="M${cx - 8} ${cy}h18"/><path d="M${cx} ${cy - 6}v12"/>
      </g>
      <ellipse cx="${cx}" cy="${cy}" rx="4.6" ry="6" fill="none" stroke="#e9e9e9" stroke-width="1.5"/>
      <path d="M${cx + 8} ${cy - 4}l6 4l-6 4z" fill="#e9e9e9"/>`;

const shell = (W, H, body) =>
  `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
       aria-label="Garmin faceplate">
  ${DEFS}
  <rect x="0" y="0" width="${W}" height="${H}" rx="5" fill="url(#body)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4.5" fill="none"
        stroke="#6a6b6f" stroke-width="1" opacity="0.5"/>
  ${body}
</svg>`;

// --- GNS 430 (446x186) ------------------------------------------------------

export function bezel430Svg() {
  const W = 446;
  const H = 186;
  const S = { x: 110, y: 26, w: 240, h: 128 };

  const left = `
    <text class="brand" x="9" y="13" font-size="8.6">GARMIN</text>

    ${cardSlot(6, 24, 16, 80)}
    ${cardSlot(54, 24, 16, 80)}

    ${volKnob(35, 31, 'C')}
    <text class="micro" x="24" y="50">PWR</text>
    <text class="lbl" x="23" y="57" font-size="6.6">VOL</text>
    <text class="lbl" x="39" y="57" font-size="6.6">/</text>
    <text class="micro" x="43" y="50">PUSH</text>
    <text class="lbl" x="44" y="57" font-size="6.6">SQ</text>

    ${volKnob(35, 75, 'V')}
    <text class="lbl" x="23" y="97" font-size="6.6">VOL</text>
    <text class="lbl" x="39" y="97" font-size="6.6">/</text>
    <text class="micro" x="43" y="90">PUSH</text>
    <text class="lbl" x="44" y="97" font-size="6.6">ID</text>

    <rect x="79" y="7" width="11" height="14" rx="2" fill="#171819"/>
    <circle cx="84.5" cy="14" r="3" fill="url(#led)"/>

    ${key('COM_FF', 76, 27, 28, 32, `<text class="lbl" x="90" y="41" font-size="9" text-anchor="middle">C</text>
       <text class="lbl" x="90" y="54" font-size="10" text-anchor="middle">&#8597;</text>`)}
    ${key('VLOC_FF', 76, 72, 28, 32, `<text class="lbl" x="90" y="86" font-size="9" text-anchor="middle">V</text>
       <text class="lbl" x="90" y="99" font-size="10" text-anchor="middle">&#8597;</text>`)}

    <text class="lbl" x="56" y="115" font-size="7.6">COM</text>
    <path d="M77 108l-7 15" stroke="#e9e9e9" stroke-width="1"/>
    <text class="lbl" x="72" y="126" font-size="7.6">VLOC</text>

    ${dualKnob(31, 146)}
    ${rotArrows(31, 146, 26)}
    ${rotArrows(31, 146, 13.5, 44, 3)}
    <text class="lbl" x="31" y="155" font-size="7.4" text-anchor="middle">PUSH</text>
    <text class="lbl" x="31" y="164" font-size="7.4" text-anchor="middle">C/V</text>`;

  const right = `
    <text class="model" x="${W - 8}" y="13" font-size="7.6" text-anchor="end">GNS 430</text>

    ${key('RNG', 367, 16, 73, 23, `<path d="M377 23l10 0l-5 9z" fill="#e9e9e9"/>
       <text class="lbl" x="403" y="31" font-size="9.5" text-anchor="middle">RNG</text>
       <path d="M423 32l10 0l-5 -9z" fill="#e9e9e9"/>`)}

    ${key('DTO', 367, 46, 35, 24, dtoGlyph(383, 58))}
    ${key('MENU', 405, 46, 35, 24, `<text class="lbl" x="422.5" y="61.5" font-size="9.5" text-anchor="middle">MENU</text>`)}
    ${key('CLR', 367, 74, 35, 24, `<text class="lbl" x="384.5" y="89.5" font-size="9.5" text-anchor="middle">CLR</text>`)}
    ${key('ENT', 405, 74, 35, 24, `<text class="lbl" x="422.5" y="89.5" font-size="9.5" text-anchor="middle">ENT</text>`)}

    <path d="M384.5 100v9" stroke="#d8d8d8" stroke-width="0.9"/>
    <path d="M384.5 99l-1.8 3.4h3.6z" fill="#d8d8d8"/>
    <text class="lbl" x="371" y="117" font-size="7.2">DEFAULT</text>
    <text class="lbl" x="371" y="125" font-size="7.2">NAV</text>

    <text class="lbl" x="414" y="112" font-size="8.6">GPS</text>

    ${dualKnob(419, 146)}
    ${rotArrows(419, 146, 26)}
    ${rotArrows(419, 146, 13.5, 44, 3)}
    <text class="lbl" x="419" y="155" font-size="7.4" text-anchor="middle">PUSH</text>
    <text class="lbl" x="419" y="164" font-size="7.4" text-anchor="middle">CRSR</text>`;

  const bottom = `
    <rect x="104" y="155" width="256" height="26" rx="12" fill="url(#rail)" stroke="#4b4a49" stroke-width="0.7"/>
    ${softKey('CDI', 116, 162, 28, 16, 'CDI')}
    ${softKey('OBS', 166, 162, 28, 16, 'OBS')}
    ${softKey('MSG', 216, 162, 29, 16, 'MSG')}
    ${softKey('FPL', 266, 162, 29, 16, 'FPL')}
    ${softKey('PROC', 316, 162, 31, 16, 'PROC')}`;

  return shell(W, H, screenRecess(S) + left + right + bottom);
}

// --- GNS 530 (464x338) ------------------------------------------------------
//
// Same firmware in a taller box: vertical RNG rocker, flip-flops above their
// volume knobs, horizontal card slots, and VNAV added to the bottom row.

export function bezel530Svg() {
  const W = 464;
  const H = 338;
  const S = { x: 83, y: 28, w: 303, h: 225 };

  const left = `
    <text class="brand" x="14" y="17" font-size="9">GARMIN</text>

    ${key('COM_FF', 44, 30, 19, 29, `<text class="lbl" x="53.5" y="43" font-size="8.4" text-anchor="middle">C</text>
       <text class="lbl" x="53.5" y="55" font-size="9.4" text-anchor="middle">&#8597;</text>`)}
    ${volKnob(36, 79, 'C')}
    <text class="micro" x="22" y="99">PWR</text>
    <text class="lbl" x="21" y="106" font-size="6.6">VOL</text>
    <text class="lbl" x="37" y="106" font-size="6.6">/</text>
    <text class="micro" x="41" y="99">PUSH</text>
    <text class="lbl" x="42" y="106" font-size="6.6">SQ</text>

    ${key('VLOC_FF', 44, 107, 19, 29, `<text class="lbl" x="53.5" y="120" font-size="8.4" text-anchor="middle">V</text>
       <text class="lbl" x="53.5" y="132" font-size="9.4" text-anchor="middle">&#8597;</text>`)}
    ${volKnob(36, 155, 'V')}
    <text class="lbl" x="21" y="182" font-size="6.6">VOL</text>
    <text class="lbl" x="37" y="182" font-size="6.6">/</text>
    <text class="micro" x="41" y="175">PUSH</text>
    <text class="lbl" x="42" y="182" font-size="6.6">ID</text>

    <text class="lbl" x="22" y="248" font-size="8.4">COM</text>
    <path d="M50 240l-8 17" stroke="#e9e9e9" stroke-width="1"/>
    <text class="lbl" x="45" y="260" font-size="8.4">VLOC</text>

    ${dualKnob(37, 292)}
    ${rotArrows(37, 292, 26)}
    ${rotArrows(37, 292, 13.5, 44, 3)}
    <text class="lbl" x="37" y="301" font-size="7.4" text-anchor="middle">PUSH</text>
    <text class="lbl" x="37" y="310" font-size="7.4" text-anchor="middle">C/V</text>`;

  const right = `
    <circle cx="416" cy="20" r="6" fill="#1a1b1d"/>
    <circle cx="416" cy="20" r="4.4" fill="url(#led)"/>
    <text class="model" x="${W - 6}" y="23" font-size="7.6" text-anchor="end">GNS 530</text>

    <rect x="412" y="35" width="34" height="65" rx="6" fill="#0d0d0e" opacity="0.7"/>
    ${key('RNG_UP', 414, 38, 30, 25, `<path d="M424 54l10 0l-5 -9z" fill="#e9e9e9"/>`)}
    <text class="lbl" x="429" y="71" font-size="8" text-anchor="middle">RNG</text>
    ${key('RNG_DOWN', 414, 75, 30, 25, `<path d="M424 86l10 0l-5 9z" fill="#e9e9e9"/>`)}

    ${key('DTO', 413, 109, 32, 21, dtoGlyph(429, 120))}
    ${key('MENU', 413, 140, 32, 21, `<text class="lbl" x="429" y="154" font-size="8.6" text-anchor="middle">MENU</text>`)}
    ${key('CLR', 413, 169, 32, 21, `<text class="lbl" x="429" y="183" font-size="8.6" text-anchor="middle">CLR</text>`)}
    ${key('ENT', 413, 198, 32, 21, `<text class="lbl" x="429" y="212" font-size="8.6" text-anchor="middle">ENT</text>`)}

    <path d="M447 179h9v52h-38" stroke="#d8d8d8" stroke-width="0.9" fill="none"/>
    <path d="M419 231l3.4 -1.8v3.6z" fill="#d8d8d8"/>
    <text class="lbl" x="398" y="240" font-size="7.2">DEFAULT</text>
    <text class="lbl" x="410" y="248" font-size="7.2">NAV</text>

    <text class="lbl" x="404" y="262" font-size="8.6">GPS</text>

    ${dualKnob(420, 292)}
    ${rotArrows(420, 292, 26)}
    ${rotArrows(420, 292, 13.5, 44, 3)}
    <text class="lbl" x="420" y="301" font-size="7.4" text-anchor="middle">PUSH</text>
    <text class="lbl" x="420" y="310" font-size="7.4" text-anchor="middle">CRSR</text>`;

  const softKeys = ['CDI', 'OBS', 'MSG', 'FPL', 'VNAV', 'PROC']
    .map((label, i) => softKey(label, 97 + i * 48, 275, 46, 21, label))
    .join('');

  const bottom = `
    <rect x="80" y="262" width="312" height="40" rx="12" fill="url(#rail)" stroke="#4b4a49" stroke-width="0.7"/>
    ${softKeys}
    ${cardSlot(112, 305, 88, 21)}
    ${cardSlot(272, 305, 88, 21)}
    <circle cx="230" cy="315" r="5" fill="#0a0a0b"/>`;

  return shell(W, H, screenRecess(S) + left + right + bottom);
}
