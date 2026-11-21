/**
 * The clock tower (SVG). A stone tower lit from the upper left: breach clocks in the belfry under the roof, request
 * clocks on floors below, one floor per lens group, a master clock in the gable showing the time every dial is
 * measured against. The camera (the viewBox) fits the tower to the stage, flies to the focused dial, and can be
 * dragged and zoomed with a mouse. No WebGL: the same scene works everywhere.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';

import { useIsDesktop, useReducedMotion } from '@x10/shared/ui';

import { CLOCK_LABEL, shortLeft } from '../domain/clock';
import { STATE_COLOR, type Dial, type LensGroup, type TowerLens } from '../domain/tower';
import { TYPE_LABEL } from '../labels';
import type { RequestType, TaskStatus } from '../model';
import { DialFace } from './Dial';
import { BAY_GAP, bestCols, DEPTH, type Placed, type TowerLayout } from './geometry';

type Box = { x: number; y: number; w: number; h: number };
type Insets = { t: number; r: number; b: number; l: number };

function fitBox(c: Box, w: number, h: number, i: Insets): Box {
  const aw = Math.max(1, w - i.l - i.r);
  const ah = Math.max(1, h - i.t - i.b);
  const s = Math.min(aw / c.w, ah / c.h);
  return { x: c.x - i.l / s - (aw / s - c.w) / 2, y: c.y - i.t / s - (ah / s - c.h) / 2, w: w / s, h: h / s };
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 900, h: 640 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function useCamera(target: Box, reduced: boolean) {
  const [box, setBox] = useState(target);
  const cur = useRef(target);
  const key = `${target.x.toFixed(1)},${target.y.toFixed(1)},${target.w.toFixed(1)},${target.h.toFixed(1)}`;
  useEffect(() => {
    if (reduced) {
      cur.current = target;
      setBox(target);
      return;
    }
    const from = cur.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 820);
      const k = ease(t);
      const b = { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k };
      cur.current = b;
      setBox(b);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
  const jump = (b: Box) => {
    cur.current = b;
    setBox(b);
  };
  return [box, jump] as const;
}

export interface TowerSceneProps {
  dials: Dial[];
  lens: TowerLens;
  groups: LensGroup[];
  focusId: string | null;
  onPick: (id: string) => void;
  isDim: (d: Dial) => boolean;
  rimOf: (d: Dial) => string;
  now: Date;
  /** Task id that just turned done: its segment flashes. */
  flashTaskId?: string | null;
}

export function TowerScene(props: TowerSceneProps) {
  const { dials, lens, groups, focusId, onPick } = props;
  const reduced = useReducedMotion();
  const desktop = useIsDesktop();
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const insets: Insets = desktop ? { t: 74, r: 24, b: 72, l: 24 } : { t: 10, r: 6, b: 10, l: 6 };
  const freeW = size.w - insets.l - insets.r;
  const freeH = size.h - insets.t - insets.b;
  const layout = useMemo(() => bestCols(dials, lens, groups, freeW, freeH), [dials, lens, groups, freeW, freeH]);
  const focus = focusId ? layout.placed.get(focusId) : undefined;

  const [userBox, setUserBox] = useState<Box | null>(null);
  useEffect(() => setUserBox(null), [focusId, lens]);

  const target: Box = useMemo(() => {
    if (!focus) return fitBox(layout.bounds, size.w, size.h, insets);
    const w = focus.kind === 'breach' ? 820 : 720;
    const h = focus.kind === 'breach' ? 560 : 500;
    return fitBox({ x: focus.x - w / 2, y: focus.y - h / 2 + 30, w, h }, size.w, size.h, insets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, layout.bounds, size.w, size.h, desktop]);
  const [cam, jump] = useCamera(userBox ?? target, reduced);

  // Hands start at twelve and sweep to their place after the first paint.
  const [armed, setArmed] = useState(reduced);
  useEffect(() => {
    if (armed) return;
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)));
    return () => cancelAnimationFrame(t);
  }, [armed]);

  // Drag to pan, wheel to zoom (mouse only; touch keeps scrolling the page).
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, box: cam, moved: false };
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const el = svgRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) el.setPointerCapture(e.pointerId);
    d.moved = true;
    const k = d.box.w / el.clientWidth;
    const b = { ...d.box, x: d.box.x - dx * k, y: d.box.y - dy * k };
    setUserBox(b);
    jump(b);
  };
  const onPointerUp = () => {
    if (drag.current?.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    }
    drag.current = null;
  };
  const camRef = useRef(cam);
  camRef.current = cam;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const b = camRef.current;
      const z = Math.exp(Math.max(-0.4, Math.min(0.4, e.deltaY * 0.0015)));
      const w = Math.max(260, Math.min(layout.bounds.w * 2.4, b.w * z));
      const h = (b.h / b.w) * w;
      const px = b.x + ((e.clientX - r.left) / r.width) * b.w;
      const py = b.y + ((e.clientY - r.top) / r.height) * b.h;
      const nb = { x: px - ((px - b.x) / b.w) * w, y: py - ((py - b.y) / b.h) * h, w, h };
      setUserBox(nb);
      jump(nb);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.bounds.w]);

  // Hover card.
  const [hover, setHover] = useState<string | null>(null);
  const hovered = hover ? dials.find((d) => d.id === hover) : null;
  const hp = hover ? layout.placed.get(hover) : undefined;
  const scale = size.w / cam.w;

  const sorted = useMemo(() => [...layout.placed.values()].sort((a, b) => a.index - b.index), [layout]);
  const byId = useMemo(() => new Map(dials.map((d) => [d.id, d])), [dials]);

  return (
    <div ref={wrapRef} className="absolute inset-y-0 left-0 h-full w-[calc(100%-var(--side-w,0px))]" data-testid="tower">
      <svg
        ref={svgRef}
        viewBox={`${cam.x} ${cam.y} ${cam.w} ${cam.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 size-full touch-pan-y select-none"
        role="group"
        aria-label={`Clock tower: ${dials.filter((d) => d.kind === 'breach').length} breach clocks and ${dials.filter((d) => d.kind === 'request').length} request clocks`}
        data-lens={lens}
        data-cols={layout.cols}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (suppressClick.current) e.stopPropagation();
        }}
      >
        <TowerStructure layout={layout} now={props.now} reduced={reduced} />
        {focus && <Spotlight p={focus} reduced={reduced} />}
        {sorted.map((p) => {
          const d = byId.get(p.id);
          if (!d) return null;
          return (
            <PlacedDial
              key={p.id}
              d={d}
              p={p}
              rim={props.rimOf(d)}
              dim={props.isDim(d)}
              focused={p.id === focusId}
              armed={armed}
              flashTaskId={props.flashTaskId ?? null}
              onPick={onPick}
              onHover={setHover}
            />
          );
        })}
      </svg>
      {hovered && hp && (
        <div
          className="x-glass pointer-events-none absolute z-10 w-[240px] rounded-xl px-3 py-2.5 text-ui shadow-[var(--shadow-float)]"
          style={{
            left: Math.max(8, Math.min(size.w - 248, (hp.x - cam.x) * scale - 120)),
            top: Math.max(8, (hp.y - cam.y - hp.r - 14) * scale - 84),
          }}
          role="tooltip"
          data-testid="dial-tooltip"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs font-semibold num">{hovered.ref}</span>
            <span className="text-xs text-muted">{hovered.kind === 'breach' ? 'Breach' : TYPE_LABEL[hovered.type as RequestType]}</span>
          </div>
          <div className="mt-1 text-sm font-semibold leading-5" style={{ color: hovered.clock.running ? undefined : 'var(--info-text)' }}>
            {hovered.words}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full" style={{ background: STATE_COLOR[hovered.clock.state] }} />
              {CLOCK_LABEL[hovered.clock.state]}
            </span>
            <span>{hovered.stageLabel}</span>
            <span>Next: {hovered.nextName}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ dial on the tower */

const PlacedDial = memo(function PlacedDial({
  d,
  p,
  rim,
  dim,
  focused,
  armed,
  flashTaskId,
  onPick,
  onHover,
}: {
  d: Dial;
  p: Placed;
  rim: string;
  dim: boolean;
  focused: boolean;
  armed: boolean;
  flashTaskId: string | null;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const hex = d.kind === 'breach';
  const totalDays = d.clock.totalMs / 86_400_000;
  const tasks: TaskStatus[] = d.tasks.map((t) => t.status);
  const flashIndex = flashTaskId ? d.tasks.findIndex((t) => t.id === flashTaskId) : -1;
  const state = d.clock.state;
  const label = `${d.ref}, ${hex ? 'breach' : TYPE_LABEL[d.type as RequestType].toLowerCase() + ' request'}, ${d.words}, ${CLOCK_LABEL[state].toLowerCase()}, ${d.tally.done} of ${d.tally.total} tasks done`;
  const timeColor = state === 'overdue' || state === 'late' ? 'var(--bad-text)' : state === 'critical' ? 'var(--orange-11)' : state === 'due_soon' ? 'var(--warn-text)' : state === 'met' ? 'var(--info-text)' : 'var(--world-ink-muted)';
  const left = d.clock.running ? (d.clock.leftMs >= 0 ? `${shortLeft(d.clock.leftMs, d.kind)} left` : `${shortLeft(-d.clock.leftMs, d.kind)} over`) : d.clock.stopReason === 'notified' ? 'Notified' : d.clock.stopReason === 'documented' ? 'Documented' : 'Stopped';
  return (
    <g className="pc-place" style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: dim ? 0.26 : 1, filter: dim ? 'saturate(0.2)' : undefined }}>
      <g
        className="pc-dial"
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={focused}
        data-testid={hex ? 'breach-dial' : 'request-dial'}
        data-ref={d.ref}
        data-state={state}
        data-focused={focused ? 'true' : 'false'}
        data-dimmed={dim ? 'true' : 'false'}
        data-done={d.tally.done}
        data-total={d.tally.total}
        onClick={() => onPick(d.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick(d.id);
          }
        }}
        onPointerEnter={() => onHover(d.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(d.id)}
        onBlur={() => onHover(null)}
      >
        {/* hit area */}
        <rect x={hex ? -110 : -68} y={-(p.r + 16)} width={hex ? 220 : 136} height={p.r * 2 + (hex ? 104 : 78)} fill="transparent" />
        <g className="pc-focus-ring">
          {hex ? null : <circle r={p.r + 20} fill="none" stroke="var(--focus, var(--accent-9))" strokeWidth={2.5} />}
          {hex && <circle r={p.r + 26} fill="none" stroke="var(--focus, var(--accent-9))" strokeWidth={2.5} />}
        </g>
        {focused && <circle className="pc-pulse" r={p.r + (hex ? 30 : 22)} fill="none" stroke="var(--accent-9)" strokeWidth={2.5} />}
        <g className="pc-lift">
          <DialFace
            id={d.id}
            kind={d.kind}
            type={d.type}
            r={p.r}
            fraction={d.clock.fraction}
            state={state}
            running={d.clock.running}
            rim={rim}
            sweep={STATE_COLOR[state]}
            tasks={tasks}
            ticks={hex ? 72 : totalDays}
            majorEvery={hex ? 12 : 7}
            originalDueFraction={d.originalDueFraction}
            armed={armed}
            index={p.index}
            flashTask={flashIndex >= 0 ? flashIndex : null}
          />
        </g>
        {/* name plate */}
        {hex ? (
          <g transform={`translate(0 ${p.r + 24})`}>
            <rect x={-104} y={0} width={208} height={d.late ? 70 : 54} rx={9} fill="var(--pc-plate)" stroke="var(--pc-plate-line)" />
            <text x={-92} y={21} fill="var(--world-ink)" style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
              {d.ref}
            </text>
            <text x={92} y={21} textAnchor="end" fill={timeColor} style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
              {left}
            </text>
            <text x={-92} y={41} fill="var(--world-ink-muted)" style={{ fontSize: 12 }}>
              {d.title.length > 30 ? `${d.title.slice(0, 29)}…` : d.title}
            </text>
            {d.late && (
              <text x={-92} y={60} fill="var(--bad-text)" style={{ fontSize: 11.5, fontWeight: 600 }}>
                Late: reasons for delay required
              </text>
            )}
          </g>
        ) : (
          <g transform={`translate(0 ${p.r + 18})`}>
            <rect x={-62} y={0} width={124} height={42} rx={8} fill="var(--pc-plate)" stroke="var(--pc-plate-line)" />
            <text x={0} y={17} textAnchor="middle" fill="var(--world-ink)" style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
              {d.ref}
            </text>
            <text x={0} y={34} textAnchor="middle" fill={timeColor} style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
              {left}
            </text>
          </g>
        )}
      </g>
    </g>
  );
});

function Spotlight({ p, reduced }: { p: Placed; reduced: boolean }) {
  const w = p.kind === 'breach' ? 120 : 84;
  return (
    <g pointerEvents="none" className={reduced ? undefined : 'pc-beam'}>
      <defs>
        <linearGradient id="pc-spot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-9)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--accent-9)" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <polygon points={`${p.x - 24},${p.y - 420} ${p.x + 24},${p.y - 420} ${p.x + w},${p.y + p.r} ${p.x - w},${p.y + p.r}`} fill="url(#pc-spot)" />
    </g>
  );
}

/* ------------------------------------------------------------------ the tower itself */

const TowerStructure = memo(function TowerStructure({ layout, now, reduced }: { layout: TowerLayout; now: Date; reduced: boolean }) {
  const W = layout.width;
  const H = layout.height;
  const R = layout.roofH;
  const D = DEPTH;
  const BH = layout.belfryH;
  const ledge = (y: number, key: string) => (
    <g key={key}>
      <polygon points={`${W + 10},${y} ${W + 10 + D},${y - D / 2} ${W + 10 + D},${y - D / 2 + 10} ${W + 10},${y + 10}`} fill="var(--pc-side-lo)" />
      <polygon points={`-10,${y} ${W + 10},${y} ${W + 10 + D},${y - D / 2} ${-10 + D},${y - D / 2}`} fill="var(--pc-ledge)" />
      <rect x={-10} y={y} width={W + 20} height={10} fill="var(--pc-stone-hi)" />
      <rect x={-10} y={y + 10} width={W + 20} height={6} fill="var(--pc-ledge-shadow)" opacity={0.6} />
      <g fill="var(--pc-stone-hi)">
        {Array.from({ length: Math.floor((W - 8) / 16) }, (_, i) => (
          <rect key={i} x={6 + i * 16} y={y + 10} width={9} height={6} />
        ))}
      </g>
    </g>
  );
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id="pc-front" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0%" stopColor="var(--pc-stone-hi)" />
          <stop offset="60%" stopColor="var(--pc-stone)" />
          <stop offset="100%" stopColor="var(--pc-stone-lo)" />
        </linearGradient>
        <linearGradient id="pc-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pc-side-hi)" />
          <stop offset="100%" stopColor="var(--pc-side-lo)" />
        </linearGradient>
        <linearGradient id="pc-roof" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--pc-roof-hi)" />
          <stop offset="100%" stopColor="var(--pc-roof-lo)" />
        </linearGradient>
        <linearGradient id="pc-belfry" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pc-belfry-2)" />
          <stop offset="100%" stopColor="var(--pc-belfry)" />
        </linearGradient>
        <linearGradient id="pc-lightwash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--pc-light)" />
          <stop offset="70%" stopColor="var(--pc-light)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="pc-groundshadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--pc-shadow)" />
          <stop offset="100%" stopColor="var(--pc-shadow)" stopOpacity="0" />
        </radialGradient>
        <pattern id="pc-blocks" width="72" height="36" patternUnits="userSpaceOnUse">
          <path d="M0 0.5H72M0 18.5H72M24 0V18M60 18V36" stroke="var(--pc-mortar)" strokeWidth="1" fill="none" />
        </pattern>
        <pattern id="pc-shingles" width="22" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 13.5H22M11 0V7M0 7H22M0 7V14M22 0V7" stroke="rgb(0 0 0 / 0.14)" strokeWidth="1" fill="none" />
        </pattern>
        <radialGradient id="pc-belfry-glow" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="var(--accent-9)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent-9)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sky light from the upper left (sun by day, moon by night) and the lit ground at the tower's foot */}
      <radialGradient id="pc-sunglow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--pc-sun)" />
        <stop offset="100%" stopColor="var(--pc-sun)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="pc-footglow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--pc-foot)" />
        <stop offset="100%" stopColor="var(--pc-foot)" stopOpacity="0" />
      </radialGradient>
      <circle cx={-W * 0.25} cy={-R - 60} r={Math.max(700, W * 1.25)} fill="url(#pc-sunglow)" />
      {/* ground and the tower's shadow, cast down and right */}
      <ellipse cx={W / 2 + 70} cy={H + 44} rx={W * 0.95} ry={44} fill="url(#pc-groundshadow)" />
      <rect x={-2000} y={H + 34} width={4000 + W} height={600} fill="var(--pc-ground)" opacity={0.65} />
      <rect x={-2000} y={H + 34} width={4000 + W} height={2} fill="var(--pc-ground-2)" />
      <ellipse cx={W / 2} cy={H + 40} rx={W * 0.9} ry={70} fill="url(#pc-footglow)" />

      {/* side face (depth) */}
      <polygon points={`${W},${-6} ${W + D},${-6 - D / 2} ${W + D},${H + 18 - D / 2} ${W},${H + 18}`} fill="url(#pc-side)" />
      {/* front face */}
      <rect x={0} y={-6} width={W} height={H + 24} fill="url(#pc-front)" />
      <rect x={0} y={-6} width={W} height={H + 24} fill="url(#pc-blocks)" />
      {/* quoins: alternating corner stones */}
      {Array.from({ length: Math.ceil((H + 24) / 30) }, (_, i) => {
        const y0 = -6 + i * 30;
        const h = Math.min(28, H + 18 - y0);
        if (h <= 0) return null;
        const wide = i % 2 === 0 ? 24 : 15;
        return (
          <g key={i}>
            <rect x={0} y={y0} width={wide} height={h} fill="var(--pc-stone-hi)" stroke="var(--pc-mortar)" />
            <rect x={W - wide} y={y0} width={wide} height={h} fill="var(--pc-stone-lo)" stroke="var(--pc-mortar)" />
          </g>
        );
      })}

      {/* belfry: an arched opening holding the breach clocks */}
      <path
        d={`M${26},${BH - 18} L${26},${58} A${(W - 52) / 2},${44} 0 0 1 ${W - 26},${58} L${W - 26},${BH - 18} Z`}
        fill="url(#pc-belfry)"
        stroke="var(--pc-stone-lo)"
        strokeWidth={6}
      />
      <path d={`M${26},${BH - 18} L${26},${58} A${(W - 52) / 2},${44} 0 0 1 ${W - 26},${58} L${W - 26},${BH - 18} Z`} fill="url(#pc-belfry-glow)" />
      {ledge(BH - 18, 'belfry')}

      {/* rows: a ledge on top, a bay per lens group, pilasters between bays */}
      {layout.rows.map((row, i) => (
        <g key={`row-${i}`}>
          {i > 0 && ledge(row.y - 8, `l-${i}`)}
          {row.bays.map((b, j) => (
            <g key={`${b.key}-${j}`} data-testid="tower-bay" data-group={b.key}>
              {j > 0 && (
                <g>
                  <rect x={b.x0 - BAY_GAP / 2 - 5} y={row.y + 4} width={10} height={row.h - 12} fill="var(--pc-stone-hi)" />
                  <rect x={b.x0 - BAY_GAP / 2 + 3} y={row.y + 4} width={3} height={row.h - 12} fill="var(--pc-stone-lo)" />
                </g>
              )}
              <g transform={`translate(${b.x0 + 12} ${row.y + 24})`}>
                <circle cx={4} cy={-4.5} r={5} fill={b.color} />
                <text x={15} y={0} fill="var(--world-ink-muted)" style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', fontFamily: 'var(--font-mono, monospace)' }}>
                  {(b.first ? b.label : `${b.label} (cont.)`).toUpperCase()}
                  {b.first && (
                    <tspan dx={8} fill="var(--world-ink)">
                      {b.total}
                    </tspan>
                  )}
                </text>
              </g>
            </g>
          ))}
        </g>
      ))}

      {/* plinth */}
      <rect x={-16} y={H + 16} width={W + 32} height={12} fill="var(--pc-stone-hi)" />
      <polygon points={`${W + 16},${H + 16} ${W + 16 + D},${H + 16 - D / 2} ${W + 16 + D},${H + 28 - D / 2} ${W + 16},${H + 28}`} fill="var(--pc-side-lo)" />
      <rect x={-30} y={H + 28} width={W + 60} height={10} fill="var(--pc-stone)" />
      <polygon points={`${W + 30},${H + 28} ${W + 30 + D},${H + 28 - D / 2} ${W + 30 + D},${H + 38 - D / 2} ${W + 30},${H + 38}`} fill="var(--pc-side-lo)" />

      {/* roof */}
      <polygon points={`${W + 16},${-6} ${W / 2},${-R} ${W / 2 + D},${-R - D / 2} ${W + 16 + D},${-6 - D / 2}`} fill="var(--pc-roof-lo)" />
      <polygon points={`-16,${-6} ${W / 2},${-R} ${W + 16},${-6}`} fill="url(#pc-roof)" />
      <polygon points={`-16,${-6} ${W / 2},${-R} ${W + 16},${-6}`} fill="url(#pc-shingles)" />
      <rect x={-18} y={-10} width={W + 36} height={8} rx={2} fill="var(--pc-ledge)" />
      <line x1={W / 2} y1={-R} x2={W / 2} y2={-R - 34} stroke="var(--pc-brass-lo)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={W / 2} cy={-R - 8} r={6} fill="url(#pc-brass)" />

      <MasterClock cx={W / 2} cy={-R * 0.38} r={Math.min(52, R * 0.27)} now={now} reduced={reduced} />

      {/* daylight from the upper left */}
      <rect x={0} y={-6} width={W} height={H + 24} fill="url(#pc-lightwash)" />
    </g>
  );
});

/** The tower's own clock: the time every dial is measured against, with a live second hand. */
function MasterClock({ cx, cy, r, now, reduced }: { cx: number; cy: number; r: number; now: Date; reduced: boolean }) {
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();
  const hourA = ((h + m / 60) / 12) * 360;
  const minA = (m / 60) * 360;
  return (
    <g transform={`translate(${cx} ${cy})`} data-testid="master-clock">
      <circle r={r + 9} fill="url(#pc-niche)" />
      <circle r={r + 5} fill="url(#pc-brass)" stroke="var(--pc-brass-lo)" />
      <circle r={r + 1} fill="none" stroke="var(--accent-9)" strokeWidth={3} />
      <circle r={r} fill="url(#pc-face)" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const major = i % 3 === 0;
        return (
          <line
            key={i}
            x1={Math.sin(a) * (r - 4)}
            y1={-Math.cos(a) * (r - 4)}
            x2={Math.sin(a) * (r - (major ? 11 : 8))}
            y2={-Math.cos(a) * (r - (major ? 11 : 8))}
            stroke="var(--pc-ink)"
            strokeWidth={major ? 2.4 : 1.2}
            strokeLinecap="round"
          />
        );
      })}
      <line x1={0} y1={4} x2={0} y2={-r * 0.5} stroke="var(--pc-ink)" strokeWidth={3.2} strokeLinecap="round" transform={`rotate(${hourA})`} />
      <line x1={0} y1={5} x2={0} y2={-r * 0.78} stroke="var(--pc-ink)" strokeWidth={2.2} strokeLinecap="round" transform={`rotate(${minA})`} />
      <g transform={`rotate(${reduced ? (s / 60) * 360 : 0})`}>
        <g className={reduced ? undefined : 'pc-seconds'} style={reduced ? undefined : { animationDelay: `-${s}s` }}>
          <line x1={0} y1={7} x2={0} y2={-r * 0.86} stroke="var(--accent-9)" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      </g>
      <circle r={3} fill="url(#pc-brass)" />
      <ellipse cx={-r * 0.3} cy={-r * 0.4} rx={r * 0.8} ry={r * 0.45} transform={`rotate(-28 ${-r * 0.3} ${-r * 0.4})`} fill="url(#pc-glass)" />
    </g>
  );
}
