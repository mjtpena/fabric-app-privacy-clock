/**
 * Escapement: every breach with its 72-hour bar, open ones first. Opening one leads to its assessment.
 */
import { Link } from 'react-router-dom';
import { ChevronRight, Siren } from 'lucide-react';

import { formatDate, toMs, useNow } from '@x10/shared/lib';
import { Badge, DataState, EmptyState, LinkButton, PageHeader, Skeleton } from '@x10/shared/ui';

import { BreachBar } from '../components/BreachBar';
import { ClockBadge, DialMark, usePrivacyData } from '../components/bits';
import { breachClock } from '../domain/clock';
import { decidedAt } from '../domain/data';
import { buildDials, type Dial } from '../domain/tower';
import { MiniDial } from '../tower/Dial';
import { BREACH_STATUS_LABEL, DECISION_LABEL } from '../labels';
import type { BreachCase } from '../model';

export function EscapementPage() {
  const state = usePrivacyData();
  const now = useNow(30_000);
  return (
    <>
      <PageHeader
        title="Escapement"
        meta={state.data ? <span className="num">{state.data.breaches.filter((b) => b.status !== 'closed').length} open · {state.data.breaches.length} on record (Art. 33(5))</span> : undefined}
        actions={
          <LinkButton to="/intake?mode=breach" variant="primary" icon={<Siren />}>
            Report a breach
          </LinkButton>
        }
      />
      <DataState
        state={state}
        skeleton={<Skeleton height={320} />}
        isEmpty={(d) => d.breaches.length === 0}
        empty={
          <EmptyState title="No breaches on record" action={<LinkButton to="/intake?mode=breach">Report a breach</LinkButton>}>
            Every suspected breach is recorded here with its 72-hour clock, even when it is never notified.
          </EmptyState>
        }
      >
        {(data) => {
          const dials = new Map(buildDials(data, now).map((d) => [d.id, d]));
          const list = [...data.breaches].sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || toMs(b.awareAt) - toMs(a.awareAt));
          return (
            <ul className="m-0 list-none divide-y divide-[var(--line)] border-y border-line p-0" data-testid="breach-list">
              {list.map((b) => (
                <BreachRow key={b.id} b={b} dial={dials.get(b.id) ?? null} now={now} decided={decidedAt(data, b.id)} />
              ))}
            </ul>
          );
        }}
      </DataState>
    </>
  );
}

function BreachRow({ b, dial, now, decided }: { b: BreachCase; dial: Dial | null; now: Date; decided: string | null }) {
  const clock = breachClock(b, now);
  return (
    <li className="py-5" data-testid="breach-row" data-ref={b.ref}>
      <div className="grid gap-x-8 gap-y-3 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {dial ? (
            <DialMark d={dial} size={52} />
          ) : (
            <MiniDial size={52} id={`closed-${b.id}`} kind="breach" type="breach" fraction={clock.fraction} state={clock.state} running={false} rim="var(--gray-8)" sweep="var(--gray-8)" tasks={[]} ticks={24} majorEvery={6} label={`${b.ref}, closed`} />
          )}
          <div className="min-w-0">
            <Link to={`/escapement/${b.id}`} className="font-mono text-ui font-semibold text-fg tabular-nums">
              {b.ref}
            </Link>
            <div className="truncate text-sm font-medium">{b.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
              <ClockBadge clock={clock} />
              <Badge tone={b.status === 'open' ? 'brand' : 'neutral'}>{BREACH_STATUS_LABEL[b.status]}</Badge>
              <span>{b.decision === 'pending' ? 'Decision pending' : DECISION_LABEL[b.decision]}</span>
              <span>aware {formatDate(b.awareAt)}</span>
            </div>
          </div>
        </div>
        <BreachBar awareAt={b.awareAt} notifiedAt={b.authorityNotifiedAt} subjectsAt={b.subjectsNotifiedAt} documentedAt={b.decision === 'document_only' ? (decided ?? b.closedAt ?? now.toISOString()) : null} compact live={false} />
        <LinkButton to={`/escapement/${b.id}`} variant="ghost" iconRight={<ChevronRight />} className="justify-self-end">
          Open
        </LinkButton>
      </div>
    </li>
  );
}
