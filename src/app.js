import { eventForRegion, KEYBOARD, CLR_HOLD_MS } from './bezel.js';
import { UNITS, DEFAULT_UNIT, unitFor } from './units.js';
import { NavData } from './navdata.js';
import { Procedures } from './procedures.js';
import { GNS } from './gns.js';
import { renderScreen } from './screen.js';
import { renderGtnScreen } from './gtnscreen.js';
import { setBasemap } from './mapdraw.js';

const unitEl = document.getElementById('unit');
const bezelEl = document.getElementById('bezel');
const screenEl = document.getElementById('screen');
const hitLayer = document.getElementById('hits');
const statusEl = document.getElementById('status');
const unitToggle = document.getElementById('unit-toggle');

// --- data ------------------------------------------------------------------

function loadJson(url, fallback) {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    })
    .catch((err) => {
      console.error(err);
      return fallback;
    });
}

const [raw, procIndex, basemap] = await Promise.all([
  loadJson('./data/navdata.json', null),
  loadJson('./data/proc/index.json', { airports: [] }),
  loadJson('./data/basemap.json', null),
]);

// Without the waypoint database there is no trainer; say so rather than
// leaving the page stuck on "loading…" with nothing in the console.
if (!raw?.waypoints?.length) {
  statusEl.textContent =
    'Could not load data/navdata.json — serve the project with `npm start` and reload.';
  throw new Error('navdata unavailable');
}

setBasemap(basemap);

// Approach files are fetched per airport, so nothing large loads up front.
const procedures = new Procedures(new Set(procIndex.airports), (apt) =>
  fetch(`./data/proc/${apt}.json`).then((r) => r.json())
);

// --- preferences -----------------------------------------------------------

const UNIT_KEY = 'directto.unit';

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private browsing
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice just won't persist.
  }
}

let unit = unitFor(readStore(UNIT_KEY) ?? DEFAULT_UNIT);

const gns = new GNS(new NavData(raw.waypoints), {
  unit: unit.id,
  procedures,
  onLoadProcs: async (apt) => {
    const list = await procedures.approaches(apt);
    gns.proceduresReady(apt, list);
    render();
  },
});

// --- faceplate -------------------------------------------------------------
//
// Both faceplates and every hit region are authored in the unit's own
// coordinate space, so switching units rebuilds these three things and nothing
// else in the app has to know.

const grid = document.createElement('div');
grid.id = 'grid';
grid.className = 'unit-grid';

function buildFaceplate() {
  const { bezel, screen, regions, art } = unit;

  unitEl.style.setProperty('--bw', bezel.w);
  unitEl.style.setProperty('--bh', bezel.h);

  bezelEl.innerHTML = art();

  Object.assign(screenEl.style, {
    left: `${(screen.x / bezel.w) * 100}%`,
    top: `${(screen.y / bezel.h) * 100}%`,
    width: `${(screen.w / bezel.w) * 100}%`,
    height: `${(screen.h / bezel.h) * 100}%`,
  });

  grid.style.width = `${unit.px.w}px`;
  grid.style.height = `${unit.px.h}px`;
  grid.dataset.family = unit.family ?? 'GNS';
  if (grid.parentElement !== screenEl) screenEl.appendChild(grid);

  // Smaller regions win, so a knob's centre push beats the rotate halves it
  // sits inside.
  hitLayer.innerHTML = '';
  for (const r of [...regions].sort((a, b) => a.w * a.h - b.w * b.h)) {
    const b = document.createElement('button');
    b.className = 'hit';
    b.dataset.id = r.id;
    b.title = r.title;
    b.setAttribute('aria-label', r.title);
    Object.assign(b.style, {
      left: `${(r.x / bezel.w) * 100}%`,
      top: `${(r.y / bezel.h) * 100}%`,
      width: `${(r.w / bezel.w) * 100}%`,
      height: `${(r.h / bezel.h) * 100}%`,
    });
    hitLayer.appendChild(b);
  }

  fitScreen();
}

/** Scale the unit's pixel grid to whatever size the screen cutout ended up. */
function fitScreen() {
  const r = screenEl.getBoundingClientRect();
  if (!r.width) return;
  grid.style.transform = `scale(${r.width / unit.px.w}, ${r.height / unit.px.h})`;
}

// --- toggles ---------------------------------------------------------------

function setUnit(id) {
  unit = unitFor(id);
  gns.unit = unit;
  writeStore(UNIT_KEY, unit.id);
  for (const b of unitToggle.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.unit === unit.id));
  }
  buildFaceplate();
  render();
}

for (const [id, u] of Object.entries(UNITS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.unit = id;
  b.textContent = u.short;
  b.title = u.name;
  unitToggle.appendChild(b);
}

unitToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  // The button keeps focus after a click, which would otherwise swallow every
  // keyboard shortcut until you click elsewhere.
  btn.blur();
  if (btn.dataset.unit !== unit.id) setUnit(btn.dataset.unit);
});

// --- input -----------------------------------------------------------------

function flash(id) {
  const el = hitLayer.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 90);
  }
  // The 430 draws RNG as a single rocker; the 530 has separate halves.
  const art =
    document.getElementById(`art-${id}`) ??
    (id.startsWith('RNG') ? document.getElementById('art-RNG') : null);
  if (art) {
    art.classList.add('pressed');
    setTimeout(() => art.classList.remove('pressed'), 90);
  }
}

function fire(id) {
  const ev = eventForRegion(id);
  if (!ev) return;
  gns.handle(ev);
  flash(id);
  render();
}

// CLR is press-and-hold for "go to default NAV", so it needs down/up handling.
let clrTimer = null;
let clrFired = false;

hitLayer.addEventListener('pointerdown', (e) => {
  const id = e.target.dataset?.id;
  if (!id) return;
  e.preventDefault();
  if (id === 'CLR') {
    clrFired = false;
    clrTimer = setTimeout(() => {
      clrFired = true;
      gns.handle({ type: 'hold', key: 'CLR' });
      flash('CLR');
      render();
    }, CLR_HOLD_MS);
    return;
  }
  fire(id);
});

hitLayer.addEventListener('pointerup', (e) => {
  if (e.target.dataset?.id !== 'CLR') return;
  clearTimeout(clrTimer);
  if (!clrFired) fire('CLR');
});

hitLayer.addEventListener('pointerleave', () => clearTimeout(clrTimer), true);

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'BUTTON') return;
  const id = KEYBOARD[e.key] ?? KEYBOARD[e.key.toLowerCase()];
  if (!id) return;
  // Only act on controls this unit actually has.
  if (!unit.regions.some((r) => r.id === id)) return;
  e.preventDefault();
  if (id === 'CLR' && e.shiftKey) {
    gns.handle({ type: 'hold', key: 'CLR' });
    flash('CLR');
    render();
    return;
  }
  fire(id);
});

// --- render loop -----------------------------------------------------------

function render() {
  const v = gns.view;
  grid.innerHTML = v.family === 'GTN' ? renderGtnScreen(v) : renderScreen(v);
  statusEl.textContent = v.nav
    ? `→ ${v.nav.to}   ${v.nav.dis.toFixed(1)} nm   DTK ${Math.round(v.nav.dtk)}°   GS ${Math.round(v.groundSpeed)} kt`
    : 'no active waypoint — press D→ and spell an identifier';
}

// A touchscreen unit draws its own controls; forward taps to the state machine.
screenEl.addEventListener('pointerdown', (e) => {
  const target = e.target.closest('[data-touch]')?.dataset.touch;
  if (!target) return;
  e.preventDefault();
  gns.handle({ type: 'touch', target });
  render();
});

// The aircraft flies so distances and the CDI actually move.
setInterval(() => {
  gns.tick(1);
  if (gns.to) render();
}, 1000);

new ResizeObserver(fitScreen).observe(screenEl);

// Exposed for debugging from the console, and for the browser tests.
window.__gns = gns;
window.__render = render;

setUnit(unit.id);
