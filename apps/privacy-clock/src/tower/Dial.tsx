/**
 * One dial on the tower. Round for requests, a larger hexagon for breaches. The sweep is the share of the legal time
 * already used; the hand points at it; the rim carries the lens colour; the inner ring has one segment per task
 * (done, open, blocked); overdue dials crack and their hand ticks red.
 */
import { memo, type ReactNode } from 'react';
import { Eraser, FileSearch, Hand, Lock, PackageOpen, PenLine, ShieldAlert } from 'lucide-react';

import type { ClockState } from '../domain/clock';
import type { RequestType, TaskStatus } from '../model';
import { arcPath, crackPaths, hexPoints, polar } from './geometry';

export const TYPE_GLYPH: Record<RequestType | 'breach', typeof Eraser> = {
  access: FileSearch,
  erasure: Eraser,
  rectification: PenLine,
  portability: PackageOpen,
  objection: Hand,
  restriction: Lock,
  breach: ShieldAlert,
};

/** Shared gradients and filters, rendered once at the app root. */
export function DialDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <radialGradient id="pc-face" cx="42%" cy="36%" r="75%">
          <stop offset="0%" stopColor="var(--pc-face-hi)" />
          <stop offset="100%" stopColor="var(--pc-face-lo)" />
        </radialGradient>
        <linearGradient id="pc-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--pc-brass-hi)" />
          <stop offset="45%" stopColor="var(--pc-brass)" />
          <stop offset="100%" stopColor="var(--pc-brass-lo)" />
        </linearGradient>
        <linearGradient id="pc-brass-rev" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--pc-brass-hi)" />
          <stop offset="55%" stopColor="var(--pc-brass)" />
          <stop offset="100%" stopColor="var(--pc-brass-lo)" />
        </linearGradient>
        <radialGradient id="pc-niche" cx="60%" cy="65%" r="70%">
          <stop offset="0%" stopColor="var(--pc-niche)" />
          <stop offset="100%" stopColor="var(--pc-niche-lo)" />
        </radialGradient>
        <linearGradient id="pc-glass" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="var(--pc-glass)" />
          <stop offset="55%" stopColor="var(--pc-glass)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="pc-glow" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="var(--pc-glow)" />
          <stop offset="100%" stopColor="var(--pc-glow)" stopOpacity="0" />
        </radialGradient>
        <filter id="pc-drop" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="var(--pc-shadow)" floodOpacity="1" />
        </filter>
        <filter id="pc-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
    </svg>
  );
}

export interface DialFaceProps {
  id: string;
  kind: 'request' | 'breach';
  type: RequestType | 'breach';
  r: number;
  /** Elapsed share of the legal time (0..1, above 1 when overdue). */
  fraction: number;
  state: ClockState;
  running: boolean;
  /** Lens colour on the rim. */
  rim: string;
  /** Clock-state colour of the sweep. */
  sweep: string;
  tasks: TaskStatus[];
  /** Ticks on the face: days for requests, hours for breaches. */
  ticks: number;
  majorEvery: number;
  originalDueFraction?: number | null;
  /** Hands start at twelve and sweep to their place once armed (first paint). */
  armed?: boolean;
  /** Index for staggered motion. */
  index?: number;
  /** A task flipped to done since the last data load: flash it. */
  flashTask?: number | null;
  labels?: boolean;
  children?: ReactNode;
}

/** The dial itself, centred on (0,0). */
export const DialFace = memo(function DialFace(p: DialFaceProps) {
  const { r, kind } = p;
  const hex = kind === 'breach';
  const over = p.state === 'overdue';
  const frac = Math.min(1, Math.max(0, p.fraction));
  const angle = (p.armed === false ? 0 : over ? 1 : frac) * 360;
  const delay = `${(p.index ?? 0) * 70}ms`;
  const sweepR = r * 0.5;
  const circ = 2 * Math.PI * sweepR;
  const shown = p.armed === false ? 0 : frac;
  const clip = `pc-clip-${p.id}`;
  const Glyph = TYPE_GLYPH[p.type];
  const inner = r - (hex ? 9 : 6);
  const tickN = Math.max(1, Math.min(hex ? 72 : 60, Math.round(p.ticks)));
  const ringR = r * (hex ? 0.3 : 0.32);
  const nTasks = p.tasks.length;
  const facePath = hex ? <polygon points={hexPoints(r)} /> : <circle r={r} />;

  return (
    <g>
      <defs>
        <clipPath id={clip}>{facePath}</clipPath>
      </defs>
      {/* niche: the dial is set into the stone */}
      {hex ? (
        <polygon points={hexPoints(r + 16)} fill="url(#pc-niche)" />
      ) : (
        <circle r={r + 13} fill="url(#pc-niche)" />
      )}
      {/* warm light from inside the dial (dark mode) */}
      {hex ? <polygon points={hexPoints(r + 26)} fill="url(#pc-glow)" /> : <circle r={r + 22} fill="url(#pc-glow)" />}
      {/* bezel */}
      <g filter="url(#pc-drop)">
        {hex ? (
          <>
            <polygon points={hexPoints(r + 9)} fill="url(#pc-brass)" stroke="var(--pc-brass-lo)" strokeWidth={1} />
            <polygon points={hexPoints(r + 4)} fill="url(#pc-brass-rev)" />
          </>
        ) : (
          <>
            <circle r={r + 6.5} fill="url(#pc-brass)" stroke="var(--pc-brass-lo)" strokeWidth={0.8} />
            <circle r={r + 2.5} fill="url(#pc-brass-rev)" />
          </>
        )}
      </g>
      {/* rim: the lens colour */}
      {hex ? (
        <polygon className="pc-rim" points={hexPoints(r + 1.5)} fill="none" stroke={p.rim} strokeWidth={4.5} strokeLinejoin="round" />
      ) : (
        <circle className="pc-rim" r={r + 1} fill="none" stroke={p.rim} strokeWidth={4} />
      )}
      {/* enamel face */}
      {hex ? <polygon points={hexPoints(r - 1)} fill="url(#pc-face)" /> : <circle r={r - 1} fill="url(#pc-face)" />}

      <g clipPath={`url(#${clip})`}>
        {/* sweep: time used */}
        <circle
          className="pc-sweep"
          r={sweepR}
          fill="none"
          stroke={over ? 'var(--bad-solid)' : p.sweep}
          strokeOpacity={over ? 0.3 : 0.34}
          strokeWidth={r * (hex ? 1.25 : 1)}
          strokeDasharray={`${(over ? 1 : shown) * circ} ${circ}`}
          transform="rotate(-90)"
          style={{ transitionDelay: delay }}
        />
        {/* ticks */}
        {Array.from({ length: tickN }, (_, i) => {
          const f = i / tickN;
          const major = i % p.majorEvery === 0;
          const [x0, y0] = polar(inner, f);
          const [x1, y1] = polar(inner - (major ? (hex ? 9 : 7) : hex ? 4.5 : 3.5), f);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--pc-tick)" strokeWidth={major ? 1.6 : 0.8} strokeLinecap="round" />;
        })}
        {/* hour labels on breach dials */}
        {hex &&
          p.labels !== false &&
          [24, 48, 72].map((h) => {
            const [x, y] = polar(inner - 20, (h % 72) / 72);
            return (
              <text key={h} x={x} y={y + 3.5} textAnchor="middle" fill="var(--pc-ink-muted)" style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                {h}
              </text>
            );
          })}
        {/* edge of the sweep */}
        {!over && shown > 0.002 && (
          <path d={arcPath(inner - 1, 0, shown)} fill="none" stroke={p.sweep} strokeWidth={2} strokeLinecap="round" opacity={0.9} />
        )}
        {/* the original due date on an extended request */}
        {p.originalDueFraction != null && (
          <g>
            {(() => {
              const [x0, y0] = polar(inner + 1, p.originalDueFraction);
              const [x1, y1] = polar(inner - 12, p.originalDueFraction);
              return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--pc-ink)" strokeWidth={2} strokeDasharray="2 2" />;
            })()}
          </g>
        )}
        {/* cracks */}
        {over && (
          <g stroke="var(--pc-crack)" strokeWidth={1.1} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {crackPaths(p.id, r).map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        )}
      </g>

      {/* type glyph */}
      <Glyph x={-(hex ? 9 : 7)} y={r * (hex ? 0.42 : 0.38)} width={hex ? 18 : 14} height={hex ? 18 : 14} color="var(--pc-ink-muted)" strokeWidth={2} aria-hidden="true" />

      {/* task ring: one segment per task */}
      {nTasks > 0 && (
        <g>
          {p.tasks.map((s, i) => {
            const gap = nTasks > 1 ? 0.04 : 0;
            const a = i / nTasks + gap / 2;
            const b = (i + 1) / nTasks - gap / 2;
            const color = s === 'done' ? 'var(--ok-solid)' : s === 'blocked' ? 'var(--bad-solid)' : 'color-mix(in oklab, var(--pc-ink) 22%, transparent)';
            return (
              <path
                key={i}
                className={p.flashTask === i ? 'pc-pip pc-pip-flash' : 'pc-pip'}
                d={nTasks === 1 ? `M0,${-ringR} A${ringR},${ringR} 0 1 1 -0.01,${-ringR}` : arcPath(ringR, a, b)}
                fill="none"
                stroke={color}
                strokeWidth={hex ? 4 : 3.2}
                strokeLinecap="round"
                data-task-status={s}
              />
            );
          })}
        </g>
      )}

      {/* hand */}
      <g
        className={over && p.running ? 'pc-hand' : 'pc-hand'}
        style={{ transform: `rotate(${angle}deg)`, transitionDelay: delay }}
      >
        <g className={over && p.running ? 'pc-tick-overdue' : undefined}>
          <line x1={0} y1={r * 0.18} x2={0} y2={-(inner - (hex ? 6 : 4))} stroke={over ? 'var(--bad-solid)' : 'var(--pc-ink)'} strokeWidth={hex ? 3 : 2.4} strokeLinecap="round" />
          <circle cy={-(inner - (hex ? 12 : 9))} r={hex ? 2.6 : 2} fill={over ? 'var(--bad-solid)' : 'var(--pc-ink)'} />
        </g>
      </g>
      <circle r={hex ? 5.5 : 4.2} fill="url(#pc-brass)" stroke="var(--pc-brass-lo)" strokeWidth={0.8} />

      {/* running seconds pip on breach dials: this clock is live */}
      {hex && p.running && (
        <g className="pc-seconds">
          <circle cy={-(r - 4)} r={2.2} fill={over ? 'var(--bad-solid)' : 'var(--accent-9)'} />
        </g>
      )}

      {/* glass */}
      <g clipPath={`url(#${clip})`} pointerEvents="none">
        <ellipse cx={-r * 0.32} cy={-r * 0.42} rx={r * 0.9} ry={r * 0.55} transform={`rotate(-28 ${-r * 0.32} ${-r * 0.42})`} fill="url(#pc-glass)" />
      </g>

      {/* overrun: how far past the deadline, outside the bezel */}
      {over && (
        <path
          className={p.running ? 'pc-overrun' : undefined}
          d={arcPath(r + (hex ? 15 : 11), 0, Math.min(0.999, p.fraction - 1))}
          fill="none"
          stroke="var(--bad-solid)"
          strokeWidth={3}
          strokeLinecap="round"
        />
      )}
      {p.children}
    </g>
  );
});

/** A small standalone dial for pages and lists (same drawing, own SVG). */
export function MiniDial({ size = 40, label, ...p }: Omit<DialFaceProps, 'r'> & { size?: number; label?: string }) {
  const r = p.kind === 'breach' ? 34 : 30;
  const pad = p.kind === 'breach' ? 20 : 15 + (p.state === 'overdue' ? 4 : 0);
  const v = r + pad;
  return (
    <svg viewBox={`${-v} ${-v} ${v * 2} ${v * 2}`} width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0 overflow-visible">
      <DialFace {...p} r={r} labels={false} />
    </svg>
  );
}
