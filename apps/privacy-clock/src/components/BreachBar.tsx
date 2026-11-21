/**
 * The 72-hour bar: awareness at the left, the Art. 33(1) deadline at 72 h, now as a moving needle, and the
 * notification (if any) as a pin. Past 72 h the bar runs on in red so the overrun is visible.
 */
import { formatDateTime, HOUR, toMs, useNow } from '@x10/shared/lib';
import { cx } from '@x10/shared/ui';

import { law } from '../config';
import { breachDeadline, durationWords, hms } from '../domain/clock';

export function BreachBar({
  awareAt,
  notifiedAt,
  subjectsAt,
  documentedAt,
  compact,
  live = true,
  className,
}: {
  awareAt: string;
  notifiedAt?: string | null;
  subjectsAt?: string | null;
  /** "Document only": no notification is owed; the bar stops here and is never late. */
  documentedAt?: string | null;
  compact?: boolean;
  /** Tick every second (the open breach); off for lists. */
  live?: boolean;
  className?: string;
}) {
  const now = useNow(live ? 1000 : 30_000);
  const start = toMs(awareAt);
  const deadline = toMs(breachDeadline(awareAt));
  const total = law.breachHours * HOUR;
  const documented = !notifiedAt && !!documentedAt;
  const stop = notifiedAt ? toMs(notifiedAt) : documented ? Math.min(toMs(documentedAt!), start + total) : now.getTime();
  const elapsed = stop - start;
  const span = documented ? total : Math.max(total, elapsed + 2 * HOUR, (notifiedAt ? stop : now.getTime()) - start + HOUR);
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / span) * 100))}%`;
  const left = deadline - stop;
  const running = !notifiedAt && !documented;
  const late = left < 0 && !documented;
  const share = left / total;
  const tone = documented ? 'info' : !running ? (late ? 'bad' : 'info') : late ? 'bad' : left < 24 * HOUR ? 'bad' : share <= 0.5 ? 'warn' : 'ok';
  const fill = documented ? 'var(--gray-8)' : tone === 'bad' ? 'var(--bad-solid)' : tone === 'warn' ? 'var(--warn-solid)' : tone === 'info' ? 'var(--info-solid)' : 'var(--ok-solid)';
  const marks = [0, 12, 24, 36, 48, 60, 72].filter((h) => h * HOUR <= span);

  return (
    <div className={cx('min-w-0', className)} data-testid="breach-bar" data-left-ms={Math.round(left)} data-running={running ? 'true' : 'false'}>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <div className={cx('font-mono text-4xl font-semibold leading-none tracking-[-0.03em] num md:text-5xl', tone === 'bad' ? 'text-bad-text' : tone === 'warn' ? 'text-warn-text' : tone === 'info' ? 'text-info-text' : 'text-fg')} data-testid="breach-countdown">
              {running ? hms(left) : notifiedAt ? hms(elapsed) : 'Documented'}
            </div>
            <div className="mt-2 text-sm text-muted" data-testid="breach-left-words">
              {documented
                ? 'Decision: document only. No notification is owed; the breach stays on record.'
                : running
                ? late
                  ? `${durationWords(left)} past the 72 hours`
                  : `${durationWords(left)} left to notify the authority`
                : late
                  ? `Notified ${durationWords(left)} after the 72 hours`
                  : `Notified after ${durationWords(elapsed)}, with ${durationWords(left)} to spare`}
            </div>
          </div>
          <div className="text-right text-ui text-muted">
            <div>Aware {formatDateTime(awareAt)}</div>
            <div className="font-medium text-fg">72 h ends {formatDateTime(new Date(deadline).toISOString())}</div>
          </div>
        </div>
      )}
      <div className="relative pt-5 pb-6" role="img" aria-label={`${Math.floor(elapsed / HOUR)} of ${law.breachHours} hours used${late ? ', past the deadline' : ''}`}>
        <div className="relative h-3 overflow-hidden rounded-full bg-gray-3">
          <div className="pc-bar-fill absolute inset-y-0 left-0 rounded-full" style={{ width: pct(Math.min(elapsed, total)), background: fill }} />
          {elapsed > total && (
            <div
              className="absolute inset-y-0"
              style={{
                left: pct(total),
                width: `calc(${pct(elapsed)} - ${pct(total)})`,
                background: 'repeating-linear-gradient(135deg, var(--bad-solid) 0 6px, color-mix(in oklab, var(--bad-solid) 60%, transparent) 6px 12px)',
              }}
            />
          )}
        </div>
        {/* hour marks */}
        {marks.map((h) => (
          <div key={h} className="absolute top-5 h-3 border-l border-[color-mix(in_oklab,var(--gray-12)_18%,transparent)]" style={{ left: pct(h * HOUR) }}>
            <span className="absolute top-4 -translate-x-1/2 font-mono text-[10.5px] text-muted num">{h}h</span>
          </div>
        ))}
        {/* deadline */}
        <div className="absolute top-1 bottom-4 border-l-2 border-[var(--gray-12)]" style={{ left: pct(total) }}>
          {!compact && <span className="absolute -top-1 right-1.5 whitespace-nowrap font-mono text-[10.5px] font-semibold text-fg">deadline</span>}
        </div>
        {/* now / notified */}
        {running ? (
          <div className="absolute top-3 h-7 w-0.5 -translate-x-1/2 rounded-full bg-accent-9" style={{ left: pct(elapsed) }}>
            <span className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-accent-9 ring-2 ring-[var(--surface)]" />
          </div>
        ) : (
          <div className="absolute top-2.5 -translate-x-1/2" style={{ left: pct(elapsed) }} title={documented ? 'Documented, no notification owed' : `Notified ${formatDateTime(notifiedAt!)}`}>
            <span className={cx('block size-3.5 rotate-45 rounded-[3px] border-2 border-[var(--surface)]', documented ? 'bg-[var(--gray-9)]' : 'bg-info-solid')} />
          </div>
        )}
        {subjectsAt && (
          <div className="absolute top-2.5 -translate-x-1/2" style={{ left: pct(toMs(subjectsAt) - start) }} title={`People told ${formatDateTime(subjectsAt)}`}>
            <span className="block size-3 rounded-full border-2 border-[var(--surface)] bg-accent-9" />
          </div>
        )}
      </div>
    </div>
  );
}
