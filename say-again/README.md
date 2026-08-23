# Say Again

ATC radio practice on the ground, so you are not learning the radio at
airplane-rental prices.

Real fields, real frequencies, phraseology from the AIM, and a channel that
sounds like a radio. Every readback is graded against what you are actually
required to read back.

## Running it

From the repo root:

```
npm start
```

Then open <http://localhost:8765/say-again/>. `npm test` runs 72 tests with no browser.

**It makes noise by design.** There is a Mute button, and the setting sticks.

## The box on the panel

The GPS unit above the radio panel is the same one
[Direct-To](../DIRECT-TO.md) renders — imported from `../src`, not copied. Tune
the standby with the left knob, flip-flop it across, and the panel tells you
whether you are actually transmitting on the frequency this exchange is on.

That check is advisory. A wrong frequency is called out but does not block the
step, because stalling practice on a fumbled knob twist teaches nothing.

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
- Dropping your callsign — checked anywhere in the transmission, since a
  readback ends with it, a callup puts it second, and an untowered self-announce
  ends with the field name

When the recogniser mangles your callsign, the log shows what it heard so you
can tell a bad transcription from a bad call.

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

## Hearing you properly

Browser speech recognition is trained on ordinary English, so it mangles the
phonetic alphabet: "five sierra papa" comes back as "50 pop", and a graded
readback fails on a word you said correctly.

The fix is a recogniser that has heard a radio before. `npm run asr:setup`
downloads [a Whisper model fine-tuned on air traffic control
audio](https://huggingface.co/jacktol/whisper-medium.en-fine-tuned-for-ATC-faster-whisper)
and `npm run asr` serves it on port 8781:

```
npm run asr:setup    # once — ~3 GB
npm run asr          # alongside npm start
```

The page probes for it on load. If it is there, push-to-talk records your audio
and sends it to the model; if it is not, nothing changes and the browser
recogniser handles it as before. Audio never leaves the machine and there is
nothing to pay for.

**This only works when the page is served locally.** The hosted copy on GitHub
Pages runs everything else — scenarios, grading, the radio audio, the GPS box —
but not this. Chrome blocks a public HTTPS page from reaching `127.0.0.1`
behind a *"wants to access devices on your local network"* permission prompt,
and showing that to someone who is not running the server would be noise. So
the page only looks for the recogniser when it is itself on `localhost`. Run it
locally and it just works.

**What makes it accurate is the hint.** Each transmission is sent with the
vocabulary of the radio — the phonetic alphabet, "niner" and "tree", the stock
phrases — and this aircraft's callsign in spoken form. Whisper conditions its
decoding on that text, which is what pulls "five sierra papa" back to the right
tokens.

The hint deliberately leaves out the values the step is grading: the runway, the
squawk, the frequency. Priming the model with the right answer risks it hearing
the right answer when you said the wrong one, and a trainer that passes a bad
readback is worse than one that mishears you. The server also throws out any
transcript with more words in it than could physically have been spoken in the
time recorded, which is what prompt-echo looks like when it happens.

Both engines feed one interface in `src/listen.js`, so the rest of the app does
not know or care which one is running.

## Structure

| File | Role |
| --- | --- |
| `src/phraseology.js` | Values to spoken radio: digits, altitudes, frequencies, callsigns |
| `src/grade.js` | Readback grading and habit detection |
| `src/scenario.js` | Scripted exchanges built from real airport data |
| `src/radio.js` | The VHF channel, in Web Audio |
| `src/listen.js` | Push-to-talk input: local ATC recogniser, or the browser's |
| `src/app.js` | Wiring, scenario flow, push-to-talk |
| `tools/build-airports.mjs` | Builds the airport and frequency dataset |
| `../tools/asr/server.py` | The local ATC speech recogniser |

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
- **The browser recogniser is still the default.** It is weak on aviation speak
  and the local ATC recogniser below is the fix, but that one is opt-in because
  it is a 3 GB download.
- **Frequency data has holes.** Some fields carry no frequencies at all in
  OurAirports, so scenario coverage is uneven.
- **`SpeechSynthesis` cannot route into Web Audio**, so the channel effect plays
  alongside the voice rather than processing it. Swapping in a TTS that returns
  audio buffers would route it properly through `radio.input`.
