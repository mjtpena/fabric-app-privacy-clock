/**
 * One task: system, action, assignee, due, status, and the controls the viewer may use (the assignee completes or
 * blocks it; the handling officer reassigns it).
 */
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Check, CircleSlash, RotateCcw } from 'lucide-react';

import { DAY, formatDate, toMs, useAction, useNow } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Badge, Button, cx, IconButton, InlineError, Input, Menu, type Tone } from '@x10/shared/ui';

import { nameOf, type PrivacyData } from '../domain/data';
import { blockTask, completeTask, reassignTask, reopenTask } from '../domain/tasks';
import { ACTION_LABEL, TASK_STATUS_LABEL } from '../labels';
import type { Schema, Task } from '../model';

const TONE: Record<Task['status'], Tone> = { open: 'neutral', done: 'ok', blocked: 'bad' };

export function TaskRow({
  t,
  data,
  parentRef,
  showParent,
  hideSystem,
  onChanged,
}: {
  t: Task;
  data: PrivacyData;
  parentRef: string;
  showParent?: boolean;
  /** In a system's column the system name is already the heading. */
  hideSystem?: boolean;
  onChanged: (msg: string, task: Task) => void;
}) {
  const { store, me } = useApp<Schema>();
  const now = useNow(60_000);
  const id = useId();
  const [blocking, setBlocking] = useState(false);
  const [note, setNote] = useState('');
  const sys = data.systems.find((s) => s.id === t.systemId);
  const mineToDo = t.assigneeSub === me.sub && t.status !== 'done';
  const canReassign = t.officerSub === me.sub && t.status !== 'done';
  const late = t.status !== 'done' && toMs(t.dueAt) < now.getTime();
  const days = Math.ceil((toMs(t.dueAt) - now.getTime()) / DAY);
  const dueText = t.status === 'done' ? `done ${formatDate(t.doneAt)}` : late ? `${-days + 1}d late` : days <= 0 ? 'due today' : `due in ${days}d`;

  const complete = useAction(async () => {
    const x = await completeTask(store, me, t.id, '');
    onChanged(`${ACTION_LABEL[t.action]} on ${sys?.name ?? 'the system'} done for ${parentRef}.`, x);
  });
  const block = useAction(async () => {
    const x = await blockTask(store, me, t.id, note);
    setBlocking(false);
    setNote('');
    onChanged(`Marked blocked. ${nameOf(data, t.officerSub)} can see why.`, x);
  });
  const reopen = useAction(async () => {
    const x = await reopenTask(store, me, t.id);
    onChanged('Unblocked.', x);
  });
  const reassign = useAction(async (systemId: string) => {
    const x = await reassignTask(store, me, t.id, systemId);
    const to = data.systems.find((s) => s.id === systemId);
    onChanged(`Reassigned to ${to?.name} (${to?.ownerName}).`, x);
  });
  const err = complete.error ?? block.error ?? reopen.error ?? reassign.error;
  const parentPath = t.parentType === 'breach' ? `/escapement/${t.parentId}` : `/requests/${t.parentId}`;

  return (
    <li className="px-4 py-3" data-testid="task-row" data-task={t.id} data-status={t.status}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {showParent && (
              <Link to={parentPath} className="font-mono text-ui font-semibold text-fg tabular-nums">
                {parentRef}
              </Link>
            )}
            <span className="text-sm font-medium">
              {hideSystem ? ACTION_LABEL[t.action] : `${ACTION_LABEL[t.action]} · ${sys?.name ?? 'No system'}`}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {nameOf(data, t.assigneeSub)}
            <span className={cx('font-mono sm:hidden', late && 'text-bad-text')}> · {dueText}</span>
            {t.note && <span className={cx('ml-1', t.status === 'blocked' && 'text-bad-text')}>· {t.note}</span>}
          </div>
        </div>
        <div className={cx('hidden text-right font-mono text-ui num sm:block', late ? 'text-bad-text' : 'text-muted')}>
          {dueText}
        </div>
        <div className="flex items-center justify-end gap-1">
          <Badge tone={TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
          {canReassign && (
            <Menu
              label="Reassign to"
              trigger={<IconButton size="sm" label={`Reassign ${ACTION_LABEL[t.action].toLowerCase()} task`} icon={<ArrowRightLeft />} className="-my-1" />}
              items={[
                { type: 'label' as const, label: 'Reassign to' },
                ...data.systems
                  .filter((s) => !(s.id === t.systemId && s.ownerSub === t.assigneeSub))
                  .map((s) => ({ label: s.name, description: s.ownerName, onSelect: () => void reassign.run(s.id) })),
              ]}
            />
          )}
        </div>
      </div>
      {mineToDo && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {mineToDo && t.status === 'open' && (
            <>
              <Button size="sm" variant="primary" icon={<Check />} onClick={() => void complete.run()} busy={complete.pending} data-testid="task-done">
                Mark done
              </Button>
              <Button size="sm" variant="ghost" icon={<CircleSlash />} onClick={() => setBlocking((b) => !b)} aria-expanded={blocking}>
                Blocked…
              </Button>
            </>
          )}
          {mineToDo && t.status === 'blocked' && (
            <>
              <Button size="sm" variant="primary" icon={<Check />} onClick={() => void complete.run()} busy={complete.pending} data-testid="task-done">
                Mark done
              </Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => void reopen.run()} busy={reopen.pending}>
                Unblock
              </Button>
            </>
          )}
        </div>
      )}
      {blocking && (
        <form
          className="mt-2.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void block.run();
          }}
        >
          <label htmlFor={`${id}-note`} className="sr-only">
            What blocks it
          </label>
          <Input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What blocks it?" controlSize="sm" autoFocus maxLength={600} />
          <Button size="sm" type="submit" busy={block.pending}>
            Save
          </Button>
        </form>
      )}
      <InlineError error={err} />
    </li>
  );
}
