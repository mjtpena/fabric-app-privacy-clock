/**
 * App data types and runtime entity definitions. Keep these in step with rayfin/data/*.ts:
 * every field listed here must exist on the entity class with the matching decorator.
 * Dates are ISO strings in the app; optional fields are `| null`.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

/** The same numbers as the @text decorators on the entities. */
export const limits = {
  ref: { min: 3, max: 12 },
  subjectLabel: { min: 2, max: 120 },
  extensionReason: { min: 20, max: 400 },
  outcome: { min: 10, max: 600 },
  breachTitle: { min: 3, max: 120 },
  categories: { max: 200 },
  riskRationale: { max: 1000 },
  authorityRef: { max: 60 },
  delayReason: { min: 20, max: 600 },
  systemName: { min: 3, max: 80 },
  ownerName: { min: 1, max: 100 },
  holds: { max: 300 },
  taskTitle: { min: 3, max: 150 },
  taskNote: { max: 600 },
  eventText: { min: 1, max: 600 },
} as const;

export const REQUEST_TYPES = ['access', 'erasure', 'rectification', 'portability', 'objection', 'restriction'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const CHANNELS = ['email', 'web_form', 'letter', 'phone'] as const;
export type Channel = (typeof CHANNELS)[number];

export const REQUEST_STATUSES = ['new', 'verifying', 'in_progress', 'ready', 'closed', 'refused'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const RISK_LEVELS = ['unlikely', 'risk', 'high_risk'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const DECISIONS = ['pending', 'notify_authority', 'notify_both', 'document_only'] as const;
export type Decision = (typeof DECISIONS)[number];

export const BREACH_STATUSES = ['open', 'contained', 'closed'] as const;
export type BreachStatus = (typeof BREACH_STATUSES)[number];

export const PARENT_TYPES = ['request', 'breach'] as const;
export type ParentType = (typeof PARENT_TYPES)[number];

export const TASK_ACTIONS = ['search', 'export', 'erase', 'rectify', 'restrict', 'contain', 'other'] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

export const TASK_STATUSES = ['open', 'done', 'blocked'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const EVENT_KINDS = [
  'created',
  'verified',
  'status',
  'extended',
  'task_done',
  'task_blocked',
  'reassigned',
  'decision',
  'notified',
  'closed',
  'note',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface PrivacyRequest {
  id: string;
  ref: string;
  type: RequestType;
  subjectLabel: string;
  channel: Channel;
  receivedAt: string;
  identityVerifiedAt: string | null;
  dueAt: string;
  extendedDueAt: string | null;
  extensionReason: string | null;
  extensionNotifiedAt: string | null;
  status: RequestStatus;
  outcome: string | null;
  closedAt: string | null;
  ownerSub: string;
}

export interface BreachCase {
  id: string;
  ref: string;
  title: string;
  awareAt: string;
  reportedBy: string;
  officerSub: string;
  categories: string | null;
  approxSubjects: number;
  approxRecords: number;
  riskLevel: RiskLevel | null;
  riskRationale: string | null;
  authorityNotifiedAt: string | null;
  authorityRef: string | null;
  subjectsNotifiedAt: string | null;
  delayReason: string | null;
  decision: Decision;
  decisionBy: string | null;
  status: BreachStatus;
  containedAt: string | null;
  closedAt: string | null;
}

export interface DataSystem {
  id: string;
  name: string;
  ownerSub: string;
  ownerName: string;
  holds: string | null;
  officerSub: string;
}

export interface Task {
  id: string;
  parentType: ParentType;
  parentId: string;
  systemId: string | null;
  action: TaskAction;
  title: string;
  assigneeSub: string;
  officerSub: string;
  status: TaskStatus;
  note: string | null;
  dueAt: string;
  doneAt: string | null;
}

/** A logbook row. Named LogEvent in the app so it does not shadow the DOM's Event type; the entity is "Event". */
export interface LogEvent {
  id: string;
  parentType: ParentType;
  parentId: string;
  kind: EventKind;
  at: string;
  bySub: string;
  text: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  PrivacyRequest: PrivacyRequest;
  BreachCase: BreachCase;
  DataSystem: DataSystem;
  Task: Task;
  Event: LogEvent;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  PrivacyRequest: {
    name: 'PrivacyRequest',
    fields: {
      id: 'uuid',
      ref: 'text',
      type: 'set',
      subjectLabel: 'text',
      channel: 'set',
      receivedAt: 'date',
      identityVerifiedAt: 'date',
      dueAt: 'date',
      extendedDueAt: 'date',
      extensionReason: 'text',
      extensionNotifiedAt: 'date',
      status: 'set',
      outcome: 'text',
      closedAt: 'date',
      ownerSub: 'text',
    },
  },
  BreachCase: {
    name: 'BreachCase',
    fields: {
      id: 'uuid',
      ref: 'text',
      title: 'text',
      awareAt: 'date',
      reportedBy: 'text',
      officerSub: 'text',
      categories: 'text',
      approxSubjects: 'int',
      approxRecords: 'int',
      riskLevel: 'set',
      riskRationale: 'text',
      authorityNotifiedAt: 'date',
      authorityRef: 'text',
      subjectsNotifiedAt: 'date',
      delayReason: 'text',
      decision: 'set',
      decisionBy: 'text',
      status: 'set',
      containedAt: 'date',
      closedAt: 'date',
    },
  },
  DataSystem: {
    name: 'DataSystem',
    fields: { id: 'uuid', name: 'text', ownerSub: 'text', ownerName: 'text', holds: 'text', officerSub: 'text' },
  },
  Task: {
    name: 'Task',
    fields: {
      id: 'uuid',
      parentType: 'set',
      parentId: 'uuid',
      systemId: 'uuid',
      action: 'set',
      title: 'text',
      assigneeSub: 'text',
      officerSub: 'text',
      status: 'set',
      note: 'text',
      dueAt: 'date',
      doneAt: 'date',
    },
  },
  Event: {
    name: 'Event',
    fields: { id: 'uuid', parentType: 'set', parentId: 'uuid', kind: 'set', at: 'date', bySub: 'text', text: 'text' },
  },
};
