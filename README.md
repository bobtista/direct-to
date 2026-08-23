# GA cockpit trainer

Two ground-practice tools that share a cockpit, so you can stop learning the
expensive parts of flying at rental rates.

| | |
| --- | --- |
| **[Direct-To](https://bobtista.github.io/direct-to/)** | The GPS box. Direct-To, flight plans, instrument approaches off real FAA procedure data, and a moving map. GNS 430W, GNS 530W and GTN 650Xi. |
| **[Say Again](say-again/)** | The radio. Real frequencies, AIM phraseology, readback grading, and audio that sounds like a radio. Towered, untowered and Class B. |

Say Again embeds the same GPS unit Direct-To renders, so a handoff to
*"Boston Approach on 124.1"* means tuning 124.1 on the box and flipping it
across before you transmit — which is the bit that is actually fiddly.

## Running them

```
npm start
```

One server covers both: Direct-To at <http://localhost:8765>, Say Again at
<http://localhost:8765/say-again/>.

```
npm test          # everything
npm run test:gps  # the GPS unit
npm run test:radio  # the radio trainer
```

Say Again can also use a local speech recogniser fine-tuned on air traffic
control audio, which — unlike the browser's — hears *"five sierra papa"* rather
than *"50 pop"*. It is optional and runs entirely on your machine:

```
npm run asr:setup   # once — a ~3 GB model
npm run asr         # alongside npm start
```

## Layout

```
src/            the GPS unit — units, state machine, renderers, nav maths
shared/         styling for the unit, used by both apps
data/           waypoints, approach procedures, basemap
index.html      Direct-To
say-again/      the radio trainer, importing the unit from ../src
tools/          the static server, the data builders, the local speech recogniser
```

`src/` is a library, not an app: `src/app.js` is the only Direct-To-specific
file in it. Say Again imports the rest directly rather than copying, so a fix
to the box lands in both. `shared/unit.css` does the same for the faceplate and
display styling — mark a faceplate `.unit-bezel` and its display `.unit-grid`
and it looks right wherever it is mounted.

## Data

All of it is public domain and rebuildable:

- **Waypoints and frequencies** — [OurAirports](https://ourairports.com/data/)
- **Approach procedures** — the FAA's [CIFP](https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/), ARINC 424
- **Coastlines** — [Natural Earth](https://www.naturalearthdata.com/)
- **Airspace** — the FAA's [Class Airspace](https://ais-faa.opendata.arcgis.com/datasets/class-airspace) export

No Garmin artwork is redistributed here. The faceplates are vector redraws,
measured from the originals but drawn from scratch.

Not affiliated with or endorsed by Garmin. "Garmin", "GNS" and "GTN" are their
trademarks, used only to say which boxes these train you on.
