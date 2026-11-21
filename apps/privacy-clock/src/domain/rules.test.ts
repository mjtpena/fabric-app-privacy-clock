import { DAY, HOUR } from '@x10/shared/lib';

import type { BreachCase, PrivacyRequest, Task } from '../model';
import { extendedDueAt, requestDueAt } from './clock';
import {
  canMoveTo,
  checkAwareness,
  checkClose,
  checkCloseBreach,
  checkDecision,
  checkExtension,
  checkNotifyAuthority,
  checkNotifySubjects,
  checkRefuse,
  checkTaskUpdate,
  decisionHint,
  nextStages,
  previewExtension,
} from './rules';

const received = '2026-11-02T10:00:00.000Z';
const req: PrivacyRequest = {
  id: 'r1',
  ref: 'DSR-0001',
  type: 'erasure',
  subjectLabel: 'Customer C-1',
  channel: 'email',
  receivedAt: received,
  identityVerifiedAt: null,
  dueAt: requestDueAt(received),
  extendedDueAt: null,
  extensionReason: null,
  extensionNotifiedAt: null,
  status: 'in_progress',
  outcome: null,
  closedAt: null,
  ownerSub: 'officer',
};
const due = Date.parse(req.dueAt);
const before = (ms: number) => new Date(due - ms).toISOString();
const REASON = 'Covers four systems and ten years of records.';

describe('extension (rule 2)', () => {
  it('allows one or two months with a reason, told before the original due date', () => {
    expect(checkExtension(req, { months: 2, reason: REASON, notifiedAt: before(2 * DAY), now: before(DAY) })).toBeNull();
    expect(checkExtension(req, { months: 1, reason: REASON, notifiedAt: before(HOUR), now: before(HOUR) })).toBeNull();
    expect(previewExtension(req, 2)).toBe(extendedDueAt(req.dueAt, 2));
  });

  it('allows it up to the last millisecond of the due day', () => {
    expect(checkExtension(req, { months: 2, reason: REASON, notifiedAt: req.dueAt, now: req.dueAt })).toBeNull();
  });

  it('blocks an extension made after the original due date', () => {
    const after = new Date(due + 1).toISOString();
    expect(checkExtension(req, { months: 2, reason: REASON, notifiedAt: before(DAY), now: after })).toMatch(/has passed/);
  });

  it('blocks when the person was told after the original due date', () => {
    // Recorded before the due date but with a later notification time is impossible (future); a back-dated claim
    // after the due date is blocked too.
    const r = { ...req, dueAt: new Date(Date.now() - DAY).toISOString(), receivedAt: new Date(Date.now() - 31 * DAY).toISOString() };
    expect(checkExtension(r, { months: 2, reason: REASON, notifiedAt: new Date().toISOString(), now: new Date() })).toMatch(/has passed/);
  });

  it('blocks a notification time in the future or before receipt', () => {
    expect(checkExtension(req, { months: 2, reason: REASON, notifiedAt: before(HOUR), now: before(2 * HOUR) })).toMatch(/future/);
    expect(checkExtension(req, { months: 2, reason: REASON, notifiedAt: '2026-11-01T00:00:00.000Z', now: before(DAY) })).toMatch(/before the request was received/);
  });

  it('needs a reason of at least 20 characters and one or two months', () => {
    expect(checkExtension(req, { months: 2, reason: 'complex', notifiedAt: before(DAY), now: before(DAY) })).toMatch(/at least 20/);
    expect(checkExtension(req, { months: 3, reason: REASON, notifiedAt: before(DAY), now: before(DAY) })).toMatch(/one or two/);
    expect(checkExtension(req, { months: 0, reason: REASON, notifiedAt: before(DAY), now: before(DAY) })).toMatch(/one or two/);
    expect(checkExtension(req, { months: 2, reason: REASON, notifiedAt: null, now: before(DAY) })).toMatch(/Record when/);
  });

  it('extends once, and never a closed request', () => {
    expect(checkExtension({ ...req, extendedDueAt: extendedDueAt(req.dueAt) }, { months: 2, reason: REASON, notifiedAt: before(DAY), now: before(DAY) })).toMatch(/already extended/);
    expect(checkExtension({ ...req, status: 'closed' }, { months: 2, reason: REASON, notifiedAt: before(DAY), now: before(DAY) })).toMatch(/closed/);
  });
});

describe('stages and closing', () => {
  it('moves forward and back from ready only', () => {
    expect(canMoveTo('new', 'verifying')).toBe(true);
    expect(canMoveTo('verifying', 'in_progress')).toBe(true);
    expect(canMoveTo('in_progress', 'ready')).toBe(true);
    expect(canMoveTo('ready', 'in_progress')).toBe(true);
    expect(canMoveTo('ready', 'new')).toBe(false);
    expect(canMoveTo('closed', 'in_progress')).toBe(false);
    expect(nextStages('refused')).toEqual([]);
  });

  const task = (over: Partial<Task>): Task => ({
    id: 't',
    parentType: 'request',
    parentId: 'r1',
    systemId: 's',
    action: 'erase',
    title: 'Erase',
    assigneeSub: 'a',
    officerSub: 'officer',
    status: 'open',
    note: null,
    dueAt: req.dueAt,
    doneAt: null,
    ...over,
  });

  it('rule 6: an erasure cannot close while an erase task is open or blocked', () => {
    const outcome = 'All data erased and confirmed.';
    expect(checkClose(req, [task({ status: 'done' }), task({ id: 't2', status: 'open' })], outcome)).toMatch(/erase task is still open/);
    expect(checkClose(req, [task({ status: 'blocked' }), task({ id: 't2', status: 'open' })], outcome)).toMatch(/2 erase tasks/);
    expect(checkClose(req, [task({ status: 'done' }), task({ id: 't2', status: 'done' })], outcome)).toBeNull();
    // Tasks of other requests do not count.
    expect(checkClose(req, [task({ parentId: 'other' })], outcome)).toBeNull();
    // Non-erasure requests may close with open tasks.
    expect(checkClose({ ...req, type: 'access' }, [task({ action: 'export' })], outcome)).toBeNull();
  });

  it('needs an outcome', () => {
    expect(checkClose({ ...req, type: 'access' }, [], 'short')).toMatch(/outcome/);
    expect(checkRefuse(req, 'no')).toMatch(/reason/);
    expect(checkRefuse(req, 'Manifestly unfounded: repeated request.')).toBeNull();
    expect(checkRefuse({ ...req, status: 'refused' }, 'Manifestly unfounded: repeated request.')).toMatch(/already closed/);
  });

  it('a blocked task needs a note, and done stays done', () => {
    expect(checkTaskUpdate(task({}), 'blocked', 'no')).toMatch(/blocks it/);
    expect(checkTaskUpdate(task({}), 'blocked', 'Waiting for backups')).toBeNull();
    expect(checkTaskUpdate(task({ status: 'done' }), 'open', '')).toMatch(/done/);
  });
});

describe('breach decisions and notifications (rule 3)', () => {
  const aware = '2026-11-20T09:00:00.000Z';
  const at = (h: number) => new Date(Date.parse(aware) + h * HOUR).toISOString();
  const b: BreachCase = {
    id: 'b',
    ref: 'BR-0001',
    title: 'Lost laptop',
    awareAt: aware,
    reportedBy: 'x',
    officerSub: 'officer',
    categories: 'contact details',
    approxSubjects: 10,
    approxRecords: 10,
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
  };
  const forty = 'x'.repeat(40);

  it('"document only" needs a rationale of at least 40 characters', () => {
    expect(checkDecision(b, { riskLevel: 'unlikely', riskRationale: 'x'.repeat(39), decision: 'document_only' })).toMatch(/at least 40/);
    expect(checkDecision(b, { riskLevel: 'unlikely', riskRationale: ` ${'x'.repeat(39)} `, decision: 'document_only' })).toMatch(/at least 40/);
    expect(checkDecision(b, { riskLevel: 'unlikely', riskRationale: forty, decision: 'document_only' })).toBeNull();
    expect(checkDecision(b, { riskLevel: 'risk', riskRationale: '', decision: 'notify_authority' })).toBeNull();
  });

  it('a decision needs a risk level and cannot be pending', () => {
    expect(checkDecision(b, { riskLevel: null, riskRationale: forty, decision: 'notify_authority' })).toMatch(/risk/);
    expect(checkDecision(b, { riskLevel: 'risk', riskRationale: '', decision: 'pending' })).toMatch(/Choose/);
    expect(checkDecision({ ...b, authorityNotifiedAt: at(10) }, { riskLevel: 'unlikely', riskRationale: forty, decision: 'document_only' })).toMatch(/already been notified/);
  });

  it('hints, without blocking, when the decision does not follow the risk', () => {
    expect(decisionHint('high_risk', 'notify_authority')).toMatch(/Art. 34/);
    expect(decisionHint('risk', 'document_only')).toMatch(/Art. 33/);
    expect(decisionHint('risk', 'notify_authority')).toBeNull();
    expect(decisionHint(null, 'notify_authority')).toBeNull();
  });

  const notifying = { ...b, decision: 'notify_authority' as const, riskLevel: 'risk' as const };

  it('notifying within 72 hours needs no reasons; later needs reasons for the delay', () => {
    expect(checkNotifyAuthority(notifying, { at: at(71), authorityRef: '', delayReason: '', now: at(80) })).toBeNull();
    expect(checkNotifyAuthority(notifying, { at: at(72), authorityRef: '', delayReason: '', now: at(80) })).toBeNull();
    expect(checkNotifyAuthority(notifying, { at: at(73), authorityRef: '', delayReason: '', now: at(80) })).toMatch(/Late: reasons for the delay are required/);
    expect(checkNotifyAuthority(notifying, { at: at(73), authorityRef: '', delayReason: 'Forensics took four days.', now: at(80) })).toBeNull();
  });

  it('notifying needs a notify decision and a sensible time', () => {
    expect(checkNotifyAuthority(b, { at: at(10), authorityRef: '', delayReason: '', now: at(20) })).toMatch(/decision to notify/);
    expect(checkNotifyAuthority(notifying, { at: at(30), authorityRef: '', delayReason: '', now: at(20) })).toMatch(/future/);
    expect(checkNotifyAuthority(notifying, { at: at(-1), authorityRef: '', delayReason: '', now: at(20) })).toMatch(/before the breach/);
    expect(checkNotifyAuthority({ ...notifying, authorityNotifiedAt: at(5) }, { at: at(10), authorityRef: '', delayReason: '', now: at(20) })).toMatch(/already recorded/);
    expect(checkNotifySubjects(notifying, at(10), at(20))).toMatch(/notify authority and people/);
    expect(checkNotifySubjects({ ...notifying, decision: 'notify_both' }, at(10), at(20))).toBeNull();
  });

  it('closing is blocked without a decision, and without the notifications it calls for', () => {
    expect(checkCloseBreach(b, at(20))).toMatch(/Record a decision before closing/);
    expect(checkCloseBreach(notifying, at(20))).toMatch(/authority notification/);
    expect(checkCloseBreach({ ...notifying, authorityNotifiedAt: at(50) }, at(80))).toBeNull();
    expect(checkCloseBreach({ ...notifying, decision: 'notify_both', authorityNotifiedAt: at(50) }, at(80))).toMatch(/people affected/);
    expect(checkCloseBreach({ ...notifying, authorityNotifiedAt: at(80) }, at(90))).toMatch(/reasons for the delay/);
    expect(checkCloseBreach({ ...notifying, authorityNotifiedAt: at(80), delayReason: 'Forensics took four days.' }, at(90))).toBeNull();
    expect(checkCloseBreach({ ...b, decision: 'document_only', riskLevel: 'unlikely', riskRationale: forty }, at(100))).toBeNull();
    expect(checkCloseBreach({ ...b, status: 'closed' }, at(100))).toMatch(/already closed/);
  });

  it('awareness can move (suspected, then confirmed) until the authority is notified', () => {
    expect(checkAwareness(b, at(3), at(10))).toBeNull();
    expect(checkAwareness(b, at(30), at(10))).toMatch(/future/);
    expect(checkAwareness({ ...b, authorityNotifiedAt: at(5) }, at(3), at(10))).toMatch(/can no longer change/);
  });
});
