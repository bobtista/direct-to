// Vector redraw of the GTN 650Xi faceplate.
//
// Proportions are measured from Garmin's own bezel diagram in the GTN Xi
// Series Pilot's Guide (190-02327-03 Rev G, page 1-5), scaled into a 500x213
// space that matches the unit's 6.25 x 2.66 inch form factor.
//
// A touchscreen box has very little faceplate: a power/volume knob, an SD slot,
// HOME and Direct-To keys, and a dual concentric knob. Everything else the
// pilot touches is drawn by the screen renderer.

const P = (n) => Math.round(n * 100) / 100;

function knurl(cx, cy, rOuter, rInner, count, opacity = 0.5) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    d +=
      `M${P(cx + Math.cos(a) * rInner)} ${P(cy + Math.sin(a) * rInner)}` +
      `L${P(cx + Math.cos(a) * rOuter)} ${P(cy + Math.sin(a) * rOuter)}`;
  }
  return `<path d="${d}" stroke="#0b0b0c" stroke-width="0.8" opacity="${opacity}"/>`;
}

/** Raised key with a lit top bevel. */
function key(id, x, y, w, h, inner, rx = 3) {
  return `
    <g class="key" id="art-${id}">
      <rect x="${P(x + 0.5)}" y="${P(y + 1)}" width="${w}" height="${h}" rx="${rx}" fill="#08080a" opacity="0.8"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#gKey)" stroke="#141517" stroke-width="0.6"/>
      <path d="M${P(x + 2)} ${P(y + 1.2)}h${P(w - 4)}" stroke="#8a8b8d" stroke-width="0.9" opacity="0.8" stroke-linecap="round"/>
      ${inner}
    </g>`;
}

export function bezel650XiSvg() {
  const W = 500;
  const H = 213;
  const S = { x: 44, y: 19, w: 402, h: 176 };

  const defs = `
  <defs>
    <linearGradient id="gBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a4b4f"/>
      <stop offset="0.14" stop-color="#343539"/>
      <stop offset="0.8" stop-color="#232427"/>
      <stop offset="1" stop-color="#1a1b1d"/>
    </linearGradient>
    <linearGradient id="gKey" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5e5f63"/>
      <stop offset="0.45" stop-color="#434447"/>
      <stop offset="1" stop-color="#313235"/>
    </linearGradient>
    <radialGradient id="gKnob" cx="0.35" cy="0.28" r="0.85">
      <stop offset="0" stop-color="#46474b"/>
      <stop offset="0.62" stop-color="#28292c"/>
      <stop offset="1" stop-color="#121314"/>
    </radialGradient>
    <radialGradient id="gCap" cx="0.38" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#333438"/>
      <stop offset="1" stop-color="#191a1c"/>
    </radialGradient>
    <radialGradient id="gLed" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#dfe4ea"/>
      <stop offset="0.6" stop-color="#8b929b"/>
      <stop offset="1" stop-color="#3b4046"/>
    </radialGradient>
  </defs>`;

  // Glass runs nearly the full face; the display is the lit part of it.
  const glass = `
    <rect x="30" y="11" width="428" height="192" rx="5" fill="#0a0a0b"/>
    <rect x="${S.x - 2}" y="${S.y - 2}" width="${S.w + 4}" height="${S.h + 4}" rx="2" fill="#000"/>
    <text class="gbrand" x="${S.x + S.w / 2}" y="17" font-size="7" text-anchor="middle">GARMIN</text>
    <rect x="${S.x + 6}" y="${H - 22}" width="${S.w - 12}" height="7" rx="3.5" fill="#2f3134" opacity="0.85"/>`;

  const left = `
    <g class="knob">
      <circle cx="27" cy="31" r="17" fill="#101113"/>
      <circle cx="27" cy="31" r="15.5" fill="url(#gKnob)"/>
      ${knurl(27, 31, 15, 10.5, 44)}
      <circle cx="27" cy="31" r="9" fill="url(#gCap)"/>
    </g>
    <rect x="18" y="84" width="16" height="84" rx="3" fill="#0a0a0b"/>
    <rect x="20" y="87" width="12" height="78" rx="2" fill="#1e1f22"/>
    <path d="M22 100h8M22 108h8" stroke="#3a3b3f" stroke-width="1"/>
    <circle cx="26" cy="196" r="3" fill="#0d0d0e"/>`;

  const right = `
    <circle cx="475" cy="31" r="7" fill="#111214"/>
    <circle cx="475" cy="31" r="5" fill="url(#gLed)" opacity="0.75"/>

    ${key(
      'HOME',
      455,
      68,
      38,
      23,
      `<text class="glbl" x="474" y="83" font-size="8.4" text-anchor="middle">HOME</text>`
    )}
    ${key(
      'DTO',
      455,
      108,
      38,
      23,
      `<g stroke="#e9e9e9" stroke-width="1.4" fill="none">
         <path d="M466 119.5h17"/><path d="M474 113.5v12"/>
       </g>
       <ellipse cx="474" cy="119.5" rx="4.2" ry="5.6" fill="none" stroke="#e9e9e9" stroke-width="1.4"/>
       <path d="M481 115.5l6 4l-6 4z" fill="#e9e9e9"/>`
    )}

    <g class="knob">
      <circle cx="474" cy="176" r="25" fill="#0e0f11"/>
      <circle cx="474" cy="176" r="23.5" fill="url(#gKnob)"/>
      ${knurl(474, 176, 23, 17, 56)}
      <circle cx="474" cy="176" r="15.5" fill="#0d0e10"/>
      <circle cx="474" cy="176" r="14" fill="url(#gKnob)"/>
      ${knurl(474, 176, 13.5, 10, 40, 0.4)}
      <circle cx="474" cy="176" r="8" fill="url(#gCap)"/>
    </g>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
       aria-label="Garmin GTN 650Xi faceplate">
  ${defs}
  <rect x="0" y="0" width="${W}" height="${H}" rx="5" fill="url(#gBody)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4.5" fill="none"
        stroke="#5f6064" stroke-width="1" opacity="0.5"/>
  ${glass}
  ${left}
  ${right}
</svg>`;
}
