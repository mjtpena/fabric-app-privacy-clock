/**
 * Data subject requests: intake, stages, extension, closing. Every change writes a logbook event.
 */
import { NotFoundError, PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, DAY, formatDate, formatDateTime, toMs } from '@x10/shared/lib';

import { rules } from '../config';
import { ACTION_LABEL, CHANNEL_LABEL, STATUS_LABEL, TYPE_LABEL } from '../labels';
import { limits, type Channel, type DataSystem, type PrivacyRequest, type RequestStatus, type RequestType, type Schema, type TaskAction } from '../model';
import { requireOfficer, requireRequestOfficer } from './access';
import { extendedDueAt, requestDueAt } from './clock';
import { nextRef } from './data';
import { logEvent } from './events';
import { canMoveTo, checkClose, checkExtension, checkRefuse, type ExtensionInput } from './rules';

const parentOf = (r: PrivacyRequest) => ({ type: 'request' as const, id: r.id });

/** What each request type asks a system owner to do. */
export const ACTION_FOR: Record<RequestType, TaskAction> = {
  access: 'export',
  erasure: 'erase',
  rectification: 'rectify',
  portability: 'export',
  objection: 'restrict',
  restriction: 'restrict',
};

export function taskTitle(ref: string, action: TaskAction, systemName: string): string {
  const verb: Record<TaskAction, string> = {
    search: 'search',
    export: 'find and export the data in',
    erase: 'erase the data in',
    rectify: 'correct the data in',
    restrict: 'restrict processing in',
    contain: 'contain the breach in',
    other: 'act on',
  };
  return `${ref}: ${verb[action]} ${systemName}`.slice(0, limits.taskTitle.max);
}

/** Tasks are due a week before the response (never in the past, never after the response is due). */
export function taskDueAt(responseDue: string, now: Date): string {
  const lead = toMs(responseDue) - rules.taskLeadDays * DAY;
  const floor = now.getTime() + DAY;
  return new Date(Math.min(toMs(responseDue), Math.max(lead, floor))).toISOString();
}

export interface RequestInput {
  type: RequestType;
  subjectLabel: string;
  channel: Channel;
  receivedAt: string | null;
  systemIds: string[];
}

export function validateRequest(x: RequestInput, now: Date): Partial<Record<keyof RequestInput, string>> {
  const errors: Partial<Record<keyof RequestInput, string>> = {};
  const label = checkText(x.subjectLabel, { ...limits.subjectLabel, label: 'Subject label' });
  if (label) errors.subjectLabel = label;
  if (!x.receivedAt || Number.isNaN(toMs(x.receivedAt))) errors.receivedAt = 'Enter when the request was received.';
  else if (toMs(x.receivedAt) > now.getTime() + 60_000) errors.receivedAt = 'The received date cannot be in the future.';
  return errors;
}

/** Intake: log a request with its due date (rule 1) and one task per selected system. */
export async function createRequest(store: DataStore<Schema>, me: Person, x: RequestInput, now = new Date()): Promise<PrivacyRequest> {
  requireOfficer(me, 'log a privacy request');
  const errors = validateRequest(x, now);
  const first = Object.values(errors)[0];
  if (first) throw new RuleError(first);
  const existing = await store.repo('PrivacyRequest').list();
  const ref = nextRef('DSR', existing.map((r) => r.ref));
  const receivedAt = new Date(toMs(x.receivedAt!)).toISOString();
  const dueAt = requestDueAt(receivedAt);
  const req = await store.repo('PrivacyRequest').create({
    ref,
    type: x.type,
    subjectLabel: x.subjectLabel.trim(),
    channel: x.channel,
    receivedAt,
    identityVerifiedAt: null,
    dueAt,
    extendedDueAt: null,
    extensionReason: null,
    extensionNotifiedAt: null,
    status: 'new',
    outcome: null,
    closedAt: null,
    ownerSub: me.sub,
  });
  const systems = (await store.repo('DataSystem').list()).filter((s) => x.systemIds.includes(s.id));
  await logEvent(
    store,
    me,
    parentOf(req),
    'created',
    `${TYPE_LABEL[req.type]} request received by ${CHANNEL_LABEL[req.channel].toLowerCase()} on ${formatDateTime(receivedAt)}. Due ${formatDate(dueAt)}.`,
    now,
  );
  await createTasks(store, me, req, systems, now);
  return req;
}

async function createTasks(store: DataStore<Schema>, me: Person, req: PrivacyRequest, systems: DataSystem[], now: Date) {
  if (!systems.length) return;
  const action = ACTION_FOR[req.type];
  const due = taskDueAt(req.extendedDueAt ?? req.dueAt, now);
  for (const s of systems) {
    await store.repo('Task').create({
      parentType: 'request',
      parentId: req.id,
      systemId: s.id,
      action,
      title: taskTitle(req.ref, action, s.name),
      assigneeSub: s.ownerSub,
      officerSub: me.sub,
      status: 'open',
      note: null,
      dueAt: due,
      doneAt: null,
    });
  }
  await logEvent(
    store,
    me,
    parentOf(req),
    'note',
    `${ACTION_LABEL[action]} assigned on ${systems.map((s) => `${s.name} (${s.ownerName})`).join(', ')}; due ${formatDate(due)}.`,
    new Date(now.getTime() + 1),
  );
}

/** Add tasks for more systems to an open request. */
export async function addRequestTasks(store: DataStore<Schema>, me: Person, requestId: string, systemIds: string[], now = new Date()) {
  const req = await getRequest(store, requestId);
  requireRequestOfficer(me, req);
  if (req.status === 'closed' || req.status === 'refused') throw new RuleError('This request is closed.');
  const have = new Set((await store.repo('Task').list({ where: { parentId: req.id } })).map((t) => t.systemId));
  const systems = (await store.repo('DataSystem').list()).filter((s) => systemIds.includes(s.id) && !have.has(s.id));
  if (!systems.length) throw new RuleError('Those systems already have a task for this request.');
  await createTasks(store, me, req, systems, now);
}

export async function getRequest(store: DataStore<Schema>, id: string): Promise<PrivacyRequest> {
  const r = await store.repo('PrivacyRequest').get(id);
  if (!r) throw new NotFoundError('Request', id);
  return r;
}

export async function verifyIdentity(store: DataStore<Schema>, me: Person, id: string, at: string, now = new Date()): Promise<PrivacyRequest> {
  const r = await getRequest(store, id);
  requireRequestOfficer(me, r);
  if (r.status === 'closed' || r.status === 'refused') throw new RuleError('This request is closed.');
  if (r.identityVerifiedAt) throw new RuleError('Identity is already verified.');
  if (Number.isNaN(toMs(at)) || toMs(at) > now.getTime() + 60_000) throw new RuleError('Enter when the identity was verified (not in the future).');
  const status: RequestStatus = r.status === 'new' || r.status === 'verifying' ? 'in_progress' : r.status;
  const updated = await store.repo('PrivacyRequest').update(r.id, { identityVerifiedAt: new Date(toMs(at)).toISOString(), status });
  await logEvent(
    store,
    me,
    parentOf(r),
    'verified',
    `Identity verified ${formatDateTime(at)}. The clock still runs from receipt.${status !== r.status ? ` Status ${STATUS_LABEL[r.status]} → ${STATUS_LABEL[status]}.` : ''}`,
    now,
  );
  return updated;
}

export async function moveRequest(store: DataStore<Schema>, me: Person, id: string, to: RequestStatus, now = new Date()): Promise<PrivacyRequest> {
  const r = await getRequest(store, id);
  requireRequestOfficer(me, r);
  if (!canMoveTo(r.status, to)) throw new RuleError(`A request cannot move from ${STATUS_LABEL[r.status]} to ${STATUS_LABEL[to]}.`);
  const updated = await store.repo('PrivacyRequest').update(r.id, { status: to });
  await logEvent(store, me, parentOf(r), 'status', `Status ${STATUS_LABEL[r.status]} → ${STATUS_LABEL[to]}.`, now);
  return updated;
}

/** Rule 2: extend by one or two months from the original due date, if the person was told in time. */
export async function extendRequest(
  store: DataStore<Schema>,
  me: Person,
  id: string,
  x: Omit<ExtensionInput, 'now'>,
  now = new Date(),
): Promise<PrivacyRequest> {
  const r = await getRequest(store, id);
  requireRequestOfficer(me, r);
  const msg = checkExtension(r, { ...x, now });
  if (msg) throw new RuleError(msg);
  const to = extendedDueAt(r.dueAt, x.months);
  const updated = await store.repo('PrivacyRequest').update(r.id, {
    extendedDueAt: to,
    extensionReason: x.reason.trim().slice(0, limits.extensionReason.max),
    extensionNotifiedAt: new Date(toMs(x.notifiedAt!)).toISOString(),
  });
  await logEvent(
    store,
    me,
    parentOf(r),
    'extended',
    `Extended by ${x.months} ${x.months === 1 ? 'month' : 'months'}: due ${formatDate(r.dueAt)} → ${formatDate(to)}. Person told ${formatDateTime(x.notifiedAt)}. Reason: ${x.reason.trim()}`,
    now,
  );
  return updated;
}

export async function closeRequest(store: DataStore<Schema>, me: Person, id: string, outcome: string, now = new Date()): Promise<PrivacyRequest> {
  const r = await getRequest(store, id);
  requireRequestOfficer(me, r);
  const tasks = await store.repo('Task').list({ where: { parentId: r.id } });
  const msg = checkClose(r, tasks, outcome);
  if (msg) throw new RuleError(msg);
  const updated = await store.repo('PrivacyRequest').update(r.id, {
    status: 'closed',
    outcome: outcome.trim().slice(0, limits.outcome.max),
    closedAt: now.toISOString(),
  });
  const late = now.getTime() > toMs(r.extendedDueAt ?? r.dueAt);
  await logEvent(store, me, parentOf(r), 'closed', `Closed${late ? ' after the due date' : ' in time'}. Outcome: ${outcome.trim()}`, now);
  return updated;
}

export async function refuseRequest(store: DataStore<Schema>, me: Person, id: string, reason: string, now = new Date()): Promise<PrivacyRequest> {
  const r = await getRequest(store, id);
  requireRequestOfficer(me, r);
  const msg = checkRefuse(r, reason);
  if (msg) throw new RuleError(msg);
  const updated = await store.repo('PrivacyRequest').update(r.id, {
    status: 'refused',
    outcome: reason.trim().slice(0, limits.outcome.max),
    closedAt: now.toISOString(),
  });
  await logEvent(store, me, parentOf(r), 'closed', `Refused. Reason given to the person: ${reason.trim()}`, now);
  return updated;
}

/** A free note on the logbook, by the officer or anyone with a task on the request. */
export async function addRequestNote(store: DataStore<Schema>, me: Person, id: string, text: string, now = new Date()) {
  const r = await getRequest(store, id);
  const tasks = await store.repo('Task').list({ where: { parentId: r.id } });
  if (r.ownerSub !== me.sub && !tasks.some((t) => t.assigneeSub === me.sub)) {
    throw new PermissionError('Only the privacy officer or someone with a task on this request can add a note.');
  }
  if (text.trim().length < 3) throw new RuleError('Write a note of at least 3 characters.');
  return logEvent(store, me, parentOf(r), 'note', text, now);
}
