/**
 * Logbook: the full event trail for one request or breach, oldest first, printable. Entries are append-only: there
 * is no way to change or remove one, here or in the database.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, Printer } from 'lucide-react';

import { formatDate, formatDateTime, useAction, useNow } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Button, cx, DataState, EmptyState, InlineError, Input, PageHeader, SearchInput, Select, Skeleton } from '@x10/shared/ui';

import { ClockBadge, usePrivacyData } from '../components/bits';
import { Trail } from '../components/Trail';
import { addBreachNote } from '../domain/breaches';
import { breachClock, requestClock } from '../domain/clock';
import { eventsFor, nameOf, type PrivacyData } from '../domain/data';
import { addRequestNote } from '../domain/requests';
import { BREACH_STATUS_LABEL, STATUS_LABEL, TYPE_LABEL } from '../labels';
import type { ParentType, Schema } from '../model';

interface Item {
  type: ParentType;
  id: string;
  ref: string;
  title: string;
  status: string;
  open: boolean;
  at: string;
}

function itemsOf(data: PrivacyData): Item[] {
  return [
    ...data.breaches.map((b) => ({ type: 'breach' as const, id: b.id, ref: b.ref, title: b.title, status: BREACH_STATUS_LABEL[b.status], open: b.status !== 'closed', at: b.awareAt })),
    ...data.requests.map((r) => ({
      type: 'request' as const,
      id: r.id,
      ref: r.ref,
      title: `${TYPE_LABEL[r.type]} · ${r.subjectLabel}`,
      status: STATUS_LABEL[r.status],
      open: r.status !== 'closed' && r.status !== 'refused',
      at: r.receivedAt,
    })),
  ].sort((a, b) => Number(b.open) - Number(a.open) || (a.type === b.type ? b.ref.localeCompare(a.ref) : a.type === 'breach' ? -1 : 1));
}

export function LogbookPage() {
  const state = usePrivacyData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  return (
    <DataState
      state={state}
      skeleton={
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          <Skeleton height={420} />
          <Skeleton height={420} />
        </div>
      }
      isEmpty={(d) => d.requests.length + d.breaches.length === 0}
      empty={<EmptyState title="The logbook is empty">Every request and breach writes its steps here.</EmptyState>}
    >
      {(data) => {
        const items = itemsOf(data);
        const [type, id] = (params.get('item') ?? '').split(':');
        const current = items.find((i) => i.type === type && i.id === id) ?? items[0];
        const words = q.trim().toLowerCase();
        const shown = words ? items.filter((i) => i.ref.toLowerCase().includes(words) || i.title.toLowerCase().includes(words)) : items;
        return (
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-[280px_minmax(0,1fr)]">
            <nav aria-label="Requests and breaches" className="no-print min-w-0 md:sticky md:top-[calc(var(--header-h)+24px)] md:self-start">
              <h1 className="m-0 mb-4 text-xl font-semibold md:text-2xl">Logbook</h1>
              <label htmlFor="pc-log-item" className="sr-only">
                Request or breach
              </label>
              <Select
                id="pc-log-item"
                className="md:hidden"
                value={current ? `${current.type}:${current.id}` : ''}
                onChange={(e) => setParams({ item: e.target.value }, { replace: true })}
              >
                {items.map((i) => (
                  <option key={`${i.type}:${i.id}`} value={`${i.type}:${i.id}`}>
                    {i.ref} · {i.title}
                  </option>
                ))}
              </Select>
              <SearchInput value={q} onChange={setQ} label="Find an item" placeholder="Find DSR or BR…" className="mb-3 hidden md:block" />
              <ol className="m-0 hidden max-h-[calc(100svh-220px)] list-none overflow-y-auto p-0 md:block" data-testid="logbook-items">
                {shown.map((i) => {
                  const on = i === current;
                  return (
                    <li key={`${i.type}:${i.id}`}>
                      <button
                        type="button"
                        onClick={() => setParams({ item: `${i.type}:${i.id}` }, { replace: true })}
                        aria-current={on || undefined}
                        className={cx('grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5 rounded-lg px-2.5 py-2 text-left', on ? 'bg-accent-3' : 'hover:bg-surface-2')}
                      >
                        <span className={cx('font-mono text-ui font-semibold num', on ? 'text-accent-11' : 'text-fg')}>{i.ref}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-ui">{i.title}</span>
                          <span className="block text-xs text-muted">{i.open ? i.status : `${i.status} · ${formatDate(i.at)}`}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
            {current && <ItemLog data={data} item={current} reload={state.reload} />}
          </div>
        );
      }}
    </DataState>
  );
}

function ItemLog({ data, item, reload }: { data: PrivacyData; item: Item; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const now = useNow(60_000);
  const id = useId();
  const [note, setNote] = useState('');
  const events = useMemo(() => eventsFor(data, item.type, item.id), [data, item]);
  const req = item.type === 'request' ? data.requests.find((r) => r.id === item.id) : undefined;
  const br = item.type === 'breach' ? data.breaches.find((b) => b.id === item.id) : undefined;
  const clock = req ? requestClock(req, now) : br ? breachClock(br, now) : null;
  const canNote = req ? req.ownerSub === me.sub || data.tasks.some((t) => t.parentId === req.id && t.assigneeSub === me.sub) : br ? br.officerSub === me.sub || br.reportedBy === me.sub : false;
  const add = useAction(async () => {
    if (item.type === 'request') await addRequestNote(store, me, item.id, note);
    else await addBreachNote(store, me, item.id, note);
    setNote('');
    await reload();
  });
  return (
    <article className="min-w-0" data-testid="logbook" data-item={`${item.type}:${item.id}`}>
      <PageHeader
        eyebrow={<span className="font-mono num">{item.type === 'breach' ? 'Personal data breach' : 'Data subject request'}</span>}
        title={
          <>
            <span className="font-mono num">{item.ref}</span> <span className="font-normal text-muted">·</span> {item.title}
          </>
        }
        meta={
          <>
            {clock && <ClockBadge clock={clock} />}
            <span>{item.status}</span>
            <span>
              {events.length} {events.length === 1 ? 'entry' : 'entries'}
            </span>
            <Link to={item.type === 'breach' ? `/escapement/${item.id}` : `/requests/${item.id}`} className="no-print">
              Open the {item.type}
            </Link>
          </>
        }
        actions={
          <Button icon={<Printer />} onClick={() => window.print()} className="no-print">
            Print
          </Button>
        }
      />
      <p className="m-0 mb-5 flex items-center gap-2 text-ui text-muted">
        <Lock className="size-3.5" aria-hidden="true" />
        Entries cannot be changed or removed. Printed {formatDateTime(now.toISOString())} by {nameOf(data, me.sub)}.
      </p>
      <Trail events={events} data={data} />
      {canNote && (
        <form
          className="no-print mt-2 flex gap-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add.run();
          }}
        >
          <label htmlFor={id} className="sr-only">
            Add a note
          </label>
          <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the logbook" maxLength={600} />
          <Button type="submit" busy={add.pending}>
            Add note
          </Button>
        </form>
      )}
      <InlineError error={add.error} />
    </article>
  );
}
