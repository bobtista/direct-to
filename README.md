# Say Again

ATC radio practice on the ground, so you are not learning the radio at
airplane-rental prices.

Real fields, real frequencies, phraseology from the AIM, and a channel that
sounds like a radio. Every readback is graded against what you are actually
required to read back.

## Running it

```
npm start
```

Then open <http://localhost:8770>. `npm test` runs 49 tests with no browser.

**It makes noise by design.** There is a Mute button, and the setting sticks.

## Scenarios

| | What it drills |
| --- | --- |
| **Towered departure** | Ground, Tower, departure instruction, flight following, handoffs |
| **Untowered** | Self-announce from taxi through pattern and back, on CTAF |
| **Class B transition** | The one where two-way contact is *not* permission |

Each one grades what that airspace actually requires of you, which is the point:

- **Untowered** — nothing is required by regulation. No ATC, no clearance.
  Self-announcing is recommended practice, and the discipline is bookending
  every call with the field name and saying what you intend to do next.
- **Class D** — two-way radio communication must be *established* before you
  enter (91.129). The test is whether the controller used **your callsign**.
  "Skyhawk 725SP, standby" means you are established. "Aircraft calling,
  standby" does not.
- **Class C** — same callsign rule (91.130), plus Mode C. You get a discrete
  squawk and radar service.
- **Class B** — an **explicit clearance** is required (91.131). You must hear
  "cleared into the Class Bravo". "Radar contact" is not it, and neither is
  "remain clear" — which means exactly what it says.

## Peek

The **Peek** button shows two things for the step you are on: the model call,
written the way you would note it on a kneeboard, and *why* those elements are
required. Before the controller speaks it shows the call to make; afterwards, the
readback. Miss a readback twice and it opens by itself.

## The loop

1. **Brief a scenario** — pick a towered departure field and a destination
2. **Make the call** — hold *Push to talk* (or the space bar), or type it
3. **The controller answers** over a simulated VHF channel
4. **Read it back** — and get told precisely what you missed

Get it wrong and you stay on the step and try again. Failing forward teaches the
wrong thing, so a controller here does what a real one does: waits.

A bare check-in works too. "Boston Approach, Skyhawk 725SP" gets you a
"go ahead" rather than a failed grade — that is a real move on a busy frequency,
not a mistake.

The buttons track whose turn it is. *Say again* only repeats something already
transmitted: when it is your turn there is nothing to repeat, and playing the
reply early would spoil the answer.

Wind, altimeter, ATIS letter and squawk are randomised each brief, so the
numbers are never the ones you memorised last time. The active runway follows
the wind.

## What it grades

Mandatory readbacks, per AIM 4-4-7: **runway assignments, hold short
instructions, assigned altitudes and headings, squawk codes, frequency
changes**. Miss one and the step is marked unsafe, not merely imperfect.

Habits are flagged separately without failing you:

- "Roger" standing in for a required readback
- Filler — *um*, *uh*, *like*
- "With you"
- "Any traffic please advise", which the AIM specifically discourages
- Dropping your callsign

Grading works on meaning, not spelling: *"one two four point one"* and
*"124.1"* are the same thing, and so are *"niner"* and *"9"*, *"cleared for take
off"* and *"cleared for takeoff"*. You can type a readback the short way or say
it the long way — both are graded the same.

What it does **not** do is guess at homophones. "to" and "for" stay words:
mapping them to 2 and 4 to catch recogniser slips broke far more than it fixed.

## Two forms of every transmission

A transmission is built once and rendered twice. The radio hears
*"Skyhawk seven two five sierra papa, runway one seven"*; the screen shows
*"Skyhawk 5SP, runway 17"*. `SPOKEN` and `WRITTEN` in `src/phraseology.js`
implement the same interface, so a scenario is written once against a renderer
and never has to spell anything out itself.

The exception is anything the written form would mispronounce. `N725SP` reads
out correctly on sight; a bare `T` does not — nobody says "with T". So an ATIS
code is **Tango** in both forms, matching the broadcast itself.

## Why it sounds like a radio

Timbre is not what makes ATC sound like ATC — the channel is. `src/radio.js`
band-limits to 300–2700 Hz, applies hard AGC and mild clipping, lays a gated
hiss floor underneath, and brackets every transmission with a PTT click and a
squelch tail. Free browser voices through that chain read as far more authentic
than a good voice without it.

This is also why the project does **not** clone real controllers. LiveATC's
terms permit personal listening only and forbid derivative works; ElevenLabs
requires verified consent for any voice that is not yours; and several states
require written consent to clone a real person. None of it is necessary — the
realism is in the channel and the phraseology.

## Structure

| File | Role |
| --- | --- |
| `src/phraseology.js` | Values to spoken radio: digits, altitudes, frequencies, callsigns |
| `src/grade.js` | Readback grading and habit detection |
| `src/scenario.js` | Scripted exchanges built from real airport data |
| `src/radio.js` | The VHF channel, in Web Audio |
| `src/app.js` | Wiring, speech recognition, push-to-talk |
| `tools/build-airports.mjs` | Builds the airport and frequency dataset |

`src/phraseology.js`, `grade.js` and `scenario.js` touch no DOM, so they test
under plain node.

## Data

`data/airports.json` — 3,774 US fields with a tower or a CTAF, from
[OurAirports](https://ourairports.com/data/) (public domain): 662 towered, 1,694
with an approach frequency.

```
npm run build:airports -- airports.csv airport-frequencies.csv runways.csv
```

Controllers say short names, so the build derives one: the city when the airport
name contains it ("Norwood Memorial Airport" → *Norwood*), otherwise the
distinctive last word ("Laurence G Hanscom Field" → *Hanscom*). It is a
heuristic over messy data, and `SPOKEN_OVERRIDES` in the build script has the
final say.

## Known gaps

- **No arrivals into a towered field yet.** Departure, untowered and Class B
  transition are built; the towered arrival — approach, tower, taxi in — is not.
- **No clearance delivery step.** At a Class C like Austin you would call
  Clearance first and get your squawk and departure frequency before taxi. The
  scenario picks the code up airborne instead.
- **Scripted, not conversational.** Replies are deterministic, which costs
  nothing and grades reliably, but will not react to an unusual request. An LLM
  controller is a later upgrade, not a prerequisite.
- **Browser speech recognition is weak on aviation speak.** It mangles callsigns
  and "niner". Typing is the reliable input until an ATC-tuned recogniser is
  wired in — open corpora exist (ATCO2, UWB-ATCC, ATCOSIM) and fine-tuned
  Whisper models trained on them are the obvious fix.
- **Frequency data has holes.** Some fields carry no frequencies at all in
  OurAirports, so scenario coverage is uneven.
- **`SpeechSynthesis` cannot route into Web Audio**, so the channel effect plays
  alongside the voice rather than processing it. Swapping in a TTS that returns
  audio buffers would route it properly through `radio.input`.
