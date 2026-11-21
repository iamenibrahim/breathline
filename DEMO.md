# Breathline: three-minute demonstration script

Setup before judging: `npm run build`, open `dist/index.html` full screen (works with the network off). In **Demo & testing**, press **Reset this session** and set Speed to *fast* in the time bar; switch scenarios and hidden conditions there, then return to **Operations**. Select the crew or a group on the map at any point to show its details card; **0** resets the map view. Every number below comes from a recorded run. If a number shown live differs, say what is on screen.

> **Opening line:** "A shelter helps only if people can reach it. Breathline helps one underground neighborhood decide what to repair, whom to escort, and when checking an uncertain passage is worth the delay."

| Time | Do | Say (what the scene shows) |
|---|---|---|
| 0:00–0:20 | Scenario **A**. Point at the roster and the map. | 24 residents, two shelters, one crew. Deep Homes A includes a wheelchair user who needs a step-free route, an escort and assistance on arrival. Gate B blocks that route. Pump Quarter B's only route runs through the vent corridor, which is deteriorating. |
| 0:20–0:45 | **Find a plan.** Point at the three Forecast counters and the roster. | The no-intervention baseline uses the same start and the same rules: only Upper Homes C (12) can arrive. A has no step-free route and B would reach the vent corridor at minute 9 with hazard 100. |
| 0:45–1:20 | Read the headline and the three-step checklist. **Approve plan**, **Run simulation**; use **Pause** at 5 (repair done), 9 (gate opens), 13 (A admitted). Then **View results**. | "Repair Fan 3 first so Pump Quarter B can pass the corridor at minute 9 (68 instead of 100); then open Gate B and escort the four Deep Homes residents." The crew really travels, works and walks with A. Result: **24/24 arrived vs 12**, +12, executed. |
| 1:20–2:00 | Demo & testing → scenario **D**, hidden bypass state chosen by a judge. Operations → **Find a plan** (note both outcomes and "Waiting for inspection"), **Approve plan**, **Run simulation**. | Gate B and Fan 3 each need the whole battery pack. The policy is to repair, inspect the bypass (1 minute), then escort A if it is open. **20 feasible in both modeled states; up to 4 more if open.** Confirmed routes only would give 20/20. The branch is revealed at minute 10, and the planner never saw the truth. |
| 2:00–2:30 | **Conditions** (top right) → *Inspection minutes* = **8** → Set. Note "Conditions updated" and that the old plan can no longer be approved. **Find a plan.** | Same mechanism, different decision: "Repair Fan 3; leave inspection out of this response." At 8 minutes an escorted arrival would be minute 21. 20 in each state. (At 7 it still reaches A by minute 20.) |
| 2:30–2:45 | Scenario **E**. **Find a plan**, **Approve plan**, **Run simulation**. | Gate B has collapsed and the bypass is blocked, so no tested action gives A an accessible route. The crew repairs the fan first (B and C still arrive, 20) and then installs temporary ventilation at Deep Homes. **Still waiting, conditions improved:** below the threshold until 20 instead of 14, +6 minutes per person, +24 person-minutes, not counted as arrivals. Ventilation first would lose B, so the planner rejects it. |
| 2:45–3:00 | Back to **D** with hidden *blocked*: point at "What would help" under People still needing help. In Demo & testing open **Stress tests** for A or B and the **Evidence** panel. | "Deliver 4 batteries to Gate B by minute 14 to evacuate Group A; delivery at 15 is too late." B's plan fails with a one-minute repair delay (J3 = 100 at minute 18). Every claim maps to a recorded check (`npm run evidence`: all passed). |

**Close:** the residents who actually arrived, and the people whose needs are still unresolved.

## Ready answers

- **Why does fan-first reverse in B?** Deep Homes reaches 110 at minute 9. Fan-first gets the crew to RA at 10. Gate first and escort by 8, then repair finishing at 17, keeps J3 at 97 when B arrives at 18. (Setup panel and stress table.)
- **Why can 4 batteries not serve everyone in D's blocked state?** Gate B needs 4 batteries and Fan 3 needs 4. Serving A needs the gate and B needs the fan, so blocked tops out at 20. (Requests panel shows the 4-battery request.)
- **How does the app avoid knowing the inspection result?** The planner's input is the knowledge snapshot only. The truth object goes to the simulator. The `ref-D-truth-invariance` check shows identical policies for both truths.
- **Why inspect at 1 minute but skip at 8?** Branch feasibility: escorted arrival = 13 + inspection minutes, so 14 at 1 minute and 21 at 8. Inspecting first leaves the fan too late for B. Every order was enumerated, not ruled out.
- **Do simulated arrivals prove lives saved?** No. They demonstrate feasible shelter journeys within the disclosed model.
- **What about people you cannot evacuate?** E: protected minutes, why the fan still comes first, and the request text stating that A still needs an accessible route.
- **Wrong reports, radio failure, laptop shutdown?** Confirmations gate approval; instruction delay is an input; a reload restores paused at the last checkpoint with nothing applied twice. Radio, power, accurate reports and compliance remain dependencies.

Available for questions: B's changed order, C's skipped repair (4 batteries preserved), the 11-place edit (stale → recompute → 20 plus the place request), the unsuitable-shelter edit, an offline reload, and a seeded variation.
