/**
 * Escapement for one breach: the 72-hour bar, scope, risk and decision, notifications, containment and closing.
 * Each control carries its rule where the decision is made; closing stays blocked until the record is complete.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BellRing, BookOpenText, CircleCheck, Lock, ShieldCheck, Siren } from 'lucide-react';

import { formatDateTime, fromLocalInput, toLocalInput, toMs, useAction, useNow } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Callout,
  cx,
  DataState,
  EmptyState,
  Field,
  InlineError,
  Input,
  LinkButton,
  PageHeader,
  Skeleton,
  TextArea,
  Toast,
} from '@x10/shared/ui';

import { BreachBar } from '../components/BreachBar';
import { ClockBadge, DialMark, Fact, SectionLabel, usePrivacyData } from '../components/bits';
import { TaskRow } from '../components/TaskRow';
import { Trail } from '../components/Trail';
import { articles, rules } from '../config';
import { isOfficer } from '../domain/access';
import {
  categoriesOf,
  closeBreach,
  confirmAwareness,
  containBreach,
  decideBreach,
  notifyAuthority,
  notifySubjects,
  recordDelayReason,
  saveAssessment,
} from '../domain/breaches';
import { breachClock, breachDeadline, breachIsLate } from '../domain/clock';
import { decidedAt, eventsFor, nameOf, tasksFor, type PrivacyData } from '../domain/data';
import { checkCloseBreach, decisionHint } from '../domain/rules';
import { breachStage, buildDials } from '../domain/tower';
import { BREACH_CATEGORIES, BREACH_STATUS_LABEL, DECISION_LABEL, RISK_LABEL } from '../labels';
import { limits, RISK_LEVELS, type BreachCase, type Decision, type RiskLevel, type Schema } from '../model';

export function BreachPage() {
  const { id = '' } = useParams();
  const state = usePrivacyData();
  return (
    <DataState
      state={state}
      skeleton={
        <div className="space-y-4">
          <Skeleton width={360} height={36} />
          <Skeleton height={140} />
          <Skeleton height={260} />
        </div>
      }
    >
      {(data) => {
        const b = data.breaches.find((x) => x.id === id);
        if (!b)
          return (
            <EmptyState title="No such breach" action={<LinkButton to="/escapement">All breaches</LinkButton>}>
              Breaches are never deleted, so the link may be mistyped.
            </EmptyState>
          );
        return <BreachView data={data} b={b} reload={state.reload} />;
      }}
    </DataState>
  );
}

function BreachView({ data, b, reload }: { data: PrivacyData; b: BreachCase; reload: () => Promise<void> }) {
  const { me } = useApp<Schema>();
  const now = useNow(30_000);
  const clock = breachClock(b, now);
  const dial = buildDials({ ...data, requests: [], breaches: [b] }, now)[0];
  const tasks = tasksFor(data, 'breach', b.id);
  const events = eventsFor(data, 'breach', b.id);
  const mine = isOfficer(me) && b.officerSub === me.sub;
  const open = b.status !== 'closed';
  const late = breachIsLate(b, now);
  const [toast, setToast] = useState<string | null>(null);
  const done = async (m: string) => {
    await reload();
    setToast(m);
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/escapement" className="inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Escapement
          </Link>
        }
        title={
          <span className="flex items-center gap-4">
            {dial ? <DialMark d={dial} size={76} /> : null}
            <span className="min-w-0">
              <span className="block font-mono text-ui font-medium text-muted num">{b.ref} · Personal data breach</span>
              <span className="block">{b.title}</span>
            </span>
          </span>
        }
        meta={
          <>
            <ClockBadge clock={clock} />
            <Badge tone={open ? 'brand' : 'neutral'}>{BREACH_STATUS_LABEL[b.status]}</Badge>
            <span>{open ? breachStage(b).label : 'Closed'}</span>
            <span>Reported by {nameOf(data, b.reportedBy)}</span>
            <span>Officer {nameOf(data, b.officerSub)}</span>
            {!data.people.some((p) => p.sub === b.officerSub && p.isAdmin) && (
              <Badge tone="bad" title="The handling officer on this row is not a privacy officer; it was written outside the app.">
                Handler is not a privacy officer
              </Badge>
            )}
          </>
        }
        actions={
          <LinkButton to={`/logbook?item=breach:${b.id}`} icon={<BookOpenText />}>
            Logbook
          </LinkButton>
        }
      />

      <section className="mb-8 rounded-xl border border-line bg-surface p-5 md:p-6">
        <SectionLabel right={<span>{articles.breach}</span>}>The 72-hour clock</SectionLabel>
        <BreachBar
          awareAt={b.awareAt}
          notifiedAt={b.authorityNotifiedAt}
          subjectsAt={b.subjectsNotifiedAt}
          documentedAt={b.decision === 'document_only' ? (decidedAt(data, b.id) ?? b.closedAt ?? now.toISOString()) : null}
        />
        {late && !b.delayReason && (
          <Callout tone="bad" title="Late: reasons for delay required" icon={<Siren />} className="mt-2">
            The 72 hours have passed without notifying the authority. Art. 33(1) asks for the reasons for the delay with the notification.
          </Callout>
        )}
        {b.delayReason && (
          <p className="m-0 mt-2 rounded-lg bg-surface-sunken px-3.5 py-3 text-ui">
            <strong className="font-medium">Reasons for the delay.</strong> {b.delayReason}
          </p>
        )}
      </section>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          {mine && open ? (
            <>
              {late && !b.authorityNotifiedAt && !b.delayReason && <DelayForm b={b} onDone={done} />}
              <ScopeForm b={b} onDone={done} />
              <DecisionForm b={b} onDone={done} />
              <NotifyForm b={b} now={now} onDone={done} />
              <CloseForm b={b} now={now} onDone={done} />
            </>
          ) : (
            <ReadOnly b={b} data={data} mine={mine} />
          )}
        </div>
        <aside className="min-w-0 space-y-8">
          <section>
            <SectionLabel right={<span className="num">{tasks.filter((t) => t.status === 'done').length} of {tasks.length} done</span>}>Tasks</SectionLabel>
            {tasks.length === 0 ? (
              <p className="m-0 rounded-lg border border-dashed border-line px-4 py-4 text-ui text-muted">No containment tasks.</p>
            ) : (
              <ul className="m-0 list-none divide-y divide-[var(--line)] rounded-xl border border-line bg-surface p-0">
                {tasks.map((t) => (
                  <TaskRow key={t.id} t={t} data={data} parentRef={b.ref} onChanged={(m) => void done(m)} />
                ))}
              </ul>
            )}
          </section>
          <section>
            <SectionLabel right={<Link to={`/logbook?item=breach:${b.id}`}>Full logbook</Link>}>Logbook</SectionLabel>
            <Trail events={events} data={data} limit={6} />
          </section>
        </aside>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </>
  );
}

function ReadOnly({ b, data, mine }: { b: BreachCase; data: PrivacyData; mine: boolean }) {
  return (
    <section>
      <SectionLabel>Assessment</SectionLabel>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Fact label="Data involved">{categoriesOf(b).join(', ') || 'Not recorded'}</Fact>
        <Fact label="People">
          <span className="font-mono num">{b.approxSubjects.toLocaleString()}</span>
        </Fact>
        <Fact label="Records">
          <span className="font-mono num">{b.approxRecords.toLocaleString()}</span>
        </Fact>
        <Fact label="Risk">{b.riskLevel ? RISK_LABEL[b.riskLevel] : 'Not assessed'}</Fact>
        <Fact label="Decision">{DECISION_LABEL[b.decision]}</Fact>
        <Fact label="Authority">{b.authorityNotifiedAt ? `${formatDateTime(b.authorityNotifiedAt)}${b.authorityRef ? ` · ${b.authorityRef}` : ''}` : 'Not notified'}</Fact>
      </dl>
      {b.riskRationale && <p className="m-0 mt-4 rounded-lg bg-surface-sunken px-3.5 py-3 text-ui">{b.riskRationale}</p>}
      {!mine && <p className="m-0 mt-4 text-ui text-muted">{nameOf(data, b.officerSub)}, the privacy officer, assesses and decides. Your containment tasks are listed with the logbook.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ officer forms */

function DelayForm({ b, onDone }: { b: BreachCase; onDone: (m: string) => void }) {
  const { store, me } = useApp<Schema>();
  const id = useId();
  const [text, setText] = useState('');
  const run = useAction(async () => {
    await recordDelayReason(store, me, b.id, text);
    onDone('Reasons for the delay recorded.');
  });
  return (
    <section className="rounded-xl border border-[var(--bad-line)] bg-surface p-4" data-testid="delay-form">
      <SectionLabel>Reasons for the delay</SectionLabel>
      <Field label="Why the authority was not notified within 72 hours" htmlFor={id} counter={{ value: text.length, max: limits.delayReason.max }}>
        <TextArea id={id} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={limits.delayReason.max} />
      </Field>
      <Button onClick={() => void run.run()} busy={run.pending}>
        Record reasons
      </Button>
      <InlineError error={run.error} />
    </section>
  );
}

function ScopeForm({ b, onDone }: { b: BreachCase; onDone: (m: string) => void }) {
  const { store, me } = useApp<Schema>();
  const id = useId();
  const [cats, setCats] = useState<string[]>(categoriesOf(b));
  const [subjects, setSubjects] = useState(String(b.approxSubjects));
  const [records, setRecords] = useState(String(b.approxRecords));
  const [aware, setAware] = useState(toLocalInput(b.awareAt));
  const chips = useMemo(() => [...new Set([...BREACH_CATEGORIES, ...cats])], [cats]);
  const save = useAction(async () => {
    await saveAssessment(store, me, b.id, { categories: cats, approxSubjects: Number(subjects || 0), approxRecords: Number(records || 0) });
    onDone('Scope saved.');
  });
  const confirm = useAction(async () => {
    await confirmAwareness(store, me, b.id, fromLocalInput(aware) ?? '');
    onDone('Awareness time moved; the earlier time stays in the logbook.');
  });
  const awareChanged = fromLocalInput(aware) !== null && toMs(fromLocalInput(aware)!) !== toMs(b.awareAt);
  return (
    <section data-testid="scope-form">
      <SectionLabel>Scope</SectionLabel>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const on = cats.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCats((x) => (on ? x.filter((y) => y !== c) : [...x, c]))}
              className={cx('h-9 cursor-pointer rounded-full border px-3 text-ui sm:h-8', on ? 'border-accent-8 bg-accent-3 font-medium text-accent-11' : 'border-line bg-surface text-muted hover:text-fg')}
            >
              {c}
            </button>
          );
        })}
      </div>
      <div className="grid gap-x-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="People affected (about)" htmlFor={`${id}-s`}>
          <Input id={`${id}-s`} inputMode="numeric" value={subjects} onChange={(e) => setSubjects(e.target.value.replace(/[^\d]/g, ''))} className="text-right font-mono" />
        </Field>
        <Field label="Records (about)" htmlFor={`${id}-r`}>
          <Input id={`${id}-r`} inputMode="numeric" value={records} onChange={(e) => setRecords(e.target.value.replace(/[^\d]/g, ''))} className="text-right font-mono" />
        </Field>
        <div className="mb-4">
          <Button onClick={() => void save.run()} busy={save.pending}>
            Save scope
          </Button>
        </div>
      </div>
      <InlineError error={save.error} />
      {!b.authorityNotifiedAt && (
        <div className="grid gap-x-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Confirmed as a breach at" htmlFor={`${id}-aware`} hint="Awareness is when it was confirmed, not first suspected. The clock moves with it; the earlier time stays in the logbook.">
            <Input id={`${id}-aware`} type="datetime-local" value={aware} onChange={(e) => setAware(e.target.value)} />
          </Field>
          <div className="mb-4 sm:mb-[42px]">
            <Button onClick={() => void confirm.run()} busy={confirm.pending} disabled={!awareChanged}>
              Move awareness
            </Button>
          </div>
        </div>
      )}
      <InlineError error={confirm.error} />
    </section>
  );
}

const DECISION_OPTIONS: Exclude<Decision, 'pending'>[] = ['notify_authority', 'notify_both', 'document_only'];

function DecisionForm({ b, onDone }: { b: BreachCase; onDone: (m: string) => void }) {
  const { store, me } = useApp<Schema>();
  const id = useId();
  const [risk, setRisk] = useState<RiskLevel | null>(b.riskLevel);
  const [decision, setDecision] = useState<Decision>(b.decision);
  const [rationale, setRationale] = useState(b.riskRationale ?? '');
  const hint = decisionHint(risk, decision);
  const need = decision === 'document_only' ? rules.rationaleMin : 0;
  const run = useAction(async () => {
    await decideBreach(store, me, b.id, { riskLevel: risk, riskRationale: rationale, decision });
    onDone(`Decision recorded: ${DECISION_LABEL[decision]}.`);
  });
  return (
    <section data-testid="decision-form">
      <SectionLabel right={<span>{articles.breach} · {articles.subjects}</span>}>Risk and decision</SectionLabel>
      <fieldset className="m-0 mb-4 border-0 p-0">
        <legend className="mb-2 text-ui font-medium">Risk to people</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {RISK_LEVELS.map((r) => (
            <Choice key={r} name={`${id}-risk`} checked={risk === r} onChange={() => setRisk(r)} label={RISK_LABEL[r]} tone={r === 'high_risk' ? 'bad' : r === 'risk' ? 'warn' : 'ok'} />
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 mb-4 border-0 p-0">
        <legend className="mb-2 text-ui font-medium">Decision</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {DECISION_OPTIONS.map((d) => (
            <Choice key={d} name={`${id}-dec`} checked={decision === d} onChange={() => setDecision(d)} label={DECISION_LABEL[d]} />
          ))}
        </div>
        {hint && <p className="m-0 mt-2 text-ui text-warn-text">{hint}</p>}
      </fieldset>
      <Field
        label={decision === 'document_only' ? 'Why it is unlikely to result in a risk' : 'Rationale'}
        htmlFor={`${id}-why`}
        hint={need ? `At least ${need} characters for "document only" (${articles.documentation}).` : 'Optional for a notify decision.'}
        counter={{ value: rationale.trim().length, max: limits.riskRationale.max }}
      >
        <TextArea id={`${id}-why`} rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={limits.riskRationale.max} data-testid="rationale" />
      </Field>
      {need > 0 && (
        <div className="-mt-2 mb-4 h-1 overflow-hidden rounded-full bg-gray-3" aria-hidden="true">
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.min(100, (rationale.trim().length / need) * 100)}%`, background: rationale.trim().length >= need ? 'var(--ok-solid)' : 'var(--warn-solid)' }} />
        </div>
      )}
      <Button variant="primary" icon={<ShieldCheck />} onClick={() => void run.run()} busy={run.pending} disabled={decision === 'pending'} data-testid="decide">
        Record decision
      </Button>
      <InlineError error={run.error} />
    </section>
  );
}

function Choice({ name, checked, onChange, label, tone }: { name: string; checked: boolean; onChange: () => void; label: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <label className={cx('flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-ui transition-colors duration-[120ms]', checked ? 'border-accent-8 bg-accent-3 font-medium' : 'border-line bg-surface hover:bg-surface-2')}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {tone && <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: `var(--${tone}-solid)` }} />}
      {label}
    </label>
  );
}

function NotifyForm({ b, now, onDone }: { b: BreachCase; now: Date; onDone: (m: string) => void }) {
  const { store, me } = useApp<Schema>();
  const id = useId();
  const [at, setAt] = useState(() => toLocalInput(new Date().toISOString()));
  const [ref, setRef] = useState('');
  const [delay, setDelay] = useState(b.delayReason ?? '');
  const [subAt, setSubAt] = useState(() => toLocalInput(new Date().toISOString()));
  const atIso = fromLocalInput(at);
  const afterDeadline = !!atIso && toMs(atIso) > toMs(breachDeadline(b.awareAt));
  const auth = useAction(async () => {
    await notifyAuthority(store, me, b.id, { at: atIso, authorityRef: ref, delayReason: delay });
    onDone('Authority notification recorded.');
  });
  const subj = useAction(async () => {
    await notifySubjects(store, me, b.id, fromLocalInput(subAt), now);
    onDone('Telling the people affected recorded.');
  });
  const notifies = b.decision === 'notify_authority' || b.decision === 'notify_both';
  if (b.decision === 'document_only') return null;
  return (
    <section data-testid="notify-form">
      <SectionLabel>Notifications</SectionLabel>
      {!notifies ? (
        <p className="m-0 text-ui text-muted">Record a decision to notify first.</p>
      ) : b.authorityNotifiedAt ? (
        <p className="m-0 text-ui">
          <BellRing className="mr-1.5 inline size-4 align-[-3px] text-info-text" aria-hidden="true" />
          Authority notified {formatDateTime(b.authorityNotifiedAt)}
          {b.authorityRef ? ` · ${b.authorityRef}` : ''}.
        </p>
      ) : (
        <>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Authority notified at" htmlFor={`${id}-at`}>
              <Input id={`${id}-at`} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
            </Field>
            <Field label="Their reference" htmlFor={`${id}-ref`} counter={{ value: ref.length, max: limits.authorityRef.max }}>
              <Input id={`${id}-ref`} value={ref} onChange={(e) => setRef(e.target.value)} maxLength={limits.authorityRef.max} />
            </Field>
          </div>
          {afterDeadline && (
            <Field label="Late: reasons for the delay" htmlFor={`${id}-delay`} hint={`Required after 72 hours (${articles.breach}).`} counter={{ value: delay.length, max: limits.delayReason.max }}>
              <TextArea id={`${id}-delay`} rows={2} value={delay} onChange={(e) => setDelay(e.target.value)} maxLength={limits.delayReason.max} />
            </Field>
          )}
          <Button icon={<BellRing />} onClick={() => void auth.run()} busy={auth.pending}>
            Record authority notification
          </Button>
          <InlineError error={auth.error} />
        </>
      )}
      {b.decision === 'notify_both' && (
        <div className="mt-5 border-t border-line pt-4">
          {b.subjectsNotifiedAt ? (
            <p className="m-0 text-ui">People affected told {formatDateTime(b.subjectsNotifiedAt)} ({articles.subjects}).</p>
          ) : (
            <div className="grid gap-x-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="People affected told at" htmlFor={`${id}-sub`} hint={`High risk: tell them without undue delay (${articles.subjects}).`}>
                <Input id={`${id}-sub`} type="datetime-local" value={subAt} onChange={(e) => setSubAt(e.target.value)} />
              </Field>
              <div className="mb-4 sm:mb-[42px]">
                <Button onClick={() => void subj.run()} busy={subj.pending}>
                  Record
                </Button>
              </div>
            </div>
          )}
          <InlineError error={subj.error} />
        </div>
      )}
    </section>
  );
}

function CloseForm({ b, now, onDone }: { b: BreachCase; now: Date; onDone: (m: string) => void }) {
  const { store, me } = useApp<Schema>();
  const blocked = checkCloseBreach(b, now);
  const contain = useAction(async () => {
    await containBreach(store, me, b.id);
    onDone('Marked contained.');
  });
  const close = useAction(async () => {
    await closeBreach(store, me, b.id);
    onDone(`${b.ref} closed. It stays on record.`);
  });
  return (
    <section className="rounded-xl border border-line bg-surface p-4" data-testid="breach-close">
      <SectionLabel>Contain and close</SectionLabel>
      {blocked && (
        <p className="m-0 mb-3 flex items-start gap-2 text-ui font-medium text-bad-text" data-testid="breach-close-blocked">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {blocked}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {b.status === 'open' && (
          <Button onClick={() => void contain.run()} busy={contain.pending}>
            Mark contained
          </Button>
        )}
        <Button variant="primary" icon={<CircleCheck />} onClick={() => void close.run()} busy={close.pending} disabled={!!blocked} data-testid="breach-close-submit">
          Close breach
        </Button>
      </div>
      <InlineError error={contain.error ?? close.error} />
    </section>
  );
}
