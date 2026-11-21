import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnyPlan, ChecklistState, PassageState, PolicyResult, Scenario, Schedule, ShelterChecklist } from '../engine/types';
import { getScenario, SCENARIO_BUILDERS } from '../engine/scenarios';
import { diagnoseGroup, explainPolicy, explainSchedule, groupLabel, stillWaitingText } from '../engine/explain';
import { confirmationsFor } from '../engine/approval';
import { groupBenefits } from '../engine/benefit';
import { stressSelected, recomputeUnder, STRESS_VARIANTS, type StressRow } from '../engine/stress';
import { buildExport, ASSUMPTIONS, BUILD_ID } from '../engine/exportRun';
import { locName, CHECK_LABEL } from '../engine/common';
import type { SimState } from '../engine/simulate';
import { MapView } from './MapView';
import { DispatchSheet } from './Dispatch';
import {
  activeSchedule, applyEdit, approve, clearSession, compute, computeAllRequests, discardApproval, isPlanStale, loadSession, newSession,
  resetRun, resumeRun, saveSession, stepRun, truthOf, type Session,
} from './session';
import evidenceSummary from '../generated/evidence-summary.json';

const SHORT: Record<string, string> = { A: 'Repair first', B: 'Rescue first', C: 'Preserve resources', D: 'Inspect or not', E: 'Protect the stranded' };
const count = (s: Scenario, ids: string[]) => ids.reduce((n, id) => n + (s.groups.find((g) => g.id === id)?.count ?? 0), 0);
const statusLabel: Record<string, string> = { unresolved: 'Unresolved', conditional: 'Conditional', assigned: 'Assigned', traveling: 'Traveling', arrived: 'Arrived', held: 'Held at entrance' };

export default function App() {
  const [sess, setSess] = useState<Session>(() => loadSession() ?? newSession('A'));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => { try { return localStorage.getItem('breathline.onboarded') !== '1'; } catch { return true; } });
  const [stress, setStress] = useState<{ rows: StressRow[]; recomputed: Record<string, string> } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => { saveSession(sess); }, [sess]);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => setSess((x) => {
      const n = stepRun(x);
      if (!n.run || n.run.main.state.done || n.run.main.state.paused) setPlaying(false);
      return n;
    }), speed);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, speed]);

  const s = sess.scenario;
  const plan = sess.plan;
  const stale = isPlanStale(sess);
  const run = sess.run?.main.state ?? null;
  const t = run ? Math.max(0, run.processedThrough) : 0;
  const schedule = activeSchedule(sess);
  const total = s.groups.reduce((n, g) => n + g.count, 0);

  const doCompute = () => {
    setBusy('Computing response…');
    setStress(null);
    setTimeout(() => {
      setSess((x) => compute(x));
      setBusy('Testing resource requests for stranded groups…');
      setTimeout(() => { setSess((x) => computeAllRequests(x)); setBusy(null); }, 30);
    }, 30);
  };
  const switchScenario = (id: string) => { setPlaying(false); setStress(null); setSess(newSession(id)); };
  const edit = (text: string, f: (s: Scenario) => void) => { setPlaying(false); setStress(null); setSess((x) => applyEdit(x, text, f)); };

  const exportText = () => {
    if (!sess.run || !plan) return '';
    const ex = buildExport(s, sess.run.main.plan, truthOf(sess), sess.run.main.state, sess.revision, { resourceRequests: sess.requests, stress: stress?.rows });
    return JSON.stringify({ ...ex, baselineRun: { events: sess.run.baseline.state.events, observed: sess.run.baseline.state.groups }, comparisonRun: sess.run.comparison ? { label: sess.run.comparison.label, events: sess.run.comparison.state.events } : null, edits: sess.edits }, null, 1);
  };
  const [copied, setCopied] = useState<string | null>(null);
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(exportText()); setCopied('Run JSON copied'); } catch { setCopied('Copy blocked here \u2014 use Export JSON in the local build'); }
    setTimeout(() => setCopied(null), 3000);
  };
  const exportJson = () => {
    if (!sess.run || !plan) return;
    const blob = new Blob([exportText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `breathline-${s.label}-rev${sess.revision}-${sess.run.main.state.runId}.json`;
    a.click();
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Breathline</h1>
          <span className="tag">Community rescue planner · the Hollow, 2087</span>
        </div>
        <div className="banner" role="note">Simulation — illustrative conditions and assumptions</div>
        <nav className="scenarios" aria-label="Reference conditions">
          {Object.keys(SCENARIO_BUILDERS).map((id) => (
            <button key={id} className={id === sess.scenarioId ? 'on' : ''} onClick={() => switchScenario(id)} title={getScenario(id).title}>
              <b>{id}</b> <span>{SHORT[id]}</span>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className={`rev ${stale ? 'stale' : ''}`}>Input revision {sess.revision}</span>
          <button onClick={() => setShowOnboarding((v) => !v)}>How it’s used</button>
          <button onClick={() => window.print()} disabled={!plan}>Print dispatch</button>
          <button onClick={exportJson} disabled={!sess.run}>Export JSON</button>
          <button onClick={copyJson} disabled={!sess.run}>Copy JSON</button>
          {copied && <span className="muted small" role="status">{copied}</span>}
          <button onClick={() => { clearSession(); switchScenario(sess.scenarioId); }}>Reset session</button>
        </div>
      </header>

      {showOnboarding && <Onboarding onClose={() => { setShowOnboarding(false); try { localStorage.setItem('breathline.onboarded', '1'); } catch { /* ignore */ } }} />}

      <div className="scenario-line"><b>{s.label}. {s.title}.</b> {s.summary}</div>
      {sess.notice && <div className="notice" role="status">{sess.notice} {run?.paused && run.pause?.reason.startsWith('Restored') && <button onClick={() => setSess((x) => ({ ...resumeRun(x), notice: null }))}>Resume</button>}</div>}

      <main className="grid">
        <aside className="col left">
          <Roster sess={sess} schedule={schedule} run={run} />
          <Needs sess={sess} schedule={schedule} />
        </aside>

        <section className="col center">
          <MapView s={s} plan={plan} schedule={stale ? null : schedule} approved={!!sess.approved} run={run} t={t} />
          <Legend />
          <ClockBar sess={sess} t={t} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
            step={() => setSess((x) => stepRun(x))} reset={() => { setPlaying(false); setSess((x) => resetRun(x)); }}
            resume={() => setSess((x) => ({ ...resumeRun(x), notice: null }))} />
          <Counters sess={sess} total={total} />
        </section>

        <aside className="col right">
          <Recommendation sess={sess} stale={stale} busy={busy} onCompute={doCompute} t={t} />
          {plan && !stale && <Approval sess={sess} onApprove={() => setSess((x) => approve(x))} onDiscard={() => setSess((x) => discardApproval(x))} />}
        </aside>
      </main>

      <section className="panels">
        <Outcome sess={sess} />
        <Setup sess={sess} edit={edit} locked={!!run && run.processedThrough >= 0} />
        <Reports sess={sess} edit={edit} />
        <Controller sess={sess} setSess={setSess} />
        <Stress sess={sess} stress={stress} setStress={setStress} />
        <Exposure sess={sess} />
        <Events run={run} />
        <Diagnostics sess={sess} />
        <Evidence sess={sess} />
        <Assumptions />
        {plan && !stale && (
          <details className="panel"><summary>Dispatch sheet preview (also printable)</summary><DispatchSheet s={s} plan={plan} revision={sess.revision} requests={sess.requests} /></details>
        )}
      </section>
      {plan && !stale && <div className="print-only"><DispatchSheet s={s} plan={plan} revision={sess.revision} requests={sess.requests} /></div>}
      <footer className="foot">Build {BUILD_ID} · runs entirely on this laptop · no accounts, no network · planner input never includes hidden simulator truth.</footer>
    </div>
  );
}

function Onboarding({ onClose }: { onClose: () => void }) {
  return (
    <section className="onboarding" aria-label="How Breathline is used">
      <ol>
        <li><b>Coordinator</b> runs Breathline on the command-station laptop. Residents need no phones, accounts or connectivity.</li>
        <li><b>Resident representatives</b> report where their group is and what assistance it needs, by existing radio check-ins or messengers.</li>
        <li><b>Shelter stewards</b> confirm remaining places and the suitability checklist (accessible entry, assistance on arrival, ventilation).</li>
        <li><b>Neighbouring crews and stewards</b> confirm any expected delivery (batteries or places): what, how much, where, by when.</li>
        <li>The coordinator approves a response and relays the printed dispatch by radio or messenger; the crew and representatives acknowledge it.</li>
      </ol>
      <p>Directorate restrictions are modeled as physical access constraints; Breathline cannot override them. Radio coverage, power, accurate reports and compliance remain dependencies.</p>
      <button onClick={onClose}>Got it</button>
    </section>
  );
}

function Roster({ sess, schedule, run }: { sess: Session; schedule: Schedule | null; run: SimState | null }) {
  const s = sess.scenario;
  const plan = sess.plan;
  return (
    <section className="card" aria-label="Residents">
      <h2>Who needs assistance</h2>
      <ul className="roster">
        {s.groups.map((g) => {
          const live = run?.groups[g.id];
          const j = schedule?.journeys.find((x) => x.groupId === g.id);
          const cond = plan?.kind === 'policy' && plan.inspection && !plan.commonGroups.includes(g.id) && (plan.branches.open.journeys.some((x) => x.groupId === g.id) !== plan.branches.blocked.journeys.some((x) => x.groupId === g.id));
          const status = live?.status ?? (j ? (cond ? 'conditional' : 'assigned') : plan ? 'unresolved' : 'unresolved');
          const waiting = plan && schedule && !j ? stillWaitingText(s, schedule, sess.baseline?.schedule ?? null, g.id) : null;
          return (
            <li key={g.id} className={`res res-${status}${live?.unsafe ? ' unsafe' : ''}`}>
              <div className="res-head">
                <span className="gid">{g.id}</span>
                <b>{g.name}</b> <span className="cnt">{g.count} residents</span>
                <span className={`chip chip-${status}`}>{statusLabel[status] ?? status}{live?.unsafe ? ' · unsafe' : ''}</span>
              </div>
              <div className="res-body">
                <div>{g.mobility === 'wheelchair' ? '♿ Wheelchair user · step-free route · continuous escort · assistance on arrival' : 'Standard mobility'}</div>
                <div className="muted">At {locName(s, live?.at ?? g.location)}{live?.edge ? ` (moving on ${live.edge.conn})` : ''} · instructions from minute {g.instructionsAvailableAt}{s.instructionsConfirmed[g.id] ? '' : ' (unconfirmed)'}</div>
                {j && <div>{cond ? 'If the bypass is open: ' : ''}{locName(s, j.shelter)} · leave {j.departure} · arrive {j.arrival}{live?.arrivedAt != null ? ` · arrived ${live.arrivedAt}` : ''}</div>}
                {live && <div className="muted">Exposure so far {Math.round(live.exposure)} hazard-index min/person</div>}
                {waiting && <div className="waiting">{waiting}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Needs({ sess, schedule }: { sess: Session; schedule: Schedule | null }) {
  const s = sess.scenario;
  const plan = sess.plan;
  if (!plan || !schedule || isPlanStale(sess)) return null;
  const scheds: [string, Schedule][] = plan.kind === 'schedule' || !plan.inspection ? [['', plan.kind === 'schedule' ? plan.schedule : plan.branches.open]] : [['If blocked: ', plan.branches.blocked], ['If open: ', plan.branches.open]];
  const items = scheds.flatMap(([pre, sc]) => sc.unresolved.map((gid) => ({ pre, sc, g: s.groups.find((x) => x.id === gid)! })));
  if (!items.length) return <section className="card"><h2>Unresolved needs</h2><p className="ok">None in this plan.</p></section>;
  return (
    <section className="card" aria-label="Unresolved needs">
      <h2>Unresolved needs and what could still help</h2>
      {items.map(({ pre, sc, g }, i) => {
        const key = pre.startsWith('If blocked') ? 'blocked' : pre.startsWith('If open') ? 'open' : 'confirmed';
        const rr = sess.requests?.[key as 'confirmed'];
        const req = rr?.requests.filter((q) => q.groupId === g.id) ?? [];
        const none = rr?.none.find((n) => n.groupId === g.id);
        return (
          <div key={i} className="need">
            <div><b>{pre}{groupLabel(g)}</b></div>
            <ul className="blockers">{diagnoseGroup(s, sc, g, plan.search).map((b, k) => <li key={k} className={`b-${b.code}`}>{b.text}{b.scope === 'search' ? ' (no searched response serves this group)' : ''}</li>)}</ul>
            {stillWaitingText(s, sc, sess.baseline?.schedule ?? null, g.id) && <div className="waiting">{stillWaitingText(s, sc, sess.baseline?.schedule ?? null, g.id)}</div>}
            {!rr && <div className="muted">Testing resource requests…</div>}
            {req.map((q, k) => (
              <div key={k} className="request">
                <div className="req-head">Request · validated</div>
                <div>{q.text}</div>
                <div className="muted">What: {q.quantity} {q.resource} · where: {locName(s, q.location)} ({q.location}) · by: {q.latest !== null ? `minute ${q.latest}` : q.windows.map(([a, b]) => `${a}–${b}`).join(', ')} · for: {q.benefits.gained.join(', ')} ({q.benefits.residents} residents){q.benefits.changed.length ? ` · changes ${q.benefits.changed.join(', ')}` : ''}</div>
                <div className="muted">Binding: {q.binding} {q.waitNote}</div>
              </div>
            ))}
            {none && <div className="request none">{none.text}</div>}
          </div>
        );
      })}
      <p className="muted small">Requests are validated hypotheticals for neighbouring crews or stewards. They reserve nothing and are never counted as arrivals.</p>
    </section>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="Map legend">
      <span><i className="lg route-proposed" /> proposed</span><span><i className="lg route-approved" /> approved</span><span><i className="lg route-active" /> moving now</span><span><i className="lg route-completed" /> completed</span>
      <span><i className="lg edge-blocked" /> blocked</span><span><i className="lg edge-unknown" /> unknown</span><span><i className="lg edge-stairs" /> stairs</span>
      <span><i className="dot amber" /> hazard 60–99</span><span><i className="dot red" /> ≥ 100 (unsafe)</span>
    </div>
  );
}

function ClockBar({ sess, t, playing, setPlaying, speed, setSpeed, step, reset, resume }: { sess: Session; t: number; playing: boolean; setPlaying: (b: boolean) => void; speed: number; setSpeed: (n: number) => void; step: () => void; reset: () => void; resume: () => void }) {
  const run = sess.run?.main.state;
  const H = sess.scenario.horizon;
  const started = !!run && run.processedThrough >= 0;
  return (
    <div className="clock" role="group" aria-label="Clock">
      <div className="clock-time"><span className="min">Minute {started ? t : 0}</span><span className="of">/ {H}</span></div>
      <div className="ticks" aria-hidden="true">{Array.from({ length: H + 1 }, (_, i) => <span key={i} className={started && i <= t ? 'on' : ''} />)}</div>
      <div className="clock-btns">
        <button onClick={() => setPlaying(!playing)} disabled={!run || run.done || (run.paused && !run.pause?.reason.startsWith('Restored'))}>{playing ? 'Pause' : 'Play'}</button>
        <button onClick={step} disabled={!run || run.done || run.paused}>Step 1 minute</button>
        <button onClick={reset} disabled={!run}>Reset run</button>
        <label>Speed <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={1200}>slow</option><option value={700}>normal</option><option value={250}>fast</option></select></label>
      </div>
      {run?.paused && <div className={`pause ${run.pause?.reason.startsWith('Restored') ? 'restored' : 'alert'}`} role="alert">{run.pause?.reason} {run.pause?.invariant && <b>Invariant: {run.pause.invariant}; entities {run.pause.entities.join(', ')}; event {run.pause.event}.</b>} {run.pause?.reason.startsWith('Restored') && <button onClick={resume}>Resume</button>}</div>}
      {!run && <div className="muted">{sess.plan ? 'Approve the response to start the clock.' : 'Compute a response to begin.'}</div>}
    </div>
  );
}

function Counters({ sess, total }: { sess: Session; total: number }) {
  const s = sess.scenario;
  const r = sess.run;
  const sum = (st: SimState | undefined, f: (x: string) => boolean) => (st ? s.groups.filter((g) => f(st.groups[g.id].status)).reduce((n, g) => n + g.count, 0) : 0);
  const sched = activeSchedule(sess);
  const plan = sess.plan;
  if (!r) {
    const forecast = plan && sched ? (plan.kind === 'policy' && plan.inspection ? `${plan.objective.nBlocked}–${plan.objective.nOpen}` : String(sched.objective.served)) : '—';
    return (
      <div className="counters">
        <div className="ctr"><span className="n">0</span><span>arrived / {total}</span></div>
        <div className="ctr"><span className="n">{forecast}</span><span>assigned (forecast)</span></div>
        <div className="ctr"><span className="n">{sess.baseline ? sess.baseline.schedule.objective.served : '—'}</span><span>with no intervention (forecast)</span></div>
      </div>
    );
  }
  const m = r.main.state, b = r.baseline.state, c = r.comparison?.state;
  const done = m.done && b.done && (!c || c.done);
  const extra = sum(m, (x) => x === 'arrived') - sum(b, (x) => x === 'arrived');
  const prot = s.groups.filter((g) => m.groups[g.id].status === 'unresolved' && m.groups[g.id].protected > b.groups[g.id].protected).map((g) => ({ g, d: m.groups[g.id].protected - b.groups[g.id].protected }));
  return (
    <div className="counters">
      <div className="ctr big"><span className="n">{sum(m, (x) => x === 'arrived')}</span><span>arrived / {total} (executed)</span></div>
      <div className="ctr"><span className="n">{sum(m, (x) => x === 'assigned' || x === 'traveling' || x === 'held')}</span><span>assigned, not yet arrived</span></div>
      {sum(m, (x) => x === 'conditional') > 0 && <div className="ctr amber"><span className="n">{sum(m, (x) => x === 'conditional')}</span><span>conditional on the observation</span></div>}
      <div className="ctr"><span className="n">{sum(m, (x) => x === 'unresolved')}</span><span>unresolved</span></div>
      <div className="ctr base"><span className="n">{sum(b, (x) => x === 'arrived')}</span><span>arrived with no intervention (same rules, same start)</span></div>
      {c && <div className="ctr base"><span className="n">{sum(c, (x) => x === 'arrived')}</span><span>{r.comparison!.label.toLowerCase()}</span></div>}
      <div className="ctr teal"><span className="n">{done ? `+${extra}` : '…'}</span><span>additional arrivals enabled {done ? '(both runs executed)' : '(after both runs finish)'}</span></div>
      {done && prot.length > 0 && <div className="ctr waiting-ctr"><span className="n">+{prot.reduce((n, x) => n + x.d * x.g.count, 0)}</span><span>Still waiting — conditions improved: protected person-minutes ({prot.map((x) => `${x.g.id}: +${x.d} min × ${x.g.count}`).join(', ')}). Not arrivals.</span></div>}
    </div>
  );
}

function Recommendation({ sess, stale, busy, onCompute, t }: { sess: Session; stale: boolean; busy: string | null; onCompute: () => void; t: number }) {
  const s = sess.scenario;
  const plan = sess.plan;
  return (
    <section className="card rec" aria-label="Recommendation">
      <h2>What the crew should do</h2>
      {!plan && <p>Breathline searches which repair, opening, escort{s.knowledge.unknown ? ' and inspection' : ''} sequence lets the most residents reach a suitable shelter, and compares it with doing nothing.</p>}
      {stale && <div className="stale-msg" role="alert">This plan was computed for input revision {plan!.inputRevision}; the input is now revision {sess.revision}. It cannot be approved — recompute.</div>}
      <button className="primary" onClick={onCompute} disabled={!!busy}>{busy ?? (plan ? 'Recompute response' : 'Compute response')}</button>
      {plan && !stale && (plan.kind === 'policy' ? <PolicyCard s={s} p={plan} sess={sess} t={t} /> : <ScheduleCard s={s} sc={plan.schedule} base={sess.baseline?.schedule} search={plan.search.status} />)}
      {plan && !stale && sess.approved && <NextTask sess={sess} t={t} />}
    </section>
  );
}

function ScheduleCard({ s, sc, base, search }: { s: Scenario; sc: Schedule; base?: Schedule; search: string }) {
  const ex = explainSchedule(s, sc, base);
  return (
    <div>
      <p className="headline">{ex.headline}</p>
      <p className="sentence">{ex.sentence}</p>
      <ol className="steps">{ex.steps.map((x, i) => <li key={i}><span className="when">{x.start}–{x.end}</span> {x.text}</li>)}</ol>
      {ex.deps.length > 0 && <details><summary>Dependencies ({ex.deps.length})</summary><ul>{ex.deps.map((d, i) => <li key={i}>{d.text}</li>)}</ul></details>}
      <p className="muted small">Search: {search === 'exhaustive' ? 'exhaustive within the declared scope' : search}. Batteries used {sc.objective.batteries} of {s.crew.batteries}; crew busy {sc.objective.busy} min.</p>
    </div>
  );
}

function PolicyCard({ s, p, sess }: { s: Scenario; p: PolicyResult; sess: Session; t: number }) {
  const ex = explainPolicy(s, p);
  const obs = sess.run?.main.state.knowledge.observations[0];
  const conf = sess.comparison?.plan;
  return (
    <div>
      <p className="headline">{ex.headline}</p>
      <p className="sentence">{ex.summary}</p>
      {p.inspection ? (
        <div className="branch-card">
          <div className="prefix"><b>Both states first:</b> {ex.prefix}</div>
          <div className="inspect-cost">Inspection: travel to {locName(s, p.inspection.location)} then {p.inspection.end - p.inspection.start} min of work ({p.inspection.start}–{p.inspection.end}); the crew can do nothing else meanwhile.</div>
          <div className="branches">
            {(['open', 'blocked'] as PassageState[]).map((st) => (
              <div key={st} className={`branch ${obs ? (obs.state === st ? 'active' : 'inactive') : ''}`}>
                <div className="b-head">If {st} <span className="b-n">{st === 'open' ? p.objective.nOpen : p.objective.nBlocked}/24</span></div>
                <div>{st === 'open' ? ex.open : ex.blocked}</div>
                {obs && obs.state === st && <div className="b-active">Observed at minute {obs.at} — this branch executes.</div>}
                {obs && obs.state !== st && <div className="muted">Not executed; kept for explanation.</div>}
              </div>
            ))}
          </div>
          {!obs && <div className="muted">{p.objective.min} feasible in both modeled states; up to {p.objective.nOpen - p.objective.nBlocked} additional residents if the bypass is open. Conditional arrivals are not guaranteed.</div>}
          {obs && !['open', 'blocked'].includes(obs.state) && <div className="stale-msg">Observation "{obs.state}" is outside the declared states: the run is paused for inspection.</div>}
        </div>
      ) : <ol className="steps">{explainSchedule(s, p.branches.open).steps.map((x, i) => <li key={i}><span className="when">{x.start}–{x.end}</span> {x.text}</li>)}</ol>}
      <table className="mini"><thead><tr><th>Response</th><th>If open</th><th>If blocked</th><th>Minimum</th></tr></thead><tbody>
        <tr><td>No intervention</td><td>{sess.baseline?.schedule.objective.served}</td><td>{sess.baseline?.schedule.objective.served}</td><td>{sess.baseline?.schedule.objective.served}</td></tr>
        <tr><td>Confirmed routes only</td><td>{p.noInspection.nOpen}</td><td>{p.noInspection.nBlocked}</td><td>{p.noInspection.min}</td></tr>
        <tr className="sel"><td>Selected {p.inspection ? 'policy' : 'response'}</td><td>{p.objective.nOpen}</td><td>{p.objective.nBlocked}</td><td>{p.objective.min}</td></tr>
      </tbody></table>
      <p className="muted small">Objective: maximise the minimum across the two modeled states, then their sum — an explicit preference across two possibilities, not a probability estimate. {conf && conf.kind === 'schedule' ? `Confirmed-route response: ${conf.schedule.tasks.map((id) => s.actions.find((a) => a.id === id)?.label ?? id.replace('escort-', 'escort ')).join(' \u2192 ') || 'no work'}.` : ''}</p>
    </div>
  );
}

function NextTask({ sess, t }: { sess: Session; t: number }) {
  const sc = activeSchedule(sess);
  const run = sess.run?.main.state;
  if (!sc || !run) return null;
  const started = run.processedThrough >= 0;
  const now = sc.crew.find((a) => a.start <= t && t < a.end && started);
  const next = sc.crew.find((a) => a.start >= (started ? t + (now ? 0 : 0) : 0) && a !== now);
  const label = (a: typeof now) => a ? `${a.start}–${a.end}: ${a.kind === 'work' || a.kind === 'inspect' ? sess.scenario.actions.find((x) => x.id === a.actionId)?.label : a.kind === 'escort' ? `escort ${a.groupId} to ${locName(sess.scenario, a.to)}` : `${a.kind} to ${locName(sess.scenario, a.to)}`}` : '—';
  return <div className="next"><div><b>Crew now:</b> {now ? label(now) : run.done ? 'finished' : 'idle'}</div><div><b>Next:</b> {label(next)}</div></div>;
}

function Approval({ sess, onApprove, onDiscard }: { sess: Session; onApprove: () => void; onDiscard: () => void }) {
  const plan = sess.plan!;
  const items = confirmationsFor(sess.scenario, plan);
  const blocked = items.filter((x) => !x.confirmed);
  return (
    <section className="card approval" aria-label="Approval">
      <h2>Confirmations this plan depends on</h2>
      <ul className="confs">{items.map((x, i) => <li key={i} className={x.confirmed ? 'yes' : 'no'}><span aria-hidden="true">{x.confirmed ? '✓' : '✗'}</span> {x.item} <span className="muted">— {x.source}{x.confirmed ? '' : `: ${x.detail}`}</span></li>)}</ul>
      {blocked.length > 0 && <p className="stale-msg">Approval blocked until confirmed: {blocked.map((x) => x.item).join('; ')}. Residents stay in the plan.</p>}
      {sess.approvalErrors.length > 0 && <ul className="errors">{sess.approvalErrors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <div className="row">
        <button className="primary" onClick={onApprove} disabled={!!sess.approved || blocked.length > 0}>{sess.approved ? 'Approved' : 'Approve and reserve'}</button>
        <button onClick={onDiscard} disabled={!sess.approved}>Discard approval</button>
      </div>
      {sess.approved && <p className="muted small">Approved plan {sess.approved.planId} at revision {sess.approved.revision}. Reservations committed (branch reservations held as alternatives until the observation).</p>}
    </section>
  );
}

function Outcome({ sess }: { sess: Session }) {
  const s = sess.scenario;
  const r = sess.run;
  const sc = activeSchedule(sess);
  const done = r && r.main.state.done && r.baseline.state.done;
  const rows = useMemo(() => (done && sc && r ? groupBenefits(s, sc, r.baseline.state, r.main.state, Object.fromEntries(s.groups.map((g) => [g.id, (sess.requests && Object.values(sess.requests).flatMap((x) => x?.none ?? []).find((n) => n.groupId === g.id)?.text) || 'Still needs a feasible journey to a suitable shelter.']))) : null), [done, sc, r, s, sess.requests]);
  return (
    <details className="panel" open>
      <summary>Outcome comparison and benefit for each group (executed runs)</summary>
      {!r && <p className="muted">Approve a response and play the clock: the response, the no-intervention baseline{sess.comparison ? ` and "${sess.comparison.label}"` : ''} run from the same snapshot under the same rules, in separate ledgers.</p>}
      {r && !done && <p className="muted">Executing… the executed columns fill when both runs reach minute {s.horizon}.</p>}
      {rows && (
        <table className="benefit"><thead><tr><th>Group</th><th>What the response provided</th><th>No intervention (executed)</th><th>Response (executed)</th><th>Arrival</th><th>Waiting / travel exposure</th><th>Remaining need</th></tr></thead><tbody>
          {rows.map((x) => <tr key={x.groupId} className={x.changed ? '' : 'unchanged'}><td><b>{x.groupId}</b> — {x.name}, {x.count}</td><td>{x.provided}</td><td>{x.baseline}</td><td>{x.response}</td><td>{x.arrival ?? '—'}</td><td>{x.waitingExposure !== null ? `${Math.round(x.waitingExposure)} / ${Math.round(x.travelExposure ?? 0)}` : '—'}</td><td>{x.remainingNeed ?? '—'}</td></tr>)}
        </tbody></table>
      )}
      {r && done && <ExecutedSummary sess={sess} />}
    </details>
  );
}

function ExecutedSummary({ sess }: { sess: Session }) {
  const s = sess.scenario;
  const r = sess.run!;
  const slots = [r.main, r.baseline, ...(r.comparison ? [r.comparison] : [])];
  return (
    <table className="mini"><thead><tr><th>Run (same start)</th><th>Arrived</th><th>Final arrival</th><th>Crew busy</th><th>Batteries consumed</th><th>Max exposure, arrived groups</th></tr></thead><tbody>
      {slots.map((x) => {
        const st = x.state;
        const arrived = s.groups.filter((g) => st.groups[g.id].status === 'arrived');
        const sc = x.plan.kind === 'schedule' ? x.plan.schedule : x.plan.branches[(st.activeBranch as PassageState) ?? 'open'];
        return <tr key={x.label}><td>{x.label}</td><td>{arrived.reduce((n, g) => n + g.count, 0)} ({arrived.map((g) => g.id).join(', ') || 'none'})</td><td>{arrived.length ? Math.max(...arrived.map((g) => st.groups[g.id].arrivedAt!)) : '—'}</td><td>{sc.objective.busy} min</td><td>{Object.values(st.ledger.locs).reduce((n, q) => n + q.consumed, 0)}</td><td>{arrived.length ? arrived.map((g) => `${g.id} ${Math.round(st.groups[g.id].exposure)}`).join(', ') : '—'}</td></tr>;
      })}
    </tbody></table>
  );
}

function NumEdit({ label, value, min, max, onSet }: { label: string; value: number; min: number; max: number; onSet: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= min && n <= max;
  return (
    <label className="numedit">{label}
      <input type="number" value={v} min={min} max={max} onChange={(e) => setV(e.target.value)} aria-invalid={!ok} />
      <button onClick={() => ok && n !== value && onSet(n)} disabled={!ok || n === value}>Set</button>
      {!ok && <span className="err">{min}–{max}</span>}
    </label>
  );
}

function Setup({ sess, edit, locked }: { sess: Session; edit: (t: string, f: (s: Scenario) => void) => void; locked: boolean }) {
  const s = sess.scenario;
  const [conn, setConn] = useState(s.connections[0].id);
  const c = s.connections.find((x) => x.id === conn) ?? s.connections[0];
  const repair = s.actions.find((a) => a.kind === 'repair');
  const gate = s.actions.find((a) => a.kind === 'open');
  const insp = s.actions.find((a) => a.kind === 'inspect');
  const vent = s.actions.find((a) => a.kind === 'ventilate');
  const [dv, setDv] = useState({ resource: 'batteries', quantity: 4, location: 'G', minute: 14, source: 'Neighbouring crew', confirmed: true });
  const hz = (id: string) => s.locations.find((l) => l.id === id)!;
  return (
    <details className="panel">
      <summary>Setup edits (time-0 starting constraints)</summary>
      {locked && <p className="notice small">Execution has begun. Any change starts a clearly labeled new run from the edited initial setup — it does not replan from in-transit positions.</p>}
      <div className="setup-grid">
        <fieldset><legend>Crew and resources</legend>
          <NumEdit label="Batteries in crew pack" value={s.crew.batteries} min={0} max={12} onSet={(n) => edit(`batteries ${s.crew.batteries} → ${n}`, (x) => { x.crew.batteries = n; })} />
          {repair && <NumEdit label="Fan 3 repair minutes" value={repair.duration} min={1} max={15} onSet={(n) => edit(`repair duration ${n}`, (x) => { x.actions.find((a) => a.id === repair.id)!.duration = n; })} />}
          {repair && <NumEdit label="Fan 3 repair batteries" value={repair.batteries} min={0} max={8} onSet={(n) => edit(`repair batteries ${n}`, (x) => { x.actions.find((a) => a.id === repair.id)!.batteries = n; })} />}
          {gate && <NumEdit label="Gate B batteries" value={gate.batteries} min={0} max={8} onSet={(n) => edit(`Gate B batteries ${n}`, (x) => { x.actions.find((a) => a.id === gate.id)!.batteries = n; })} />}
          {insp?.offered && <NumEdit label="Inspection minutes (bypass)" value={insp.duration} min={1} max={15} onSet={(n) => edit(`inspection duration ${insp.duration} → ${n}`, (x) => { x.actions.find((a) => a.id === insp.id)!.duration = n; })} />}
          {vent && <label className="numedit">Fallback ventilation offered <input type="checkbox" checked={vent.offered} onChange={(e) => edit(`fallback ventilation ${e.target.checked ? 'offered' : 'not offered'}`, (x) => { x.actions.find((a) => a.id === vent.id)!.offered = e.target.checked; })} /></label>}
          {vent?.offered && <NumEdit label="Ventilation batteries" value={vent.batteries} min={0} max={8} onSet={(n) => edit(`ventilation batteries ${n}`, (x) => { x.actions.find((a) => a.id === vent.id)!.batteries = n; })} />}
          {vent?.offered && <NumEdit label="Ventilation minutes" value={vent.duration} min={1} max={10} onSet={(n) => edit(`ventilation duration ${n}`, (x) => { x.actions.find((a) => a.id === vent.id)!.duration = n; })} />}
          {vent?.offered && <NumEdit label="Protected growth rate" value={(vent.effect as { rate: number }).rate} min={0} max={20} onSet={(n) => edit(`protected rate ${n}`, (x) => { (x.actions.find((a) => a.id === vent.id)!.effect as { rate: number }).rate = n; })} />}
        </fieldset>
        <fieldset><legend>Hazards (fictional planning units)</legend>
          {['RA', 'J3'].map((id) => (
            <div key={id}>
              <NumEdit label={`${hz(id).name} initial`} value={hz(id).hazard.initial} min={0} max={99} onSet={(n) => edit(`${id} initial hazard ${n}`, (x) => { x.locations.find((l) => l.id === id)!.hazard.initial = n; })} />
              <NumEdit label={`${hz(id).name} growth/min`} value={hz(id).hazard.rate} min={0} max={40} onSet={(n) => edit(`${id} growth ${n}/min`, (x) => { x.locations.find((l) => l.id === id)!.hazard.rate = n; })} />
            </div>
          ))}
          {repair && <NumEdit label="J3 growth after repair" value={(repair.effect as { rate: number }).rate} min={0} max={40} onSet={(n) => edit(`J3 repaired growth ${n}`, (x) => { (x.actions.find((a) => a.id === repair.id)!.effect as { rate: number }).rate = n; })} />}
        </fieldset>
        <fieldset><legend>Shelters</legend>
          {s.shelters.map((sh) => <NumEdit key={sh.location} label={`${sh.name} places`} value={sh.places} min={0} max={30} onSet={(n) => edit(`${sh.name} places ${sh.places} → ${n}`, (x) => { x.shelters.find((y) => y.location === sh.location)!.places = n; })} />)}
          {s.shelters.map((sh) => (Object.keys(sh.checklist) as (keyof ShelterChecklist)[]).map((k) => (
            <label key={sh.location + k} className="numedit">{sh.name}: {CHECK_LABEL[k]}
              <select value={sh.checklist[k]} onChange={(e) => edit(`${sh.name} ${CHECK_LABEL[k]} ${e.target.value}`, (x) => { x.shelters.find((y) => y.location === sh.location)!.checklist[k] = e.target.value as ChecklistState; })}>
                <option value="present">confirmed present</option><option value="absent">confirmed absent</option><option value="unconfirmed">unconfirmed</option>
              </select>
            </label>
          )))}
        </fieldset>
        <fieldset><legend>Connections and instructions</legend>
          <label className="numedit">Connection <select value={conn} onChange={(e) => setConn(e.target.value)}>{s.connections.map((x) => <option key={x.id} value={x.id}>{x.id} ({x.minutes} min)</option>)}</select></label>
          <NumEdit label={`${c.id} minutes`} value={c.minutes} min={1} max={20} onSet={(n) => edit(`${c.id} duration ${c.minutes} → ${n}`, (x) => { x.connections.find((y) => y.id === c.id)!.minutes = n; })} />
          {s.groups.map((g) => <NumEdit key={g.id} label={`${g.id} instructions available at minute`} value={g.instructionsAvailableAt} min={0} max={20} onSet={(n) => edit(`${g.id} instructionsAvailableAt ${n}`, (x) => { x.groups.find((y) => y.id === g.id)!.instructionsAvailableAt = n; })} />)}
        </fieldset>
        <fieldset><legend>Confirmed expected deliveries</legend>
          <ul>{s.deliveries.map((d) => <li key={d.id}>{d.quantity} {d.resource} at {d.location} by {d.minute} — {d.source} {d.confirmed ? '(confirmed)' : '(unconfirmed — excluded from plans)'} <button onClick={() => edit(`delivery ${d.id} removed`, (x) => { x.deliveries = x.deliveries.filter((y) => y.id !== d.id); })}>Remove</button></li>)}</ul>
          <div className="delivery-form">
            <select value={dv.resource} onChange={(e) => setDv({ ...dv, resource: e.target.value })}><option value="batteries">batteries</option><option value="places">places</option></select>
            <input type="number" value={dv.quantity} min={1} max={12} onChange={(e) => setDv({ ...dv, quantity: Number(e.target.value) })} aria-label="quantity" />
            <select value={dv.location} onChange={(e) => setDv({ ...dv, location: e.target.value })}>{s.locations.map((l) => <option key={l.id} value={l.id}>{l.id}</option>)}</select>
            <input type="number" value={dv.minute} min={0} max={s.horizon} onChange={(e) => setDv({ ...dv, minute: Number(e.target.value) })} aria-label="minute" />
            <input value={dv.source} onChange={(e) => setDv({ ...dv, source: e.target.value })} aria-label="source" />
            <label><input type="checkbox" checked={dv.confirmed} onChange={(e) => setDv({ ...dv, confirmed: e.target.checked })} /> confirmed</label>
            <button onClick={() => edit(`expected delivery: ${dv.quantity} ${dv.resource} at ${dv.location} by ${dv.minute} (${dv.source}${dv.confirmed ? ', confirmed' : ''})`, (x) => { x.deliveries.push({ id: `dlv-${x.deliveries.length + 1}-${dv.location}-${dv.minute}`, resource: dv.resource as 'batteries', quantity: dv.quantity, location: dv.location, minute: dv.minute, source: dv.source, confirmed: dv.confirmed }); })} disabled={!(dv.quantity >= 1 && dv.minute >= 0 && dv.minute <= s.horizon)}>Record</button>
          </div>
        </fieldset>
      </div>
      <p className="muted small">Edit history: {sess.edits.map((e) => `r${e.revision}: ${e.text}`).join(' · ') || 'none'}</p>
    </details>
  );
}

function Reports({ sess, edit }: { sess: Session; edit: (t: string, f: (s: Scenario) => void) => void }) {
  const s = sess.scenario;
  const [places, setPlaces] = useState<Record<string, number>>({});
  return (
    <details className="panel">
      <summary>Reports and confirmations (stewards, representatives, crews)</summary>
      <table className="mini"><thead><tr><th>Target</th><th>Entered value</th><th>Observed</th><th>Source</th><th>State</th></tr></thead><tbody>
        {s.reports.map((r) => <tr key={r.id}><td>{r.target}</td><td>{r.value}</td><td>{r.observedAt <= 0 ? `${-r.observedAt} min before crisis start` : `minute ${r.observedAt}`}</td><td>{r.source}</td><td className={r.state === 'confirmed' ? 'yes' : 'no'}>{r.state}</td></tr>)}
      </tbody></table>
      <h3>Record a steward confirmation</h3>
      {s.shelters.map((sh) => (
        <div key={sh.location} className="row">
          <label>{sh.steward} reports places at {sh.name}: <input type="number" min={0} max={30} value={places[sh.location] ?? sh.places} onChange={(e) => setPlaces({ ...places, [sh.location]: Number(e.target.value) })} /></label>
          <button onClick={() => { const n = places[sh.location] ?? sh.places; edit(n === sh.places ? `${sh.name} places reconfirmed ${n}` : `${sh.steward} reports ${n} places instead of ${sh.places}`, (x) => { const y = x.shelters.find((z) => z.location === sh.location)!; y.places = n; y.placesConfirmed = true; const r = x.reports.find((z) => z.target === `${sh.name} places`); if (r) { r.value = String(n); r.state = 'confirmed'; } }); }}>Record</button>
          <label><input type="checkbox" checked={sh.placesConfirmed} onChange={(e) => edit(`${sh.name} places ${e.target.checked ? 'confirmed' : 'marked unconfirmed'}`, (x) => { x.shelters.find((z) => z.location === sh.location)!.placesConfirmed = e.target.checked; })} /> places confirmed</label>
        </div>
      ))}
      <h3>Instruction acknowledgements (relayed by representatives)</h3>
      {s.groups.map((g) => <label key={g.id} className="row"><input type="checkbox" checked={!!s.instructionsConfirmed[g.id]} onChange={(e) => edit(`${g.name} instructions ${e.target.checked ? 'acknowledged' : 'not acknowledged'}`, (x) => { x.instructionsConfirmed[g.id] = e.target.checked; })} /> {g.name}: departure instructions acknowledged as available by minute {g.instructionsAvailableAt}</label>)}
    </details>
  );
}

function Controller({ sess, setSess }: { sess: Session; setSess: (f: (x: Session) => Session) => void }) {
  const s = sess.scenario;
  const started = !!sess.run && sess.run.main.state.processedThrough >= 0;
  if (!s.knowledge.unknown && !s.deliveries.some((d) => d.confirmed)) return null;
  return (
    <details className="panel" open={!!s.knowledge.unknown}>
      <summary>Test controller — hidden simulator truth (never passed to the planner)</summary>
      {s.knowledge.unknown && (
        <label className="row">Actual state of {s.knowledge.unknown.connection}:
          <select id="truth-bypass" value={sess.truth.bypass} disabled={started} onChange={(e) => { const v = e.target.value; setSess((x) => ({ ...x, truth: { ...x.truth, bypass: v }, run: null, approved: null, notice: 'Hidden state changed before execution. The plan is unchanged (the planner never sees truth); approve again to start the run.' })); }}>
            <option value="open">open</option><option value="blocked">blocked</option><option value="partially-collapsed">something unexpected (outside the declared states)</option>
          </select>
        </label>
      )}
      {s.deliveries.filter((d) => d.confirmed).map((d) => (
        <label key={d.id} className="row">Actual arrival of {d.id} ({d.quantity} {d.resource} at {d.location}, confirmed for {d.minute}):
          <select disabled={started} value={String(sess.truth.deliveries[d.id] === undefined ? d.minute : sess.truth.deliveries[d.id])} onChange={(e) => { const v = e.target.value === 'never' ? null : Number(e.target.value); setSess((x) => ({ ...x, truth: { ...x.truth, deliveries: { ...x.truth.deliveries, [d.id]: v } }, run: null, approved: null })); }}>
            <option value={d.minute}>on time ({d.minute})</option><option value={d.minute + 1}>1 minute late ({d.minute + 1})</option><option value={d.minute + 3}>3 minutes late</option><option value="never">never arrives</option>
          </select>
        </label>
      ))}
      {started && <p className="muted small">Locked while a run is executing.</p>}
    </details>
  );
}

function Stress({ sess, stress, setStress }: { sess: Session; stress: { rows: StressRow[]; recomputed: Record<string, string> } | null; setStress: (x: { rows: StressRow[]; recomputed: Record<string, string> } | null) => void }) {
  const s = sess.scenario;
  const plan = sess.plan;
  if (!plan || isPlanStale(sess)) return null;
  const sc = plan.kind === 'schedule' ? plan.schedule : null;
  return (
    <details className="panel">
      <summary>Stress check — does the selected plan still work under declared delays and faster hazards?</summary>
      {!sc && <p className="muted">For the two-state case the separate evaluation axis is the passage state: both branches are shown above and executed by the test controller. (Stress variants apply to confirmed-state plans.)</p>}
      {sc && <button onClick={() => setStress({ rows: stressSelected(s, sc), recomputed: {} })}>Evaluate selected plan under 8 variants</button>}
      {stress && sc && (
        <table className="mini"><thead><tr><th>Extra repair min × growth</th><th>Assignments still feasible</th><th>Failed constraints</th><th>Recompute under these conditions</th></tr></thead><tbody>
          {stress.rows.map((r) => <tr key={r.variant.id} className={r.failedGroups.length ? 'fail' : ''}><td>{r.variant.id}</td><td>{r.residentsFeasible} ({r.feasibleGroups.join(', ') || 'none'})</td><td>{r.failedGroups.map((f) => `${f.group}: ${f.constraints[0]}`).join('; ') || '—'}{r.note ? ` ${r.note}` : ''}</td>
            <td>{stress.recomputed[r.variant.id] ?? <button onClick={() => { const p = recomputeUnder(s, r.variant) as AnyPlan; const o = p.kind === 'schedule' ? p.schedule : p.branches.open; setStress({ ...stress, recomputed: { ...stress.recomputed, [r.variant.id]: `${o.objective.served} residents: ${o.tasks.join(' > ') || 'no work'} (${p.search.status})` } }); }}>Recompute</button>}</td></tr>)}
        </tbody></table>
      )}
      <p className="muted small">Task order, crew paths, resident paths and shelter choices are preserved; dependent tasks are pushed later; the result is revalidated. A failed assignment does not show that another response cannot help. Eight cases describe only those eight cases — not a failure probability. Variants: {STRESS_VARIANTS.length}.</p>
    </details>
  );
}

function Exposure({ sess }: { sess: Session }) {
  const s = sess.scenario;
  const sc = activeSchedule(sess);
  const run = sess.run;
  if (!sc) return null;
  return (
    <details className="panel">
      <summary>Exposure detail (hazard-index minutes per person)</summary>
      <table className="mini"><thead><tr><th>Group</th><th>Forecast: waiting / travel / total</th><th>Executed so far (response)</th><th>Executed (no intervention)</th><th>Group total (× people)</th></tr></thead><tbody>
        {s.groups.map((g) => { const j = sc.journeys.find((x) => x.groupId === g.id); const m = run?.main.state.groups[g.id]; const b = run?.baseline.state.groups[g.id]; return <tr key={g.id}><td>{g.id} ({g.count})</td><td>{j ? `${j.waitingExposure} / ${j.travelExposure} / ${j.exposure}` : `unresolved: ${sc.exposureUnresolved[g.id]} over the horizon`}</td><td>{m ? Math.round(m.exposure) : '—'}</td><td>{b ? Math.round(b.exposure) : '—'}</td><td>{m ? Math.round(m.exposure * g.count) : '—'}</td></tr>; })}
      </tbody></table>
      <p className="muted small">Served populations differ between runs, so compare groups row by row rather than adding totals. Units are fictional planning units.</p>
    </details>
  );
}

function Events({ run }: { run: SimState | null }) {
  if (!run) return null;
  return (
    <details className="panel">
      <summary>Event log ({run.events.length} events; {run.invariantChecks} invariant checks; {run.violations.length} violations)</summary>
      <div className="scroll"><table className="mini"><thead><tr><th>ID</th><th>Min</th><th>Entity</th><th>Action</th><th>Before → after</th></tr></thead><tbody>
        {run.events.slice().reverse().map((e) => <tr key={e.id}><td><code>{e.id}</code></td><td>{e.t}</td><td>{e.entity}</td><td>{e.action}</td><td>{JSON.stringify(e.before)} → {JSON.stringify(e.after)}</td></tr>)}
      </tbody></table></div>
    </details>
  );
}

function Diagnostics({ sess }: { sess: Session }) {
  const p = sess.plan;
  if (!p) return null;
  return (
    <details className="panel">
      <summary>Search diagnostics</summary>
      <ul>
        <li>Status: <b>{p.search.status}</b> — {p.search.status === 'exhaustive' ? 'every response in the declared scope was evaluated (optimum within the declared model).' : p.search.status === 'proven-infeasible' ? 'no feasible assignment exists within the declared model and scope.' : 'search stopped at its limit; this is the best found, not a proof.'}</li>
        <li>Explored crew plans/policies: {p.search.explored}; joint assignment searches: {p.search.assignments}; elapsed {p.search.elapsedMs} ms; budget {p.search.budget.maxPlans} plans / {p.search.budget.timeLimitMs} ms.</li>
        <li>Groups served in at least one evaluated response: {p.search.groupsEverServed.join(', ') || 'none'}.</li>
        <li>Input hash <code>{p.inputHash}</code>, revision {p.inputRevision}{p.kind === 'policy' ? `; planner knowledge: ${sess.scenario.knowledge.unknown?.connection} unknown (open | blocked)` : ''}.</li>
      </ul>
      <h3>Declared search scope</h3><ul>{p.search.scope.map((x) => <li key={x}>{x}</li>)}</ul>
    </details>
  );
}

function Evidence({ sess }: { sess: Session }) {
  const ev = evidenceSummary as { buildId?: string; generatedAt?: string; command?: string; summary?: { passed: number; failed: number; notRun: number; total: number }; criteria?: { criterion: string; weight: number; checks: { id: string; name: string; status: string; observed: string }[] }[] };
  return (
    <details className="panel">
      <summary>Evidence panel — rubric criteria → recorded runs</summary>
      {ev.criteria ? (
        <>
          <p className="muted small">From <code>{ev.command}</code> ({ev.generatedAt}, build {ev.buildId}): {ev.summary?.passed} passed, {ev.summary?.failed} failed, {ev.summary?.notRun} not run. Values come from recorded outputs; this is not a score.</p>
          <table className="mini"><thead><tr><th>Criterion</th><th>Weight</th><th>Supporting checks</th></tr></thead><tbody>
            {ev.criteria.map((c) => <tr key={c.criterion}><td>{c.criterion}</td><td>{c.weight}</td><td>{c.checks.map((x) => <span key={x.id} className={`evchip ${x.status === 'passed' ? 'ok' : x.status === 'failed' ? 'bad' : 'nr'}`} title={`${x.name}: ${x.observed}`}>{x.id} · {x.status === 'passed' ? 'observed' : x.status}</span>)}</td></tr>)}
          </tbody></table>
        </>
      ) : <p>Not yet verified: run <code>npm run evidence</code> and rebuild.</p>}
      <h3>This session</h3>
      <ul>{sess.observations.map((o, i) => <li key={i}>{o.text}</li>)}{!sess.observations.length && <li className="muted">No completed runs in this session yet.</li>}</ul>
    </details>
  );
}

function Assumptions() {
  return (
    <details className="panel">
      <summary>Assumptions and limits</summary>
      <ul>{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
      <p className="muted small">Not modeled: medical outcomes, shelter habitability beyond minute 20, adversarial reports, changing hidden conditions, unreliable inspection, actual radio delivery, sensor calibration, control over Directorate infrastructure.</p>
    </details>
  );
}
