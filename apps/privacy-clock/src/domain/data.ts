/**
 * Loading. Everything the tower, the tools and the Almanac need is small (a few hundred rows), so screens load the
 * whole picture once and derive views in memory with pure functions.
 */
import type { DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { toMs } from '@x10/shared/lib';

import type { BreachCase, DataSystem, LogEvent, ParentType, PrivacyRequest, Schema, Task } from '../model';

export interface PrivacyData {
  requests: PrivacyRequest[];
  breaches: BreachCase[];
  systems: DataSystem[];
  tasks: Task[];
  events: LogEvent[];
  people: Person[];
}

export async function loadAll(store: DataStore<Schema>): Promise<PrivacyData> {
  const [requests, breaches, systems, tasks, events, people] = await Promise.all([
    store.repo('PrivacyRequest').list(),
    store.repo('BreachCase').list(),
    store.repo('DataSystem').list(),
    store.repo('Task').list(),
    store.repo('Event').list(),
    store.repo('Person').list(),
  ]);
  requests.sort((a, b) => a.ref.localeCompare(b.ref));
  breaches.sort((a, b) => a.ref.localeCompare(b.ref));
  systems.sort((a, b) => a.name.localeCompare(b.name));
  return { requests, breaches, systems, tasks, events: sortEvents(events), people };
}

const KIND_ORDER: Record<LogEvent['kind'], number> = {
  created: 0,
  verified: 1,
  status: 2,
  extended: 3,
  reassigned: 4,
  task_blocked: 5,
  task_done: 6,
  decision: 7,
  notified: 8,
  note: 9,
  closed: 10,
};

/** Oldest first; same-instant events keep a stable, readable order. */
export function sortEvents(events: LogEvent[]): LogEvent[] {
  return [...events].sort((a, b) => toMs(a.at) - toMs(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
}

export function eventsFor(data: Pick<PrivacyData, 'events'>, type: ParentType, id: string): LogEvent[] {
  return data.events.filter((e) => e.parentType === type && e.parentId === id);
}

export function tasksFor(data: Pick<PrivacyData, 'tasks'>, type: ParentType, id: string): Task[] {
  return data.tasks
    .filter((t) => t.parentType === type && t.parentId === id)
    .sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt) || a.title.localeCompare(b.title));
}

/** Display name for a sub: the Person row, then a system's owner name, then a neutral label. */
export function nameOf(data: Pick<PrivacyData, 'people' | 'systems'>, sub: string | null | undefined): string {
  if (!sub) return '—';
  const p = data.people.find((x) => x.sub === sub);
  if (p) return p.displayName;
  const s = data.systems.find((x) => x.ownerSub === sub);
  return s ? s.ownerName : 'Unknown person';
}

/** Privacy officers (admins), oldest first: the first one handles breaches reported by others. */
export function officers(people: Person[]): Person[] {
  return people.filter((p) => p.isAdmin === true).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Next reference such as "DSR-0143" or "BR-0008". */
export function nextRef(prefix: string, refs: string[]): string {
  let max = 0;
  for (const r of refs) {
    const m = r.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/** When the breach's current decision was recorded (from the logbook), or null. */
export function decidedAt(data: Pick<PrivacyData, 'events'>, breachId: string): string | null {
  const ev = data.events.filter((e) => e.parentType === 'breach' && e.parentId === breachId && e.kind === 'decision');
  return ev.length ? ev[ev.length - 1].at : null;
}
