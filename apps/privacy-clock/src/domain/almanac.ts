/**
 * The Almanac: on-time rate by month, median days to close, requests by type, breach notifications in time.
 * Pure; unit-tested in almanac.test.ts.
 */
import { DAY, median, toMs } from '@x10/shared/lib';

import { REQUEST_TYPES, type BreachCase, type PrivacyRequest, type RequestType } from '../model';
import { breachDeadline, localYMD, requestDeadline } from './clock';

export interface MonthRow {
  /** "2026-11" */
  key: string;
  /** Local month start (ISO) for labels. */
  start: string;
  closed: number;
  onTime: number;
  late: number;
  /** null when nothing closed that month. */
  rate: number | null;
}

/** Closed or refused requests counted in the month they closed; on time if closed by the deadline then in force. */
export function onTimeByMonth(requests: PrivacyRequest[], now: Date, months: number): MonthRow[] {
  const end = localYMD(now);
  const rows: MonthRow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const total = end.y * 12 + end.m - i;
    const y = Math.floor(total / 12);
    const m = total - y * 12;
    rows.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, start: new Date(y, m, 1).toISOString(), closed: 0, onTime: 0, late: 0, rate: null });
  }
  for (const r of requests) {
    if (!r.closedAt) continue;
    const c = localYMD(r.closedAt);
    const row = rows.find((x) => x.key === `${c.y}-${String(c.m + 1).padStart(2, '0')}`);
    if (!row) continue;
    row.closed++;
    if (toMs(r.closedAt) <= toMs(requestDeadline(r))) row.onTime++;
    else row.late++;
  }
  for (const row of rows) row.rate = row.closed ? row.onTime / row.closed : null;
  return rows;
}

export function closedRequests(requests: PrivacyRequest[]): PrivacyRequest[] {
  return requests.filter((r) => (r.status === 'closed' || r.status === 'refused') && r.closedAt);
}

/** Median calendar days from receipt to closing, over closed and refused requests. */
export function medianDaysToClose(requests: PrivacyRequest[]): number | null {
  return median(closedRequests(requests).map((r) => (toMs(r.closedAt!) - toMs(r.receivedAt)) / DAY));
}

export function onTimeRate(requests: PrivacyRequest[]): number | null {
  const closed = closedRequests(requests);
  if (!closed.length) return null;
  return closed.filter((r) => toMs(r.closedAt!) <= toMs(requestDeadline(r))).length / closed.length;
}

export interface TypeRow {
  type: RequestType;
  open: number;
  closed: number;
  total: number;
}

export function requestsByType(requests: PrivacyRequest[]): TypeRow[] {
  return REQUEST_TYPES.map((type) => {
    const of = requests.filter((r) => r.type === type);
    const closed = of.filter((r) => r.status === 'closed' || r.status === 'refused').length;
    return { type, open: of.length - closed, closed, total: of.length };
  });
}

export interface BreachSummary {
  total: number;
  notified: number;
  notifiedInTime: number;
  documentedOnly: number;
  pending: number;
}

export function breachSummary(breaches: BreachCase[]): BreachSummary {
  const notified = breaches.filter((b) => b.authorityNotifiedAt);
  return {
    total: breaches.length,
    notified: notified.length,
    notifiedInTime: notified.filter((b) => toMs(b.authorityNotifiedAt!) <= toMs(breachDeadline(b.awareAt))).length,
    documentedOnly: breaches.filter((b) => b.decision === 'document_only').length,
    pending: breaches.filter((b) => b.decision === 'pending').length,
  };
}

export function extendedShare(requests: PrivacyRequest[]): number {
  return requests.length ? requests.filter((r) => r.extendedDueAt).length / requests.length : 0;
}
