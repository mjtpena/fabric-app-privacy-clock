/**
 * A request's month on one line: receipt at the left, the due date (and the extended one) at the right, a needle
 * for now, pins for identity verified and closed. Weeks are marked so "one calendar month" can be read at a glance.
 */
import { DAY, formatDate, toMs } from '@x10/shared/lib';
import { cx } from '@x10/shared/ui';

import type { Clock } from '../domain/clock';
import type { PrivacyRequest } from '../model';

export function RequestBar({ r, clock, className }: { r: PrivacyRequest; clock: Clock; className?: string }) {
  const start = toMs(r.receivedAt);
  const deadline = toMs(clock.deadline);
  const stop = clock.stoppedAt ? toMs(clock.stoppedAt) : start + clock.elapsedMs;
  const span = Math.max(deadline - start, stop - start + DAY);
  const pct = (ms: number) => `${Math.max(0, Math.min(100, ((ms - start) / span) * 100))}%`;
  const over = stop > deadline;
  const fill =
    clock.state === 'overdue' || clock.state === 'late'
      ? 'var(--bad-solid)'
      : clock.state === 'critical'
        ? 'var(--orange-9)'
        : clock.state === 'due_soon'
          ? 'var(--warn-solid)'
          : clock.state === 'met'
            ? 'var(--info-solid)'
            : 'var(--ok-solid)';
  const weeks = Math.floor(span / (7 * DAY));
  return (
    <div className={cx('relative pt-6 pb-9', className)} data-testid="request-bar" role="img" aria-label={`${Math.floor(clock.elapsedMs / DAY)} days used of ${Math.round(clock.totalMs / DAY)}`}>
      <div className="relative h-3 overflow-hidden rounded-full bg-gray-3">
        <div className="pc-bar-fill absolute inset-y-0 left-0 rounded-full" style={{ width: pct(Math.min(stop, deadline)), background: fill }} />
        {over && (
          <div
            className="absolute inset-y-0"
            style={{ left: pct(deadline), width: `calc(${pct(stop)} - ${pct(deadline)})`, background: 'repeating-linear-gradient(135deg, var(--bad-solid) 0 6px, color-mix(in oklab, var(--bad-solid) 55%, transparent) 6px 12px)' }}
          />
        )}
      </div>
      {Array.from({ length: weeks }, (_, i) => (
        <span key={i} aria-hidden="true" className="absolute top-6 h-3 border-l border-[color-mix(in_oklab,var(--gray-12)_14%,transparent)]" style={{ left: pct(start + (i + 1) * 7 * DAY) }} />
      ))}
      <Pin at={pct(start)} label="Received" sub={formatDate(r.receivedAt)} align="start" />
      {r.extendedDueAt && <Pin at={pct(toMs(r.dueAt))} label="First due" sub={formatDate(r.dueAt)} dashed />}
      <Pin at={pct(deadline)} label={r.extendedDueAt ? 'Extended due' : 'Due'} sub={formatDate(clock.deadline)} strong align={over ? 'center' : 'end'} />
      {r.identityVerifiedAt && (
        <span className="absolute top-[18px] -translate-x-1/2" style={{ left: pct(toMs(r.identityVerifiedAt)) }} title={`Identity verified ${formatDate(r.identityVerifiedAt)}`}>
          <span className="block size-2.5 rounded-full border-2 border-[var(--surface)] bg-info-solid" />
        </span>
      )}
      {clock.running ? (
        <span className="absolute top-4 h-7 w-0.5 -translate-x-1/2 rounded-full bg-accent-9" style={{ left: pct(stop) }}>
          <span className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-accent-9" />
        </span>
      ) : (
        <span className="absolute top-[17px] -translate-x-1/2" style={{ left: pct(stop) }} title={`Closed ${formatDate(clock.stoppedAt)}`}>
          <span className="block size-3.5 rotate-45 rounded-[3px] border-2 border-[var(--surface)] bg-[var(--gray-12)]" />
        </span>
      )}
    </div>
  );
}

function Pin({ at, label, sub, strong, dashed, align = 'center' }: { at: string; label: string; sub: string; strong?: boolean; dashed?: boolean; align?: 'start' | 'center' | 'end' }) {
  return (
    <span className="absolute top-0 bottom-0" style={{ left: at }}>
      <span aria-hidden="true" className={cx('absolute top-4 h-7 border-l', strong ? 'border-l-2 border-[var(--gray-12)]' : 'border-[var(--gray-8)]', dashed && 'border-dashed')} />
      <span
        className={cx(
          'absolute bottom-0 whitespace-nowrap text-[11px] leading-4',
          align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : '-translate-x-1/2',
          strong ? 'font-semibold text-fg' : 'text-muted',
        )}
      >
        {label} <span className="font-mono num">{sub}</span>
      </span>
    </span>
  );
}
