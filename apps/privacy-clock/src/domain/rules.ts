/**
 * Pure rule checks for requests, breaches and tasks. Each returns a message to show (or null when allowed); the
 * async domain functions throw a RuleError with it. Unit-tested in rules.test.ts.
 */
import { formatDate, toMs } from '@x10/shared/lib';

import { articles, law, rules } from '../config';
import type { BreachCase, Decision, PrivacyRequest, RequestStatus, RiskLevel, Task } from '../model';
import { breachDeadline, breachIsLate, extendedDueAt } from './clock';

/* ------------------------------------------------------------------ requests */

export function isOpenRequest(r: Pick<PrivacyRequest, 'status'>): boolean {
  return r.status !== 'closed' && r.status !== 'refused';
}

export interface ExtensionInput {
  months: number;
  reason: string;
  /** When the person was told about the extension and why. */
  notifiedAt: string | null;
  now: Date | string;
}

/**
 * Rule 2. Up to two further months from the original due date, only with a reason, and only if the person is told
 * before the original due date. An extension recorded after the original due date is blocked.
 */
export function checkExtension(r: PrivacyRequest, x: ExtensionInput): string | null {
  if (!isOpenRequest(r)) return 'A closed request cannot be extended.';
  if (r.extendedDueAt) return `This request is already extended, to ${formatDate(r.extendedDueAt)}.`;
  const due = toMs(r.dueAt);
  const now = toMs(x.now);
  if (now > due)
    return `The original due date (${formatDate(r.dueAt)}) has passed. An extension has to be notified to the person within the first month (${articles.request}), so this request can no longer be extended.`;
  if (!Number.isInteger(x.months) || x.months < 1 || x.months > law.extensionMaxMonths)
    return `An extension is one or two further months (${articles.request}).`;
  if (x.reason.trim().length < rules.extensionReasonMin)
    return `Give the reason the request is complex or numerous (at least ${rules.extensionReasonMin} characters).`;
  if (!x.notifiedAt) return 'Record when the person was told about the extension.';
  const told = toMs(x.notifiedAt);
  if (Number.isNaN(told)) return 'The notification time is not a valid date.';
  if (told > now) return 'The notification time cannot be in the future.';
  if (told < toMs(r.receivedAt)) return 'The notification cannot be before the request was received.';
  if (told > due)
    return `The person has to be told before the original due date (${formatDate(r.dueAt)}). Telling them later does not extend the deadline.`;
  return null;
}

/** The extended due date the officer would get (shown live in the form). */
export function previewExtension(r: PrivacyRequest, months: number): string {
  return extendedDueAt(r.dueAt, months);
}

/** Forward moves through the stages, plus back to "in progress" from "ready". Closing has its own checks. */
const NEXT: Record<RequestStatus, RequestStatus[]> = {
  new: ['verifying', 'in_progress'],
  verifying: ['in_progress'],
  in_progress: ['ready'],
  ready: ['in_progress'],
  closed: [],
  refused: [],
};

export function canMoveTo(from: RequestStatus, to: RequestStatus): boolean {
  return NEXT[from].includes(to);
}

export function nextStages(from: RequestStatus): RequestStatus[] {
  return NEXT[from];
}

/** Tasks that still block an erasure: erase tasks that are open or blocked. */
export function openEraseTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.action === 'erase' && t.status !== 'done');
}

/** Rule 6 and the outcome: an erasure request cannot close while any erasure task is open. */
export function checkClose(r: PrivacyRequest, tasks: Task[], outcome: string): string | null {
  if (!isOpenRequest(r)) return 'This request is already closed.';
  if (outcome.trim().length < rules.outcomeMin) return `Write the outcome sent to the person (at least ${rules.outcomeMin} characters).`;
  if (r.type === 'erasure') {
    const open = openEraseTasks(tasks.filter((t) => t.parentType === 'request' && t.parentId === r.id));
    if (open.length) return `An erasure request cannot close while ${open.length === 1 ? 'an erase task is' : `${open.length} erase tasks are`} still open.`;
  }
  return null;
}

export function checkRefuse(r: PrivacyRequest, reason: string): string | null {
  if (!isOpenRequest(r)) return 'This request is already closed.';
  if (reason.trim().length < rules.outcomeMin) return `Write the reason for refusing, as sent to the person (at least ${rules.outcomeMin} characters).`;
  return null;
}

/* ------------------------------------------------------------------ breaches */

export interface DecisionInput {
  riskLevel: RiskLevel | null;
  riskRationale: string;
  decision: Decision;
}

/** Rule 3: a decision needs a risk level; "document only" needs a rationale of at least 40 characters. */
export function checkDecision(b: BreachCase, x: DecisionInput): string | null {
  if (b.status === 'closed') return 'This breach is closed.';
  if (x.decision === 'pending') return 'Choose a decision.';
  if (!x.riskLevel) return 'Assess the risk to people first.';
  if (x.decision === 'document_only' && x.riskRationale.trim().length < rules.rationaleMin)
    return `"Document only" needs the reasons the breach is unlikely to result in a risk (at least ${rules.rationaleMin} characters, ${articles.documentation}).`;
  if (b.authorityNotifiedAt && x.decision === 'document_only') return 'The authority has already been notified; the decision cannot become "document only".';
  return null;
}

/** A hint when the decision does not follow the usual reading of the risk level. Never blocks. */
export function decisionHint(risk: RiskLevel | null, decision: Decision): string | null {
  if (!risk || decision === 'pending') return null;
  if (risk === 'high_risk' && decision !== 'notify_both') return `High risk usually means telling the people affected as well (${articles.subjects}).`;
  if (risk === 'risk' && decision === 'document_only') return `A breach likely to result in a risk is usually notified to the authority (${articles.breach}).`;
  if (risk === 'unlikely' && decision !== 'document_only') return 'Unlikely to result in a risk: notifying is allowed, but not required.';
  return null;
}

export interface NotifyInput {
  at: string | null;
  authorityRef: string;
  delayReason: string;
  now: Date | string;
}

/** Notifying the authority: only for a notify decision; after 72 h it needs reasons for the delay. */
export function checkNotifyAuthority(b: BreachCase, x: NotifyInput): string | null {
  if (b.status === 'closed') return 'This breach is closed.';
  if (b.decision !== 'notify_authority' && b.decision !== 'notify_both') return 'Record a decision to notify first.';
  if (b.authorityNotifiedAt) return 'The authority notification is already recorded.';
  if (!x.at) return 'Record when the authority was notified.';
  const at = toMs(x.at);
  if (Number.isNaN(at)) return 'The notification time is not a valid date.';
  if (at > toMs(x.now)) return 'The notification time cannot be in the future.';
  if (at < toMs(b.awareAt)) return 'The notification cannot be before the breach became known.';
  if (at > toMs(breachDeadline(b.awareAt)) && x.delayReason.trim().length < rules.delayReasonMin)
    return `Late: reasons for the delay are required (${articles.breach}, at least ${rules.delayReasonMin} characters).`;
  return null;
}

export function checkNotifySubjects(b: BreachCase, at: string | null, now: Date | string): string | null {
  if (b.status === 'closed') return 'This breach is closed.';
  if (b.decision !== 'notify_both') return 'Telling the people affected is recorded only for a "notify authority and people" decision.';
  if (b.subjectsNotifiedAt) return 'Telling the people affected is already recorded.';
  if (!at) return 'Record when the people affected were told.';
  if (toMs(at) > toMs(now)) return 'The time cannot be in the future.';
  if (toMs(at) < toMs(b.awareAt)) return 'The time cannot be before the breach became known.';
  return null;
}

/** Closing a breach: a decision is required (Art. 33(5)), and every notification that decision calls for. */
export function checkCloseBreach(b: BreachCase, now: Date | string): string | null {
  if (b.status === 'closed') return 'This breach is already closed.';
  if (b.decision === 'pending') return `Record a decision before closing: every breach is documented with its decision (${articles.documentation}).`;
  if (b.decision === 'document_only' && (b.riskRationale ?? '').trim().length < rules.rationaleMin)
    return `"Document only" needs a risk rationale of at least ${rules.rationaleMin} characters.`;
  if (b.decision !== 'document_only' && !b.authorityNotifiedAt) return 'Record the authority notification before closing.';
  if (b.decision === 'notify_both' && !b.subjectsNotifiedAt) return 'Record telling the people affected before closing.';
  if (breachIsLate(b, now) && (b.delayReason ?? '').trim().length < rules.delayReasonMin) return 'Late: record the reasons for the delay before closing.';
  return null;
}

/** Awareness is when the breach was confirmed; it cannot be in the future or before the first report. */
export function checkAwareness(b: BreachCase, at: string | null, now: Date | string): string | null {
  if (b.status === 'closed') return 'This breach is closed.';
  if (b.authorityNotifiedAt) return 'The authority has been notified; the awareness time can no longer change.';
  if (!at || Number.isNaN(toMs(at))) return 'Enter when the breach was confirmed.';
  if (toMs(at) > toMs(now)) return 'The awareness time cannot be in the future.';
  return null;
}

/* ------------------------------------------------------------------ tasks */

export function checkTaskUpdate(t: Task, status: Task['status'], note: string): string | null {
  if (t.status === 'done' && status !== 'done') return 'This task is done.';
  if (status === 'blocked' && note.trim().length < 5) return 'Say what blocks it (at least 5 characters).';
  return null;
}
