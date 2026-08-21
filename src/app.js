import { BEZEL, SCREEN, REGIONS, eventForRegion, KEYBOARD, CLR_HOLD_MS } from './bezel.js';
import { bezelSvg } from './bezelart.js';
import { NavData } from './navdata.js';
import { Procedures } from './procedures.js';
import { GNS } from './gns.js';
import { renderScreen, setBasemap, SCREEN_SIZE } from './screen.js';

const unit = document.getElementById('unit');
const screenEl = document.getElementById('screen');
const hitLayer = document.getElementById('hits');
const statusEl = document.getElementById('status');

const [raw, procIndex, basemap] = await Promise.all([
  fetch('./data/navdata.json').then((r) => r.json()),
  fetch('./data/proc/index.json')
    .then((r) => r.json())
    .catch(() => ({ airports: [] })),
  fetch('./data/basemap.json')
    .then((r) => r.json())
    .catch(() => null),
]);

setBasemap(basemap);

// Approach files are fetched per airport, so nothing large loads up front.
const procedures = new Procedures(new Set(procIndex.airports), (apt) =>
  fetch(`./data/proc/${apt}.json`).then((r) => r.json())
);

const gns = new GNS(new NavData(raw.waypoints), {
  procedures,
  onLoadProcs: async (apt) => {
    const list = await procedures.approaches(apt);
    gns.proceduresReady(apt, list);
    render();
  },
});

// --- layout ---------------------------------------------------------------

document.querySelector('#bezel .skin-modern').innerHTML = bezelSvg();

// --- faceplate style -------------------------------------------------------
// Both faceplates share the 446x186 coordinate space, so the hit regions and
// the screen need no adjustment when switching.

const SKIN_KEY = 'directto.skin';
const skinToggle = document.getElementById('skin-toggle');

let originalAvailable = true;

function setSkin(skin) {
  if (skin === 'original' && !originalAvailable) skin = 'modern';
  unit.dataset.skin = skin;
  for (const b of skinToggle.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.skin === skin));
  }
  try {
    localStorage.setItem(SKIN_KEY, skin);
  } catch {
    // Private browsing; the choice just won't persist.
  }
}

skinToggle.addEventListener('click', (e) => {
  const skin = e.target.closest('button')?.dataset.skin;
  if (skin) setSkin(skin);
});

// The original artwork is Garmin's and is not distributed with the source, so
// the Original skin is only offered when the bitmap is actually present.
const originalImg = document.querySelector('#bezel .skin-original');
const originalBtn = skinToggle.querySelector('[data-skin="original"]');

function disableOriginal() {
  originalAvailable = false;
  originalBtn.disabled = true;
  originalBtn.title =
    'Needs assets/bezel-430.png, extracted from your own copy of the Garmin trainer installer. See the README.';
  // The image can fail before or after the saved preference is applied, so
  // re-assert the skin either way.
  setSkin(unit.dataset.skin);
}

originalImg.addEventListener('error', disableOriginal);
if (originalImg.complete && originalImg.naturalWidth === 0) disableOriginal();

let saved = null;
try {
  saved = localStorage.getItem(SKIN_KEY);
} catch {
  // Private browsing.
}
setSkin(saved === 'original' ? 'original' : 'modern');

unit.style.setProperty('--bw', BEZEL.w);
unit.style.setProperty('--bh', BEZEL.h);
Object.assign(screenEl.style, {
  left: `${(SCREEN.x / BEZEL.w) * 100}%`,
  top: `${(SCREEN.y / BEZEL.h) * 100}%`,
  width: `${(SCREEN.w / BEZEL.w) * 100}%`,
  height: `${(SCREEN.h / BEZEL.h) * 100}%`,
});

/** Scale the 240x128 grid to whatever size the screen cutout ended up. */
function fitScreen() {
  const r = screenEl.getBoundingClientRect();
  const grid = screenEl.firstElementChild;
  grid.style.transform = `scale(${r.width / SCREEN_SIZE.W}, ${r.height / SCREEN_SIZE.H})`;
}

// --- hit regions ----------------------------------------------------------

// Smaller regions win, so a knob's centre push beats the rotate halves it sits inside.
const ordered = [...REGIONS].sort((a, b) => a.w * a.h - b.w * b.h);

for (const r of ordered) {
  const b = document.createElement('button');
  b.className = 'hit';
  b.dataset.id = r.id;
  b.title = r.title;
  b.setAttribute('aria-label', r.title);
  Object.assign(b.style, {
    left: `${(r.x / BEZEL.w) * 100}%`,
    top: `${(r.y / BEZEL.h) * 100}%`,
    width: `${(r.w / BEZEL.w) * 100}%`,
    height: `${(r.h / BEZEL.h) * 100}%`,
  });
  hitLayer.appendChild(b);
}

// Knob rotate regions have no key of their own; light the knob's other art.
const ART_FOR = { RNG_UP: 'RNG', RNG_DOWN: 'RNG' };

function flash(id) {
  const el = hitLayer.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 90);
  }
  const art = document.getElementById(`art-${ART_FOR[id] ?? id}`);
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
  const id = e.target.dataset?.id;
  if (id !== 'CLR') return;
  clearTimeout(clrTimer);
  if (!clrFired) fire('CLR');
});

hitLayer.addEventListener('pointerleave', () => clearTimeout(clrTimer), true);

// --- keyboard -------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const id = KEYBOARD[e.key] ?? KEYBOARD[e.key.toLowerCase()];
  if (!id) return;
  e.preventDefault();
  if (id === 'CLR' && e.shiftKey) {
    gns.handle({ type: 'hold', key: 'CLR' });
    flash('CLR');
    render();
    return;
  }
  fire(id);
});

// --- render loop ----------------------------------------------------------

const grid = document.createElement('div');
grid.id = 'grid';
grid.style.width = `${SCREEN_SIZE.W}px`;
grid.style.height = `${SCREEN_SIZE.H}px`;
screenEl.appendChild(grid);

function render() {
  grid.innerHTML = renderScreen(gns.view);
  const v = gns.view;
  statusEl.textContent = v.nav
    ? `→ ${v.nav.to}   ${v.nav.dis.toFixed(1)} nm   DTK ${Math.round(v.nav.dtk)}°   GS ${Math.round(v.groundSpeed)} kt`
    : 'no active waypoint — press D→ and spell an identifier';
}

// The aircraft flies so distances and the CDI actually move.
setInterval(() => {
  gns.tick(1);
  if (gns.to) render();
}, 1000);

// Exposed for debugging from the console, and for the browser tests.
window.__gns = gns;
window.__render = render;

const ro = new ResizeObserver(fitScreen);
ro.observe(screenEl);

fitScreen();
render();
