# Direct-To

A browser-based GNS 430W practice trainer for drilling knob and key work
on the ground — Direct-To, flight plans, nearest airports, and instrument
approaches flown off real FAA procedure data.

## Running it

```
npm start
```

Then open <http://localhost:8765>. A server is required: the app uses ES modules
and `fetch`, both of which browsers block over `file://`.

If the port is already serving the trainer, `npm start` says so rather than
failing — just reload the page, since it serves straight from disk and needs no
restart for code or data changes. If the port is busy with something else it
moves to the next free one. `npm stop` shuts it down.

```
npm test
```

runs 41 tests against the state machine, procedures and basemap data. No browser needed.

## Practising a Direct-To

1. Press **D→**
2. **Small right knob** spells the character under the cursor
3. **Large right knob** moves to the next character
4. **ENT** confirms the identifier
5. **ENT** again on *Activate?*

As you spell, the unit fills in the rest of the identifier from the database —
Garmin calls this Spell'N'Find, and it is the part that feels strange until it
is automatic. Try `KJYO` (Leesburg Executive) or `CSN` (Casanova VOR).

Press and hold **CLR** to jump back to the default NAV page.

## Flight plans

Press **FPL**, then **PUSH CRSR** for the cursor. Spell each waypoint, **ENT**
after each. **MENU** offers *Activate Flight Plan?*, *Invert & Activate FPL?*
and *Delete Flight Plan?*. **CLR** on a highlighted row deletes that waypoint.

Once activated, legs **sequence automatically** as you fly past each waypoint,
and the active leg shows in magenta. **OBS** suspends sequencing, which is what
that key is actually for.

## Approaches

With an airport as your destination, press **PROC**:

1. Pick the approach (the list comes from the published procedures for that field)
2. Pick a transition — an IAF, or **VECTORS** for vectors-to-final
3. Choose **Load?** to add it to the flight plan, or **Activate?** to fly it now

The approach's fixes replace the destination airport at the end of the flight
plan, carrying their IAF / FAF / MAP roles and crossing altitudes. Loading a
second approach replaces the first.

## The map

Track-up, own-ship centred, with WPT / DTK / DIS / GS down the right-hand side.
The active course draws in magenta — flight plan legs and Direct-To alike — so
a Direct-To to `KGHG` shows the magenta line running to Marshfield Municipal
whether or not it is in a flight plan.

**Auto zoom** is on by default: the scale steps from 200 NM down to 1 NM as you
close on the destination, so the active waypoint stays on screen without you
reaching for anything. Pressing **RNG** takes manual control, stepping from
whatever scale is currently displayed. **MENU** on the map page hands auto zoom
back.

Underneath the flight plan sits a basemap: coastlines and lakes in grey-blue,
and airspace drawn to sectional convention — Class B solid blue, Class C
magenta, Class D dashed blue, Class E surface areas dotted. A momentary **CLR**
declutters in two steps (airspace off, then the basemap too) and wraps back, as
the Pilot's Guide describes.

## Nearest airports

**Large right knob** to the NRST group. **PUSH CRSR**, scroll with the large
knob, and press **D→** to go direct to the highlighted field — the divert flow
worth having in muscle memory.

## Pages

| Group | Pages |
| --- | --- |
| NAV | Default NAV, Map, NAV/COM |
| WPT | Location, Runways, Frequencies |
| AUX | Setup — ground speed, altitude, position, loaded approach |
| NRST | Nearest airports |

## Keyboard

| Key | Control |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> | large right knob |
| <kbd>↑</kbd> <kbd>↓</kbd> | small right knob |
| <kbd>space</kbd> | push CRSR |
| <kbd>enter</kbd> | ENT |
| <kbd>backspace</kbd> | CLR (<kbd>shift</kbd> for press-and-hold) |
| <kbd>d</kbd> <kbd>m</kbd> <kbd>f</kbd> <kbd>p</kbd> | D→, MENU, FPL, PROC |
| <kbd>c</kbd> <kbd>o</kbd> <kbd>g</kbd> | CDI, OBS, MSG |
| <kbd>[</kbd> <kbd>]</kbd> | large left knob (MHz) |
| <kbd>-</kbd> <kbd>=</kbd> | small left knob (kHz) |
| <kbd>v</kbd> | push C/V |

## How it fits together

| File | Role |
| --- | --- |
| `src/bezelart.js` | The faceplate, drawn as SVG — sharp at any zoom |
| `src/bezel.js` | Hit regions in the faceplate's 446×186 coordinate space, plus keyboard bindings |
| `src/gns.js` | The state machine. No DOM access, so it runs under plain node |
| `src/ident.js` | The Spell'N'Find entry field shared by Direct-To, flight plan and WPT |
| `src/screen.js` | Renders a view onto the unit's real 240×128 pixel grid |
| `src/navdata.js` | Waypoint lookup, nearest search, great-circle maths |
| `src/procedures.js` | Approach loading and flattening into flight plan legs |
| `tools/build-basemap.mjs` | Clips, simplifies and chunks the map geometry |
| `src/app.js` | Wires clicks and keys to the state machine |

The screen is laid out in the GNS 430's **actual 240×128 pixel** resolution and
scaled with a single CSS transform, so positions can be read straight off
photographs of a real unit.

`window.__gns` is exposed in the browser console for poking at state.

## Faceplate styles

The **Modern / Original** toggle above the unit switches between the vector
redraw and Garmin's own 446x186 trainer bitmap. Both are laid out in the same
coordinate space, so the buttons, knobs and screen line up identically either
way. Your choice is remembered.

The original bitmap is Garmin's artwork and is not distributed here, so the
Original button is disabled out of the box. If you have the 400W/500W trainer
installer, extract it from your own copy:

```
7z x 400W_500WSeriesTrainer-WAAS_300.exe -osfx
unshield -d trainer x sfx/Trainer/data1.cab
7z x -obezel trainer/Program_Executable_Files/G530SIM.exe
sips -s format png bezel/.rsrc/BITMAP/142.bmp --out assets/bezel-430.png
```

Reload and the Original skin turns on. (`brew install p7zip unshield` first;
`sips` is built into macOS.)

## Name

Named for the key you reach for most. Not affiliated with or endorsed by
Garmin; "Garmin" and "GNS" are their trademarks, used here only to say which
box this trains you on.

## Where the data comes from

**Faceplate.** `src/bezelart.js` is drawn from measurements taken off the
genuine artwork in Garmin's Windows trainer
(`400W_500WSeriesTrainer-WAAS_300.exe` → InstallShield cabinets → `G530SIM.exe`
PE resources, bitmap 142). That bitmap is 446×186 and 8-bit; the vector redraw
exists so the unit stays sharp at any zoom, and so this repo ships no artwork
that is not its own.

**Behaviour.** The 400W-series Pilot's Guide (Garmin 190-00356-00), which ships
inside the same installer. The manuals are Garmin's copyright and are not in
this repo; extract them yourself with:

```
7z x 400W_500WSeriesTrainer-WAAS_300.exe -osfx    # -> sfx/Manuals/*.pdf
```

**Waypoints.** `data/navdata.json` — 15,511 US airports, VORs and NDBs with
frequencies and runways, from [OurAirports](https://ourairports.com/data/)
(public domain).

```
npm run build:navdata -- airports.csv navaids.csv airport-frequencies.csv runways.csv
```

**Approaches.** `data/proc/` — 3,017 airports, 10,240 approaches, 122,297 legs,
parsed from the FAA's [CIFP](https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/)
(ARINC 424-18, US Government work, free to redistribute). One file per airport,
fetched on demand.

```
npm run build:procedures -- path/to/FAACIFP18
```

CIFP updates every 28 days on the AIRAC cycle. The bundled data is cycle 2608
(effective 2026-08-06). Re-running the build against a newer download is the
whole update process.

**Map geometry.** `data/basemap.json` — 2.6 MB, about 146,000 points, from
[Natural Earth](https://www.naturalearthdata.com/) 10m coastlines and lakes
(public domain) and the FAA's
[Class Airspace](https://ais-faa.opendata.arcgis.com/datasets/class-airspace)
export (US Government work).

```
npm run build:basemap -- ne_10m_coastline.json ne_10m_lakes.json class_airspace.json
```

The airspace download is around 550 MB of over-sampled rings, so the build
clips to US bounds, drops the Class E5 enroute blanket, simplifies with
Ramer-Douglas-Peucker, and chunks each run with a bounding box so the renderer
can cull to the viewport. Worst case is 2.9 ms per frame at 200 NM.

## Known gaps

- **No intersections or named enroute fixes in Direct-To.** OurAirports covers
  airports and navaids only. Approach fixes do resolve, because those come from
  the CIFP — so `HOAGE` works inside an approach but not as a Direct-To target.
- **No SIDs or STARs.** The CIFP contains them (`PD` and `PE` records) and the
  parser could be extended the same way it handles `PF`.
- **Approach legs are fix-based.** Vectors, climb-to-altitude and holding legs
  carry no position, so they are dropped from the flight plan rather than flown.
  Altitude constraints are displayed, not enforced.
- **Basemap has no roads, railways or towns.** The real unit draws them; open
  data for those exists but would add a lot of bulk for little training value.
- **Airspace is lateral only.** Floors and ceilings are in the source data but
  are not used, so a Class B shelf you are underneath still draws.
- **Simple flight model.** Constant ground speed straight at the active
  waypoint; no wind, turn rate, or autopilot.
- **No approach-mode CDI scaling.** The CDI stays at enroute sensitivity rather
  than tightening inside the FAF.
