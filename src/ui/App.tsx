import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import type { AnyPlan, ChecklistState, PassageState, Scenario, Schedule, ShelterChecklist } from '../engine/types';
import { getScenario, SCENARIO_BUILDERS } from '../engine/scenarios';
import { explainPolicy, explainSchedule } from '../engine/explain';
import { confirmationsFor } from '../engine/approval';
import { groupBenefits } from '../engine/benefit';
import { stressSelected, recomputeUnder, STRESS_VARIANTS, type StressRow } from '../engine/stress';
import { buildExport, ASSUMPTIONS, BUILD_ID } from '../engine/exportRun';
import { CHECK_LABEL } from '../engine/common';
import type { SimState } from '../engine/simulate';
import { liveNodeHazard } from '../engine/simulate';
import { baseWorld, nodeHazard } from '../engine/world';
import { focusOn, Legend, MapView, zoomAbout, type Camera, type Layers } from './MapView';
import { Backdrop } from './Backdrop';
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
type SheetId = 'help' | 'results' | 'conditions' | 'dispatch' | null;

/** Everyday words for the engine's status vocabulary. */
const words = (x: string) => x.replace(/Unresolved — location reached the threshold/g, 'Still waiting; the hazard limit was reached at their location').replace(/\bUnresolved\b/g, 'Still waiting').replace(/below threshold/g, 'below the hazard limit').replace(/\bthreshold\b/g, 'hazard limit');

const BLOCKER_ORDER = ['unsuitable-shelter', 'missing-resources', 'shelter-shortage', 'instructions', 'threshold-at-arrival', 'unsafe-waiting', 'horizon', 'no-route', 'unknown-passage', 'inaccessible-stairs', 'missing-escort', 'displaced'];
const MOBILE_BELOW = 1050;

/** Plain description of one crew activity. */
function crewText(s: Scenario, a: Schedule['crew'][number] | undefined): string | null {
  if (!a) return null;
  if (a.kind === 'work' || a.kind === 'inspect') return s.actions.find((x) => x.id === a.actionId)?.label ?? 'Work';
  if (a.kind === 'escort') return `Escort ${groupName(s.groups.find((g) => g.id === a.groupId)!)} to ${placeName(s, a.to)}`;
  if (a.kind === 'travel') return `Travel to ${placeName(s, a.to)}`;
  return `Wait at ${placeName(s, a.from)}`;
}

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return vp;
}

export default function App() {
  const [sess, setSess] = useState<Session>(() => loadSession() ?? newSession('A'));
  const [view, setView] = useState<View>('ops');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [showKey, setShowKey] = useState(false);
  const [stress, setStress] = useState<{ rows: StressRow[]; recomputed: Record<string, string> } | null>(null);
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const [layers, setLayers] = useState<Layers>({ routes: true, hazards: true, labels: true, times: false });
  const [selected, setSelected] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const vp = useViewport();
  const mobile = vp.w < MOBILE_BELOW;
  // side panel widths; the map is fitted into the space between them, above the time bar
  const lw = vp.w >= 1800 ? 360 : vp.w >= 1600 ? 340 : vp.w >= 1360 ? 312 : 292, rw = vp.w >= 1800 ? 420 : vp.w >= 1600 ? 396 : vp.w >= 1360 ? 368 : 344;
  const [tbh, setTbh] = useState(108); // measured time bar height; the map and overlays sit above it
  const tbRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = tbRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setTbh(Math.round(el.getBoundingClientRect().height) || 108));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const insets = mobile ? { left: 8, right: 8, top: 8, bottom: vp.w < 520 ? 100 : 56 } : { left: lw + 30, right: rw + 30, top: 86, bottom: tbh + 74 };

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
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSheet(null); setSelected(null); } };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const s = sess.scenario;
  const plan = sess.plan;
  const stale = isPlanStale(sess);
  const run = sess.run?.main.state ?? null;
  const started = !!run && run.processedThrough >= 0;
  const t = run ? Math.max(0, run.processedThrough) : 0;
  const schedule = stale ? null : activeSchedule(sess);
  const view_ = useMemo(() => (plan && !stale ? planView(s, plan, sess.baseline) : null), [plan, stale, s, sess.baseline]);
  const restoredPause = !!run?.paused && !!run.pause?.reason.startsWith('Restored');
  const ops = view === 'ops';

  const stage: Stage = !plan || stale ? 'find' : !sess.run ? 'approve' : run!.done ? 'done' : playing ? 'running' : run!.paused ? (restoredPause ? 'restored' : 'stopped') : 'run';

  // plain status for each group, from live state when running, else from the plan
  const statusOf = (gid: string): Plainstatus => {
    const prot = plan && !stale ? protectionGains(s, plan.kind === 'policy' && plan.inspection ? plan.branches.blocked : mainSchedule(plan), sess.baseline?.schedule ?? null).some((x) => x.g.id === gid) : false;
    if (run) {
      const g = run.groups[gid];
      if (!g) return 'needs-help';
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
  const switchScenario = (id: string) => { setPlaying(false); setStress(null); setSelected(null); setCam({ x: 0, y: 0, k: 1 }); setSheet((x) => (x === 'results' || x === 'dispatch' ? null : x)); setSess(newSession(id)); };
  const edit = (text: string, f: (x: Scenario) => void) => { setPlaying(false); setStress(null); setSess((x) => applyEdit(x, text, f)); };
  const runPlay = () => { if (run?.paused && restoredPause) setSess((x) => ({ ...resumeRun(x), notice: null })); setSheet((x) => (x === 'results' ? null : x)); setPlaying(true); };
  const resetRun_ = () => { setPlaying(false); setSheet((x) => (x === 'results' ? null : x)); setSess((x) => resetRun(x)); };
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const viewResults = () => {
    setView('ops'); setSheet('results');
    setTimeout(() => { resultsRef.current?.focus(); if (mobile) resultsRef.current?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }, 40);
  };
  const toggleSheet = (x: Exclude<SheetId, null>) => { if (x !== 'help') setView('ops'); setSheet((cur) => (cur === x ? null : x)); };
  const closeHelp = () => { setSheet(null); try { localStorage.setItem('breathline.onboarded', '1'); } catch { /* ignore */ } };
  const locate = (id: string) => {
    setSelected(id);
    const xy = pointOf(s, run, id, t);
    if (xy) setCam((c) => focusOn(c, xy[0], xy[1]));
  };

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

  const conditional = !!(plan && !stale && plan.kind === 'policy' && plan.inspection && !run?.knowledge.observations.length);
  const appStyle = { '--lw': `${lw}px`, '--rw': `${rw}px`, '--tbh': `${tbh}px` } as CSSProperties;

  return (
    <div className={`app immersive${mobile ? ' is-mobile' : ''}${ops ? ' view-ops' : ' view-demo'}`} style={appStyle}>
      <div className="scene-layer">
        <Backdrop />
        <MapView s={s} plan={stale ? null : plan} schedule={schedule} approved={!!sess.approved} run={run} t={t} statusOf={statusOf}
          cam={cam} setCam={setCam} layers={layers} insets={insets} selected={selected} onSelect={setSelected} />
        <MapTools cam={cam} setCam={setCam} layers={layers} setLayers={setLayers} showKey={showKey} setShowKey={setShowKey} />
        {showKey && <Legend s={s} conditional={conditional} />}
      </div>

      <header className="topbar">
        <div className="brand">
          <h1><span className="brand-ring" aria-hidden="true" /><span className="brand-name">Breathline</span></h1>
          <span className="brand-sub">Rescue planner</span>
        </div>
        <div className="banner" role="note" title="Illustrative conditions and assumptions"><span className="dot" aria-hidden="true" /> Simulation<span className="sr-only"> — illustrative conditions and assumptions</span></div>
        <nav className="views" role="tablist" aria-label="Views">
          <button role="tab" aria-selected={ops} className={ops ? 'on' : ''} onClick={() => setView('ops')}>Operations</button>
          <button role="tab" aria-selected={!ops} className={!ops ? 'on' : ''} onClick={() => { setView('demo'); setSheet((x) => (x === 'help' ? x : null)); }}>Demo &amp; testing</button>
        </nav>
        <div className="secondary-actions" aria-label="More actions">
          <button className={`ghost${sheet === 'conditions' ? ' on' : ''}`} onClick={() => toggleSheet('conditions')} aria-expanded={sheet === 'conditions'}>Conditions</button>
          {sess.run && <button className={`ghost${sheet === 'results' ? ' on' : ''}`} onClick={() => toggleSheet('results')} aria-expanded={sheet === 'results'}>Results</button>}
          <details className="menu">
            <summary>More</summary>
            <div className="menu-pop">
              <button className="ghost" onClick={() => toggleSheet('dispatch')} disabled={!plan || stale}>Dispatch sheet</button>
              <button className="ghost" onClick={() => window.print()} disabled={!plan || stale}>Print dispatch</button>
              <button className="ghost" onClick={exportJson} disabled={!sess.run}>Export</button>
              <button className="ghost" onClick={copyJson} disabled={!sess.run}>Copy record</button>
            </div>
          </details>
          <button className={`ghost help-btn${sheet === 'help' ? ' on' : ''}`} onClick={() => (sheet === 'help' ? closeHelp() : setSheet('help'))} aria-expanded={sheet === 'help'} aria-label="How it works" title="How it works">?</button>
        </div>
      </header>

      <div className="center-stack">
        <Alerts sess={sess} stale={stale} run={run} onResume={() => setSess((x) => ({ ...resumeRun(x), notice: null }))} onFind={doCompute} />
        {copied && <div className="alerts"><div className="alert info" role="status">{copied}</div></div>}
        {sheet === 'help' && <Sheet title="How Breathline is used" onClose={closeHelp}><Help onClose={closeHelp} /></Sheet>}
        {ops && sheet === 'results' && sess.run && <Sheet title="Results" onClose={() => setSheet(null)} wide><Results sess={sess} innerRef={resultsRef} statusOf={statusOf} /></Sheet>}
        {ops && sheet === 'conditions' && (
          <Sheet title="Update conditions and confirmations" onClose={() => setSheet(null)} className="drawer-conditions" wide>
            {started && !run!.done && <p className="warn-inline">A simulation is running. Changing any condition stops it; the next approved plan starts a <b>new run</b> from the updated starting conditions. Breathline does not replan from where people are now.</p>}
            <Setup sess={sess} edit={edit} />
            <Reports sess={sess} edit={edit} />
          </Sheet>
        )}
        {ops && sheet === 'dispatch' && plan && !stale && <Sheet title="Dispatch sheet — preview of what Print dispatch produces" onClose={() => setSheet(null)} wide><DispatchSheet s={s} plan={plan} revision={sess.revision} requests={sess.requests} /></Sheet>}
        {!sheet && selected && <InfoCard sess={sess} id={selected} schedule={schedule} statusOf={statusOf} t={t} onClose={() => setSelected(null)} onFocus={() => locate(selected)} />}
      </div>

      <main className="ops-grid">
        <div className="left-stack">
          <Situation sess={sess} statusOf={statusOf} view_={view_} />
          {ops ? (
            <section className="col-map panel" aria-label="Residents">
              <Roster sess={sess} statusOf={statusOf} schedule={schedule} selected={selected} onLocate={locate} />
              <StillNeedHelp sess={sess} stale={stale} />
            </section>
          ) : (
            <DemoLeft sess={sess} setSess={setSess} switchScenario={switchScenario} onResetSession={() => { clearSession(); switchScenario(sess.scenarioId); }} />
          )}
        </div>
        <div className="right-stack">
          {ops ? (
            <section className="col-plan panel" aria-label="Plan and next action">
              <div className="plan-scroll">
                <PlanCard sess={sess} stale={stale} view_={view_} run={run} />
                {plan && !stale && <Confirmations sess={sess} edit={edit} />}
              </div>
              <NextAction stage={stage} sess={sess} busy={busy} t={t} onFind={doCompute} onApprove={() => setSess((x) => approve(x))} onRun={runPlay}
                onPause={() => setPlaying(false)} onResults={viewResults} onReset={resetRun_} onDiscard={() => setSess((x) => discardApproval(x))} />
            </section>
          ) : (
            <DemoRight sess={sess} stress={stress} setStress={setStress} />
          )}
        </div>
      </main>

      <TimeBar innerRef={tbRef} sess={sess} schedule={schedule} stale={stale} view_={view_} t={t} stage={stage} playing={playing} demo={!ops} speed={speed} setSpeed={setSpeed}
        onPlay={runPlay} onPause={() => setPlaying(false)} onStep={() => setSess((x) => stepRun(x))} onReset={resetRun_} />

      {plan && !stale && <div className="print-only"><DispatchSheet s={s} plan={plan} revision={sess.revision} requests={sess.requests} /></div>}
      <footer className="foot">Runs on this laptop · no accounts, no network · build {BUILD_ID}</footer>
    </div>
  );
}

// ------------------------------------------------------------------ scene chrome

/** Map coordinates of a selectable item, for centring the view. */
function pointOf(s: Scenario, run: SimState | null, id: string, t: number): [number, number] | null {
  const loc = (lid: string) => s.locations.find((l) => l.id === lid);
  const along = (at: string | null, edge: { from: string; to: string; start: number; end: number } | null, fb: string): [number, number] | null => {
    if (edge && edge.start < t && t < edge.end) { const a = loc(edge.from)!, b = loc(edge.to)!; const f = (t - edge.start) / (edge.end - edge.start); return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f]; }
    const l = loc(at ?? fb);
    return l ? [l.x, l.y] : null;
  };
  if (id === 'crew') return along(run?.crew.at ?? null, run?.crew.edge ?? null, s.crew.start);
  if (id.startsWith('group:')) { const g = s.groups.find((x) => `group:${x.id}` === id); if (!g) return null; const gl = run?.groups[g.id]; return along(gl ? (gl.status === 'arrived' ? gl.shelter ?? gl.at : gl.at) : null, gl?.edge ?? null, g.location); }
  if (id.startsWith('place:')) { const l = loc(id.slice(6)); return l ? [l.x, l.y] : null; }
  return null;
}

function Sheet({ title, onClose, children, className, wide }: { title: string; onClose: () => void; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <section className={`drawer${wide ? ' wide' : ''}${className ? ' ' + className : ''}`} aria-label={title}>
      <div className="drawer-bar"><span className="drawer-title">{title}</span><button className="ghost drawer-close" onClick={onClose} aria-label={`Close ${title}`}>Close ✕</button></div>
      <div className="drawer-body">{children}</div>
    </section>
  );
}

function MapTools({ setCam, layers, setLayers, showKey, setShowKey }: { cam: Camera; setCam: (c: Camera | ((c: Camera) => Camera)) => void; layers: Layers; setLayers: (f: (l: Layers) => Layers) => void; showKey: boolean; setShowKey: (f: (b: boolean) => boolean) => void }) {
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const layer = (k: keyof Layers, label: string, title: string) => (
    <button className={`tool layer${layers[k] ? ' on' : ''}`} aria-pressed={layers[k]} onClick={() => toggle(k)} title={title}>{label}</button>
  );
  return (
    <div className="map-tools" role="toolbar" aria-label="Map controls">
      <div role="group" aria-label="Map layers" className="layers">
        {layer('routes', 'routes', 'Show or hide planned routes')}
        {layer('hazards', 'hazards', 'Show or hide hazard readings')}
        {layer('labels', 'names', 'Show or hide place names')}
        {layer('times', 'times', 'Show or hide travel times')}
        <button className={`tool layer${showKey ? ' on' : ''}`} aria-pressed={showKey} onClick={() => setShowKey((v) => !v)} title="Show the map key">key</button>
      </div>
      <div className="zoom" role="group" aria-label="Zoom">
        <button className="tool" aria-label="Zoom in" title="Zoom in (+)" onClick={() => setCam((c) => zoomAbout(c, 1.25))}>+</button>
        <button className="tool" aria-label="Zoom out" title="Zoom out (−)" onClick={() => setCam((c) => zoomAbout(c, 1 / 1.25))}>−</button>
        <button className="tool" aria-label="Reset the map view" title="Reset view (0)" onClick={() => setCam({ x: 0, y: 0, k: 1 })}>⟲</button>
      </div>
    </div>
  );
}

interface Mark { t: number; kind: 'crew' | 'arrive' | 'inspect' | 'cond'; text: string }

function TimeBar(p: {
  innerRef: MutableRefObject<HTMLElement | null>; sess: Session; schedule: Schedule | null; stale: boolean; view_: ReturnType<typeof planView> | null; t: number; stage: Stage; playing: boolean; demo: boolean;
  speed: number; setSpeed: (n: number) => void; onPlay: () => void; onPause: () => void; onStep: () => void; onReset: () => void;
}) {
  const { sess, schedule, t } = p;
  const s = sess.scenario;
  const plan = sess.plan && !p.stale ? sess.plan : null;
  const run = sess.run?.main.state ?? null;
  const started = !!run && run.processedThrough >= 0;
  const H = s.horizon;
  const marks: Mark[] = [];
  if (plan && schedule) {
    const condGroups = p.view_?.conditionalGroups ?? [];
    const observed = !!run?.knowledge.observations.length;
    const prefix = plan.kind === 'policy' && plan.inspection && !observed ? plan.inspection.prefixCrewCount : Infinity;
    schedule.crew.forEach((a, i) => {
      if (a.kind !== 'work' && a.kind !== 'inspect' && a.kind !== 'escort') return;
      marks.push({ t: a.start, kind: a.kind === 'inspect' ? 'inspect' : i >= prefix ? 'cond' : 'crew', text: `${crewText(s, a)}${i >= prefix ? ' (only if the check finds it open)' : ''}` });
    });
    if (plan.kind === 'policy' && plan.inspection) marks.push({ t: plan.inspection.end, kind: 'inspect', text: `Inspection result: is the ${passageName(s, plan.connection)} open?` });
    for (const j of schedule.journeys) {
      const cond = !observed && condGroups.includes(j.groupId);
      marks.push({ t: j.arrival, kind: cond ? 'cond' : 'arrive', text: `${groupName(s.groups.find((g) => g.id === j.groupId)!)} reach ${placeName(s, j.shelter)}${cond ? ' (if the check finds it open)' : ''}` });
    }
    marks.sort((a, b) => a.t - b.t);
  }
  const upcoming = marks.find((m) => (started ? m.t > t : m.t >= 0));
  const mode = run ? (run.done ? 'Simulation result' : 'Simulation') : plan ? 'Forecast' : 'No plan yet';
  const canPlay = p.stage === 'run' || p.stage === 'restored';
  const stack: Record<number, number> = {};
  return (
    <section className={`timebar${p.demo ? ' demo' : ''}`} aria-label="Time" ref={p.innerRef}>
      <div className="tb-row">
        <span className={`tb-mode ${run ? 'sim' : plan ? 'fc' : 'none'}`}>{mode}</span>
        <span className="tb-minute" aria-live="polite"><span className="tb-lab">Minute</span> <b>{started ? t : 0}</b><span className="tb-of">/ {H}</span></span>
        <button className={`tb-play${p.playing ? ' on' : ''}`} onClick={p.playing ? p.onPause : p.onPlay} disabled={!p.playing && !canPlay}
          aria-label={p.playing ? 'Pause the simulation' : p.stage === 'restored' ? 'Resume the simulation' : 'Play the simulation'} title={p.playing ? 'Pause' : 'Play'}>{p.playing ? '⏸' : '▶'}</button>
        {p.demo && <span className="tb-demo">
          <button onClick={p.onStep} disabled={!run || run.done || run.paused}>Step 1 minute</button>
          <button onClick={p.onReset} disabled={!run}>Reset run</button>
          <label>Speed <select value={p.speed} onChange={(e) => p.setSpeed(Number(e.target.value))}><option value={1200}>slow</option><option value={700}>normal</option><option value={250}>fast</option></select></label>
        </span>}
        <span className="tb-next" title={upcoming ? `Minute ${upcoming.t}: ${upcoming.text}` : undefined}>{!plan ? 'Find a plan to see what happens when.' : run?.done ? `Simulation finished at minute ${H}.` : upcoming ? <><span className="tb-lab">Next</span> minute {upcoming.t} · {upcoming.text}</> : 'No further planned events.'}</span>
      </div>
      <div className="tb-track" aria-hidden="true">
        <div className="tb-rail" />
        {started && <div className="tb-fill" style={{ width: `${(t / H) * 100}%` }} />}
        {Array.from({ length: H + 1 }, (_, i) => <span key={i} className={`tb-tick${i % 5 === 0 ? ' major' : ''}`} style={{ left: `${(i / H) * 100}%` }}>{i % 5 === 0 && <em>{i}</em>}</span>)}
        {marks.map((m, i) => { const k = (stack[m.t] = (stack[m.t] ?? -1) + 1); return <span key={i} className={`tb-mark mk-${m.kind}${started && m.t <= t ? ' past' : ''}`} style={{ left: `${(m.t / H) * 100}%`, bottom: `${14 + k * 9}px` }} title={`Minute ${m.t}: ${m.text}`} />; })}
        {started && <div className="tb-head" style={{ left: `${(t / H) * 100}%` }} />}
      </div>
      {marks.length > 0 && <ol className="sr-only" aria-label="Planned events">{marks.map((m, i) => <li key={i}>Minute {m.t}: {m.text}</li>)}</ol>}
    </section>
  );
}

function InfoCard({ sess, id, schedule, statusOf, t, onClose, onFocus }: { sess: Session; id: string; schedule: Schedule | null; statusOf: (g: string) => Plainstatus; t: number; onClose: () => void; onFocus: () => void }) {
  const s = sess.scenario;
  const run = sess.run?.main.state ?? null;
  const plan = sess.plan && !isPlanStale(sess) ? sess.plan : null;
  let kind = '', title = '';
  const lines: ReactNode[] = [];
  const hzAt = (lid: string, m: number) => Math.round(run ? liveNodeHazard(s, run, lid, m) : nodeHazard(baseWorld(s), lid, m));
  if (id === 'crew') {
    kind = 'Crew'; title = s.crew.name || 'Crew';
    const now = schedule && run && run.processedThrough >= 0 ? schedule.crew.find((a) => a.start <= t && t < a.end) : undefined;
    const next = schedule?.crew.find((a) => a.kind !== 'travel' && a.kind !== 'wait' && a.start >= (run && run.processedThrough >= 0 ? t : 0) && a !== now);
    lines.push(<li key="at">At {placeName(s, run?.crew.at ?? s.crew.start)}{run?.crew.edge ? `, moving toward ${placeName(s, run.crew.edge.to)}` : ''}</li>);
    if (now) lines.push(<li key="now"><b>Now:</b> {crewText(s, now)}</li>);
    if (next) lines.push(<li key="next"><b>Next:</b> {crewText(s, next)} (minute {next.start})</li>);
    if (!schedule) lines.push(<li key="np" className="muted">No plan yet — find one to see the crew's tasks.</li>);
    lines.push(<li key="kit">{plural(s.crew.batteries, 'battery', 'batteries')} in the pack{s.crew.toolkit ? ' · tool kit' : ''}</li>);
  } else if (id.startsWith('group:')) {
    const g = s.groups.find((x) => `group:${x.id}` === id);
    if (!g) return null;
    kind = 'Residents'; title = groupName(g);
    const st = statusOf(g.id);
    const live = run?.groups[g.id];
    const j = schedule?.journeys.find((x) => x.groupId === g.id);
    lines.push(<li key="n">{plural(g.count, 'person', 'people')}{g.mobility === 'wheelchair' ? ' · ♿ wheelchair user, needs an escort' : ''}</li>);
    lines.push(<li key="st"><span className={`rstatus st-${st}`}>{STATUS_WORDS[st].icon} {plan || run ? STATUS_WORDS[st].label : 'Not yet planned'}</span></li>);
    lines.push(<li key="w">{live?.status === 'arrived' ? `In ${placeName(s, live.shelter!)} since minute ${live.arrivedAt}` : live?.edge ? `Moving toward ${placeName(s, live.edge.to)}` : `At ${placeName(s, live?.at ?? g.location)} · hazard ${hzAt(live?.at ?? g.location, t)} now (limit ${s.threshold})`}</li>);
    if (j && live?.status !== 'arrived') lines.push(<li key="j">{st === 'waiting-inspection' ? 'If the check finds the route open: ' : ''}leave at minute {j.departure}{j.escorted ? ' with the crew' : ''}, reach {placeName(s, j.shelter)} at minute {j.arrival} via {j.legs.filter((l) => l.conn).map((l) => placeName(s, l.to)).join(' → ')}</li>);
    if (!j && plan && schedule) { const why = whyWaiting(s, schedule, g.id, plan.search).sort((a, b) => BLOCKER_ORDER.indexOf(a.code) - BLOCKER_ORDER.indexOf(b.code)); if (why[0]) lines.push(<li key="why"><b>Why waiting:</b> {why[0].text}</li>); }
    if (g.needsAccessibleEntry || g.needsAssistanceOnArrival) lines.push(<li key="needs" className="muted">Needs {[g.needsAccessibleEntry ? 'step-free entry' : '', g.needsAssistanceOnArrival ? 'assistance on arrival' : ''].filter(Boolean).join(' and ')} at the shelter</li>);
  } else if (id.startsWith('place:')) {
    const lid = id.slice(6);
    const l = s.locations.find((x) => x.id === lid);
    if (!l) return null;
    title = placeName(s, lid);
    const sh = s.shelters.find((x) => x.location === lid);
    if (sh) {
      kind = 'Shelter';
      const occ = run ? run.shelters[lid].occupants : [];
      const occN = occ.reduce((n, gid) => n + (s.groups.find((g) => g.id === gid)?.count ?? 0), 0);
      const exp = schedule ? schedule.journeys.filter((j) => j.shelter === lid && !occ.includes(j.groupId)).reduce((n, j) => n + (s.groups.find((g) => g.id === j.groupId)?.count ?? 0), 0) : 0;
      lines.push(<li key="o"><b>{occN} of {sh.places}</b> places taken{exp ? ` · ${exp} expected under the plan` : ''}{sh.placesConfirmed ? '' : ' · place count not confirmed'}</li>);
      (Object.keys(sh.checklist) as (keyof ShelterChecklist)[]).forEach((k) => lines.push(<li key={k}>{sh.checklist[k] === 'present' ? '✓' : sh.checklist[k] === 'absent' ? '✕' : '?'} {CHECK_LABEL[k]}: {sh.checklist[k] === 'present' ? 'confirmed' : sh.checklist[k] === 'absent' ? 'not available' : 'not confirmed yet'}</li>));
      lines.push(<li key="sw" className="muted">Steward: {sh.steward}</li>);
    } else {
      kind = 'Place';
      const hazardous = l.hazard.initial > 0 || l.hazard.rate > 0;
      if (hazardous) lines.push(<li key="h">⚠ Hazard {hzAt(lid, t)} now · {hzAt(lid, s.horizon)} by minute {s.horizon} (limit {s.threshold})</li>);
      const here = s.groups.filter((g) => { const gl = run?.groups[g.id]; return gl ? gl.status !== 'arrived' && !gl.edge && gl.at === lid : g.location === lid; });
      lines.push(<li key="who">{here.length ? `Here now: ${here.map((g) => `${groupName(g)} (${g.count})`).join(', ')}` : 'Nobody waiting here now'}</li>);
      s.connections.filter((c) => c.a === lid || c.b === lid).forEach((c) => {
        const other = c.a === lid ? c.b : c.a;
        const st = c.state === 'unknown' ? (run?.knowledge.observations.find((o) => o.connection === c.id)?.state ?? 'not yet checked') : run ? ((run.openAt[c.id] ?? Infinity) <= t ? 'open' : 'blocked') : c.state;
        lines.push(<li key={c.id} className="small">{passageName(s, c.id)} to {placeName(s, other)} — {c.minutes} min{c.kind === 'stairs' ? ', stairs' : ''}, {st}</li>);
      });
      s.actions.filter((a) => a.workLocation === lid && a.offered).forEach((a) => {
        const sc = schedule?.crew.find((x) => x.actionId === a.id);
        lines.push(<li key={a.id}><b>{a.label}</b>: {sc ? `planned minute ${sc.start}–${sc.end}` : 'not in this plan'} · {a.duration} min{a.batteries ? `, ${plural(a.batteries, 'battery', 'batteries')}` : ''}</li>);
      });
    }
  }
  return (
    <section className="infocard" aria-label={`Details: ${title}`}>
      <div className="ic-head">
        <span className="ic-kind">{kind}</span>
        <h3>{title}</h3>
        <span className="ic-actions"><button className="ghost" onClick={onFocus}>Centre map</button><button className="ghost" onClick={onClose} aria-label="Close details">✕</button></span>
      </div>
      <ul className="ic-lines">{lines}</ul>
    </section>
  );
}

// ------------------------------------------------------------------ top of page

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="help">
      <ol>
        <li>The <b>coordinator</b> runs Breathline on the command-station laptop. Residents need no phones or accounts.</li>
        <li><b>Resident representatives</b> report where each group is and what help it needs, by radio or messenger.</li>
        <li><b>Shelter stewards</b> confirm free places, step-free entry, assistance on arrival and working ventilation.</li>
        <li>Breathline finds a plan. The coordinator confirms what it depends on, approves it, and relays the printed dispatch.</li>
      </ol>
      <p className="muted small">Restrictions are modeled as physical access limits; Breathline cannot override the Directorate. Radio coverage, power, accurate reports and compliance remain dependencies.</p>
      <p className="muted small">Everything runs on this laptop with no accounts and no network. The planner never sees the simulator's hidden conditions.</p>
      <p className="muted small">Moving around the map: drag or use the arrow keys, scroll or press + and − to zoom, 0 to reset. Select a place, a group or the crew for details.</p>
      <button className="primary" onClick={onClose}>Got it</button>
    </div>
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
    counters.push({ label: done ? 'Reached shelter' : 'Reached shelter so far', value: `${arrived}`, tag: 'Simulation result', sub: done ? '' : onWay ? `${onWay} on the way` : '', tone: 'good' });
    counters.push({ label: 'Still waiting', value: `${countOf(s, waitIds)}`, tag: done ? 'Simulation result' : 'Now', sub: [cond ? `${cond} waiting for inspection` : '', prot ? `${prot} with temporary protection` : ''].filter(Boolean).join(' · '), tone: countOf(s, waitIds) ? 'warn' : 'good' });
    counters.push({ label: 'Without crew intervention', value: `${by(b, (x) => x === 'arrived')}`, tag: done ? 'Simulation result' : 'Running alongside', sub: '', tone: '' });
  } else if (plan && view_) {
    const sc = mainSchedule(plan);
    const base = sess.baseline?.schedule.objective.served ?? 0;
    if (plan.kind === 'policy' && plan.inspection) {
      const o = plan.objective;
      counters.push({ label: 'Can reach shelter', value: `${o.min}–${o.nOpen}`, tag: 'Forecast', sub: `${o.nOpen - o.nBlocked} depend on the inspection`, tone: 'good' });
      counters.push({ label: 'Still needing help', value: `${T - o.nOpen}–${T - o.min}`, tag: 'Forecast', sub: '', tone: 'warn' });
    } else {
      const prot = countOf(s, s.groups.filter((g) => statusOf(g.id) === 'protected').map((g) => g.id));
      counters.push({ label: 'Can reach shelter', value: `${sc.objective.served}`, tag: 'Forecast', sub: '', tone: 'good' });
      counters.push({ label: 'Still needing help', value: `${T - sc.objective.served}`, tag: 'Forecast', sub: prot ? `${prot} with temporary protection` : '', tone: T - sc.objective.served ? 'warn' : 'good' });
    }
    counters.push({ label: 'Without crew intervention', value: `${base}`, tag: 'Forecast', sub: '', tone: '' });
  } else {
    counters.push({ label: 'Residents', value: `${T}`, tag: 'Reported', sub: '', tone: '' });
    counters.push({ label: 'Shelter places', value: `${shelterPlaces}`, tag: 'Confirmed', sub: '', tone: '' });
    counters.push({ label: 'Batteries', value: `${s.crew.batteries}`, tag: 'Crew pack', sub: '', tone: '' });
  }
  return (
    <section className="situation panel" aria-label="Situation">
      <div className="sit-text">
        <p className="eyebrow">Scenario {s.label}</p>
        <h2>{s.title}</h2>
        <details className="about"><summary>About this scenario</summary><p>{s.summary} {T} residents in {s.groups.length} groups, {s.shelters.length} shelters with {shelterPlaces} places, one crew, a {s.horizon}-minute window.</p></details>
        {sess.revision > 0 && <span className="chip-updated" title={`Input revision ${sess.revision}`}>Conditions updated {'·'} {plural(sess.revision, 'change')}</span>}
      </div>
      <div className="counters">
        {counters.map((c) => (
          <div key={c.label} className={`ctr ${c.tone}`}>
            <span className="ctr-tag">{c.tag}</span>
            <span className="n">{c.value}</span>
            <span className="ctr-label">{c.label}</span>
            {c.sub && <span className="ctr-sub">{c.sub}</span>}
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

function Roster({ sess, statusOf, schedule, selected, onLocate }: { sess: Session; statusOf: (g: string) => Plainstatus; schedule: Schedule | null; selected: string | null; onLocate: (id: string) => void }) {
  const s = sess.scenario;
  const plan = sess.plan && !isPlanStale(sess) ? sess.plan : null;
  const run = sess.run?.main.state;
  return (
    <section className="card roster-card" aria-label="Residents">
      <h3 className="disp">Residents</h3>
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
            <li key={g.id} className={`rrow st-${st}${selected === `group:${g.id}` ? ' sel' : ''}`}>
              <button className="rcount" onClick={() => onLocate(`group:${g.id}`)} aria-label={`Show ${groupName(g)} on the map`} title="Show on the map">{g.count}</button>
              <span className="rname" title={where}><b>{groupName(g)}</b>{g.mobility === 'wheelchair' && <span className="wc" title="Includes a wheelchair user who needs an escort" aria-label="includes a wheelchair user"> ♿</span>}</span>
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
  const sets: [string, Schedule, 'confirmed' | PassageState][] = plan.kind === 'schedule' || !plan.inspection ? [['', mainSchedule(plan), 'confirmed']] : [['If blocked: ', plan.branches.blocked, 'blocked'], ['If open: ', plan.branches.open, 'open']];
  const items = sets.flatMap(([pre, sc, key]) => sc.unresolved.map((gid) => ({ pre, sc, key, g: s.groups.find((x) => x.id === gid)! })));
  if (!items.length) return null;
  const prot = protectionGains(s, plan.kind === 'policy' && plan.inspection ? plan.branches.blocked : mainSchedule(plan), sess.baseline?.schedule ?? null);
  return (
    <section className="card needs" aria-label="People still needing help">
      <h3 className="disp">Still needing help</h3>
      {items.map(({ pre, sc, key, g }, i) => {
        const why = whyWaiting(s, sc, g.id, plan.search).sort((a, b) => BLOCKER_ORDER.indexOf(a.code) - BLOCKER_ORDER.indexOf(b.code));
        const rr = sess.requests?.[(plan.kind === 'schedule' || !plan.inspection ? 'confirmed' : key) as 'confirmed'];
        const reqs = rr?.requests.filter((q) => q.groupId === g.id) ?? [];
        const p = prot.find((x) => x.g.id === g.id);
        return (
          <div key={i} className="need">
            <div className="need-head"><b>{pre}{groupName(g)}</b> <span className="muted">· {g.count}</span>{p && <span className="need-prot" title={`${g.count} residents gain ${p.gain} minutes each below the hazard limit. They still need a route.`}>◐ +{p.gain} min protected</span>}</div>
            {why[0] && <p className="why1">{why[0].text}</p>}
            {(reqs.length > 0 || why.length > 1) && (
              <details className="need-more"><summary>{reqs.length ? 'What would help' : 'More reasons'}</summary>
                {reqs.map((q, k) => (
                  <div key={k} className="request">
                    <div className="req-grid">
                      <span>What</span><b>{q.resource === 'instructions' ? 'Departure instructions' : `${q.quantity} ${q.resource === 'places' ? (q.quantity === 1 ? 'shelter place' : 'shelter places') : (q.quantity === 1 ? 'battery' : 'batteries')}`}</b>
                      <span>Where</span><b>{placeName(s, q.location)}</b>
                      <span>By</span><b>{q.latest !== null ? `minute ${q.latest}` : q.windows.map(([a2, b2]) => `${a2}–${b2}`).join(', ')}{q.latest !== null && q.latest < s.horizon ? ` (minute ${q.latest + 1} is too late)` : ''}</b>
                      <span>For</span><b>{q.benefits.gained.map((x) => groupName(s.groups.find((y) => y.id === x)!)).join(', ')} ({plural(q.benefits.residents, 'person', 'people')})</b>
                    </div>
                    <p className="muted small">{plain(s, q.text)} Tested hypothetical: it reserves nothing and never counts as an arrival.</p>
                  </div>
                ))}
                {why.length > 1 && <ul className="why">{why.slice(1).map((w, k) => <li key={k}>{w.text}</li>)}</ul>}
              </details>
            )}
          </div>
        );
      })}
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
        <p className="muted">Compares every order of crew work in {s.horizon} minutes with doing nothing.</p>
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
      {view_.notes.length > 0 && <ul className="notes">{view_.notes.slice(0, 1).map((n, i) => <li key={i} className={`note-${n.kind}`} title={n.text}><span className="note-tag">{n.kind === 'uncertain' ? 'Uncertain' : n.kind === 'depends' ? 'Depends on' : 'Blocker'}</span> {n.text.replace(/^Depends on /, '')}</li>)}</ul>}
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
      {view_.notes.length > 1 && <ul className="notes">{view_.notes.slice(1).map((n, i) => <li key={i} className={`note-${n.kind}`}><span className="note-tag">{n.kind === 'uncertain' ? 'Uncertain' : n.kind === 'depends' ? 'Depends on' : 'Blocker'}</span> {n.text.replace(/^Depends on /, '')}</li>)}</ul>}
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
  if (sess.approved) return <section className="card conf ok-card" aria-label="Confirmations"><p><span aria-hidden="true">{'✓'}</span> Approved · places and batteries reserved</p></section>;
  return (
    <section className="card conf" aria-label="Required confirmations">
      {missing.length > 0 && <h3 className="disp">Confirm first ({missing.length})</h3>}
      {missing.length > 0 && (
        <ul className="todo">
          {missing.map((c, i) => {
            const ins = confirmationInstruction(s, c);
            return <li key={i}><span>{ins.text} <span className="muted small">({c.source})</span></span><button onClick={() => edit(ins.editText, ins.apply)} title="Records the confirmation; you will then find the plan again">Mark confirmed</button></li>;
          })}
        </ul>
      )}
      <details className="conf-done"><summary>{missing.length ? `${done.length} confirmed` : `✓ All ${items.length} confirmations received`}</summary><ul className="small doneList">{done.map((c, i) => <li key={i}>{'✓'} {confirmationInstruction(s, c).done} <span className="muted">— {c.source}</span></li>)}</ul></details>
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
  const now = sc && started ? sc.crew.find((a) => a.start <= t && t < a.end) : undefined;
  return (
    <section className="card next" aria-label="Next action">
      <ol className="stages" aria-label="Progress">{steps.map((x, i) => <li key={x} className={i < idx ? 'past' : i === idx ? 'now' : ''} aria-current={i === idx ? 'step' : undefined} title={x}><span className="st-label">{x}</span></li>)}</ol>
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
      {sess.run && stage !== 'done' && (
        <div className="progress">
          <div className="crew-now"><span className="cn-lab">Crew now</span> {now ? crewText(s, now) : run?.done ? 'finished' : started ? 'idle' : 'at the start'}</div>
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

function DemoLeft(p: { sess: Session; setSess: (f: (x: Session) => Session) => void; switchScenario: (id: string) => void; onResetSession: () => void }) {
  const { sess } = p;
  const run = sess.run?.main.state;
  return (
    <section className="demo-left panel" aria-label="Demo and testing: scenario and hidden conditions">
      <p className="demo-intro">For demos and review only — not needed to run an operation.</p>
      <div className="block"><h3 className="disp">Scenario</h3>
        <div className="scen-list">{Object.keys(SCENARIO_BUILDERS).map((id) => <button key={id} className={id === sess.scenarioId ? 'on' : ''} onClick={() => p.switchScenario(id)}><b>{id}</b> {getScenario(id).title}</button>)}</div>
        <button className="ghost" onClick={p.onResetSession}>Reset this session</button>
      </div>
      <Controller sess={sess} setSess={p.setSess} />
      <div className="block"><h3 className="disp">Playback</h3>
        <p className="muted small">{run ? 'Step, reset and speed are in the time bar.' : 'Approve a plan in Operations first.'}</p>
      </div>
    </section>
  );
}

function DemoRight({ sess, stress, setStress }: { sess: Session; stress: { rows: StressRow[]; recomputed: Record<string, string> } | null; setStress: (x: { rows: StressRow[]; recomputed: Record<string, string> } | null) => void }) {
  const s = sess.scenario;
  const run = sess.run?.main.state;
  return (
    <section className="demo-right panel" aria-label="Demo and testing: checks and records">
      <h3 className="disp">Checks <span className="hl">&amp;</span> records</h3>
      <Stress sess={sess} stress={stress} setStress={setStress} />
      <Diagnostics sess={sess} />
      <Evidence sess={sess} />
      <Events run={run ?? null} />
      <Exposure sess={sess} />
      <details className="panel"><summary>Assumptions and limits</summary><ul>{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul><p className="muted small">Not modeled: medical outcomes, shelter habitability beyond minute {s.horizon}, adversarial reports, changing hidden conditions, unreliable inspection, actual radio delivery, sensor calibration, control over Directorate infrastructure.</p></details>
    </section>
  );
}

function Controller({ sess, setSess }: { sess: Session; setSess: (f: (x: Session) => Session) => void }) {
  const s = sess.scenario;
  const started = !!sess.run && sess.run.main.state.processedThrough >= 0;
  return (
    <div className="block"><h3 className="disp">Hidden conditions</h3><p className="muted small">Never passed to the planner.</p>
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
    </div>
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
