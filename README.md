# Breathline

**Simulation: illustrative conditions and assumptions.**

Breathline helps one underground neighborhood in the Hollow use one crew, one tool kit and a few batteries to get more residents to shelter. It decides **what to repair, whom to escort, and whether checking an uncertain passage is worth the crew time it costs**. Recommendations become physical, minute-by-minute journeys, and Breathline executes them on one clock and compares them with doing nothing from the same starting state.

A shelter helps only if people can reach it. In the reference neighborhood, a wheelchair user in Deep Homes needs a step-free route, a crew member beside her the whole way and assistance on arrival. Eight residents in Pump Quarter need a vent corridor that stays below the hazard threshold. Twelve residents in Upper Homes can walk to Upper Refuge. Breathline finds the order of work that serves all three, or shows who stays stranded, why, and what outside help would change that by when.

Built for the **Life Underground** track. It runs entirely on one laptop: no accounts, no API keys, no network.

---

## Quick start

```bash
npm install            # once 
npm run dev            # http://localhost:5173
npm test               # engine test suite (vitest), ~6 s
npm run evidence       # one-command evidence report → EVIDENCE.md, evidence/report.json
npm run build          # → dist/index.html (single self-contained file)
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and build `dist/index.html`, one self-contained file with scripts, styles and fonts inlined |
| `npm run preview` | Serve the production build at http://localhost:4173 |
| `npm test` | Engine tests: reference conditions, edits, focused checks, validator, negative cases, interruptions, agreement gate, export/replay, requests, generated batch, seeded variations, stress |
| `npm run evidence` | Everything above **in order**, plus the replay command, the production build and a network-disabled browser run. Writes `EVIDENCE.md`, `evidence/report.json`, `evidence/batch.json`, `evidence/runs/*.json`. Exits **non-zero** if any required check fails or did not run |
| `npm run replay -- <export.json> [...]` | Import a run exported from the app (or `evidence/runs/*.json`), re-execute it from its initial snapshot, independently replay its event history and reconcile the final counts with the saved result |
| `npm run batch -- 20871120` | Reproduce the generated tiny-case batch from its seed |
| `npm run offline-check` | Network-disabled browser check of `dist/index.html` (needs Chrome or Chromium; set `CHROME_PATH` if it is not found) |

`EVIDENCE_SKIP_BROWSER=1 npm run evidence` skips the browser check. The skipped check is reported as **not run** and the command exits 1, as the brief requires.

## Offline route (exact)

1. Run `npm install && npm run build` once with network access.
2. `dist/index.html` is now fully self-contained: React, the engine, the CSS and the IBM Plex fonts (bundled from `@fontsource`, Latin subset) are inlined. The build makes no network requests.
3. Disable the network and open `dist/index.html` directly from disk (`file://…/dist/index.html`). `npm run preview` also works offline, since it serves from localhost.
4. The session (scenario edits, input revision, plan, approval, and a run checkpoint after every clock boundary) is kept in `localStorage` under the versioned key `breathline.session.v2`. On reload the run restores **paused at its last completed boundary** and waits for an explicit **Resume**. No time passes during the interruption, and no battery, delivery, protection effect, admission or inspection is applied twice.

`npm run offline-check` verifies this route in headless Chrome. DevTools offline mode is on and every non-`file:` request is refused and counted. The check finds, approves and runs A (forecast 24, then a simulation result of 24 against 12), reloads mid-run and resumes from the paused restore, edits during a run (the new-run explanation appears), shows that a changed condition blocks the old plan, shows that a missing confirmation blocks approval, runs D in both hidden states with both outcomes shown, runs E with protection kept separate from arrivals, and checks the mobile ordering. This checks browser interruption recovery. It does not show uninterrupted service through a real power loss.

## Using it

The interface is laid out like a planetarium or mission-control viewer: the neighborhood map fills the screen and everything else floats over it. The look is a worn government bunker terminal: deep indigo screen with a violet glow, scanlines and a faint flicker (off under `prefers-reduced-motion`), IBM Plex Mono throughout and VT323 only for large readouts. Long explanations sit behind *About this scenario*, *Plan details*, *What would help* and tooltips. The **Operations** view is built for a first-time coordinator and has one main action at each stage: **Find a plan → Confirm and approve → Run simulation → View results**.

- **The map (centre):** drag or use the arrow keys to move, scroll, pinch or press **+**/**−** to zoom, **0** or ⟲ to reset. The map is fitted into the space between the panels. Toggles above the time bar show or hide routes, hazard readings, place names and travel times, and open the map key. Hazards read *now → minute 20*; shelters read *places taken / places*. Selecting a place, a group or the crew opens a details card: hazard now and at minute 20, who is there, passages with travel times and state, planned work, a group's route and why anyone is still waiting, the crew's current and next task. Routes in force, the hazards on them, the affected residents and the crew are emphasised; unrelated passages fade.
- **Top left:** the scenario summary and three counters. Before a run they are labeled **Forecast**: can reach shelter, still needing help, and without crew intervention. During and after a run they show the **Simulation result**. In the uncertain-passage case the forecast is a range (for example 20–24), and the people whose route depends on the inspection are counted separately.
- **Left panel:** a compact roster (select a group's number to find it on the map). Each group shows a word and an icon as well as a color: *Arrived*, *On the way*, *Has a route*, *Waiting for inspection*, *Still needs help*, *Still needs help · temporary protection*. Below it, **People still needing help** gives the reasons from the planner's constraint checks and a tested request (what, where, by when, for whom) when one exists. The map legend sits at the bottom.
- **Right panel:** the recommended plan:
  - an outcome headline, e.g. *Help all 24 residents reach shelter*
  - a short numbered checklist, e.g. *Repair Fan 3 so Pump Quarter can pass. Open Gate B. Escort the Deep Homes residents…*
  - one forecast sentence, e.g. *24 can reach shelter; 12 without crew intervention*
  - the important dependencies and uncertainty
  - for the uncertain passage, both modeled outcomes side by side
  - for temporary protection, *"4 residents gain 6 minutes each below the hazard limit. They still need a route."*

  Exact timings, battery allocations, routes and the full explanation are under **Plan details**. Required confirmations appear as instructions such as *"Confirm Lower Refuge has 12 places."*, each with **Mark confirmed**. The next action is pinned to the bottom of the panel, and **Pause** stays visible during playback.
- **Time bar (bottom):** *Forecast* or *Simulation* label, the current minute out of 20, play/pause, and a 0–20 timeline with markers for planned crew tasks, the inspection result and arrivals (dashed markers only happen if the inspection finds the passage open). It names the next planned event.
- **Top right:** **Conditions** opens the setup editor and steward reports as a sheet over the map. Any change marks the current plan as needing to be found again. If a simulation is running, the sheet says beforehand that a change starts a **new run** from the updated starting conditions; it does not replan from where people are. **Results** reopens the simulation result. **More** holds the dispatch sheet preview, Print dispatch, Export and Copy record. **?** explains the roles.
- **Demo & testing** view: the map stays on screen; the left panel holds scenario switching (A–E) and hidden simulator conditions (never passed to the planner); the right panel holds stress tests with recomputation, search diagnostics, the evidence panel, the event log, exposure detail and assumptions; the time bar adds **Step 1 minute**, **Reset run** and speed.
- Every number and step comes from the engine's results; nothing about a scenario's outcome is written into the interface.

Place names are used throughout. Location codes appear only in Plan details, tooltips, the testing view and the printed dispatch. Keyboard focus is visible, the map and every marker on it can be reached and operated from the keyboard, and status is never shown by color alone. Under `prefers-reduced-motion` the camera, markers and route animation don't move. Below 1050 px the layout becomes a single scrolling column with the plan and next action above the map.

## The model

- **Neighborhood:** 15 locations, 16 bidirectional connections, two shelters (12 places each), a 20-minute horizon, one crew starting at the fan workshop with one tool kit and 4 batteries (6 in E). Fixtures A–E are data overrides of one topology (`src/engine/scenarios.ts`).
- **Hazards:** `h(t) = initial + rate·min(t, r) + repairedRate·max(0, t − r)`, generalised to several ordered changes. A repair keeps the hazard already accumulated and cannot erase a crossing. Occupancy requires hazard **strictly below 100**. Safety is checked at every boundary for every node a resident or the crew occupies, including waits, work, rendezvous, departures and arrivals.
- **Exposure:** left-endpoint integration of hazard-index minutes per person, including waiting before departure, reported group by group.
- **Protected minutes:** elapsed one-minute intervals that begin before the location first reaches the threshold (20 at most, never 21). They count only for unresolved residents and are never shown as arrivals.
- **Capacity:** corridor occupancy is reserved on [departure, arrival) as one pool shared by both directions. Locations hold 24 residents. Shelters use a time-indexed place profile. Residents may not pass through a shelter. The crew may.
- **Access:** stairs are unusable for step-free groups. The escort occupies the crew from the joint departure through admission. Shelter suitability (accessible entry, assistance on arrival, ventilation operating) excludes a shelter when an item is confirmed absent and blocks approval when it is unconfirmed.
- **Instructions:** each group's `instructionsAvailableAt`; departure ≥ that minute. This is a declared delay. It does not show that a message was delivered.

## The planner

The confirmed-state planner (`src/engine/planner.ts`) runs a bounded enumeration seeded with the no-intervention baseline and optimises lexicographically:

1. residents assigned feasible shelter journeys
2. protected person-minutes for residents left without one
3. worst per-person exposure among assigned groups
4. crew busy minutes (travel + work + inspection + escort)
5. batteries consumed
6. final arrival
7. remaining ties: earlier arrivals overall, then stable IDs

**Declared search scope** (also shown in the app):
- every subset and order of offered interventions and escorts, each target at most once
- the crew starts each task as soon as it arrives by the earliest safe route and the task's batteries are on hand; it waits only for on-hand batteries or a group's departure
- work and escorts complete within the horizon
- escort candidates: the earliest admission at each suitable shelter, plus the earliest admission at or after each confirmed place-delivery minute
- resident candidates: one minimum-exposure trajectory per (shelter, admission minute) from a time-expanded search over (location, minute) with waiting; corridor or location conflicts trigger a residual-capacity re-search
- joint assignment over every subset of servable groups, so a greedy first route never blocks another group (the tiny alternative-shelter test shows greedy serving 2 where joint assignment serves 4)

**Status** is reported as *exhaustive within the declared scope*, *best feasible found before limit*, *proven infeasible within the declared model*, or *no feasible assignment found before limit*. A timeout is never reported as impossibility. Budget: 20,000 plans or 8 s per search.

**Performance on the tested machine** (Intel Xeon 2.1 GHz, 2 cores, Node 22; median of 3): A 3.0 ms (8 plans), B 2.6 ms, C 3.1 ms, D 17 ms (80 policies), E 2.4 ms. Every reference search was exhaustive. A full set of resource requests takes about 0.1–0.5 s.

### Inspection as a decision (D): bounded two-state policies

`src/engine/policy.ts` takes the **knowledge snapshot** only: one connection declared unknown with possible states *open | blocked*. A policy is a shared action prefix, at most one inspection, and two mutually exclusive suffixes chosen only by the observed result. Resident departures before the observation are identical in both states, and their candidates come from a two-state search that must be valid in both. The policy objective is: min(n_open, n_blocked); then n_open + n_blocked; [protection min/sum when the fallback action is offered]; worst exposure over both states; crew busy max then sum; batteries max then sum; latest arrival. The second criterion is an explicit preference across two possibilities. It is not a probability or "expected lives".

**Knowledge and truth are separate.** The planner's signature has no truth parameter. Truth lives in a `Truth` object that only the simulator reads, and the hidden-state invariance check confirms that the policy is identical whichever truth the test controller sets. An observation outside the declared states pauses the run, and no third branch is invented.

### Shared resource ledger and future commitments

`src/engine/ledger.ts` is the single source of rules for batteries (pack + delivery points; available / reserved / consumed / pending unreserved / pending reserved) and shelter place profiles. The planner, validator, approval check, simulator and invariant checker all call it. A request becomes usable only once it is recorded as a **confirmed expected delivery**. Work starts only when its batteries are reserved **and on hand** at the work location. A late or missing delivery pauses playback, names the delivery and the blocked task, and never starts work early or admits a group anyway.

## Validation

- **Independent validator** (`src/engine/validator.ts`): rebuilds hazard changes from completed work (not from the planner's effect list), re-walks every primitive leg, re-integrates exposure, re-checks every capacity, the suitability checklist and the battery sources, and recomputes the objective.
- **Execution invariants** (`src/engine/invariants.ts`), checked at every boundary of every executed run: crew continuity, continuous escorting, shelter capacity and reservation conversion, battery accounting, no work on pending resources, suitable destinations, protection is not evacuation, valid arrivals. A deliberately corrupted event pauses playback and names the invariant.
- **Agreement gate** (`src/engine/agreement.ts`): for every reference run, five views agree boundary by boundary: planner forecast, validator, live execution, replay of the exported events, and resumption from every checkpoint.
- **Independent exhaustive solver** (`src/oracle/exhaustive.ts`): a minute-by-minute crew and resident enumeration with its own hazard function that imports only data types. It is compared with production on two hand-built tiny graphs and on a seeded batch of generated tiny neighborhoods (80+ cases, both *inspection-helps* and *inspection-wastes-time* kinds), using the **complete** lexicographic objective. Preconditions: no deliveries, and corridor/location capacities that never bind (corridor capacity has its own tests).
- **Stress**: the selected A–C plans under 8 declared variants (repair +0/1/3/4 min × original growth ×1.0/1.2), propagated without re-optimising and revalidated, plus on-demand recomputation. D is executed in both states at inspection durations 1, 7 and 8.
- **Seeded variations**: 15 perturbations of A–C (battery shortage, shelter capacity, repair time, connection time, instructions, hazard growth), each validated and compared with its baseline.

See **EVIDENCE.md** for the recorded results, commands, build identifier, input hashes, times and limitations.

## Reproducing a reported run

Export JSON from the app (or use `evidence/runs/*.json`). Each export contains the initial snapshot, the input revision and hash, the knowledge snapshot and, separately, the simulator truth; reports; confirmed deliveries and their actual delivery events; shelter confirmations; the resource ledger; fallback protection and protected minutes; assumptions; search budget and status; the selected schedule or policy with branch reservations and objective components; observation history; the activated branch; and the full event history. Then run:

```bash
npm run replay -- path/to/export.json
```

## Project layout

```
src/engine/     types, scenarios (A–E), world (hazards), ledger, reservations, routing, crew,
                assign, planner, policy, explain, validator, approval, simulate, invariants,
                timeline, replay, agreement, stress, requests, benefit, exportRun
src/oracle/     exhaustive.ts (independent solver), tiny.ts (hand-built graphs + seeded generator)
src/checks/     suites.ts (evidence checks shared by npm test and npm run evidence)
src/ui/         React interface (session, map, panels, printable dispatch)
scripts/        evidence.ts, replay.ts, batch.ts, offline-check.ts
tests/          vitest entry points
docs/           EVIDENCE-manual.md (human-run checks and their status)
```


## Team

- [@iamenibrahim](https://github.com/iamenibrahim)
- [Ahmed Osman (@ahmedsati)](https://github.com/ahmedsati)
- [@elmi4f](https://github.com/elmi4f)
- [Sami (@sahassan321)](https://github.com/sahassan321)
