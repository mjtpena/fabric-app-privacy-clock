/**
 * The legal clocks. Pure functions only, unit-tested in clock.test.ts.
 *
 * Requests (GDPR Art. 12(3)): due one calendar month after receipt, on the same day of the next month; when that day
 * does not exist (31 January → February), the last day of that month. A request is answered in time if it is closed
 * by the end of its due day in the officer's local calendar, so `dueAt` is stored as 23:59:59.999 local time.
 * Extension: up to two further calendar months from the original due date, by the same day rule.
 *
 * Breaches (GDPR Art. 33(1)): 72 hours from the moment the organisation became aware, to the minute.
 */
import { DAY, HOUR, MINUTE, toMs } from '@x10/shared/lib';

import { law, rules } from '../config';
import type { BreachCase, PrivacyRequest } from '../model';

/** A calendar date. `m` is 0-based (0 = January), like Date. */
export interface YMD {
  y: number;
  m: number;
  d: number;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Same day `months` calendar months later; clamps to the last day when that day does not exist. */
export function addCalendarMonths(date: YMD, months: number): YMD {
  if (!Number.isInteger(months)) throw new Error('Calendar months must be whole months.');
  const total = date.y * 12 + date.m + months;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  return { y, m, d: Math.min(date.d, daysInMonth(y, m)) };
}

/** The local calendar date of an instant (the viewer's time zone). */
export function localYMD(iso: string | Date): YMD {
  const d = new Date(toMs(iso));
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}

/** The last millisecond of a local calendar day, as an ISO instant. */
export function endOfLocalDay(date: YMD): string {
  return new Date(date.y, date.m, date.d, 23, 59, 59, 999).toISOString();
}

export function sameYMD(a: YMD, b: YMD): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

/** Rule 1: the response is due by the end of the same day next month (or the last day of that month). */
export function requestDueAt(receivedAt: string | Date): string {
  return endOfLocalDay(addCalendarMonths(localYMD(receivedAt), law.requestMonths));
}

/** Rule 2: the extended due date, `months` (1 or 2) calendar months after the original due date. */
export function extendedDueAt(dueAt: string | Date, months: number = law.extensionMaxMonths): string {
  return endOfLocalDay(addCalendarMonths(localYMD(dueAt), months));
}

/** True when receipt fell on a day the due month does not have (31 Jan → 28/29 Feb). */
export function dueWasClamped(receivedAt: string | Date): boolean {
  const r = localYMD(receivedAt);
  return addCalendarMonths(r, law.requestMonths).d !== r.d;
}

/** Rule 3: the breach notification deadline, exactly 72 hours after awareness. */
export function breachDeadline(awareAt: string | Date): string {
  return new Date(toMs(awareAt) + law.breachHours * HOUR).toISOString();
}

/* ------------------------------------------------------------------ clock state */

export type ClockState = 'on_track' | 'due_soon' | 'critical' | 'overdue' | 'met' | 'late';
export type ClockKind = 'request' | 'breach';
/** Why a clock is no longer running. */
export type StopReason = 'closed' | 'notified' | 'documented';

export interface Clock {
  kind: ClockKind;
  start: string;
  deadline: string;
  totalMs: number;
  /** Elapsed time, frozen when the clock stopped. */
  elapsedMs: number;
  /** Deadline minus now (or minus the stop time); negative when overdue. */
  leftMs: number;
  /** Elapsed share of the legal time: 0 at the start, 1 at the deadline, above 1 when overdue. */
  fraction: number;
  state: ClockState;
  running: boolean;
  stoppedAt: string | null;
  stopReason: StopReason | null;
}

export interface ClockInput {
  kind: ClockKind;
  start: string;
  deadline: string;
  now: Date | string;
  stoppedAt?: string | null;
  stopReason?: StopReason | null;
}

/**
 * Rule 4. On track while more than half the time is left; due soon at or below half; critical at or below 15%
 * (or under 24 hours for a breach); overdue once the deadline has passed. The clock never pauses. A stopped clock
 * is met (stopped on or before the deadline) or late.
 */
export function computeClock(input: ClockInput): Clock {
  const start = toMs(input.start);
  const deadline = toMs(input.deadline);
  const totalMs = Math.max(1, deadline - start);
  const stopped = input.stoppedAt ? toMs(input.stoppedAt) : null;
  const at = stopped ?? toMs(input.now);
  const elapsedMs = Math.max(0, at - start);
  const leftMs = deadline - at;
  let state: ClockState;
  if (stopped !== null) state = stopped <= deadline ? 'met' : 'late';
  else state = clockStateFor(input.kind, leftMs, totalMs);
  return {
    kind: input.kind,
    start: new Date(start).toISOString(),
    deadline: new Date(deadline).toISOString(),
    totalMs,
    elapsedMs,
    leftMs,
    fraction: elapsedMs / totalMs,
    state,
    running: stopped === null,
    stoppedAt: stopped === null ? null : new Date(stopped).toISOString(),
    stopReason: stopped === null ? null : (input.stopReason ?? 'closed'),
  };
}

export function clockStateFor(kind: ClockKind, leftMs: number, totalMs: number): ClockState {
  if (leftMs < 0) return 'overdue';
  const share = leftMs / totalMs;
  if (share <= rules.criticalShare) return 'critical';
  if (kind === 'breach' && leftMs < rules.breachCriticalHours * HOUR) return 'critical';
  if (share <= rules.dueSoonShare) return 'due_soon';
  return 'on_track';
}

/** The deadline that applies now: the extended one if the request was extended. */
export function requestDeadline(r: Pick<PrivacyRequest, 'dueAt' | 'extendedDueAt'>): string {
  return r.extendedDueAt ?? r.dueAt;
}

export function requestClock(r: PrivacyRequest, now: Date | string): Clock {
  const closed = r.status === 'closed' || r.status === 'refused';
  return computeClock({
    kind: 'request',
    start: r.receivedAt,
    deadline: requestDeadline(r),
    now,
    stoppedAt: closed ? (r.closedAt ?? null) : null,
    stopReason: 'closed',
  });
}

/**
 * The breach clock runs until the authority is notified. A "document only" decision stops it too (no notification
 * is owed), as does closing the case.
 */
export function breachClock(b: BreachCase, now: Date | string): Clock {
  const base = { kind: 'breach' as const, start: b.awareAt, deadline: breachDeadline(b.awareAt), now };
  if (b.authorityNotifiedAt) return computeClock({ ...base, stoppedAt: b.authorityNotifiedAt, stopReason: 'notified' });
  if (b.decision === 'document_only') {
    const c = computeClock({ ...base, stoppedAt: b.closedAt ?? b.containedAt ?? new Date(toMs(now)).toISOString(), stopReason: 'documented' });
    // No notification was owed, so a documented case is never "late".
    return { ...c, state: 'met' };
  }
  if (b.status === 'closed' && b.closedAt) return computeClock({ ...base, stoppedAt: b.closedAt, stopReason: 'closed' });
  return computeClock(base);
}

/** After 72 h without notifying the authority, where the decision is (or may be) to notify: reasons are required. */
export function breachIsLate(b: BreachCase, now: Date | string): boolean {
  if (b.decision === 'document_only') return false;
  const deadline = toMs(breachDeadline(b.awareAt));
  const at = b.authorityNotifiedAt ? toMs(b.authorityNotifiedAt) : toMs(now);
  return at > deadline;
}

/* ------------------------------------------------------------------ words */

function unit(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

/** "4 days 6 hours", "5 hours 12 minutes", "12 minutes", "less than a minute". Rounds down. */
export function durationWords(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < MINUTE) return 'less than a minute';
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / HOUR);
  const minutes = Math.floor((abs % HOUR) / MINUTE);
  if (days > 0) return hours ? `${unit(days, 'day')} ${unit(hours, 'hour')}` : unit(days, 'day');
  if (hours > 0) return minutes ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')}` : unit(hours, 'hour');
  return unit(minutes, 'minute');
}

/** Plain words for a clock: "4 days 6 hours left", "2 days overdue", "Answered 3 days early", "Notified 9 hours late". */
export function clockWords(c: Clock): string {
  if (c.running) return c.leftMs >= 0 ? `${durationWords(c.leftMs)} left` : `${durationWords(c.leftMs)} overdue`;
  if (c.stopReason === 'documented') return 'Documented, no notification owed';
  const verb = c.stopReason === 'notified' ? 'Notified' : 'Closed';
  if (c.leftMs >= 0) return `${verb} with ${durationWords(c.leftMs)} to spare`;
  return `${verb} ${durationWords(c.leftMs)} late`;
}

/** Compact: "4d 6h", "41h 12m", "12m", "-2d 3h". Breaches always count in hours. */
export function shortLeft(ms: number, kind: ClockKind = 'request'): string {
  const sign = ms < 0 ? '−' : '';
  const abs = Math.abs(ms);
  const totalMinutes = Math.floor(abs / MINUTE);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (kind === 'breach' || abs < DAY) return h ? `${sign}${h}h ${String(m).padStart(2, '0')}m` : `${sign}${m}m`;
  const d = Math.floor(abs / DAY);
  const hh = Math.floor((abs % DAY) / HOUR);
  return hh ? `${sign}${d}d ${hh}h` : `${sign}${d}d`;
}

/** "71:59:59": hours, minutes and seconds left (or past) for the breach bar. */
export function hms(ms: number): string {
  const abs = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${ms < 0 ? '−' : ''}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const CLOCK_LABEL: Record<ClockState, string> = {
  on_track: 'On track',
  due_soon: 'Due soon',
  critical: 'Critical',
  overdue: 'Overdue',
  met: 'Met',
  late: 'Late',
};

/** Whole local calendar days from `from` to `to` (positive when `to` is later). */
export function calendarDaysBetween(from: string | Date, to: string | Date): number {
  const a = localYMD(from);
  const b = localYMD(to);
  return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / DAY);
}
