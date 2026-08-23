# Direct-To

A browser-based Garmin avionics practice trainer for drilling knob, key and
touch work on the ground — Direct-To, flight plans, nearest airports, and instrument
approaches flown off real FAA procedure data.

## Running it

```
npm start
```

Then open <http://localhost:8765>. A server is required: the app uses ES modules
and `fetch`, both of which browsers block over `file://`. The same server also
serves the radio trainer at `/say-again/` — see the [root README](README.md).

If the port is already serving the trainer, `npm start` says so rather than
failing — just reload the page, since it serves straight from disk and needs no
restart for code or data changes. If the port is busy with something else it
moves to the next free one. `npm stop` shuts it down.

```
npm test
```

runs 68 tests: the state machine, the procedure and basemap data, a rendering
pass over every page of every unit, and regressions for each issue found in
code review. No browser needed.

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

Own-ship centred, with WPT / DTK / DIS / GS down the right-hand side. The active
course draws in magenta — flight plan legs and Direct-To alike — so a Direct-To
to `KGHG` shows the magenta line running to Marshfield Municipal whether or not
it is in a flight plan.

**Track-up by default**, like the real box, and the header says which mode you
are in. Track-up is why the magenta line points straight up when you are on
course: the line shows where the destination is *relative to where you are
pointing*, not relative to north. It also means the world rotates under you —
useful in the air, disorienting on the ground, and hard to reconcile with a
paper chart. **MENU** on the map page switches to **north-up**, where southeast
is down and to the right and the coastline looks like the coastline.

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
| <kbd>n</kbd> | VNAV (530) |
| <kbd>h</kbd> | HOME (650Xi) |
| <kbd>,</kbd> <kbd>.</kbd> | RNG in / out |
| <kbd>[</kbd> <kbd>]</kbd> | large left knob (MHz) |
| <kbd>-</kbd> <kbd>=</kbd> | small left knob (kHz) |
| <kbd>v</kbd> | push C/V |

Only the keys a unit actually has do anything. The 650Xi is a touchscreen — tap
the display.

## How it fits together

| File | Role |
| --- | --- |
| `src/units.js` | Unit profiles: faceplate size, display box, resolution, hit regions |
| `src/bezelart.js` | The GNS faceplates, drawn as SVG — sharp at any zoom |
| `src/bezelart-gtn.js` | The GTN faceplate |
| `src/bezel.js` | What each control means, plus keyboard bindings |
| `src/gns.js` | The state machine. No DOM access, so it runs under plain node |
| `src/ident.js` | The Spell'N'Find entry field shared by Direct-To, flight plan and WPT |
| `src/screen.js` | Renders the GNS units onto their real pixel grid |
| `src/gtnscreen.js` | Renders the GTN touchscreen, controls included |
| `src/mapdraw.js` | Moving-map geometry, shared by both renderers |
| `src/navdata.js` | Waypoint lookup, nearest search, great-circle maths |
| `src/procedures.js` | Approach loading and flattening into flight plan legs |
| `tools/build-basemap.mjs` | Clips, simplifies and chunks the map geometry |
| `src/app.js` | Wires clicks and keys to the state machine |

The screen is laid out in the GNS 430's **actual 240×128 pixel** resolution and
scaled with a single CSS transform, so positions can be read straight off
photographs of a real unit.

`window.__gns` is exposed in the browser console for poking at state.

## Units

The **430 / 530 / 650Xi** toggle above the faceplate switches boxes.

| | GNS 430W | GNS 530W | GTN 650Xi |
| --- | --- | --- | --- |
| Faceplate | 446×186 | 464×338 | 500×213 |
| Display | 240×128 | 320×234 | 840×372 |
| Input | knobs and keys | knobs and keys | touchscreen |
| Bottom row | CDI OBS MSG FPL PROC | + VNAV | — |
| RNG | horizontal rocker | vertical rocker | on-screen +/− |

The two GNS boxes are the same firmware in different housings, so their logic,
pages and knobs are identical; what changes is the hardware and the room on
screen.

Every faceplate is drawn as SVG, so the units stay sharp at any zoom and the
repo ships no artwork that is not its own.

The **GTN 650Xi** is a different interface to the same machinery. It has only
two hard keys (HOME and Direct-To), a dual knob and a volume knob — everything
else is on the glass, so its renderer draws its own controls and tags them with
`data-touch`. Waypoint entry is an on-screen keypad rather than Spell'N'Find by
knob, though the underlying matching is the same code.

Every unit is described by a profile in `src/units.js` — faceplate size, where
the display sits, its pixel resolution, and the clickable regions. Adding
another box is that data plus a faceplate drawing.

The screen layout is authored once in the 430's 240-wide space and scaled to
the unit, so columns keep their proportions while the 530's extra pixels turn
into extra rows: more flight plan legs, a longer nearest list, a taller map.

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
inside the same installer, and the
[GTN Xi Series Pilot's Guide](https://static.garmin.com/pumac/190-02327-03_g.pdf)
(190-02327-03) for the touchscreen unit. The GTN faceplate is drawn from the
bezel diagram in that guide. The manuals are Garmin's copyright and are not in
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
- **The 530's Default NAV page does not use its extra height.** Every list page
  and the map grow with the display; that one page keeps the 430's layout and
  leaves space below.
- **The GTN is a first slice.** Home, Direct-To, Map, Flight Plan, Nearest,
  Waypoint Info and Procedures work; Traffic, Terrain, Weather, Utilities and
  System are placeholders. Its appearance is drawn from the Pilot's Guide
  rather than matched against the real unit, so the behaviour is faithful but
  the look is an approximation.
- **VNAV is a stub.** The 530 has the key; the page behind it is not built.
- **Simple flight model.** Constant ground speed straight at the active
  waypoint; no wind, turn rate, or autopilot.
- **No approach-mode CDI scaling.** The CDI stays at enroute sensitivity rather
  than tightening inside the FAF.
