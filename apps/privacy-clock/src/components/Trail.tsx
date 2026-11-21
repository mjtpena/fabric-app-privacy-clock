/**
 * The event trail: every logbook entry for an item, oldest first, read-only. Used on the request and breach pages
 * (latest few) and in the Logbook (all, printable).
 */
import { formatDateTime } from '@x10/shared/lib';
import { cx } from '@x10/shared/ui';

import { nameOf, type PrivacyData } from '../domain/data';
import { EVENT_LABEL } from '../labels';
import type { EventKind, LogEvent } from '../model';

const KIND_DOT: Record<EventKind, string> = {
  created: 'var(--accent-9)',
  verified: 'var(--info-solid)',
  status: 'var(--gray-9)',
  extended: 'var(--warn-solid)',
  task_done: 'var(--ok-solid)',
  task_blocked: 'var(--bad-solid)',
  reassigned: 'var(--gray-9)',
  decision: 'var(--accent-9)',
  notified: 'var(--info-solid)',
  closed: 'var(--gray-12)',
  note: 'var(--gray-7)',
};

export function Trail({ events, data, limit, className }: { events: LogEvent[]; data: Pick<PrivacyData, 'people' | 'systems'>; limit?: number; className?: string }) {
  const shown = limit ? events.slice(-limit) : events;
  return (
    <ol className={cx('m-0 list-none p-0', className)} data-testid="trail">
      {limit && events.length > limit && <li className="pb-3 pl-6 text-ui text-muted">{events.length - limit} earlier entries in the Logbook</li>}
      {shown.map((e, i) => (
        <li key={e.id} className="pc-logbook-entry relative grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 pb-4" data-testid="trail-entry" data-kind={e.kind}>
          {i < shown.length - 1 && <span aria-hidden="true" className="absolute left-[5px] top-4 bottom-0 w-px bg-[var(--line)]" />}
          <span aria-hidden="true" className="mt-1.5 size-[11px] rounded-full border-2 border-[var(--surface)]" style={{ background: KIND_DOT[e.kind] }} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-ui font-semibold">{EVENT_LABEL[e.kind]}</span>
              <span className="text-xs text-muted">{nameOf(data, e.bySub)}</span>
              <time className="ml-auto font-mono text-[11px] text-muted num" dateTime={e.at}>
                {formatDateTime(e.at)}
              </time>
            </div>
            <p className="m-0 mt-0.5 text-ui leading-5 text-fg/90 break-words">{e.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
