
import { HOUR } from '@x10/shared/lib';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { PERSONA, personas } from '../app.config';
import { defs, type PrivacyRequest } from '../model';
import { seed } from '../seed';
import { arcPath, bestCols, crackPaths, hexPoints, layoutTower, polar, rng } from '../tower/geometry';
import { breachSummary, medianDaysToClose, onTimeByMonth, onTimeRate, requestsByType } from './almanac';
import { localYMD, requestDueAt } from './clock';
import { loadAll } from './data';
import { buildDials, byUrgency, groupKey, isDimmed, lensGroups, ownerForView, todayFor, type TowerLens } from './tower';

const NOW = FIXED_NOW;

async function data() {
  const store = await testStore(defs, { personas, fn: seed, now: NOW });
  return loadAll(store);
}

describe('dials', () => {
  it('one dial per open request and breach; closed ones leave the tower', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    expect(dials.filter((x) => x.kind === 'breach').map((x) => x.ref).sort()).toEqual(['BR-0003', 'BR-0004']);
    expect(dials.filter((x) => x.kind === 'request')).toHaveLength(10);
    const running = dials.find((x) => x.ref === 'BR-0004')!;
    expect(running.clock.running).toBe(true);
    expect(running.clock.leftMs).toBe(41 * HOUR);
    expect(running.words).toBe('1 day 17 hours left');
    const notified = dials.find((x) => x.ref === 'BR-0003')!;
    expect(notified.clock.running).toBe(false);
    expect(notified.clock.state).toBe('met');
  });

  it('marks the original due date on an extended dial and counts tasks', async () => {
    const d = await data();
    const ext = buildDials(d, NOW).find((x) => x.request?.extendedDueAt)!;
    expect(ext.originalDueFraction).toBeGreaterThan(0.25);
    expect(ext.originalDueFraction).toBeLessThan(0.45);
    expect(ext.tally.total).toBe(3);
    expect(ext.tally.blocked).toBe(1);
  });

  it('sorts breaches first, then by share of time left', async () => {
    const dials = buildDials(await data(), NOW).sort(byUrgency);
    expect(dials[0].kind).toBe('breach');
    const reqs = dials.filter((x) => x.kind === 'request');
    expect(reqs[0].clock.state).toBe('overdue');
  });
});

describe('lenses', () => {
  it('every dial belongs to exactly one shown group in every lens', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    for (const lens of ['state', 'type', 'owner', 'systems', 'stage'] as TowerLens[]) {
      const groups = lensGroups(lens, dials, d);
      const keys = new Set(groups.map((g) => g.key));
      for (const x of dials) expect(keys.has(groupKey(x, lens))).toBe(true);
      expect(new Set(groups.map((g) => g.color)).size).toBeGreaterThan(0);
    }
  });

  it('clock lens orders the floors from overdue to on track', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    expect(lensGroups('state', dials, d).map((g) => g.key)).toEqual(['overdue', 'critical', 'due_soon', 'on_track', 'met']);
  });

  it('next-step lens puts the officer first; systems lens groups by where a request waits', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    const owners = lensGroups('owner', dials, d);
    expect(owners[0].label).toMatch(/officer/);
    const blocked = dials.find((x) => x.tally.blocked > 0 && x.type === 'erasure')!;
    const sys = d.systems.find((s) => s.id === groupKey(blocked, 'systems'))!;
    expect(sys.name).toBe('Marketing platform');
  });
});

describe('view as', () => {
  it('a system owner sees their own clocks; everything else steps back', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    const sam = ownerForView(d, PERSONA.sam)!;
    expect(sam).toBe(PERSONA.sam);
    const lit = dials.filter((x) => !isDimmed(x, 'owner', sam));
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.every((x) => x.tasks.some((t) => t.assigneeSub === PERSONA.sam))).toBe(true);
    expect(dials.some((x) => isDimmed(x, 'owner', sam))).toBe(true);
    expect(dials.some((x) => isDimmed(x, 'officer', sam))).toBe(false);
    // An officer with no systems views as the busiest owner.
    expect(ownerForView(d, PERSONA.alex)).not.toBeNull();
  });
});

describe('today', () => {
  it('ranks the breach, the most overdue, the last day to extend, the next due and blocked tasks', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    const t = todayFor(dials, d, 'officer', null, NOW);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t.length).toBeLessThanOrEqual(5);
    expect(t[0].id).toMatch(/^breach:/);
    expect(t[0].value).toBe('41h');
    expect(t.map((x) => x.id.split(':')[0])).toEqual(['breach', 'overdue', 'extend', 'soon', 'blocked']);
    const ext = t.find((x) => x.id.startsWith('extend:'))!;
    const r = d.requests.find((x) => x.id === ext.focusId)!;
    expect(localYMD(r.dueAt)).toEqual(localYMD(NOW));
    // Every item focuses a dial on the tower.
    for (const x of t) expect(dials.some((dl) => dl.id === x.focusId)).toBe(true);
  });

  it('a system owner gets their own tasks, blocked first', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    const t = todayFor(dials, d, 'owner', PERSONA.chen, NOW);
    expect(t.length).toBeGreaterThan(0);
    expect(t[0].title).toMatch(/^Blocked/);
    for (const x of t) {
      const task = d.tasks.find((k) => k.id === x.id.slice(5))!;
      expect(task.assigneeSub).toBe(PERSONA.chen);
    }
  });

  it('is empty when nothing is open', async () => {
    const d = await data();
    const empty = { ...d, requests: [] as PrivacyRequest[], breaches: [] };
    expect(todayFor(buildDials(empty, NOW), empty, 'officer', null, NOW)).toEqual([]);
  });
});

describe('tower layout', () => {
  it('places every dial once, breaches in the belfry, no two request dials overlapping', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    for (const lens of ['state', 'type', 'owner', 'systems', 'stage'] as TowerLens[]) {
      const groups = lensGroups(lens, dials, d).filter((g) => dials.some((x) => x.kind === 'request' && groupKey(x, lens) === g.key));
      for (const cols of [2, 3, 5, 7]) {
        const l = layoutTower(dials, lens, groups, cols);
        expect(l.placed.size).toBe(dials.length);
        const reqs = [...l.placed.values()].filter((p) => p.kind === 'request');
        for (const p of reqs) {
          expect(p.y).toBeGreaterThan(l.belfryH);
          expect(p.x - p.r).toBeGreaterThan(0);
          expect(p.x + p.r).toBeLessThan(l.width);
        }
        for (let i = 0; i < reqs.length; i++)
          for (let j = i + 1; j < reqs.length; j++) expect(Math.hypot(reqs[i].x - reqs[j].x, reqs[i].y - reqs[j].y)).toBeGreaterThan(reqs[i].r * 2);
        for (const row of l.rows) expect(row.bays.reduce((a, b) => a + b.count, 0)).toBeLessThanOrEqual(cols);
        const br = [...l.placed.values()].filter((p) => p.kind === 'breach');
        for (const p of br) expect(p.y + p.r).toBeLessThan(l.belfryH);
      }
    }
  });

  it('chooses more columns for a wide stage than for a tall one', async () => {
    const d = await data();
    const dials = buildDials(d, NOW);
    const groups = lensGroups('state', dials, d);
    expect(bestCols(dials, 'state', groups, 1400, 600).cols).toBeGreaterThan(bestCols(dials, 'state', groups, 380, 700).cols);
  });

  it('draws hexagons, arcs and stable cracks', () => {
    expect(hexPoints(10).split(' ')).toHaveLength(6);
    expect(polar(10, 0)[1]).toBeCloseTo(-10);
    expect(polar(10, 0.25)[0]).toBeCloseTo(10);
    expect(arcPath(10, 0, 0.75)).toContain(' 1 1 ');
    expect(arcPath(10, 0, 0.25)).toContain(' 0 1 ');
    expect(crackPaths('a', 40)).toEqual(crackPaths('a', 40));
    expect(crackPaths('a', 40)).not.toEqual(crackPaths('b', 40));
    const r = rng('x');
    const v = Array.from({ length: 50 }, r);
    expect(v.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});

describe('almanac', () => {
  const req = (over: Partial<PrivacyRequest>): PrivacyRequest => {
    const receivedAt = over.receivedAt ?? '2026-10-01T09:00:00.000Z';
    return {
      id: Math.random().toString(36),
      ref: 'DSR-1',
      type: 'access',
      subjectLabel: 'x',
      channel: 'email',
      receivedAt,
      identityVerifiedAt: null,
      dueAt: requestDueAt(receivedAt),
      extendedDueAt: null,
      extensionReason: null,
      extensionNotifiedAt: null,
      status: 'closed',
      outcome: 'Done.',
      closedAt: null,
      ownerSub: 'o',
      ...over,
    };
  };

  it('counts on time and late by the month they closed, against the deadline in force', () => {
    const rows = [
      req({ closedAt: '2026-10-20T09:00:00.000Z' }),
      req({ receivedAt: '2026-09-10T09:00:00.000Z', closedAt: '2026-10-25T09:00:00.000Z' }),
      req({ receivedAt: '2026-08-01T09:00:00.000Z', extendedDueAt: '2026-11-01T23:59:59.999Z', closedAt: '2026-10-28T09:00:00.000Z' }),
      req({ status: 'in_progress', closedAt: null }),
    ];
    const months = onTimeByMonth(rows, new Date('2026-11-20T09:00:00.000Z'), 3);
    expect(months.map((m) => m.closed)).toEqual([0, 3, 0]);
    const oct = months[1];
    expect(oct.onTime).toBe(2);
    expect(oct.late).toBe(1);
    expect(oct.rate).toBeCloseTo(2 / 3);
    expect(months[0].rate).toBeNull();
    expect(onTimeRate(rows)).toBeCloseTo(2 / 3);
  });

  it('medians, types and breaches from the seed', async () => {
    const d = await data();
    const med = medianDaysToClose(d.requests)!;
    expect(med).toBeGreaterThan(10);
    expect(med).toBeLessThan(30);
    const types = requestsByType(d.requests);
    expect(types.reduce((a, t) => a + t.total, 0)).toBe(18);
    expect(types.find((t) => t.type === 'access')!.total).toBe(7);
    expect(breachSummary(d.breaches)).toEqual({ total: 3, notified: 1, notifiedInTime: 1, documentedOnly: 1, pending: 1 });
    expect(medianDaysToClose([])).toBeNull();

  });
});

