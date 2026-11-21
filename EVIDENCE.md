# Breathline — Evidence report

**Simulation — illustrative conditions and assumptions.** Everything below is an observed output of the recorded command on the machine named; expectations come from the build brief and are listed separately from observations. Nothing here is a judging score.

- Command: `npm run evidence` (exit status **0**)
- Build identifier: `breathline-1.0.0+src.460330e68b373b1f`
- Generated: 2026-11-21T04:11:06.280Z · total 60.2 s
- Machine: Intel(R) Xeon(R) Processor @ 2.10GHz ×2, linux 6.18.44-fc-v726, Node v22.23.5
- Result: **114 passed, 0 failed, 0 not run** (of 114 checks)

## Rubric criteria → recorded checks

| Criterion | Weight | Checks (status) |
|---|---:|---|
| Survival impact and usefulness | 25 | ref-A (passed), ref-C (passed), ref-E (passed), ref-E-order (passed), edit-A-bat3 (passed), edit-A-L11 (passed), edit-B-instr2 (passed), edit-A-noaccess (passed), edit-E-bat4 (passed), explain-A (passed), benefit-A-E (passed), f-protected-time (passed), f-suitability (passed), neg-confirm-change (passed), neg-unconfirmed (passed), req-D-blocked (passed), req-A-L11 (passed), req-B-instr (passed), req-A-bat3 (passed), req-E (passed), req-A-noaccess (passed), future-D-batteries (passed), future-A-place (passed) |
| Technical execution | 25 | engine-tests (passed), ref-D-exec (passed), ref-D-truth-invariance (passed), ref-label-invariance (passed), edit-A-bat3 (passed), edit-A-L11 (passed), edit-B-instr2 (passed), edit-A-noaccess (passed), edit-E-bat4 (passed), validator-all (passed), f-threshold (passed), f-protected-time (passed), f-exposure (passed), f-instructions (passed), f-stairs (passed), f-escort (passed), f-crew-conflict (passed), f-toolkit (passed), f-batteries (passed), f-shelter-transit (passed), f-capacity (passed), f-threshold-arrival (passed), f-corridor (passed), f-reservation-conversion (passed), f-joint-alt-shelter (passed), f-tiny-policy (passed), generated-batch (passed), neg-stale (passed), neg-duplicate (passed), neg-corrupt (passed), neg-unknown-edge (passed), neg-confirm-change (passed), neg-unconfirmed (passed), int-A-5 (passed), int-A-3-10-13 (passed), int-D-5-10-14-17 (passed), int-D-5-10-17 (passed), int-D-14-16-20 (passed), int-E-5-13 (passed), int-A-19-20 (passed), export-A response (passed), export-A baseline (passed), export-B response (passed), export-B baseline (passed), export-C response (passed), export-C baseline (passed), export-A fan only (passed), export-A gate+escort (passed), export-D1 policy, open (passed), export-D1 policy, blocked (passed), export-D8 policy, open (passed), export-D8 policy, blocked (passed), export-D confirmed-route, open (passed), export-D confirmed-route, blocked (passed), export-E response (passed), export-E baseline (passed), export-E fan only (passed), export-A + Lower Refuge place at 20 (passed), export-D + 4 batteries at G by 14, open (passed), export-D + 4 batteries at G by 14, blocked (passed), agree-A response (passed), agree-A baseline (passed), agree-B response (passed), agree-B baseline (passed), agree-C response (passed), agree-C baseline (passed), agree-A fan only (passed), agree-A gate+escort (passed), agree-D1 policy, open (passed), agree-D1 policy, blocked (passed), agree-D8 policy, open (passed), agree-D8 policy, blocked (passed), agree-D confirmed-route, open (passed), agree-D confirmed-route, blocked (passed), agree-E response (passed), agree-E baseline (passed), agree-E fan only (passed), agree-A + Lower Refuge place at 20 (passed), agree-D + 4 batteries at G by 14, open (passed), agree-D + 4 batteries at G by 14, blocked (passed), invariants-summary (passed), future-D-batteries (passed), future-A-place (passed), future-A-place-reference (passed), future-B-instr (passed), seeded-variations (passed), stress-A (passed), stress-B (passed), stress-C (passed), stress-recompute (passed), benchmarks (passed), replay-command (passed), build (passed), offline-browser (passed) |
| Fit with the Hollow | 20 | ref-A (passed), ref-B (passed), ref-B-margin (passed), ref-D1 (passed), ref-D7 (passed), ref-D8 (passed), ref-E (passed), f-suitability (passed), int-A-5 (passed), int-A-3-10-13 (passed), int-D-5-10-14-17 (passed), int-D-5-10-17 (passed), int-D-14-16-20 (passed), int-E-5-13 (passed), int-A-19-20 (passed), req-D-blocked (passed), req-A-L11 (passed), req-B-instr (passed), req-A-bat3 (passed), req-E (passed), req-A-noaccess (passed), stress-A (passed), stress-B (passed), stress-C (passed), offline-browser (passed) |
| Connected problem-solving | 10 | ref-A (passed), ref-A-components (passed), ref-B (passed), ref-C (passed), ref-E-order (passed), f-joint-alt-shelter (passed) |
| Originality and ingenuity | 10 | ref-D1 (passed), ref-D7 (passed), ref-D8 (passed), ref-D-exec (passed), ref-D-truth-invariance (passed), f-tiny-policy (passed), generated-batch (passed), neg-unknown-edge (passed), stress-D (passed) |
| Demo and communication | 10 | explain-A (passed), offline-browser (passed) |

Weights are the proposed rubric’s; the table maps evidence to criteria and awards nothing.

## engine-tests

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| engine-tests | Engine test suite (npm test) | all tests pass | 21/21 tests passed in 3 files | **passed** | — | — | 8284 |

## reference

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| ref-A | A: repair, open, escort serves 24; baseline 12; executed arrivals | 24 assigned (fan > gate > escort), baseline 12; executed 24 vs 12 | assigned 24 (repair-fan-3 > open-gate-b > escort-A); baseline 12; executed arrivals 24 vs 12; +12 | **passed** | valid; exhaustive | 872501e9f46075a8 | 36 |
| ref-A-components | A component removal: none 12, fan only 20, gate+escort 16, all 24 | 12 / 20 / 16 / 24 | 12 (C) / 20 (BC) / 16 (AC) / 24 (ABC) | **passed** | — | 872501e9f46075a8 | 39 |
| ref-B | B: rescue first; fan-first cannot serve 24 | selected gate > escort > fan = 24; fan-first best 20; no intervention 12; gate+escort 16 | selected 24 (open-gate-b > escort-A > repair-fan-3); fan-first best 20; none 12; gate+escort 16 | **passed** | valid; exhaustive | b4331e630766b360 | 28 |
| ref-C | C: stable ventilation — fan repair excluded; batteries preserved | 24 without fan; 4 batteries preserved after execution | assigned 24 (open-gate-b > escort-A); consumed 0; preserved 4; baseline 20 | **passed** | valid | a32c586a6fa88537 | 16 |
| ref-D1 | D, inspection 1 min: policy 24/20 with inspection; confirmed-route response 20/20 | 24/20; inspection included; confirmed routes 20/20 | 24/20; inspection 9–10; confirmed routes 20/20; | **passed** | valid; exhaustive | 74d0fd2d2af53f48 | 72 |
| ref-D7 | D, inspection 7 min: policy 24/20 with inspection; confirmed-route response 20/20 | 24/20; inspection included; confirmed routes 20/20 | 24/20; inspection 9–16; confirmed routes 20/20; open-branch A arrival 20 | **passed** | valid; exhaustive | 34fcce97986065d6 | 26 |
| ref-D8 | D, inspection 8 min: policy 20/20, no inspection; confirmed-route response 20/20 | 20/20; inspection omitted; confirmed routes 20/20 | 20/20; inspection omitted; confirmed routes 20/20; | **passed** | valid; exhaustive | 7f3d3b9440884221 | 19 |
| ref-D-exec | D: execute both hidden states (policy) and the confirmed-route response from the same snapshot | policy open 24 / blocked 20 arrivals; confirmed-route 20 / 20 | policy 24/20; confirmed-route 20/20 | **passed** | — | — | 36 |
| ref-D-truth-invariance | D: changing only hidden truth leaves the pre-observation policy unchanged | identical policy JSON for open and blocked truths | identical (the planner signature has no truth parameter; truth is only passed to the simulator) | **passed** | — | — | 62 |
| ref-label-invariance | Scenario labels and group display names do not change the objective | identical objective after relabelling | identical objectives (D and A) | **passed** | — | — | 47 |
| ref-E | E: fan then ventilation; 20 assigned; A protected 20 vs 14 (+6/person, +24 person-minutes); 6 batteries | 20; protected 20 (none) vs 14 (fan only); 6 consumed exactly once | assigned 20 (repair-fan-3 > ventilate-RA); executed arrivals 20; A protected 20 vs fan-only 14 vs none 14; vent-only 12 assigned / 20 min; +6/person, +24 person-minutes; batteries consumed 6; A status unresolved | **passed** | valid | 5c5c4eab6f7cddf2 | 8 |
| ref-E-order | E: ventilation-first is rejected because it loses B (evacuation outranks protection) | ventilation-first best = 12 assigned | ventilation-first best: 12 assigned, A protected 20 | **passed** | — | — | 1 |
| explain-A | A: explanation connects the work to the residents it enables, from computed checks | names the J3 hazard 68 vs 100 for B and the escort for A | 24 of 24 residents have a feasible shelter journey (+12 versus no intervention). Repair Fan 3 (0–5) so Pump Quarter B (8) can pass the vent corridor at minute 9 (hazard 68 instead of 100); then open Gate B (7–9); then escort the 4 Deep Homes A residents, including the wheelchair user, to Lower Refuge (arriving at minute 13). | **passed** | — | — | 4 |
| benefit-A-E | Per-group benefit from executed baseline and response runs (A and E) | A: A and B newly arrive, C unchanged; E: A +6 min/person, +24 person-minutes, not evacuated | A: Accessible assistance: Gate B opened and a continuous escort to Lower Refuge [Unresolved — location reached the threshold → Arrived (minute 13)] \| B: A traversable corridor: Repair Fan 3 keeps Vent corridor below threshold at arrival [Unresolved → Arrived (minute 10)] \| C: Retained shelter access: its existing route and Upper Refuge places stay reserved (outcome unchanged — not credited to the intervention) [Arrived (minute 3) → Arrived (minute 3)] \| A: Temporary ventilation at Deep Homes A — not evacuated; below threshold until the horizon at minute 20 instead of reaching it at minute 14 (+6 minutes per person, 24 person-minutes) [Unresolved — location reached the threshold → Unresolved] \| B: A traversable corridor: Repair Fan 3 keeps Vent corridor below threshold at arrival [Unresolved → Arrived (minute 10)] \| C: Retained shelter access: its existing route and Upper Refuge places stay reserved (outcome unchanged — not credited to the intervention) [Arrived (minute 3) → Arrived (minute 3)] | **passed** | — | — | 21 |

## stress

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| ref-B-margin | B: one-minute repair delay makes J3 unsafe at B’s arrival (selected plan) | B fails at +1 minute (J3 = 100 at minute 18) | B fails: group B: reaches J3 at 18 with hazard 100 (must be < 100) | **passed** | — | — | 23 |
| stress-A | A: selected plan under 8 declared variants (repair +0/1/3/4 × growth ×1.0/1.2) | 8 rows evaluated with propagation, revalidated | +0min x1.0: 24; +0min x1.2: 24; +1min x1.0: 24; +1min x1.2: 24; +3min x1.0: 24; +3min x1.2: 12; +4min x1.0: 12; +4min x1.2: 12 | **passed** | — | — | 10 |
| stress-B | B: selected plan under 8 declared variants (repair +0/1/3/4 × growth ×1.0/1.2) | 8 rows evaluated with propagation, revalidated | +0min x1.0: 24; +0min x1.2: 16; +1min x1.0: 16; +1min x1.2: 16; +3min x1.0: 16; +3min x1.2: 16; +4min x1.0: 12; +4min x1.2: 12 | **passed** | — | — | 18 |
| stress-C | C: selected plan under 8 declared variants (repair +0/1/3/4 × growth ×1.0/1.2) | 8 rows evaluated with propagation, revalidated | +0min x1.0: 24; +0min x1.2: 24; +1min x1.0: 24; +1min x1.2: 24; +3min x1.0: 24; +3min x1.2: 24; +4min x1.0: 24; +4min x1.2: 24 | **passed** | — | — | 6 |
| stress-recompute | B: recompute under +1 min repair delay from the same perturbed snapshot (reported separately) | selected plan fails for B; recomputation reports its own result and search status | recomputed: 20 (repair-fan-3), exhaustive; A remains reachable only without the fan, B only with it | **passed** | — | — | 10 |
| stress-D | D: selected policies executed in both states at inspection 1 and 8, plus the 7-minute boundary | d1 24/20, d7 24 (A at 20)/20, d8 20/20 executed | d1: open 24, blocked 20; d7: open 24 (A at 20), blocked 20; d8: open 20, blocked 20 | **passed** | — | — | 69 |

Limitations:
- stress-A: Eight-case result describes those eight cases only; not a failure probability.
- stress-B: Eight-case result describes those eight cases only; not a failure probability.
- stress-C: Eight-case result describes those eight cases only; not a failure probability.

## edits

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| edit-A-bat3 | A: batteries 4 → 3 | repair unavailable; 16 | 16 (AC; open-gate-b > escort-A). B: Repair Fan 3 needs 4 batteries; 3 are available. Vent corridor (J3) reaches 100 at minute 9, when the group would arrive there (occupancy requires below 100). | **passed** | valid; exhaustive | 1e84930654d4198f | 4 |
| edit-A-L11 | A: Lower Refuge 12 → 11 places | 20 through B and C | 20 (BC; repair-fan-3). A: No open step-free route in this plan: RA-G blocked (Open Gate B would open it; not in this plan); RA-X3 blocked; no available action opens it. Needs a continuous escort; in this plan the crew is committed to other work. Lower Refuge has 11 places; B (8) is assigned there; A needs 4. | **passed** | valid; exhaustive | dc798e08970e53af | 7 |
| edit-B-instr2 | B: B instructions at minute 2 | 24 infeasible; B arrival would be 21 | 16 (AC; open-gate-b > escort-A). B: Instructions are available at minute 2; the shortest journey takes 19 minutes, so arrival would be minute 21, after the 20-minute horizon. | **passed** | valid; exhaustive | 1a807a7529f9faea | 4 |
| edit-A-noaccess | A: Lower Refuge accessible entry confirmed absent | 20 through B and C; unsuitable shelter | 20 (BC; repair-fan-3). A: No suitable shelter: Lower Refuge has places but no confirmed accessible entry; Upper Refuge has places but no confirmed assistance on arrival. | **passed** | valid; exhaustive | baf2d9178e3de604 | 3 |
| edit-E-bat4 | E: batteries 6 → 4 | fan kept; 20; A protected 14 | 20 (BC; repair-fan-3; A protected 14). A: No step-free route to a suitable shelter: RA-G blocked; no available action opens it; RA-X3 blocked; no available action opens it. | **passed** | valid; exhaustive | 74ba21b1176325a0 | 3 |

## validator

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| validator-all | Independent validator accepts every reference plan and recomputes the same objective | all valid | A selected: valid; A baseline: valid; B selected: valid; B baseline: valid; C selected: valid; C baseline: valid; E selected: valid; E baseline: valid; D1 policy: valid; D7 policy: valid; D8 policy: valid | **passed** | — | — | 60 |

## focused

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| f-threshold | Strict threshold: hazard 100 is unsafe, 99.x is safe; repair preserves accumulated hazard | J3 = 100 at 9 unrepaired (unsafe); 68 with repair at 5; RA 93 then held | J3(9)=100 unrepaired, 68 repaired at 5 (J3(5)=60); RA(20) with protection at 13 = 93 | **passed** | — | — | 0 |
| f-protected-time | Protected minutes count elapsed intervals (max 20, never 21); a crossed threshold cannot be undone | 14 without ventilation, 20 with it; ventilation after crossing gains nothing | none 14; ventilated at 13 20; ventilated at 15 (after crossing at 14) 14 | **passed** | — | — | 0 |
| f-exposure | Exposure integrates waiting before departure (left endpoint) and travel | A in A: waiting 0–9 = 335; B 0; unresolved A over horizon = 1370 | A exposure 335 (waiting 335, travel 0); unresolved A over 20 minutes 1370 | **passed** | — | — | 4 |
| f-instructions | Instruction availability: departure before instructionsAvailableAt is rejected | validator rejects (…before instructions…) | group C: departs at 0 before instructions are available at 1 | **passed** | — | — | 3 |
| f-stairs | Wheelchair access: an escort over the stairs is rejected | validator rejects (…not step-free…) | crew escort A: RA-ST is not step-free | **passed** | — | — | 2 |
| f-escort | Continuous escort: a group moving without the crew alongside is rejected | validator rejects (…escort covers…) | group A: escort covers 10-13, journey is 11-14 | **passed** | — | — | 4 |
| f-crew-conflict | Crew conflicts: overlapping activities are rejected | validator rejects (…overlaps…) | crew travel: overlaps the previous activity (starts 4, previous ends 5) | **passed** | — | — | 3 |
| f-toolkit | Equipment: work without the tool kit is rejected | validator rejects (…tool kit…) | Repair Fan 3 needs the tool kit | **passed** | — | — | 3 |
| f-batteries | Batteries: work beyond the pack is rejected | validator rejects (…pack exhausted…) | Repair Fan 3: crew pack exhausted at minute 0 | **passed** | — | — | 3 |
| f-shelter-transit | No shelter transit: a resident route through a shelter is rejected | validator rejects (…shelter…) | group C: destination X2 is not a shelter | **passed** | — | — | 4 |
| f-capacity | Joint indivisible assignment: over-filling a shelter is rejected | validator rejects (…places needed…) | L: 12 places needed at minute 13, 11 available | **passed** | — | — | 2 |
| f-threshold-arrival | Threshold at arrival: B through unrepaired J3 at minute 9 is rejected | validator rejects (…hazard…) | group B: reaches J3 at 9 with hazard 100 (must be < 100) | **passed** | — | — | 3 |
| f-corridor | Shared corridor capacity: overlapping and opposite-direction intervals conflict; adjacent intervals do not | overlap blocked; adjacent allowed; opposite shares the pool; planner staggers groups | overlap blocked true; adjacent allowed true; same-direction staggered [1,3) [3,5); opposite M→N [1,3) N→M [3,5); forced overlap rejected: corridor M-N carries 6 residents at minute 1 (capacity 3) | **passed** | — | — | 4 |
| f-reservation-conversion | Reservation-to-occupant conversion: each arrival converts exactly one reservation | occupants equal reservations at the horizon, no duplicates | L: occupants B,A / reservations A,B; U: occupants C / reservations C | **passed** | — | — | 13 |

## suitability

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| f-suitability | Suitability: absent accessible entry or assistance removes the shelter for A only; absent ventilation removes it for every group; unconfirmed items block approval | A-only exclusion; all-group exclusion; approval blocked | assistance absent → BC; ventilation absent → C; accessible entry unconfirmed → planned 24, approval: unconfirmed essential input: Lower Refuge: accessible entry (Lower Refuge steward) | **passed** | — | — | 15 |

## oracle-tiny

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| f-joint-alt-shelter | Tiny alternative-shelter graph: joint assignment serves 4 where greedy first-route commitment serves 2 | production 4 = oracle 4; greedy 2 | production {"batteries":0,"busy":0,"finalArrival":2,"maxExposure":0,"protectedPM":0,"served":4}; oracle {"batteries":0,"busy":0,"finalArrival":2,"maxExposure":0,"protectedPM":0,"served":4}; flexible group → S2; greedy 2 | **passed** | valid | — | 7 |
| f-tiny-policy | Tiny two-state graph: independent policy enumeration agrees with production (inspection helps at 1 min, omitted at 3 min) | complete policy objective identical at both durations | d=1: agree 5/3 inspection used (2398 inspection policies enumerated); d=3: agree 3/3 inspection omitted (199 inspection policies enumerated) | **passed** | — | — | 361 |

## generated-batch

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| generated-batch | Generated tiny-case batch (seed 20871120): complete lexicographic objective vs independent exhaustive solver | every case agrees on every objective component and validates; both inspection kinds present (>= 8 each) | 81 cases (40 confirmed-state, 41 two-state); agree 81; valid 81; inspection-helps 8; inspection-wastes-time 30; failures none | **passed** | — | — | 3194 |

Limitations:
- generated-batch: Agreement establishes correctness for these generated instances only. Generator bounds: corridor/location capacities not varied and no deliveries (oracle preconditions).

## negative

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| neg-stale | Stale approval is rejected | plan computed at revision 0 cannot be approved at revision 1 | Stale plan: computed for input revision 0, current revision is 1. Recompute before approval. \| same revision approves: true | **passed** | — | — | 6 |
| neg-duplicate | Duplicate completion/boundary processing does not duplicate consumption, occupancy or arrivals | identical state after re-processing minute 5 (fan completion) and 13 (admission) | minute 5 identical; minute 13 identical | **passed** | — | — | 14 |
| neg-corrupt | A deliberately corrupted event (teleport into a shelter) pauses playback naming the invariant | paused; invariant "valid arrivals" | paused at 5: Invariant violated: valid arrivals — B jumped from J2 to L, which are not adjacent (event corrupt:05:05) | **passed** | — | — | 11 |
| neg-unknown-edge | Unknown-edge traversal before inspection is rejected (validator) and cannot execute (simulator) | validator error; simulator pauses | validator: [open] uses the unknown connection without inspection; simulator: Invariant violated: shelter capacity — Lower Refuge: reservations need 16 places at minute 17, profile has 12 | **passed** | — | — | 40 |
| neg-confirm-change | Changed steward confirmation (Lower Refuge 11 places) makes the plan stale; recomputation returns 20 (B, C), names the lost group and the request | stale; recompute 20; A lost; request: 1 place at Lower Refuge by 20 | stale true; recompute 20 (BC); lost A; request: Confirm 1 more place at Lower Refuge, available by minute 20, so Deep Homes A (4 residents, including the wheelchair user) can be admitted and all 24 residents arrive. If it arrives by minute 13, nobody waits for it (time that avoids waiting); the deadline 20 relies on safe waiting. | **passed** | — | — | 182 |
| neg-unconfirmed | Unconfirmed essential inputs (places, instructions, delivery) block approval and are listed | approval blocked with reasons; residents not dropped | planned 24; unconfirmed essential input: Upper Refuge: 12 places (Upper Refuge steward) \| unconfirmed essential input: Departure instructions for Pump Quarter B available by minute 0 (resident representative) | **passed** | — | — | 3 |

## interruption

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| int-A-5 | Reload before/after transactions: A fan completion | resumed runs identical to the uninterrupted run (battery consumption exactly once) | before minute 5: ok; after minute 5: ok; consumed 4; arrivals 24 | **passed** | — | — | 20 |
| int-A-3-10-13 | Reload before/after transactions: A admissions (C 3, B 10, A 13) | resumed runs identical to the uninterrupted run (shelter admission exactly once) | before minute 3: ok; after minute 3: ok; before minute 10: ok; after minute 10: ok; before minute 13: ok; after minute 13: ok; consumed 4; arrivals 24 | **passed** | — | — | 39 |
| int-D-5-10-14-17 | Reload before/after transactions: D fan completion + inspection (open) | resumed runs identical to the uninterrupted run (consumption, observation, admission exactly once) | before minute 5: ok; after minute 5: ok; before minute 10: ok; after minute 10: ok; before minute 14: ok; after minute 14: ok; before minute 17: ok; after minute 17: ok; consumed 4; arrivals 24 | **passed** | — | — | 53 |
| int-D-5-10-17 | Reload before/after transactions: D fan completion + inspection (blocked) | resumed runs identical to the uninterrupted run (consumption, observation, admission exactly once) | before minute 5: ok; after minute 5: ok; before minute 10: ok; after minute 10: ok; before minute 17: ok; after minute 17: ok; consumed 4; arrivals 20 | **passed** | — | — | 60 |
| int-D-14-16-20 | Reload before/after transactions: D battery-request run: delivery at 14 and Gate B completion at 16 | resumed runs identical to the uninterrupted run (delivery and consumption exactly once) | before minute 14: ok; after minute 14: ok; before minute 16: ok; after minute 16: ok; before minute 20: ok; after minute 20: ok; consumed 8; arrivals 24 | **passed** | — | — | 90 |
| int-E-5-13 | Reload before/after transactions: E fan (5) and ventilation (13) completion | resumed runs identical to the uninterrupted run (battery consumption and protection effect exactly once) | before minute 5: ok; after minute 5: ok; before minute 13: ok; after minute 13: ok; consumed 6; protection effects 2; A protected 20 | **passed** | — | — | 9 |
| int-A-19-20 | Reload before/after transactions: A Lower Refuge place delivery at 20 | resumed runs identical to the uninterrupted run (place delivery and admission exactly once) | before minute 19: ok; after minute 19: ok; before minute 20: ok; after minute 20: ok; consumed 4; arrivals 24 | **passed** | — | — | 29 |

## replay-export

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| export-A response | Export → JSON → re-execute and replay: A response | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 872501e9f46075a8 | 7 |
| export-A baseline | Export → JSON → re-execute and replay: A baseline | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 872501e9f46075a8 | 4 |
| export-B response | Export → JSON → re-execute and replay: B response | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | b4331e630766b360 | 4 |
| export-B baseline | Export → JSON → re-execute and replay: B baseline | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | b4331e630766b360 | 4 |
| export-C response | Export → JSON → re-execute and replay: C response | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | a32c586a6fa88537 | 4 |
| export-C baseline | Export → JSON → re-execute and replay: C baseline | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | a32c586a6fa88537 | 3 |
| export-A fan only | Export → JSON → re-execute and replay: A fan only | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 872501e9f46075a8 | 5 |
| export-A gate+escort | Export → JSON → re-execute and replay: A gate+escort | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 872501e9f46075a8 | 4 |
| export-D1 policy, open | Export → JSON → re-execute and replay: D1 policy, open | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 74d0fd2d2af53f48 | 4 |
| export-D1 policy, blocked | Export → JSON → re-execute and replay: D1 policy, blocked | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 74d0fd2d2af53f48 | 5 |
| export-D8 policy, open | Export → JSON → re-execute and replay: D8 policy, open | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 7f3d3b9440884221 | 7 |
| export-D8 policy, blocked | Export → JSON → re-execute and replay: D8 policy, blocked | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 7f3d3b9440884221 | 8 |
| export-D confirmed-route, open | Export → JSON → re-execute and replay: D confirmed-route, open | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 74d0fd2d2af53f48 | 3 |
| export-D confirmed-route, blocked | Export → JSON → re-execute and replay: D confirmed-route, blocked | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 74d0fd2d2af53f48 | 8 |
| export-E response | Export → JSON → re-execute and replay: E response | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 5c5c4eab6f7cddf2 | 5 |
| export-E baseline | Export → JSON → re-execute and replay: E baseline | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 5c5c4eab6f7cddf2 | 3 |
| export-E fan only | Export → JSON → re-execute and replay: E fan only | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | 5c5c4eab6f7cddf2 | 8 |
| export-A + Lower Refuge place at 20 | Export → JSON → re-execute and replay: A + Lower Refuge place at 20 | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | af393ff4a2fe6607 | 5 |
| export-D + 4 batteries at G by 14, open | Export → JSON → re-execute and replay: D + 4 batteries at G by 14, open | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | e808f29d312bb37e | 9 |
| export-D + 4 batteries at G by 14, blocked | Export → JSON → re-execute and replay: D + 4 batteries at G by 14, blocked | input hash, events, arrivals and consumption reconcile | input hash: ok; re-executed event history: ok; re-executed arrivals: ok; event-history arrivals reconcile with saved result: ok; event-history consumption reconciles: ok; independent replay matches re-execution boundary by boundary: ok | **passed** | — | e808f29d312bb37e | 10 |
| replay-command | Documented replay command reconciles exported runs (npm run replay -- <file>) | exit 0, all reconciled | OK   evidence/runs/A-response.json: response — arrived 24/24 (saved 24) \| OK   evidence/runs/D1-policy-blocked.json: response — arrived 20/24 (saved 20), branch blocked, observations 10:blocked \| OK   evidence/runs/E-response.json: response — arrived 20/24 (saved 20) | **passed** | — | — | 0 |

## agreement

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| agree-A response | Agreement gate: A response | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived A,B,C; consumed 4) | **passed** | — | 872501e9f46075a8 | 56 |
| agree-A baseline | Agreement gate: A baseline | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived C; consumed 0) | **passed** | — | 872501e9f46075a8 | 34 |
| agree-B response | Agreement gate: B response | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived A,B,C; consumed 4) | **passed** | — | b4331e630766b360 | 34 |
| agree-B baseline | Agreement gate: B baseline | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived C; consumed 0) | **passed** | — | b4331e630766b360 | 19 |
| agree-C response | Agreement gate: C response | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived A,B,C; consumed 0) | **passed** | — | a32c586a6fa88537 | 31 |
| agree-C baseline | Agreement gate: C baseline | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 0) | **passed** | — | a32c586a6fa88537 | 24 |
| agree-A fan only | Agreement gate: A fan only | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 4) | **passed** | — | 872501e9f46075a8 | 25 |
| agree-A gate+escort | Agreement gate: A gate+escort | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived A,C; consumed 0) | **passed** | — | 872501e9f46075a8 | 27 |
| agree-D1 policy, open | Agreement gate: D1 policy, open | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived A,B,C; consumed 4; branch open) | **passed** | — | 74d0fd2d2af53f48 | 46 |
| agree-D1 policy, blocked | Agreement gate: D1 policy, blocked | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 4; branch blocked) | **passed** | — | 74d0fd2d2af53f48 | 28 |
| agree-D8 policy, open | Agreement gate: D8 policy, open | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 4) | **passed** | — | 7f3d3b9440884221 | 25 |
| agree-D8 policy, blocked | Agreement gate: D8 policy, blocked | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 4) | **passed** | — | 7f3d3b9440884221 | 21 |
| agree-D confirmed-route, open | Agreement gate: D confirmed-route, open | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 4) | **passed** | — | 74d0fd2d2af53f48 | 21 |
| agree-D confirmed-route, blocked | Agreement gate: D confirmed-route, blocked | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 4) | **passed** | — | 74d0fd2d2af53f48 | 20 |
| agree-E response | Agreement gate: E response | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 6) | **passed** | — | 5c5c4eab6f7cddf2 | 23 |
| agree-E baseline | Agreement gate: E baseline | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived C; consumed 0) | **passed** | — | 5c5c4eab6f7cddf2 | 19 |
| agree-E fan only | Agreement gate: E fan only | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived B,C; consumed 4) | **passed** | — | 5c5c4eab6f7cddf2 | 20 |
| agree-A + Lower Refuge place at 20 | Agreement gate: A + Lower Refuge place at 20 | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived A,B,C; consumed 4) | **passed** | — | af393ff4a2fe6607 | 30 |
| agree-D + 4 batteries at G by 14, open | Agreement gate: D + 4 batteries at G by 14, open | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived A,B,C; consumed 8) | **passed** | — | e808f29d312bb37e | 32 |
| agree-D + 4 batteries at G by 14, blocked | Agreement gate: D + 4 batteries at G by 14, blocked | forecast = validator = live (invariants) = replay = every checkpoint resumption | all five views agree (21 boundaries, 22 checkpoints, 21 invariant checks, 0 violations; arrived A,B,C; consumed 8) | **passed** | — | e808f29d312bb37e | 35 |
| invariants-summary | Execution invariants over every agreement run | 0 violations | 420 boundaries checked, 0 violations | **passed** | — | — | 0 |

## requests

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| req-D-blocked | Resource request: D-blocked | 4 batteries to G by 14; 15 too late | Deliver 4 batteries to Gate B work point (G) by minute 14 to evacuate Deep Homes A (4 residents, including the wheelchair user) with escort. Delivery at 15 is too late. If it arrives by minute 7, nobody waits for it (time that avoids waiting); the deadline 14 relies on safe waiting. [deadline validated true; next minute/never fails true] (54 planner runs, 130 ms) | **passed** | — | — | 163 |
| req-A-L11 | Resource request: A-L11 | 1 place at L by 20 (horizon); never-arrives fails; avoids waiting by 13 | Confirm 1 more place at Lower Refuge, available by minute 20, so Deep Homes A (4 residents, including the wheelchair user) can be admitted and all 24 residents arrive. If it arrives by minute 13, nobody waits for it (time that avoids waiting); the deadline 20 relies on safe waiting. [deadline validated true; next minute/never fails true] (27 planner runs, 114 ms) | **passed** | — | — | 120 |
| req-B-instr | Resource request: B-instr | instructions to RB by minute 1 | Deliver departure instructions to Pump Quarter B (RB) by minute 1 so Pump Quarter B (8 residents) can reach Lower Refuge by minute 20. [deadline validated true; next minute/never fails true] (23 planner runs, 56 ms) | **passed** | — | — | 59 |
| req-A-bat3 | Resource request: A-bat3 | 1 battery at F by 3 | Deliver 1 battery to Fan 3 workshop (F) by minute 3 to serve Pump Quarter B (8 residents). Delivery at 4 is too late. If it arrives by minute 0, nobody waits for it (time that avoids waiting); the deadline 3 relies on safe waiting. [deadline validated true; next minute/never fails true] (38 planner runs, 74 ms) | **passed** | — | — | 75 |
| req-E | Resource request: E | no tested change; A still needs an accessible route | No tested resource change (up to 4 batteries at a work location, up to 4 shelter places, earlier instructions) gives Deep Homes A a feasible journey. Binding constraint: No step-free route to a suitable shelter: RA-G blocked; no available action opens it; RA-X3 blocked; no available action opens it. Temporary ventilation keeps RA below threshold to minute 20; Deep Homes A still needs an accessible route. (8 planner runs, 21 ms) | **passed** | — | — | 23 |
| req-A-noaccess | Resource request: A-noaccess | no tested change; binding: unsuitable shelter | No tested resource change (up to 4 batteries at a work location, up to 4 shelter places, earlier instructions) gives Deep Homes A a feasible journey. Binding constraint: No suitable shelter: Lower Refuge has places but no confirmed accessible entry; Upper Refuge has places but no confirmed assistance on arrival. (4 planner runs, 9 ms) | **passed** | — | — | 11 |

## future-commitments

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| future-D-batteries | D: record 4 batteries at G by 14 as a confirmed expected delivery; plan, validate, approve, execute agree; 15 is rejected and pauses playback | all four accept; 24 arrive; late delivery rejected by validator and pauses at gate start | approve true; arrivals open/blocked 24/24; late plan: [open] Open Gate B: starts at 14 but delivery req-G arrives at 15 (pending batteries cannot satisfy a work start); playback: Cannot start Open Gate B: batteries from delivery req-G are still pending at G. Crew holds at G; dependent tasks wait. Stop and report the missing delivery. | **passed** | — | — | 43 |
| future-A-place | A (11 places): record 1 place at Lower Refuge at 20; plan/validate/approve/execute agree (24 arrive); a place that never arrives leaves A unserved in planning and pauses playback at admission | 24 arrive; never-arrives: planning 20, playback pauses at 20 | approve true; executed 24 (planner timing: A 10→13, B 10→20, C 0→3); never-arrives planning 20 (BC); playback: Admission of B at L blocked: places not available (delivery req-L still pending). Residents held at the entrance; stop and report. | **passed** | — | — | 28 |
| future-A-place-reference | Spec reference timing for the Lower Refuge place: A waits with the crew at P 12–19, P→L 19–20, admitted at 20 — validated and executed to 24 | valid; 24 arrive; A admitted at 20 | validator valid; executed 24; A admitted at 20; the planner itself prefers B departing at 10 (crew busy 13 vs 20, criterion 4) | **passed** | — | — | 16 |
| future-B-instr | B: instructions confirmed for minute 1 → plan/validate/approve/execute 24; minute 2 makes the same plan invalid | 24 arrive; late instructions rejected | approve true; executed 24; with instructions at 2: group B: departs at 1 before instructions are available at 2 | **passed** | — | — | 7 |

Limitations:
- future-A-place-reference: Hand-constructed schedule from the specification, checked by the same validator and simulator; not the planner’s selected timing.

## seeded-variations

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| seeded-variations | 15 seeded perturbations of A–C (seed 4242) | >= 12 cases; every schedule independently valid and at least the seeded baseline | #0 A battery shortage: batteries 2 → 16 (baseline 12, valid, exhaustive, 2 ms); #1 B lower shelter capacity: L places 11 → 20 (baseline 12, valid, exhaustive, 5 ms); #2 C longer repair: fan repair 7 min → 24 (baseline 20, valid, exhaustive, 4 ms); #3 A slower connection: U-X2 3 min → 24 (baseline 12, valid, exhaustive, 4 ms); #4 B later instructions: A instructions at 2 → 24 (baseline 12, valid, exhaustive, 4 ms); #5 C faster hazard: RA growth 8.9 → 24 (baseline 20, valid, exhaustive, 10 ms); #6 A battery shortage: batteries 2 → 16 (baseline 12, valid, exhaustive, 5 ms); #7 B lower shelter capacity: U places 10 → 12 (baseline 0, valid, exhaustive, 12 ms); #8 C longer repair: fan repair 8 min → 24 (baseline 20, valid, exhaustive, 9 ms); #9 A slower connection: RB-J2 6 min → 24 (baseline 12, valid, exhaustive, 8 ms); #10 B later instructions: C instructions at 1 → 24 (baseline 12, valid, exhaustive, 6 ms); #11 C faster hazard: J3 growth 0 → 24 (baseline 20, valid, exhaustive, 7 ms); #12 A battery shortage: batteries 3 → 16 (baseline 12, valid, exhaustive, 4 ms); #13 B lower shelter capacity: L places 8 → 20 (baseline 12, valid, exhaustive, 7 ms); #14 C longer repair: fan repair 8 min → 24 (baseline 20, valid, exhaustive, 8 ms) | **passed** | — | — | 128 |

Limitations:
- seeded-variations: Validity is established for these instances; optimality only where the all-residents bound is met.

## benchmarks

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| benchmarks | Search-time benchmarks on this machine (median of 3) | recorded | A: median 6.9 ms (8 plans, exhaustive); B: median 2.5 ms (7 plans, exhaustive); C: median 5.5 ms (8 plans, exhaustive); D: median 20.3 ms (80 plans, exhaustive); E: median 2.0 ms (5 plans, exhaustive) | **passed** | — | — | 0 |

Limitations:
- benchmarks: Times depend on the machine; budget 20,000 plans / 8 s per search.

## build

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| build | Production build (tsc + vite single-file) | build succeeds | dist/index.html 525 KiB | **passed** | — | — | 8355 |

## offline

| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |
|---|---|---|---|---|---|---|---:|
| offline-browser | Network-disabled browser run (reload, checkpoint restore, full workflow, map scene) | no network requests; A forecast then simulation result vs baseline; map scene controls (time bar, selection card, zoom/pan/reset, layer toggle); reload restores paused; edit during a run explains a new run; stale plan blocked; missing confirmation blocks approval; D both outcomes and both hidden states; E protection separate from arrivals; mobile order | offline (DevTools offline + all non-file requests refused: 0 attempted); A forecast 24 → simulation result 24 vs 12; scene controls (time bar, selection, zoom/pan, layers); reload restored paused; edit during a run starts a new run; stale plan blocked; missing confirmation blocked approval; D 20/24 by hidden state with both outcomes shown; E protection shown separately (20 arrived, 4 protected); mobile order | **passed** | — | — | 33753 |

## Agreement gate detail

Boundaries checked by the live invariant checker across agreement runs: **420**; violations: **0**.

| Run | Forecast | Validator | Live (invariants) | Replay | Checkpoints | Result |
|---|---|---|---|---|---|---|
| A response | agree | agree | ok | agree | agree | passed |
| A baseline | agree | agree | ok | agree | agree | passed |
| B response | agree | agree | ok | agree | agree | passed |
| B baseline | agree | agree | ok | agree | agree | passed |
| C response | agree | agree | ok | agree | agree | passed |
| C baseline | agree | agree | ok | agree | agree | passed |
| A fan only | agree | agree | ok | agree | agree | passed |
| A gate+escort | agree | agree | ok | agree | agree | passed |
| D1 policy, open | agree | agree | ok | agree | agree | passed |
| D1 policy, blocked | agree | agree | ok | agree | agree | passed |
| D8 policy, open | agree | agree | ok | agree | agree | passed |
| D8 policy, blocked | agree | agree | ok | agree | agree | passed |
| D confirmed-route, open | agree | agree | ok | agree | agree | passed |
| D confirmed-route, blocked | agree | agree | ok | agree | agree | passed |
| E response | agree | agree | ok | agree | agree | passed |
| E baseline | agree | agree | ok | agree | agree | passed |
| E fan only | agree | agree | ok | agree | agree | passed |
| A + Lower Refuge place at 20 | agree | agree | ok | agree | agree | passed |
| D + 4 batteries at G by 14, open | agree | agree | ok | agree | agree | passed |
| D + 4 batteries at G by 14, blocked | agree | agree | ok | agree | agree | passed |

## Generated tiny-case batch

Seed **20871120** (reproduce: `npm run batch -- 20871120`). Bounds: locations 4–7; groups 1–2 (1–5 residents); shelters 1–2 (1–8 places); interventions at most 2 (open, repair, ventilate) plus one inspection in two-state cases; horizon 6–8 minutes; durations 1–3 minutes; hazards initial 0–40, growth 0–25 per minute; batteries 0–4; costs 0–3; capacities corridor and location capacities 99 (not varied; covered by dedicated corridor tests); deliveries none.

Cases: 81; inspection-helps: **8**; inspection-wastes-time: **30**; agreement: 81/81.

| Seed | Kind | Inspection | Production objective | Oracle objective | Agree | Valid | Prod ms | Oracle ms |
|---|---|---|---|---|---|---|---:|---:|
| 749050031 | confirmed | — | `{"served":3,"protectedPM":28,"maxExposure":0,"busy":3,"batteries":2,"finalArrival":5}` | `{"served":3,"protectedPM":28,"maxExposure":0,"busy":3,"batteries":2,"finalArrival":5}` | yes | yes | 1 | 12 |
| 481995706 | confirmed | — | `{"served":3,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":5}` | `{"served":3,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":5}` | yes | yes | 1 | 6 |
| 482725029 | confirmed | — | `{"served":0,"protectedPM":12,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":12,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 0 | 0 |
| 926206033 | confirmed | — | `{"served":1,"protectedPM":0,"maxExposure":19,"busy":3,"batteries":0,"finalArrival":3}` | `{"served":1,"protectedPM":0,"maxExposure":19,"busy":3,"batteries":0,"finalArrival":3}` | yes | yes | 0 | 4 |
| 186450375 | confirmed | — | `{"served":0,"protectedPM":30,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":30,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 1 | 0 |
| 659340993 | confirmed | — | `{"served":0,"protectedPM":14,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":14,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 5 | 0 |
| 824474020 | confirmed | — | `{"served":4,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":4}` | `{"served":4,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":4}` | yes | yes | 1 | 32 |
| 158356474 | confirmed | — | `{"served":0,"protectedPM":36,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":36,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 5 | 10 |
| 729238048 | confirmed | — | `{"served":2,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":4}` | `{"served":2,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":4}` | yes | yes | 0 | 7 |
| 561354832 | confirmed | — | `{"served":0,"protectedPM":24,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":24,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 1 | 10 |
| 975338045 | confirmed | — | `{"served":6,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":7}` | `{"served":6,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":7}` | yes | yes | 1 | 14 |
| 887205418 | confirmed | — | `{"served":4,"protectedPM":12,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | `{"served":4,"protectedPM":12,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | yes | yes | 1 | 5 |
| 344928262 | confirmed | — | `{"served":0,"protectedPM":24,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":24,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 0 | 1 |
| 522720605 | confirmed | — | `{"served":5,"protectedPM":0,"maxExposure":45,"busy":0,"batteries":0,"finalArrival":7}` | `{"served":5,"protectedPM":0,"maxExposure":45,"busy":0,"batteries":0,"finalArrival":7}` | yes | yes | 2 | 7 |
| 85870514 | confirmed | — | `{"served":5,"protectedPM":21,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | `{"served":5,"protectedPM":21,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | yes | yes | 25 | 5 |
| 797031675 | confirmed | — | `{"served":5,"protectedPM":7,"maxExposure":18,"busy":0,"batteries":0,"finalArrival":4}` | `{"served":5,"protectedPM":7,"maxExposure":18,"busy":0,"batteries":0,"finalArrival":4}` | yes | yes | 1 | 0 |
| 344253567 | confirmed | — | `{"served":4,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":3}` | `{"served":4,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":3}` | yes | yes | 0 | 2 |
| 53622481 | confirmed | — | `{"served":0,"protectedPM":28,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":28,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 0 | 1 |
| 934375415 | confirmed | — | `{"served":2,"protectedPM":0,"maxExposure":7,"busy":5,"batteries":0,"finalArrival":5}` | `{"served":2,"protectedPM":0,"maxExposure":7,"busy":5,"batteries":0,"finalArrival":5}` | yes | yes | 0 | 0 |
| 829009958 | confirmed | — | `{"served":2,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | `{"served":2,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | yes | yes | 1 | 0 |
| 835354341 | confirmed | — | `{"served":4,"protectedPM":28,"maxExposure":8,"busy":0,"batteries":0,"finalArrival":4}` | `{"served":4,"protectedPM":28,"maxExposure":8,"busy":0,"batteries":0,"finalArrival":4}` | yes | yes | 0 | 4 |
| 790706532 | confirmed | — | `{"served":1,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":2}` | `{"served":1,"protectedPM":0,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":2}` | yes | yes | 0 | 2 |
| 785787163 | confirmed | — | `{"served":0,"protectedPM":18,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":18,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 1 | 0 |
| 462707640 | confirmed | — | `{"served":5,"protectedPM":24,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | `{"served":5,"protectedPM":24,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | yes | yes | 1 | 1 |
| 511662856 | confirmed | — | `{"served":0,"protectedPM":40,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":40,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 0 | 0 |
| 550013916 | confirmed | — | `{"served":0,"protectedPM":21,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":21,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 1 | 3 |
| 523175912 | confirmed | — | `{"served":1,"protectedPM":18,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":2}` | `{"served":1,"protectedPM":18,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":2}` | yes | yes | 0 | 1 |
| 882779009 | confirmed | — | `{"served":5,"protectedPM":18,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":2}` | `{"served":5,"protectedPM":18,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":2}` | yes | yes | 0 | 4 |
| 233267308 | confirmed | — | `{"served":6,"protectedPM":0,"maxExposure":9,"busy":4,"batteries":0,"finalArrival":5}` | `{"served":6,"protectedPM":0,"maxExposure":9,"busy":4,"batteries":0,"finalArrival":5}` | yes | yes | 1 | 2 |
| 437516889 | confirmed | — | `{"served":0,"protectedPM":28,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":28,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 0 | 0 |
| 762255314 | confirmed | — | `{"served":0,"protectedPM":75,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":75,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 0 | 0 |
| 92417094 | confirmed | — | `{"served":4,"protectedPM":0,"maxExposure":60,"busy":7,"batteries":0,"finalArrival":7}` | `{"served":4,"protectedPM":0,"maxExposure":60,"busy":7,"batteries":0,"finalArrival":7}` | yes | yes | 1 | 2 |
| 210093253 | confirmed | — | `{"served":0,"protectedPM":35,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":35,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 1 | 1 |
| 852372383 | confirmed | — | `{"served":0,"protectedPM":32,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":32,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 0 | 1 |
| 809319430 | confirmed | — | `{"served":5,"protectedPM":0,"maxExposure":16,"busy":3,"batteries":0,"finalArrival":3}` | `{"served":5,"protectedPM":0,"maxExposure":16,"busy":3,"batteries":0,"finalArrival":3}` | yes | yes | 0 | 1 |
| 975148944 | confirmed | — | `{"served":0,"protectedPM":7,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":7,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 0 | 0 |
| 117418179 | confirmed | — | `{"served":4,"protectedPM":21,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":4}` | `{"served":4,"protectedPM":21,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":4}` | yes | yes | 1 | 15 |
| 706019128 | confirmed | — | `{"served":2,"protectedPM":24,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | `{"served":2,"protectedPM":24,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":1}` | yes | yes | 0 | 0 |
| 200464925 | confirmed | — | `{"served":7,"protectedPM":0,"maxExposure":16,"busy":7,"batteries":0,"finalArrival":7}` | `{"served":7,"protectedPM":0,"maxExposure":16,"busy":7,"batteries":0,"finalArrival":7}` | yes | yes | 1 | 0 |
| 98367384 | confirmed | — | `{"served":0,"protectedPM":42,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | `{"served":0,"protectedPM":42,"maxExposure":0,"busy":0,"batteries":0,"finalArrival":0}` | yes | yes | 6 | 2 |
| 417989857 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 4 | 2 |
| 279797956 | two-state | inspection-wastes-time | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":0,"protSum":0,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":2}` | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":0,"protSum":0,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":2}` | yes | yes | 1 | 4 |
| 235922257 | two-state | inspection-helps | `{"nOpen":3,"nBlocked":2,"min":2,"sum":5,"protMin":null,"protSum":null,"worstExposure":84,"busyMax":6,"busySum":7,"batMax":0,"batSum":0,"latestArrival":6}` | `{"nOpen":3,"nBlocked":2,"min":2,"sum":5,"protMin":null,"protSum":null,"worstExposure":84,"busyMax":6,"busySum":7,"batMax":0,"batSum":0,"latestArrival":6}` | yes | yes | 1 | 5 |
| 84185699 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":24,"protSum":48,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":24,"protSum":48,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 0 | 1 |
| 467523101 | two-state | inspection-helps | `{"nOpen":5,"nBlocked":0,"min":0,"sum":5,"protMin":null,"protSum":null,"worstExposure":74,"busyMax":7,"busySum":9,"batMax":0,"batSum":0,"latestArrival":7}` | `{"nOpen":5,"nBlocked":0,"min":0,"sum":5,"protMin":null,"protSum":null,"worstExposure":74,"busyMax":7,"busySum":9,"batMax":0,"batSum":0,"latestArrival":7}` | yes | yes | 1 | 0 |
| 676059864 | two-state | inspection-wastes-time | `{"nOpen":2,"nBlocked":2,"min":2,"sum":4,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":1}` | `{"nOpen":2,"nBlocked":2,"min":2,"sum":4,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":1}` | yes | yes | 1 | 3 |
| 465664411 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 1 |
| 930828753 | two-state | inspection-helps | `{"nOpen":1,"nBlocked":0,"min":0,"sum":1,"protMin":null,"protSum":null,"worstExposure":22,"busyMax":2,"busySum":4,"batMax":0,"batSum":0,"latestArrival":6}` | `{"nOpen":1,"nBlocked":0,"min":0,"sum":1,"protMin":null,"protSum":null,"worstExposure":22,"busyMax":2,"busySum":4,"batMax":0,"batSum":0,"latestArrival":6}` | yes | yes | 1 | 195 |
| 276593789 | two-state | inspection-helps | `{"nOpen":2,"nBlocked":0,"min":0,"sum":2,"protMin":null,"protSum":null,"worstExposure":30,"busyMax":3,"busySum":6,"batMax":0,"batSum":0,"latestArrival":6}` | `{"nOpen":2,"nBlocked":0,"min":0,"sum":2,"protMin":null,"protSum":null,"worstExposure":30,"busyMax":3,"busySum":6,"batMax":0,"batSum":0,"latestArrival":6}` | yes | yes | 1 | 3 |
| 781754046 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":35,"protSum":70,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":35,"protSum":70,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 5 |
| 410941733 | two-state | inspection-wastes-time | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":12,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":2}` | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":12,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":2}` | yes | yes | 2 | 2 |
| 564380948 | two-state | inspection-wastes-time | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":4}` | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":4}` | yes | yes | 1 | 8 |
| 134265780 | two-state | inspection-unreachable | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 1 |
| 803967089 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 1 |
| 417555350 | two-state | inspection-wastes-time | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":null,"protSum":null,"worstExposure":32,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":6}` | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":null,"protSum":null,"worstExposure":32,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":6}` | yes | yes | 1 | 5 |
| 124153010 | two-state | inspection-wastes-time | `{"nOpen":4,"nBlocked":4,"min":4,"sum":8,"protMin":6,"protSum":12,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":3}` | `{"nOpen":4,"nBlocked":4,"min":4,"sum":8,"protMin":6,"protSum":12,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":3}` | yes | yes | 2 | 41 |
| 850144040 | two-state | inspection-wastes-time | `{"nOpen":7,"nBlocked":7,"min":7,"sum":14,"protMin":null,"protSum":null,"worstExposure":37,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":6}` | `{"nOpen":7,"nBlocked":7,"min":7,"sum":14,"protMin":null,"protSum":null,"worstExposure":37,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":6}` | yes | yes | 4 | 2067 |
| 644994448 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 0 | 4 |
| 614131751 | two-state | inspection-helps | `{"nOpen":1,"nBlocked":0,"min":0,"sum":1,"protMin":null,"protSum":null,"worstExposure":12,"busyMax":3,"busySum":5,"batMax":1,"batSum":1,"latestArrival":4}` | `{"nOpen":1,"nBlocked":0,"min":0,"sum":1,"protMin":null,"protSum":null,"worstExposure":12,"busyMax":3,"busySum":5,"batMax":1,"batSum":1,"latestArrival":4}` | yes | yes | 2 | 34 |
| 579154435 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 0 |
| 964129376 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":56,"protSum":112,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":56,"protSum":112,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 4 | 84 |
| 436356654 | two-state | inspection-helps | `{"nOpen":1,"nBlocked":0,"min":0,"sum":1,"protMin":0,"protSum":7,"worstExposure":54,"busyMax":7,"busySum":9,"batMax":0,"batSum":0,"latestArrival":7}` | `{"nOpen":1,"nBlocked":0,"min":0,"sum":1,"protMin":0,"protSum":7,"worstExposure":54,"busyMax":7,"busySum":9,"batMax":0,"batSum":0,"latestArrival":7}` | yes | yes | 2 | 4 |
| 732881975 | two-state | inspection-unreachable | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 1 |
| 703433662 | two-state | inspection-wastes-time | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":205,"busyMax":7,"busySum":14,"batMax":0,"batSum":0,"latestArrival":7}` | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":205,"busyMax":7,"busySum":14,"batMax":0,"batSum":0,"latestArrival":7}` | yes | yes | 1 | 1 |
| 178758055 | two-state | inspection-wastes-time | `{"nOpen":4,"nBlocked":4,"min":4,"sum":8,"protMin":0,"protSum":0,"worstExposure":25,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":3}` | `{"nOpen":4,"nBlocked":4,"min":4,"sum":8,"protMin":0,"protSum":0,"worstExposure":25,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":3}` | yes | yes | 2 | 148 |
| 157042008 | two-state | inspection-wastes-time | `{"nOpen":9,"nBlocked":9,"min":9,"sum":18,"protMin":0,"protSum":0,"worstExposure":12,"busyMax":4,"busySum":8,"batMax":0,"batSum":0,"latestArrival":4}` | `{"nOpen":9,"nBlocked":9,"min":9,"sum":18,"protMin":0,"protSum":0,"worstExposure":12,"busyMax":4,"busySum":8,"batMax":0,"batSum":0,"latestArrival":4}` | yes | yes | 2 | 15 |
| 475590590 | two-state | inspection-wastes-time | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":0,"protSum":0,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":1}` | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":0,"protSum":0,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":1}` | yes | yes | 1 | 107 |
| 252858740 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":21,"protSum":42,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":21,"protSum":42,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 2 | 1 |
| 199791274 | two-state | inspection-wastes-time | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":null,"protSum":null,"worstExposure":30,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":5}` | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":null,"protSum":null,"worstExposure":30,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":5}` | yes | yes | 2 | 23 |
| 847298118 | two-state | inspection-wastes-time | `{"nOpen":2,"nBlocked":2,"min":2,"sum":4,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":4}` | `{"nOpen":2,"nBlocked":2,"min":2,"sum":4,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":4}` | yes | yes | 2 | 7 |
| 935210411 | two-state | inspection-wastes-time | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":21,"protSum":42,"worstExposure":7,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":4}` | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":21,"protSum":42,"worstExposure":7,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":4}` | yes | yes | 2 | 57 |
| 875116420 | two-state | inspection-wastes-time | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":96,"busyMax":5,"busySum":10,"batMax":0,"batSum":0,"latestArrival":5}` | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":96,"busyMax":5,"busySum":10,"batMax":0,"batSum":0,"latestArrival":5}` | yes | yes | 1 | 0 |
| 598718207 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 2 |
| 189939758 | two-state | inspection-helps | `{"nOpen":1,"nBlocked":0,"min":0,"sum":1,"protMin":0,"protSum":6,"worstExposure":36,"busyMax":6,"busySum":7,"batMax":0,"batSum":0,"latestArrival":6}` | `{"nOpen":1,"nBlocked":0,"min":0,"sum":1,"protMin":0,"protSum":6,"worstExposure":36,"busyMax":6,"busySum":7,"batMax":0,"batSum":0,"latestArrival":6}` | yes | yes | 1 | 1 |
| 269006231 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":30,"protSum":60,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":30,"protSum":60,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 1 |
| 515791620 | two-state | inspection-wastes-time | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":4}` | `{"nOpen":3,"nBlocked":3,"min":3,"sum":6,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":4}` | yes | yes | 2 | 6 |
| 886256519 | two-state | inspection-wastes-time | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 0 |
| 779851844 | two-state | inspection-wastes-time | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":30,"protSum":60,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":5}` | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":30,"protSum":60,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":5}` | yes | yes | 3 | 27 |
| 427372855 | two-state | inspection-unreachable | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":0}` | yes | yes | 1 | 1 |
| 988611001 | two-state | inspection-wastes-time | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":1}` | `{"nOpen":1,"nBlocked":1,"min":1,"sum":2,"protMin":null,"protSum":null,"worstExposure":0,"busyMax":0,"busySum":0,"batMax":0,"batSum":0,"latestArrival":1}` | yes | yes | 1 | 1 |
| 393042331 | two-state | inspection-helps | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":24,"protSum":52,"worstExposure":0,"busyMax":5,"busySum":7,"batMax":2,"batSum":2,"latestArrival":0}` | `{"nOpen":0,"nBlocked":0,"min":0,"sum":0,"protMin":24,"protSum":52,"worstExposure":0,"busyMax":5,"busySum":7,"batMax":2,"batSum":2,"latestArrival":0}` | yes | yes | 1 | 1 |

Agreement establishes correctness for these generated instances, not for every possible neighborhood.

## Seeded variations

Seed 4242.

| # | Base | Change | Assigned | Baseline | Valid | Search | ms | Optimality |
|---|---|---|---:|---:|---|---|---:|---|
| 0 | A | battery shortage: batteries 2 | 16 | 12 | yes | exhaustive | 2 | exhaustive within declared scope; not independently enumerated |
| 1 | B | lower shelter capacity: L places 11 | 20 | 12 | yes | exhaustive | 5 | exhaustive within declared scope; not independently enumerated |
| 2 | C | longer repair: fan repair 7 min | 24 | 20 | yes | exhaustive | 4 | criterion 1 optimal by bound (all residents) |
| 3 | A | slower connection: U-X2 3 min | 24 | 12 | yes | exhaustive | 4 | criterion 1 optimal by bound (all residents) |
| 4 | B | later instructions: A instructions at 2 | 24 | 12 | yes | exhaustive | 4 | criterion 1 optimal by bound (all residents) |
| 5 | C | faster hazard: RA growth 8.9 | 24 | 20 | yes | exhaustive | 10 | criterion 1 optimal by bound (all residents) |
| 6 | A | battery shortage: batteries 2 | 16 | 12 | yes | exhaustive | 5 | exhaustive within declared scope; not independently enumerated |
| 7 | B | lower shelter capacity: U places 10 | 12 | 0 | yes | exhaustive | 12 | exhaustive within declared scope; not independently enumerated |
| 8 | C | longer repair: fan repair 8 min | 24 | 20 | yes | exhaustive | 9 | criterion 1 optimal by bound (all residents) |
| 9 | A | slower connection: RB-J2 6 min | 24 | 12 | yes | exhaustive | 8 | criterion 1 optimal by bound (all residents) |
| 10 | B | later instructions: C instructions at 1 | 24 | 12 | yes | exhaustive | 6 | criterion 1 optimal by bound (all residents) |
| 11 | C | faster hazard: J3 growth 0 | 24 | 20 | yes | exhaustive | 7 | criterion 1 optimal by bound (all residents) |
| 12 | A | battery shortage: batteries 3 | 16 | 12 | yes | exhaustive | 4 | exhaustive within declared scope; not independently enumerated |
| 13 | B | lower shelter capacity: L places 8 | 20 | 12 | yes | exhaustive | 7 | exhaustive within declared scope; not independently enumerated |
| 14 | C | longer repair: fan repair 8 min | 24 | 20 | yes | exhaustive | 8 | criterion 1 optimal by bound (all residents) |

## Stress (selected plan, propagated, revalidated)

Modeled route feasibility for the eight declared variants; not simulated arrivals, not a failure probability.

### A

| Variant | Feasible groups | Residents | Failed constraints |
|---|---|---:|---|
| +0min x1.0 | ABC | 24 | — |
| +0min x1.2 | ABC | 24 | — |
| +1min x1.0 | ABC | 24 | — |
| +1min x1.2 | ABC | 24 | — |
| +3min x1.0 | ABC | 24 | — |
| +3min x1.2 | C | 12 | A: group A: home RA unsafe at minute 12 before departure; B: group B: reaches J3 at 9 with hazard 108 (must be < 100) |
| +4min x1.0 | C | 12 | A: group A: home RA unsafe at minute 14 before departure; B: group B: reaches J3 at 9 with hazard 100 (must be < 100) |
| +4min x1.2 | C | 12 | A: group A: home RA unsafe at minute 12 before departure; B: group B: reaches J3 at 9 with hazard 118 (must be < 100) |

### B

| Variant | Feasible groups | Residents | Failed constraints |
|---|---|---:|---|
| +0min x1.0 | ABC | 24 | — |
| +0min x1.2 | AC | 16 | B: group B: reaches J3 at 18 with hazard 114 (must be < 100) |
| +1min x1.0 | AC | 16 | B: group B: reaches J3 at 18 with hazard 100 (must be < 100) |
| +1min x1.2 | AC | 16 | B: group B: reaches J3 at 18 with hazard 118 (must be < 100) |
| +3min x1.0 | AC | 16 | B: group B: reaches J3 at 18 with hazard 100 (must be < 100) |
| +3min x1.2 | AC | 16 | B: group B: reaches J3 at 18 with hazard 118 (must be < 100) |
| +4min x1.0 | C | 12 | B: group B: reaches J3 at 18 with hazard 100 (must be < 100); A: crew work repair-fan-3: ends after the horizon |
| +4min x1.2 | C | 12 | B: group B: reaches J3 at 18 with hazard 118 (must be < 100); A: crew work repair-fan-3: ends after the horizon |

### C

| Variant | Feasible groups | Residents | Failed constraints |
|---|---|---:|---|
| +0min x1.0 | ABC | 24 | — |
| +0min x1.2 | ABC | 24 | — |
| +1min x1.0 | ABC | 24 | — |
| +1min x1.2 | ABC | 24 | — |
| +3min x1.0 | ABC | 24 | — |
| +3min x1.2 | ABC | 24 | — |
| +4min x1.0 | ABC | 24 | — |
| +4min x1.2 | ABC | 24 | — |

Recompute under +1min x1.0 for B: 20 residents (repair-fan-3), exhaustive.

D policies executed: d1: open 24, blocked 20; d7: open 24 (A at 20), blocked 20; d8: open 20, blocked 20.

## Checks that are not part of the one-command run

### Interface walkthroughs (full evacuation and an edited run)

Status: **observed by an automated headless-browser script, not by a person.** `scripts/offline-check.ts` (the `offline-browser` check above) drives the real built interface in Chrome with DevTools offline mode on and every non-`file:` request refused. It checks each of the following:

- A: forecast 24, then a simulation result of 24 against 12 without crew intervention, with **Pause** dominant during playback
- no location codes on the main screen
- the map scene: the time bar reads "Simulation result" at minute 20 with planned-event markers; selecting the crew opens a details card that uses place names only and closes with Escape; the zoom button, arrow-key pan and the 0 key change and restore the view; the routes layer toggle hides and restores the route lines
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

1. Print the dispatch for A (**More → Print dispatch** after approving A) and for D (policy, both branches).
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
