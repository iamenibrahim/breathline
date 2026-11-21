## Checks that are not part of the one-command run

### Interface walkthroughs (full evacuation and an edited run)

Status: **observed by an automated headless-browser script, not by a person.** `scripts/offline-check.ts` (the `offline-browser` check above) drives the real built interface in Chrome with DevTools offline mode on and every non-`file:` request refused. It checks each of the following:

- A: forecast 24, then a simulation result of 24 against 12 without crew intervention, with **Pause** dominant during playback
- no location codes on the main screen
- a reload mid-run restores paused at the last saved minute and resumes to 24 with 0 invariant violations
- editing during a run warns beforehand, and the notice says it starts a new run and does not replan
- a changed condition makes the old plan unapprovable, and finding a plan again gives 16
- an unconfirmed shelter-place count shows "Confirm Lower Refuge has 12 places." and blocks approval until it is confirmed and the plan is found again
- D shows both modeled outcomes and "Waiting for inspection", then executes 20 (blocked) and 24 (open)
- E shows "4 residents gain 6 minutes each below the hazard limit. They still need a route." and counts 20 arrived separately from the 4 protected residents
- at 390 px wide the plan and next action come before the map

A walkthrough by a person at the keyboard, or a usability test with first-time users, has **not been recorded**.

### Dispatch comprehension test

Status: **not run.** This test needs two people who did not build the system: one holding the printed crew sheet, one holding the printed resident instructions, acting out the journey while a facilitator advances the clock and executes only what they say they would do. It could not be carried out in this build session, and no result is claimed.

Protocol, so it can be run as written:

1. Print the dispatch for A (`Print dispatch` after approving A) and for D (policy, both branches).
2. Teammate 1 gets the crew sheet; teammate 2 gets the resident instructions. No verbal guidance from the builder.
3. The facilitator steps the clock one minute at a time and executes only stated actions.
4. Record: confusing wording; missed dependencies (Group A setting out before the crew arrives; the crew leaving A before admission; the crew crossing the bypass without the inspection result; starting work before a delivery arrives); skipped acknowledgements; whether each journey completes.
5. Fix the sheet where it was misunderstood, then repeat once.

| Round | Sheet version | Confusing wording | Missed dependencies | Skipped acknowledgements | Journeys completed |
|---|---|---|---|---|---|
| 1 | — | not run | not run | not run | not run |
| 2 | — | not run | not run | not run | not run |

What the sheet already does about those failure modes, which is a design note and not a test result: the resident text for escorted groups starts with "Do NOT set out alone. The crew arrives to collect you"; the crew escort line says "Stay with the group the whole way; step-free passages only; do not leave before admission"; the D sheet prints both branches with a STOP rule for an unexpected observation; each confirmed delivery lists the tasks waiting on it with "stop the dependent task, keep residents where they are, report".

## Limitations of this evidence

- Everything is a simulation with fictional hazard units. Arrivals show feasible shelter journeys within the disclosed model. They are not lives saved, medical outcomes or long-term safety.
- Search results are exhaustive only within the declared search scope (listed in the app's Search diagnostics panel and in the README). The independent exhaustive solver checks generated tiny instances under its stated preconditions: no deliveries, and capacities that never bind except shelter places.
- Stress results describe the eight declared variants only. They are not a failure probability.
- The network-disabled check uses headless Chrome's offline mode on the single-file build. It is not a test on the coordinator's actual laptop, and it says nothing about uninterrupted service during a real power loss.
