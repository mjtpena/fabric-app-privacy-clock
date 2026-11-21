/**
 * Fictional, generic seed data. Dates are computed from ctx.now. Runs once (runSeed checks a marker row).
 *
 * 18 requests across all types and states: 2 overdue, 3 due this week (one on its last day to notify an extension),
 * 1 extended correctly, 1 refused, 1 erasure blocked by an open task, 7 more closed over the last six months.
 * 3 breaches: one open at 31 hours with no decision (reported as suspected, then confirmed), one notified within
 * 72 hours, one documented only with a rationale. 6 data systems and their owners, 36 tasks, events for everything.
 */
import type { DataStore } from '@x10/shared/data';
import { DAY, HOUR, MINUTE } from '@x10/shared/lib';
import type { SeedContext } from '@x10/shared/runtime';

import { addCalendarMonths, extendedDueAt, localYMD, requestDueAt } from './domain/clock';
import type { BreachCase, Channel, DataSystem, EventKind, PrivacyRequest, RequestStatus, RequestType, Schema, Task, TaskAction } from './model';

type SysKey = 'crm' | 'support' | 'hr' | 'payroll' | 'lake' | 'mkt';
type TaskSpec = [SysKey, 'done' | 'open' | 'blocked', string?];

interface ReqSpec {
  type: RequestType;
  subject: string;
  channel: Channel;
  /** Received this many days ago (closed history) … */
  ago?: number;
  /** … or received so the original due date is this many local calendar days from today (open requests). */
  dueIn?: number;
  hour: number;
  status: RequestStatus;
  verifiedAfterDays?: number;
  closeAfterDays?: number;
  outcome?: string;
  extend?: { months: number; reason: string; notifiedBeforeDueDays?: number; notifiedAfterDays?: number };
  tasks: TaskSpec[];
}

const ACTION: Record<RequestType, TaskAction> = {
  access: 'export',
  erasure: 'erase',
  rectification: 'rectify',
  portability: 'export',
  objection: 'restrict',
  restriction: 'restrict',
};

const VERB: Record<TaskAction, string> = {
  search: 'search',
  export: 'find and export the data in',
  erase: 'erase the data in',
  rectify: 'correct the data in',
  restrict: 'restrict processing in',
  contain: 'contain the breach in',
  other: 'act on',
};

const REQUESTS: ReqSpec[] = [
  // Closed history, oldest first.
  { type: 'access', subject: 'Customer C-48213', channel: 'email', ago: 175, hour: 9, status: 'closed', verifiedAfterDays: 2, closeAfterDays: 21, outcome: 'Copy of the personal data and the processing summary sent by secure link.', tasks: [['crm', 'done'], ['lake', 'done']] },
  { type: 'erasure', subject: 'Newsletter subscriber S-0915', channel: 'web_form', ago: 160, hour: 14, status: 'closed', verifiedAfterDays: 1, closeAfterDays: 26, outcome: 'Data erased from the marketing platform and the CRM; confirmation sent.', tasks: [['mkt', 'done'], ['crm', 'done']] },
  { type: 'portability', subject: 'Customer C-51077', channel: 'email', ago: 140, hour: 11, status: 'closed', verifiedAfterDays: 3, closeAfterDays: 34, outcome: 'Machine-readable export sent four days after the due date; apology included.', tasks: [['crm', 'done']] },
  { type: 'rectification', subject: 'Employee E-2207', channel: 'letter', ago: 120, hour: 10, status: 'closed', verifiedAfterDays: 1, closeAfterDays: 12, outcome: 'Home address corrected in the HR suite; confirmation sent.', tasks: [['hr', 'done']] },
  { type: 'objection', subject: 'Prospect P-7730', channel: 'phone', ago: 95, hour: 16, status: 'closed', verifiedAfterDays: 2, closeAfterDays: 18, outcome: 'Profiling for direct marketing stopped; suppression entry added.', tasks: [['mkt', 'done']] },
  { type: 'access', subject: 'Former employee E-1964', channel: 'letter', ago: 70, hour: 9, status: 'closed', verifiedAfterDays: 4, closeAfterDays: 62, outcome: 'Full copy sent, including archived payroll and HR records, within the extended period.', extend: { months: 2, reason: 'Records span three archived systems and eleven years of payroll history.', notifiedAfterDays: 20 }, tasks: [['hr', 'done'], ['payroll', 'done']] },
  { type: 'erasure', subject: 'Customer C-39102', channel: 'email', ago: 48, hour: 13, status: 'refused', verifiedAfterDays: 1, closeAfterDays: 9, outcome: 'Refused in part: invoices must be kept for seven years under tax law. Marketing data was removed.', tasks: [] },
  { type: 'access', subject: 'Job applicant A-1180', channel: 'web_form', ago: 15, hour: 15, status: 'closed', verifiedAfterDays: 1, closeAfterDays: 11, outcome: 'Application file and interview notes sent by secure link.', tasks: [['hr', 'done'], ['lake', 'done']] },
  // Open, extended correctly: told six days before the original due date.
  { type: 'access', subject: 'Customer C-60458', channel: 'email', dueIn: -20, hour: 10, status: 'in_progress', verifiedAfterDays: 2, extend: { months: 2, reason: 'Request covers ten years of orders across four systems, two of them archived.', notifiedBeforeDueDays: 6 }, tasks: [['crm', 'done'], ['lake', 'blocked', 'Archive restore needed before the export can run; ticket raised with the platform team.'], ['hr', 'open']] },
  // Open, overdue.
  { type: 'access', subject: 'Customer C-58840', channel: 'web_form', dueIn: -8, hour: 11, status: 'in_progress', verifiedAfterDays: 3, tasks: [['crm', 'done'], ['lake', 'open']] },
  { type: 'rectification', subject: 'Customer C-61309', channel: 'email', dueIn: -2, hour: 9, status: 'ready', verifiedAfterDays: 1, tasks: [['crm', 'done'], ['support', 'done']] },
  // Open, due this week.
  { type: 'access', subject: 'Employee E-3112', channel: 'letter', dueIn: 0, hour: 10, status: 'in_progress', verifiedAfterDays: 2, tasks: [['hr', 'done'], ['payroll', 'open']] },
  { type: 'portability', subject: 'Customer C-62015', channel: 'web_form', dueIn: 3, hour: 14, status: 'in_progress', verifiedAfterDays: 1, tasks: [['crm', 'open'], ['lake', 'done']] },
  { type: 'erasure', subject: 'Customer C-62287', channel: 'email', dueIn: 6, hour: 16, status: 'in_progress', verifiedAfterDays: 1, tasks: [['crm', 'done'], ['mkt', 'blocked', 'Backups keep the records until the 30-day rotation; asked vendor for an early purge.'], ['support', 'open']] },
  // Open, on track.
  { type: 'objection', subject: 'Subscriber S-2290', channel: 'phone', dueIn: 12, hour: 12, status: 'verifying', tasks: [['mkt', 'open']] },
  { type: 'erasure', subject: 'Customer C-63750', channel: 'web_form', dueIn: 24, hour: 9, status: 'in_progress', verifiedAfterDays: 1, tasks: [['crm', 'open'], ['support', 'open'], ['lake', 'done']] },
  { type: 'access', subject: 'Customer C-64021', channel: 'email', dueIn: 28, hour: 17, status: 'new', tasks: [['crm', 'open'], ['mkt', 'open']] },
  { type: 'restriction', subject: 'Supplier contact V-3301', channel: 'letter', dueIn: 29, hour: 11, status: 'new', tasks: [] },
];

export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const [alex, sam, priya, chen, noor] = ctx.people;
  const now = ctx.now.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();

  // ---------------------------------------------------------------- systems
  const sysSpec: [SysKey, string, typeof alex, string][] = [
    ['crm', 'CRM', sam, 'Customer contact details, orders, consent records'],
    ['support', 'Support desk', sam, 'Tickets, call notes, attachments sent by customers'],
    ['hr', 'HR suite', priya, 'Employee records, contracts, applicant files'],
    ['payroll', 'Payroll', priya, 'Salaries, bank details, tax identifiers'],
    ['lake', 'Data lake', chen, 'Order history, web analytics joined to customer ids'],
    ['mkt', 'Marketing platform', chen, 'Email lists, campaign history, profiling segments'],
  ];
  const sys = {} as Record<SysKey, DataSystem>;
  for (const [key, name, owner, holds] of sysSpec) {
    sys[key] = await store.repo('DataSystem').create({ name, ownerSub: owner.sub, ownerName: owner.displayName, holds, officerSub: alex.sub });
  }

  const event = (parentType: 'request' | 'breach', parentId: string, kind: EventKind, at: number, bySub: string, text: string) =>
    store.repo('Event').create({ parentType, parentId, kind, at: iso(at), bySub, text });

  // ---------------------------------------------------------------- requests
  const received = REQUESTS.map((r, i) => {
    let t: Date;
    if (r.dueIn !== undefined) {
      const dueDay = localYMD(new Date(now + r.dueIn * DAY));
      const rec = addCalendarMonths(dueDay, -1);
      t = new Date(rec.y, rec.m, rec.d, r.hour, (i * 13) % 60);
    } else {
      t = new Date(now - (r.ago ?? 0) * DAY);
      t.setHours(r.hour, (i * 13) % 60, 0, 0);
    }
    // Never in the future (the request due today was received a month ago, so this only guards odd clocks).
    return Math.min(t.getTime(), now - HOUR);
  });
  const order = REQUESTS.map((_, i) => i).sort((a, b) => received[a] - received[b]);

  for (let n = 0; n < order.length; n++) {
    const i = order[n];
    const spec = REQUESTS[i];
    const rec = received[i];
    const ref = `DSR-${String(125 + n).padStart(4, '0')}`;
    const dueAt = requestDueAt(iso(rec));
    const dueMs = new Date(dueAt).getTime();
    let extended: Pick<PrivacyRequest, 'extendedDueAt' | 'extensionReason' | 'extensionNotifiedAt'> = { extendedDueAt: null, extensionReason: null, extensionNotifiedAt: null };
    let extAt = 0;
    if (spec.extend) {
      extAt = spec.extend.notifiedAfterDays !== undefined ? rec + spec.extend.notifiedAfterDays * DAY : dueMs - (spec.extend.notifiedBeforeDueDays ?? 5) * DAY;
      extended = { extendedDueAt: extendedDueAt(dueAt, spec.extend.months), extensionReason: spec.extend.reason, extensionNotifiedAt: iso(extAt) };
    }
    const verifiedAt = spec.verifiedAfterDays !== undefined ? rec + spec.verifiedAfterDays * DAY + 2 * HOUR : null;
    const closedAt = spec.closeAfterDays !== undefined ? rec + spec.closeAfterDays * DAY + 3 * HOUR : null;
    const req = await store.repo('PrivacyRequest').create({
      ref,
      type: spec.type,
      subjectLabel: spec.subject,
      channel: spec.channel,
      receivedAt: iso(rec),
      identityVerifiedAt: verifiedAt ? iso(verifiedAt) : null,
      dueAt,
      ...extended,
      status: spec.status,
      outcome: spec.outcome ?? null,
      closedAt: closedAt ? iso(closedAt) : null,
      ownerSub: alex.sub,
    });
    const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const channel = spec.channel === 'web_form' ? 'web form' : spec.channel;
    await event('request', req.id, 'created', rec + 20 * MINUTE, alex.sub, `${spec.type[0].toUpperCase()}${spec.type.slice(1)} request received by ${channel}. Due ${fmtDay(dueMs)}.`);

    // Tasks
    const action = ACTION[spec.type];
    const responseDue = extended.extendedDueAt ? new Date(extended.extendedDueAt).getTime() : dueMs;
    const taskDue = Math.max(rec + 3 * DAY, responseDue - 7 * DAY);
    if (spec.tasks.length) {
      await event(
        'request',
        req.id,
        'note',
        rec + 25 * MINUTE,
        alex.sub,
        `${action[0].toUpperCase()}${action.slice(1)} assigned on ${spec.tasks.map(([k]) => `${sys[k].name} (${sys[k].ownerName})`).join(', ')}.`,
      );
    }
    if (verifiedAt) {
      await event('request', req.id, 'verified', verifiedAt, alex.sub, 'Identity verified against the account record. The clock still runs from receipt. Status New → In progress.');
    } else if (spec.status === 'verifying') {
      await event('request', req.id, 'status', rec + DAY, alex.sub, 'Status New → Verifying. Asked the caller to confirm their identity by email.');
    }
    if (spec.extend) {
      await event(
        'request',
        req.id,
        'extended',
        extAt,
        alex.sub,
        `Extended by ${spec.extend.months} months: due ${fmtDay(dueMs)} → ${fmtDay(new Date(extended.extendedDueAt!).getTime())}. Person told the same day. Reason: ${spec.extend.reason}`,
      );
    }
    let k = 0;
    for (const [key, status, note] of spec.tasks) {
      const s = sys[key];
      const doneAt = status === 'done' ? Math.min(closedAt ? closedAt - DAY : now - 2 * HOUR, rec + (3 + k * 2) * DAY + 5 * HOUR) : null;
      const doneSafe = doneAt ? Math.max(doneAt, (verifiedAt ?? rec) + HOUR) : null;
      const t: Omit<Task, 'id'> = {
        parentType: 'request',
        parentId: req.id,
        systemId: s.id,
        action,
        title: `${ref}: ${VERB[action]} ${s.name}`,
        assigneeSub: s.ownerSub,
        officerSub: alex.sub,
        status,
        note: note ?? (status === 'done' ? 'Done; evidence attached to the ticket.' : null),
        dueAt: iso(taskDue),
        doneAt: doneSafe ? iso(doneSafe) : null,
      };
      await store.repo('Task').create(t);
      if (doneSafe) await event('request', req.id, 'task_done', doneSafe, s.ownerSub, `${action[0].toUpperCase()}${action.slice(1)} on ${s.name} done by ${s.ownerName}.`);
      if (status === 'blocked') await event('request', req.id, 'task_blocked', Math.min(now - 6 * HOUR, rec + 4 * DAY), s.ownerSub, `${action[0].toUpperCase()}${action.slice(1)} on ${s.name} blocked: ${note}`);
      k++;
    }
    if (spec.status === 'ready') await event('request', req.id, 'status', now - 26 * HOUR, alex.sub, 'Status In progress → Ready to send. Waiting on the final review of the corrected record.');
    if (closedAt) {
      const late = closedAt > responseDue;
      await event(
        'request',
        req.id,
        'closed',
        closedAt,
        alex.sub,
        spec.status === 'refused' ? `Refused. Reason given to the person: ${spec.outcome}` : `Closed${late ? ' after the due date' : ' in time'}. Outcome: ${spec.outcome}`,
      );
    }
  }

  // ---------------------------------------------------------------- breaches
  const breach = async (b: Omit<BreachCase, 'id'>) => store.repo('BreachCase').create(b);

  // BR-0002: documented only, closed.
  const aware2 = now - 40 * DAY - 5 * HOUR;
  const b2 = await breach({
    ref: 'BR-0002',
    title: 'Campaign email sent with recipients in the visible field',
    awareAt: iso(aware2),
    reportedBy: chen.sub,
    officerSub: alex.sub,
    categories: 'contact details',
    approxSubjects: 38,
    approxRecords: 38,
    riskLevel: 'unlikely',
    riskRationale:
      'All 38 recipients were members of the same partner programme who already share contact details at events; no other data was exposed and the email was recalled within ten minutes.',
    authorityNotifiedAt: null,
    authorityRef: null,
    subjectsNotifiedAt: null,
    delayReason: null,
    decision: 'document_only',
    decisionBy: alex.sub,
    status: 'closed',
    containedAt: iso(aware2 + 2 * HOUR),
    closedAt: iso(aware2 + 6 * DAY),
  });
  await event('breach', b2.id, 'created', aware2 + 15 * MINUTE, chen.sub, `Reported by ${chen.displayName} minutes after the email went out. The 72-hour clock runs from the send time.`);
  await store.repo('Task').create({ parentType: 'breach', parentId: b2.id, systemId: sys.mkt.id, action: 'contain', title: 'BR-0002: contain the breach in Marketing platform', assigneeSub: chen.sub, officerSub: alex.sub, status: 'done', note: 'Message recalled; template changed to blind copy.', dueAt: iso(aware2 + DAY), doneAt: iso(aware2 + 90 * MINUTE) });
  await event('breach', b2.id, 'task_done', aware2 + 90 * MINUTE, chen.sub, 'Contain on Marketing platform done by Chen Wei. Message recalled; template changed to blind copy.');
  await event('breach', b2.id, 'status', aware2 + 2 * HOUR, alex.sub, 'Status Open → Contained.');
  await event('breach', b2.id, 'decision', aware2 + 20 * HOUR, alex.sub, 'Document only (Unlikely to result in a risk). Rationale recorded on the case.');
  await event('breach', b2.id, 'closed', aware2 + 6 * DAY, alex.sub, 'Closed. Decision on record: Document only.');

  // BR-0003: notified within 72 hours, contained, not yet closed.
  const aware3 = now - 9 * DAY - 3 * HOUR;
  const b3 = await breach({
    ref: 'BR-0003',
    title: 'Payslips for one team emailed to the wrong distribution list',
    awareAt: iso(aware3),
    reportedBy: priya.sub,
    officerSub: alex.sub,
    categories: 'financial, identity documents',
    approxSubjects: 42,
    approxRecords: 42,
    riskLevel: 'risk',
    riskRationale: 'Salary and tax identifiers reached 120 staff outside the team; identity fraud is possible but the list is internal.',
    authorityNotifiedAt: iso(aware3 + 52 * HOUR),
    authorityRef: 'NOTIF-48213',
    subjectsNotifiedAt: null,
    delayReason: null,
    decision: 'notify_authority',
    decisionBy: alex.sub,
    status: 'contained',
    containedAt: iso(aware3 + 4 * DAY),
    closedAt: null,
  });
  await event('breach', b3.id, 'created', aware3 + 10 * MINUTE, priya.sub, `Reported by ${priya.displayName}. Aware since a colleague flagged the email.`);
  await store.repo('Task').create({ parentType: 'breach', parentId: b3.id, systemId: sys.payroll.id, action: 'contain', title: 'BR-0003: contain the breach in Payroll', assigneeSub: priya.sub, officerSub: alex.sub, status: 'done', note: 'Recipients asked to delete; mail rule fixed.', dueAt: iso(aware3 + DAY), doneAt: iso(aware3 + 20 * HOUR) });
  await store.repo('Task').create({ parentType: 'breach', parentId: b3.id, systemId: sys.hr.id, action: 'search', title: 'BR-0003: search HR suite', assigneeSub: priya.sub, officerSub: alex.sub, status: 'done', note: 'Confirmed 42 payslips in the message.', dueAt: iso(aware3 + DAY), doneAt: iso(aware3 + 26 * HOUR) });
  await event('breach', b3.id, 'task_done', aware3 + 20 * HOUR, priya.sub, 'Contain on Payroll done by Priya Nair. Recipients asked to delete; mail rule fixed.');
  await event('breach', b3.id, 'task_done', aware3 + 26 * HOUR, priya.sub, 'Search on HR suite done by Priya Nair. Confirmed 42 payslips in the message.');
  await event('breach', b3.id, 'decision', aware3 + 30 * HOUR, alex.sub, 'Notify authority (Risk). Salary and tax identifiers reached people outside the team.');
  await event('breach', b3.id, 'notified', aware3 + 52 * HOUR, alex.sub, 'Supervisory authority notified (reference NOTIF-48213), within 72 hours.');
  await event('breach', b3.id, 'status', aware3 + 4 * DAY, alex.sub, 'Status Open → Contained.');

  // BR-0004: reported as suspected, confirmed three hours later; open at 31 hours with no decision.
  const suspected = now - 34 * HOUR;
  const aware4 = now - 31 * HOUR;
  const b4 = await breach({
    ref: 'BR-0004',
    title: 'Support desk export shared with the wrong customer',
    awareAt: iso(aware4),
    reportedBy: noor.sub,
    officerSub: alex.sub,
    categories: 'contact details, credentials',
    approxSubjects: 1240,
    approxRecords: 3100,
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
  await event('breach', b4.id, 'created', suspected, noor.sub, `Reported as suspected by ${noor.displayName}: a customer says a ticket attachment contained other customers' details.`);
  await event('breach', b4.id, 'note', aware4, alex.sub, 'Confirmed as a breach three hours after the first report: awareness moved from the report to this confirmation. The 72-hour clock runs from here; the report time stays above.');
  await store.repo('Task').create({ parentType: 'breach', parentId: b4.id, systemId: sys.crm.id, action: 'search', title: 'BR-0004: search CRM', assigneeSub: sam.sub, officerSub: alex.sub, status: 'done', note: 'Matched 1,240 customers in the export.', dueAt: iso(aware4 + 12 * HOUR), doneAt: iso(aware4 + 11 * HOUR) });
  await store.repo('Task').create({ parentType: 'breach', parentId: b4.id, systemId: sys.support.id, action: 'contain', title: 'BR-0004: contain the breach in Support desk', assigneeSub: sam.sub, officerSub: alex.sub, status: 'open', note: null, dueAt: iso(aware4 + 36 * HOUR), doneAt: null });
  await event('breach', b4.id, 'task_done', aware4 + 11 * HOUR, sam.sub, 'Search on CRM done by Sam Taylor. Matched 1,240 customers in the export.');

}
