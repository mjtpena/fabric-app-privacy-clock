/**
 * Small shared pieces: clock badges, a mini dial for a request or breach, the data hook every screen uses.
 */
import type { ReactNode } from 'react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Badge, cx, type Tone } from '@x10/shared/ui';

import { CLOCK_LABEL, type Clock, type ClockState } from '../domain/clock';
import { loadAll } from '../domain/data';
import { STATE_COLOR, type Dial } from '../domain/tower';
import type { Schema } from '../model';
import { MiniDial } from '../tower/Dial';

/** Everything, loaded once and polled every 5 s (live screens). */
export function usePrivacyData(poll = true) {
  const { store } = useApp<Schema>();
  const state = useAsync(() => loadAll(store), [store]);
  usePolling(state.reload, 5000, poll);
  return state;
}

export const STATE_TONE: Record<ClockState, Tone> = {
  on_track: 'ok',
  due_soon: 'warn',
  critical: 'bad',
  overdue: 'bad',
  met: 'info',
  late: 'bad',
};

export function ClockBadge({ clock, className }: { clock: Clock; className?: string }) {
  return (
    <span data-state={clock.state} className="inline-flex">
      <Badge tone={STATE_TONE[clock.state]} className={className} pulse={clock.state === 'overdue' && clock.running}>
        {CLOCK_LABEL[clock.state]}
      </Badge>
    </span>
  );
}

/** Text colour class for a clock's time left. */
export function clockTextClass(state: ClockState): string {
  return state === 'overdue' || state === 'late' || state === 'critical' ? 'text-bad-text' : state === 'due_soon' ? 'text-warn-text' : state === 'met' ? 'text-info-text' : 'text-muted';
}

export function DialMark({ d, size = 40 }: { d: Dial; size?: number }) {
  return (
    <MiniDial
      size={size}
      id={`mini-${d.id}-${size}`}
      kind={d.kind}
      type={d.type}
      fraction={d.clock.fraction}
      state={d.clock.state}
      running={d.clock.running}
      rim={STATE_COLOR[d.clock.state]}
      sweep={STATE_COLOR[d.clock.state]}
      tasks={d.tasks.map((t) => t.status)}
      ticks={d.kind === 'breach' ? 24 : 30}
      majorEvery={d.kind === 'breach' ? 6 : 7}
      originalDueFraction={d.originalDueFraction}
    />
  );
}

/** A labelled fact in a definition grid. */
export function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <dt className="x-legend-label text-[10.5px] text-muted">{label}</dt>
      <dd className="m-0 mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}

/** Section heading inside a tool page (mono caps, no paragraph). */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="x-legend-label m-0 text-[11px] font-semibold text-muted">{children}</h2>
      {right && <div className="text-ui text-muted">{right}</div>}
    </div>
  );
}
