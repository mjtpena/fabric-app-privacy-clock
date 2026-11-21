/**
 * Home: the clock tower. Lenses re-colour and regroup the dials (keys 1-5), view as privacy officer or system owner
 * (V), Today flies to what needs attention, L switches to the sortable list of the same clocks.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookOpenText, Clock3, Cog, Keyboard, Layers, RotateCcw, Search, TowerControl, UserRound } from 'lucide-react';

import { formatDate, useNow } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Button,
  Dialog,
  IconButton,
  Input,
  Kbd,
  Legend,
  LensBar,
  LinkButton,
  Spinner,
  StageMessage,
  StagePage,
  Table,
  TableWrap,
  Td,
  Th,
  TodayPanel,
  Tr,
  ViewAsSwitch,
  ViewToggle,
  useHotkeys,
  useIsDesktop,
  type LegendItem,
  type LensOption,
  type StageView,
  type TodayItem,
} from '@x10/shared/ui';

import { ClockBadge, clockTextClass, DialMark, usePrivacyData } from '../components/bits';
import { isOfficer } from '../domain/access';
import { CLOCK_LABEL, shortLeft } from '../domain/clock';
import { nameOf, type PrivacyData } from '../domain/data';
import {
  buildDials,
  byUrgency,
  groupKey,
  isDimmed,
  lensGroups,
  ownerForView,
  todayFor,
  type Dial,
  type TowerLens,
  type ViewAs,
} from '../domain/tower';
import { TYPE_LABEL } from '../labels';
import type { RequestType, Schema } from '../model';
import { TowerScene } from '../tower/TowerScene';

const LENSES: LensOption<TowerLens>[] = [
  {
    value: 'state',
    label: 'Clock',
    swatch: 'conic-gradient(var(--ok-solid) 0 35%, var(--warn-solid) 0 60%, var(--orange-9) 0 80%, var(--bad-solid) 0)',
    description: 'On track, due soon, critical, overdue',
  },
  { value: 'type', label: 'Type', swatch: 'conic-gradient(var(--accent-9) 0 20%, var(--indigo-9) 0 45%, var(--crimson-9) 0 70%, var(--cyan-9) 0)', description: 'Access, erasure, … and breaches' },
  { value: 'owner', label: 'Next step', icon: <UserRound />, description: 'Who holds the next step' },
  { value: 'systems', label: 'Systems', icon: <Cog />, description: 'The system each clock is waiting on' },
  { value: 'stage', label: 'Stage', icon: <Layers />, description: 'New, verifying, in progress, ready' },
];
const LENS_LABEL: Record<TowerLens, string> = { state: 'Clock', type: 'Type', owner: 'Next step', systems: 'Waiting on', stage: 'Stage' };

const PREFS = 'x10:privacy-clock:tower';
function readPrefs(): { lens?: TowerLens; view?: StageView } {
  try {
    return JSON.parse(sessionStorage.getItem(PREFS) ?? '{}');
  } catch {
    return {};
  }
}

const dayFmt = (d: Date) => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);

export function TowerPage() {
  const { me, viewer } = useApp<Schema>();
  const state = usePrivacyData();
  const now = useNow(15_000);
  const location = useLocation();
  const navigate = useNavigate();
  const nav = (location.state as { focus?: string; flashTask?: string } | null) ?? null;
  const desktop = useIsDesktop();

  const prefs = useMemo(readPrefs, []);
  const [lens, setLens] = useState<TowerLens>(prefs.lens ?? 'state');
  const [view, setView] = useState<StageView>(prefs.view ?? 'stage');
  const [viewAs, setViewAs] = useState<ViewAs>(isOfficer(me) ? 'officer' : 'owner');
  const [focus, setFocus] = useState<string | null>(nav?.focus ?? null);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFS, JSON.stringify({ lens, view }));
    } catch {
      /* preferences are a convenience */
    }
  }, [lens, view]);

  const data = state.data;
  const dials = useMemo(() => (data ? buildDials(data, now).sort(byUrgency) : []), [data, now]);
  const allGroups = useMemo(() => (data ? lensGroups(lens, dials, data) : []), [lens, dials, data]);
  const floorGroups = useMemo(() => {
    const req = new Set(dials.filter((d) => d.kind === 'request').map((d) => groupKey(d, lens)));
    return allGroups.filter((g) => req.has(g.key));
  }, [allGroups, dials, lens]);
  const colorOf = useMemo(() => new Map(allGroups.map((g) => [g.key, g.color])), [allGroups]);
  const ownerSub = useMemo(() => (data ? ownerForView(data, viewer.sub) : null), [data, viewer.sub]);
  const officerName = data ? (data.people.find((p) => p.isAdmin)?.displayName ?? 'Privacy officer') : undefined;

  const today = useMemo(() => (data ? todayFor(dials, data, viewAs, ownerSub, now) : []), [dials, data, viewAs, ownerSub, now]);
  const todayItems: TodayItem[] = today.map((t) => ({ id: t.id, title: t.title, severity: t.severity, value: t.value, unit: t.unit, lens: LENS_LABEL[t.lens], meta: t.meta }));

  const focused = dials.find((d) => d.id === focus) ?? null;
  const order = dials.map((d) => d.id);
  const pick = (id: string) => setFocus((f) => (f === id ? null : id));
  const step = (dir: 1 | -1) => {
    if (!order.length) return;
    const i = focus ? order.indexOf(focus) : -1;
    setFocus(order[(i + dir + order.length) % order.length]);
  };
  const openPath = (d: Dial) => (d.kind === 'breach' ? `/escapement/${d.id}` : `/requests/${d.id}`);
  const open = () => focused && navigate(openPath(focused));
  const fly = () => {
    const w = q.trim().toLowerCase();
    if (!w) return;
    const hit = dials.find((d) => d.ref.toLowerCase().includes(w) || d.title.toLowerCase().includes(w));
    if (hit) {
      setFocus(hit.id);
      setView('stage');
    }
  };

  useHotkeys({
    'shift+?': () => setHelp(true),
    escape: () => setFocus(null),
    arrowright: () => step(1),
    arrowleft: () => step(-1),
    o: open,
    enter: open,
    '/': () => findRef.current?.focus(),
  });

  const viewAsSwitch = (
    <ViewAsSwitch<ViewAs>
      value={viewAs}
      onChange={setViewAs}
      glass={!desktop}
      className={desktop ? 'bg-gray-3' : undefined}
      options={[
        { value: 'officer', label: 'Officer', name: officerName },
        { value: 'owner', label: 'Owner', name: data && ownerSub ? nameOf(data, ownerSub) : undefined },
      ]}
    />
  );

  const breachCount = dials.filter((d) => d.kind === 'breach').length;
  const reqCount = dials.length - breachCount;
  const meta = focused ? (
    <FocusMeta d={focused} to={openPath(focused)} />
  ) : (
    <span className="num">{data ? `${breachCount} breach ${breachCount === 1 ? 'clock' : 'clocks'} · ${reqCount} request ${reqCount === 1 ? 'clock' : 'clocks'} running` : 'Winding the clocks…'}</span>
  );

  const stage =
    state.error && !data ? (
      <StageMessage icon={<RotateCcw />} title="The tower did not load" action={<Button onClick={() => void state.reload()}>Retry</Button>}>
        {state.error.message}
      </StageMessage>
    ) : !data ? (
      <StageMessage icon={<Spinner small />} title="Winding the clocks">
        Reading requests, breaches and tasks.
      </StageMessage>
    ) : dials.length === 0 ? (
      <StageMessage icon={<Clock3 />} title="Every clock has stopped" action={<LinkButton to="/intake" variant="primary">Log a request</LinkButton>}>
        No request or breach is open. New ones appear here with their legal clock running.
      </StageMessage>
    ) : (
      <TowerScene
        dials={dials}
        lens={lens}
        groups={floorGroups}
        focusId={focus}
        onPick={pick}
        isDim={(d) => isDimmed(d, viewAs, ownerSub)}
        rimOf={(d) => colorOf.get(groupKey(d, lens)) ?? 'var(--gray-8)'}
        now={now}
        flashTaskId={nav?.flashTask ?? null}
      />
    );

  return (
    <>
      <StagePage
        label="Clock tower"
        view={view}
        background="linear-gradient(180deg, var(--pc-sky-1) 0%, var(--pc-sky-2) 100%)"
        breadcrumb={focused ? [{ label: 'Tower', onClick: () => setFocus(null) }, { label: focused.kind === 'breach' ? 'Belfry' : (allGroups.find((g) => g.key === groupKey(focused, lens))?.label ?? 'Floor') }] : undefined}
        title={focused ? `${focused.ref} · ${focused.kind === 'breach' ? 'Breach' : TYPE_LABEL[focused.type as RequestType]}` : 'The clock tower'}
        meta={meta}
        topRight={
          <>
            <form
              className="relative"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                fly();
              }}
            >
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-faint" />
              <label htmlFor="pc-find" className="sr-only">
                Find a clock
              </label>
              <Input
                ref={findRef}
                id="pc-find"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a clock…"
                list="pc-find-list"
                className={view === 'stage' ? 'x-glass w-40 rounded-full! pl-8' : 'w-40 pl-8'}
              />
              <datalist id="pc-find-list">
                {dials.map((d) => (
                  <option key={d.id} value={d.ref} />
                ))}
              </datalist>
            </form>
            <IconButton label="Keyboard shortcuts" icon={<Keyboard />} onClick={() => setHelp(true)} variant="ghost" className={view === 'stage' ? 'x-glass rounded-full!' : undefined} />
            <ViewToggle value={view} onChange={setView} glass={view === 'stage'} stageLabel="Tower" listLabel="List" stageIcon={<TowerControl />} />
          </>
        }
        lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} showLabel={false} />}
        legend={data && <Legend title={LENS_LABEL[lens]} items={legendFor(lens, allGroups, dials)} collapsible defaultOpen={desktop} />}
        bottomRight={desktop ? undefined : viewAsSwitch}
        side={
          <div>
            {desktop && <div className="mb-3 px-1">{viewAsSwitch}</div>}
            <TodayPanel
              bare
              items={todayItems}
              date={dayFmt(now)}
              activeId={today.find((t) => t.focusId === focus)?.id ?? null}
              empty={viewAs === 'owner' ? 'No open tasks of yours.' : 'No clock needs you today.'}
              onSelect={(it) => {
                const t = today.find((x) => x.id === it.id);
                if (!t) return;
                setFocus(t.focusId);
                setLens(t.lens);
                setView('stage');
              }}
            />
          </div>
        }
        sideCount={todayItems.length}
        stage={stage}
        list={data ? <TowerList data={data} dials={dials} focus={focus} /> : null}
      />
      <ShortcutSheet open={help} onClose={() => setHelp(false)} />
    </>
  );
}

function legendFor(lens: TowerLens, groups: { key: string; label: string; color: string }[], dials: Dial[]): LegendItem[] {
  const items: LegendItem[] = groups.map((g) => ({
    label: g.label,
    color: g.color,
    shape: 'ring' as const,
    value: dials.filter((d) => groupKey(d, lens) === g.key).length,
  }));
  if (lens === 'state') {
    items.push(
      { label: 'Sweep: time used', color: 'color-mix(in oklab, var(--warn-solid) 40%, transparent)', shape: 'dot' },
      { label: 'Inner ring: tasks', color: 'var(--ok-solid)', shape: 'line' },
    );
  }
  return items;
}

function FocusMeta({ d, to }: { d: Dial; to: string }) {
  return (
    <>
      <ClockBadge clock={d.clock} />
      <span className={clockTextClass(d.clock.state)}>{d.words}</span>
      <span>{d.stageLabel}</span>
      <span className="flex w-full flex-wrap gap-2 pt-1.5">
        <LinkButton to={to} size="sm" variant="primary" data-testid="focus-open">
          {d.kind === 'breach' ? 'Open in Escapement' : 'Open the request'}
        </LinkButton>
        <LinkButton to={`/logbook?item=${d.kind}:${d.id}`} size="sm" icon={<BookOpenText />}>
          Logbook
        </LinkButton>
      </span>
    </>
  );
}

/* ------------------------------------------------------------------ list (same data, sortable) */

type SortKey = 'ref' | 'type' | 'stage' | 'state' | 'left' | 'due' | 'next' | 'tasks';

function TowerList({ data, dials, focus }: { data: PrivacyData; dials: Dial[]; focus: string | null }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'left', dir: 1 });
  const rows = useMemo(() => {
    const val = (d: Dial): string | number => {
      switch (sort.key) {
        case 'ref':
          return d.ref;
        case 'type':
          return d.kind === 'breach' ? 'Breach' : TYPE_LABEL[d.type as RequestType];
        case 'stage':
          return d.stageLabel;
        case 'state':
          return ['overdue', 'critical', 'due_soon', 'on_track', 'late', 'met'].indexOf(d.clock.state);
        case 'left':
          return d.clock.running ? d.clock.leftMs : Number.MAX_SAFE_INTEGER;
        case 'due':
          return Date.parse(d.clock.deadline);
        case 'next':
          return d.nextName;
        case 'tasks':
          return d.tally.total ? d.tally.done / d.tally.total : -1;
      }
    };
    return [...dials].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir || a.ref.localeCompare(b.ref);
    });
  }, [dials, sort]);
  const head = (key: SortKey, label: string, numeric?: boolean) => {
    const active = sort.key === key;
    return (
      <Th numeric={numeric} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={`inline-flex cursor-pointer items-center gap-1 font-[inherit] ${active ? 'text-fg' : ''}`}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))}
        >
          {label}
          {active && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
        </button>
      </Th>
    );
  };
  return (
    <>
      <TableWrap label="Open clocks">
        <Table data-testid="tower-list" className="min-w-[860px]">
          <thead>
            <tr>
              {head('ref', 'Clock')}
              {head('type', 'Type')}
              {head('stage', 'Stage')}
              {head('state', 'State')}
              {head('left', 'Time left', true)}
              {head('due', 'Deadline', true)}
              {head('next', 'Next step')}
              {head('tasks', 'Tasks', true)}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <Tr key={d.id} selected={d.id === focus} data-testid="tower-list-row" data-ref={d.ref}>
                <Td>
                  <span className="flex min-w-[200px] items-center gap-3">
                    <DialMark d={d} size={34} />
                    <span className="min-w-0">
                      <Link to={d.kind === 'breach' ? `/escapement/${d.id}` : `/requests/${d.id}`} className="block font-mono text-ui font-semibold text-fg tabular-nums">
                        {d.ref}
                      </Link>
                      <span className="block max-w-[220px] truncate text-xs text-muted">{d.title}</span>
                    </span>
                  </span>
                </Td>
                <Td muted>{d.kind === 'breach' ? 'Breach' : TYPE_LABEL[d.type as RequestType]}</Td>
                <Td muted>{d.stageLabel}</Td>
                <Td>
                  <ClockBadge clock={d.clock} />
                </Td>
                <Td numeric className={clockTextClass(d.clock.state)}>
                  {d.clock.running ? (d.clock.leftMs >= 0 ? shortLeft(d.clock.leftMs, d.kind) : `${shortLeft(-d.clock.leftMs, d.kind)} over`) : CLOCK_LABEL[d.clock.state]}
                </Td>
                <Td numeric muted>
                  {d.kind === 'breach' ? new Date(d.clock.deadline).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : formatDate(d.clock.deadline)}
                </Td>
                <Td muted>{d.nextName}</Td>
                <Td numeric>
                  {d.tally.done}/{d.tally.total}
                  {d.tally.blocked > 0 && <span className="ml-1.5 text-bad-text">· {d.tally.blocked} blocked</span>}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <p className="mt-3 text-ui text-muted">
        {data.requests.length - dials.filter((d) => d.kind === 'request').length} closed or refused requests and {data.breaches.filter((b) => b.status === 'closed').length} closed breaches are in the Almanac and the Logbook.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ keyboard */

const KEYS: [string[], string][] = [
  [['1', '–', '5'], 'Lens: clock, type, next step, systems, stage'],
  [['V'], 'View as privacy officer or system owner'],
  [['L'], 'Tower or list'],
  [['←', '→'], 'Step from clock to clock'],
  [['O'], 'Open the focused clock'],
  [['/'], 'Find a clock'],
  [['Esc'], 'Back to the whole tower'],
  [['?'], 'This list'],
];

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2.5 text-sm">
        {KEYS.map(([keys, what]) => (
          <div key={what} className="contents">
            <dt className="flex items-center gap-1">{keys.map((k) => (k === '–' ? <span key={k} className="text-faint">–</span> : <Kbd key={k}>{k}</Kbd>))}</dt>
            <dd className="m-0 text-muted">{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

