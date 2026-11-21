import type { BreachStatus, Channel, Decision, EventKind, RequestStatus, RequestType, RiskLevel, TaskAction, TaskStatus } from './model';

export const TYPE_LABEL: Record<RequestType, string> = {
  access: 'Access',
  erasure: 'Erasure',
  rectification: 'Rectification',
  portability: 'Portability',
  objection: 'Objection',
  restriction: 'Restriction',
};

export const TYPE_ARTICLE: Record<RequestType, string> = {
  access: 'Art. 15',
  erasure: 'Art. 17',
  rectification: 'Art. 16',
  portability: 'Art. 20',
  objection: 'Art. 21',
  restriction: 'Art. 18',
};

export const CHANNEL_LABEL: Record<Channel, string> = { email: 'Email', web_form: 'Web form', letter: 'Letter', phone: 'Phone' };

export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'New',
  verifying: 'Verifying',
  in_progress: 'In progress',
  ready: 'Ready to send',
  closed: 'Closed',
  refused: 'Refused',
};

export const BREACH_STATUS_LABEL: Record<BreachStatus, string> = { open: 'Open', contained: 'Contained', closed: 'Closed' };

export const RISK_LABEL: Record<RiskLevel, string> = { unlikely: 'Unlikely to result in a risk', risk: 'Risk', high_risk: 'High risk' };
export const RISK_SHORT: Record<RiskLevel, string> = { unlikely: 'Unlikely', risk: 'Risk', high_risk: 'High risk' };

export const DECISION_LABEL: Record<Decision, string> = {
  pending: 'Pending',
  notify_authority: 'Notify authority',
  notify_both: 'Notify authority and people',
  document_only: 'Document only',
};

export const ACTION_LABEL: Record<TaskAction, string> = {
  search: 'Search',
  export: 'Export',
  erase: 'Erase',
  rectify: 'Rectify',
  restrict: 'Restrict',
  contain: 'Contain',
  other: 'Other',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { open: 'Open', done: 'Done', blocked: 'Blocked' };

export const EVENT_LABEL: Record<EventKind, string> = {
  created: 'Logged',
  verified: 'Identity verified',
  status: 'Status',
  extended: 'Extended',
  task_done: 'Task done',
  task_blocked: 'Task blocked',
  reassigned: 'Reassigned',
  decision: 'Decision',
  notified: 'Notified',
  closed: 'Closed',
  note: 'Note',
};

/** Breach data categories offered at report time (free text is allowed too). */
export const BREACH_CATEGORIES = ['contact details', 'financial', 'health', 'credentials', 'identity documents', 'location', 'special category'];
