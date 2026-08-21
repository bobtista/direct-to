// The identifier entry field shared by Direct-To, flight plan rows and the
// waypoint pages: the small knob spells the character under the cursor, the
// large knob steps position, and the unit fills the remaining characters from
// the first database match (Garmin's "Spell'N'Find").

import { CHARS } from './navdata.js';

export class IdentEntry {
  /**
   * @param {import('./navdata.js').NavData} db
   * @param {{length?: number, initial?: string}} opts
   */
  constructor(db, { length = 5, initial = '' } = {}) {
    this.db = db;
    this.length = length;
    this.chars = [...initial.padEnd(length, ' ')].slice(0, length);
    this.i = 0;
    // How many leading positions the pilot has actually committed. Characters
    // past this point are database fill and get rewritten as the prefix changes.
    this.typed = initial.trim().length;
    this.match = initial.trim() ? db.exact(initial.trim()) : null;
  }

  /** The prefix the pilot has spelled, up to and including the cursor. */
  get prefix() {
    return this.chars.slice(0, this.i + 1).join('').trimEnd();
  }

  get value() {
    return this.chars.join('').trim();
  }

  get display() {
    return this.chars.join('');
  }

  spin(dir) {
    const at = CHARS.indexOf(this.chars[this.i]);
    const next =
      at === -1
        ? dir > 0
          ? 0
          : CHARS.length - 1
        : (at + dir + CHARS.length) % CHARS.length;
    this.chars[this.i] = CHARS[next];
    this.typed = this.i + 1;
    this.#fill();
  }

  move(dir) {
    this.i = Math.min(this.length - 1, Math.max(0, this.i + dir));
    // Moving right locks in what is behind the cursor; moving left re-opens it.
    this.typed = dir > 0 ? Math.max(this.typed, this.i + 1) : Math.min(this.typed, this.i + 1);
    this.#fill();
  }

  #fill() {
    const match = this.db.firstMatch(this.prefix);
    this.match = match;
    const filled = (match ? match.id : this.prefix).padEnd(this.length, ' ');
    for (let i = this.typed; i < this.length; i++) this.chars[i] = filled[i] ?? ' ';
  }

  /** Type a character, for units with an on-screen keypad rather than knobs. */
  push(ch) {
    if (this.typed >= this.length) return;
    this.chars[this.typed] = ch;
    this.typed += 1;
    this.i = Math.min(this.length - 1, this.typed);
    this.#refill();
  }

  backspace() {
    if (this.typed === 0) return;
    this.typed -= 1;
    this.chars[this.typed] = ' ';
    this.i = this.typed;
    this.#refill();
  }

  clear() {
    this.chars = Array(this.length).fill(' ');
    this.typed = 0;
    this.i = 0;
    this.match = null;
  }

  /** Spell'N'Find over whatever has been typed so far. */
  #refill() {
    const prefix = this.chars.slice(0, this.typed).join('').trimEnd();
    const match = this.db.firstMatch(prefix);
    this.match = match;
    const filled = (match ? match.id : prefix).padEnd(this.length, ' ');
    for (let i = this.typed; i < this.length; i++) this.chars[i] = filled[i] ?? ' ';
  }

  /** The waypoint this entry resolves to, or null if it isn't in the database. */
  resolve() {
    return this.db.exact(this.value);
  }

  view() {
    return { ident: this.display, i: this.i, match: this.match };
  }
}
