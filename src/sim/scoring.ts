// Scoring: replay every order of the month on a layout (pure computation,
// no animation) and report total walking distance and average pick time.
//
// Orders are grouped into trips. Single-order picking = 1 order per trip.
// Batch picking = BATCH_SIZE consecutive orders per trip: the picker
// collects all their lines in one walk and packs each order at the dock.

import { PACK_SECONDS_PER_ORDER, PICK_SECONDS_PER_LINE, WALK_SPEED_MPS } from './config';
import { slotOfProduct, type Layout } from './layouts';
import type { WarehouseModel } from './model';
import { routeOrder, type Route } from './routing';
import type { Order } from './types';

// Time for one trip = walking + 10 s per line + 30 s packing per order.
export function tripTimeSeconds(distanceM: number, lines: number, orders = 1): number {
  return distanceM / WALK_SPEED_MPS + lines * PICK_SECONDS_PER_LINE + orders * PACK_SECONDS_PER_ORDER;
}

// Kept for readability in tests: one order = one trip.
export function orderTimeSeconds(distanceM: number, lines: number): number {
  return tripTimeSeconds(distanceM, lines, 1);
}

// Split orders (already in time order) into consecutive groups of `size`.
// The last trip may hold fewer orders.
export function groupIntoTrips(orders: Order[], size: number): Order[][] {
  const trips: Order[][] = [];
  for (let i = 0; i < orders.length; i += size) trips.push(orders.slice(i, i + size));
  return trips;
}

// Route one trip: visit the pick points of every line of every order in it.
export function routeForTrip(model: WarehouseModel, slotOf: Map<string, number>, trip: Order[]): Route {
  const pickNodes = trip.flatMap((order) =>
    order.items.map((code) => {
      const slotId = slotOf.get(code);
      if (slotId === undefined) throw new Error(`Product ${code} has no slot in this layout`);
      return model.grid.slots[slotId].node;
    }),
  );
  return routeOrder(model, pickNodes);
}

export function routeForOrder(model: WarehouseModel, slotOf: Map<string, number>, order: Order): Route {
  return routeForTrip(model, slotOf, [order]);
}

export type Score = {
  orders: number;
  trips: number;
  lines: number;
  totalDistanceM: number;
  avgDistanceM: number; // per order
  avgPickTimeS: number; // per order
  totalTimeS: number;
};

export function scoreLayout(model: WarehouseModel, layout: Layout, orders: Order[], batchSize = 1): Score {
  const slotOf = slotOfProduct(layout);
  const trips = groupIntoTrips(orders, batchSize);
  let totalDistanceM = 0;
  let totalTimeS = 0;
  let lines = 0;
  for (const trip of trips) {
    const route = routeForTrip(model, slotOf, trip);
    const tripLines = trip.reduce((n, o) => n + o.items.length, 0);
    totalDistanceM += route.distance;
    totalTimeS += tripTimeSeconds(route.distance, tripLines, trip.length);
    lines += tripLines;
  }
  const n = Math.max(1, orders.length);
  return {
    orders: orders.length,
    trips: trips.length,
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
