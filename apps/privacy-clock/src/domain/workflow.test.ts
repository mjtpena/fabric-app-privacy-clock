import { PermissionError, RuleError } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { DAY, HOUR } from '@x10/shared/lib';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { PERSONA, personas } from '../app.config';
import { defs } from '../model';
import { seed } from '../seed';
import { closeBreach, confirmAwareness, decideBreach, notifyAuthority, reportBreach } from './breaches';
import { breachDeadline, localYMD, requestClock, requestDueAt } from './clock';
import { loadAll } from './data';
import { closeRequest, createRequest, extendRequest, moveRequest, refuseRequest, verifyIdentity } from './requests';
import { blockTask, completeTask, reassignTask } from './tasks';
import { buildDials } from './tower';

const NOW = FIXED_NOW;

async function setup() {
  const store = await testStore(defs, { personas, fn: seed, now: NOW });
  const people = await store.repo('Person').list();
  const as = (sub: string) => people.find((p) => p.sub === sub) as Person;
  return { store, alex: as(PERSONA.alex), sam: as(PERSONA.sam), priya: as(PERSONA.priya), chen: as(PERSONA.chen), noor: as(PERSONA.noor) };
}

describe('seed', () => {
  it('has the requests, breaches, systems and tasks the spec asks for', async () => {
    const { store } = await setup();
    const d = await loadAll(store);
    expect(d.requests).toHaveLength(18);
    expect(new Set(d.requests.map((r) => r.type)).size).toBe(6);
    expect(new Set(d.requests.map((r) => r.status))).toEqual(new Set(['new', 'verifying', 'in_progress', 'ready', 'closed', 'refused']));
    const open = d.requests.filter((r) => r.status !== 'closed' && r.status !== 'refused');
    const clocks = open.map((r) => requestClock(r, NOW));
    expect(clocks.filter((c) => c.state === 'overdue')).toHaveLength(2);
    expect(clocks.filter((c) => c.leftMs >= 0 && c.leftMs <= 7 * DAY)).toHaveLength(3);
    expect(d.requests.filter((r) => r.extendedDueAt)).toHaveLength(2); // one open, one in the closed history
    const ext = open.filter((r) => r.extendedDueAt);
    expect(ext).toHaveLength(1);
    expect(Date.parse(ext[0].extensionNotifiedAt!)).toBeLessThanOrEqual(Date.parse(ext[0].dueAt));
    expect(d.requests.filter((r) => r.status === 'refused')).toHaveLength(1);
    const erasureBlocked = open.filter(
      (r) => r.type === 'erasure' && d.tasks.some((t) => t.parentId === r.id && t.action === 'erase' && t.status !== 'done'),
    );
    expect(erasureBlocked.length).toBeGreaterThanOrEqual(1);
    expect(d.breaches).toHaveLength(3);
    expect(d.systems.map((s) => s.name).sort()).toEqual(['CRM', 'Data lake', 'HR suite', 'Marketing platform', 'Payroll', 'Support desk']);
    expect(d.tasks.length).toBeGreaterThanOrEqual(28);
    // Every request and breach has a logbook.
    for (const r of d.requests) expect(d.events.some((e) => e.parentId === r.id && e.kind === 'created')).toBe(true);
    for (const b of d.breaches) expect(d.events.some((e) => e.parentId === b.id && e.kind === 'created')).toBe(true);
  });

  it('has one open breach at 31 hours with no decision, one notified within 72 h, one documented only', async () => {
    const { store } = await setup();
    const d = await loadAll(store);
    const open = d.breaches.find((b) => b.status === 'open')!;
    expect(open.decision).toBe('pending');
    expect(NOW.getTime() - Date.parse(open.awareAt)).toBe(31 * HOUR);
    // Reported as suspected earlier: the earlier time is kept in the logbook.
    const created = d.events.find((e) => e.parentId === open.id && e.kind === 'created')!;
    expect(Date.parse(created.at)).toBeLessThan(Date.parse(open.awareAt));
    const notified = d.breaches.find((b) => b.authorityNotifiedAt)!;
    expect(Date.parse(notified.authorityNotifiedAt!)).toBeLessThanOrEqual(Date.parse(breachDeadline(notified.awareAt)));
    const doc = d.breaches.find((b) => b.decision === 'document_only')!;
    expect(doc.status).toBe('closed');
    expect(doc.riskRationale!.length).toBeGreaterThanOrEqual(40);
  });

  it('is idempotent', async () => {
    const { store } = await setup();
    const { runSeed } = await import('@x10/shared/runtime');
    expect(await runSeed(store, personas, seed, NOW)).toBe(false);
    expect((await store.repo('PrivacyRequest').list()).length).toBe(18);
  });
});

describe('intake', () => {
  it('a request received on 31 January is due the last day of February', async () => {
    const { store, alex } = await setup();
    const sys = (await store.repo('DataSystem').list()).filter((s) => s.name === 'CRM' || s.name === 'Data lake');
    const received = new Date(2026, 0, 31, 11, 0).toISOString();
    const r = await createRequest(store, alex, { type: 'erasure', subjectLabel: 'Customer C-90001', channel: 'email', receivedAt: received, systemIds: sys.map((s) => s.id) }, NOW);
    expect(localYMD(r.dueAt)).toEqual({ y: 2026, m: 1, d: 28 });
    expect(r.ref).toBe('DSR-0143');
    expect(r.status).toBe('new');
    const tasks = await store.repo('Task').list({ where: { parentId: r.id } });
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.action === 'erase' && t.officerSub === alex.sub)).toBe(true);
    const events = await store.repo('Event').list({ where: { parentId: r.id } });
    expect(events.map((e) => e.kind).sort()).toEqual(['created', 'note']);
  });

  it('only a privacy officer logs a request; received dates cannot be in the future', async () => {
    const { store, alex, sam } = await setup();
    const x = { type: 'access' as const, subjectLabel: 'Customer C-1', channel: 'email' as const, receivedAt: NOW.toISOString(), systemIds: [] };
    await expect(createRequest(store, sam, x, NOW)).rejects.toBeInstanceOf(PermissionError);
    await expect(createRequest(store, alex, { ...x, receivedAt: new Date(NOW.getTime() + DAY).toISOString() }, NOW)).rejects.toThrow(/future/);
    await expect(createRequest(store, alex, { ...x, subjectLabel: 'x' }, NOW)).rejects.toThrow(/at least 2/);
  });
});

describe('extension', () => {
  it('is blocked after the original due date, and allowed before it with an event', async () => {
    const { store, alex } = await setup();
    const d = await loadAll(store);
    const overdue = d.requests.find((r) => r.status === 'in_progress' && !r.extendedDueAt && requestClock(r, NOW).state === 'overdue')!;
    await expect(
      extendRequest(store, alex, overdue.id, { months: 2, reason: 'Records span many archived systems.', notifiedAt: NOW.toISOString() }, NOW),
    ).rejects.toThrow(/has passed/);

    const later = d.requests.find((r) => r.status === 'verifying')!;
    const before = (await store.repo('Event').list({ where: { parentId: later.id } })).length;
    const r = await extendRequest(store, alex, later.id, { months: 2, reason: 'Records span many archived systems.', notifiedAt: NOW.toISOString() }, NOW);
    const due = localYMD(later.dueAt);
    const ext = localYMD(r.extendedDueAt!);
    expect((ext.y * 12 + ext.m) - (due.y * 12 + due.m)).toBe(2);
    const events = await store.repo('Event').list({ where: { parentId: later.id } });
    expect(events).toHaveLength(before + 1);
    expect(events.find((e) => e.kind === 'extended')!.text).toMatch(/Extended by 2 months/);
    // Only once.
    await expect(extendRequest(store, alex, later.id, { months: 1, reason: 'Another reason that is long.', notifiedAt: NOW.toISOString() }, NOW)).rejects.toThrow(/already extended/);
  });
});

describe('closing requests', () => {
  it('an erasure with an open erase task cannot close; once erased it can', async () => {
    const { store, alex, sam, chen } = await setup();
    const d = await loadAll(store);
    const r = d.requests.find((x) => x.type === 'erasure' && x.status === 'in_progress' && d.tasks.some((t) => t.parentId === x.id && t.status === 'blocked'))!;
    await expect(closeRequest(store, alex, r.id, 'All personal data erased.', NOW)).rejects.toThrow(/cannot close while/);
    const tasks = d.tasks.filter((t) => t.parentId === r.id && t.status !== 'done');
    const byOwner = { [sam.sub]: sam, [chen.sub]: chen };
    for (const t of tasks) await completeTask(store, byOwner[t.assigneeSub], t.id, 'Erased.', NOW);
    const closed = await closeRequest(store, alex, r.id, 'All personal data erased.', NOW);
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).toBe(NOW.toISOString());
  });

  it('identity, stage moves and refusals write events; other people cannot make them', async () => {
    const { store, alex, sam } = await setup();
    const d = await loadAll(store);
    const fresh = d.requests.find((r) => r.status === 'new')!;
    await expect(verifyIdentity(store, sam, fresh.id, NOW.toISOString(), NOW)).rejects.toBeInstanceOf(PermissionError);
    const v = await verifyIdentity(store, alex, fresh.id, NOW.toISOString(), NOW);
    expect(v.status).toBe('in_progress');
    await moveRequest(store, alex, fresh.id, 'ready', NOW);
    await expect(moveRequest(store, alex, fresh.id, 'new', NOW)).rejects.toBeInstanceOf(RuleError);
    await refuseRequest(store, alex, fresh.id, 'Manifestly excessive: fourth identical request this month.', NOW);
    const kinds = (await store.repo('Event').list({ where: { parentId: fresh.id } })).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['verified', 'status', 'closed']));
  });
});

describe('tasks (Gears)', () => {
  it('a system owner completes their task and the request dial updates', async () => {
    const { store, sam } = await setup();
    const before = await loadAll(store);
    const t = before.tasks.find((x) => x.assigneeSub === sam.sub && x.status === 'open' && x.parentType === 'request')!;
    const dialBefore = buildDials(before, NOW).find((x) => x.id === t.parentId)!;
    await completeTask(store, sam, t.id, 'Exported to the secure share.', NOW);
    const after = await loadAll(store);
    const dialAfter = buildDials(after, NOW).find((x) => x.id === t.parentId)!;
    expect(dialAfter.tally.done).toBe(dialBefore.tally.done + 1);
    expect(after.events.some((e) => e.parentId === t.parentId && e.kind === 'task_done' && e.bySub === sam.sub)).toBe(true);
  });

  it('only the assignee updates a task; only the officer reassigns, with an event', async () => {
    const { store, alex, sam, priya } = await setup();
    const d = await loadAll(store);
    const t = d.tasks.find((x) => x.assigneeSub === sam.sub && x.status === 'open')!;
    await expect(completeTask(store, priya, t.id, '', NOW)).rejects.toBeInstanceOf(PermissionError);
    await expect(completeTask(store, alex, t.id, '', NOW)).rejects.toBeInstanceOf(PermissionError);
    await expect(blockTask(store, sam, t.id, 'no', NOW)).rejects.toThrow(/blocks it/);
    await expect(reassignTask(store, sam, t.id, d.systems[0].id, NOW)).rejects.toBeInstanceOf(PermissionError);
    const hr = d.systems.find((s) => s.name === 'HR suite')!;
    const moved = await reassignTask(store, alex, t.id, hr.id, NOW);
    expect(moved.assigneeSub).toBe(priya.sub);
    expect(moved.title).toContain('HR suite');
    const ev = (await store.repo('Event').list({ where: { parentId: t.parentId } })).find((e) => e.kind === 'reassigned')!;
    expect(ev.text).toMatch(/to HR suite \(Priya Nair\)/);
  });
});

describe('breaches (Escapement)', () => {
  it('anyone can report; a privacy officer handles it; the 72-hour clock starts at awareness', async () => {
    const { store, alex, noor } = await setup();
    const aware = new Date(NOW.getTime() - 2 * HOUR).toISOString();
    const b = await reportBreach(store, noor, { title: 'Laptop left on a train', awareAt: aware, categories: ['contact details'], approxSubjects: 200, approxRecords: 400 }, NOW);
    expect(b.reportedBy).toBe(noor.sub);
    expect(b.officerSub).toBe(alex.sub);
    expect(b.ref).toBe('BR-0005');
    expect(b.decision).toBe('pending');
    await expect(decideBreach(store, noor, b.id, { riskLevel: 'risk', riskRationale: '', decision: 'notify_authority' }, NOW)).rejects.toBeInstanceOf(PermissionError);
  });

  it('closing without a decision is blocked; document only needs 40 characters', async () => {
    const { store, alex } = await setup();
    const open = (await loadAll(store)).breaches.find((b) => b.status === 'open')!;
    await expect(closeBreach(store, alex, open.id, NOW)).rejects.toThrow(/Record a decision before closing/);
    await expect(decideBreach(store, alex, open.id, { riskLevel: 'unlikely', riskRationale: 'Too short.', decision: 'document_only' }, NOW)).rejects.toThrow(/at least 40/);
    await decideBreach(store, alex, open.id, { riskLevel: 'risk', riskRationale: '', decision: 'notify_authority' }, NOW);
    await expect(closeBreach(store, alex, open.id, NOW)).rejects.toThrow(/authority notification/);
    await notifyAuthority(store, alex, open.id, { at: NOW.toISOString(), authorityRef: 'NOTIF-1', delayReason: '' }, NOW);
    const closed = await closeBreach(store, alex, open.id, NOW);
    expect(closed.status).toBe('closed');
    const kinds = (await store.repo('Event').list({ where: { parentId: open.id } })).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['decision', 'notified', 'closed']));
  });

  it('a late notification needs reasons for the delay', async () => {
    const { store, alex } = await setup();
    const open = (await loadAll(store)).breaches.find((b) => b.status === 'open')!;
    await decideBreach(store, alex, open.id, { riskLevel: 'high_risk', riskRationale: '', decision: 'notify_both' }, NOW);
    const late = new Date(Date.parse(breachDeadline(open.awareAt)) + 2 * HOUR);
    await expect(notifyAuthority(store, alex, open.id, { at: late.toISOString(), authorityRef: '', delayReason: '' }, late)).rejects.toThrow(/Late: reasons for the delay/);
    const n = await notifyAuthority(store, alex, open.id, { at: late.toISOString(), authorityRef: '', delayReason: 'Forensic review took longer than planned.' }, late);
    expect(n.delayReason).toMatch(/Forensic/);
  });

  it('confirming a suspected breach moves awareness and keeps the earlier time in the logbook', async () => {
    const { store, alex } = await setup();
    const open = (await loadAll(store)).breaches.find((b) => b.status === 'open')!;
    const confirmed = new Date(NOW.getTime() - 20 * HOUR).toISOString();
    const b = await confirmAwareness(store, alex, open.id, confirmed, NOW);
    expect(b.awareAt).toBe(confirmed);
    const note = (await store.repo('Event').list({ where: { parentId: open.id } })).filter((e) => e.kind === 'note').pop()!;
    expect(note.text).toMatch(/awareness .* → /);
  });
});

describe('logbook (rule 5)', () => {
  it('is append-only: actions add events and never change existing ones', async () => {
    const { store, alex, sam } = await setup();
    const snapshot = JSON.stringify((await store.repo('Event').list()).sort((a, b) => a.id.localeCompare(b.id)));
    const d = await loadAll(store);
    const t = d.tasks.find((x) => x.assigneeSub === sam.sub && x.status === 'open')!;
    await completeTask(store, sam, t.id, '', NOW);
    const r = d.requests.find((x) => x.status === 'verifying')!;
    await moveRequest(store, alex, r.id, 'in_progress', NOW);
    const after = await store.repo('Event').list();
    const old = after.filter((e) => snapshot.includes(e.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(JSON.stringify(old)).toBe(snapshot);
    expect(after.length).toBe(JSON.parse(snapshot).length + 2);
  });

  it('the domain exposes no way to edit or delete an event', async () => {
    const events = await import('./events');
    expect(Object.keys(events).sort()).toEqual(['eventText', 'logEvent']);
  });
});

describe('due date helper agrees with the seed', () => {
  it('every request due date is receipt plus one calendar month', async () => {
    const { store } = await setup();
    for (const r of await store.repo('PrivacyRequest').list()) expect(r.dueAt).toBe(requestDueAt(r.receivedAt));
  });
});
