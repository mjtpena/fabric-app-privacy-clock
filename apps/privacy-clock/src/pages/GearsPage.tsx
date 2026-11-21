/**
 * The Gears: the task board by system. Each system is a gear that turns one tooth for every task done on it; under it,
 * the open and blocked tasks with the controls the viewer may use. System owners see their own systems first.
 */
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { toMs, useAction } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Button, Dialog, DataState, EmptyState, Field, InlineError, Input, PageHeader, Select, SegmentedControl, Skeleton, Toast } from '@x10/shared/ui';

import { usePrivacyData } from '../components/bits';
import { TaskRow } from '../components/TaskRow';
import { isOfficer } from '../domain/access';
import type { PrivacyData } from '../domain/data';
import { addSystem } from '../domain/systems';
import { limits, type DataSystem, type Schema, type Task } from '../model';
import { gearPath } from '../tower/geometry';

type Scope = 'mine' | 'all';

export function GearsPage() {
  const { me } = useApp<Schema>();
  const state = usePrivacyData();
  const ownsSystems = !!state.data?.systems.some((s) => s.ownerSub === me.sub);
  const [scope, setScope] = useState<Scope | null>(null);
  const effective: Scope = scope ?? (isOfficer(me) ? 'all' : 'mine');
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Gears"
        meta={state.data ? <GearsMeta data={state.data} /> : undefined}
        actions={
          <>
            <SegmentedControl<Scope>
              label="Show"
              value={effective}
              onChange={setScope}
              options={[
                { value: 'mine', label: 'My tasks' },
                { value: 'all', label: 'All systems' },
              ]}
            />
            {isOfficer(me) && (
              <Button icon={<Plus />} onClick={() => setAdding(true)}>
                Add system
              </Button>
            )}
          </>
        }
      />
      <DataState
        state={state}
        skeleton={
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={260} />
            ))}
          </div>
        }
        isEmpty={(d) => d.systems.length === 0}
        empty={
          <EmptyState title="No systems yet" action={isOfficer(me) ? <Button variant="primary" onClick={() => setAdding(true)}>Add the first system</Button> : undefined}>
            Systems that hold personal data, and the people who search, export or erase in them, go here.
          </EmptyState>
        }
      >
        {(data) => <Board data={data} scope={effective} ownsSystems={ownsSystems} reload={state.reload} />}
      </DataState>
      {adding && state.data && <AddSystem data={state.data} onClose={() => setAdding(false)} onAdded={() => void state.reload()} />}
    </>
  );
}

function GearsMeta({ data }: { data: PrivacyData }) {
  const live = liveTasks(data);
  const open = live.filter((t) => t.status === 'open').length;
  const blocked = live.filter((t) => t.status === 'blocked').length;
  return (
    <span className="num">
      {data.systems.length} systems · {open} open · {blocked} blocked
    </span>
  );
}

/** Tasks whose request or breach is still open. */
function liveTasks(data: PrivacyData): Task[] {
  const openReq = new Set(data.requests.filter((r) => r.status !== 'closed' && r.status !== 'refused').map((r) => r.id));
  const openBr = new Set(data.breaches.filter((b) => b.status !== 'closed').map((b) => b.id));
  return data.tasks.filter((t) => (t.parentType === 'request' ? openReq.has(t.parentId) : openBr.has(t.parentId)));
}

function refOf(data: PrivacyData, t: Task): string {
  return (t.parentType === 'request' ? data.requests.find((r) => r.id === t.parentId)?.ref : data.breaches.find((b) => b.id === t.parentId)?.ref) ?? '—';
}

function Board({ data, scope, ownsSystems, reload }: { data: PrivacyData; scope: Scope; ownsSystems: boolean; reload: () => Promise<void> }) {
  const { me } = useApp<Schema>();
  const navigate = useNavigate();
  const [toast, setToast] = useState<{ msg: string; task: Task } | null>(null);
  const live = useMemo(() => liveTasks(data), [data]);
  const systems = useMemo(() => {
    const list = scope === 'mine' ? data.systems.filter((s) => live.some((t) => t.systemId === s.id && t.assigneeSub === me.sub)) : data.systems;
    return [...list].sort((a, b) => (a.ownerSub === me.sub ? -1 : 0) - (b.ownerSub === me.sub ? -1 : 0) || a.name.localeCompare(b.name));
  }, [data.systems, live, scope, me.sub]);

  if (scope === 'mine' && systems.length === 0) {
    return (
      <EmptyState title={ownsSystems ? 'Nothing waiting on you' : 'No tasks assigned to you'}>
        {ownsSystems ? 'Every task on your systems is done.' : 'Tasks appear here when a privacy officer assigns a system you own.'}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        {systems.map((s) => (
          <SystemColumn
            key={s.id}
            s={s}
            data={data}
            tasks={live.filter((t) => t.systemId === s.id && (scope === 'all' || t.assigneeSub === me.sub))}
            doneAll={data.tasks.filter((t) => t.systemId === s.id && t.status === 'done').length}
            onChanged={async (msg, task) => {
              await reload();
              setToast({ msg, task });
            }}
          />
        ))}
      </div>
      <Toast
        message={toast?.msg ?? null}
        onDone={() => setToast(null)}
        tone="ok"
        action={
          toast && toast.task.status === 'done'
            ? { label: 'See the dial', onClick: () => navigate('/', { state: { focus: toast.task.parentId, flashTask: toast.task.id } }) }
            : undefined
        }
      />
    </>
  );
}

function SystemColumn({
  s,
  data,
  tasks,
  doneAll,
  onChanged,
}: {
  s: DataSystem;
  data: PrivacyData;
  tasks: Task[];
  doneAll: number;
  onChanged: (msg: string, t: Task) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const pending = tasks.filter((t) => t.status !== 'done').sort((a, b) => (a.status === 'blocked' ? -1 : 0) - (b.status === 'blocked' ? -1 : 0) || toMs(a.dueAt) - toMs(b.dueAt));
  const done = tasks.filter((t) => t.status === 'done');
  const blocked = pending.filter((t) => t.status === 'blocked').length;
  return (
    <section className="min-w-0" data-testid="gear-column" data-system={s.name} aria-label={s.name}>
      <header className="mb-3 flex items-center gap-3">
        <Gear turns={doneAll} blocked={blocked > 0} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-base font-semibold leading-6">{s.name}</h2>
          <p className="m-0 truncate text-xs text-muted">
            {s.ownerName}
            {s.holds ? ` · ${s.holds}` : ''}
          </p>
        </div>
        <div className="text-right font-mono text-ui num">
          <div className="text-fg">{pending.length} open</div>
          {blocked > 0 && <div className="text-bad-text">{blocked} blocked</div>}
        </div>
      </header>
      {pending.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-line px-4 py-5 text-ui text-muted">Nothing waiting on {s.name}.</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-[var(--line)] rounded-xl border border-line bg-surface p-0">
          {pending.map((t) => (
            <TaskRow key={t.id} t={t} data={data} parentRef={refOf(data, t)} showParent hideSystem onChanged={onChanged} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-2">
          <button type="button" className="cursor-pointer text-ui text-muted hover:text-fg" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && (
            <ul className="m-0 mt-2 list-none divide-y divide-[var(--line)] rounded-xl border border-line bg-surface p-0 opacity-80">
              {done.map((t) => (
                <TaskRow key={t.id} t={t} data={data} parentRef={refOf(data, t)} showParent hideSystem onChanged={onChanged} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** A gear that turns one tooth for each task done on the system. */
function Gear({ turns, blocked }: { turns: number; blocked: boolean }) {
  const teeth = 10;
  return (
    <svg viewBox="-26 -26 52 52" width={44} height={44} aria-hidden="true" className="shrink-0">
      <g className="pc-gear" style={{ transform: `rotate(${turns * (360 / teeth)}deg)` }}>
        <path d={gearPath(22, teeth, 5)} fill="url(#pc-brass)" stroke="var(--pc-brass-lo)" strokeWidth={1} />
        <circle r={10} fill="var(--surface)" stroke="var(--pc-brass-lo)" strokeWidth={1} />
        <path d="M0 -10V-4M0 4V10M-10 0H-4M4 0H10" stroke="var(--pc-brass-lo)" strokeWidth={1.4} />
      </g>
      <circle r={3.2} fill={blocked ? 'var(--bad-solid)' : 'var(--accent-9)'} />
    </svg>
  );
}

function AddSystem({ data, onClose, onAdded }: { data: PrivacyData; onClose: () => void; onAdded: () => void }) {
  const { store, me } = useApp<Schema>();
  const id = useId();
  const [name, setName] = useState('');
  const [owner, setOwner] = useState(data.people[0]?.sub ?? '');
  const [holds, setHolds] = useState('');
  const run = useAction(async () => {
    await addSystem(store, me, { name, ownerSub: owner, holds });
    onAdded();
    onClose();
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a system"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void run.run()} busy={run.pending}>
            Add system
          </Button>
        </>
      }
    >
      <Field label="Name" htmlFor={`${id}-name`} counter={{ value: name.length, max: limits.systemName.max }} required>
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={limits.systemName.max} />
      </Field>
      <Field label="Owner" htmlFor={`${id}-owner`} hint="The person who searches, exports and erases data in it.">
        <Select id={`${id}-owner`} value={owner} onChange={(e) => setOwner(e.target.value)}>
          {data.people.map((p) => (
            <option key={p.sub} value={p.sub}>
              {p.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Personal data it holds" htmlFor={`${id}-holds`} counter={{ value: holds.length, max: limits.holds.max }}>
        <Input id={`${id}-holds`} value={holds} onChange={(e) => setHolds(e.target.value)} maxLength={limits.holds.max} />
      </Field>
      <InlineError error={run.error} />
    </Dialog>
  );
}
