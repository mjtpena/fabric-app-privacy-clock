/**
 * Personal data breaches: report, confirm awareness, assess, decide, notify, contain, close (the Escapement).
 */
import { NotFoundError, PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, commaList, formatDateTime, toMs } from '@x10/shared/lib';

import { DECISION_LABEL, RISK_LABEL } from '../labels';
import { limits, type BreachCase, type Schema } from '../model';
import { isOfficer, requireBreachOfficer } from './access';
import { breachDeadline } from './clock';
import { nextRef, officers } from './data';
import { logEvent } from './events';
import {
  checkAwareness,
  checkCloseBreach,
  checkDecision,
  checkNotifyAuthority,
  checkNotifySubjects,
  type DecisionInput,
} from './rules';

const parentOf = (b: BreachCase) => ({ type: 'breach' as const, id: b.id });

export interface BreachReport {
  title: string;
  awareAt: string | null;
  categories: string[];
  approxSubjects: number | null;
  approxRecords: number | null;
}

export function validateReport(x: BreachReport, now: Date): Partial<Record<keyof BreachReport, string>> {
  const e: Partial<Record<keyof BreachReport, string>> = {};
  const t = checkText(x.title, { ...limits.breachTitle, label: 'Title' });
  if (t) e.title = t;
  if (!x.awareAt || Number.isNaN(toMs(x.awareAt))) e.awareAt = 'Enter when you became aware of it.';
  else if (toMs(x.awareAt) > now.getTime() + 60_000) e.awareAt = 'This cannot be in the future.';
  const cats = x.categories.join(', ');
  if (cats.length > limits.categories.max) e.categories = `Categories must be ${limits.categories.max} characters or fewer.`;
  for (const [k, v] of [['approxSubjects', x.approxSubjects], ['approxRecords', x.approxRecords]] as const) {
    if (v === null || !Number.isInteger(v) || v < 0 || v > 2_000_000_000) e[k] = 'Enter a whole number (0 if unknown).';
  }
  return e;
}

/** Anyone signed in can report a breach. A privacy officer handles it: the reporter, if they are one, else the first. */
export async function reportBreach(store: DataStore<Schema>, me: Person, x: BreachReport, now = new Date()): Promise<BreachCase> {
  const errors = validateReport(x, now);
  const first = Object.values(errors)[0];
  if (first) throw new RuleError(first);
  const officer = isOfficer(me) ? me : officers(await store.repo('Person').list())[0];
  if (!officer) throw new RuleError('No privacy officer is set up in this app yet. Ask the app owner to make one.');
  const existing = await store.repo('BreachCase').list();
  const awareAt = new Date(toMs(x.awareAt!)).toISOString();
  const b = await store.repo('BreachCase').create({
    ref: nextRef('BR', existing.map((r) => r.ref)),
    title: x.title.trim(),
    awareAt,
    reportedBy: me.sub,
    officerSub: officer.sub,
    categories: x.categories.length ? x.categories.join(', ') : null,
    approxSubjects: x.approxSubjects ?? 0,
    approxRecords: x.approxRecords ?? 0,
    riskLevel: null,
    riskRationale: null,
    authorityNotifiedAt: null,
    authorityRef: null,
    subjectsNotifiedAt: null,
    delayReason: null,
    decision: 'pending',
    decisionBy: null,
    status: 'open',
    containedAt: null,
    closedAt: null,
  });
  await logEvent(
    store,
    me,
    parentOf(b),
    'created',
    `Reported by ${me.displayName}. Aware since ${formatDateTime(awareAt)}; the 72-hour clock ends ${formatDateTime(breachDeadline(awareAt))}. Handled by ${officer.displayName}.`,
    now,
  );
  return b;
}

export async function getBreach(store: DataStore<Schema>, id: string): Promise<BreachCase> {
  const b = await store.repo('BreachCase').get(id);
  if (!b) throw new NotFoundError('Breach', id);
  return b;
}

/**
 * A breach first reported as suspected and later confirmed: awareness is when it was confirmed. The earlier time
 * stays in the logbook.
 */
export async function confirmAwareness(store: DataStore<Schema>, me: Person, id: string, at: string, now = new Date()): Promise<BreachCase> {
  const b = await getBreach(store, id);
  requireBreachOfficer(me, b);
  const msg = checkAwareness(b, at, now);
  if (msg) throw new RuleError(msg);
  const iso = new Date(toMs(at)).toISOString();
  if (iso === b.awareAt) throw new RuleError('That is already the awareness time.');
  const updated = await store.repo('BreachCase').update(b.id, { awareAt: iso });
  await logEvent(
    store,
    me,
    parentOf(b),
    'note',
    `Confirmed as a breach: awareness ${formatDateTime(b.awareAt)} → ${formatDateTime(iso)}. The 72-hour clock now ends ${formatDateTime(breachDeadline(iso))}.`,
    now,
  );
  return updated;
}

export interface AssessmentInput {
  categories: string[];
  approxSubjects: number;
  approxRecords: number;
}

export async function saveAssessment(store: DataStore<Schema>, me: Person, id: string, x: AssessmentInput, now = new Date()): Promise<BreachCase> {
  const b = await getBreach(store, id);
  requireBreachOfficer(me, b);
  if (b.status === 'closed') throw new RuleError('This breach is closed.');
  const cats = x.categories.join(', ');
  if (cats.length > limits.categories.max) throw new RuleError(`Categories must be ${limits.categories.max} characters or fewer.`);
  if (![x.approxSubjects, x.approxRecords].every((n) => Number.isInteger(n) && n >= 0)) throw new RuleError('Numbers must be whole and not negative.');
  const before = `${b.categories ?? 'none'}; ${b.approxSubjects} people; ${b.approxRecords} records`;
  const updated = await store.repo('BreachCase').update(b.id, { categories: cats || null, approxSubjects: x.approxSubjects, approxRecords: x.approxRecords });
  await logEvent(store, me, parentOf(b), 'note', `Scope ${before} → ${cats || 'none'}; ${x.approxSubjects} people; ${x.approxRecords} records.`, now);
  return updated;
}

/** Rule 3: risk level and decision; "document only" needs a 40-character rationale. */
export async function decideBreach(store: DataStore<Schema>, me: Person, id: string, x: DecisionInput, now = new Date()): Promise<BreachCase> {
  const b = await getBreach(store, id);
  requireBreachOfficer(me, b);
  const msg = checkDecision(b, x);
  if (msg) throw new RuleError(msg);
  const rationale = x.riskRationale.trim();
  if (rationale.length > limits.riskRationale.max) throw new RuleError(`The rationale must be ${limits.riskRationale.max} characters or fewer.`);
  const updated = await store.repo('BreachCase').update(b.id, {
    riskLevel: x.riskLevel,
    riskRationale: rationale || null,
    decision: x.decision,
    decisionBy: me.sub,
  });
  await logEvent(
    store,
    me,
    parentOf(b),
    'decision',
    `${DECISION_LABEL[x.decision]} (${RISK_LABEL[x.riskLevel!]}).${rationale ? ` Rationale: ${rationale}` : ''}`,
    now,
  );
  return updated;
}

export async function notifyAuthority(
  store: DataStore<Schema>,
  me: Person,
  id: string,
  x: { at: string | null; authorityRef: string; delayReason: string },
  now = new Date(),
): Promise<BreachCase> {
  const b = await getBreach(store, id);
  requireBreachOfficer(me, b);
  const msg = checkNotifyAuthority(b, { ...x, now });
  if (msg) throw new RuleError(msg);
  const at = new Date(toMs(x.at!)).toISOString();
  const late = toMs(at) > toMs(breachDeadline(b.awareAt));
  const ref = x.authorityRef.trim().slice(0, limits.authorityRef.max);
  const updated = await store.repo('BreachCase').update(b.id, {
    authorityNotifiedAt: at,
    authorityRef: ref || null,
    ...(late ? { delayReason: x.delayReason.trim().slice(0, limits.delayReason.max) } : {}),
  });
  await logEvent(
    store,
    me,
    parentOf(b),
    'notified',
    `Supervisory authority notified ${formatDateTime(at)}${ref ? ` (reference ${ref})` : ''}${late ? `, after the 72 hours. Reasons for the delay: ${x.delayReason.trim()}` : ', within 72 hours.'}`,
    now,
  );
  return updated;
}

/** Late without a notification yet: record the reasons for the delay as soon as they are known (Art. 33(1)). */
export async function recordDelayReason(store: DataStore<Schema>, me: Person, id: string, reason: string, now = new Date()): Promise<BreachCase> {
  const b = await getBreach(store, id);
  requireBreachOfficer(me, b);
  const t = reason.trim();
  if (t.length < limits.delayReason.min) throw new RuleError(`Reasons for the delay need at least ${limits.delayReason.min} characters.`);
  const updated = await store.repo('BreachCase').update(b.id, { delayReason: t.slice(0, limits.delayReason.max) });
  await logEvent(store, me, parentOf(b), 'note', `Reasons for the delay: ${t}`, now);
  return updated;
}

export async function notifySubjects(store: DataStore<Schema>, me: Person, id: string, at: string | null, now = new Date()): Promise<BreachCase> {
  const b = await getBreach(store, id);
  requireBreachOfficer(me, b);
  const msg = checkNotifySubjects(b, at, now);
  if (msg) throw new RuleError(msg);
  const iso = new Date(toMs(at!)).toISOString();
  const updated = await store.repo('BreachCase').update(b.id, { subjectsNotifiedAt: iso });
  await logEvent(store, me, parentOf(b), 'notified', `People affected told ${formatDateTime(iso)} (Art. 34).`, now);
  return updated;
}

export async function containBreach(store: DataStore<Schema>, me: Person, id: string, now = new Date()): Promise<BreachCase> {
  const b = await getBreach(store, id);
  requireBreachOfficer(me, b);
  if (b.status !== 'open') throw new RuleError('Only an open breach can be marked contained.');
  const updated = await store.repo('BreachCase').update(b.id, { status: 'contained', containedAt: now.toISOString() });
  await logEvent(store, me, parentOf(b), 'status', 'Status Open → Contained.', now);
  return updated;
}

export async function closeBreach(store: DataStore<Schema>, me: Person, id: string, now = new Date()): Promise<BreachCase> {
  const b = await getBreach(store, id);
  requireBreachOfficer(me, b);
  const msg = checkCloseBreach(b, now);
  if (msg) throw new RuleError(msg);
  const updated = await store.repo('BreachCase').update(b.id, { status: 'closed', closedAt: now.toISOString(), ...(b.containedAt ? {} : { containedAt: now.toISOString() }) });
  await logEvent(store, me, parentOf(b), 'closed', `Closed. Decision on record: ${DECISION_LABEL[b.decision]}.`, now);
  return updated;
}

export async function addBreachNote(store: DataStore<Schema>, me: Person, id: string, text: string, now = new Date()) {
  const b = await getBreach(store, id);
  if (b.officerSub !== me.sub && b.reportedBy !== me.sub) throw new PermissionError('Only the handling officer or the reporter can add a note.');
  if (text.trim().length < 3) throw new RuleError('Write a note of at least 3 characters.');
  return logEvent(store, me, parentOf(b), 'note', text, now);
}

export function categoriesOf(b: Pick<BreachCase, 'categories'>): string[] {
  return commaList(b.categories);
}
