// The GPS box, embedded next to the radio work.
//
// This is the same unit Direct-To renders — imported from ../../src, not
// copied — so tuning here behaves exactly as it does over there, and fixes to
// the box land in both apps.
//
// Say Again only cares about the COM radio, but showing the whole faceplate is
// the point: you tune the standby with the left knob and flip-flop it, which is
// the fiddly bit worth drilling.

import { GNS } from '../../src/gns.js';
import { NavData } from '../../src/navdata.js';
import { unitFor, UNITS } from '../../src/units.js';
import { eventForRegion } from '../../src/bezel.js';
import { renderScreen } from '../../src/screen.js';
import { renderGtnScreen } from '../../src/gtnscreen.js';

/** A live GNS/GTN faceplate you can tune. */
export class RadioStack {
  /**
   * @param {{mount: HTMLElement, unit?: string, waypoints?: any[], onChange?: Function}} opts
   */
  constructor({ mount, unit = 'GNS430', waypoints = [], onChange } = {}) {
    this.mount = mount;
    this.onChange = onChange;
    this.unit = unitFor(unit);
    this.gns = new GNS(new NavData(waypoints), { unit: this.unit.id });

    // The unit-* classes carry the shared styling from shared/unit.css, so the
    // faceplate and screen look the same here as they do in Direct-To.
    mount.innerHTML =
      '<div class="stack-unit"><div class="stack-bezel unit-bezel"></div>' +
      '<div class="stack-screen"><div class="stack-grid unit-grid"></div></div>' +
      '<div class="stack-hits unit-hits"></div></div>';
    this.unitEl = mount.querySelector('.stack-unit');
    this.bezelEl = mount.querySelector('.stack-bezel');
    this.screenEl = mount.querySelector('.stack-screen');
    this.gridEl = mount.querySelector('.stack-grid');
    this.hitsEl = mount.querySelector('.stack-hits');

    this.hitsEl.addEventListener('pointerdown', (e) => {
      const id = e.target.dataset?.id;
      if (!id) return;
      e.preventDefault();
      const ev = eventForRegion(id);
      if (!ev) return;
      this.gns.handle(ev);
      const el = e.target;
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 90);
      this.render();
      this.onChange?.(this.frequencies);
    });

    this.build();
    new ResizeObserver(() => this.fit()).observe(this.screenEl);
  }

  /** Swap which box is on the panel. */
  setUnit(id) {
    if (id === this.unit.id) return;
    this.unit = unitFor(id);
    this.gns.unit = this.unit;
    this.build();
  }

  build() {
    const { bezel, screen, regions, art, px } = this.unit;
    this.unitEl.style.setProperty('--bw', bezel.w);
    this.unitEl.style.setProperty('--bh', bezel.h);
    this.bezelEl.innerHTML = art();

    Object.assign(this.screenEl.style, {
      left: `${(screen.x / bezel.w) * 100}%`,
      top: `${(screen.y / bezel.h) * 100}%`,
      width: `${(screen.w / bezel.w) * 100}%`,
      height: `${(screen.h / bezel.h) * 100}%`,
    });
    this.gridEl.style.width = `${px.w}px`;
    this.gridEl.style.height = `${px.h}px`;
    this.gridEl.dataset.family = this.unit.family ?? 'GNS';

    // Smaller regions win, so a knob's centre push beats the rotate halves.
    this.hitsEl.innerHTML = '';
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
      this.hitsEl.appendChild(b);
    }
    this.render();
    this.fit();
  }

  fit() {
    const r = this.screenEl.getBoundingClientRect();
    if (!r.width) return;
    this.gridEl.style.transform = `scale(${r.width / this.unit.px.w}, ${r.height / this.unit.px.h})`;
  }

  render() {
    const v = this.gns.view;
    this.gridEl.innerHTML = v.family === 'GTN' ? renderGtnScreen(v) : renderScreen(v);
  }

  /** What is tuned right now. */
  get frequencies() {
    const v = this.gns.view;
    return { comActive: v.com.active, comStandby: v.com.standby, tuning: v.tuning };
  }

  /** Is this frequency the one currently being transmitted on? */
  isActive(mhz) {
    return sameFreq(this.frequencies.comActive, mhz);
  }

  /** Tuned into standby but not yet swapped across. */
  isStandby(mhz) {
    return sameFreq(this.frequencies.comStandby, mhz);
  }

  /**
   * Put the aeroplane where the scenario says it is.
   *
   * Without this the box sits at its default position in Virginia, so a
   * Direct-To from a Boston-area field reads a few hundred miles and the map
   * shows empty ocean.
   */
  setPosition({ lat, lon }, track) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    this.gns.pos = { lat, lon };
    if (Number.isFinite(track)) this.gns.track = track;
    this.render();
  }

  /** Preset the box, for starting a scenario already on the right frequency. */
  setCom(active, standby) {
    if (active) this.gns.com.active = Number(active).toFixed(3);
    if (standby) this.gns.com.standby = Number(standby).toFixed(3);
    this.render();
  }

  static get units() {
    return Object.values(UNITS).map((u) => ({ id: u.id, short: u.short, name: u.name }));
  }
}

/** COM frequencies compare on value, not on how many zeros were typed. */
export function sameFreq(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 0.0005;
}
