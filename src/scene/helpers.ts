// Small helpers shared by the 3D components.

import { useMemo } from 'react';
import { Color } from 'three';
import type { Grid } from '../sim/grid';
import { buildTimeline } from '../sim/timeline';
import { SAMPLE_SIZE, useStore } from '../store';

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
  return useMemo(() => {
    if (!model || !data) return null;
    return buildTimeline(model, layout, data.orders.slice(sampleStart, sampleStart + SAMPLE_SIZE));
  }, [model, data, layout, sampleStart]);
}
