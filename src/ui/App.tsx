import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { AnyPlan, ChecklistState, PassageState, Scenario, Schedule, ShelterChecklist } from '../engine/types';
import { getScenario, SCENARIO_BUILDERS } from '../engine/scenarios';
import { explainPolicy, explainSchedule } from '../engine/explain';
import { confirmationsFor } from '../engine/approval';
import { groupBenefits } from '../engine/benefit';
import { stressSelected, recomputeUnder, STRESS_VARIANTS, type StressRow } from '../engine/stress';
import { buildExport, ASSUMPTIONS, BUILD_ID } from '../engine/exportRun';
import { CHECK_LABEL } from '../engine/common';
import type { SimState } from '../engine/simulate';
import { MapView } from './MapView';
import { DispatchSheet } from './Dispatch';
import {
  activeSchedule, applyEdit, approve, clearSession, compute, computeAllRequests, discardApproval, isPlanStale, loadSession, newSession,
  resetRun, resumeRun, saveSession, stepRun, truthOf, type Session,
} from './session';
import {
  confirmationInstruction, countOf, groupName, mainSchedule, passageName, placeName, plain, planView, plural, protectionGains, STATUS_WORDS,
  total, whyWaiting, type Plainstatus,
} from './plain';
import evidenceSummary from '../generated/evidence-summary.json';

type View = 'ops' | 'demo';
type Stage = 'find' | 'approve' | 'run' | 'running' | 'restored' | 'stopped' | 'done';

/** Everyday words for the engine's status vocabulary. */
const words = (x: string) => x.replace(/Unresolved \u2014 location reached the threshold/g, 'Still waiting; the hazard limit was reached at their location').replace(/\bUnresolved\b/g, 'Still waiting').replace(/below threshold/g, 'below the hazard limit').replace(/\bthreshold\b/g, 'hazard limit');

const BLOCKER_ORDER = ['unsuitable-shelter', 'missing-resources', 'shelter-shortage', 'instructions', 'threshold-at-arrival', 'unsafe-waiting', 'horizon', 'no-route', 'unknown-passage', 'inaccessible-stairs', 'missing-escort', 'displaced'];

export default function App() {
  const [sess, setSess] = useState<Session>(() => loadSession() ?? newSession('A'));
  const [view, setView] = useState<View>('ops');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(() => { try { return localStorage.getItem('breathline.onboarded') !== '1'; } catch { return true; } });
  const [stress, setStress] = useState<{ rows: StressRow[]; recomputed: Record<string, string> } | null>(null);
  const timer = useRef<number | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);

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
  const started = !!run && run.processedThrough >= 0;
  const t = run ? Math.max(0, run.processedThrough) : 0;
  const schedule = stale ? null : activeSchedule(sess);
  const view_ = useMemo(() => (plan && !stale ? planView(s, plan, sess.baseline) : null), [plan, stale, s, sess.baseline]);
  const restoredPause = !!run?.paused && !!run.pause?.reason.startsWith('Restored');

  const stage: Stage = !plan || stale ? 'find' : !sess.run ? 'approve' : run!.done ? 'done' : playing ? 'running' : run!.paused ? (restoredPause ? 'restored' : 'stopped') : 'run';

  // plain status for each group, from live state when running, else from the plan
  const statusOf = (gid: string): Plainstatus => {
    const prot = plan && !stale ? protectionGains(s, plan.kind === 'policy' && plan.inspection ? plan.branches.blocked : mainSchedule(plan), sess.baseline?.schedule ?? null).some((x) => x.g.id === gid) : false;
    if (run) {
      const g = run.groups[gid];
      if (g.status === 'arrived') return 'arrived';
      if (g.status === 'traveling') return 'on-the-way';
      if (g.status === 'assigned') return 'has-route';
      if (g.status === 'conditional') return 'waiting-inspection';
      if (g.status === 'held') return 'held';
      if (g.unsafe) return 'unsafe';
      return prot ? 'protected' : 'needs-help';
    }
    if (!plan || stale || !view_) return 'needs-help';
    if (view_.conditionalGroups.includes(gid)) return 'waiting-inspection';
    if (schedule?.journeys.some((j) => j.groupId === gid)) return 'has-route';
    return prot ? 'protected' : 'needs-help';
  };

  const doCompute = () => {
    setBusy('Finding a plan…');
    setStress(null);
    setTimeout(() => {
      setSess((x) => compute(x));
      setBusy('Checking what could help anyone still waiting…');
      setTimeout(() => { setSess((x) => computeAllRequests(x)); setBusy(null); }, 30);
    }, 30);
  };
  const switchScenario = (id: string) => { setPlaying(false); setStress(null); setSess(newSession(id)); };
  const edit = (text: string, f: (x: Scenario) => void) => { setPlaying(false); setStress(null); setSess((x) => applyEdit(x, text, f)); };
  const runPlay = () => { if (run?.paused && restoredPause) setSess((x) => ({ ...resumeRun(x), notice: null })); setPlaying(true); };
  const viewResults = () => { setView('ops'); setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 30); resultsRef.current?.focus(); };

  const exportText = () => {
    if (!sess.run || !plan) return '';
    const ex = buildExport(s, sess.run.main.plan, truthOf(sess), sess.run.main.state, sess.revision, { resourceRequests: sess.requests, stress: stress?.rows });
    return JSON.stringify({ ...ex, baselineRun: { events: sess.run.baseline.state.events, observed: sess.run.baseline.state.groups }, comparisonRun: sess.run.comparison ? { label: sess.run.comparison.label, events: sess.run.comparison.state.events } : null, edits: sess.edits }, null, 1);
  };
  const exportJson = () => {
    if (!sess.run) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportText()], { type: 'application/json' }));
    a.download = `breathline-${s.label}-rev${sess.revision}-${sess.run.main.state.runId}.json`;
    a.click();
  };
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(exportText()); setCopied('Run record copied'); } catch { setCopied('Copy is blocked here — use Export'); }
    setTimeout(() => setCopied(null), 3000);
  };

  const mapEl = <MapView s={s} plan={stale ? null : plan} schedule={schedule} approved={!!sess.approved} run={run} t={t} statusOf={statusOf} />;

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><h1>Breathline</h1><span className="tag">Community rescue planner</span></div>
        <div className="banner" role="note">Simulation — illustrative conditions and assumptions</div>
        <nav className="views" role="tablist" aria-label="Views">
          <button role="tab" aria-selected={view === 'ops'} className={view === 'ops' ? 'on' : ''} onClick={() => setView('ops')}>Operations</button>
          <button role="tab" aria-selected={view === 'demo'} className={view === 'demo' ? 'on' : ''} onClick={() => setView('demo')}>Demo &amp; testing</button>
        </nav>
        <div className="secondary-actions" aria-label="More actions">
          <button className="ghost" onClick={() => window.print()} disabled={!plan || stale}>Print dispatch</button>
          <button className="ghost" onClick={exportJson} disabled={!sess.run}>Export</button>
          <button className="ghost" onClick={copyJson} disabled={!sess.run}>Copy record</button>
          <button className="ghost" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>How it works</button>
          {copied && <span className="muted small" role="status">{copied}</span>}
        </div>
      </header>

      {showHelp && <Help onClose={() => { setShowHelp(false); try { localStorage.setItem('breathline.onboarded', '1'); } catch { /* ignore */ } }} />}

      <Situation sess={sess} statusOf={statusOf} view_={view_} />

      <Alerts sess={sess} stale={stale} run={run} onResume={() => setSess((x) => ({ ...resumeRun(x), notice: null }))} onFind={doCompute} />

      {view === 'ops' ? (
        <>
          <main className="ops-grid">
            <section className="col-map" aria-label="Map and residents">
              {mapEl}
              <Roster sess={sess} statusOf={statusOf} schedule={schedule} />
              <StillNeedHelp sess={sess} stale={stale} />
            </section>
            <section className="col-plan" aria-label="Plan and next action">
              <PlanCard sess={sess} stale={stale} view_={view_} run={run} />
              {plan && !stale && <Confirmations sess={sess} edit={edit} />}
              <NextAction stage={stage} sess={sess} busy={busy} t={t} onFind={doCompute} onApprove={() => setSess((x) => approve(x))} onRun={runPlay}
                onPause={() => setPlaying(false)} onResults={viewResults} onReset={() => { setPlaying(false); setSess((x) => resetRun(x)); }} onDiscard={() => setSess((x) => discardApproval(x))} />
            </section>
          </main>
          {sess.run && <Results sess={sess} innerRef={resultsRef} statusOf={statusOf} />}
          <section className="secondary-panels">
            <details className="panel">
              <summary>Update conditions and confirmations</summary>
              {started && !run!.done && <p className="warn-inline">A simulation is running. Changing any condition stops it; the next approved plan starts a <b>new run</b> from the updated starting conditions. Breathline does not replan from where people are now.</p>}
              <Setup sess={sess} edit={edit} />
              <Reports sess={sess} edit={edit} />
            </details>
            {plan && !stale && <details className="panel"><summary>Dispatch sheet (preview of what Print dispatch produces)</summary><DispatchSheet s={s} plan={plan} revision={sess.revision} requests={sess.requests} /></details>}
          </section>
        </>
      ) : (
        <DemoView sess={sess} setSess={setSess} switchScenario={switchScenario} mapEl={mapEl} t={t} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
          stress={stress} setStress={setStress} onStep={() => setSess((x) => stepRun(x))} onReset={() => { setPlaying(false); setSess((x) => resetRun(x)); }} onResetSession={() => { clearSession(); switchScenario(sess.scenarioId); }} />
      )}
      {plan && !stale && <div className="print-only"><DispatchSheet s={s} plan={plan} revision={sess.revision} requests={sess.requests} /></div>}
      <footer className="foot">Runs entirely on this laptop · no accounts, no network · the planner never sees the simulator's hidden conditions · build {BUILD_ID}</footer>
    </div>
  );
}

// ------------------------------------------------------------------ top of page

function Help({ onClose }: { onClose: () => void }) {
  return (
    <section className="help" aria-label="How Breathline is used">
      <ol>
        <li>The <b>coordinator</b> runs Breathline on the command-station laptop. Residents need no phones or accounts.</li>
        <li><b>Resident representatives</b> report where each group is and what help it needs, by radio or messenger.</li>
        <li><b>Shelter stewards</b> confirm free places, step-free entry, assistance on arrival and working ventilation.</li>
        <li>Breathline finds a plan. The coordinator confirms what it depends on, approves it, and relays the printed dispatch.</li>
      </ol>
      <p className="muted small">Restrictions are modeled as physical access limits; Breathline cannot override the Directorate. Radio coverage, power, accurate reports and compliance remain dependencies.</p>
      <button onClick={onClose}>Got it</button>
    </section>
  );
}

function Situation({ sess, statusOf, view_ }: { sess: Session; statusOf: (g: string) => Plainstatus; view_: ReturnType<typeof planView> | null }) {
  const s = sess.scenario;
  const T = total(s);
  const run = sess.run;
  const shelterPlaces = s.shelters.reduce((n, x) => n + x.places, 0);
  const plan = sess.plan && !isPlanStale(sess) ? sess.plan : null;
  const counters: { label: string; value: string; tag: string; sub: string; tone: string }[] = [];
  if (run) {
    const m = run.main.state, b = run.baseline.state;
    const done = m.done;
    const by = (st: SimState, f: (x: string) => boolean) => s.groups.filter((g) => f(st.groups[g.id].status)).reduce((n, g) => n + g.count, 0);
    const arrived = by(m, (x) => x === 'arrived');
    const onWay = by(m, (x) => x === 'traveling' || x === 'assigned');
    const waitIds = s.groups.filter((g) => ['unresolved', 'conditional', 'held'].includes(m.groups[g.id].status)).map((g) => g.id);
    const cond = countOf(s, waitIds.filter((g) => statusOf(g) === 'waiting-inspection'));
    const prot = countOf(s, waitIds.filter((g) => statusOf(g) === 'protected'));
    counters.push({ label: done ? 'Reached shelter' : 'Reached shelter so far', value: `${arrived}`, tag: 'Simulation result', sub: done ? `of ${T} residents` : `${onWay} more on the way`, tone: 'good' });
    counters.push({ label: 'Still waiting', value: `${countOf(s, waitIds)}`, tag: done ? 'Simulation result' : 'Now', sub: [cond ? `${cond} waiting for inspection` : '', prot ? `${prot} with temporary protection` : ''].filter(Boolean).join(' · ') || (countOf(s, waitIds) ? 'need a route' : 'nobody left waiting'), tone: countOf(s, waitIds) ? 'warn' : 'good' });
    counters.push({ label: 'Without crew intervention', value: `${by(b, (x) => x === 'arrived')}`, tag: done ? 'Simulation result' : 'Running alongside', sub: 'same start, same rules', tone: '' });
  } else if (plan && view_) {
    const sc = mainSchedule(plan);
    const base = sess.baseline?.schedule.objective.served ?? 0;
    if (plan.kind === 'policy' && plan.inspection) {
      const o = plan.objective;
      counters.push({ label: 'Can reach shelter', value: `${o.min}–${o.nOpen}`, tag: 'Forecast', sub: `${o.min} whatever the check finds · ${o.nOpen - o.nBlocked} depend on it`, tone: 'good' });
      counters.push({ label: 'Still needing help', value: `${T - o.nOpen}–${T - o.min}`, tag: 'Forecast', sub: `${o.nOpen - o.nBlocked} waiting for inspection`, tone: 'warn' });
    } else {
      const prot = countOf(s, s.groups.filter((g) => statusOf(g.id) === 'protected').map((g) => g.id));
      counters.push({ label: 'Can reach shelter', value: `${sc.objective.served}`, tag: 'Forecast', sub: `of ${T} residents`, tone: 'good' });
      counters.push({ label: 'Still needing help', value: `${T - sc.objective.served}`, tag: 'Forecast', sub: prot ? `${prot} with temporary protection` : T - sc.objective.served ? 'no route in this plan' : 'everyone has a route', tone: T - sc.objective.served ? 'warn' : 'good' });
    }
    counters.push({ label: 'Without crew intervention', value: `${base}`, tag: 'Forecast', sub: 'existing routes only', tone: '' });
  } else {
    counters.push({ label: 'Residents', value: `${T}`, tag: 'Reported', sub: `in ${s.groups.length} groups`, tone: '' });
    counters.push({ label: 'Shelter places', value: `${shelterPlaces}`, tag: 'Confirmed', sub: `in ${s.shelters.length} shelters`, tone: '' });
    counters.push({ label: 'Crew', value: '1', tag: 'Available', sub: `${s.crew.batteries} batteries${s.crew.toolkit ? ', tool kit' : ''}`, tone: '' });
  }
  return (
    <section className="situation" aria-label="Situation">
      <div className="sit-text">
        <h2>{s.title}</h2>
        <p>{s.summary} {T} residents in {s.groups.length} groups, {s.shelters.length} shelters with {shelterPlaces} places, one crew, a {s.horizon}-minute window.</p>
        {sess.revision > 0 && <span className="chip-updated" title={`Input revision ${sess.revision}`}>Conditions updated {'·'} {plural(sess.revision, 'change')}</span>}
      </div>
      <div className="counters">
        {counters.map((c) => (
          <div key={c.label} className={`ctr ${c.tone}`}>
            <span className="ctr-tag">{c.tag}</span>
            <span className="n">{c.value}</span>
            <span className="ctr-label">{c.label}</span>
            <span className="ctr-sub">{c.sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Alerts({ sess, stale, run, onResume, onFind }: { sess: Session; stale: boolean; run: SimState | null; onResume: () => void; onFind: () => void }) {
  const items: JSX.Element[] = [];
  if (sess.notice) items.push(<div key="n" className="alert info" role="status">{sess.notice}{run?.paused && run.pause?.reason.startsWith('Restored') && <button className="primary small-btn" onClick={onResume}>Resume</button>}</div>);
  else if (stale) items.push(<div key="s" className="alert warn" role="alert">Conditions changed since this plan was made, so it cannot be approved. <button className="small-btn" onClick={onFind}>Find a plan</button></div>);
  if (run?.paused && !run.pause?.reason.startsWith('Restored')) items.push(<div key="p" className="alert stop" role="alert"><b>Simulation stopped at minute {run.pause?.minute}.</b> {plain(sess.scenario, run.pause?.reason ?? '')}{run.pause?.invariant ? ` (Check failed: ${run.pause.invariant}.)` : ''}</div>);
  if (sess.lastRunNote && !sess.run) items.push(<div key="l" className="alert info">{sess.lastRunNote}</div>);
  return items.length ? <div className="alerts">{items}</div> : null;
}

// ------------------------------------------------------------------ left column

function Roster({ sess, statusOf, schedule }: { sess: Session; statusOf: (g: string) => Plainstatus; schedule: Schedule | null }) {
  const s = sess.scenario;
  const plan = sess.plan && !isPlanStale(sess) ? sess.plan : null;
  const run = sess.run?.main.state;
  return (
    <section className="card roster-card" aria-label="Residents">
      <h3>Residents</h3>
      <ul className="roster">
        {s.groups.map((g) => {
          const st = statusOf(g.id);
          const live = run?.groups[g.id];
          const j = schedule?.journeys.find((x) => x.groupId === g.id) ?? (plan?.kind === 'policy' ? plan.branches.open.journeys.find((x) => x.groupId === g.id) : undefined);
          const where = live?.status === 'arrived' ? `In ${placeName(s, live.shelter!)} since minute ${live.arrivedAt}`
            : live?.edge ? `Moving toward ${placeName(s, live.edge.to)}`
            : j && st !== 'needs-help' && st !== 'protected' ? `${st === 'waiting-inspection' ? 'If the check finds the route open: ' : ''}to ${placeName(s, j.shelter)}, leaving at minute ${j.departure}${g.escortRequired ? ' with the crew' : ''}`
            : `At ${placeName(s, live?.at ?? g.location)}`;
          return (
            <li key={g.id} className={`rrow st-${st}`}>
              <span className="rcount" aria-hidden="true">{g.count}</span>
              <span className="rname"><b>{groupName(g)}</b> <span className="muted">{plural(g.count, 'person', 'people')}{g.mobility === 'wheelchair' ? ' · ♿ wheelchair user, needs escort' : ''}</span><br /><span className="rwhere">{where}</span></span>
              <span className={`rstatus st-${st}`}><span aria-hidden="true">{STATUS_WORDS[st].icon}</span> {plan || run ? STATUS_WORDS[st].label : 'Not yet planned'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StillNeedHelp({ sess, stale }: { sess: Session; stale: boolean }) {
  const s = sess.scenario;
  const plan = sess.plan;
  if (!plan || stale) return null;
  const sets: [string, Schedule, 'confirmed' | PassageState][] = plan.kind === 'schedule' || !plan.inspection ? [['', mainSchedule(plan), plan.kind === 'schedule' ? 'confirmed' : 'confirmed']] : [[`If the ${passageName(s, plan.connection)} is blocked: `, plan.branches.blocked, 'blocked'], [`If it is open: `, plan.branches.open, 'open']];
  const items = sets.flatMap(([pre, sc, key]) => sc.unresolved.map((gid) => ({ pre, sc, key, g: s.groups.find((x) => x.id === gid)! })));
  const prot = protectionGains(s, plan.kind === 'policy' && plan.inspection ? plan.branches.blocked : mainSchedule(plan), sess.baseline?.schedule ?? null);
  return (
    <section className="card needs" aria-label="People still needing help">
      <h3>People still needing help</h3>
      {!items.length && <p className="ok">{'✓'} Everyone in this plan has a route to a suitable shelter.</p>}
      {items.map(({ pre, sc, key, g }, i) => {
        const why = whyWaiting(s, sc, g.id, plan.search).sort((a, b) => BLOCKER_ORDER.indexOf(a.code) - BLOCKER_ORDER.indexOf(b.code));
        const rr = sess.requests?.[(plan.kind === 'schedule' || !plan.inspection ? 'confirmed' : key) as 'confirmed'];
        const reqs = rr?.requests.filter((q) => q.groupId === g.id) ?? [];
        const none = rr?.none.find((n) => n.groupId === g.id);
        const p = prot.find((x) => x.g.id === g.id);
        return (
          <div key={i} className="need">
            <div className="need-head"><b>{pre}{groupName(g)}</b> <span className="muted">{plural(g.count, 'person', 'people')}{g.mobility === 'wheelchair' ? ', including a wheelchair user' : ''}</span></div>
            <ul className="why">{why.slice(0, 2).map((w, k) => <li key={k}>{w.text}</li>)}</ul>
            {p && <p className="protect"><span aria-hidden="true">{'◐'}</span> {g.count} residents gain {p.gain} minutes each below the hazard limit. They still need a route.</p>}
            {reqs.map((q, k) => (
              <div key={k} className="request">
                <div className="req-head">What would help {'·'} tested</div>
                <div className="req-grid">
                  <span>What</span><b>{q.resource === 'instructions' ? 'Departure instructions' : `${q.quantity} ${q.resource === 'places' ? (q.quantity === 1 ? 'shelter place' : 'shelter places') : (q.quantity === 1 ? 'battery' : 'batteries')}`}</b>
                  <span>Where</span><b>{placeName(s, q.location)}</b>
                  <span>By</span><b>{q.latest !== null ? `minute ${q.latest}` : q.windows.map(([a, b]) => `${a}–${b}`).join(', ')}{q.latest !== null && q.latest < s.horizon ? ` (minute ${q.latest + 1} is too late)` : ''}</b>
                  <span>For</span><b>{q.benefits.gained.map((x) => groupName(s.groups.find((y) => y.id === x)!)).join(', ')} ({plural(q.benefits.residents, 'person', 'people')})</b>
                </div>
                <details><summary>Full request</summary><p>{plain(s, q.text)}</p><p className="muted small">{plain(s, q.binding)} {q.waitNote ? plain(s, q.waitNote) : ''}</p></details>
              </div>
            ))}
            {!rr && <p className="muted small">Checking what could help…</p>}
            {none && <p className="muted small">No tested change (more batteries, shelter places or earlier instructions) gives them a route.</p>}
            {why.length > 2 && <details><summary>All reasons</summary><ul>{why.slice(2).map((w, k) => <li key={k}>{w.text}</li>)}</ul></details>}
          </div>
        );
      })}
      {items.length > 0 && <p className="muted small">Requests are tested hypotheticals to take to neighbouring crews or stewards. They reserve nothing and never count as arrivals.</p>}
    </section>
  );
}

// ------------------------------------------------------------------ right column

function PlanCard({ sess, stale, view_, run }: { sess: Session; stale: boolean; view_: ReturnType<typeof planView> | null; run: SimState | null }) {
  const s = sess.scenario;
  const plan = sess.plan;
  if (!plan || stale || !view_) {
    return (
      <section className="card plan" aria-label="Recommended plan">
        <p className="eyebrow">Recommended plan</p>
        <h2 className="headline">{stale ? 'Conditions changed — find a new plan' : 'No plan yet'}</h2>
        <p>Breathline checks every order of repairs, openings{s.knowledge.unknown ? ', inspections' : ''} and escorts the crew could do in {s.horizon} minutes, and compares the best one with doing nothing.</p>
      </section>
    );
  }
  const T = total(s);
  const m = run;
  const simLine = m?.done && sess.run ? `Simulation result: ${s.groups.filter((g) => m.groups[g.id].status === 'arrived').reduce((n, g) => n + g.count, 0)} of ${T} reached shelter; ${s.groups.filter((g) => sess.run!.baseline.state.groups[g.id].status === 'arrived').reduce((n, g) => n + g.count, 0)} without crew intervention.` : null;
  const observed = m?.knowledge.observations[0]?.state;
  return (
    <section className="card plan" aria-label="Recommended plan">
      <p className="eyebrow">Recommended plan</p>
      <h2 className="headline">{view_.headline}</h2>
      <ol className="checklist">{view_.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
      {view_.branches && (
        <div className="branches" role="group" aria-label="Both possible inspection results">
          {view_.branches.map((b) => (
            <div key={b.state} className={`branch ${observed ? (observed === b.state ? 'active' : 'inactive') : ''}`}>
              <div className="b-head"><span>{b.label}</span>{observed === b.state && <span className="b-tag">Observed</span>}</div>
              <ul>{b.steps.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <div className="b-n">Forecast if {b.state}: <b>{b.reach}</b> reach shelter</div>
            </div>
          ))}
        </div>
      )}
      <p className="benefit"><span className="tag-forecast">Forecast</span> {view_.forecast.replace(/^Forecast: /, '')}</p>
      {simLine && <p className="benefit"><span className="tag-result">Simulation result</span> {simLine.replace(/^Simulation result: /, '')}</p>}
      {view_.protection.map((p) => <p key={p.group} className="protect"><span aria-hidden="true">{'◐'}</span> {p.text}</p>)}
      {view_.notes.length > 0 && <ul className="notes">{view_.notes.slice(0, 3).map((n, i) => <li key={i} className={`note-${n.kind}`}><span className="note-tag">{n.kind === 'uncertain' ? 'Uncertain' : n.kind === 'depends' ? 'Depends on' : 'Blocker'}</span> {n.text.replace(/^Depends on /, '')}</li>)}</ul>}
      <PlanDetails sess={sess} view_={view_} />
    </section>
  );
}

function PlanDetails({ sess, view_ }: { sess: Session; view_: ReturnType<typeof planView> }) {
  const s = sess.scenario;
  const plan = sess.plan!;
  const scheds: [string, Schedule][] = plan.kind === 'schedule' ? [['', plan.schedule]] : plan.inspection ? [['If open — ', plan.branches.open], ['If blocked — ', plan.branches.blocked]] : [['', plan.branches.open]];
  return (
    <details className="plan-details">
      <summary>Plan details</summary>
      {plan.kind === 'policy' && <p className="muted small">{explainPolicy(s, plan).summary}</p>}
      {scheds.map(([pre, sc]) => {
        const ex = explainSchedule(s, sc, sess.baseline?.schedule);
        return (
          <div key={pre}>
            <h4>{pre}Timed order of work</h4>
            <ol className="steps">{ex.steps.map((x, i) => <li key={i}><span className="when">{x.start}–{x.end}</span> {x.text}</li>)}</ol>
            <h4>{pre}Resident routes</h4>
            <ul className="small">{sc.journeys.map((j) => <li key={j.groupId}>{groupName(s.groups.find((g) => g.id === j.groupId)!)}: leave {j.departure}, arrive {j.arrival} at {placeName(s, j.shelter)} — {[s.groups.find((g) => g.id === j.groupId)!.location, ...j.legs.filter((l) => l.conn).map((l) => l.to)].join(' → ')}{j.legs.some((l) => !l.conn) ? ` (waits: ${j.legs.filter((l) => !l.conn).map((l) => `${l.from} ${l.start}–${l.end}`).join(', ')})` : ''}; exposure {j.exposure} hazard-minutes per person</li>)}</ul>
            <h4>{pre}Batteries</h4>
            <ul className="small">{sc.crew.filter((a) => a.kind === 'work').map((a) => <li key={a.id}>{s.actions.find((x) => x.id === a.actionId)?.label}: {(a.batteries ?? []).map((b) => `${b.qty} from ${b.location === 'pack' ? 'the crew pack' : `delivery ${b.deliveryId} at ${b.location}`}`).join(', ') || 'none'}</li>)}<li>Used {sc.objective.batteries} of {s.crew.batteries}; crew busy {sc.objective.busy} minutes.</li></ul>
            <h4>{pre}Full explanation</h4>
            <p className="small">{ex.sentence}</p>
            {ex.deps.length > 0 && <ul className="small">{ex.deps.map((d, i) => <li key={i}>{d.text}</li>)}</ul>}
          </div>
        );
      })}
      {view_.protection.map((p) => <p key={p.group} className="small">{p.detail}</p>)}
      {plan.kind === 'policy' && (
        <table className="mini"><thead><tr><th>Response</th><th>If open</th><th>If blocked</th></tr></thead><tbody>
          <tr><td>No crew intervention</td><td>{sess.baseline?.schedule.objective.served}</td><td>{sess.baseline?.schedule.objective.served}</td></tr>
          <tr><td>Confirmed routes only</td><td>{plan.noInspection.nOpen}</td><td>{plan.noInspection.nBlocked}</td></tr>
          <tr className="sel"><td>This plan</td><td>{plan.objective.nOpen}</td><td>{plan.objective.nBlocked}</td></tr>
        </tbody></table>
      )}
      <p className="muted small">Plan {plan.id} · input revision {plan.inputRevision} · search {plan.search.status === 'exhaustive' ? 'complete within its declared scope' : plan.search.status} ({plan.search.explored} options, {plan.search.elapsedMs} ms). Hazard values are fictional planning units; the limit is {s.threshold}.</p>
    </details>
  );
}

function Confirmations({ sess, edit }: { sess: Session; edit: (t: string, f: (x: Scenario) => void) => void }) {
  const s = sess.scenario;
  const items = confirmationsFor(s, sess.plan!);
  const missing = items.filter((x) => !x.confirmed);
  const done = items.filter((x) => x.confirmed);
  if (sess.approved) return <section className="card conf ok-card" aria-label="Confirmations"><p><span aria-hidden="true">{'✓'}</span> Approved with {plural(items.length, 'confirmation')}. Places and batteries are reserved.</p></section>;
  return (
    <section className="card conf" aria-label="Required confirmations">
      <h3>{missing.length ? `Confirm before approving (${missing.length})` : `All ${items.length} confirmations received`}</h3>
      {missing.length > 0 && (
        <ul className="todo">
          {missing.map((c, i) => {
            const ins = confirmationInstruction(s, c);
            return <li key={i}><span>{ins.text} <span className="muted small">({c.source})</span></span><button onClick={() => edit(ins.editText, ins.apply)}>Mark confirmed</button></li>;
          })}
        </ul>
      )}
      {missing.length > 0 && <p className="muted small">Marking an item confirmed updates the conditions, so you will be asked to find the plan again. Residents stay in the plan meanwhile.</p>}
      <details><summary>{done.length} confirmed</summary><ul className="small doneList">{done.map((c, i) => <li key={i}>{'✓'} {confirmationInstruction(s, c).done} <span className="muted">— {c.source}</span></li>)}</ul></details>
      {sess.approvalErrors.length > 0 && <ul className="errors">{sess.approvalErrors.slice(0, 4).map((e, i) => <li key={i}>{plain(s, e)}</li>)}</ul>}
    </section>
  );
}

function NextAction({ stage, sess, busy, t, onFind, onApprove, onRun, onPause, onResults, onReset, onDiscard }: { stage: Stage; sess: Session; busy: string | null; t: number; onFind: () => void; onApprove: () => void; onRun: () => void; onPause: () => void; onResults: () => void; onReset: () => void; onDiscard: () => void }) {
  const s = sess.scenario;
  const run = sess.run?.main.state;
  const missing = sess.plan && stage === 'approve' ? confirmationsFor(s, sess.plan).filter((x) => !x.confirmed).length : 0;
  const sc = activeSchedule(sess);
  const steps = ['Find a plan', 'Confirm and approve', 'Run simulation', 'View results'];
  const idx = stage === 'find' ? 0 : stage === 'approve' ? 1 : stage === 'done' ? 3 : 2;
  const started = !!run && run.processedThrough >= 0;
  const crewText = (a: Schedule['crew'][number] | undefined) => !a ? null : a.kind === 'work' || a.kind === 'inspect' ? s.actions.find((x) => x.id === a.actionId)?.label : a.kind === 'escort' ? `Escort ${groupName(s.groups.find((g) => g.id === a.groupId)!)} to ${placeName(s, a.to)}` : a.kind === 'travel' ? `Travel to ${placeName(s, a.to)}` : `Wait at ${placeName(s, a.from)}`;
  const now = sc && started ? sc.crew.find((a) => a.start <= t && t < a.end) : undefined;
  const next = sc ? sc.crew.find((a) => a.kind !== 'travel' && a.kind !== 'wait' && a.start >= (started ? t : 0) && a !== now) : undefined;
  return (
    <section className="card next" aria-label="Next action">
      <ol className="stages" aria-label="Progress">{steps.map((x, i) => <li key={x} className={i < idx ? 'past' : i === idx ? 'now' : ''} aria-current={i === idx ? 'step' : undefined}>{x}</li>)}</ol>
      {stage === 'find' && <button className="cta" onClick={onFind} disabled={!!busy}>{busy ?? 'Find a plan'}</button>}
      {stage === 'approve' && <>
        <button className="cta" onClick={onApprove} disabled={missing > 0}>Approve plan</button>
        {missing > 0 && <p className="cta-note">Confirm the {plural(missing, 'item')} above first.</p>}
        <button className="link" onClick={onFind} disabled={!!busy}>{busy ?? 'Find the plan again'}</button>
      </>}
      {(stage === 'run' || stage === 'restored') && <>
        <button className="cta" onClick={onRun}>{stage === 'restored' ? 'Resume simulation' : started ? 'Continue simulation' : 'Run simulation'}</button>
        <div className="row">{!started && <button className="link" onClick={onDiscard}>Withdraw approval</button>}{started && <button className="link" onClick={onReset}>Run again from the start</button>}</div>
      </>}
      {stage === 'running' && <button className="cta pause" onClick={onPause}>{'⏸'} Pause</button>}
      {stage === 'stopped' && <>
        <button className="cta" onClick={onResults}>See what happened so far</button>
        <button className="link" onClick={onReset}>Run again from the start</button>
      </>}
      {stage === 'done' && <>
        <button className="cta" onClick={onResults}>View results</button>
        <button className="link" onClick={onReset}>Run again from the start</button>
      </>}
      {sess.run && (
        <div className="progress">
          <div className="minute">Minute <b>{started ? t : 0}</b> of {s.horizon}</div>
          <div className="ticks" aria-hidden="true">{Array.from({ length: s.horizon + 1 }, (_, i) => <span key={i} className={started && i <= t ? 'on' : ''} />)}</div>
          {stage !== 'done' && <div className="crew-now"><b>Crew now:</b> {now ? crewText(now) : run?.done ? 'finished' : started ? 'idle' : 'at the start'}{next && <><br /><b>Next:</b> {crewText(next)} (minute {next.start})</>}</div>}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ results

function Results({ sess, innerRef, statusOf }: { sess: Session; innerRef: MutableRefObject<HTMLElement | null>; statusOf: (g: string) => Plainstatus }) {
  const s = sess.scenario;
  const r = sess.run!;
  const done = r.main.state.done && r.baseline.state.done;
  const sc = activeSchedule(sess);
  const rows = useMemo(() => (done && sc ? groupBenefits(s, sc, r.baseline.state, r.main.state) : null), [done, sc, r, s]);
  const slots = [r.main, r.baseline, ...(r.comparison ? [r.comparison] : [])];
  return (
    <section className="results" ref={innerRef} tabIndex={-1} aria-label="Results" id="results">
      <h2>{done ? 'Simulation result' : `Simulation in progress — minute ${Math.max(0, r.main.state.processedThrough)}`}</h2>
      {!done && <p className="muted">The plan, the no-intervention comparison{r.comparison ? ` and “${r.comparison.label.toLowerCase()}”` : ''} run side by side from the same start, each with its own resources.</p>}
      <div className="result-groups">
        {s.groups.map((g) => {
          const st = statusOf(g.id);
          const row = rows?.find((x) => x.groupId === g.id);
          return (
            <div key={g.id} className={`rg st-${st}`}>
              <div className="rg-head"><b>{groupName(g)}</b> <span className="muted">{plural(g.count, 'person', 'people')}</span> <span className={`rstatus st-${st}`}>{STATUS_WORDS[st].icon} {STATUS_WORDS[st].label}</span></div>
              {row && <p>{row.protectedGain ? `${row.provided.split(' \u2014 ')[0]}: ${g.count} residents gain ${row.protectedGain.perPerson} minutes each below the hazard limit. They still need a route.` : words(plain(s, row.provided))}</p>}
              {row && <p className="muted small">Without crew intervention: {words(row.baseline)}. With this plan: {words(row.response)}.{row.waitingExposure !== null ? ` Exposure while waiting ${Math.round(row.waitingExposure)}, while travelling ${Math.round(row.travelExposure ?? 0)} hazard-minutes per person.` : ''}{row.protectedGain ? ` Below the limit until minute ${r.main.state.groups[g.id].protected} instead of ${r.baseline.state.groups[g.id].protected}; ${row.protectedGain.personMinutes} person-minutes in total. Not counted as arrivals.` : ''}</p>}
            </div>
          );
        })}
      </div>
      <table className="mini"><thead><tr><th>Run (same start)</th><th>Reached shelter</th><th>Last arrival</th><th>Batteries used</th></tr></thead><tbody>
        {slots.map((x) => {
          const st = x.state;
          const arrived = s.groups.filter((g) => st.groups[g.id].status === 'arrived');
          return <tr key={x.label}><td>{x.label === 'Response' ? 'This plan' : x.label}</td><td>{arrived.reduce((n, g) => n + g.count, 0)} ({arrived.map((g) => groupName(g)).join(', ') || 'nobody'})</td><td>{arrived.length ? `minute ${Math.max(...arrived.map((g) => st.groups[g.id].arrivedAt!))}` : '—'}</td><td>{Object.values(st.ledger.locs).reduce((n, q) => n + q.consumed, 0)}</td></tr>;
        })}
      </tbody></table>
    </section>
  );
}

// ------------------------------------------------------------------ conditions (secondary, operations)

function NumEdit({ label, value, min, max, onSet }: { label: string; value: number; min: number; max: number; onSet: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= min && n <= max;
  return (
    <label className="numedit"><span>{label}</span>
      <input type="number" value={v} min={min} max={max} onChange={(e) => setV(e.target.value)} aria-invalid={!ok} />
      <button onClick={() => ok && n !== value && onSet(n)} disabled={!ok || n === value}>Set</button>
      {!ok && <span className="err">{min}–{max}</span>}
    </label>
  );
}

function Setup({ sess, edit }: { sess: Session; edit: (t: string, f: (s: Scenario) => void) => void }) {
  const s = sess.scenario;
  const [conn, setConn] = useState(s.connections[0].id);
  const c = s.connections.find((x) => x.id === conn) ?? s.connections[0];
  const repair = s.actions.find((a) => a.kind === 'repair');
  const gate = s.actions.find((a) => a.kind === 'open' && a.offered);
  const insp = s.actions.find((a) => a.kind === 'inspect');
  const vent = s.actions.find((a) => a.kind === 'ventilate');
  const [dv, setDv] = useState({ resource: 'batteries', quantity: 4, location: 'G', minute: 14, source: 'Neighbouring crew', confirmed: true });
  const hz = (id: string) => s.locations.find((l) => l.id === id)!;
  return (
    <div className="setup-grid">
      <fieldset><legend>Crew and equipment</legend>
        <NumEdit label="Batteries in crew pack" value={s.crew.batteries} min={0} max={12} onSet={(n) => edit(`battery pack ${s.crew.batteries} → ${n}`, (x) => { x.crew.batteries = n; })} />
        {repair && <NumEdit label={`${repair.label}: minutes`} value={repair.duration} min={1} max={15} onSet={(n) => edit(`${repair.label} takes ${n} min`, (x) => { x.actions.find((a) => a.id === repair.id)!.duration = n; })} />}
        {repair && <NumEdit label={`${repair.label}: batteries`} value={repair.batteries} min={0} max={8} onSet={(n) => edit(`${repair.label} needs ${n} batteries`, (x) => { x.actions.find((a) => a.id === repair.id)!.batteries = n; })} />}
        {gate && <NumEdit label={`${gate.label}: batteries`} value={gate.batteries} min={0} max={8} onSet={(n) => edit(`${gate.label} needs ${n} batteries`, (x) => { x.actions.find((a) => a.id === gate.id)!.batteries = n; })} />}
        {insp?.offered && <NumEdit label="Inspection minutes" value={insp.duration} min={1} max={15} onSet={(n) => edit(`inspection takes ${insp.duration} → ${n} min`, (x) => { x.actions.find((a) => a.id === insp.id)!.duration = n; })} />}
        {vent && <label className="numedit"><span>Temporary ventilation available</span><input type="checkbox" checked={vent.offered} onChange={(e) => edit(`temporary ventilation ${e.target.checked ? 'available' : 'not available'}`, (x) => { x.actions.find((a) => a.id === vent.id)!.offered = e.target.checked; })} /></label>}
        {vent?.offered && <NumEdit label="Ventilation: batteries" value={vent.batteries} min={0} max={8} onSet={(n) => edit(`ventilation needs ${n} batteries`, (x) => { x.actions.find((a) => a.id === vent.id)!.batteries = n; })} />}
        {vent?.offered && <NumEdit label="Ventilation: minutes" value={vent.duration} min={1} max={10} onSet={(n) => edit(`ventilation takes ${n} min`, (x) => { x.actions.find((a) => a.id === vent.id)!.duration = n; })} />}
        {vent?.offered && <NumEdit label="Hazard growth after ventilation" value={(vent.effect as { rate: number }).rate} min={0} max={20} onSet={(n) => edit(`protected growth ${n}/min`, (x) => { (x.actions.find((a) => a.id === vent.id)!.effect as { rate: number }).rate = n; })} />}
      </fieldset>
      <fieldset><legend>Hazards (planning units; limit {s.threshold})</legend>
        {['RA', 'J3'].filter((id) => s.locations.some((l) => l.id === id)).map((id) => (
          <div key={id}>
            <NumEdit label={`${placeName(s, id)}: hazard now`} value={hz(id).hazard.initial} min={0} max={99} onSet={(n) => edit(`${placeName(s, id)} hazard ${n}`, (x) => { x.locations.find((l) => l.id === id)!.hazard.initial = n; })} />
            <NumEdit label={`${placeName(s, id)}: growth per minute`} value={hz(id).hazard.rate} min={0} max={40} onSet={(n) => edit(`${placeName(s, id)} growth ${n}/min`, (x) => { x.locations.find((l) => l.id === id)!.hazard.rate = n; })} />
          </div>
        ))}
        {repair && <NumEdit label="Vent corridor growth after repair" value={(repair.effect as { rate: number }).rate} min={0} max={40} onSet={(n) => edit(`growth after repair ${n}/min`, (x) => { (x.actions.find((a) => a.id === repair.id)!.effect as { rate: number }).rate = n; })} />}
      </fieldset>
      <fieldset><legend>Shelters</legend>
        {s.shelters.map((sh) => <NumEdit key={sh.location} label={`${sh.name}: places`} value={sh.places} min={0} max={30} onSet={(n) => edit(`${sh.name} places ${sh.places} → ${n}`, (x) => { x.shelters.find((y) => y.location === sh.location)!.places = n; })} />)}
        {s.shelters.map((sh) => (Object.keys(sh.checklist) as (keyof ShelterChecklist)[]).map((k) => (
          <label key={sh.location + k} className="numedit"><span>{sh.name}: {CHECK_LABEL[k]}</span>
            <select value={sh.checklist[k]} onChange={(e) => edit(`${sh.name} ${CHECK_LABEL[k]}: ${e.target.value === 'present' ? 'confirmed' : e.target.value === 'absent' ? 'not available' : 'not confirmed'}`, (x) => { x.shelters.find((y) => y.location === sh.location)!.checklist[k] = e.target.value as ChecklistState; })}>
              <option value="present">confirmed</option><option value="absent">not available</option><option value="unconfirmed">not confirmed yet</option>
            </select>
          </label>
        )))}
      </fieldset>
      <fieldset><legend>Travel times and instructions</legend>
        <label className="numedit"><span>Passage</span><select value={conn} onChange={(e) => setConn(e.target.value)}>{s.connections.map((x) => <option key={x.id} value={x.id}>{passageName(s, x.id)} ({x.minutes} min)</option>)}</select></label>
        <NumEdit label="Minutes to cross" value={c.minutes} min={1} max={20} onSet={(n) => edit(`${passageName(s, c.id)} takes ${c.minutes} → ${n} min`, (x) => { x.connections.find((y) => y.id === c.id)!.minutes = n; })} />
        {s.groups.map((g) => <NumEdit key={g.id} label={`${groupName(g)}: instructions available at minute`} value={g.instructionsAvailableAt} min={0} max={20} onSet={(n) => edit(`${groupName(g)} instructions at minute ${n}`, (x) => { x.groups.find((y) => y.id === g.id)!.instructionsAvailableAt = n; })} />)}
      </fieldset>
      <fieldset><legend>Expected deliveries (confirmed by their source)</legend>
        <ul>{s.deliveries.map((d) => <li key={d.id}>{d.quantity} {d.resource} to {placeName(s, d.location)} by minute {d.minute} — {d.source} {d.confirmed ? '(confirmed)' : '(not confirmed: not used in plans)'} <button onClick={() => edit(`delivery ${d.id} removed`, (x) => { x.deliveries = x.deliveries.filter((y) => y.id !== d.id); })}>Remove</button></li>)}</ul>
        <div className="delivery-form">
          <select value={dv.resource} onChange={(e) => setDv({ ...dv, resource: e.target.value })} aria-label="resource"><option value="batteries">batteries</option><option value="places">shelter places</option></select>
          <input type="number" value={dv.quantity} min={1} max={12} onChange={(e) => setDv({ ...dv, quantity: Number(e.target.value) })} aria-label="quantity" />
          <select value={dv.location} onChange={(e) => setDv({ ...dv, location: e.target.value })} aria-label="where">{s.locations.map((l) => <option key={l.id} value={l.id}>{placeName(s, l.id)}</option>)}</select>
          <label>by minute <input type="number" value={dv.minute} min={0} max={s.horizon} onChange={(e) => setDv({ ...dv, minute: Number(e.target.value) })} /></label>
          <input value={dv.source} onChange={(e) => setDv({ ...dv, source: e.target.value })} aria-label="source" />
          <label><input type="checkbox" checked={dv.confirmed} onChange={(e) => setDv({ ...dv, confirmed: e.target.checked })} /> confirmed</label>
          <button onClick={() => edit(`expected delivery: ${dv.quantity} ${dv.resource} to ${placeName(s, dv.location)} by minute ${dv.minute}`, (x) => { x.deliveries.push({ id: `dlv-${x.deliveries.length + 1}-${dv.location}-${dv.minute}`, resource: dv.resource as 'batteries', quantity: dv.quantity, location: dv.location, minute: dv.minute, source: dv.source, confirmed: dv.confirmed }); })} disabled={!(dv.quantity >= 1 && dv.minute >= 0 && dv.minute <= s.horizon)}>Record</button>
        </div>
      </fieldset>
    </div>
  );
}

function Reports({ sess, edit }: { sess: Session; edit: (t: string, f: (s: Scenario) => void) => void }) {
  const s = sess.scenario;
  const [places, setPlaces] = useState<Record<string, number>>({});
  return (
    <div className="reports">
      <h3>Steward and representative confirmations</h3>
      {s.shelters.map((sh) => (
        <div key={sh.location} className="row">
          <label>{sh.steward} reports places: <input type="number" min={0} max={30} value={places[sh.location] ?? sh.places} onChange={(e) => setPlaces({ ...places, [sh.location]: Number(e.target.value) })} /></label>
          <button onClick={() => { const n = places[sh.location] ?? sh.places; edit(n === sh.places ? `${sh.name} places reconfirmed (${n})` : `${sh.steward} reports ${n} places instead of ${sh.places}`, (x) => { const y = x.shelters.find((z) => z.location === sh.location)!; y.places = n; y.placesConfirmed = true; const r = x.reports.find((z) => z.target === `${sh.name} places`); if (r) { r.value = String(n); r.state = 'confirmed'; } }); }}>Record</button>
          <label><input type="checkbox" checked={sh.placesConfirmed} onChange={(e) => edit(`${sh.name} places ${e.target.checked ? 'confirmed' : 'not confirmed'}`, (x) => { x.shelters.find((z) => z.location === sh.location)!.placesConfirmed = e.target.checked; })} /> places confirmed</label>
        </div>
      ))}
      {s.groups.map((g) => <label key={g.id} className="row"><input type="checkbox" checked={!!s.instructionsConfirmed[g.id]} onChange={(e) => edit(`${groupName(g)} instructions ${e.target.checked ? 'acknowledged' : 'not acknowledged'}`, (x) => { x.instructionsConfirmed[g.id] = e.target.checked; })} /> {groupName(g)} representative acknowledged departure instructions (available by minute {g.instructionsAvailableAt})</label>)}
      <details><summary>All reports ({s.reports.length})</summary>
        <table className="mini"><thead><tr><th>About</th><th>Reported</th><th>When</th><th>Source</th><th>State</th></tr></thead><tbody>
          {s.reports.map((r) => <tr key={r.id}><td>{plain(s, r.target)}</td><td>{plain(s, r.value)}</td><td>{r.observedAt <= 0 ? `${-r.observedAt} min before the crisis` : `minute ${r.observedAt}`}</td><td>{r.source}</td><td>{r.state}</td></tr>)}
        </tbody></table>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ demo & testing view

function DemoView(p: {
  sess: Session; setSess: (f: (x: Session) => Session) => void; switchScenario: (id: string) => void; mapEl: JSX.Element; t: number; playing: boolean; setPlaying: (b: boolean) => void;
  speed: number; setSpeed: (n: number) => void; stress: { rows: StressRow[]; recomputed: Record<string, string> } | null; setStress: (x: { rows: StressRow[]; recomputed: Record<string, string> } | null) => void;
  onStep: () => void; onReset: () => void; onResetSession: () => void;
}) {
  const { sess } = p;
  const s = sess.scenario;
  const run = sess.run?.main.state;
  return (
    <main className="demo">
      <p className="demo-intro">Tools for demonstrations, testing and review. Nothing here is needed to run an operation. The hidden simulator conditions below are never passed to the planner.</p>
      <section className="panel open"><h3>Scenario</h3>
        <div className="scen-list">{Object.keys(SCENARIO_BUILDERS).map((id) => <button key={id} className={id === sess.scenarioId ? 'on' : ''} onClick={() => p.switchScenario(id)}><b>{id}</b> {getScenario(id).title}</button>)}</div>
        <button className="ghost" onClick={p.onResetSession}>Reset this session</button>
      </section>
      <Controller sess={sess} setSess={p.setSess} />
      <section className="panel open"><h3>Playback</h3>
        <div className="row">
          <span>Minute <b>{run && run.processedThrough >= 0 ? p.t : 0}</b> of {s.horizon}</span>
          <button onClick={() => p.setPlaying(!p.playing)} disabled={!run || run.done || (run.paused && !run.pause?.reason.startsWith('Restored'))}>{p.playing ? 'Pause' : 'Play'}</button>
          <button onClick={p.onStep} disabled={!run || run.done || run.paused}>Step 1 minute</button>
          <button onClick={p.onReset} disabled={!run}>Reset run</button>
          <label>Speed <select value={p.speed} onChange={(e) => p.setSpeed(Number(e.target.value))}><option value={1200}>slow</option><option value={700}>normal</option><option value={250}>fast</option></select></label>
        </div>
        {!run && <p className="muted small">Approve a plan in Operations to enable playback.</p>}
        {p.mapEl}
      </section>
      <Stress sess={sess} stress={p.stress} setStress={p.setStress} />
      <Diagnostics sess={sess} />
      <Evidence sess={sess} />
      <Events run={run ?? null} />
      <Exposure sess={sess} />
      <details className="panel"><summary>Assumptions and limits</summary><ul>{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul><p className="muted small">Not modeled: medical outcomes, shelter habitability beyond minute {s.horizon}, adversarial reports, changing hidden conditions, unreliable inspection, actual radio delivery, sensor calibration, control over Directorate infrastructure.</p></details>
    </main>
  );
}

function Controller({ sess, setSess }: { sess: Session; setSess: (f: (x: Session) => Session) => void }) {
  const s = sess.scenario;
  const started = !!sess.run && sess.run.main.state.processedThrough >= 0;
  return (
    <section className="panel open"><h3>Hidden simulator conditions (never passed to the planner)</h3>
      {!s.knowledge.unknown && !s.deliveries.some((d) => d.confirmed) && <p className="muted small">This scenario has no hidden passage state or expected deliveries.</p>}
      {s.knowledge.unknown && (
        <label className="row">Actual state of the {passageName(s, s.knowledge.unknown.connection)}:
          <select id="truth-bypass" value={sess.truth.bypass} disabled={started} onChange={(e) => { const v = e.target.value; setSess((x) => ({ ...x, truth: { ...x.truth, bypass: v }, run: null, approved: null, notice: 'Hidden condition changed before the simulation. The plan is unchanged (the planner never sees it); approve again to run.' })); }}>
            <option value="open">open</option><option value="blocked">blocked</option><option value="partially-collapsed">something unexpected</option>
          </select>
        </label>
      )}
      {s.deliveries.filter((d) => d.confirmed).map((d) => (
        <label key={d.id} className="row">Actual arrival of {d.quantity} {d.resource} at {placeName(s, d.location)} (confirmed for minute {d.minute}):
          <select disabled={started} value={String(sess.truth.deliveries[d.id] === undefined ? d.minute : sess.truth.deliveries[d.id])} onChange={(e) => { const v = e.target.value === 'never' ? null : Number(e.target.value); setSess((x) => ({ ...x, truth: { ...x.truth, deliveries: { ...x.truth.deliveries, [d.id]: v } }, run: null, approved: null })); }}>
            <option value={d.minute}>on time</option><option value={d.minute + 1}>1 minute late</option><option value={d.minute + 3}>3 minutes late</option><option value="never">never arrives</option>
          </select>
        </label>
      ))}
      {started && <p className="muted small">Locked while a simulation is running.</p>}
    </section>
  );
}

function Stress({ sess, stress, setStress }: { sess: Session; stress: { rows: StressRow[]; recomputed: Record<string, string> } | null; setStress: (x: { rows: StressRow[]; recomputed: Record<string, string> } | null) => void }) {
  const s = sess.scenario;
  const plan = sess.plan;
  const sc = plan && !isPlanStale(sess) && plan.kind === 'schedule' ? plan.schedule : null;
  return (
    <details className="panel"><summary>Stress tests: does the selected plan survive delays and faster hazards?</summary>
      {!sc && <p className="muted">{plan && plan.kind === 'policy' ? 'For the uncertain-passage case, both inspection results are the evaluation axis: run each with the hidden condition above.' : 'Find a plan first.'}</p>}
      {sc && <button onClick={() => setStress({ rows: stressSelected(s, sc), recomputed: {} })}>Test the plan under {STRESS_VARIANTS.length} variants</button>}
      {stress && sc && (
        <table className="mini"><thead><tr><th>Extra repair minutes × hazard growth</th><th>Still feasible</th><th>What fails</th><th>Best plan under these conditions</th></tr></thead><tbody>
          {stress.rows.map((r) => <tr key={r.variant.id} className={r.failedGroups.length ? 'fail' : ''}><td>{r.variant.id}</td><td>{r.residentsFeasible} ({r.feasibleGroups.map((g) => groupName(s.groups.find((x) => x.id === g)!)).join(', ') || 'nobody'})</td><td>{r.failedGroups.map((f) => `${groupName(s.groups.find((x) => x.id === f.group)!)}: ${plain(s, f.constraints[0])}`).join('; ') || '—'}{r.note ? ` ${r.note}` : ''}</td>
            <td>{stress.recomputed[r.variant.id] ?? <button onClick={() => { const p = recomputeUnder(s, r.variant) as AnyPlan; const o = mainSchedule(p); setStress({ ...stress, recomputed: { ...stress.recomputed, [r.variant.id]: `${o.objective.served} residents: ${o.tasks.map((id) => s.actions.find((a) => a.id === id)?.label ?? `escort ${groupName(s.groups.find((g) => `escort-${g.id}` === id)!)}`).join(' → ') || 'no work'} (${p.search.status})` } }); }}>Recompute</button>}</td></tr>)}
        </tbody></table>
      )}
      <p className="muted small">Order of work, routes and shelters are kept; later tasks are pushed back; the result is rechecked. Eight cases describe only those eight cases — not a probability.</p>
    </details>
  );
}

function Exposure({ sess }: { sess: Session }) {
  const s = sess.scenario;
  const sc = activeSchedule(sess);
  const run = sess.run;
  if (!sc || isPlanStale(sess)) return null;
  return (
    <details className="panel"><summary>Exposure detail (hazard-index minutes per person)</summary>
      <table className="mini"><thead><tr><th>Group</th><th>Forecast: waiting / travel / total</th><th>This plan (so far)</th><th>Without crew</th></tr></thead><tbody>
        {s.groups.map((g) => { const j = sc.journeys.find((x) => x.groupId === g.id); const m = run?.main.state.groups[g.id]; const b = run?.baseline.state.groups[g.id]; return <tr key={g.id}><td>{groupName(g)} ({g.count})</td><td>{j ? `${j.waitingExposure} / ${j.travelExposure} / ${j.exposure}` : `still waiting: ${sc.exposureUnresolved[g.id]} over ${s.horizon} minutes`}</td><td>{m ? Math.round(m.exposure) : '—'}</td><td>{b ? Math.round(b.exposure) : '—'}</td></tr>; })}
      </tbody></table>
      <p className="muted small">Different runs serve different people, so compare group by group rather than adding totals.</p>
    </details>
  );
}

function Events({ run }: { run: SimState | null }) {
  if (!run) return null;
  return (
    <details className="panel"><summary>Event log ({run.events.length} events; {run.invariantChecks} automatic checks; {run.violations.length} violations)</summary>
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
    <details className="panel"><summary>Search diagnostics</summary>
      <ul>
        <li>Status: <b>{p.search.status}</b> — {p.search.status === 'exhaustive' ? 'every option in the declared scope was evaluated.' : p.search.status === 'proven-infeasible' ? 'no feasible assignment exists within the declared model.' : 'the search stopped at its limit; this is the best found, not a proof.'}</li>
        <li>Options evaluated: {p.search.explored}; joint assignment searches: {p.search.assignments}; {p.search.elapsedMs} ms; budget {p.search.budget.maxPlans} options / {p.search.budget.timeLimitMs} ms.</li>
        <li>Groups served in at least one evaluated option: {p.search.groupsEverServed.join(', ') || 'none'}.</li>
        <li>Input hash <code>{p.inputHash}</code>, input revision {p.inputRevision}{p.kind === 'policy' ? `; planner knowledge: ${sess.scenario.knowledge.unknown?.connection} unknown (open | blocked)` : ''}.</li>
      </ul>
      <h4>Declared search scope</h4><ul>{p.search.scope.map((x) => <li key={x}>{x}</li>)}</ul>
    </details>
  );
}

function Evidence({ sess }: { sess: Session }) {
  const ev = evidenceSummary as { buildId?: string; generatedAt?: string; command?: string; summary?: { passed: number; failed: number; notRun: number; total: number }; criteria?: { criterion: string; weight: number; checks: { id: string; name: string; status: string; observed: string }[] }[] };
  return (
    <details className="panel"><summary>Evidence: rubric criteria and recorded checks</summary>
      {ev.criteria ? (<>
        <p className="muted small">From <code>{ev.command}</code> ({ev.generatedAt}, build {ev.buildId}): {ev.summary?.passed} passed, {ev.summary?.failed} failed, {ev.summary?.notRun} not run. Recorded outputs, not a score.</p>
        <table className="mini"><thead><tr><th>Criterion</th><th>Weight</th><th>Supporting checks</th></tr></thead><tbody>
          {ev.criteria.map((c) => <tr key={c.criterion}><td>{c.criterion}</td><td>{c.weight}</td><td>{c.checks.map((x) => <span key={x.id} className={`evchip ${x.status === 'passed' ? 'ok' : x.status === 'failed' ? 'bad' : 'nr'}`} title={`${x.name}: ${x.observed}`}>{x.id} · {x.status === 'passed' ? 'observed' : x.status}</span>)}</td></tr>)}
        </tbody></table>
      </>) : <p>Not yet verified: run <code>npm run evidence</code> and rebuild.</p>}
      <h4>This session</h4>
      <ul>{sess.observations.map((o, i) => <li key={i}>{o.text}</li>)}{!sess.observations.length && <li className="muted">No completed runs in this session yet.</li>}</ul>
    </details>
  );
}
