// Small helpers shared by the 3D components.

import { useMemo } from 'react';
import { Color } from 'three';
import type { Grid } from '../sim/grid';
import { buildHeatmap, type Heatmap } from '../sim/heatmap';
import type { Layout } from '../sim/layouts';
import type { WarehouseModel } from '../sim/model';
import type { Order } from '../sim/types';
import { buildTimeline } from '../sim/timeline';
import { batchSizeFor, SAMPLE_SIZE, useStore } from '../store';

// Grid cell (x, y) -> world position [X, Z] on the floor.
// Grid y = 0 is the front cross-aisle, shown nearest the camera (+Z).
export function toWorld(grid: Grid, x: number, y: number): [number, number] {
  return [x + 0.5 - grid.width / 2, grid.height / 2 - (y + 0.5)];
}

// Heat colour for a pick count: cool blue (slow mover) -> hot red (fast mover).
export function heatColor(picks: number, minPicks: number, maxPicks: number): Color {
  const t = maxPicks > minPicks ? (picks - minPicks) / (maxPicks - minPicks) : 1;
  return new Color().setHSL(0.62 * (1 - t), 0.85, 0.5);
}

// Replay timeline for the active layout and current order sample.
export function useTimeline() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layout = useStore((s) => s.layouts[s.active]);
  const sampleStart = useStore((s) => s.sampleStart);
  const batchSize = useStore((s) => batchSizeFor(s.mode));
  return useMemo(() => {
    if (!model || !data) return null;
    return buildTimeline(model, layout, data.orders.slice(sampleStart, sampleStart + SAMPLE_SIZE), batchSize);
  }, [model, data, layout, sampleStart, batchSize]);
}

// Traffic heatmap for the active layout over ALL orders, plus the Original
// layout's heatmap, whose busiest cell fixes the colour scale so the
// layouts can be compared by eye. Only computed while the overlay is on.
// Layout arrays are never mutated (a swap makes a new array), so each
// layout's heatmap is computed once and cached.
// One cache per batch size (1 = single-order picking).
const heatmapCache = new Map<number, WeakMap<Layout, Heatmap>>();

function cachedHeatmap(model: WarehouseModel, layout: Layout, orders: Order[], batchSize: number): Heatmap {
  if (!heatmapCache.has(batchSize)) heatmapCache.set(batchSize, new WeakMap());
  const cache = heatmapCache.get(batchSize)!;
  let heat = cache.get(layout);
  if (!heat) {
    heat = buildHeatmap(model, layout, orders, batchSize);
    cache.set(layout, heat);
  }
  return heat;
}

export function useHeatmaps() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const show = useStore((s) => s.showHeatmap);
  const original = useStore((s) => s.layouts.original);
  const layout = useStore((s) => s.layouts[s.active]);
  const batchSize = useStore((s) => batchSizeFor(s.mode));
  if (!show || !model || !data) return { current: null, reference: null };
  return {
    current: cachedHeatmap(model, layout, data.orders, batchSize),
    reference: cachedHeatmap(model, original, data.orders, batchSize),
  };
}

// Traffic colour: dark blue (quiet) -> yellow -> red (busiest).
// sqrt scale so quieter cells are still visible next to the dock hot spot.
export function trafficColor(passes: number, max: number): Color {
  const t = Math.min(1, Math.sqrt(passes / Math.max(1, max)));
  return new Color().setHSL(0.66 - 0.66 * t, 0.9, 0.18 + 0.37 * t);
}
