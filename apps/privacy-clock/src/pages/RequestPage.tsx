/**
 * One request: its clock, its tasks on the Gears, and the officer's controls (verify identity, move stage, extend,
 * close, refuse). Every control states its rule where the decision happens and writes a logbook event.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpenText, CalendarPlus, CircleCheck, Ban, ShieldCheck } from 'lucide-react';

import { formatDate, formatDateTime, fromLocalInput, toLocalInput, useAction, useNow } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  cx,
  DataState,
  EmptyState,
  Field,
  InlineError,
  Input,
  LinkButton,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TextArea,
  Toast,
} from '@x10/shared/ui';

import { ClockBadge, clockTextClass, DialMark, Fact, SectionLabel, usePrivacyData } from '../components/bits';
import { RequestBar } from '../components/RequestBar';
import { TaskRow } from '../components/TaskRow';
import { Trail } from '../components/Trail';
import { articles, rules } from '../config';
import { isOfficer } from '../domain/access';
import { requestClock } from '../domain/clock';
import { eventsFor, nameOf, tasksFor, type PrivacyData } from '../domain/data';
import { closeRequest, extendRequest, moveRequest, refuseRequest, verifyIdentity } from '../domain/requests';
import { checkClose, checkExtension, nextStages, openEraseTasks, previewExtension } from '../domain/rules';
import { buildDials } from '../domain/tower';
import { CHANNEL_LABEL, STATUS_LABEL, TYPE_ARTICLE, TYPE_LABEL } from '../labels';
import { limits, type PrivacyRequest, type Schema } from '../model';

export function RequestPage() {
  const { id = '' } = useParams();
  const state = usePrivacyData();
  return (
    <DataState
      state={state}
      skeleton={
        <div className="space-y-4">
          <Skeleton width={320} height={36} />
          <Skeleton height={80} />
          <Skeleton height={220} />
        </div>
      }
    >
      {(data) => {
        const r = data.requests.find((x) => x.id === id);
        if (!r)
          return (
            <EmptyState title="No such request" action={<LinkButton to="/">Back to the tower</LinkButton>}>
              It may have been mistyped. Requests are never deleted.
            </EmptyState>
          );
        return <RequestView data={data} r={r} reload={state.reload} />;
      }}
    </DataState>
  );
}

function RequestView({ data, r, reload }: { data: PrivacyData; r: PrivacyRequest; reload: () => Promise<void> }) {
  const { me } = useApp<Schema>();
  const now = useNow(30_000);
  const clock = requestClock(r, now);
  const dial = buildDials({ ...data, requests: [r], breaches: [] }, now)[0];
  const tasks = tasksFor(data, 'request', r.id);
  const events = eventsFor(data, 'request', r.id);
  const mine = isOfficer(me) && r.ownerSub === me.sub;
  const open = r.status !== 'closed' && r.status !== 'refused';
  const [toast, setToast] = useState<string | null>(null);
  const done = async (msg: string) => {
    await reload();
    setToast(msg);
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/" state={{ focus: r.id }} className="inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Tower
          </Link>
        }
        title={
          <span className="flex items-center gap-4">
            {dial ? <DialMark d={dial} size={72} /> : null}
            <span className="min-w-0">
              <span className="block font-mono text-ui font-medium text-muted num">
                {r.ref} · {TYPE_LABEL[r.type]} request · {TYPE_ARTICLE[r.type]}
              </span>
              <span className="block">{r.subjectLabel}</span>
            </span>
          </span>
        }
        meta={
          <>
            <ClockBadge clock={clock} />
            <span className={cx('font-medium', clockTextClass(clock.state))} data-testid="request-words">
              {dial?.words ?? (clock.state === 'met' ? 'Closed in time' : 'Closed late')}
            </span>
            <Badge tone={open ? 'brand' : 'neutral'}>{STATUS_LABEL[r.status]}</Badge>
            <span>{CHANNEL_LABEL[r.channel]}</span>
            {!data.people.some((p) => p.sub === r.ownerSub && p.isAdmin) && (
              <Badge tone="bad" title="The row names an owner who is not a privacy officer; it was written outside the app.">
                Owner is not a privacy officer
              </Badge>
            )}
          </>
        }
        actions={
          <LinkButton to={`/logbook?item=request:${r.id}`} icon={<BookOpenText />}>
            Logbook
          </LinkButton>
        }
      />

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <section className="mb-8">
            <SectionLabel right={<span>{articles.request}</span>}>The clock</SectionLabel>
            <RequestBar r={r} clock={clock} />
            <dl className="m-0 mt-2 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Fact label="Received">{formatDateTime(r.receivedAt)}</Fact>
              <Fact label="Identity verified">{r.identityVerifiedAt ? formatDateTime(r.identityVerifiedAt) : 'Not yet'}</Fact>
              <Fact label={r.extendedDueAt ? 'Extended due' : 'Due'}>
                <span className="font-medium" data-testid="request-due">{formatDate(r.extendedDueAt ?? r.dueAt)}</span>
                {r.extendedDueAt && <span className="block text-xs text-muted">first due {formatDate(r.dueAt)}</span>}
              </Fact>
              <Fact label="Officer">{nameOf(data, r.ownerSub)}</Fact>
            </dl>
            {r.extendedDueAt && (
              <p className="m-0 mt-4 rounded-lg bg-surface-sunken px-3.5 py-3 text-ui">
                <strong className="font-medium">Extended.</strong> {r.extensionReason} Person told {formatDateTime(r.extensionNotifiedAt)}.
              </p>
            )}
            {r.outcome && (
              <p className="m-0 mt-4 rounded-lg bg-surface-sunken px-3.5 py-3 text-ui">
                <strong className="font-medium">{r.status === 'refused' ? 'Refused.' : 'Outcome.'}</strong> {r.outcome}
              </p>
            )}
          </section>

          <section className="mb-8">
            <SectionLabel right={<span className="num">{tasks.filter((t) => t.status === 'done').length} of {tasks.length} done</span>}>Tasks on the Gears</SectionLabel>
            {tasks.length === 0 ? (
              <p className="m-0 rounded-lg border border-dashed border-line px-4 py-5 text-ui text-muted">No systems assigned. Add tasks from the Gears board.</p>
            ) : (
              <ul className="m-0 list-none divide-y divide-[var(--line)] rounded-xl border border-line bg-surface p-0">
                {tasks.map((t) => (
                  <TaskRow key={t.id} t={t} data={data} parentRef={r.ref} onChanged={(m) => void done(m)} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionLabel right={<Link to={`/logbook?item=request:${r.id}`}>Full logbook</Link>}>Latest in the logbook</SectionLabel>
            <Trail events={events} data={data} limit={6} />
          </section>
        </div>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
          {!mine ? (
            <p className="m-0 rounded-xl border border-line bg-surface px-4 py-4 text-ui text-muted">
              {isOfficer(me) ? `${nameOf(data, r.ownerSub)} handles this request.` : `${nameOf(data, r.ownerSub)}, the privacy officer, handles this request. Your tasks are on the Gears board.`}
            </p>
          ) : !open ? (
            <p className="m-0 rounded-xl border border-line bg-surface px-4 py-4 text-ui text-muted">This request is {STATUS_LABEL[r.status].toLowerCase()}. Its clock has stopped.</p>
          ) : (
            <OfficerPanel r={r} data={data} onDone={(m) => void done(m)} />
          )}
        </aside>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </>
  );
}

/* ------------------------------------------------------------------ officer controls */

function OfficerPanel({ r, data, onDone }: { r: PrivacyRequest; data: PrivacyData; onDone: (msg: string) => void }) {
  const { store, me } = useApp<Schema>();
  const next = nextStages(r.status);
  const move = useAction(async (to: PrivacyRequest['status']) => {
    await moveRequest(store, me, r.id, to);
    onDone(`${r.ref} is now ${STATUS_LABEL[to].toLowerCase()}.`);
  });
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-surface p-4">
        <SectionLabel>Stage</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{STATUS_LABEL[r.status]}</Badge>
          {next.map((s) => (
            <Button key={s} size="sm" onClick={() => void move.run(s)} busy={move.pending}>
              Move to {STATUS_LABEL[s].toLowerCase()}
            </Button>
          ))}
        </div>
        <InlineError error={move.error} />
        {!r.identityVerifiedAt && <VerifyForm r={r} onDone={onDone} />}
      </section>
      <ExtendForm r={r} onDone={onDone} />
      <CloseForm r={r} data={data} onDone={onDone} />
    </div>
  );
}

function VerifyForm({ r, onDone }: { r: PrivacyRequest; onDone: (msg: string) => void }) {
  const { store, me } = useApp<Schema>();
  const id = useId();
  const [at, setAt] = useState(() => toLocalInput(new Date().toISOString()));
  const run = useAction(async () => {
    await verifyIdentity(store, me, r.id, fromLocalInput(at) ?? '');
    onDone('Identity verified. The clock still runs from receipt.');
  });
  return (
    <div className="mt-4 border-t border-line pt-4">
      <Field label="Identity verified at" htmlFor={id} hint="The clock keeps running from receipt; verification does not pause it.">
        <Input id={id} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </Field>
      <Button size="sm" icon={<ShieldCheck />} onClick={() => void run.run()} busy={run.pending}>
        Record verification
      </Button>
      <InlineError error={run.error} />
    </div>
  );
}

function ExtendForm({ r, onDone }: { r: PrivacyRequest; onDone: (msg: string) => void }) {
  const { store, me } = useApp<Schema>();
  const id = useId();
  const now = useNow(30_000);
  const [months, setMonths] = useState<'1' | '2'>('2');
  const [reason, setReason] = useState('');
  const [told, setTold] = useState(() => toLocalInput(new Date().toISOString()));
  const input = { months: Number(months), reason, notifiedAt: fromLocalInput(told), now };
  const blocked = r.extendedDueAt ? null : checkExtension(r, { ...input, reason: 'x'.repeat(rules.extensionReasonMin), notifiedAt: input.notifiedAt ?? new Date(now).toISOString() });
  const problem = checkExtension(r, input);
  const preview = useMemo(() => previewExtension(r, Number(months)), [r, months]);
  const run = useAction(async () => {
    await extendRequest(store, me, r.id, { months: Number(months), reason, notifiedAt: fromLocalInput(told) });
    setReason('');
    onDone(`${r.ref} extended to ${formatDate(preview)}.`);
  });
  if (r.extendedDueAt) return null;
  const pastDue = !!blocked && /has passed/.test(blocked);
  return (
    <section className="rounded-xl border border-line bg-surface p-4" data-testid="extend-panel">
      <SectionLabel right={<span>{articles.request}</span>}>Extend</SectionLabel>
      {pastDue ? (
        <p className="m-0 text-ui font-medium text-bad-text" role="alert" data-testid="extend-blocked">
          {blocked}
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <SegmentedControl<'1' | '2'>
              label="Extend by"
              size="sm"
              value={months}
              onChange={setMonths}
              options={[
                { value: '1', label: '+1 month' },
                { value: '2', label: '+2 months' },
              ]}
            />
            <div className="text-right">
              <div className="x-legend-label text-[10px] text-muted">New due date</div>
              <div className="text-sm font-semibold" data-testid="extend-preview">
                {formatDate(preview)}
              </div>
            </div>
          </div>
          <Field label="Why it is complex or numerous" htmlFor={`${id}-reason`} counter={{ value: reason.length, max: limits.extensionReason.max }} required>
            <TextArea id={`${id}-reason`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={limits.extensionReason.max} data-testid="extend-reason" />
          </Field>
          <Field label="Person told at" htmlFor={`${id}-told`} hint={`Must be on or before ${formatDate(r.dueAt)}, the original due date.`}>
            <Input id={`${id}-told`} type="datetime-local" value={told} onChange={(e) => setTold(e.target.value)} data-testid="extend-told" />
          </Field>
          <Button icon={<CalendarPlus />} onClick={() => void run.run()} busy={run.pending} data-testid="extend-submit">
            Extend to {formatDate(preview)}
          </Button>
          {problem && reason.trim().length >= rules.extensionReasonMin && !run.error && <p className="m-0 mt-2 text-ui text-warn-text">{problem}</p>}
          <InlineError error={run.error} />
        </>
      )}
    </section>
  );
}

function CloseForm({ r, data, onDone }: { r: PrivacyRequest; data: PrivacyData; onDone: (msg: string) => void }) {
  const { store, me } = useApp<Schema>();
  const id = useId();
  const [outcome, setOutcome] = useState('');
  const tasks = tasksFor(data, 'request', r.id);
  const eraseOpen = r.type === 'erasure' ? openEraseTasks(tasks) : [];
  const close = useAction(async () => {
    await closeRequest(store, me, r.id, outcome);
    onDone(`${r.ref} closed.`);
  });
  const refuse = useAction(async () => {
    await refuseRequest(store, me, r.id, outcome);
    onDone(`${r.ref} refused.`);
  });
  const blockedMsg = eraseOpen.length ? checkClose(r, tasks, 'x'.repeat(rules.outcomeMin)) : null;
  return (
    <section className="rounded-xl border border-line bg-surface p-4" data-testid="close-panel">
      <SectionLabel>Close</SectionLabel>
      {blockedMsg && (
        <div className="mb-4 rounded-lg bg-bad-soft px-3 py-2.5 text-ui text-bad-text" role="status" data-testid="close-blocked">
          <p className="m-0 font-medium">{blockedMsg}</p>
          <ul className="m-0 mt-1 list-none p-0">
            {eraseOpen.map((t) => (
              <li key={t.id}>
                {data.systems.find((s) => s.id === t.systemId)?.name ?? 'A system'} · {nameOf(data, t.assigneeSub)} · {t.status}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Field label="Outcome sent to the person" htmlFor={`${id}-outcome`} counter={{ value: outcome.length, max: limits.outcome.max }}>
        <TextArea id={`${id}-outcome`} rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={limits.outcome.max} data-testid="close-outcome" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<CircleCheck />} onClick={() => void close.run()} busy={close.pending} data-testid="close-submit">
          Close request
        </Button>
        <Button variant="ghost" icon={<Ban />} onClick={() => void refuse.run()} busy={refuse.pending}>
          Refuse
        </Button>
      </div>
      <InlineError error={close.error ?? refuse.error} />
    </section>
  );
}
