import { DAY, HOUR, MINUTE } from '@x10/shared/lib';

import type { BreachCase } from '../model';
import {
  addCalendarMonths,
  breachClock,
  breachDeadline,
  breachIsLate,
  calendarDaysBetween,
  clockWords,
  computeClock,
  daysInMonth,
  dueWasClamped,
  durationWords,
  extendedDueAt,
  hms,
  localYMD,
  requestDueAt,
  shortLeft,
} from './clock';

const ZONES = ['UTC', 'Australia/Sydney', 'America/Los_Angeles', 'Asia/Kolkata', 'Europe/London'];
const original = process.env.TZ;

function inZone(tz: string, fn: () => void) {
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    process.env.TZ = original;
  }
}

/** Local wall-clock time as an ISO instant in the current zone. */
const local = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
/** The local calendar date and time of an instant, for assertions. */
const wall = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

describe('calendar months', () => {
  it('knows the length of every month, leap years included', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2027, m - 1))).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2100, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
  });

  it.each([
    // [y, m(1-based), d, months, expected]
    [2027, 1, 31, 1, '2027-02-28'],
    [2028, 1, 31, 1, '2028-02-29'],
    [2027, 1, 30, 1, '2027-02-28'],
    [2027, 1, 29, 1, '2027-02-28'],
    [2027, 1, 28, 1, '2027-02-28'],
    [2027, 2, 28, 1, '2027-03-28'],
    [2028, 2, 29, 1, '2028-03-29'],
    [2027, 3, 31, 1, '2027-04-30'],
    [2027, 5, 31, 1, '2027-06-30'],
    [2027, 8, 31, 1, '2027-09-30'],
    [2026, 10, 31, 1, '2026-11-30'],
    [2026, 11, 20, 1, '2026-12-20'],
    [2026, 12, 15, 1, '2027-01-15'],
    [2026, 12, 31, 1, '2027-01-31'],
    [2027, 2, 28, 2, '2027-04-28'],
    [2027, 12, 31, 2, '2028-02-29'],
    [2026, 12, 31, 2, '2027-02-28'],
    [2027, 3, 31, -1, '2027-02-28'],
    [2027, 1, 15, -1, '2026-12-15'],
    [2027, 1, 31, 12, '2028-01-31'],
  ])('%i-%i-%i plus %i month(s) is %s', (y, m, d, n, want) => {
    const r = addCalendarMonths({ y, m: m - 1, d }, n);
    expect(`${r.y}-${String(r.m + 1).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`).toBe(want);
  });

  it('refuses fractional months', () => {
    expect(() => addCalendarMonths({ y: 2027, m: 0, d: 1 }, 1.5)).toThrow();
  });
});

describe('request due date (rule 1)', () => {
  for (const tz of ZONES) {
    describe(tz, () => {
      it('received 31 January is due at the end of the last day of February', () => {
        inZone(tz, () => {
          expect(wall(requestDueAt(local(2027, 1, 31)))).toBe('2027-02-28 23:59:59.999');
          expect(wall(requestDueAt(local(2028, 1, 31)))).toBe('2028-02-29 23:59:59.999');
        });
      });

      it('uses the local calendar day, even just after midnight or just before it', () => {
        inZone(tz, () => {
          expect(wall(requestDueAt(local(2027, 1, 31, 0, 5)))).toBe('2027-02-28 23:59:59.999');
          expect(wall(requestDueAt(local(2027, 1, 31, 23, 55)))).toBe('2027-02-28 23:59:59.999');
          expect(wall(requestDueAt(local(2027, 3, 1, 0, 1)))).toBe('2027-04-01 23:59:59.999');
        });
      });

      it('is the same day next month otherwise, across the year end', () => {
        inZone(tz, () => {
          expect(wall(requestDueAt(local(2026, 11, 20, 9)))).toBe('2026-12-20 23:59:59.999');
          expect(wall(requestDueAt(local(2026, 12, 31)))).toBe('2027-01-31 23:59:59.999');
          expect(wall(requestDueAt(local(2026, 10, 31)))).toBe('2026-11-30 23:59:59.999');
          expect(wall(requestDueAt(local(2027, 3, 31)))).toBe('2027-04-30 23:59:59.999');
        });
      });

      it('extension adds two months to the original due date, not to the receipt', () => {
        inZone(tz, () => {
          const due = requestDueAt(local(2027, 1, 31));
          expect(wall(extendedDueAt(due))).toBe('2027-04-28 23:59:59.999');
          expect(wall(extendedDueAt(due, 1))).toBe('2027-03-28 23:59:59.999');
          expect(wall(extendedDueAt(requestDueAt(local(2026, 11, 30)), 2))).toBe('2027-02-28 23:59:59.999');
          expect(wall(extendedDueAt(requestDueAt(local(2026, 11, 20)), 2))).toBe('2027-02-20 23:59:59.999');
        });
      });
    });
  }

  it('keeps the wall-clock end of day across a daylight-saving change', () => {
    inZone('Australia/Sydney', () => {
      // Sydney moves its clocks forward on 4 Oct 2026.
      expect(wall(requestDueAt(local(2026, 9, 4)))).toBe('2026-10-04 23:59:59.999');
    });
    inZone('Europe/London', () => {
      // London moves its clocks back on 25 Oct 2026.
      expect(wall(requestDueAt(local(2026, 9, 25)))).toBe('2026-10-25 23:59:59.999');
    });
  });

  it('flags a receipt day the due month does not have', () => {
    inZone('UTC', () => {
      expect(dueWasClamped(local(2027, 1, 31))).toBe(true);
      expect(dueWasClamped(local(2027, 1, 28))).toBe(false);
      expect(dueWasClamped(local(2027, 3, 31))).toBe(true);
    });
  });

  it('really switches zones in these tests', () => {
    inZone('Australia/Sydney', () => expect(local(2027, 1, 31, 0)).toBe('2027-01-30T13:00:00.000Z'));
    inZone('America/Los_Angeles', () => expect(local(2027, 1, 31, 0)).toBe('2027-01-31T08:00:00.000Z'));
  });

  it('localYMD reads the local calendar', () => {
    inZone('Australia/Sydney', () => {
      // 13:00 UTC on 30 Jan is 00:00 on 31 Jan in Sydney (UTC+11).
      expect(localYMD('2027-01-30T13:00:00.000Z')).toEqual({ y: 2027, m: 0, d: 31 });
    });
  });

  it('counts local calendar days', () => {
    inZone('UTC', () => {
      expect(calendarDaysBetween(local(2027, 2, 27, 23), local(2027, 2, 28, 1))).toBe(1);
      expect(calendarDaysBetween(local(2027, 2, 28, 1), local(2027, 2, 28, 23))).toBe(0);
      expect(calendarDaysBetween(local(2027, 3, 1), local(2027, 2, 27))).toBe(-2);
    });
  });
});

describe('breach deadline (rule 3)', () => {
  it('is exactly 72 hours after awareness, to the millisecond', () => {
    expect(breachDeadline('2026-11-20T09:00:00.000Z')).toBe('2026-11-23T09:00:00.000Z');
    expect(breachDeadline('2026-11-20T09:17:42.123Z')).toBe('2026-11-23T09:17:42.123Z');
  });

  it('counts real hours across a daylight-saving change', () => {
    // Europe/London falls back at 01:00 UTC on 25 Oct 2026: still 72 elapsed hours.
    expect(Date.parse(breachDeadline('2026-10-24T12:00:00.000Z')) - Date.parse('2026-10-24T12:00:00.000Z')).toBe(72 * HOUR);
  });
});

describe('clock states (rule 4)', () => {
  const start = '2026-11-01T00:00:00.000Z';
  const req = (leftMs: number, total = 30 * DAY) => {
    const deadline = new Date(Date.parse(start) + total).toISOString();
    return computeClock({ kind: 'request', start, deadline, now: new Date(Date.parse(deadline) - leftMs) });
  };
  const br = (leftMs: number) => {
    const deadline = breachDeadline(start);
    return computeClock({ kind: 'breach', start, deadline, now: new Date(Date.parse(deadline) - leftMs) });
  };

  it('request: on track above half, due soon at half, critical at 15%, overdue after the deadline', () => {
    expect(req(16 * DAY).state).toBe('on_track');
    expect(req(15 * DAY + 1).state).toBe('on_track');
    expect(req(15 * DAY).state).toBe('due_soon');
    expect(req(4.6 * DAY).state).toBe('due_soon');
    expect(req(4.5 * DAY).state).toBe('critical');
    expect(req(1).state).toBe('critical');
    expect(req(0).state).toBe('critical');
    expect(req(-1).state).toBe('overdue');
  });

  it('request: a long request is not critical just because a day is left of a long period', () => {
    // 91-day extended period with 20 days left is 22%: due soon, not critical.
    expect(req(20 * DAY, 91 * DAY).state).toBe('due_soon');
  });

  it('breach: critical under 24 hours, even though that is a third of the time', () => {
    expect(br(37 * HOUR).state).toBe('on_track');
    expect(br(36 * HOUR).state).toBe('due_soon');
    expect(br(24 * HOUR).state).toBe('due_soon');
    expect(br(24 * HOUR - 1).state).toBe('critical');
    expect(br(10 * HOUR).state).toBe('critical');
    expect(br(-MINUTE).state).toBe('overdue');
  });

  it('reports elapsed share, time left and running', () => {
    const c = br(41 * HOUR);
    expect(c.fraction).toBeCloseTo(31 / 72, 6);
    expect(c.leftMs).toBe(41 * HOUR);
    expect(c.running).toBe(true);
    expect(req(-2 * DAY).fraction).toBeCloseTo(32 / 30, 6);
  });

  it('never pauses: only stopping (closing, notifying) freezes the clock', () => {
    const deadline = new Date(Date.parse(start) + 30 * DAY).toISOString();
    const met = computeClock({ kind: 'request', start, deadline, now: '2027-03-01T00:00:00.000Z', stoppedAt: '2026-11-20T00:00:00.000Z' });
    expect(met.state).toBe('met');
    expect(met.running).toBe(false);
    expect(met.elapsedMs).toBe(19 * DAY);
    const late = computeClock({ kind: 'request', start, deadline, now: '2027-03-01T00:00:00.000Z', stoppedAt: '2026-12-02T00:00:00.000Z' });
    expect(late.state).toBe('late');
    const onDeadline = computeClock({ kind: 'request', start, deadline, now: '2027-03-01T00:00:00.000Z', stoppedAt: deadline });
    expect(onDeadline.state).toBe('met');
  });
});

describe('breach clock', () => {
  const base: BreachCase = {
    id: 'b',
    ref: 'BR-0001',
    title: 'Test',
    awareAt: '2026-11-20T09:00:00.000Z',
    reportedBy: 'x',
    officerSub: 'o',
    categories: null,
    approxSubjects: 1,
    approxRecords: 1,
    riskLevel: null,
    riskRationale: null,
    authorityNotifiedAt: null,
    authorityRef: null,
    subjectsNotifiedAt: null,
    delayReason: null,
    decision: 'pending',
    decisionBy: null,
    status: 'open',
    containedAt: null,
    closedAt: null,
  };
  const at = (h: number) => new Date(Date.parse(base.awareAt) + h * HOUR);

  it('runs until the authority is notified', () => {
    expect(breachClock(base, at(31)).running).toBe(true);
    const n = breachClock({ ...base, decision: 'notify_authority', authorityNotifiedAt: at(52).toISOString() }, at(100));
    expect(n.running).toBe(false);
    expect(n.state).toBe('met');
    expect(n.stopReason).toBe('notified');
    expect(clockWords(n)).toBe('Notified with 20 hours to spare');
    const late = breachClock({ ...base, decision: 'notify_authority', authorityNotifiedAt: at(75).toISOString() }, at(100));
    expect(late.state).toBe('late');
    expect(clockWords(late)).toBe('Notified 3 hours late');
  });

  it('"document only" stops the clock and is never late', () => {
    const d = breachClock({ ...base, decision: 'document_only', closedAt: at(100).toISOString(), status: 'closed' }, at(120));
    expect(d.running).toBe(false);
    expect(d.state).toBe('met');
    expect(clockWords(d)).toMatch(/Documented/);
  });

  it('is late after 72 h without notification unless documented only', () => {
    expect(breachIsLate(base, at(71.9))).toBe(false);
    expect(breachIsLate(base, at(72.1))).toBe(true);
    expect(breachIsLate({ ...base, decision: 'notify_authority' }, at(80))).toBe(true);
    expect(breachIsLate({ ...base, decision: 'document_only' }, at(80))).toBe(false);
    expect(breachIsLate({ ...base, decision: 'notify_authority', authorityNotifiedAt: at(60).toISOString() }, at(80))).toBe(false);
    expect(breachIsLate({ ...base, decision: 'notify_authority', authorityNotifiedAt: at(73).toISOString() }, at(80))).toBe(true);
  });
});

describe('words', () => {
  it('says time left in plain words', () => {
    expect(durationWords(4 * DAY + 6 * HOUR + 59 * MINUTE)).toBe('4 days 6 hours');
    expect(durationWords(1 * DAY)).toBe('1 day');
    expect(durationWords(1 * DAY + 1 * HOUR)).toBe('1 day 1 hour');
    expect(durationWords(2 * HOUR + 1 * MINUTE)).toBe('2 hours 1 minute');
    expect(durationWords(3 * HOUR)).toBe('3 hours');
    expect(durationWords(12 * MINUTE)).toBe('12 minutes');
    expect(durationWords(30 * 1000)).toBe('less than a minute');
    const running = computeClock({ kind: 'request', start: '2026-11-01T00:00:00Z', deadline: '2026-12-01T00:00:00Z', now: new Date(Date.parse('2026-12-01T00:00:00Z') - (4 * DAY + 6 * HOUR)) });
    expect(clockWords(running)).toBe('4 days 6 hours left');
    const over = computeClock({ kind: 'request', start: '2026-11-01T00:00:00Z', deadline: '2026-12-01T00:00:00Z', now: new Date(Date.parse('2026-12-01T00:00:00Z') + 2 * DAY) });
    expect(clockWords(over)).toBe('2 days overdue');
  });

  it('formats compact and h:m:s countdowns', () => {
    expect(shortLeft(4 * DAY + 6 * HOUR)).toBe('4d 6h');
    expect(shortLeft(4 * DAY)).toBe('4d');
    expect(shortLeft(5 * HOUR + 7 * MINUTE)).toBe('5h 07m');
    expect(shortLeft(41 * HOUR + 12 * MINUTE, 'breach')).toBe('41h 12m');
    expect(shortLeft(-(2 * DAY + 3 * HOUR))).toBe('−2d 3h');
    expect(shortLeft(9 * MINUTE)).toBe('9m');
    expect(hms(71 * HOUR + 59 * MINUTE + 59 * 1000)).toBe('71:59:59');
    expect(hms(-(1 * HOUR + 5 * 1000))).toBe('−1:00:05');
  });
});
