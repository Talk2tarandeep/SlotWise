// Layout optimizer: deterministic swap-based local search ("hill climbing").
//
// 1. Build a few sensible starting layouts from demand (pick counts):
//      - auto baseline: fast movers in the slots nearest the dock;
//      - aisle-compact: fast movers packed into as few aisles as possible
//        (fills aisle 1 front-to-back, then aisle 2, ...).
//    Keep the one with the shortest total walk on the fit orders.
// 2. Try swapping every pair of slots. Keep a swap if the total walking distance
//    on the fit orders gets shorter. Repeat passes until no swap helps (or the
//    pass/time limit is hit).
//
// Speed trick: a swap only changes the routes of orders that contain one of the
// two swapped products, so only those orders are re-routed (an index from
// product -> trips makes this fast).
//
// The optimizer only ever sees the orders you give it (the "fit" set); judge
// the result on other orders (see analysis.splitOrders).

import { baselineLayout, slotOfProduct, swapSlots, type Layout } from './layouts';
import type { WarehouseModel } from './model';
import type { RoutingPolicy } from './routing';
import { groupIntoTrips, routeForTrip } from './scoring';
import type { Order, Product } from './types';

export type OptimizeOptions = {
  batchSize?: number;
  routing?: RoutingPolicy;
  maxPasses?: number;
  timeBudgetMs?: number; // stop after this long (the best layout so far is kept)
  onProgress?: (p: OptimizeProgress) => void;
};

export type OptimizeProgress = { pass: number; slot: number; slots: number; acceptedSwaps: number; distanceM: number };

export type OptimizeResult = {
  layout: Layout;
  seed: string; // which starting layout won
  seedDistanceM: number;
  finalDistanceM: number;
  passes: number;
  acceptedSwaps: number;
  evaluations: number;
  stoppedBy: 'converged' | 'max-passes' | 'time-budget';
  ms: number;
};

// Fast movers packed aisle by aisle: slots ordered by (aisle, depth), both
// sides of the aisle filled at each depth before going deeper.
export function aisleCompactLayout(products: Product[], model: WarehouseModel): Layout {
  const slots = [...model.grid.slots].sort((a, b) => a.aisle - b.aisle || a.pos - b.pos || a.id - b.id);
  const layout: Layout = new Array(model.grid.slots.length).fill(null);
  [...products].sort((a, b) => a.rank - b.rank).forEach((p, i) => (layout[slots[i].id] = p.code));
  return layout;
}

export function optimizeLayout(model: WarehouseModel, products: Product[], orders: Order[], options: OptimizeOptions = {}): OptimizeResult {
  const { batchSize = 1, routing = 'nn', maxPasses = 8, timeBudgetMs = Infinity, onProgress } = options;
  const started = Date.now();
  const trips = groupIntoTrips(orders, batchSize);

  const total = (layout: Layout) => {
    const slotOf = slotOfProduct(layout);
    return trips.reduce((sum, t) => sum + routeForTrip(model, slotOf, t, routing).distance, 0);
  };

  // 1. Pick the best starting layout.
  const seeds: [string, Layout][] = [
    ['auto baseline', baselineLayout(products, model)],
    ['aisle-compact', aisleCompactLayout(products, model)],
  ];
  let seed = seeds[0][0];
  let layout = seeds[0][1];
  let current = total(layout);
  for (const [name, l] of seeds.slice(1)) {
    const d = total(l);
    if (d < current) [seed, layout, current] = [name, l, d];
  }
  const seedDistanceM = current;

  // 2. Local search with incremental evaluation.
  const slotOf = slotOfProduct(layout);
  const tripDist = trips.map((t) => routeForTrip(model, slotOf, t, routing).distance);
  const tripsOfProduct = new Map<string, number[]>();
  trips.forEach((trip, t) => {
    for (const code of new Set(trip.flatMap((o) => o.items))) {
      if (!tripsOfProduct.has(code)) tripsOfProduct.set(code, []);
      tripsOfProduct.get(code)!.push(t);
    }
  });
  const stamp = new Int32Array(trips.length).fill(-1); // de-duplicates affected trips per evaluation

  const slotCount = layout.length;
  let passes = 0;
  let acceptedSwaps = 0;
  let evaluations = 0;
  let stoppedBy: OptimizeResult['stoppedBy'] = 'converged';

  outer: while (passes < maxPasses) {
    passes++;
    let improvedThisPass = false;
    for (let a = 0; a < slotCount; a++) {
      if (Date.now() - started > timeBudgetMs) {
        stoppedBy = 'time-budget';
        break outer;
      }
      onProgress?.({ pass: passes, slot: a, slots: slotCount, acceptedSwaps, distanceM: current });
      for (let b = a + 1; b < slotCount; b++) {
        const ca = layout[a];
        const cb = layout[b];
        if (ca === null && cb === null) continue;

        // Trips that contain either product.
        const affected: number[] = [];
        for (const code of [ca, cb]) {
          if (code === null) continue;
          for (const t of tripsOfProduct.get(code) ?? []) {
            if (stamp[t] !== evaluations) {
              stamp[t] = evaluations;
              affected.push(t);
            }
          }
        }
        evaluations++;
        if (affected.length === 0) continue;

        // Try the swap.
        if (ca !== null) slotOf.set(ca, b);
        if (cb !== null) slotOf.set(cb, a);
        let delta = 0;
        const newDist = affected.map((t) => {
          const d = routeForTrip(model, slotOf, trips[t], routing).distance;
          delta += d - tripDist[t];
          return d;
        });

        if (delta < 0) {
          // Keep it.
          layout = swapSlots(layout, a, b);
          affected.forEach((t, i) => (tripDist[t] = newDist[i]));
          current += delta;
          acceptedSwaps++;
          improvedThisPass = true;
        } else {
          // Undo.
          if (ca !== null) slotOf.set(ca, a);
          if (cb !== null) slotOf.set(cb, b);
        }
      }
    }
    if (!improvedThisPass) break;
    if (passes === maxPasses) stoppedBy = 'max-passes';
  }

  return {
    layout,
    seed,
    seedDistanceM,
    finalDistanceM: current,
    passes,
    acceptedSwaps,
    evaluations,
    stoppedBy,
    ms: Date.now() - started,
  };
}
