/**
 * The clock tower as data: one dial per open request or breach, how each lens groups and colours them, who is dimmed
 * under "view as", and the ranked Today list. Pure; unit-tested in tower.test.ts.
 */
import { DAY, HOUR, toMs } from '@x10/shared/lib';

import { rules } from '../config';
import { STATUS_LABEL, TYPE_LABEL } from '../labels';
import { REQUEST_TYPES, type BreachCase, type PrivacyRequest, type RequestType, type Task } from '../model';
import { breachClock, breachIsLate, calendarDaysBetween, clockWords, requestClock, type Clock, type ClockState } from './clock';
import { nameOf, tasksFor, type PrivacyData } from './data';
import { isOpenRequest } from './rules';

export type TowerLens = 'state' | 'type' | 'owner' | 'systems' | 'stage';
export type ViewAs = 'officer' | 'owner';

export interface TaskTally {
  total: number;
  done: number;
  open: number;
  blocked: number;
}

export interface Dial {
  id: string;
  kind: 'request' | 'breach';
  ref: string;
  title: string;
  type: RequestType | 'breach';
  clock: Clock;
  words: string;
  stage: string;
  stageLabel: string;
  /** The person who holds the next step: the assignee of the earliest open task, else the officer. */
  nextSub: string;
  nextName: string;
  /** The system of the earliest open (or blocked) task: where the item is waiting. */
  waitingSystemId: string | null;
  systemIds: string[];
  tasks: Task[];
  tally: TaskTally;
  /** Extended requests: where the original due date sits on the dial (0..1). */
  originalDueFraction: number | null;
  /** Breach past 72 h without notification: reasons for the delay are required. */
  late: boolean;
  officerSub: string;
  request: PrivacyRequest | null;
  breach: BreachCase | null;
}

export function tally(tasks: Task[]): TaskTally {
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.status === 'done').length,
    open: tasks.filter((t) => t.status === 'open').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
  };
}

function nextStep(data: PrivacyData, tasks: Task[], officerSub: string) {
  const pending = tasks.filter((t) => t.status !== 'done').sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
  const t = pending[0];
  const sub = t ? t.assigneeSub : officerSub;
  return { nextSub: sub, nextName: nameOf(data, sub), waitingSystemId: t?.systemId ?? null };
}

export function breachStage(b: BreachCase): { key: string; label: string } {
  if (b.decision === 'pending') return { key: 'b_assess', label: 'Assessing' };
  const notifyDone =
    b.decision === 'document_only' || (!!b.authorityNotifiedAt && (b.decision !== 'notify_both' || !!b.subjectsNotifiedAt));
  if (!notifyDone) return { key: 'b_notify', label: 'Notifying' };
  return { key: 'b_wrap', label: 'Wrapping up' };
}

export function buildDials(data: PrivacyData, now: Date): Dial[] {
  const dials: Dial[] = [];
  for (const b of data.breaches) {
    if (b.status === 'closed') continue;
    const tasks = tasksFor(data, 'breach', b.id);
    const clock = breachClock(b, now);
    const st = breachStage(b);
    dials.push({
      id: b.id,
      kind: 'breach',
      ref: b.ref,
      title: b.title,
      type: 'breach',
      clock,
      words: clockWords(clock),
      stage: st.key,
      stageLabel: st.label,
      ...nextStep(data, tasks, b.officerSub),
      systemIds: [...new Set(tasks.map((t) => t.systemId).filter((x): x is string => !!x))],
      tasks,
      tally: tally(tasks),
      originalDueFraction: null,
      late: breachIsLate(b, now),
      officerSub: b.officerSub,
      request: null,
      breach: b,
    });
  }
  for (const r of data.requests) {
    if (!isOpenRequest(r)) continue;
    const tasks = tasksFor(data, 'request', r.id);
    const clock = requestClock(r, now);
    dials.push({
      id: r.id,
      kind: 'request',
      ref: r.ref,
      title: r.subjectLabel,
      type: r.type,
      clock,
      words: clockWords(clock),
      stage: r.status,
      stageLabel: STATUS_LABEL[r.status],
      ...nextStep(data, tasks, r.ownerSub),
      systemIds: [...new Set(tasks.map((t) => t.systemId).filter((x): x is string => !!x))],
      tasks,
      tally: tally(tasks),
      originalDueFraction: r.extendedDueAt ? (toMs(r.dueAt) - toMs(r.receivedAt)) / clock.totalMs : null,
      late: false,
      officerSub: r.ownerSub,
      request: r,
      breach: null,
    });
  }
  return dials;
}

/** Most urgent first: breaches before requests, then least time left. */
export function byUrgency(a: Dial, b: Dial): number {
  if (a.kind !== b.kind) return a.kind === 'breach' ? -1 : 1;
  if (a.clock.running !== b.clock.running) return a.clock.running ? -1 : 1;
  return a.clock.leftMs / a.clock.totalMs - b.clock.leftMs / b.clock.totalMs || a.ref.localeCompare(b.ref);
}

/* ------------------------------------------------------------------ lenses */

export interface LensGroup {
  key: string;
  label: string;
  color: string;
}

export const STATE_ORDER: ClockState[] = ['overdue', 'critical', 'due_soon', 'on_track', 'met', 'late'];

export const STATE_COLOR: Record<ClockState, string> = {
  overdue: 'var(--bad-solid)',
  critical: 'var(--orange-9)',
  due_soon: 'var(--warn-solid)',
  on_track: 'var(--ok-solid)',
  met: 'var(--info-solid)',
  late: 'color-mix(in oklab, var(--bad-solid) 55%, var(--gray-9))',
};

export const STATE_GROUP_LABEL: Record<ClockState, string> = {
  overdue: 'Overdue',
  critical: 'Critical',
  due_soon: 'Due soon',
  on_track: 'On track',
  met: 'Stopped in time',
  late: 'Stopped late',
};

export const TYPE_COLOR: Record<RequestType | 'breach', string> = {
  breach: 'var(--accent-9)',
  access: 'var(--indigo-9)',
  erasure: 'var(--crimson-9)',
  rectification: 'var(--amber-9)',
  portability: 'var(--cyan-9)',
  objection: 'var(--violet-9)',
  restriction: 'var(--teal-9)',
};

const PALETTE = ['var(--blue-9)', 'var(--jade-9)', 'var(--orange-9)', 'var(--plum-9)', 'var(--sea-9)', 'var(--bronze-9)', 'var(--olive-9)', 'var(--sky-9)'];

const STAGE_COLOR: Record<string, string> = {
  new: 'var(--gray-8)',
  verifying: 'var(--accent-7)',
  in_progress: 'var(--accent-9)',
  ready: 'var(--accent-11)',
  b_assess: 'var(--bad-solid)',
  b_notify: 'var(--orange-9)',
  b_wrap: 'var(--info-solid)',
};
const STAGE_ORDER = ['b_assess', 'b_notify', 'b_wrap', 'new', 'verifying', 'in_progress', 'ready'];
const STAGE_LABEL: Record<string, string> = {
  new: STATUS_LABEL.new,
  verifying: STATUS_LABEL.verifying,
  in_progress: STATUS_LABEL.in_progress,
  ready: STATUS_LABEL.ready,
  b_assess: 'Breach: assessing',
  b_notify: 'Breach: notifying',
  b_wrap: 'Breach: wrapping up',
};

export const NO_SYSTEM = '__none';

/** Colour per system, stable by name order. */
export function systemColors(data: Pick<PrivacyData, 'systems'>): Map<string, string> {
  return new Map(data.systems.map((s, i) => [s.id, PALETTE[i % PALETTE.length]]));
}

/** The groups a lens shows, in order, limited to those that have dials (plus all request types for Type). */
export function lensGroups(lens: TowerLens, dials: Dial[], data: PrivacyData): LensGroup[] {
  const present = new Set(dials.map((d) => groupKey(d, lens)));
  let all: LensGroup[];
  if (lens === 'state') all = STATE_ORDER.map((s) => ({ key: s, label: STATE_GROUP_LABEL[s], color: STATE_COLOR[s] }));
  else if (lens === 'type')
    all = (['breach', ...REQUEST_TYPES] as const).map((t) => ({ key: t, label: t === 'breach' ? 'Breach' : TYPE_LABEL[t], color: TYPE_COLOR[t] }));
  else if (lens === 'stage') all = STAGE_ORDER.map((s) => ({ key: s, label: STAGE_LABEL[s], color: STAGE_COLOR[s] }));
  else if (lens === 'systems') {
    const colors = systemColors(data);
    all = [
      ...data.systems.map((s) => ({ key: s.id, label: s.name, color: colors.get(s.id)! })),
      { key: NO_SYSTEM, label: 'No open task', color: 'var(--gray-8)' },
    ];
  } else {
    const subs = [...new Set(dials.map((d) => d.nextSub))];
    const officerSubs = new Set(dials.map((d) => d.officerSub));
    subs.sort((a, b) => (officerSubs.has(a) ? -1 : 0) - (officerSubs.has(b) ? -1 : 0) || nameOf(data, a).localeCompare(nameOf(data, b)));
    let i = 0;
    all = subs.map((s) => ({
      key: s,
      label: nameOf(data, s) + (officerSubs.has(s) ? ' (officer)' : ''),
      color: officerSubs.has(s) ? 'var(--accent-9)' : PALETTE[i++ % PALETTE.length],
    }));
  }
  return all.filter((g) => present.has(g.key));
}

export function groupKey(d: Dial, lens: TowerLens): string {
  switch (lens) {
    case 'state':
      return d.clock.state;
    case 'type':
      return d.type;
    case 'stage':
      return d.stage;
    case 'systems':
      return d.waitingSystemId ?? NO_SYSTEM;
    case 'owner':
      return d.nextSub;
  }
}

/* ------------------------------------------------------------------ view as */

/** Under "system owner", items without a task for that person step back. */
export function isDimmed(d: Dial, viewAs: ViewAs, ownerSub: string | null): boolean {
  if (viewAs === 'officer' || !ownerSub) return false;
  return !d.tasks.some((t) => t.assigneeSub === ownerSub);
}

/** Who "system owner" means: the viewer if they own a system, else the owner with the most open tasks. */
export function ownerForView(data: PrivacyData, viewerSub: string): string | null {
  if (data.systems.some((s) => s.ownerSub === viewerSub)) return viewerSub;
  const counts = new Map<string, number>();
  for (const t of data.tasks) if (t.status !== 'done') counts.set(t.assigneeSub, (counts.get(t.assigneeSub) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best?.[0] ?? data.systems[0]?.ownerSub ?? null;
}

/* ------------------------------------------------------------------ today */

export type Severity = 'bad' | 'warn' | 'info' | 'ok' | 'brand';

export interface TodayEntry {
  id: string;
  focusId: string;
  title: string;
  severity: Severity;
  value: string;
  unit: string;
  lens: TowerLens;
  meta: string;
}

const sevOf = (s: ClockState): Severity => (s === 'overdue' || s === 'critical' ? 'bad' : s === 'due_soon' ? 'warn' : 'info');

/**
 * The officer's Today: the running breach clock, the most overdue request, the extension that must be notified
 * today, the next request due within 7 days, and blocked tasks. One of each, most urgent first.
 * A system owner's Today: their own open and blocked tasks, soonest first.
 */
export function todayFor(dials: Dial[], data: PrivacyData, viewAs: ViewAs, ownerSub: string | null, now: Date): TodayEntry[] {
  if (viewAs === 'owner' && ownerSub) return ownerToday(dials, data, ownerSub, now);
  const out: TodayEntry[] = [];
  const reqs = dials.filter((d) => d.kind === 'request');

  const breaches = dials.filter((d) => d.kind === 'breach' && d.clock.running).sort((a, b) => a.clock.leftMs - b.clock.leftMs);
  const br = breaches[0];
  if (br) {
    const h = Math.floor(Math.abs(br.clock.leftMs) / HOUR);
    out.push({
      id: `breach:${br.id}`,
      focusId: br.id,
      title: br.clock.leftMs >= 0 ? `Breach ${br.ref}: notify within 72 hours` : `Breach ${br.ref} is past 72 hours`,
      severity: br.clock.leftMs < rules.breachCriticalHours * HOUR ? 'bad' : 'warn',
      value: `${h}h`,
      unit: br.clock.leftMs >= 0 ? 'left' : 'late',
      lens: 'state',
      meta: br.breach?.decision === 'pending' ? 'No decision yet' : br.stageLabel,
    });
  }

  const overdue = reqs.filter((d) => d.clock.state === 'overdue').sort((a, b) => a.clock.leftMs - b.clock.leftMs);
  if (overdue[0]) {
    const d = overdue[0];
    out.push({
      id: `overdue:${d.id}`,
      focusId: d.id,
      title: `${d.ref} is overdue`,
      severity: 'bad',
      value: String(Math.max(1, Math.floor(-d.clock.leftMs / DAY))),
      unit: Math.floor(-d.clock.leftMs / DAY) === 1 ? 'day over' : 'days over',
      lens: 'state',
      meta: overdue.length > 1 ? `${overdue.length} overdue in all` : `${TYPE_LABEL[d.type as RequestType]} · ${d.stageLabel}`,
    });
  }

  const lastDay = reqs.filter((d) => d.request && !d.request.extendedDueAt && calendarDaysBetween(now, d.request.dueAt) === 0 && d.clock.leftMs >= 0);
  if (lastDay[0]) {
    const d = lastDay[0];
    out.push({
      id: `extend:${d.id}`,
      focusId: d.id,
      title: `Last day to notify an extension for ${d.ref}`,
      severity: 'warn',
      value: `${Math.floor(d.clock.leftMs / HOUR)}h`,
      unit: 'left today',
      lens: 'stage',
      meta: `${TYPE_LABEL[d.type as RequestType]} · ${d.stageLabel}`,
    });
  }

  const soon = reqs
    .filter((d) => d.clock.leftMs >= 0 && d.clock.leftMs <= rules.dueWithinDays * DAY && !lastDay.includes(d))
    .sort((a, b) => a.clock.leftMs - b.clock.leftMs);
  const dueWeek = reqs.filter((d) => d.clock.leftMs >= 0 && d.clock.leftMs <= rules.dueWithinDays * DAY).length;
  if (soon[0]) {
    const d = soon[0];
    const days = Math.floor(d.clock.leftMs / DAY);
    out.push({
      id: `soon:${d.id}`,
      focusId: d.id,
      title: `${d.ref} is due in ${days === 0 ? 'under a day' : days === 1 ? '1 day' : `${days} days`}`,
      severity: sevOf(d.clock.state),
      value: String(days),
      unit: days === 1 ? 'day left' : 'days left',
      lens: 'state',
      meta: `${dueWeek} due within ${rules.dueWithinDays} days`,
    });
  }

  const blocked = dials.flatMap((d) => d.tasks.filter((t) => t.status === 'blocked').map((t) => ({ d, t })));
  if (blocked[0]) {
    const sys = (id: string | null) => data.systems.find((s) => s.id === id)?.name ?? 'a system';
    out.push({
      id: `blocked:${blocked[0].t.id}`,
      focusId: blocked[0].d.id,
      title: blocked.length === 1 ? `A task on ${sys(blocked[0].t.systemId)} is blocked` : `${blocked.length} tasks are blocked`,
      severity: 'warn',
      value: String(blocked.length),
      unit: blocked.length === 1 ? 'blocked' : 'blocked',
      lens: 'systems',
      meta: [...new Set(blocked.map((b) => `${b.d.ref} · ${sys(b.t.systemId)}`))].slice(0, 2).join(', '),
    });
  }
  return out.slice(0, 5);
}

function ownerToday(dials: Dial[], data: PrivacyData, ownerSub: string, now: Date): TodayEntry[] {
  const mine = dials
    .flatMap((d) => d.tasks.filter((t) => t.assigneeSub === ownerSub && t.status !== 'done').map((t) => ({ d, t })))
    .sort((a, b) => (a.t.status === 'blocked' ? -1 : 0) - (b.t.status === 'blocked' ? -1 : 0) || toMs(a.t.dueAt) - toMs(b.t.dueAt));
  return mine.slice(0, 5).map(({ d, t }) => {
    const left = toMs(t.dueAt) - now.getTime();
    const days = Math.floor(left / DAY);
    const sys = data.systems.find((s) => s.id === t.systemId)?.name ?? 'No system';
    return {
      id: `task:${t.id}`,
      focusId: d.id,
      title: t.status === 'blocked' ? `Blocked: ${sys} for ${d.ref}` : `${t.title.replace(`${d.ref}: `, '').replace(/^./, (c) => c.toUpperCase())} for ${d.ref}`,
      severity: t.status === 'blocked' ? 'warn' : left < 0 ? 'bad' : days <= 2 ? 'warn' : 'info',
      value: left < 0 ? String(Math.max(1, Math.floor(-left / DAY))) : left < DAY ? `${Math.max(1, Math.floor(left / HOUR))}h` : String(days),
      unit: left < 0 ? (Math.floor(-left / DAY) <= 1 ? 'day late' : 'days late') : left < DAY ? 'left' : days === 1 ? 'day left' : 'days left',
      lens: 'systems' as const,
      meta: d.kind === 'breach' ? `Breach · ${d.words}` : `${TYPE_LABEL[d.type as RequestType]} · response ${d.words}`,
    };
  });
}
