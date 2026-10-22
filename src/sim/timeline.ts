// Turns a few orders into a timed sequence of steps for the 3D replay:
// walk (along the BFS path) -> pick (10 s per line) -> ... -> walk -> pack.
// Orders are grouped into trips (1 order per trip, or a batch of orders).
//
// It uses exactly the same routing and timing as scoring.ts, so the animated
// counters always agree with the computed score for those orders.

import { PACK_SECONDS_PER_ORDER, PICK_SECONDS_PER_LINE, WALK_SPEED_MPS } from './config';
import type { Cell } from './grid';
import { slotOfProduct, type Layout } from './layouts';
import { pathBetweenNodes, type WarehouseModel } from './model';
import { groupIntoTrips, routeForTrip } from './scoring';
import type { Order } from './types';

type StepBase = {
  start: number; // seconds since the replay started
  duration: number; // seconds
  tripIdx: number; // index into timeline.trips
  distanceBefore: number; // metres walked before this step began
  ordersDoneBefore: number; // orders packed before this step began
};

export type Step =
  | (StepBase & { kind: 'walk'; path: Cell[]; distance: number })
  | (StepBase & { kind: 'pick'; node: number; lines: number })
  | (StepBase & { kind: 'pack'; node: number; orders: number });

export type Timeline = {
  orders: Order[];
  trips: Order[][];
  steps: Step[];
  stopsByTrip: number[][]; // route stops (nodes) for each trip
  duration: number; // total seconds
  totalDistance: number; // total metres
};

export function buildTimeline(model: WarehouseModel, layout: Layout, orders: Order[], batchSize = 1): Timeline {
  const slotOf = slotOfProduct(layout);
  const trips = groupIntoTrips(orders, batchSize);
  const steps: Step[] = [];
  const stopsByTrip: number[][] = [];
  let t = 0;
  let walked = 0;
  let ordersDone = 0;

  trips.forEach((trip, tripIdx) => {
    const route = routeForTrip(model, slotOf, trip);
    stopsByTrip.push(route.stops);
    const base = () => ({ start: t, tripIdx, distanceBefore: walked, ordersDoneBefore: ordersDone });

    // How many lines (of all orders in the trip) are picked at each pick point.
    const linesAt = new Map<number, number>();
    for (const code of trip.flatMap((o) => o.items)) {
      const node = model.grid.slots[slotOf.get(code)!].node;
      linesAt.set(node, (linesAt.get(node) ?? 0) + 1);
    }

    for (let i = 1; i < route.stops.length; i++) {
      const from = route.stops[i - 1];
      const to = route.stops[i];
      const distance = model.dist[from][to];
      if (distance > 0) {
        const duration = distance / WALK_SPEED_MPS;
        steps.push({ ...base(), kind: 'walk', duration, path: pathBetweenNodes(model, from, to), distance });
        t += duration;
        walked += distance;
      }
      const isLast = i === route.stops.length - 1;
      if (isLast) {
        // Back at the dock: pack every order of the trip.
        const duration = trip.length * PACK_SECONDS_PER_ORDER;
        steps.push({ ...base(), kind: 'pack', duration, node: to, orders: trip.length });
        t += duration;
      } else {
        const lines = linesAt.get(to)!;
        steps.push({ ...base(), kind: 'pick', duration: lines * PICK_SECONDS_PER_LINE, node: to, lines });
        t += lines * PICK_SECONDS_PER_LINE;
      }
    }
    ordersDone += trip.length;
  });

  return { orders, trips, steps, stopsByTrip, duration: t, totalDistance: walked };
}

export type ReplayState = {
  x: number; // picker position in grid coordinates (cells, fractional)
  y: number;
  distance: number; // metres walked so far
  ordersDone: number;
  tripIdx: number; // trip currently being worked on
  kind: Step['kind'] | 'done';
};

// Where is the picker, and what are the counters, at time t?
export function sampleTimeline(model: WarehouseModel, tl: Timeline, t: number): ReplayState {
  const dock = model.grid.nodes[0];
  if (tl.steps.length === 0) return { x: dock.x, y: dock.y, distance: 0, ordersDone: 0, tripIdx: 0, kind: 'done' };
  if (t >= tl.duration) {
    return { x: dock.x, y: dock.y, distance: tl.totalDistance, ordersDone: tl.orders.length, tripIdx: tl.trips.length - 1, kind: 'done' };
  }

  // Binary search for the last step that started at or before t.
  let lo = 0;
  let hi = tl.steps.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tl.steps[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  const step = tl.steps[lo];
  const f = Math.min(1, Math.max(0, (t - step.start) / step.duration)); // 0..1 progress in this step
  const common = { ordersDone: step.ordersDoneBefore, tripIdx: step.tripIdx, kind: step.kind };

  if (step.kind === 'walk') {
    // Move along the path: each path segment is 1 cell = 1 m.
    const along = f * step.distance;
    const i = Math.min(Math.floor(along), step.path.length - 2);
    const frac = along - i;
    const a = step.path[i];
    const b = step.path[i + 1];
    return { ...common, x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, distance: step.distanceBefore + along };
  }

  const at = model.grid.nodes[step.node];
  return { ...common, x: at.x, y: at.y, distance: step.distanceBefore };
}
