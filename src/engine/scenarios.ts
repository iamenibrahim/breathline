// Shared neighborhood and reference conditions A–E, implemented as data overrides.
// Scenario names/ids are display metadata; the planner never reads them.
import type { ActionDef, ConnectionDef, GroupDef, LocationDef, Scenario, ShelterDef, Truth } from './types';

const loc = (id: string, name: string, level: number, x: number, y: number, role: string, initial = 0, rate = 0): LocationDef => ({
  id, name, level, x, y, capacity: 24, hazard: { initial, rate }, role,
});

const conn = (a: string, b: string, minutes: number, extra: Partial<ConnectionDef> = {}): ConnectionDef => ({
  id: `${a}-${b}`, a, b, minutes, accessible: true, kind: 'passage', state: 'open', capacity: 24, hazard: { initial: 0, rate: 0 }, ...extra,
});

export function baseNeighborhood(): Scenario {
  const locations: LocationDef[] = [
    loc('RA', 'Deep Homes A', 3, 230, 380, 'Home of Group A (4 residents, including a wheelchair user)', 2, 7),
    loc('RB', 'Pump Quarter B', 2, 905, 250, 'Home of Group B (8 residents)'),
    loc('RC', 'Upper Homes C', 1, 75, 90, 'Home of Group C (12 residents)'),
    loc('G', 'Gate B work point', 2, 560, 330, 'Passage-opening work location'),
    loc('P', 'Lower passage', 3, 560, 450, 'Connects Gate B and Lower Refuge'),
    loc('L', 'Lower Refuge', 3, 580, 570, 'Shelter: 12 places'),
    loc('U', 'Upper Refuge', 1, 380, 90, 'Shelter: 12 places'),
    loc('F', 'Fan 3 workshop', 1, 770, 90, 'Crew start and Fan 3 repair location'),
    loc('J1', 'Service junction', 2, 730, 230, 'Between the fan workshop and Gate B'),
    loc('J2', 'Pump junction', 3, 905, 420, 'On Group B’s route'),
    loc('J3', 'Vent corridor', 3, 770, 545, 'Hazard growth slowed by Fan 3', 10, 10),
    loc('ST', 'Stair landing', 2, 300, 230, 'Stairs: not usable by a wheelchair user'),
    loc('X1', 'Upper connector', 1, 225, 90, 'On Group C’s route'),
    loc('X2', 'Workshop connector', 1, 575, 90, 'Between Upper Refuge and the fan workshop'),
    loc('X3', 'Bypass inspection point', 3, 360, 505, 'Inspection point for the Deep Homes bypass'),
  ];
  const connections: ConnectionDef[] = [
    conn('RA', 'G', 1, { state: 'blocked', note: 'Gate B: blocked at crisis start' }),
    conn('G', 'P', 1),
    conn('P', 'L', 1),
    conn('F', 'J1', 1),
    conn('J1', 'G', 1),
    conn('RB', 'J2', 4),
    conn('J2', 'J3', 5),
    conn('J3', 'L', 1, { capacity: 8 }),
    conn('RC', 'X1', 1),
    conn('X1', 'U', 2),
    conn('U', 'X2', 2),
    conn('X2', 'F', 2),
    conn('RA', 'ST', 1, { kind: 'stairs', accessible: false }),
    conn('ST', 'U', 1, { kind: 'stairs', accessible: false }),
    conn('RA', 'X3', 1, { state: 'blocked', note: 'Deep Homes bypass: confirmed blocked; no available action opens it' }),
    conn('X3', 'P', 1),
  ];
  const groups: GroupDef[] = [
    {
      id: 'A', name: 'Deep Homes A', count: 4, location: 'RA', mobility: 'wheelchair', stepFree: true, escortRequired: true,
      needsAccessibleEntry: true, needsAssistanceOnArrival: true, instructionsAvailableAt: 0,
      context: 'Four residents, including a wheelchair user who needs a step-free route, a crew member alongside for the whole journey, and assistance on arrival.',
    },
    {
      id: 'B', name: 'Pump Quarter B', count: 8, location: 'RB', mobility: 'standard', stepFree: false, escortRequired: false,
      needsAccessibleEntry: false, needsAssistanceOnArrival: false, instructionsAvailableAt: 0,
      context: 'Eight residents with standard mobility. Their only route to shelter runs through the vent corridor (J3).',
    },
    {
      id: 'C', name: 'Upper Homes C', count: 12, location: 'RC', mobility: 'standard', stepFree: false, escortRequired: false,
      needsAccessibleEntry: false, needsAssistanceOnArrival: false, instructionsAvailableAt: 0,
      context: 'Twelve residents with standard mobility, three minutes from Upper Refuge.',
    },
  ];
  const shelters: ShelterDef[] = [
    {
      location: 'L', name: 'Lower Refuge', places: 12, placesConfirmed: true, steward: 'Lower Refuge steward',
      checklist: { accessibleEntry: 'present', assistanceOnArrival: 'present', ventilationOperating: 'present' },
    },
    {
      location: 'U', name: 'Upper Refuge', places: 12, placesConfirmed: true, steward: 'Upper Refuge steward',
      checklist: { accessibleEntry: 'present', assistanceOnArrival: 'absent', ventilationOperating: 'present' },
    },
  ];
  const actions: ActionDef[] = [
    {
      id: 'open-gate-b', kind: 'open', label: 'Open Gate B', workLocation: 'G', duration: 2, batteries: 0, requiresToolkit: true,
      effect: { type: 'openConnection', connection: 'RA-G' }, offered: true,
      description: 'Work at Gate B for two minutes with the tool kit; opens the step-free passage RA–G at completion.',
    },
    {
      id: 'repair-fan-3', kind: 'repair', label: 'Repair Fan 3', workLocation: 'F', duration: 5, batteries: 4, requiresToolkit: true,
      effect: { type: 'setRate', location: 'J3', rate: 2 }, offered: true,
      description: 'Work at the Fan 3 workshop for five minutes; consumes four batteries at completion and slows hazard growth in the vent corridor (J3).',
    },
    {
      id: 'inspect-bypass', kind: 'inspect', label: 'Inspect Deep Homes bypass', workLocation: 'X3', duration: 1, batteries: 0, requiresToolkit: false,
      effect: { type: 'reveal', connection: 'RA-X3' }, offered: false,
      description: 'Reach X3 and inspect the RA–X3 bypass; reveals and confirms open or blocked. Does not clear a blockage.',
    },
    {
      id: 'ventilate-RA', kind: 'ventilate', label: 'Install temporary ventilation at Deep Homes', workLocation: 'RA', duration: 2, batteries: 2, requiresToolkit: true,
      effect: { type: 'setRate', location: 'RA', rate: 0 }, offered: false,
      description: 'Fallback protection: work at the occupied location for two minutes; consumes two batteries; holds hazard growth there. Not an evacuation.',
    },
  ];
  return {
    id: 'A', label: 'A', title: '', summary: '', horizon: 20, threshold: 100,
    locations, connections, groups, shelters,
    crew: { id: 'crew-1', name: 'Responder crew', start: 'F', batteries: 4, packSize: 4, toolkit: true, qualifications: ['repair', 'escort', 'inspection'] },
    actions, deliveries: [],
    knowledge: { unknown: null },
    instructionsConfirmed: { A: true, B: true, C: true },
    reports: [
      { id: 'rep-L-places', target: 'Lower Refuge places', value: '12', observedAt: 0, source: 'Lower Refuge steward', state: 'confirmed' },
      { id: 'rep-U-places', target: 'Upper Refuge places', value: '12', observedAt: 0, source: 'Upper Refuge steward', state: 'confirmed' },
      { id: 'rep-A-location', target: 'Group A location and needs', value: 'At Deep Homes; wheelchair user; needs escort', observedAt: -3, source: 'Deep Homes resident representative', state: 'confirmed' },
      { id: 'rep-B-location', target: 'Group B location', value: 'At Pump Quarter', observedAt: -2, source: 'Pump Quarter resident representative', state: 'confirmed' },
      { id: 'rep-C-location', target: 'Group C location', value: 'At Upper Homes', observedAt: -2, source: 'Upper Homes resident representative', state: 'confirmed' },
      { id: 'rep-gate', target: 'Gate B (RA–G)', value: 'Blocked; manual release intact', observedAt: -4, source: 'Crew radio check-in', state: 'confirmed' },
      { id: 'rep-bypass', target: 'Deep Homes bypass (RA–X3)', value: 'Blocked', observedAt: -10, source: 'Crew radio check-in', state: 'confirmed' },
    ],
  };
}

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function setConn(s: Scenario, id: string, patch: Partial<ConnectionDef>) {
  const c = s.connections.find((c) => c.id === id);
  if (!c) throw new Error(`no connection ${id}`);
  Object.assign(c, patch);
}
function setLocHazard(s: Scenario, id: string, initial: number, rate: number) {
  const l = s.locations.find((l) => l.id === id)!;
  l.hazard = { initial, rate };
}
function action(s: Scenario, id: string): ActionDef { return s.actions.find((a) => a.id === id)!; }

export function scenarioA(): Scenario {
  const s = baseNeighborhood();
  s.id = 'A'; s.label = 'A';
  s.title = 'Repair first to restore the missing route';
  s.summary = 'The vent corridor is deteriorating and Gate B blocks the only step-free route from Deep Homes.';
  return s;
}

export function scenarioB(): Scenario {
  const s = scenarioA();
  s.id = 'B'; s.label = 'B';
  s.title = 'Rescue first when Deep Homes becomes urgent';
  s.summary = 'Deep Homes becomes unsafe at minute 9; Group B’s route is longer but the corridor deteriorates more slowly.';
  setLocHazard(s, 'RA', 2, 12);
  setLocHazard(s, 'J3', 10, 5);
  setConn(s, 'RB-J2', { minutes: 8 });
  setConn(s, 'J2-J3', { minutes: 10 });
  return s;
}

export function scenarioC(): Scenario {
  const s = scenarioA();
  s.id = 'C'; s.label = 'C';
  s.title = 'Preserve resources when ventilation is already stable';
  s.summary = 'The vent corridor is stable; repairing the fan would not help anyone.';
  setLocHazard(s, 'J3', 10, 0);
  (action(s, 'repair-fan-3').effect as { rate: number }).rate = 0;
  return s;
}

export function scenarioD(inspectionDuration = 1): Scenario {
  const s = scenarioA();
  s.id = 'D'; s.label = 'D';
  s.title = 'Decide whether checking the bypass is worth the time';
  s.summary = 'Gate B and Fan 3 each need the whole battery pack. A bypass to Deep Homes may be open, but only an inspection at the bypass can tell.';
  setLocHazard(s, 'RA', 2, 5);
  setLocHazard(s, 'J3', 10, 6);
  (action(s, 'repair-fan-3').effect as { rate: number }).rate = 0;
  setConn(s, 'RB-J2', { minutes: 8 });
  setConn(s, 'J2-J3', { minutes: 8 });
  action(s, 'open-gate-b').batteries = 4;
  action(s, 'open-gate-b').description = 'Gate B has a failed manual release and needs a powered opening: two minutes of work and four batteries.';
  setConn(s, 'RA-X3', { state: 'unknown', note: 'Deep Homes bypass: unknown (open or blocked)' });
  s.knowledge = { unknown: { connection: 'RA-X3', possible: ['open', 'blocked'] } };
  const insp = action(s, 'inspect-bypass');
  insp.offered = true;
  insp.duration = inspectionDuration;
  const r = s.reports.find((r) => r.id === 'rep-bypass')!;
  r.value = 'A resident representative says it may have been cleared; not checked';
  r.state = 'unconfirmed';
  r.observedAt = -25;
  s.reports.find((r) => r.id === 'rep-gate')!.value = 'Blocked; manual release failed — powered opening needed';
  return s;
}

export function scenarioE(): Scenario {
  const s = scenarioA();
  s.id = 'E'; s.label = 'E';
  s.title = 'Protect the people who cannot be evacuated';
  s.summary = 'Gate B has collapsed and the bypass is blocked: no tested action gives Deep Homes an accessible route.';
  setConn(s, 'RA-G', { note: 'Gate B: collapsed — no available action opens it' });
  action(s, 'open-gate-b').offered = false;
  s.crew.batteries = 6;
  action(s, 'ventilate-RA').offered = true;
  s.reports.find((r) => r.id === 'rep-gate')!.value = 'Collapsed; cannot be opened with available equipment';
  return s;
}

export const SCENARIO_BUILDERS: Record<string, () => Scenario> = {
  A: scenarioA,
  B: scenarioB,
  C: scenarioC,
  D: () => scenarioD(1),
  E: scenarioE,
};

export function getScenario(id: string): Scenario {
  const b = SCENARIO_BUILDERS[id];
  if (!b) throw new Error(`unknown scenario ${id}`);
  return b();
}

export function defaultTruth(s: Scenario, bypass: string = 'open'): Truth {
  const connectionStates: Record<string, string> = {};
  for (const c of s.connections) connectionStates[c.id] = c.state === 'unknown' ? bypass : c.state;
  const deliveryActual: Record<string, number | null> = {};
  for (const d of s.deliveries) deliveryActual[d.id] = d.minute;
  return { connectionStates, deliveryActual };
}

export { clone };
