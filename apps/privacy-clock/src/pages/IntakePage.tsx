/**
 * Intake: log a privacy request (officers) or report a breach (anyone). The legal deadline is computed live as you
 * type the received or awareness time, before anything is saved.
 */
import { useId, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarClock, Siren } from 'lucide-react';

import { RuleError } from '@x10/shared/data';
import { formatDateTime, HOUR, toMs, useAction, useNow } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Button, Callout, Checkbox, cx, DataState, Field, InlineError, Input, LinkButton, PageHeader, SegmentedControl, Select } from '@x10/shared/ui';

import { BreachBar } from '../components/BreachBar';
import { SectionLabel, usePrivacyData } from '../components/bits';
import { articles } from '../config';
import { isOfficer } from '../domain/access';
import { reportBreach, validateReport } from '../domain/breaches';
import { breachDeadline, daysInMonth, dueWasClamped, localYMD, requestDueAt, type YMD } from '../domain/clock';
import { nextRef, officers } from '../domain/data';
import { ACTION_FOR, createRequest, validateRequest } from '../domain/requests';
import { ACTION_LABEL, BREACH_CATEGORIES, CHANNEL_LABEL, TYPE_ARTICLE, TYPE_LABEL } from '../labels';
import { CHANNELS, limits, REQUEST_TYPES, type BreachCase, type Channel, type RequestType, type Schema } from '../model';
import { MiniDial, TYPE_GLYPH } from '../tower/Dial';

type Mode = 'request' | 'breach';

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function combine(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '09:00'}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const longDate = (iso: string) => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const ymdKey = (y: YMD) => `${y.y}-${pad(y.m + 1)}-${pad(y.d)}`;

export function IntakePage() {
  const { me } = useApp<Schema>();
  const officer = isOfficer(me);
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(officer && params.get('mode') !== 'breach' ? 'request' : 'breach');
  const data = usePrivacyData(false);

  return (
    <>
      <PageHeader
        title="Intake"
        actions={
          <SegmentedControl<Mode>
            label="What to log"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'request', label: 'Privacy request', disabled: !officer },
              { value: 'breach', label: 'Breach report' },
            ]}
          />
        }
      />
      {!officer && mode === 'breach' && (
        <p className="-mt-3 mb-6 text-ui text-muted">Privacy officers log requests. Anyone can report a suspected breach, and should do it straight away.</p>
      )}
      <DataState state={data} loadingRows={6}>
        {(d) => (mode === 'request' ? <RequestForm systems={d.systems} refs={d.requests.map((r) => r.ref)} /> : <BreachForm refs={d.breaches.map((b) => b.ref)} officerName={officers(d.people)[0]?.displayName ?? null} />)}
      </DataState>
    </>
  );
}

/* ------------------------------------------------------------------ request */

function RequestForm({ systems, refs }: { systems: Schema['DataSystem'][]; refs: string[] }) {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const id = useId();
  const now = useNow(60_000);
  const [type, setType] = useState<RequestType>('access');
  const [subject, setSubject] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [date, setDate] = useState(() => dateValue(new Date()));
  const [time, setTime] = useState(() => timeValue(new Date()));
  const [picked, setPicked] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  const receivedAt = combine(date, time);
  const errors = validateRequest({ type, subjectLabel: subject, channel, receivedAt, systemIds: picked }, now);
  const due = receivedAt ? requestDueAt(receivedAt) : null;
  const ref = nextRef('DSR', refs);

  const save = useAction(async () => {
    setTouched(true);
    if (Object.keys(errors).length) throw new RuleError(Object.values(errors)[0]!);
    const r = await createRequest(store, me, { type, subjectLabel: subject, channel, receivedAt, systemIds: picked }, new Date());
    navigate(`/requests/${r.id}`, { state: { created: true } });
  });

  return (
    <form
      className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_380px]"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
      noValidate
    >
      <div className="min-w-0 max-w-[620px]">
        <fieldset className="m-0 mb-5 border-0 p-0">
          <legend className="mb-2 text-ui font-medium text-fg">Type</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Request type">
            {REQUEST_TYPES.map((t) => {
              const Glyph = TYPE_GLYPH[t];
              const on = t === type;
              return (
                <label
                  key={t}
                  className={cx(
                    'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-[120ms]',
                    on ? 'border-accent-8 bg-accent-3 text-fg' : 'border-line bg-surface hover:bg-surface-2',
                  )}
                >
                  <input type="radio" name={`${id}-type`} value={t} checked={on} onChange={() => setType(t)} className="sr-only" />
                  <Glyph className={cx('size-4 shrink-0', on ? 'text-accent-11' : 'text-muted')} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-ui font-medium leading-4">{TYPE_LABEL[t]}</span>
                    <span className="block font-mono text-[10.5px] text-muted">{TYPE_ARTICLE[t]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Field
          label="Subject label"
          htmlFor={`${id}-subject`}
          hint="A pseudonymous label, such as a customer number. Not a full identity."
          error={touched ? errors.subjectLabel : null}
          required
          counter={{ value: subject.length, max: limits.subjectLabel.max }}
        >
          <Input id={`${id}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} invalid={touched && !!errors.subjectLabel} maxLength={limits.subjectLabel.max} placeholder="Customer C-12345" />
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-[1fr_1fr_1fr]">
          <Field label="Channel" htmlFor={`${id}-channel`}>
            <Select id={`${id}-channel`} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Received on" htmlFor={`${id}-date`} error={errors.receivedAt ?? null}>
            <Input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} invalid={!!errors.receivedAt} data-testid="received-date" />
          </Field>
          <Field label="at" htmlFor={`${id}-time`}>
            <Input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {due && (
          <p className="-mt-1 mb-5 rounded-lg bg-accent-3 px-3 py-2.5 text-ui lg:hidden" aria-hidden="true">
            Due <strong className="font-semibold">{longDate(due)}</strong>
            {receivedAt && dueWasClamped(receivedAt) && <span className="block text-xs text-muted">The month has no such day, so it is the last day of the month.</span>}
          </p>
        )}

        <fieldset className="m-0 mb-2 border-0 p-0">
          <legend className="mb-1 text-ui font-medium text-fg">Systems to {ACTION_LABEL[ACTION_FOR[type]].toLowerCase()}</legend>
          <p className="m-0 mb-3 text-ui text-muted">Each system&apos;s owner gets a task, due a week before the response.</p>
          {systems.length === 0 ? (
            <p className="m-0 text-ui text-muted">No systems yet: add them on the Gears board.</p>
          ) : (
            <ul className="m-0 grid list-none gap-x-6 gap-y-2.5 p-0 sm:grid-cols-2">
              {systems.map((s) => (
                <li key={s.id}>
                  <Checkbox
                    label={s.name}
                    description={s.ownerName}
                    checked={picked.includes(s.id)}
                    onChange={(v) => setPicked((p) => (v ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                  />
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>

      <aside className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
        <DuePreview receivedAt={receivedAt} due={due} type={type} refLabel={ref} />
        <InlineError error={save.error} />
        <div className="sticky bottom-[calc(var(--x-bottom-inset)+8px)] mt-4 flex gap-2 bg-bg py-2 lg:static lg:bg-transparent lg:py-0">
          <Button type="submit" variant="primary" size="lg" busy={save.pending} className="flex-1" iconRight={<ArrowRight />}>
            Log {ref}
          </Button>
        </div>
      </aside>
    </form>
  );
}

/** The due date, live: the big date, the rule, and the two months side by side. */
function DuePreview({ receivedAt, due, type, refLabel }: { receivedAt: string | null; due: string | null; type: RequestType; refLabel: string }) {
  const r = receivedAt ? localYMD(receivedAt) : null;
  const d = due ? localYMD(due) : null;
  const clamped = receivedAt ? dueWasClamped(receivedAt) : false;
  const now = useNow(60_000);
  const frac = receivedAt && due ? (now.getTime() - toMs(receivedAt)) / (toMs(due) - toMs(receivedAt)) : 0;
  const over = frac > 1;
  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-live="polite" data-testid="due-preview" data-due={d ? ymdKey(d) : ''}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>{refLabel} is due</SectionLabel>
          <div className="text-2xl font-semibold leading-tight tracking-[-0.02em]" data-testid="due-date">
            {due ? longDate(due) : 'Enter the received date'}
          </div>
          <p className="m-0 mt-1.5 text-ui text-muted">
            One calendar month after receipt ({articles.request}).
            {clamped && r && d && (
              <span className="mt-1 block font-medium text-warn-text" data-testid="due-clamped">
                {r.d} {new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(d.y, d.m, 1))} does not exist, so it is the last day of the month.
              </span>
            )}
          </p>
        </div>
        <MiniDial
          size={64}
          id="intake-preview"
          kind="request"
          type={type}
          fraction={Math.max(0, frac)}
          state={over ? 'overdue' : frac >= 0.85 ? 'critical' : frac >= 0.5 ? 'due_soon' : 'on_track'}
          running
          rim="var(--accent-9)"
          sweep={over ? 'var(--bad-solid)' : 'var(--accent-9)'}
          tasks={[]}
          ticks={30}
          majorEvery={7}
        />
      </div>
      {r && d && (
        <div className="mt-5 grid grid-cols-2 gap-4">
          <MonthGrid ym={r} mark={r} markKind="received" />
          <MonthGrid ym={d} mark={d} markKind="due" />
        </div>
      )}
      {over && <p className="m-0 mt-4 text-ui font-medium text-bad-text">This due date has already passed. Log it anyway: the tower will show it overdue.</p>}
    </section>
  );
}

function MonthGrid({ ym, mark, markKind }: { ym: YMD; mark: YMD; markKind: 'received' | 'due' }) {
  const first = new Date(ym.y, ym.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const n = daysInMonth(ym.y, ym.m);
  const label = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(first);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-ui font-medium">{label}</span>
        <span className="x-legend-label text-[10px] text-muted">{markKind === 'received' ? 'Received' : 'Due'}</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-[10.5px] num" aria-hidden="true">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const day = i + 1;
          const on = day === mark.d;
          return (
            <span
              key={day}
              className={cx(
                'grid aspect-square place-items-center rounded-[5px]',
                on && markKind === 'due' && 'bg-accent-9 font-semibold text-accent-contrast',
                on && markKind === 'received' && 'font-semibold text-fg ring-1.5 ring-inset ring-[var(--gray-11)]',
                !on && 'text-muted',
              )}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ breach */

function BreachForm({ refs, officerName }: { refs: string[]; officerName: string | null }) {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const id = useId();
  const now = useNow(30_000);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => dateValue(new Date()));
  const [time, setTime] = useState(() => timeValue(new Date()));
  const [cats, setCats] = useState<string[]>([]);
  const [subjects, setSubjects] = useState('');
  const [records, setRecords] = useState('');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<BreachCase | null>(null);

  const awareAt = combine(date, time);
  const num = (v: string) => (v.trim() === '' ? 0 : Number(v));
  const input = { title, awareAt, categories: cats, approxSubjects: num(subjects), approxRecords: num(records) };
  const errors = validateReport(input, now);
  const ref = nextRef('BR', refs);
  const deadline = awareAt ? breachDeadline(awareAt) : null;
  const leftH = deadline ? (toMs(deadline) - now.getTime()) / HOUR : null;

  const save = useAction(async () => {
    setTouched(true);
    if (Object.keys(errors).length) throw new RuleError(Object.values(errors)[0]!);
    const b = await reportBreach(store, me, input, new Date());
    if (isOfficer(me)) navigate(`/escapement/${b.id}`);
    else setDone(b);
  });

  const chips = useMemo(() => [...new Set([...BREACH_CATEGORIES, ...cats])], [cats]);

  if (done) {
    return (
      <div className="max-w-[620px]" data-testid="breach-reported">
        <Callout tone="ok" title={`${done.ref} is reported`} icon={<Siren />}>
          {officerName ?? 'The privacy officer'} handles it from here. The 72-hour clock ends {formatDateTime(breachDeadline(done.awareAt))}.
        </Callout>
        <div className="mt-4 flex gap-2">
          <LinkButton to={`/escapement/${done.id}`} variant="primary">
            Follow it in Escapement
          </LinkButton>
          <Button onClick={() => window.location.reload()}>Report another</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_420px]"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
      noValidate
    >
      <div className="min-w-0 max-w-[620px]">
        <Field label="What happened" htmlFor={`${id}-title`} error={touched ? errors.title : null} required counter={{ value: title.length, max: limits.breachTitle.max }}>
          <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={limits.breachTitle.max} placeholder="Export emailed to the wrong customer" invalid={touched && !!errors.title} />
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Became aware on" htmlFor={`${id}-date`} error={errors.awareAt ?? null} hint="When you were reasonably sure it happened.">
            <Input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} invalid={!!errors.awareAt} />
          </Field>
          <Field label="at" htmlFor={`${id}-time`}>
            <Input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <fieldset className="m-0 mb-4 border-0 p-0">
          <legend className="mb-2 text-ui font-medium">Data involved</legend>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => {
              const on = cats.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCats((x) => (on ? x.filter((y) => y !== c) : [...x, c]))}
                  className={cx(
                    'h-9 cursor-pointer rounded-full border px-3 text-ui transition-colors duration-[120ms] sm:h-8',
                    on ? 'border-accent-8 bg-accent-3 font-medium text-accent-11' : 'border-line bg-surface text-muted hover:text-fg',
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {errors.categories && <p className="m-0 mt-1.5 text-ui text-bad">{errors.categories}</p>}
        </fieldset>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="About how many people" htmlFor={`${id}-subjects`} error={touched ? errors.approxSubjects : null} hint="0 if not known yet">
            <Input id={`${id}-subjects`} inputMode="numeric" value={subjects} onChange={(e) => setSubjects(e.target.value.replace(/[^\d]/g, ''))} className="text-right font-mono" />
          </Field>
          <Field label="About how many records" htmlFor={`${id}-records`} error={touched ? errors.approxRecords : null} hint="0 if not known yet">
            <Input id={`${id}-records`} inputMode="numeric" value={records} onChange={(e) => setRecords(e.target.value.replace(/[^\d]/g, ''))} className="text-right font-mono" />
          </Field>
        </div>
      </div>
      <aside className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
        <section className="rounded-xl border border-line bg-surface p-5" aria-live="polite" data-testid="breach-preview">
          <SectionLabel right={<span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden="true" />{articles.breach}</span>}>{ref} · notify by</SectionLabel>
          <div className="text-2xl font-semibold leading-tight tracking-[-0.02em]">{deadline ? formatDateTime(deadline) : 'Enter when you became aware'}</div>
          {leftH !== null && (
            <p className={cx('m-0 mt-1.5 text-ui', leftH < 0 ? 'font-medium text-bad-text' : 'text-muted')}>
              {leftH < 0 ? `The 72 hours ran out ${Math.floor(-leftH)} hours ago. Report it now; the officer records the reasons for the delay.` : `72 hours from awareness: ${Math.floor(leftH)} hours from now.`}
            </p>
          )}
          {awareAt && <BreachBar awareAt={awareAt} compact live={false} className="mt-4" />}
          <p className="m-0 mt-2 text-ui text-muted">{officerName ? `${officerName} will handle it.` : 'A privacy officer will handle it.'}</p>
        </section>
        <InlineError error={save.error} />
        <div className="sticky bottom-[calc(var(--x-bottom-inset)+8px)] mt-4 flex bg-bg py-2 lg:static lg:bg-transparent lg:py-0">
          <Button type="submit" variant="primary" size="lg" busy={save.pending} className="flex-1" icon={<Siren />}>
            Report {ref}
          </Button>
        </div>
      </aside>
    </form>
  );
}
