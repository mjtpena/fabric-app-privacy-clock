/**
 * The Gears: tasks on systems. The assignee records progress; the handling officer reassigns. Every change writes a
 * logbook event on the parent request or breach.
 */
import { NotFoundError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, toMs } from '@x10/shared/lib';

import { ACTION_LABEL } from '../labels';
import { limits, type DataSystem, type Schema, type Task, type TaskAction } from '../model';
import { requireAssignee, requireBreachOfficer, requireRequestOfficer, requireTaskOfficer } from './access';
import { getBreach } from './breaches';
import { logEvent } from './events';
import { getRequest } from './requests';
import { checkTaskUpdate } from './rules';

const parentOf = (t: Task) => ({ type: t.parentType, id: t.parentId });

async function getTask(store: DataStore<Schema>, id: string): Promise<Task> {
  const t = await store.repo('Task').get(id);
  if (!t) throw new NotFoundError('Task', id);
  return t;
}

async function systemName(store: DataStore<Schema>, t: Task): Promise<string> {
  if (!t.systemId) return 'No system';
  return (await store.repo('DataSystem').get(t.systemId))?.name ?? 'Unknown system';
}

export async function completeTask(store: DataStore<Schema>, me: Person, id: string, note = '', now = new Date()): Promise<Task> {
  const t = await getTask(store, id);
  requireAssignee(me, t);
  const msg = checkTaskUpdate(t, 'done', note);
  if (msg) throw new RuleError(msg);
  if (t.status === 'done') throw new RuleError('This task is already done.');
  const n = note.trim().slice(0, limits.taskNote.max);
  const updated = await store.repo('Task').update(t.id, { status: 'done', doneAt: now.toISOString(), note: n || t.note });
  await logEvent(store, me, parentOf(t), 'task_done', `${ACTION_LABEL[t.action]} on ${await systemName(store, t)} done by ${me.displayName}.${n ? ` ${n}` : ''}`, now);
  return updated;
}

export async function blockTask(store: DataStore<Schema>, me: Person, id: string, note: string, now = new Date()): Promise<Task> {
  const t = await getTask(store, id);
  requireAssignee(me, t);
  const msg = checkTaskUpdate(t, 'blocked', note);
  if (msg) throw new RuleError(msg);
  const n = note.trim().slice(0, limits.taskNote.max);
  const updated = await store.repo('Task').update(t.id, { status: 'blocked', note: n });
  await logEvent(store, me, parentOf(t), 'task_blocked', `${ACTION_LABEL[t.action]} on ${await systemName(store, t)} blocked: ${n}`, now);
  return updated;
}

export async function reopenTask(store: DataStore<Schema>, me: Person, id: string, now = new Date()): Promise<Task> {
  const t = await getTask(store, id);
  requireAssignee(me, t);
  if (t.status !== 'blocked') throw new RuleError('Only a blocked task can be reopened.');
  const updated = await store.repo('Task').update(t.id, { status: 'open' });
  await logEvent(store, me, parentOf(t), 'status', `${ACTION_LABEL[t.action]} on ${await systemName(store, t)} unblocked by ${me.displayName}.`, now);
  return updated;
}

/** Hand a task to another system's owner (or the same system's new owner). The logbook keeps who had it. */
export async function reassignTask(store: DataStore<Schema>, me: Person, id: string, toSystemId: string, now = new Date()): Promise<Task> {
  const t = await getTask(store, id);
  requireTaskOfficer(me, t);
  if (t.status === 'done') throw new RuleError('A done task cannot be reassigned.');
  const to = await store.repo('DataSystem').get(toSystemId);
  if (!to) throw new NotFoundError('System', toSystemId);
  if (to.id === t.systemId && to.ownerSub === t.assigneeSub) throw new RuleError('The task is already with that system and owner.');
  const fromName = await systemName(store, t);
  const people = await store.repo('Person').list();
  const prev = people.find((p) => p.sub === t.assigneeSub)?.displayName ?? (await store.repo('DataSystem').list()).find((s) => s.ownerSub === t.assigneeSub)?.ownerName ?? 'the previous owner';
  const title = t.title.replace(fromName, to.name).slice(0, limits.taskTitle.max);
  const updated = await store.repo('Task').update(t.id, { systemId: to.id, assigneeSub: to.ownerSub, title, status: t.status === 'blocked' ? 'open' : t.status });
  await logEvent(store, me, parentOf(t), 'reassigned', `${ACTION_LABEL[t.action]} moved from ${fromName} (${prev}) to ${to.name} (${to.ownerName}).`, now);
  return updated;
}

/** The officer adds a single task (any action) to a request or breach they handle. */
export async function addTask(
  store: DataStore<Schema>,
  me: Person,
  parent: { type: Task['parentType']; id: string },
  x: { systemId: string; action: TaskAction; title: string; dueAt: string },
  now = new Date(),
): Promise<Task> {
  if (parent.type === 'request') requireRequestOfficer(me, await getRequest(store, parent.id));
  else requireBreachOfficer(me, await getBreach(store, parent.id));
  const s: DataSystem | null = await store.repo('DataSystem').get(x.systemId);
  if (!s) throw new RuleError('Choose a system.');
  const msg = checkText(x.title, { ...limits.taskTitle, label: 'Task' });
  if (msg) throw new RuleError(msg);
  if (Number.isNaN(toMs(x.dueAt))) throw new RuleError('Choose a due date.');
  const t = await store.repo('Task').create({
    parentType: parent.type,
    parentId: parent.id,
    systemId: s.id,
    action: x.action,
    title: x.title.trim(),
    assigneeSub: s.ownerSub,
    officerSub: me.sub,
    status: 'open',
    note: null,
    dueAt: new Date(toMs(x.dueAt)).toISOString(),
    doneAt: null,
  });
  await logEvent(store, me, parent, 'note', `Task added: ${x.title.trim()} (${s.name}, ${s.ownerName}).`, now);
  return t;
}
