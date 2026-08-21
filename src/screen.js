// Renders the GNS view onto the unit's native 240x128 pixel grid.
//
// Everything below is positioned in those 240x128 units; index.html scales the
// whole grid up with a single CSS transform, so coordinates here can be read
// straight off screenshots of the real unit.

// Layout is authored in the 430's 240-wide space. For a bigger unit we scale
// the primitives by S and hand the layout a taller logical canvas, so columns
// keep their proportions while the extra pixels become extra rows.
let W = 240;
let H = 128;
let S = 1;

function setCanvas(px) {
  S = px.w / 240;
  W = 240;
  H = px.h / S;
}

const u = (n) => Math.round(n * S * 100) / 100;

// The data area to the right of the COM/VLOC panel.
const DATA_X = 65;
const DATA_W = W - DATA_X - 2;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Absolutely positioned text. `a` sets alignment: l (default), c, or r. */
function txt(s, x, y, { size = 7, color = 'var(--grn)', a = 'l', w, bold = false } = {}) {
  const style = [
    `left:${u(a === 'l' ? x : a === 'c' ? x - (w ?? 0) / 2 : x - (w ?? 0))}px`,
    `top:${u(y)}px`,
    `font-size:${u(size)}px`,
    `color:${color}`,
    w != null ? `width:${u(w)}px;text-align:${a === 'c' ? 'center' : a === 'r' ? 'right' : 'left'}` : '',
    bold ? 'font-weight:700' : '',
  ]
    .filter(Boolean)
    .join(';');
  return `<span class="t" style="${style}">${esc(s)}</span>`;
}

function box(x, y, w, h, { fill = 'transparent', stroke = 'var(--cyn)' } = {}) {
  return `<div class="b" style="left:${u(x)}px;top:${u(y)}px;width:${u(w)}px;height:${u(h)}px;background:${fill};border-color:${stroke}"></div>`;
}

function fill(x, y, w, h, color) {
  return `<div class="f" style="left:${u(x)}px;top:${u(y)}px;width:${u(w)}px;height:${u(h)}px;background:${color}"></div>`;
}

const pad = (n, len) => String(n).padStart(len, '0');

function hhmm(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--';
  const m = Math.round(seconds / 60);
  return `${pad(Math.floor(m / 60), 2)}:${pad(m % 60, 2)}`;
}

const deg3 = (v) => (v == null ? '---' : `${pad(Math.round(v) % 360, 3)}°`);

// --- radio stack (left column, shared by most NAV pages) -------------------

const PANEL_W = 62;

function radioStack(v) {
  const out = [];
  const comSel = v.tuning === 'COM';
  out.push(fill(0, 0, PANEL_W, H - 12, 'var(--panel)'));
  out.push(txt('COM', 2, 1, { size: 8, color: 'var(--cyn)', bold: true }));
  out.push(txt(v.com.active, 2, 9, { size: 13, color: '#fff', bold: true }));
  out.push(txt(v.com.standby, 2, 22, { size: 13, color: 'var(--cyn)', bold: true }));
  out.push(txt('VLOC', 2, 38, { size: 8, color: 'var(--cyn)', bold: true }));
  out.push(txt(v.vloc.active, 2, 46, { size: 13, color: '#fff', bold: true }));
  out.push(txt(v.vloc.standby, 2, 59, { size: 13, color: 'var(--cyn)', bold: true }));
  // The tuning cursor sits under whichever standby frequency the knobs drive.
  out.push(box(1, comSel ? 21 : 58, PANEL_W - 2, 15, { stroke: 'var(--amb)' }));
  out.push(box(1, H - 34, PANEL_W - 2, 12));
  out.push(txt(v.nav ? 'TERM' : 'ENR', PANEL_W / 2, H - 32, { size: 8, a: 'c', w: PANEL_W, bold: true }));
  return out.join('');
}

// --- bottom status bar -----------------------------------------------------

function statusBar(v) {
  const out = [];
  const by = H - 12;
  out.push(fill(0, by, W, 12, 'var(--panel)'));
  out.push(txt(v.navSource, 2, by + 2, { size: 8, bold: true }));
  out.push(txt(v.obs ? 'OBS' : '', 42, by + 2, { size: 8, bold: true }));
  out.push(txt(v.message ? 'MSG' : '', 78, by + 2, { size: 8, color: 'var(--amb)', bold: true }));
  // Page-group name and the little square-per-page indicator.
  const sqX = W - 4 - v.pageCount * 7;
  out.push(txt(v.group, sqX - 4, by + 2, { size: 8, a: 'r', w: 34, color: '#fff', bold: true }));
  for (let i = 0; i < v.pageCount; i++) {
    out.push(fill(sqX + i * 7, by + 3, 5, 7, i === v.pageIndex ? '#fff' : 'transparent'));
    out.push(box(sqX + i * 7, by + 3, 5, 7, { stroke: '#fff' }));
  }
  return out.join('');
}

// --- CDI -------------------------------------------------------------------

function cdi(v) {
  const out = [];
  const x0 = DATA_X;
  const w = DATA_W;
  out.push(box(x0, 2, w, 26));
  const cx = x0 + w / 2;
  if (v.nav) {
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      out.push(fill(cx + i * 13 - 1, 19, 3, 3, 'var(--cyn)'));
    }
    // Full-scale deflection is 5 nm en route; clamp to the dot scale.
    const dots = Math.max(-5, Math.min(5, v.nav.xtk));
    out.push(txt('▼', cx + dots * 13, 6, { size: 13, a: 'c', w: 12, color: 'var(--grn)' }));
    // Cross-track distance, with the side it's off to — tucked under the dots.
    const side = v.nav.xtk >= 0 ? 'R' : 'L';
    out.push(txt(`${Math.abs(v.nav.xtk).toFixed(1)}${side}`, x0 + 4, 23, { size: 8, color: 'var(--cyn)' }));
  } else {
    out.push(txt('NO ACTIVE WAYPOINT', cx, 11, { size: 9, a: 'c', w, color: 'var(--amb)', bold: true }));
  }
  return out.join('');
}

// --- pages -----------------------------------------------------------------

function defaultNav(v) {
  const out = [radioStack(v), cdi(v)];
  const x0 = DATA_X;

  out.push(box(x0, 31, DATA_W, 17));
  if (v.nav) {
    out.push(txt('CRS', x0 + 6, 36, { size: 8, bold: true }));
    out.push(txt(deg3(v.nav.dtk), x0 + 24, 34, { size: 12, bold: true }));
    out.push(txt('→', x0 + 84, 34, { size: 12, color: 'var(--mag)', bold: true }));
    out.push(txt(v.nav.to, x0 + DATA_W - 4, 34, { size: 12, a: 'r', w: 60, bold: true }));
  } else {
    out.push(txt('- - - -', x0 + DATA_W / 2, 35, { size: 11, a: 'c', w: 60 }));
  }

  const colW = Math.floor(DATA_W / 3);
  const cols = [x0 + colW / 2, x0 + colW * 1.5, x0 + colW * 2.5];
  const head = ['DTK', 'DIS', 'TRK'];
  const vals = v.nav
    ? [deg3(v.nav.dtk), `${v.nav.dis.toFixed(2)}n`, deg3(v.nav.trk)]
    : ['---°', '--.--n', '---°'];
  const head2 = ['GS', 'ETE', 'ALT'];
  const vals2 = [
    `${Math.round(v.groundSpeed)}k`,
    v.nav ? hhmm(v.nav.ete) : '--:--',
    `${Math.round(v.altitude)}f`,
  ];

  const cell = (s, i, y, size, color) =>
    out.push(txt(s, cols[i], y, { size, color, a: 'c', w: colW, bold: true }));

  head.forEach((h, i) => cell(h, i, 51, 8, 'var(--cyn)'));
  vals.forEach((s, i) => cell(s, i, 60, 13, 'var(--grn)'));
  vals2.forEach((s, i) => cell(s, i, 78, 13, 'var(--grn)'));
  head2.forEach((h, i) => cell(h, i, 96, 8, 'var(--cyn)'));

  return out.join('');
}

function directTo(v) {
  const out = [];
  const d = v.dto;
  out.push(fill(0, 0, W, 10, 'var(--panel)'));
  out.push(txt('SELECT DIRECT-TO WAYPOINT', W / 2, 1, { size: 8, a: 'c', w: W, color: '#fff', bold: true }));

  out.push(txt('─D─▶', 8, 22, { size: 12, color: 'var(--mag)', bold: true }));

  // Identifier field: one cell per character so the cursor can highlight one.
  const cellW = 14;
  const x0 = 46;
  for (let i = 0; i < d.ident.length; i++) {
    const on = d.phase === 'IDENT' && i === d.i;
    if (on) out.push(fill(x0 + i * cellW, 19, cellW - 1, 16, 'var(--amb)'));
    out.push(
      txt(d.ident[i] === ' ' ? '_' : d.ident[i], x0 + i * cellW, 20, {
        size: 14,
        a: 'c',
        w: cellW - 1,
        color: on ? '#000' : 'var(--grn)',
        bold: true,
      })
    );
  }

  const m = d.match;
  out.push(txt(m ? m.n ?? '' : '', 8, 42, { size: 8, color: 'var(--cyn)' }));
  out.push(txt(m ? [m.c, m.r].filter(Boolean).join(', ') : '', 8, 53, { size: 8, color: 'var(--cyn)' }));
  out.push(txt(m ? m.k : '', 210, 42, { size: 8, a: 'r', w: 28, color: 'var(--cyn)' }));

  // "Activate?" function field.
  const act = d.phase === 'ACTIVATE';
  if (act) out.push(fill(84, 84, 72, 16, 'var(--amb)'));
  out.push(box(84, 84, 72, 16));
  out.push(
    txt('Activate?', 120, 87, { size: 11, a: 'c', w: 72, color: act ? '#000' : 'var(--grn)', bold: true })
  );

  out.push(
    txt(
      d.phase === 'IDENT' ? 'small knob: letter   large: next' : 'ENT to activate',
      W / 2,
      H - 22,
      { size: 7, a: 'c', w: W, color: 'var(--cyn)' }
    )
  );
  return out.join('');
}

function flightPlan(v) {
  const out = [];
  out.push(fill(0, 0, W, 10, 'var(--panel)'));
  out.push(txt('ACTIVE FLIGHT PLAN', W / 2, 1, { size: 8, a: 'c', w: W, color: '#fff', bold: true }));

  // Numeric columns are right-aligned to these edges so headers sit over values.
  const cols = { wpt: 6, dtk: 126, dis: 180, cum: 234 };
  out.push(txt('WAYPOINT', cols.wpt, 12, { size: 7, color: 'var(--cyn)', bold: true }));
  ['DTK', 'DIS', 'CUM'].forEach((h, i) =>
    out.push(
      txt(h, [cols.dtk, cols.dis, cols.cum][i], 12, {
        size: 7,
        color: 'var(--cyn)',
        a: 'r',
        w: 34,
        bold: true,
      })
    )
  );

  const rowH = 13;
  const y0 = 22;
  // Fit as many rows as the display has room for, leaving space for the hint.
  const perPage = Math.max(3, Math.floor((H - 12 - 14 - y0) / rowH));
  const rows = v.fpl.rows;
  const total = rows.length + 1; // trailing blank row for adding a waypoint

  // Keep the cursor row on screen; an approach easily overflows the page.
  const first = Math.max(0, Math.min(total - perPage, v.fpl.cursorRow - (perPage - 2)));

  for (let n = 0; n < Math.min(perPage, total - first); n++) {
    const r = first + n;
    const y = y0 + n * rowH;
    const sel = v.cursor && r === v.fpl.cursorRow;
    const editing = sel && v.fpl.edit;

    if (sel && !editing) out.push(fill(2, y - 1, 60, rowH - 1, 'var(--amb)'));

    if (editing) {
      const cellW = 12;
      for (let i = 0; i < v.fpl.edit.ident.length; i++) {
        const on = i === v.fpl.edit.i;
        if (on) out.push(fill(4 + i * cellW, y - 1, cellW - 1, rowH - 1, 'var(--amb)'));
        out.push(
          txt(v.fpl.edit.ident[i] === ' ' ? '_' : v.fpl.edit.ident[i], 4 + i * cellW, y, {
            size: 11,
            a: 'c',
            w: cellW - 1,
            color: on ? '#000' : 'var(--grn)',
            bold: true,
          })
        );
      }
    } else if (rows[r]) {
      const row = rows[r];
      const ink = sel ? '#000' : row.active ? 'var(--mag)' : 'var(--grn)';
      out.push(txt(row.id, cols.wpt, y, { size: 11, color: ink, bold: true }));
      out.push(txt(deg3(row.dtk), cols.dtk, y + 1, { size: 10, a: 'r', w: 34, bold: true }));
      out.push(
        txt(row.dis == null ? '---' : row.dis.toFixed(1), cols.dis, y + 1, {
          size: 10,
          a: 'r',
          w: 34,
          bold: true,
        })
      );
      out.push(
        txt(row.cum == null ? '---' : row.cum.toFixed(1), cols.cum, y + 1, {
          size: 10,
          a: 'r',
          w: 34,
          bold: true,
        })
      );
    } else if (!sel) {
      out.push(txt('_____', cols.wpt, y, { size: 11, color: 'var(--cyn)' }));
    }
  }

  if (total > perPage) {
    const trackH = perPage * rowH - 2;
    out.push(box(234, y0 - 1, 4, trackH, { stroke: 'var(--cyn)' }));
    const barH = Math.max(6, (perPage / total) * trackH);
    out.push(fill(235, y0 + (first / total) * trackH, 2, barH, 'var(--cyn)'));
  }

  out.push(
    txt(
      v.cursor ? 'small: letter  large: move  ENT: ok' : 'press CRSR to edit',
      W / 2,
      H - 24,
      { size: 7, a: 'c', w: W, color: 'var(--cyn)' }
    )
  );
  return out.join('');
}

function menu(v) {
  const out = [];
  const w = 168;
  const h = 18 + v.menu.items.length * 14;
  const x = (W - w) / 2;
  const y = 14;
  out.push(fill(x, y, w, h, '#000'));
  out.push(box(x, y, w, h, { stroke: '#fff' }));
  out.push(txt('PAGE MENU', W / 2, y + 3, { size: 8, a: 'c', w, color: '#fff', bold: true }));
  v.menu.items.forEach((it, i) => {
    const iy = y + 16 + i * 14;
    const sel = i === v.menu.sel;
    if (sel) out.push(fill(x + 3, iy - 1, w - 6, 13, 'var(--amb)'));
    out.push(
      txt(it, x + 6, iy, { size: 10, color: sel ? '#000' : 'var(--grn)', bold: true })
    );
  });
  return out.join('');
}

function simplePage(v, title, lines) {
  const out = [radioStack(v)];
  out.push(txt(title, 152, 4, { size: 9, a: 'c', w: 172, color: '#fff', bold: true }));
  lines.forEach((l, i) => out.push(txt(l, 68, 22 + i * 12, { size: 9, color: 'var(--cyn)' })));
  return out.join('');
}

// --- map -------------------------------------------------------------------

// The map keeps a data-field column on the right, as the unit does by default.
const mapBox = () => ({ x: 0, y: 10, w: 184, h: H - 22 });
const MAP_DATA_X = 186;
let MAP = { x: 0, y: 10, w: 184, h: 106 };

function mapPage(v) {
  const out = [];
  const cx = MAP.x + MAP.w / 2;
  const cy = MAP.y + MAP.h / 2;

  out.push(fill(0, 0, W, 10, 'var(--panel)'));
  out.push(txt('MAP', 4, 1, { size: 8, color: '#fff', bold: true }));
  out.push(txt('TRK UP', 62, 1, { size: 7, color: 'var(--cyn)' }));

  const opts = {
    pos: v.pos,
    trk: v.nav?.trk ?? 0,
    range: v.mapRange,
    box: MAP,
    plan: v.mapPlan ?? [],
    direct: v.mapDirect,
    declutter: v.declutter ?? 0,
  };

  out.push(
    `<svg class="mapsvg" viewBox="0 0 ${W} ${H}" style="left:0;top:0;width:${u(W)}px;height:${u(H)}px">` +
      `<clipPath id="mapclip"><rect x="${MAP.x}" y="${MAP.y}" width="${MAP.w}" height="${MAP.h}"/></clipPath>` +
      `<g clip-path="url(#mapclip)">${mapLayers(opts)}</g></svg>`
  );

  // Waypoint symbols and labels stay as text so they match the rest of the UI.
  const to = (p) => {
    const ppnm = MAP.h / 2 / v.mapRange;
    const hdg = ((v.nav?.trk ?? 0) * Math.PI) / 180;
    const cosLat = Math.max(0.05, Math.cos((v.pos.lat * Math.PI) / 180));
    const north = (p.lat - v.pos.lat) * 60;
    const east = (p.lon - v.pos.lon) * 60 * cosLat;
    return [
      cx + (east * Math.cos(hdg) - north * Math.sin(hdg)) * ppnm,
      cy - (east * Math.sin(hdg) + north * Math.cos(hdg)) * ppnm,
    ];
  };
  const symbol = (p, label, isActive) => {
    const [x, y] = to(p);
    if (x < MAP.x - 10 || x > MAP.x + MAP.w + 10 || y < MAP.y - 10 || y > MAP.y + MAP.h + 10) return;
    const c = isActive ? 'var(--mag)' : 'var(--grn)';
    out.push(fill(x - 1.5, y - 1.5, 3, 3, c));
    out.push(txt(label, x + 4, y - 4, { size: 7, color: c, bold: true }));
  };
  for (const wp of v.mapPlan ?? []) symbol(wp, wp.id, wp.active);
  if (v.mapDirect) symbol(v.mapDirect.to, v.mapDirect.to.id, true);

  out.push(txt('▲', cx, cy - 6, { size: 11, a: 'c', w: 12, color: '#fff' }));

  out.push(
    txt(`${v.mapRange} nm`, MAP.w - 4, MAP.y + MAP.h - 10, { size: 8, a: 'r', w: 40, color: '#fff', bold: true })
  );
  if (v.autoZoom) {
    out.push(txt('AUTO', MAP.w - 4, MAP.y + MAP.h - 20, { size: 6.5, a: 'r', w: 40, color: 'var(--cyn)' }));
  }
  if ((v.declutter ?? 0) > 0) {
    out.push(
      txt(v.declutter === 1 ? 'DECLUTTER-1' : 'DECLUTTER-2', 4, MAP.y + MAP.h - 10, {
        size: 6.5,
        color: 'var(--amb)',
      })
    );
  }

  const fields = [
    ['WPT', v.nav?.to ?? '- - -'],
    ['DTK', v.nav ? deg3(v.nav.dtk) : '---°'],
    ['DIS', v.nav ? `${v.nav.dis.toFixed(1)}n` : '--.-n'],
    ['GS', `${Math.round(v.groundSpeed)}k`],
  ];
  fields.forEach(([label, val], i) => {
    const y = 14 + i * 26;
    out.push(txt(label, MAP_DATA_X, y, { size: 7, color: 'var(--cyn)', bold: true }));
    out.push(txt(val, MAP_DATA_X, y + 8, { size: 11, bold: true }));
  });

  return out.join('');
}

// --- nearest ---------------------------------------------------------------

function nrstPage(v) {
  const out = [];
  out.push(fill(0, 0, W, 10, 'var(--panel)'));
  out.push(txt('NEAREST AIRPORTS', W / 2, 1, { size: 8, a: 'c', w: W, color: '#fff', bold: true }));
  ['ARPT', 'BRG', 'DIS', 'RWY'].forEach((h, i) =>
    out.push(txt(h, [6, 96, 146, 200][i], 12, { size: 7, color: 'var(--cyn)', bold: true }))
  );

  const rows = v.nrst.rows;
  if (!rows.length) {
    out.push(txt('NONE WITHIN 200 NM', W / 2, 50, { size: 9, a: 'c', w: W, color: 'var(--amb)' }));
    return out.join('');
  }

  // Scroll so the highlighted row stays on screen.
  const perPage = Math.max(4, Math.floor((H - 12 - 22) / 13));
  const first = Math.max(0, Math.min(rows.length - perPage, v.nrst.index - 3));
  for (let r = 0; r < Math.min(perPage, rows.length - first); r++) {
    const row = rows[first + r];
    const y = 22 + r * 13;
    const sel = v.cursor && first + r === v.nrst.index;
    if (sel) out.push(fill(2, y - 1, W - 8, 12, 'var(--amb)'));
    const ink = sel ? '#000' : 'var(--grn)';
    out.push(txt(row.id, 6, y, { size: 10, color: ink, bold: true }));
    out.push(txt(deg3(row.brg), 128, y, { size: 10, a: 'r', w: 34, color: ink, bold: true }));
    out.push(txt(row.dis.toFixed(1), 178, y, { size: 10, a: 'r', w: 34, color: ink, bold: true }));
    out.push(
      txt(row.rwy ? String(row.rwy) : '---', 232, y, { size: 10, a: 'r', w: 36, color: ink, bold: true })
    );
  }

  if (rows.length > perPage) {
    const track = perPage * 13 - 2;
    const barH = Math.max(8, (perPage / rows.length) * track);
    out.push(box(234, 20, 4, track, { stroke: 'var(--cyn)' }));
    out.push(fill(235, 20 + (first / rows.length) * track, 2, barH, 'var(--cyn)'));
  }
  return out.join('');
}

// --- waypoint pages --------------------------------------------------------

function wptHeader(v, title) {
  const out = [fill(0, 0, W, 10, 'var(--panel)')];
  out.push(txt(title, W / 2, 1, { size: 8, a: 'c', w: W, color: '#fff', bold: true }));

  const e = v.wpt.entry;
  const cellW = 13;
  const x0 = 6;
  if (e) {
    for (let i = 0; i < e.ident.length; i++) {
      const on = v.cursor && i === e.i;
      if (on) out.push(fill(x0 + i * cellW, 13, cellW - 1, 15, 'var(--amb)'));
      out.push(
        txt(e.ident[i] === ' ' ? '_' : e.ident[i], x0 + i * cellW, 14, {
          size: 13,
          a: 'c',
          w: cellW - 1,
          color: on ? '#000' : 'var(--grn)',
          bold: true,
        })
      );
    }
  }
  const s = v.wpt.selected;
  if (s) {
    out.push(txt(s.k, W - 4, 14, { size: 8, a: 'r', w: 30, color: 'var(--cyn)', bold: true }));
    out.push(txt((s.n ?? '').slice(0, 26), 80, 16, { size: 7.5, color: 'var(--cyn)' }));
  }
  return out.join('');
}

function wptLocation(v) {
  const out = [wptHeader(v, 'WAYPOINT - LOCATION')];
  const s = v.wpt.selected;
  if (!s) {
    out.push(txt('SELECT A WAYPOINT', W / 2, 60, { size: 9, a: 'c', w: W, color: 'var(--amb)' }));
    return out.join('');
  }
  const lines = [
    ['CITY', [s.c, s.r].filter(Boolean).join(', ') || '---'],
    ['ELEV', s.e == null ? '---' : `${s.e} ft`],
    ['LAT', `${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lat).toFixed(4)}°`],
    ['LON', `${s.lon >= 0 ? 'E' : 'W'} ${Math.abs(s.lon).toFixed(4)}°`],
  ];
  if (s.f) lines.push(['FREQ', (s.f / 1000).toFixed(2)]);
  lines.forEach(([k, val], i) => {
    out.push(txt(k, 8, 36 + i * 15, { size: 8, color: 'var(--cyn)', bold: true }));
    out.push(txt(val, 62, 34 + i * 15, { size: 11, bold: true }));
  });
  return out.join('');
}

function wptRunways(v) {
  const out = [wptHeader(v, 'WAYPOINT - RUNWAYS')];
  const s = v.wpt.selected;
  const rwy = s?.rwy ?? [];
  if (!rwy.length) {
    out.push(txt('NO RUNWAY DATA', W / 2, 60, { size: 9, a: 'c', w: W, color: 'var(--amb)' }));
    return out.join('');
  }
  ['RUNWAY', 'LENGTH', 'SURFACE'].forEach((h, i) =>
    out.push(txt(h, [8, 96, 168][i], 30, { size: 7, color: 'var(--cyn)', bold: true }))
  );
  rwy.slice(0, 5).forEach((r, i) => {
    const y = 42 + i * 14;
    out.push(txt(r.id, 8, y, { size: 11, bold: true }));
    out.push(txt(`${r.len}${r.wid ? `x${r.wid}` : ''}`, 96, y, { size: 11, bold: true }));
    out.push(txt(r.surf || '---', 168, y, { size: 10, bold: true }));
    if (r.lit) out.push(txt('L', 228, y, { size: 10, color: 'var(--amb)', bold: true }));
  });
  return out.join('');
}

function wptFreq(v) {
  const out = [wptHeader(v, 'WAYPOINT - FREQUENCY')];
  const s = v.wpt.selected;
  const freq = s?.freq ?? [];
  if (!freq.length) {
    out.push(txt('NO FREQUENCY DATA', W / 2, 60, { size: 9, a: 'c', w: W, color: 'var(--amb)' }));
    return out.join('');
  }
  freq.slice(0, 6).forEach((f, i) => {
    const y = 32 + i * 14;
    out.push(txt(f.d.slice(0, 22), 8, y, { size: 8, color: 'var(--cyn)', bold: true }));
    out.push(txt(f.f, 232, y - 1, { size: 11, a: 'r', w: 50, bold: true }));
  });
  return out.join('');
}

// --- procedures ------------------------------------------------------------

function procPage(v) {
  const p = v.proc;
  const out = [fill(0, 0, W, 10, 'var(--panel)')];
  out.push(
    txt(`PROCEDURES - ${p.apt}`, W / 2, 1, { size: 8, a: 'c', w: W, color: '#fff', bold: true })
  );

  if (p.state === 'LOADING') {
    out.push(txt('LOADING…', W / 2, 56, { size: 11, a: 'c', w: W, color: 'var(--cyn)', bold: true }));
    return out.join('');
  }

  const list = (title, items, sel, y0) => {
    out.push(txt(title, 8, 14, { size: 8, color: 'var(--cyn)', bold: true }));
    const perPage = Math.max(4, Math.floor((H - 16 - y0) / 14));
    const first = Math.max(0, Math.min(items.length - perPage, sel - 2));
    for (let i = 0; i < Math.min(perPage, items.length - first); i++) {
      const y = y0 + i * 14;
      const on = first + i === sel;
      if (on) out.push(fill(6, y - 1, W - 14, 13, 'var(--amb)'));
      out.push(
        txt(items[first + i], 10, y, { size: 11, color: on ? '#000' : 'var(--grn)', bold: true })
      );
    }
    if (items.length > perPage) {
      out.push(box(W - 7, y0 - 1, 4, perPage * 14, { stroke: 'var(--cyn)' }));
      const barH = Math.max(6, (perPage / items.length) * (perPage * 14 - 2));
      out.push(fill(W - 6, y0 + (first / items.length) * (perPage * 14 - 2), 2, barH, 'var(--cyn)'));
    }
  };

  if (p.state === 'APPROACHES') {
    list('SELECT APPROACH', p.approaches, p.sel, 26);
  } else if (p.state === 'TRANSITIONS') {
    out.push(txt(p.approachName, 130, 14, { size: 8, a: 'r', w: 100, bold: true }));
    list('SELECT TRANSITION', p.transitions, p.tsel, 26);
  } else {
    out.push(txt(`${p.approachName}`, 8, 26, { size: 12, bold: true }));
    out.push(txt(`via ${p.transition}`, 8, 42, { size: 9, color: 'var(--cyn)' }));
    ['Load?', 'Activate?'].forEach((label, i) => {
      const x = 40 + i * 90;
      const on = i === p.csel;
      if (on) out.push(fill(x, 68, 74, 17, 'var(--amb)'));
      out.push(box(x, 68, 74, 17));
      out.push(
        txt(label, x + 37, 71, { size: 11, a: 'c', w: 74, color: on ? '#000' : 'var(--grn)', bold: true })
      );
    });
    out.push(
      txt('Load adds it to the flight plan; Activate flies it now', W / 2, H - 32, {
        size: 6.6,
        a: 'c',
        w: W,
        color: 'var(--cyn)',
      })
    );
  }
  return out.join('');
}

function messageOverlay(v) {
  const w = 160;
  const h = 34;
  const x = (W - w) / 2;
  const y = 44;
  return (
    fill(x, y, w, h, '#000') +
    box(x, y, w, h, { stroke: 'var(--amb)' }) +
    txt(v.message, W / 2, y + 8, { size: 10, a: 'c', w, color: 'var(--amb)', bold: true }) +
    txt('press ENT', W / 2, y + 22, { size: 7, a: 'c', w, color: 'var(--cyn)' })
  );
}

/** Build the screen HTML for a view produced by GNS#view. */
export function renderScreen(v) {
  setCanvas(v.px ?? { w: 240, h: 128 });
  MAP = mapBox();
  let body;
  if (v.mode === 'DTO') body = directTo(v);
  else if (v.mode === 'PROC') body = procPage(v);
  else if (v.mode === 'FPL') body = flightPlan(v) + statusBar(v);
  else if (v.mode === 'MENU') {
    const under =
      v.menu.from === 'FPL'
        ? flightPlan(v)
        : v.page === 'NRST_AIRPORT'
          ? nrstPage(v)
          : v.page === 'MAP'
            ? mapPage(v)
            : defaultNav(v);
    body = under + menu(v);
  } else if (v.page === 'DEFAULT_NAV') body = defaultNav(v) + statusBar(v);
  else if (v.page === 'MAP') body = mapPage(v) + statusBar(v);
  else if (v.page === 'NAVCOM')
    body =
      simplePage(v, 'NAV/COM', [
        `COM  ${v.com.active}  /  ${v.com.standby}`,
        `VLOC ${v.vloc.active}  /  ${v.vloc.standby}`,
        `tuning: ${v.tuning}`,
      ]) + statusBar(v);
  else if (v.page === 'WPT_LOCATION') body = wptLocation(v) + statusBar(v);
  else if (v.page === 'WPT_RUNWAYS') body = wptRunways(v) + statusBar(v);
  else if (v.page === 'WPT_FREQ') body = wptFreq(v) + statusBar(v);
  else if (v.page === 'AUX_SETUP')
    body =
      simplePage(v, 'AUX - SETUP', [
        `GS    ${Math.round(v.groundSpeed)} kt`,
        `ALT   ${Math.round(v.altitude)} ft`,
        `POS   ${v.pos.lat.toFixed(3)}, ${v.pos.lon.toFixed(3)}`,
        v.approach ? `APPR  ${v.approach.name} via ${v.approach.transition}` : 'APPR  none loaded',
      ]) + statusBar(v);
  else if (v.page === 'NRST_AIRPORT') body = nrstPage(v) + statusBar(v);
  else body = statusBar(v);

  if (v.message) body += messageOverlay(v);
  return body;
}

export const SCREEN_SIZE = { W, H };
