// GNS 430W state machine.
//
// Deliberately free of any DOM reference: it consumes the event stream that
// bezel.js produces and exposes a plain-object view for screen.js to render.
// That keeps it testable under plain node.
//
// Behaviour follows the 400W-series Pilot's Guide (190-00356-00): Direct-To in
// Section 3, flight plans in Section 4, procedures in Section 5.

import { distanceNm, bearingDeg, project, crossTrackNm } from './navdata.js';
import { IdentEntry } from './ident.js';
import { approachLegs, transitionNames } from './procedures.js';

export const PAGE_GROUPS = [
  { id: 'NAV', pages: ['DEFAULT_NAV', 'MAP', 'NAVCOM'] },
  { id: 'WPT', pages: ['WPT_LOCATION', 'WPT_RUNWAYS', 'WPT_FREQ'] },
  { id: 'AUX', pages: ['AUX_SETUP'] },
  { id: 'NRST', pages: ['NRST_AIRPORT'] },
];

export const MAP_RANGES = [1, 2, 3, 5, 10, 15, 20, 30, 40, 60, 80, 100, 150, 200];

/** Sequence to the next leg once inside this distance of the active waypoint. */
const SEQUENCE_NM = 0.6;

export class GNS {
  /** @param {import('./navdata.js').NavData} navdata */
  constructor(navdata, opts = {}) {
    this.db = navdata;
    this.procs = opts.procedures ?? null;
    this.onLoadProcs = opts.onLoadProcs ?? null;

    // Aircraft state. The trainer flies a simple constant-speed model.
    this.pos = opts.start ?? { lat: 39.078, lon: -77.5575 }; // KJYO
    this.groundSpeed = 120;
    this.altitude = 4500;
    this.track = 270;

    this.group = 0;
    this.page = 0;
    this.mode = 'PAGE';

    this.cursor = false;
    this.mapRange = 5;
    // Auto zoom steps down from 200 nm to 1 nm as you close on the destination
    // (Pilot's Guide, Map Page Auto Zoom). Touching RNG hands control back.
    this.autoZoom = true;
    // CLR on the map page steps through detail levels (Pilot's Guide: "press
    // the CLR key momentarily to select the desired amount of map detail").
    this.declutter = 0;

    this.com = { active: '121.700', standby: '125.450' };
    this.vloc = { active: '114.80', standby: '117.95' };
    this.tuning = 'COM';

    this.dto = null;
    this.menu = null;
    this.message = null;
    this.proc = null;
    this.approach = null;

    /** @type {{id:string,lat:number,lon:number}[]} */
    this.flightPlan = [];
    this.fplCursorRow = 0;
    this.fplEdit = null;

    // Navigation: a Direct-To overrides the flight plan leg while it is active.
    this.dtoTarget = null;
    this.dtoFrom = null;
    this.legIndex = -1;

    this.navSource = 'GPS';
    this.obs = false;

    // WPT pages look at whichever airport you've selected there.
    this.wptEntry = null;
    this.wptSelected = null;
    this.nrstIndex = 0;
  }

  // --- navigation targets --------------------------------------------------

  get to() {
    if (this.dtoTarget) return this.dtoTarget;
    return this.legIndex >= 0 ? this.flightPlan[this.legIndex] ?? null : null;
  }

  get from() {
    if (this.dtoTarget) return this.dtoFrom;
    return this.legIndex > 0 ? this.flightPlan[this.legIndex - 1] ?? null : null;
  }

  /** Destination airport, which is what PROC offers approaches for. */
  get destination() {
    const last = this.flightPlan[this.flightPlan.length - 1];
    if (last && this.db.exact(last.id)?.k === 'APT') return last.id;
    if (this.dtoTarget && this.db.exact(this.dtoTarget.id)?.k === 'APT') return this.dtoTarget.id;
    return null;
  }

  // --- event entry point ---------------------------------------------------

  handle(ev) {
    if (!ev) return;
    if (ev.type === 'knob') this.#knob(ev.knob, ev.dir);
    else if (ev.type === 'press') this.#press(ev.key);
    else if (ev.type === 'hold' && ev.key === 'CLR') this.#defaultNav();
  }

  #defaultNav() {
    this.mode = 'PAGE';
    this.group = 0;
    this.page = 0;
    this.cursor = false;
    this.dto = null;
    this.menu = null;
    this.proc = null;
    this.fplEdit = null;
  }

  // --- knobs ---------------------------------------------------------------

  #knob(knob, dir) {
    switch (knob) {
      case 'RIGHT_LARGE':
        return this.#largeRight(dir);
      case 'RIGHT_SMALL':
        return this.#smallRight(dir);
      case 'LEFT_LARGE':
        return this.#tuneFreq(dir, 'whole');
      case 'LEFT_SMALL':
        return this.#tuneFreq(dir, 'fraction');
      default:
        return; // volume knobs are audio only
    }
  }

  #largeRight(dir) {
    if (this.mode === 'DTO') return this.dto.entry.move(dir);
    if (this.mode === 'MENU') return;
    if (this.mode === 'PROC') return this.#procMove(dir);
    if (this.mode === 'FPL') return this.#fplMoveCursor(dir);

    if (this.cursor) {
      const page = this.page_;
      if (page === 'NRST_AIRPORT') {
        this.nrstIndex = Math.max(0, Math.min(this.nearest.length - 1, this.nrstIndex + dir));
        return;
      }
      if (this.wptEntry) return this.wptEntry.move(dir);
      return;
    }

    this.group = (this.group + dir + PAGE_GROUPS.length) % PAGE_GROUPS.length;
    this.page = 0;
    this.cursor = false;
  }

  #smallRight(dir) {
    if (this.mode === 'DTO') return this.dto.entry.spin(dir);
    if (this.mode === 'MENU') {
      const n = this.menu.items.length;
      this.menu.sel = (this.menu.sel + dir + n) % n;
      return;
    }
    if (this.mode === 'PROC') return this.#procSpin(dir);
    if (this.mode === 'FPL') return this.#fplSpin(dir);

    if (this.cursor && this.wptEntry) return this.wptEntry.spin(dir);

    const pages = PAGE_GROUPS[this.group].pages;
    this.page = (this.page + dir + pages.length) % pages.length;
    this.#onPageChange();
  }

  get page_() {
    return PAGE_GROUPS[this.group].pages[this.page];
  }

  #onPageChange() {
    if (PAGE_GROUPS[this.group].id === 'WPT') this.#ensureWptEntry();
  }

  // --- keys ----------------------------------------------------------------

  #press(key) {
    switch (key) {
      case 'DTO':
        return this.#openDto();
      case 'ENT':
        return this.#enter();
      case 'CLR':
        return this.#clear();
      case 'CRSR':
        return this.#toggleCursor();
      case 'MENU':
        return this.#openMenu();
      case 'FPL':
        return this.#toggleFpl();
      case 'PROC':
        return this.#openProc();
      case 'CDI':
        this.navSource = this.navSource === 'GPS' ? 'VLOC' : 'GPS';
        return;
      case 'OBS':
        this.obs = !this.obs;
        return;
      case 'MSG':
        this.message = this.message ? null : 'NO MESSAGES';
        return;
      case 'CV':
        this.tuning = this.tuning === 'COM' ? 'VLOC' : 'COM';
        return;
      case 'COM_FF':
        [this.com.active, this.com.standby] = [this.com.standby, this.com.active];
        return;
      case 'VLOC_FF':
        [this.vloc.active, this.vloc.standby] = [this.vloc.standby, this.vloc.active];
        return;
      case 'RNG_UP':
        return this.#range(-1);
      case 'RNG_DOWN':
        return this.#range(1);
    }
  }

  #range(dir) {
    // Reaching for RNG is a manual override. Step from the scale currently on
    // screen, not the stored one, so auto zoom hands over without a jump.
    const current = this.effectiveRange;
    this.autoZoom = false;
    const i = MAP_RANGES.indexOf(current);
    this.mapRange = MAP_RANGES[Math.max(0, Math.min(MAP_RANGES.length - 1, i + dir))];
  }

  /**
   * The range actually drawn. With auto zoom on, the smallest scale that still
   * leaves the active waypoint comfortably inside the map.
   */
  get effectiveRange() {
    if (!this.autoZoom) return this.mapRange;
    const dis = this.nav?.dis;
    if (dis == null) return this.mapRange;
    const needed = dis * 1.15;
    return MAP_RANGES.find((r) => r >= needed) ?? MAP_RANGES[MAP_RANGES.length - 1];
  }

  #toggleCursor() {
    if (this.mode === 'DTO' || this.mode === 'PROC') return;
    this.cursor = !this.cursor;
    if (this.mode === 'FPL') {
      if (!this.cursor) this.fplEdit = null;
      return;
    }
    if (this.cursor && PAGE_GROUPS[this.group].id === 'WPT') this.#ensureWptEntry();
  }

  // --- Direct-To -----------------------------------------------------------

  #openDto() {
    // From the nearest list, direct-to pre-fills the highlighted airport —
    // the flow the guide describes for diverting.
    let preset = this.to?.id ?? '';
    if (this.mode === 'PAGE' && this.page_ === 'NRST_AIRPORT' && this.nearest[this.nrstIndex]) {
      preset = this.nearest[this.nrstIndex].wp.id;
    } else if (this.cursor && this.wptSelected) {
      preset = this.wptSelected.id;
    }
    this.mode = 'DTO';
    this.menu = null;
    this.proc = null;
    this.dto = {
      entry: new IdentEntry(this.db, { initial: preset }),
      phase: 'IDENT',
    };
  }

  #dtoEnter() {
    if (this.dto.phase === 'IDENT') {
      const wp = this.dto.entry.resolve();
      if (!wp) {
        this.message = 'INVALID WAYPOINT';
        return;
      }
      this.dto.phase = 'ACTIVATE';
      return;
    }
    this.activateDirectTo(this.dto.entry.resolve());
    this.mode = 'PAGE';
    this.group = 0;
    this.page = 0;
    this.cursor = false;
    this.dto = null;
  }

  activateDirectTo(wp) {
    if (!wp) return;
    this.dtoFrom = { id: 'PPOS', lat: this.pos.lat, lon: this.pos.lon };
    this.dtoTarget = wp;
    this.obs = false;
    this.track = bearingDeg(this.pos, wp);
  }

  cancelDirectTo() {
    this.dtoTarget = null;
    this.dtoFrom = null;
  }

  // --- flight plan ---------------------------------------------------------

  #toggleFpl() {
    if (this.mode === 'FPL') {
      this.mode = 'PAGE';
      this.cursor = false;
      this.fplEdit = null;
      return;
    }
    this.mode = 'FPL';
    this.cursor = false;
    this.fplCursorRow = Math.min(this.fplCursorRow, this.flightPlan.length);
    this.fplEdit = null;
  }

  #fplMoveCursor(dir) {
    if (!this.cursor) return;
    if (this.fplEdit) return this.fplEdit.move(dir);
    this.fplCursorRow = Math.min(this.flightPlan.length, Math.max(0, this.fplCursorRow + dir));
  }

  #fplSpin(dir) {
    if (!this.cursor) return;
    if (!this.fplEdit) {
      const existing = this.flightPlan[this.fplCursorRow];
      this.fplEdit = new IdentEntry(this.db, { initial: existing?.id ?? '' });
    }
    this.fplEdit.spin(dir);
  }

  #fplEnter() {
    if (!this.fplEdit) {
      this.cursor = true;
      return;
    }
    const wp = this.fplEdit.resolve();
    if (!wp) {
      this.message = 'INVALID WAYPOINT';
      return;
    }
    this.flightPlan[this.fplCursorRow] = wp;
    this.fplEdit = null;
    this.fplCursorRow = Math.min(this.flightPlan.length, this.fplCursorRow + 1);
  }

  activateFlightPlan() {
    if (this.flightPlan.length < 1) return;
    this.cancelDirectTo();
    this.legIndex = this.flightPlan.length > 1 ? 1 : 0;
    this.obs = false;
  }

  // --- procedures ----------------------------------------------------------

  #openProc() {
    if (this.mode === 'PROC') {
      this.mode = 'PAGE';
      this.proc = null;
      return;
    }
    const apt = this.destination;
    if (!apt) {
      this.message = 'NO DESTINATION';
      return;
    }
    if (!this.procs?.has(apt)) {
      this.message = 'NO PROCEDURES';
      return;
    }
    this.mode = 'PROC';
    this.menu = null;
    const cached = this.procs.cached(apt);
    if (cached) {
      this.proc = { apt, state: 'APPROACHES', list: cached, sel: 0 };
    } else {
      this.proc = { apt, state: 'LOADING', list: [], sel: 0 };
      this.onLoadProcs?.(apt);
    }
  }

  /** Called once an airport's approach file has been fetched. */
  proceduresReady(apt, approaches) {
    if (this.proc?.apt !== apt || this.proc.state !== 'LOADING') return;
    if (!approaches.length) {
      this.mode = 'PAGE';
      this.proc = null;
      this.message = 'NO PROCEDURES';
      return;
    }
    this.proc = { apt, state: 'APPROACHES', list: approaches, sel: 0 };
  }

  #procMove(dir) {
    // Both knobs scroll these lists, which is how the unit behaves here.
    this.#procSpin(dir);
  }

  #procSpin(dir) {
    const p = this.proc;
    if (!p || p.state === 'LOADING') return;
    if (p.state === 'APPROACHES') {
      p.sel = Math.max(0, Math.min(p.list.length - 1, p.sel + dir));
    } else if (p.state === 'TRANSITIONS') {
      p.tsel = Math.max(0, Math.min(p.transitions.length - 1, p.tsel + dir));
    } else if (p.state === 'CONFIRM') {
      p.csel = (p.csel + dir + 2 + 2) % 2;
    }
  }

  #procEnter() {
    const p = this.proc;
    if (!p || p.state === 'LOADING') return;

    if (p.state === 'APPROACHES') {
      const approach = p.list[p.sel];
      p.approach = approach;
      p.transitions = transitionNames(approach);
      p.tsel = 0;
      p.state = 'TRANSITIONS';
      return;
    }
    if (p.state === 'TRANSITIONS') {
      p.transition = p.transitions[p.tsel];
      p.csel = 0;
      p.state = 'CONFIRM';
      return;
    }
    // CONFIRM: 0 = Load, 1 = Activate.
    this.loadApproach(p.approach, p.transition, p.csel === 1, p.apt);
    this.mode = 'FPL';
    this.proc = null;
    this.cursor = false;
  }

  /**
   * Insert the approach's fixes at the end of the flight plan, replacing any
   * previously loaded approach.
   */
  loadApproach(approach, transition, activate, airport) {
    const legs = approachLegs(approach, transition);
    if (!legs.length) {
      this.message = 'NO APPROACH DATA';
      return;
    }
    // Drop any previously loaded approach, then the destination airport itself
    // — the approach that lands there replaces it as the end of the plan.
    this.flightPlan = this.flightPlan.filter((w) => !w.proc && w.id !== airport);
    this.flightPlan.push(...legs);
    this.approach = { id: approach.id, name: approach.name, transition };
    if (activate) {
      this.cancelDirectTo();
      this.legIndex = Math.max(1, this.flightPlan.length - legs.length);
      this.obs = false;
    }
  }

  // --- menus ---------------------------------------------------------------

  #openMenu() {
    if (this.mode === 'MENU') {
      this.mode = this.menu.from;
      this.menu = null;
      return;
    }
    const items =
      this.mode === 'FPL'
        ? ['Activate Flight Plan?', 'Invert & Activate FPL?', 'Delete Flight Plan?']
        : this.page_ === 'MAP'
          ? [this.autoZoom ? 'Auto Zoom Off?' : 'Auto Zoom On?', 'Restore Defaults?']
          : this.page_ === 'NRST_AIRPORT'
            ? ['Show Nearest 25?']
            : ['Change Fields?', 'Restore Defaults?'];
    this.menu = { from: this.mode, items, sel: 0 };
    this.mode = 'MENU';
  }

  #menuEnter() {
    const choice = this.menu.items[this.menu.sel];
    const back = this.menu.from;
    this.menu = null;
    this.mode = back;
    switch (choice) {
      case 'Activate Flight Plan?':
        return this.activateFlightPlan();
      case 'Invert & Activate FPL?':
        this.flightPlan.reverse();
        return this.activateFlightPlan();
      case 'Auto Zoom On?':
        this.autoZoom = true;
    // CLR on the map page steps through detail levels (Pilot's Guide: "press
    // the CLR key momentarily to select the desired amount of map detail").
    this.declutter = 0;
        return;
      case 'Auto Zoom Off?':
        this.autoZoom = false;
        this.mapRange = this.effectiveRange;
        return;
      case 'Delete Flight Plan?':
        this.flightPlan = [];
        this.fplCursorRow = 0;
        this.legIndex = -1;
        this.approach = null;
        return;
    }
  }

  // --- ENT / CLR routing ---------------------------------------------------

  #enter() {
    if (this.message) {
      this.message = null;
      return;
    }
    if (this.mode === 'DTO') return this.#dtoEnter();
    if (this.mode === 'MENU') return this.#menuEnter();
    if (this.mode === 'PROC') return this.#procEnter();
    if (this.mode === 'FPL') return this.#fplEnter();
    if (this.cursor && this.page_ === 'NRST_AIRPORT') {
      const pick = this.nearest[this.nrstIndex];
      if (pick) this.selectWaypoint(pick.wp);
      return;
    }
    if (this.cursor && this.wptEntry) return this.#wptEnter();
  }

  #clear() {
    if (this.message) {
      this.message = null;
      return;
    }
    if (this.mode === 'DTO') {
      if (this.dto.phase === 'ACTIVATE') {
        this.dto.phase = 'IDENT';
        return;
      }
      this.mode = 'PAGE';
      this.dto = null;
      return;
    }
    if (this.mode === 'MENU') {
      this.mode = this.menu.from;
      this.menu = null;
      return;
    }
    if (this.mode === 'PROC') {
      const p = this.proc;
      if (p.state === 'CONFIRM') p.state = 'TRANSITIONS';
      else if (p.state === 'TRANSITIONS') p.state = 'APPROACHES';
      else {
        this.mode = 'PAGE';
        this.proc = null;
      }
      return;
    }
    if (this.mode === 'FPL') {
      if (this.fplEdit) {
        this.fplEdit = null;
        return;
      }
      if (this.cursor && this.flightPlan[this.fplCursorRow]) {
        this.flightPlan.splice(this.fplCursorRow, 1);
        this.fplCursorRow = Math.min(this.flightPlan.length, this.fplCursorRow);
        if (this.legIndex >= this.flightPlan.length) this.legIndex = this.flightPlan.length - 1;
      }
      return;
    }
    // On the map, a momentary CLR declutters rather than doing nothing.
    if (!this.cursor && this.page_ === 'MAP') {
      this.declutter = (this.declutter + 1) % 3;
      return;
    }
    if (this.cursor) this.cursor = false;
  }

  // --- waypoint pages ------------------------------------------------------

  #ensureWptEntry() {
    if (this.wptEntry) return;
    const seed = this.wptSelected?.id ?? this.destination ?? this.to?.id ?? '';
    this.wptEntry = new IdentEntry(this.db, { initial: seed });
    if (seed) this.wptSelected = this.db.exact(seed);
  }

  #wptEnter() {
    const wp = this.wptEntry.resolve();
    if (!wp) {
      this.message = 'INVALID WAYPOINT';
      return;
    }
    this.wptSelected = wp;
    this.cursor = false;
  }

  selectWaypoint(wp) {
    this.wptSelected = wp;
    this.wptEntry = new IdentEntry(this.db, { initial: wp.id });
  }

  get nearest() {
    // Recomputed lazily; the aircraft only moves a nautical mile every 30s.
    if (!this._nearestAt || distanceNm(this._nearestAt, this.pos) > 0.5) {
      this._nearestAt = { ...this.pos };
      this._nearest = this.db.nearest(this.pos, { kind: 'APT', limit: 25 });
    }
    return this._nearest;
  }

  // --- radio tuning --------------------------------------------------------

  #tuneFreq(dir, part) {
    const isCom = this.tuning === 'COM';
    const band = isCom ? this.com : this.vloc;
    const n = Number(band.standby);
    let v;
    if (isCom) {
      v = part === 'whole' ? n + dir : n + dir * 0.025;
      const lo = 118;
      const hi = 136.975;
      if (v < lo) v = hi;
      if (v > hi) v = lo;
      band.standby = v.toFixed(3);
    } else {
      v = part === 'whole' ? n + dir : n + dir * 0.05;
      const lo = 108;
      const hi = 117.95;
      if (v < lo) v = hi;
      if (v > hi) v = lo;
      band.standby = v.toFixed(2);
    }
  }

  // --- simulated flight ----------------------------------------------------

  /** Advance the aircraft by dt seconds. */
  tick(dt) {
    if (this.groundSpeed > 0) {
      const target = this.to;
      if (target) this.track = bearingDeg(this.pos, target);
      this.pos = project(this.pos, this.track, (this.groundSpeed * dt) / 3600);
    }
    this.#sequence();
  }

  /**
   * Advance to the next flight plan leg on passing the active waypoint. OBS
   * mode suspends this, which is exactly what the OBS key is for.
   */
  #sequence() {
    if (this.obs || this.dtoTarget) return;
    if (this.legIndex < 0 || this.legIndex >= this.flightPlan.length) return;
    const target = this.flightPlan[this.legIndex];
    if (!target) return;
    if (distanceNm(this.pos, target) > SEQUENCE_NM) return;
    if (this.legIndex < this.flightPlan.length - 1) {
      this.legIndex += 1;
      this.message = `NEXT WAYPOINT ${this.flightPlan[this.legIndex].id}`;
    }
  }

  // --- rendering view ------------------------------------------------------

  get nav() {
    const to = this.to;
    if (!to) return null;
    const from = this.from;
    const dis = distanceNm(this.pos, to);
    const brg = bearingDeg(this.pos, to);
    const xtk = from ? crossTrackNm(from, to, this.pos) : 0;
    return {
      to: to.id,
      from: from?.id ?? null,
      dis,
      brg,
      dtk: from ? bearingDeg(from, to) : brg,
      trk: this.track,
      xtk,
      ete: this.groundSpeed > 0 ? (dis / this.groundSpeed) * 3600 : null,
    };
  }

  /**
   * Flight plan rows with leg data. The first row is the departure point, so
   * it carries no desired track or distance — same as the real unit.
   */
  legs() {
    let cum = 0;
    return this.flightPlan.map((w, i) => {
      const prev = this.flightPlan[i - 1];
      const dis = prev ? distanceNm(prev, w) : null;
      if (dis != null) cum += dis;
      return {
        id: w.id,
        name: w.n ?? '',
        role: w.role ?? null,
        alt: w.alt ?? null,
        dtk: prev ? bearingDeg(prev, w) : null,
        dis,
        cum: prev ? cum : null,
        active: i === this.legIndex,
      };
    });
  }

  get view() {
    const page = this.page_;
    return {
      mode: this.mode,
      group: PAGE_GROUPS[this.group].id,
      groupIndex: this.group,
      page,
      pageIndex: this.page,
      pageCount: PAGE_GROUPS[this.group].pages.length,
      cursor: this.cursor,
      com: { ...this.com },
      vloc: { ...this.vloc },
      tuning: this.tuning,
      navSource: this.navSource,
      obs: this.obs,
      message: this.message,
      nav: this.nav,
      pos: { ...this.pos },
      altitude: this.altitude,
      groundSpeed: this.groundSpeed,
      mapRange: this.effectiveRange,
      autoZoom: this.autoZoom,
      declutter: this.declutter,
      // Positions for the map to draw; the active leg is highlighted.
      mapPlan: this.flightPlan.map((w, i) => ({
        id: w.id,
        lat: w.lat,
        lon: w.lon,
        active: i === this.legIndex,
      })),
      // A Direct-To is not part of the flight plan, so the map gets it
      // separately — drawn from where you pressed D→ to the destination.
      mapDirect: this.dtoTarget && {
        from: this.dtoFrom ?? { ...this.pos },
        to: { id: this.dtoTarget.id, lat: this.dtoTarget.lat, lon: this.dtoTarget.lon },
      },
      approach: this.approach ?? null,
      dto: this.dto && { ...this.dto.entry.view(), phase: this.dto.phase },
      fpl: {
        rows: this.legs(),
        cursorRow: this.fplCursorRow,
        edit: this.fplEdit?.view() ?? null,
        active: this.to?.id ?? null,
      },
      wpt: {
        entry: this.wptEntry?.view() ?? null,
        selected: this.wptSelected,
      },
      nrst:
        page === 'NRST_AIRPORT' || this.mode === 'MENU'
          ? {
              rows: this.nearest.map((n) => ({
                id: n.wp.id,
                name: n.wp.n,
                brg: n.brg,
                dis: n.dis,
                rwy: n.wp.rwy?.[0]?.len ?? null,
              })),
              index: this.nrstIndex,
            }
          : { rows: [], index: 0 },
      proc: this.proc && {
        apt: this.proc.apt,
        state: this.proc.state,
        approaches: (this.proc.list ?? []).map((a) => a.name),
        sel: this.proc.sel,
        transitions: this.proc.transitions ?? [],
        tsel: this.proc.tsel ?? 0,
        csel: this.proc.csel ?? 0,
        approachName: this.proc.approach?.name ?? null,
        transition: this.proc.transition ?? null,
      },
      menu: this.menu && { items: [...this.menu.items], sel: this.menu.sel, from: this.menu.from },
    };
  }
}
