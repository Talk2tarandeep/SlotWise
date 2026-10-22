// Fair before/after comparison on HELD-OUT orders (22-30 Nov), which the
// optimizer never saw. Original, an auto baseline built from the same fit-period
// demand (1-21 Nov), and the optimized layout all replay the identical orders
// with the identical rules.

import { congestionFor } from '../scene/helpers';
import { avgAislesPerTrip, splitOrders } from '../sim/analysis';
import { baselineLayout, type Layout } from '../sim/layouts';
import type { WarehouseModel } from '../sim/model';
import { scoreLayout, type Score } from '../sim/scoring';
import type { Product, WarehouseData } from '../sim/types';

export const EVAL_PICKERS = 4; // congestion is measured with this many pickers

export type EvalRow = { key: 'original' | 'baseline' | 'optimized'; name: string; layout: Layout; score: Score; aislesPerTrip: number; waitS: number; makespanS: number };

const cache = new WeakMap<Layout, Map<number, EvalRow[]>>();

export function heldOutComparison(model: WarehouseModel, data: WarehouseData, original: Layout, optimized: Layout, fitDemand: Product[], batchSize: number): EvalRow[] {
  const byBatch = cache.get(optimized) ?? new Map<number, EvalRow[]>();
  cache.set(optimized, byBatch);
  const hit = byBatch.get(batchSize);
  if (hit) return hit;

  const { test } = splitOrders(data.orders);
  const fitBaseline = baselineLayout(fitDemand, model);
  const rows = (
    [
      ['original', 'Original', original],
      ['baseline', 'Auto baseline (1–21 Nov demand)', fitBaseline],
      ['optimized', 'Optimized', optimized],
    ] as const
  ).map(([key, name, layout]) => {
    const congestion = congestionFor(model, layout, test, EVAL_PICKERS, batchSize);
    return {
      key,
      name,
      layout,
      score: scoreLayout(model, layout, test, batchSize),
      aislesPerTrip: avgAislesPerTrip(model, layout, test, batchSize),
      waitS: congestion.totalWaitS,
      makespanS: congestion.makespanS,
    };
  });
  byBatch.set(batchSize, rows);
  return rows;
}

// A player's layout only "earns" wins once it differs from every layout the
// app can hand them for free (Original, the auto baseline, the optimizer's).
export function isOwnLayout(layouts: { original: Layout; baseline: Layout; optimized: Layout; player: Layout }): boolean {
  const same = (a: Layout, b: Layout) => a.length === b.length && a.every((c, i) => c === b[i]);
  return !same(layouts.player, layouts.original) && !same(layouts.player, layouts.baseline) && !(layouts.optimized.length > 0 && same(layouts.player, layouts.optimized));
}
