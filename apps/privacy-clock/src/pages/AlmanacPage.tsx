/**
 * The Almanac: how the clocks have run. On-time rate by month, days to close against the one-month line, requests by
 * type, and every breach's time to a decision against 72 hours.
 */
import { DAY, HOUR, toMs, useNow } from '@x10/shared/lib';
import { cx, DataState, PageHeader, Skeleton, Stat, StatStrip } from '@x10/shared/ui';

import { SectionLabel, usePrivacyData } from '../components/bits';
import { law, rules } from '../config';
import { breachSummary, closedRequests, extendedShare, medianDaysToClose, onTimeByMonth, onTimeRate, requestsByType } from '../domain/almanac';
import { breachDeadline, requestDeadline } from '../domain/clock';
import { decidedAt, type PrivacyData } from '../domain/data';
import { TYPE_LABEL } from '../labels';
import { TYPE_COLOR } from '../domain/tower';

const pctFmt = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export function AlmanacPage() {
  const state = usePrivacyData(false);
  const now = useNow(60_000);
  return (
    <>
      <PageHeader title="Almanac" meta={<span>The last {rules.almanacMonths} months</span>} />
      <DataState
        state={state}
        skeleton={
          <div className="space-y-6">
            <Skeleton height={96} />
            <Skeleton height={280} />
          </div>
        }
      >
        {(data) => <Almanac data={data} now={now} />}
      </DataState>
    </>
  );
}

function Almanac({ data, now }: { data: PrivacyData; now: Date }) {
  const months = onTimeByMonth(data.requests, now, rules.almanacMonths);
  const closed = closedRequests(data.requests);
  const rate = onTimeRate(data.requests);
  const med = medianDaysToClose(data.requests);
  const bs = breachSummary(data.breaches);
  const open = data.requests.filter((r) => r.status !== 'closed' && r.status !== 'refused').length;
  const onTimeN = closed.filter((r) => toMs(r.closedAt!) <= toMs(requestDeadline(r))).length;

  return (
    <div className="space-y-12">
      <StatStrip>
        <Stat label="Answered on time" value={pctFmt(rate)} hint={`${onTimeN} of ${closed.length} closed`} tone={rate !== null && rate < 0.9 ? 'warn' : undefined} />
        <Stat label="Median days to close" value={med === null ? '—' : <span className="num">{med.toFixed(1)}</span>} hint="from receipt" />
        <Stat label="Extended" value={pctFmt(extendedShare(data.requests))} hint="of all requests" />
        <Stat label="Breaches notified in 72 h" value={bs.notified ? `${bs.notifiedInTime} of ${bs.notified}` : '—'} hint={`${bs.documentedOnly} documented only`} />
        <Stat label="Open now" value={<span className="num">{open}</span>} hint={`${data.breaches.filter((b) => b.status !== 'closed').length} breaches`} />
      </StatStrip>

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-2">
        <section>
          <SectionLabel right={<span>closed per month</span>}>On time by month</SectionLabel>
          <MonthBars months={months} />
        </section>
        <section>
          <SectionLabel right={<span>each dot is a closed request</span>}>Days to close</SectionLabel>
          <DaysStrip data={data} median={med} />
        </section>
        <section>
          <SectionLabel right={<span>open · closed</span>}>Requests by type</SectionLabel>
          <TypeBars data={data} />
        </section>
        <section>
          <SectionLabel right={<span>hours from awareness to notification or decision</span>}>Breaches against 72 hours</SectionLabel>
          <BreachBars data={data} now={now} />
        </section>
      </div>
    </div>
  );
}

function MonthBars({ months }: { months: ReturnType<typeof onTimeByMonth> }) {
  const max = Math.max(1, ...months.map((m) => m.closed));
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
  return (
    <figure className="m-0">
      <div className="grid h-52 grid-cols-6 items-end gap-3 border-b border-line" aria-hidden="true">
        {months.map((m) => (
          <div key={m.key} className="flex h-full flex-col items-center justify-end gap-1.5">
            <span className={cx('font-mono text-ui font-semibold num', m.rate !== null && m.rate < 1 ? 'text-warn-text' : 'text-fg')}>{m.rate === null ? '' : `${Math.round(m.rate * 100)}%`}</span>
            <div className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(m.closed / max) * 75}%` }}>
              <div style={{ height: `${m.closed ? (m.onTime / m.closed) * 100 : 0}%`, background: 'var(--accent-9)' }} />
              <div style={{ height: `${m.closed ? (m.late / m.closed) * 100 : 0}%`, background: 'repeating-linear-gradient(135deg, var(--bad-solid) 0 5px, color-mix(in oklab, var(--bad-solid) 55%, transparent) 5px 10px)' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-6 gap-3 text-center text-xs text-muted" aria-hidden="true">
        {months.map((m) => (
          <span key={m.key}>
            {fmt.format(new Date(m.start))}
            <span className="block font-mono text-[10.5px] num">{m.closed || '·'}</span>
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-accent-9" />On time</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-bad-solid" />Late</span>
      </figcaption>
      <table className="sr-only">
        <caption>Closed requests per month, on time and late</caption>
        <tbody>
          {months.map((m) => (
            <tr key={m.key}>
              <th scope="row">{m.key}</th>
              <td>{m.onTime} on time</td>
              <td>{m.late} late</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function DaysStrip({ data, median }: { data: PrivacyData; median: number | null }) {
  const closed = closedRequests(data.requests);
  const days = closed.map((r) => ({ r, d: (toMs(r.closedAt!) - toMs(r.receivedAt)) / DAY, late: toMs(r.closedAt!) > toMs(requestDeadline(r)), ext: !!r.extendedDueAt }));
  const max = Math.max(95, ...days.map((x) => x.d + 5));
  const x = (d: number) => `${(d / max) * 100}%`;
  return (
    <figure className="m-0">
      <div className="relative h-44 border-b border-line" aria-hidden="true">
        {[0, 30, 60, 90].filter((d) => d <= max).map((d) => (
          <span key={d} className="absolute bottom-0 top-0 border-l border-dashed border-[var(--line)]" style={{ left: x(d) }}>
            <span className="absolute -bottom-6 -translate-x-1/2 font-mono text-[10.5px] text-muted num">{d}d</span>
          </span>
        ))}
        <span className="absolute bottom-0 top-2 border-l-2 border-[var(--gray-12)]" style={{ left: x(30.4) }}>
          <span className="absolute -top-1 left-1.5 whitespace-nowrap text-[11px] font-semibold">≈ one month</span>
        </span>
        <span className="absolute bottom-0 top-2 border-l-2 border-dashed border-[var(--gray-9)]" style={{ left: x(91.3) }}>
          <span className="absolute -top-1 right-1.5 whitespace-nowrap text-[11px] text-muted">with extension</span>
        </span>
        {median !== null && (
          <span className="absolute bottom-0 h-full border-l-2 border-accent-9" style={{ left: x(median) }}>
            <span className="absolute top-8 left-1.5 whitespace-nowrap text-[11px] font-semibold text-accent-11">median {median.toFixed(1)}d</span>
          </span>
        )}
        {days.map((p, i) => (
          <span
            key={p.r.id}
            title={`${p.r.ref}: ${p.d.toFixed(1)} days${p.late ? ', late' : ''}${p.ext ? ', extended' : ''}`}
            className={cx('absolute size-3.5 -translate-x-1/2 rounded-full border-2 border-[var(--surface)]', p.late ? 'bg-bad-solid' : p.ext ? 'bg-warn-solid' : 'bg-accent-9')}
            style={{ left: x(p.d), bottom: `${16 + (i % 4) * 22}px` }}
          />
        ))}
      </div>
      <figcaption className="mt-9 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent-9" />In time</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-warn-solid" />In time, extended</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-bad-solid" />Late</span>
      </figcaption>
      <ul className="sr-only">
        {days.map((p) => (
          <li key={p.r.id}>
            {p.r.ref}: {p.d.toFixed(1)} days{p.late ? ', late' : ''}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function TypeBars({ data }: { data: PrivacyData }) {
  const rows = requestsByType(data.requests);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {rows.map((r) => (
        <li key={r.type} className="grid grid-cols-[110px_minmax(0,1fr)_56px] items-center gap-3">
          <span className="text-ui">{TYPE_LABEL[r.type]}</span>
          <span className="flex h-3 overflow-hidden rounded-full bg-gray-3" aria-hidden="true">
            <span style={{ width: `${(r.open / max) * 100}%`, background: TYPE_COLOR[r.type] }} />
            <span style={{ width: `${(r.closed / max) * 100}%`, background: `color-mix(in oklab, ${TYPE_COLOR[r.type]} 35%, transparent)` }} />
          </span>
          <span className="text-right font-mono text-ui num">
            {r.open} · {r.closed}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BreachBars({ data, now }: { data: PrivacyData; now: Date }) {
  const rows = [...data.breaches].sort((a, b) => a.ref.localeCompare(b.ref));
  if (!rows.length) return <p className="m-0 text-ui text-muted">No breaches on record.</p>;
  const scale = 96;
  return (
    <ul className="m-0 list-none space-y-4 p-0">
      {rows.map((b) => {
        const decided = b.authorityNotifiedAt ?? (b.decision === 'document_only' ? (decidedAt(data, b.id) ?? b.closedAt) : null);
        const end = decided ? toMs(decided) : now.getTime();
        const hours = (end - toMs(b.awareAt)) / HOUR;
        const within = end <= toMs(breachDeadline(b.awareAt));
        const label = b.authorityNotifiedAt ? 'notified' : b.decision === 'document_only' ? 'documented' : 'running';
        return (
          <li key={b.id} className="grid grid-cols-[72px_minmax(0,1fr)_96px] items-center gap-3">
            <span className="font-mono text-ui font-semibold tabular-nums">{b.ref}</span>
            <span className="relative h-3 rounded-full bg-gray-3" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (hours / scale) * 100)}%`, background: label === 'running' ? 'var(--warn-solid)' : within ? 'var(--info-solid)' : 'var(--bad-solid)' }} />
              <span className="absolute -top-1 -bottom-1 border-l-2 border-[var(--gray-12)]" style={{ left: `${(law.breachHours / scale) * 100}%` }} />
            </span>
            <span className="text-right font-mono text-ui num">
              {Math.round(hours)}h <span className="text-muted">{label}</span>
            </span>
          </li>
        );
      })}
      <li className="text-xs text-muted">The black line is 72 hours.</li>
    </ul>
  );
}
