/**
 * Tower layout and drawing helpers. Pure (no React), unit-tested in tower.test.ts.
 *
 * Coordinates: the tower's front face spans x = 0..width. y = 0 is the top of the belfry (breach dials); the roof
 * and the master clock rise above it (negative y); floors of request dials stack below, one band per lens group.
 */
import type { Dial, LensGroup, TowerLens } from '../domain/tower';
import { groupKey } from '../domain/tower';

export const DIAL_R = 44;
export const HEX_R = 72;
export const CELL_W = 142;
export const ROW_H = 176;
export const LINTEL_H = 34;
export const PAD_X = 30;
export const BAY_GAP = 30;
export const BELFRY_CELL = 236;
export const DEPTH = 34;

export interface Placed {
  id: string;
  x: number;
  y: number;
  r: number;
  kind: 'request' | 'breach';
  /** Order, for staggered motion. */
  index: number;
}

/** One lens group's run of dials within a row (a bay between pilasters). */
export interface Bay extends LensGroup {
  x0: number;
  x1: number;
  count: number;
  /** The group's total, shown on its first bay. */
  total: number;
  first: boolean;
}

export interface Row {
  y: number;
  h: number;
  bays: Bay[];
}

export interface TowerLayout {
  cols: number;
  width: number;
  /** Bottom of the last row (top of the plinth). */
  height: number;
  belfryH: number;
  roofH: number;
  rows: Row[];
  placed: Map<string, Placed>;
  /** Everything the camera should show, roof and ground included. */
  bounds: { x: number; y: number; w: number; h: number };
}

/**
 * Lay the dials out: breaches in the belfry; requests in rows of at most `cols`, one bay per lens group, groups
 * packed side by side when they fit (in lens order) and wrapped onto further rows when they do not.
 */
export function layoutTower(dials: Dial[], lens: TowerLens, groups: LensGroup[], cols: number): TowerLayout {
  const breaches = dials.filter((d) => d.kind === 'breach');
  const requests = dials.filter((d) => d.kind === 'request');

  // Pack the groups into rows of chunks.
  type Chunk = { g: LensGroup; ids: string[]; first: boolean; total: number };
  const rowsOfChunks: Chunk[][] = [];
  let cur: Chunk[] = [];
  let used = 0;
  for (const g of groups) {
    const members = requests.filter((d) => groupKey(d, lens) === g.key).map((d) => d.id);
    if (!members.length) continue;
    for (let i = 0; i < members.length; i += cols) {
      const ids = members.slice(i, i + cols);
      if (used > 0 && used + ids.length > cols) {
        rowsOfChunks.push(cur);
        cur = [];
        used = 0;
      }
      cur.push({ g, ids, first: i === 0, total: members.length });
      used += ids.length;
    }
  }
  if (cur.length) rowsOfChunks.push(cur);

  const rowWidth = (r: Chunk[]) => r.reduce((a, c) => a + c.ids.length * CELL_W, 0) + (r.length - 1) * BAY_GAP;
  const inner = Math.max(cols * CELL_W, ...rowsOfChunks.map(rowWidth), breaches.length * BELFRY_CELL, 3 * CELL_W);
  const width = inner + PAD_X * 2;
  const placed = new Map<string, Placed>();
  let index = 0;

  const belfryH = breaches.length ? HEX_R * 2 + 152 : 150;
  const bx0 = (width - breaches.length * BELFRY_CELL) / 2 + BELFRY_CELL / 2;
  breaches.forEach((d, i) => placed.set(d.id, { id: d.id, x: bx0 + i * BELFRY_CELL, y: 40 + HEX_R + 8, r: HEX_R, kind: 'breach', index: index++ }));

  const rows: Row[] = [];
  let y = belfryH;
  for (const chunks of rowsOfChunks) {
    const h = LINTEL_H + ROW_H;
    let x = (width - rowWidth(chunks)) / 2;
    const bays: Bay[] = [];
    for (const c of chunks) {
      const x0 = x;
      c.ids.forEach((id, i) => placed.set(id, { id, x: x0 + i * CELL_W + CELL_W / 2, y: y + LINTEL_H + DIAL_R + 16, r: DIAL_R, kind: 'request', index: index++ }));
      x += c.ids.length * CELL_W;
      bays.push({ ...c.g, x0, x1: x, count: c.ids.length, total: c.total, first: c.first });
      x += BAY_GAP;
    }
    rows.push({ y, h, bays });
    y += h;
  }
  if (!rows.length) y += 120;
  const roofH = Math.min(170, Math.max(124, width * 0.18));
  return {
    cols,
    width,
    height: y,
    belfryH,
    roofH,
    rows,
    placed,
    bounds: { x: -46, y: -roofH - 40, w: width + DEPTH + 92, h: y + roofH + 40 + 52 },
  };
}

/** The number of columns that gives the largest scale for a free area of w × h. */
export function bestCols(dials: Dial[], lens: TowerLens, groups: LensGroup[], w: number, h: number): TowerLayout {
  let best: TowerLayout | null = null;
  let bestScale = -1;
  const n = Math.max(1, dials.filter((d) => d.kind === 'request').length);
  for (let cols = 2; cols <= Math.max(2, Math.min(9, n)); cols++) {
    const l = layoutTower(dials, lens, groups, cols);
    const s = Math.min(w / l.bounds.w, h / l.bounds.h);
    if (s > bestScale + 0.0005) {
      best = l;
      bestScale = s;
    }
  }
  return best ?? layoutTower(dials, lens, groups, 3);
}

/* ------------------------------------------------------------------ shapes */

/** Pointy-top hexagon points around (0,0). */
export function hexPoints(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** Point at `frac` of a turn clockwise from 12 o'clock. */
export function polar(r: number, frac: number): [number, number] {
  const a = frac * Math.PI * 2 - Math.PI / 2;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** An arc path from frac a to frac b (clockwise) at radius r. */
export function arcPath(r: number, a: number, b: number): string {
  const span = Math.max(0, Math.min(0.9999, b - a));
  const [x0, y0] = polar(r, a);
  const [x1, y1] = polar(r, a + span);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${span > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/** Deterministic pseudo-random numbers from a string (stable cracks per dial). */
export function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jagged crack lines across a dial face of radius r, radiating from an impact point. */
export function crackPaths(seed: string, r: number): string[] {
  const rand = rng(seed);
  const cx = (rand() - 0.5) * r * 0.5;
  const cy = (rand() - 0.5) * r * 0.5 - r * 0.15;
  const n = 4 + Math.floor(rand() * 2);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const base = (i / n) * Math.PI * 2 + rand() * 0.8;
    let x = cx;
    let y = cy;
    let d = `M${x.toFixed(1)},${y.toFixed(1)}`;
    const steps = 3 + Math.floor(rand() * 2);
    for (let s = 0; s < steps; s++) {
      const a = base + (rand() - 0.5) * 0.9;
      const len = (r * (0.25 + rand() * 0.25)) / (s * 0.3 + 1);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      if (Math.hypot(x, y) > r) break;
      d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    out.push(d);
  }
  return out;
}

/** A gear outline (for the Gears board): `teeth` teeth around radius r. */
export function gearPath(r: number, teeth: number, depth = r * 0.18): string {
  const pts: string[] = [];
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = i % 4 === 0 || i % 4 === 1 ? r : r - depth;
    pts.push(`${(rr * Math.cos(a)).toFixed(2)},${(rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}
