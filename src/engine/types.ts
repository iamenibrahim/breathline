// Breathline engine types. Planning and simulation are independent of React.
// Simulation — illustrative conditions and assumptions. Hazard indices are fictional planning units.

export type LocId = string;
export type ConnId = string;
export type GroupId = string;
export type ActionId = string;
export type PassageState = 'open' | 'blocked';

export interface HazardSpec {
  initial: number;
  rate: number; // original growth per minute
}

export interface LocationDef {
  id: LocId;
  name: string;
  level: number;
  x: number;
  y: number;
  capacity: number; // resident occupancy capacity
  hazard: HazardSpec;
  role: string;
}

export interface ConnectionDef {
  id: ConnId;
  a: LocId;
  b: LocId;
  minutes: number;
  accessible: boolean; // false for stairs (not usable by step-free groups)
  kind: 'passage' | 'stairs';
  // Planner-visible state. 'unknown' only when knowledge declares it unknown; truth lives outside the scenario.
  state: 'open' | 'blocked' | 'unknown';
  capacity: number; // concurrent residents, one shared pool for both directions
  hazard: HazardSpec;
  note?: string;
}

export interface GroupDef {
  id: GroupId;
  name: string;
  count: number;
  location: LocId;
  mobility: 'wheelchair' | 'standard';
  stepFree: boolean; // cannot use stairs
  escortRequired: boolean;
  needsAccessibleEntry: boolean;
  needsAssistanceOnArrival: boolean;
  instructionsAvailableAt: number;
  context: string;
}

export type ChecklistState = 'present' | 'absent' | 'unconfirmed';

export interface ShelterChecklist {
  accessibleEntry: ChecklistState;
  assistanceOnArrival: ChecklistState;
  ventilationOperating: ChecklistState;
}

export interface ShelterDef {
  location: LocId;
  name: string;
  places: number;
  placesConfirmed: boolean;
  checklist: ShelterChecklist;
  steward: string;
}

export interface CrewDef {
  id: string;
  name: string;
  start: LocId;
  batteries: number;
  packSize: number;
  toolkit: boolean;
  qualifications: string[];
}

export type Effect =
  | { type: 'openConnection'; connection: ConnId }
  | { type: 'setRate'; location: LocId; rate: number }
  | { type: 'reveal'; connection: ConnId };

export type ActionKind = 'open' | 'repair' | 'inspect' | 'ventilate';

export interface ActionDef {
  id: ActionId;
  kind: ActionKind;
  label: string;
  workLocation: LocId;
  duration: number;
  batteries: number;
  requiresToolkit: boolean;
  effect: Effect;
  offered: boolean;
  description: string;
}

export interface DeliveryDef {
  id: string;
  resource: 'batteries' | 'places';
  quantity: number;
  location: LocId;
  minute: number;
  source: string;
  confirmed: boolean;
}

export interface Report {
  id: string;
  target: string;
  value: string;
  observedAt: number; // minutes relative to crisis start (negative = before)
  source: string;
  state: 'confirmed' | 'unconfirmed';
}

export interface Knowledge {
  unknown: null | { connection: ConnId; possible: PassageState[] };
}

export interface Scenario {
  id: string; // stable fixture id (display metadata only; the planner never reads it)
  label: string;
  title: string;
  summary: string;
  horizon: number;
  threshold: number;
  locations: LocationDef[];
  connections: ConnectionDef[];
  groups: GroupDef[];
  shelters: ShelterDef[];
  crew: CrewDef;
  actions: ActionDef[];
  deliveries: DeliveryDef[];
  knowledge: Knowledge;
  instructionsConfirmed: Record<GroupId, boolean>;
  reports: Report[];
  hazardMultiplier?: number; // stress: applies to positive original growth rates only
}

/** Hidden simulator truth. Never passed to planning. */
export interface Truth {
  connectionStates: Record<ConnId, string>; // may contain a value outside the declared states (test of pause)
  deliveryActual: Record<string, number | null>; // actual minute; null = never arrives
}

// ---------------------------------------------------------------- plans

export interface Leg {
  from: LocId;
  to: LocId;
  conn: ConnId | null; // null => wait at `from`
  start: number;
  end: number;
}

export interface BatterySource {
  location: string; // 'pack' or a delivery location
  deliveryId?: string;
  qty: number;
}

export type CrewActivityKind = 'travel' | 'wait' | 'work' | 'inspect' | 'escort';

export interface CrewActivity {
  id: string;
  kind: CrewActivityKind;
  start: number;
  end: number;
  from: LocId;
  to: LocId;
  legs: Leg[];
  actionId?: ActionId;
  groupId?: GroupId;
  batteries?: BatterySource[];
  reason?: string;
}

export interface Journey {
  groupId: GroupId;
  shelter: LocId;
  departure: number;
  arrival: number;
  legs: Leg[];
  escorted: boolean;
  exposure: number; // per person, hazard-index minutes
  waitingExposure: number;
  travelExposure: number;
}

export interface EffectRecord {
  actionId: ActionId;
  at: number;
  effect: Effect;
  revealed?: PassageState; // for inspection effects inside a policy branch
}

export interface Objective {
  served: number;
  protectedPM: number;
  maxExposure: number;
  busy: number;
  batteries: number;
  finalArrival: number;
  tieKey: string;
}

export interface Schedule {
  crew: CrewActivity[];
  journeys: Journey[];
  effects: EffectRecord[];
  unresolved: GroupId[];
  protectedMinutes: Record<GroupId, number>;
  exposureUnresolved: Record<GroupId, number>;
  objective: Objective;
  tasks: string[];
}

export type SearchStatus = 'exhaustive' | 'best-before-limit' | 'proven-infeasible' | 'none-before-limit';

export interface SearchInfo {
  status: SearchStatus;
  explored: number; // crew plans evaluated
  assignments: number; // joint resident assignment searches
  elapsedMs: number;
  budget: { maxPlans: number; timeLimitMs: number };
  scope: string[];
  groupsEverServed: GroupId[];
}

export interface PlanResult {
  kind: 'schedule';
  id: string;
  inputRevision: number;
  inputHash: string;
  schedule: Schedule;
  search: SearchInfo;
  restriction?: string;
}

export interface PolicyObjective {
  nOpen: number;
  nBlocked: number;
  min: number;
  sum: number;
  protMin: number | null;
  protSum: number | null;
  worstExposure: number;
  busyMax: number;
  busySum: number;
  batMax: number;
  batSum: number;
  latestArrival: number;
  tieKey: string;
}

export interface PolicyResult {
  kind: 'policy';
  id: string;
  inputRevision: number;
  inputHash: string;
  connection: ConnId;
  inspection: null | {
    actionId: ActionId;
    location: LocId;
    start: number;
    end: number; // observation minute
    prefixCrewCount: number; // crew activities [0, prefixCrewCount) are shared, the last is the inspection
  };
  commonGroups: GroupId[]; // journeys departing before the observation (identical in both states)
  branches: Record<PassageState, Schedule>; // full schedules (prefix + suffix) per state
  objective: PolicyObjective;
  search: SearchInfo;
  noInspection: PolicyObjective; // best response restricted to confirmed routes
  restriction?: string;
}

export type AnyPlan = PlanResult | PolicyResult;
