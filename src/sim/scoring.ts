// Scoring: replay every order of the month on a layout (pure computation,
// no animation) and report total walking distance and average pick time.

import { PACK_SECONDS_PER_ORDER, PICK_SECONDS_PER_LINE, WALK_SPEED_MPS } from './config';
import { slotOfProduct, type Layout } from './layouts';
import type { WarehouseModel } from './model';
import { routeOrder, type Route } from './routing';
import type { Order } from './types';

// Time for one order = walking + 10 s per line + 30 s packing.
export function orderTimeSeconds(distanceM: number, lines: number): number {
  return distanceM / WALK_SPEED_MPS + lines * PICK_SECONDS_PER_LINE + PACK_SECONDS_PER_ORDER;
}

// Route a single order on a layout (also used by the 3D replay).
export function routeForOrder(model: WarehouseModel, slotOf: Map<string, number>, order: Order): Route {
  const pickNodes = order.items.map((code) => {
    const slotId = slotOf.get(code);
    if (slotId === undefined) throw new Error(`Product ${code} has no slot in this layout`);
    return model.grid.slots[slotId].node;
  });
  return routeOrder(model, pickNodes);
}

export type Score = {
  orders: number;
  lines: number;
  totalDistanceM: number;
  avgDistanceM: number; // per order
  avgPickTimeS: number; // per order
  totalTimeS: number;
};

export function scoreLayout(model: WarehouseModel, layout: Layout, orders: Order[]): Score {
  const slotOf = slotOfProduct(layout);
  let totalDistanceM = 0;
  let totalTimeS = 0;
  let lines = 0;
  for (const order of orders) {
    const route = routeForOrder(model, slotOf, order);
    totalDistanceM += route.distance;
    totalTimeS += orderTimeSeconds(route.distance, order.items.length);
    lines += order.items.length;
  }
  const n = Math.max(1, orders.length);
  return {
    orders: orders.length,
    lines,
    totalDistanceM,
    avgDistanceM: totalDistanceM / n,
    avgPickTimeS: totalTimeS / n,
    totalTimeS,
  };
}

// Percentage change of `value` relative to `reference` (negative = better).
export function pctChange(value: number, reference: number): number {
  return reference === 0 ? 0 : ((value - reference) / reference) * 100;
}
