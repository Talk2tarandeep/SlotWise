// Small helpers shared by the 3D components and the panel.

import { Color } from 'three';
import { simulatePickers, type MultiPickerResult, type SimOptions } from '../sim/congestion';
import type { Grid } from '../sim/grid';
import { buildHeatmap, type Heatmap } from '../sim/heatmap';
import type { Layout } from '../sim/layouts';
import type { WarehouseModel } from '../sim/model';
import type { Order } from '../sim/types';
import { batchSizeFor, useStore } from '../store';

// Picker colours (vest tint, trail, chips). Index = picker number.
export const PICKER_COLORS = ['#f97316', '#2563eb', '#16a34a', '#db2777', '#7c3aed', '#0891b2'];
export const pickerColor = (p: number) => PICKER_COLORS[p % PICKER_COLORS.length];

// Grid cell (x, y) -> world position [X, Z] on the floor.
// Grid y = 0 is the front cross-aisle, shown nearest the camera (+Z).
export function toWorld(grid: Grid, x: number, y: number): [number, number] {
  return [x + 0.5 - grid.width / 2, grid.height / 2 - (y + 0.5)];
}

// Cell index -> world position.
export function cellToWorld(grid: Grid, cell: number): [number, number] {
  return toWorld(grid, cell % grid.width, Math.floor(cell / grid.width));
}

// Which aisle (0-based) a cell belongs to, or -1 for cross-aisles / racks.
export function aisleOfCell(grid: Grid, cell: number): number {
  const cfg = grid.config;
  const x = cell % grid.width;
  const y = Math.floor(cell / grid.width);
  if (y < cfg.crossAisleWidth || y >= cfg.crossAisleWidth + cfg.slotsPerFace) return -1;
  const block = 2 * cfg.rackDepth + cfg.aisleWidth;
  const inBlock = x % block;
  return inBlock >= cfg.rackDepth && inBlock < cfg.rackDepth + cfg.aisleWidth ? Math.floor(x / block) : -1;
}

// Heat colour for a pick count: cool blue (slow mover) -> hot red (fast mover).
export function heatColor(picks: number, minPicks: number, maxPicks: number): Color {
  const t = maxPicks > minPicks ? (picks - minPicks) / (maxPicks - minPicks) : 1;
  return new Color().setHSL(0.62 * (1 - t), 0.85, 0.5);
}

// Traffic colour: pale blue (quiet) -> yellow -> red (busiest).
// sqrt scale so quieter cells are still visible next to the dock hot spot.
export function trafficColor(passes: number, max: number): Color {
  const t = Math.min(1, Math.sqrt(passes / Math.max(1, max)));
  return new Color().setHSL(0.6 - 0.6 * t, 0.85, 0.86 - 0.38 * t);
}

// Congestion colour by seconds spent waiting in a cell (fixed thresholds, shown in the legend):
// green = flowing (walked, no waiting), yellow at CONGESTION_YELLOW_S, red at >= CONGESTION_RED_S.
export const CONGESTION_RED_S = 20;
export const CONGESTION_YELLOW_S = CONGESTION_RED_S / 2; // the hue scale is linear, so yellow is half-way
export function congestionColor(waitS: number): Color {
  const t = Math.min(1, waitS / CONGESTION_RED_S);
  return new Color().setHSL(0.33 * (1 - t), 0.8, 0.5);
}

// ---------- Cached computations (layouts are never mutated, so they are safe cache keys) ----------

function cached<T>(store: Map<string, WeakMap<Layout, T>>, key: string, layout: Layout, compute: () => T): T {
  if (!store.has(key)) store.set(key, new WeakMap());
  const cache = store.get(key)!;
  let value = cache.get(layout);
  if (value === undefined) {
    value = compute();
    cache.set(layout, value);
  }
  return value;
}

const heatmapCache = new Map<string, WeakMap<Layout, Heatmap>>();
const replayCache = new Map<string, WeakMap<Layout, MultiPickerResult>>();
const monthCache = new Map<string, WeakMap<Layout, MultiPickerResult>>();

// Traffic heatmap (all orders) for the active layout, plus Original's for a fixed colour scale.
export function useHeatmaps() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const show = useStore((s) => s.overlay === 'traffic');
  const original = useStore((s) => s.layouts.original);
  const layout = useStore((s) => s.layouts[s.active]);
  const batchSize = useStore((s) => batchSizeFor(s.mode));
  if (!show || !model || !data) return { current: null, reference: null };
  const key = `${batchSize}`;
  return {
    current: cached(heatmapCache, key, layout, () => buildHeatmap(model, layout, data.orders, batchSize)),
    reference: cached(heatmapCache, key, original, () => buildHeatmap(model, original, data.orders, batchSize)),
  };
}

// The recorded replay of the current order sample (any number of pickers).
// Shared by the 3D view and the panel; computed once per settings + layout.
export function useReplaySim(): MultiPickerResult | null {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layout = useStore((s) => s.layouts[s.active]);
  const sampleStart = useStore((s) => s.sampleStart);
  const sampleSize = useStore((s) => s.sampleSize);
  const batchSize = useStore((s) => batchSizeFor(s.mode));
  const pickers = useStore((s) => s.pickers);
  if (!model || !data || layout.length === 0) return null;
  const key = `${sampleStart}|${sampleSize}|${pickers}x${batchSize}`;
  return cached(replayCache, key, layout, () =>
    simulatePickers(model, layout, data.orders.slice(sampleStart, sampleStart + sampleSize), { pickers, batchSize, record: true }),
  );
}

// The orders shown in the current replay sample.
export function useReplayOrders(): Order[] {
  const data = useStore((s) => s.data);
  const sampleStart = useStore((s) => s.sampleStart);
  const sampleSize = useStore((s) => s.sampleSize);
  return data ? data.orders.slice(sampleStart, sampleStart + sampleSize) : [];
}

// A whole workload (e.g. all orders of the month) worked by N pickers at once,
// cached per settings. `workloadKey` names the order set (e.g. 'all', 'test',
// 'what-if:...') so different order sets never share a cache entry.
export function monthSim(
  model: WarehouseModel,
  layout: Layout,
  orders: Order[],
  options: Omit<SimOptions, 'record'>,
  workloadKey = 'all',
): MultiPickerResult {
  const key = `${workloadKey}|${orders.length}|${JSON.stringify(options)}`;
  return cached(monthCache, key, layout, () => simulatePickers(model, layout, orders, options));
}

// Kept for existing callers: all orders, N pickers, batch size.
export function congestionFor(model: WarehouseModel, layout: Layout, orders: Order[], pickers: number, batchSize: number) {
  return monthSim(model, layout, orders, { pickers, batchSize });
}
