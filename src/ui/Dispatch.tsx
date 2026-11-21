// Printable dispatch sheet: crew sheet and resident instructions (simple print stylesheet).
import type { AnyPlan, CrewActivity, Journey, PassageState, Scenario, Schedule } from '../engine/types';
import { locName, requiredChecklist, CHECK_LABEL } from '../engine/common';
import { dependencies } from '../engine/explain';
import { ASSUMPTIONS } from '../engine/exportRun';
import type { RequestReport } from '../engine/requests';

const route = (legs: { from: string; to: string; conn: string | null; start: number; end: number }[], s: Scenario) =>
  legs.map((l) => (l.conn ? `${l.from}→${l.to} (${l.start}–${l.end})` : `wait at ${locName(s, l.from)} ${l.start}–${l.end}`)).join(', ');

function crewRows(s: Scenario, acts: CrewActivity[], sc: Schedule) {
  const deps = dependencies(s, sc);
  return acts.map((a) => {
    const act = s.actions.find((x) => x.id === a.actionId);
    const g = s.groups.find((x) => x.id === a.groupId);
    let what = '';
    if (a.kind === 'travel') what = `Travel ${route(a.legs, s)}`;
    else if (a.kind === 'wait') what = `Wait at ${locName(s, a.from)} — ${a.reason}`;
    else if (a.kind === 'escort') what = `ESCORT ${g!.name} (${g!.count}${g!.mobility === 'wheelchair' ? ', wheelchair user' : ''}) from ${locName(s, a.from)}: ${route(a.legs, s)}. Stay with the group the whole way; step-free passages only; do not leave before admission at ${locName(s, a.to)}.`;
    else if (a.kind === 'inspect') what = `${act!.label} at ${locName(s, a.from)}. Report the result by radio.`;
    else what = `${act!.label} at ${locName(s, a.from)}${act!.batteries ? ` — uses ${act!.batteries} batteries (${(a.batteries ?? []).map((b) => (b.location === 'pack' ? `${b.qty} from crew pack` : `${b.qty} from delivery ${b.deliveryId} at ${b.location}`)).join(', ')})` : ''}`;
    const d = deps.filter((x) => x.actionId === a.actionId).map((x) => x.text);
    if (act?.kind === 'ventilate') {
      const loc = (act.effect as { location: string }).location;
      for (const w of s.groups.filter((x) => x.location === loc && sc.unresolved.includes(x.id))) d.push(`Protects ${w.name} (${w.count}) while they wait \u2014 below threshold until minute ${sc.protectedMinutes[w.id] >= s.horizon ? s.horizon : sc.protectedMinutes[w.id]}; not an evacuation`);
    }
    return { time: `${a.start}–${a.end}`, what, deps: d };
  });
}

function residentRows(s: Scenario, js: Journey[]) {
  return s.groups.map((g) => {
    const j = js.find((x) => x.groupId === g.id);
    if (!j) return { g, text: 'No feasible journey in this plan. Stay at your location; listen for updates. Your representative should report any change.' };
    const waits = j.legs.filter((l) => !l.conn).map((l) => `wait at ${locName(s, l.from)} until minute ${l.end}`);
    const path = [g.location, ...j.legs.filter((l) => l.conn).map((l) => l.to)].map((x) => locName(s, x)).join(' → ');
    return {
      g, text: `${g.escortRequired ? `Do NOT set out alone. The crew arrives to collect you; leave together at minute ${j.departure}.` : `Leave at minute ${j.departure} (instructions available from minute ${g.instructionsAvailableAt}).`} Route: ${path}${waits.length ? `; ${waits.join('; ')}` : ''}. Go to ${locName(s, j.shelter)} — arrive by minute ${j.arrival}. Do not pass through any other shelter.`,
    };
  });
}

export function DispatchSheet({ s, plan, revision, requests }: { s: Scenario; plan: AnyPlan; revision: number; requests: Partial<Record<string, RequestReport>> | null }) {
  const isPolicy = plan.kind === 'policy' && !!plan.inspection;
  const main: Schedule = plan.kind === 'schedule' ? plan.schedule : plan.branches.open;
  const n = plan.kind === 'policy' && plan.inspection ? plan.inspection.prefixCrewCount : main.crew.length;
  const deliveries = s.deliveries.filter((d) => d.confirmed);
  const shelters = [...new Set((plan.kind === 'schedule' ? [plan.schedule] : [plan.branches.open, plan.branches.blocked]).flatMap((x) => x.journeys.map((j) => j.shelter)))];
  const unresolved = plan.kind === 'schedule' ? plan.schedule.unresolved : [...new Set([...plan.branches.open.unresolved, ...plan.branches.blocked.unresolved])];
  return (
    <div className="dispatch">
      <section className="sheet">
        <h2>Breathline crew dispatch sheet</h2>
        <p className="sim">Simulation — illustrative conditions and assumptions</p>
        <p>{s.title} · plan <code>{plan.id}</code> · input revision {revision} · input hash <code>{plan.inputHash}</code> · search: {plan.search.status}</p>
        <h3>{isPolicy ? 'Shared actions (both possible bypass states)' : 'Crew order of work'}</h3>
        <table><thead><tr><th>Minutes</th><th>Activity</th><th>Residents who depend on it</th></tr></thead><tbody>
          {crewRows(s, main.crew.slice(0, n), main).map((r, i) => <tr key={i}><td>{r.time}</td><td>{r.what}</td><td>{r.deps.join('; ') || '—'}</td></tr>)}
        </tbody></table>
        {isPolicy && plan.kind === 'policy' && (['open', 'blocked'] as PassageState[]).map((st) => (
          <div key={st}>
            <h3>IF THE BYPASS IS {st.toUpperCase()} (observed at minute {plan.inspection!.end})</h3>
            <table><tbody>
              {crewRows(s, plan.branches[st].crew.slice(n), plan.branches[st]).map((r, i) => <tr key={i}><td>{r.time}</td><td>{r.what}</td><td>{r.deps.join('; ') || '—'}</td></tr>)}
              {!plan.branches[st].crew.slice(n).length && <tr><td>—</td><td>Hold position. {st === 'blocked' ? 'Do not cross the blocked bypass. ' : ''}{plan.branches[st].unresolved.map((g) => s.groups.find((x) => x.id === g)!.name).join(', ')} remain unresolved — report.</td><td /></tr>}
            </tbody></table>
          </div>
        ))}
        {isPolicy && <p className="stop">If the inspection result is neither open nor blocked: STOP. Hold position, do not cross, report by radio. Do not improvise a third plan.</p>}
        <h3>Shelter assignments and confirmed suitability</h3>
        <ul>{shelters.map((sh) => { const S = s.shelters.find((x) => x.location === sh)!; const groups = (plan.kind === 'schedule' ? plan.schedule.journeys : plan.branches.open.journeys.concat(plan.branches.blocked.journeys)).filter((j) => j.shelter === sh).map((j) => j.groupId); const need = new Set(groups.flatMap((gid) => requiredChecklist(s.groups.find((g) => g.id === gid)!))); return <li key={sh}>{S.name}: {S.places} places ({S.placesConfirmed ? 'confirmed' : 'UNCONFIRMED'} by {S.steward}); {[...need].map((k) => `${CHECK_LABEL[k]} ${S.checklist[k] === 'present' ? 'confirmed' : S.checklist[k]}`).join(', ')}; for {[...new Set(groups)].join(', ')}</li>; })}</ul>
        {deliveries.length > 0 && <><h3>Confirmed expected deliveries</h3><ul>{deliveries.map((d) => { const users = main.crew.filter((a) => a.batteries?.some((b) => b.deliveryId === d.id)).map((a) => `${s.actions.find((x) => x.id === a.actionId)?.label} at ${a.start}`); return <li key={d.id}>{d.quantity} {d.resource} at {locName(s, d.location)} ({d.location}) by minute {d.minute} — source: {d.source}. Waiting on it: {users.join(', ') || (d.resource === 'places' ? 'admissions at this shelter' : 'none')}. <b>If it has not arrived by minute {d.minute}: stop the dependent task, keep residents where they are, report.</b></li>; })}</ul></>}
        {main.crew.some((a) => s.actions.find((x) => x.id === a.actionId)?.kind === 'ventilate') && <><h3>Fallback protection</h3><p>Temporary ventilation protects residents who cannot be evacuated; it is not an evacuation. Keep reporting their needs.</p></>}
        <h3>Unresolved needs and requests to neighbouring crews</h3>
        <ul>
          {unresolved.map((gid) => <li key={gid}>{s.groups.find((g) => g.id === gid)!.name} — {s.groups.find((g) => g.id === gid)!.context}</li>)}
          {requests && Object.entries(requests).flatMap(([k, r]) => [...(r?.requests ?? []).map((q, i) => <li key={k + i}>{k !== 'confirmed' ? `If ${k}: ` : ''}{q.text}</li>), ...(r?.none ?? []).map((x, i) => <li key={k + 'n' + i}>{x.text}</li>)])}
          {!unresolved.length && <li>None in this plan.</li>}
        </ul>
        <h3>Acknowledgement checklist (relay by radio or messenger)</h3>
        <ul className="checklist-print">
          <li>{'☐'} Crew has read the order of work and the stop rules</li>
          {s.groups.map((g) => <li key={g.id}>{'☐'} {g.name} representative acknowledged departure instructions</li>)}
          {shelters.map((sh) => <li key={sh}>{'☐'} {s.shelters.find((x) => x.location === sh)!.steward} reconfirmed places and checklist</li>)}
          {deliveries.map((d) => <li key={d.id}>{'☐'} {d.source} reconfirmed delivery {d.id}</li>)}
        </ul>
      </section>
      <section className="sheet">
        <h2>Resident instructions</h2>
        <p className="sim">Simulation — illustrative conditions and assumptions</p>
        {(isPolicy && plan.kind === 'policy' ? (['open', 'blocked'] as PassageState[]) : ['plan']).map((st) => {
          const js = st === 'plan' ? main.journeys : (plan as any).branches[st].journeys;
          return (
            <div key={st}>
              {st !== 'plan' && <h3>If the bypass is {st} (crew reports at minute {(plan as any).inspection.end})</h3>}
              <ol>{residentRows(s, js).map(({ g, text }) => <li key={g.id}><b>{g.name}</b> ({g.count}): {text}</li>)}</ol>
            </div>
          );
        })}
        <h3>Assumptions and dependencies</h3>
        <ul>{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      </section>
    </div>
  );
}
