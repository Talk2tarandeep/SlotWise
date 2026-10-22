// Analysis helpers used by the optimizer, dashboard and what-if panel.
// Everything here is computed from the real orders; nothing is assumed.

import { DOCK_NODE } from './grid';
import { slotOfProduct, type Layout } from './layouts';
import type { WarehouseModel } from './model';
import type { RoutingPolicy } from './routing';
import { groupIntoTrips, routeForTrip } from './scoring';
import type { Order, Product } from './types';

// Split the month by order date: fit (tune) on days <= splitDay, test on the rest.
// Evaluating on orders the optimizer never saw keeps "it is better" claims honest.
export const DEFAULT_SPLIT_DAY = 21;

export function splitOrders(orders: Order[], splitDay = DEFAULT_SPLIT_DAY): { fit: Order[]; test: Order[] } {
  const day = (o: Order) => Number(o.t.slice(8, 10));
  return { fit: orders.filter((o) => day(o) <= splitDay), test: orders.filter((o) => day(o) > splitDay) };
}

// Pick counts (and ranks) recomputed from a set of orders: "demand" for that period.
// Products with no picks in the period keep rank order by code, after the others.
export function demandFromOrders(products: Product[], orders: Order[]): Product[] {
  const picks = new Map(products.map((p) => [p.code, 0]));
  for (const o of orders) for (const code of o.items) picks.set(code, (picks.get(code) ?? 0) + 1);
  return [...products]
    .map((p) => ({ ...p, picks: picks.get(p.code) ?? 0 }))
    .sort((a, b) => b.picks - a.picks || (a.code < b.code ? -1 : 1))
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

// ABC classes by product count: A = top 20 % of products by picks, B = next 30 %, C = the rest.
export type AbcClass = 'A' | 'B' | 'C';
export function abcClasses(products: Product[]): Map<string, AbcClass> {
  const sorted = [...products].sort((a, b) => b.picks - a.picks || (a.code < b.code ? -1 : 1));
  const n = sorted.length;
  return new Map(sorted.map((p, i) => [p.code, i < n * 0.2 ? 'A' : i < n * 0.5 ? 'B' : 'C']));
}

// Average number of different aisles a trip enters (fewer = less walking in/out of aisles).
export function avgAislesPerTrip(model: WarehouseModel, layout: Layout, orders: Order[], batchSize = 1, routing: RoutingPolicy = 'nn') {
  const slotOf = slotOfProduct(layout);
  const nodeAisle = new Map(model.grid.slots.map((s) => [s.node, s.aisle]));
  const trips = groupIntoTrips(orders, batchSize);
  let total = 0;
  for (const trip of trips) {
    const { stops } = routeForTrip(model, slotOf, trip, routing);
    total += new Set(stops.slice(1, -1).map((n) => nodeAisle.get(n))).size;
  }
  return trips.length ? total / trips.length : 0;
}

// Share of all picks whose slot is within `metres` walking distance of the dock.
export function shareOfPicksNearDock(model: WarehouseModel, layout: Layout, orders: Order[], metres: number) {
  const slotOf = slotOfProduct(layout);
  let near = 0;
  let all = 0;
  for (const o of orders)
    for (const code of o.items) {
      all++;
      if (model.dist[DOCK_NODE][model.grid.slots[slotOf.get(code)!].node] <= metres) near++;
    }
  return all ? near / all : 0;
}

export type Relocation = {
  code: string;
  desc: string;
  picks: number; // in the orders given
  fromSlot: number | null;
  toSlot: number;
  fromDockM: number | null; // walking distance dock -> pick point
  toDockM: number;
};

// Products whose slot differs between two layouts, most-picked first.
export function relocations(model: WarehouseModel, from: Layout, to: Layout, products: Product[]): Relocation[] {
  const fromSlot = slotOfProduct(from);
  const toSlot = slotOfProduct(to);
  const dock = model.dist[DOCK_NODE];
  const out: Relocation[] = [];
  for (const p of products) {
    const a = fromSlot.get(p.code);
    const b = toSlot.get(p.code);
    if (b === undefined || a === b) continue;
    out.push({
      code: p.code,
      desc: p.desc,
      picks: p.picks,
      fromSlot: a ?? null,
      toSlot: b,
      fromDockM: a === undefined ? null : dock[model.grid.slots[a].node],
      toDockM: dock[model.grid.slots[b].node],
    });
  }
  return out.sort((x, y) => y.picks - x.picks || (x.code < y.code ? -1 : 1));
}

// Slot label used across the UI, e.g. "A3-L7" = aisle 3, left rack, position 7 from the front.
export function slotLabel(model: WarehouseModel, slotId: number): string {
  const s = model.grid.slots[slotId];
  return `A${s.aisle + 1}-${s.side}${s.pos + 1}`;
}
