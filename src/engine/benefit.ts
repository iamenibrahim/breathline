// Benefit for each group, derived from the EXECUTED baseline and response runs (not fixed wording).
import type { Scenario, Schedule } from './types';
import type { SimState } from './simulate';
import { dependencies } from './explain';
import { locName } from './common';

export interface BenefitRow {
  groupId: string;
  name: string;
  count: number;
  provided: string;
  baseline: string;
  response: string;
  changed: boolean;
  arrival: number | null;
  waitingExposure: number | null;
  travelExposure: number | null;
  protectedGain: { perPerson: number; personMinutes: number } | null;
  remainingNeed: string | null;
}

function executedStatus(st: SimState, gid: string) {
  const g = st.groups[gid];
  if (g.status === 'arrived') return `Arrived (minute ${g.arrivedAt})`;
  if (g.status === 'held') return 'Held at shelter entrance';
  if (g.unsafe) return 'Unresolved — location reached the threshold';
  return g.status === 'unresolved' ? 'Unresolved' : g.status;
}

function waitingExposure(st: SimState, gid: string): number | null {
  const g = st.groups[gid];
  if (g.departedAt === null) return null;
  const snap = st.snapshots.find((x) => x.t === g.departedAt);
  return snap ? snap.groups[gid].exposure : null;
}

export function groupBenefits(s: Scenario, resp: Schedule, baseRun: SimState, respRun: SimState, needs: Record<string, string> = {}): BenefitRow[] {
  const deps = dependencies(s, resp);
  return s.groups.map((g) => {
    const b = baseRun.groups[g.id], r = respRun.groups[g.id];
    const j = resp.journeys.find((x) => x.groupId === g.id);
    let provided = '';
    let changed = true;
    let protectedGain: BenefitRow['protectedGain'] = null;
    if (r.status === 'arrived' && b.status !== 'arrived') {
      const parts: string[] = [];
      const opened = deps.filter((d) => d.groupId === g.id && s.actions.find((a) => a.id === d.actionId)?.kind === 'open').map((d) => s.actions.find((a) => a.id === d.actionId)!.label.replace(/^Open /, ''));
      const insp = deps.filter((d) => d.groupId === g.id && s.actions.find((a) => a.id === d.actionId)?.kind === 'inspect');
      if (j?.escorted) parts.push(`Accessible assistance: ${opened.length ? `${opened.join(' and ')} opened and ` : insp.length ? 'bypass confirmed open by inspection and ' : ''}a continuous escort to ${locName(s, j.shelter)}`);
      for (const d of deps.filter((x) => x.groupId === g.id && s.actions.find((a) => a.id === x.actionId)?.kind === 'repair')) {
        const a = s.actions.find((x) => x.id === d.actionId)!;
        parts.push(`A traversable corridor: ${a.label} keeps ${locName(s, (a.effect as { location: string }).location)} below threshold at arrival`);
      }
      if (!parts.length) parts.push(`A shelter journey to ${locName(s, j?.shelter ?? '')}`);
      provided = parts.join('; ');
    } else if (r.status === 'arrived' && b.status === 'arrived') {
      changed = b.arrivedAt !== r.arrivedAt;
      provided = `Retained shelter access: its existing route and ${locName(s, j?.shelter ?? '')} places stay reserved${changed ? '' : ' (outcome unchanged — not credited to the intervention)'}`;
    } else if (r.status !== 'arrived') {
      const gain = r.protected - b.protected;
      if (gain > 0) {
        protectedGain = { perPerson: gain, personMinutes: gain * g.count };
        const vent = s.actions.find((a) => a.kind === 'ventilate' && resp.tasks.includes(a.id) && (a.effect as { location: string }).location === g.location);
        provided = `${vent ? `Temporary ventilation at ${locName(s, g.location)}` : 'Improved waiting conditions'} — not evacuated; below threshold ${r.protected >= s.horizon ? `until the horizon at minute ${s.horizon}` : `for ${r.protected} minutes`} instead of reaching it at minute ${b.protected} (+${gain} minutes per person, ${gain * g.count} person-minutes)`;
      } else { provided = 'No change for this group'; changed = false; }
    }
    const we = r.status === 'arrived' ? waitingExposure(respRun, g.id) : null;
    return {
      groupId: g.id, name: g.name, count: g.count, provided, baseline: executedStatus(baseRun, g.id), response: executedStatus(respRun, g.id), changed,
      arrival: r.arrivedAt, waitingExposure: we, travelExposure: we !== null ? Math.round((r.exposure - we) * 1e6) / 1e6 : null, protectedGain,
      remainingNeed: r.status === 'arrived' ? null : needs[g.id] ?? 'Still needs a feasible journey to a suitable shelter.',
    };
  });
}
