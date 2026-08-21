// Approach procedures, built from the FAA CIFP (see tools/build-procedures.mjs).
//
// Each airport lives in its own file so the app only loads what you select.

export class Procedures {
  /**
   * @param {Set<string>} available airports that have published approaches
   * @param {(apt: string) => Promise<any>} load fetches one airport's file
   */
  constructor(available, load) {
    this.available = available;
    this.load = load;
    this.cache = new Map();
  }

  has(apt) {
    return this.available.has(apt);
  }

  /** Approaches for an airport, or [] if it has none. Cached after first load. */
  async approaches(apt) {
    if (!apt || !this.available.has(apt)) return [];
    if (!this.cache.has(apt)) {
      try {
        const data = await this.load(apt);
        this.cache.set(apt, data.approaches ?? []);
      } catch {
        this.cache.set(apt, []);
      }
    }
    return this.cache.get(apt);
  }

  cached(apt) {
    return this.cache.get(apt) ?? null;
  }
}

/**
 * Flatten an approach into the waypoint sequence the flight plan shows.
 *
 * Legs with no fix (vectors, climb-to-altitude) carry no position, so they are
 * dropped from the flight plan the way a GNS does — the sequence you see is the
 * fixes you navigate to.
 *
 * @param {any} approach
 * @param {string|null} transitionId IAF name, or null/'VECTORS' for vectors to final
 */
export function approachLegs(approach, transitionId) {
  const out = [];
  const push = (leg) => {
    if (!leg.fix || leg.lat == null || leg.lon == null) return;
    // The same fix can end a transition and start the final segment.
    if (out.length && out[out.length - 1].id === leg.fix) return;
    out.push({
      id: leg.fix,
      lat: leg.lat,
      lon: leg.lon,
      n: leg.role ? `${approach.name} ${leg.role}` : approach.name,
      role: leg.role ?? null,
      alt: leg.alt ?? null,
      ad: leg.ad ?? null,
      proc: approach.id,
    });
  };

  if (transitionId && transitionId !== 'VECTORS') {
    const t = approach.transitions.find((x) => x.id === transitionId);
    if (t) t.legs.forEach(push);
  }

  if (transitionId === 'VECTORS') {
    // Vectors-to-final starts at the final approach course fix, or the FAF.
    const start = approach.final.findIndex((l) => l.role === 'FACF' || l.role === 'FAF');
    approach.final.slice(Math.max(0, start)).forEach(push);
  } else {
    approach.final.forEach(push);
  }

  return out;
}

/** Transition names for the PROC list, always offering vectors. */
export function transitionNames(approach) {
  return [...approach.transitions.map((t) => t.id), 'VECTORS'];
}
