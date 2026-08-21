// Waypoint database lookup. Data is bundled at build time (see
// tools/build-navdata.mjs) so nothing is fetched from a server at runtime.

export const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export class NavData {
  /** @param {{id:string,k:string,n:string,c:string,r:string,lat:number,lon:number}[]} waypoints sorted by id */
  constructor(waypoints) {
    this.waypoints = waypoints;
  }

  /** Index of the first waypoint whose id is >= key. */
  #lowerBound(key) {
    let lo = 0;
    let hi = this.waypoints.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.waypoints[mid].id < key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Garmin's "Spell'N'Find": the first database entry matching what has been
   * spelled so far. Returns null when nothing matches.
   */
  firstMatch(prefix) {
    if (!prefix) return null;
    const i = this.#lowerBound(prefix);
    const w = this.waypoints[i];
    return w && w.id.startsWith(prefix) ? w : null;
  }

  /** All entries sharing a prefix, capped so a single character can't return thousands. */
  matches(prefix, limit = 50) {
    if (!prefix) return [];
    const out = [];
    for (let i = this.#lowerBound(prefix); i < this.waypoints.length && out.length < limit; i++) {
      if (!this.waypoints[i].id.startsWith(prefix)) break;
      out.push(this.waypoints[i]);
    }
    return out;
  }

  exact(id) {
    const w = this.waypoints[this.#lowerBound(id)];
    return w && w.id === id ? w : null;
  }

  /**
   * Closest waypoints to a position, nearest first — what the NRST pages show.
   * Scans the whole table, which is fast enough at this size and keeps the
   * result exact rather than grid-approximated.
   *
   * @param {{lat:number,lon:number}} pos
   * @param {{kind?: string, limit?: number, maxNm?: number}} opts
   */
  nearest(pos, { kind = 'APT', limit = 25, maxNm = 200 } = {}) {
    // Cheap bounding box first, so the great-circle maths runs on a short list.
    const dLat = maxNm / 60;
    const cosLat = Math.max(0.05, Math.cos((pos.lat * Math.PI) / 180));
    const dLon = maxNm / 60 / cosLat;

    const found = [];
    for (const w of this.waypoints) {
      if (kind && w.k !== kind) continue;
      if (Math.abs(w.lat - pos.lat) > dLat) continue;
      let lonDiff = Math.abs(w.lon - pos.lon);
      if (lonDiff > 180) lonDiff = 360 - lonDiff;
      if (lonDiff > dLon) continue;
      const d = distanceNm(pos, w);
      if (d <= maxNm) found.push({ wp: w, dis: d, brg: bearingDeg(pos, w) });
    }
    found.sort((a, b) => a.dis - b.dis);
    return found.slice(0, limit);
  }
}

const R_NM = 3440.065; // Earth radius in nautical miles
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Great-circle distance in nautical miles. */
export function distanceNm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial true bearing in degrees, 0-360. */
export function bearingDeg(a, b) {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Move a point along a bearing — used to fly the simulated aircraft. */
export function project(from, bearing, distNm) {
  const d = distNm / R_NM;
  const br = rad(bearing);
  const lat1 = rad(from.lat);
  const lon1 = rad(from.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: deg(lat2), lon: ((deg(lon2) + 540) % 360) - 180 };
}

/**
 * Signed cross-track error in nautical miles: positive means the aircraft is
 * right of course, which is the sign the CDI needle uses.
 */
export function crossTrackNm(from, to, pos) {
  const d13 = distanceNm(from, pos) / R_NM;
  const t13 = rad(bearingDeg(from, pos));
  const t12 = rad(bearingDeg(from, to));
  return Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * R_NM;
}
