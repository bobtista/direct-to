// Renders the GTN 650Xi's 840x372 touchscreen.
//
// A GTN is nearly all screen, so this module draws the controls too: every
// touchable element carries data-touch, and app.js forwards those to the state
// machine. Behaviour follows the GTN Xi Series Pilot's Guide (190-02327-03).

import { mapLayers, projector } from './mapdraw.js';

const W = 840;
const H = 372;
const BAR = 46; // COM/NAV strip across the top

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A touchable rounded button. */
function btn(touch, x, y, w, h, label, { sub = '', on = false, cls = '', size = 20 } = {}) {
  return (
    `<button class="gbtn ${cls}${on ? ' on' : ''}" data-touch="${touch}" ` +
    `style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">` +
    `<span class="gbtn-l" style="font-size:${size}px">${esc(label)}</span>` +
    (sub ? `<span class="gbtn-s">${esc(sub)}</span>` : '') +
    `</button>`
  );
}

function txt(s, x, y, { size = 16, color = '#e8ecf3', a = 'l', w, bold = false } = {}) {
  const left = a === 'l' ? x : a === 'c' ? x - (w ?? 0) / 2 : x - (w ?? 0);
  return (
    `<span class="gt" style="left:${left}px;top:${y}px;font-size:${size}px;color:${color}` +
    (w != null ? `;width:${w}px;text-align:${a === 'c' ? 'center' : a === 'r' ? 'right' : 'left'}` : '') +
    (bold ? ';font-weight:700' : '') +
    `">${esc(s)}</span>`
  );
}

function panel(x, y, w, h, cls = '') {
  return `<div class="gpanel ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;
}

const deg3 = (v) => (v == null ? '---' : `${String(Math.round(v) % 360).padStart(3, '0')}°`);

// --- top strip --------------------------------------------------------------

function topBar(v, title) {
  const out = [panel(0, 0, W, BAR, 'gbar')];
  // Tapping a frequency swaps it, which is how the GTN flip-flops.
  out.push(
    btn('COM_FF', 6, 5, 250, 36, `${v.com.active}`, {
      sub: `${v.com.standby}`,
      cls: 'gfreq',
      size: 22,
    })
  );
  out.push(
    btn('VLOC_FF', 262, 5, 230, 36, `${v.vloc.active}`, {
      sub: `${v.vloc.standby}`,
      cls: 'gfreq',
      size: 22,
    })
  );
  out.push(txt(title, W - 10, 12, { size: 18, a: 'r', w: 330, color: '#9fb4d0', bold: true }));
  return out.join('');
}

// --- home -------------------------------------------------------------------

const HOME_APPS = [
  { id: 'MAP', label: 'Map', live: true },
  { id: 'FPL', label: 'Flight Plan', live: true },
  { id: 'PROC', label: 'Procedures', live: true },
  { id: 'NRST', label: 'Nearest', live: true },
  { id: 'WPT', label: 'Waypoint Info', live: true },
  { id: 'TRAFFIC', label: 'Traffic' },
  { id: 'TERRAIN', label: 'Terrain' },
  { id: 'WEATHER', label: 'Weather' },
  { id: 'UTILITIES', label: 'Utilities' },
  { id: 'SYSTEM', label: 'System' },
];

function homePage(v) {
  const out = [topBar(v, 'Home')];
  const cols = 5;
  const gap = 10;
  const x0 = 12;
  const y0 = BAR + 12;
  const bw = (W - x0 * 2 - gap * (cols - 1)) / cols;
  const bh = (H - y0 - 12 - gap) / 2;

  HOME_APPS.forEach((app, i) => {
    const x = x0 + (i % cols) * (bw + gap);
    const y = y0 + Math.floor(i / cols) * (bh + gap);
    out.push(
      btn(`APP_${app.id}`, x, y, bw, bh, app.label, {
        cls: app.live ? 'gapp' : 'gapp gdim',
        size: 18,
      })
    );
  });
  return out.join('');
}

// --- direct-to --------------------------------------------------------------

const KEY_ROWS = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ0123', '456789'];

function directTo(v) {
  const out = [topBar(v, 'Direct To')];
  const d = v.gtn.dto;
  const y0 = BAR + 8;

  // Entered identifier, left half.
  out.push(panel(12, y0, 372, 54, 'gfield'));
  out.push(txt(d.ident || '_____', 24, y0 + 10, { size: 32, bold: true, color: '#35ff35' }));
  const m = d.match;
  out.push(txt(m ? m.n.slice(0, 30) : 'no match', 24, y0 + 62, { size: 15, color: '#46d7ff' }));
  out.push(
    txt(m ? [m.c, m.r].filter(Boolean).join(', ') : '', 24, y0 + 82, { size: 15, color: '#46d7ff' })
  );
  if (m && v.gtn.dtoInfo) {
    out.push(
      txt(`${deg3(v.gtn.dtoInfo.brg)}   ${v.gtn.dtoInfo.dis.toFixed(1)} nm`, 24, y0 + 104, {
        size: 17,
        bold: true,
      })
    );
  }

  out.push(btn('DTO_BKSP', 218, y0 + 132, 78, 40, '⌫', { cls: 'gaux', size: 20 }));
  out.push(btn('DTO_CLR', 302, y0 + 132, 82, 40, 'Clear', { cls: 'gaux', size: 16 }));
  out.push(
    btn('DTO_ACTIVATE', 12, y0 + 132, 200, 40, 'Activate', {
      cls: m ? 'gok' : 'gaux gdim',
      size: 18,
    })
  );

  // Keypad, right half.
  // Ten columns must fit inside 840 px; the field column takes what is left.
  const kx = 396;
  const kw = 40;
  const kh = 44;
  const gap = 4;
  KEY_ROWS.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      out.push(
        btn(`KEY_${ch}`, kx + c * (kw + gap), y0 + r * (kh + gap), kw, kh, ch, {
          cls: 'gkey',
          size: 20,
        })
      );
    });
  });
  return out.join('');
}

// --- map --------------------------------------------------------------------

function mapPage(v) {
  const out = [topBar(v, 'Map')];
  const box = { x: 0, y: BAR, w: W - 150, h: H - BAR };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  const opts = {
    pos: v.pos,
    trk: v.nav?.trk ?? 0,
    range: v.mapRange,
    box,
    plan: v.mapPlan ?? [],
    direct: v.mapDirect,
    declutter: v.declutter ?? 0,
  };

  out.push(
    `<svg class="mapsvg" viewBox="0 0 ${W} ${H}" style="left:0;top:0;width:${W}px;height:${H}px">` +
      `<clipPath id="gmapclip"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath>` +
      `<g clip-path="url(#gmapclip)">${mapLayers(opts)}</g></svg>`
  );

  const project = projector(opts);
  const symbol = (p, label, on) => {
    const [x, y] = project(p.lon, p.lat);
    if (x < box.x - 20 || x > box.x + box.w + 20 || y < box.y - 20 || y > box.y + box.h + 20) return;
    const c = on ? '#ff4cf0' : '#35ff35';
    out.push(`<div class="gdot" style="left:${x - 3}px;top:${y - 3}px;background:${c}"></div>`);
    out.push(txt(label, x + 8, y - 9, { size: 14, color: c, bold: true }));
  };
  for (const wp of v.mapPlan ?? []) symbol(wp, wp.id, wp.active);
  if (v.mapDirect) symbol(v.mapDirect.to, v.mapDirect.to.id, true);
  out.push(txt('▲', cx, cy - 12, { size: 22, a: 'c', w: 24, color: '#fff' }));

  // Data strip and zoom controls down the right.
  out.push(panel(W - 148, BAR, 148, H - BAR, 'gside'));
  const fields = [
    ['WPT', v.nav?.to ?? '- - -'],
    ['DTK', v.nav ? deg3(v.nav.dtk) : '---°'],
    ['DIS', v.nav ? `${v.nav.dis.toFixed(1)} nm` : '--.- nm'],
  ];
  fields.forEach(([k, val], i) => {
    const y = BAR + 10 + i * 46;
    out.push(txt(k, W - 138, y, { size: 13, color: '#46d7ff', bold: true }));
    out.push(txt(val, W - 138, y + 16, { size: 20, bold: true, color: '#35ff35' }));
  });
  out.push(btn('RNG_UP', W - 140, H - 96, 62, 40, '+', { cls: 'gaux', size: 22 }));
  out.push(btn('RNG_DOWN', W - 72, H - 96, 62, 40, '−', { cls: 'gaux', size: 22 }));
  out.push(
    txt(`${v.mapRange} nm${v.autoZoom ? '  AUTO' : ''}`, W - 138, H - 46, {
      size: 15,
      color: '#fff',
      bold: true,
    })
  );
  return out.join('');
}

// --- flight plan ------------------------------------------------------------

function flightPlan(v) {
  const out = [topBar(v, 'Flight Plan')];
  const y0 = BAR + 6;
  const rowH = 38;
  const cols = { wpt: 20, dtk: 430, dis: 560, cum: 690 };

  ['WAYPOINT', 'DTK', 'DIS', 'CUM'].forEach((h, i) =>
    out.push(
      txt(h, [cols.wpt, cols.dtk, cols.dis, cols.cum][i], y0, {
        size: 13,
        color: '#46d7ff',
        bold: true,
      })
    )
  );

  const rows = v.fpl.rows;
  if (!rows.length) {
    out.push(txt('Flight plan is empty', W / 2, 170, { size: 20, a: 'c', w: W, color: '#ffd33d' }));
    out.push(btn('APP_HOME', W / 2 - 90, 220, 180, 44, 'Home', { cls: 'gaux', size: 18 }));
    return out.join('');
  }

  const perPage = Math.floor((H - y0 - 26) / rowH);
  rows.slice(0, perPage).forEach((row, i) => {
    const y = y0 + 22 + i * rowH;
    const c = row.active ? '#ff4cf0' : '#35ff35';
    out.push(panel(12, y - 4, W - 24, rowH - 6, 'growrow'));
    out.push(txt(row.id, cols.wpt, y, { size: 22, color: c, bold: true }));
    if (row.name) out.push(txt(row.name.slice(0, 28), cols.wpt + 110, y + 6, { size: 13, color: '#8fa3bd' }));
    out.push(txt(deg3(row.dtk), cols.dtk, y + 2, { size: 19, bold: true, color: c }));
    out.push(txt(row.dis == null ? '---' : row.dis.toFixed(1), cols.dis, y + 2, { size: 19, bold: true, color: c }));
    out.push(txt(row.cum == null ? '---' : row.cum.toFixed(1), cols.cum, y + 2, { size: 19, bold: true, color: c }));
  });
  return out.join('');
}

// --- simple pages -----------------------------------------------------------

function listPage(v, title, rows, touchPrefix, empty) {
  const out = [topBar(v, title)];
  if (!rows.length) {
    out.push(txt(empty, W / 2, 160, { size: 20, a: 'c', w: W, color: '#ffd33d' }));
    return out.join('');
  }
  const rowH = 40;
  const perPage = Math.floor((H - BAR - 16) / rowH);
  rows.slice(0, perPage).forEach((r, i) => {
    const y = BAR + 8 + i * rowH;
    out.push(btn(`${touchPrefix}${r.key}`, 12, y, W - 24, rowH - 6, r.label, { cls: 'grow', size: 19 }));
    if (r.right) out.push(txt(r.right, W - 34, y + 8, { size: 17, a: 'r', w: 260, color: '#35ff35', bold: true }));
  });
  return out.join('');
}

function stubPage(v, title) {
  const out = [topBar(v, title)];
  out.push(txt(`${title} is not implemented`, W / 2, 150, { size: 20, a: 'c', w: W, color: '#ffd33d' }));
  out.push(btn('APP_HOME', W / 2 - 90, 200, 180, 46, 'Home', { cls: 'gaux', size: 18 }));
  return out.join('');
}

// --- entry point ------------------------------------------------------------

export function renderGtnScreen(v) {
  const page = v.gtn.page;
  let body;
  if (page === 'HOME') body = homePage(v);
  else if (page === 'DTO') body = directTo(v);
  else if (page === 'MAP') body = mapPage(v);
  else if (page === 'FPL') body = flightPlan(v);
  else if (page === 'NRST') {
    body = listPage(
      v,
      'Nearest Airports',
      v.nrst.rows.map((r) => ({
        key: r.id,
        label: `${r.id}   ${r.name?.slice(0, 24) ?? ''}`,
        right: `${deg3(r.brg)}   ${r.dis.toFixed(1)} nm`,
      })),
      'NRST_',
      'No airports within 200 nm'
    );
  } else if (page === 'PROC') {
    const p = v.proc;
    if (!p) body = stubPage(v, 'Procedures');
    else if (p.state === 'LOADING') {
      body = topBar(v, 'Procedures') + txt('Loading…', W / 2, 160, { size: 22, a: 'c', w: W, color: '#46d7ff' });
    } else if (p.state === 'APPROACHES') {
      body = listPage(
        v,
        `Approaches — ${p.apt}`,
        p.approaches.map((n, i) => ({ key: i, label: n })),
        'PROC_A_',
        'No published approaches'
      );
    } else if (p.state === 'TRANSITIONS') {
      body = listPage(
        v,
        `${p.approachName} — Transition`,
        p.transitions.map((n, i) => ({ key: i, label: n })),
        'PROC_T_',
        'No transitions'
      );
    } else {
      const out = [topBar(v, 'Load Approach')];
      out.push(txt(p.approachName, 24, BAR + 20, { size: 28, bold: true }));
      out.push(txt(`via ${p.transition}`, 24, BAR + 60, { size: 18, color: '#46d7ff' }));
      out.push(btn('PROC_LOAD', 24, BAR + 110, 240, 56, 'Load', { cls: 'gaux', size: 20 }));
      out.push(btn('PROC_ACTIVATE', 288, BAR + 110, 240, 56, 'Activate', { cls: 'gok', size: 20 }));
      body = out.join('');
    }
  } else if (page === 'WPT') {
    const s = v.wpt.selected;
    const out = [topBar(v, 'Waypoint Info')];
    if (!s) out.push(txt('No waypoint selected', W / 2, 160, { size: 20, a: 'c', w: W, color: '#ffd33d' }));
    else {
      out.push(txt(s.id, 24, BAR + 14, { size: 34, bold: true, color: '#35ff35' }));
      out.push(txt(s.n ?? '', 24, BAR + 58, { size: 17, color: '#46d7ff' }));
      out.push(txt([s.c, s.r].filter(Boolean).join(', '), 24, BAR + 82, { size: 17, color: '#46d7ff' }));
      (s.freq ?? []).slice(0, 5).forEach((f, i) => {
        const y = BAR + 8 + i * 32;
        out.push(txt(f.d.slice(0, 20), 430, y, { size: 15, color: '#46d7ff' }));
        out.push(txt(f.f, W - 24, y, { size: 19, a: 'r', w: 140, bold: true, color: '#35ff35' }));
      });
    }
    body = out.join('');
  } else body = stubPage(v, page);

  if (v.message) {
    body +=
      panel(W / 2 - 220, 120, 440, 120, 'gmsg') +
      txt(v.message, W / 2, 150, { size: 22, a: 'c', w: 440, color: '#ffd33d', bold: true }) +
      btn('MSG_OK', W / 2 - 60, 186, 120, 44, 'OK', { cls: 'gaux', size: 18 });
  }
  return body;
}
