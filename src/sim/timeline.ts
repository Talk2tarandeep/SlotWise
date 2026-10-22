// Turns a few orders into a timed sequence of steps for the 3D replay:
// walk (along the BFS path) -> pick (10 s per line) -> ... -> walk -> pack (30 s).
//
// It uses exactly the same routing and timing as scoring.ts, so the animated
// counters always agree with the computed score for those orders.

import { PACK_SECONDS_PER_ORDER, PICK_SECONDS_PER_LINE, WALK_SPEED_MPS } from './config';
import type { Cell } from './grid';
import { slotOfProduct, type Layout } from './layouts';
import { pathBetweenNodes, type WarehouseModel } from './model';
import { routeForOrder } from './scoring';
import type { Order } from './types';

type StepBase = {
  start: number; // seconds since the replay started
  duration: number; // seconds
  orderIdx: number; // index into timeline.orders
  distanceBefore: number; // metres walked before this step began
  ordersDoneBefore: number; // orders packed before this step began
};

export type Step =
  | (StepBase & { kind: 'walk'; path: Cell[]; distance: number })
  | (StepBase & { kind: 'pick'; node: number; lines: number })
  | (StepBase & { kind: 'pack'; node: number });

export type Timeline = {
  orders: Order[];
  steps: Step[];
  stopsByOrder: number[][]; // route stops (nodes) for each order
  duration: number; // total seconds
  totalDistance: number; // total metres
};

export function buildTimeline(model: WarehouseModel, layout: Layout, orders: Order[]): Timeline {
  const slotOf = slotOfProduct(layout);
  const steps: Step[] = [];
  const stopsByOrder: number[][] = [];
  let t = 0;
  let walked = 0;

  orders.forEach((order, orderIdx) => {
    const route = routeForOrder(model, slotOf, order);
    stopsByOrder.push(route.stops);
    const base = () => ({ start: t, orderIdx, distanceBefore: walked, ordersDoneBefore: orderIdx });

    // How many lines are picked at each pick point of this order.
    const linesAt = new Map<number, number>();
    for (const code of order.items) {
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
        steps.push({ ...base(), kind: 'pack', duration: PACK_SECONDS_PER_ORDER, node: to });
        t += PACK_SECONDS_PER_ORDER;
      } else {
        const lines = linesAt.get(to)!;
        steps.push({ ...base(), kind: 'pick', duration: lines * PICK_SECONDS_PER_LINE, node: to, lines });
        t += lines * PICK_SECONDS_PER_LINE;
      }
    }
  });

  return { orders, steps, stopsByOrder, duration: t, totalDistance: walked };
}

export type ReplayState = {
  x: number; // picker position in grid coordinates (cells, fractional)
  y: number;
  distance: number; // metres walked so far
  ordersDone: number;
  orderIdx: number; // order currently being worked on
  kind: Step['kind'] | 'done';
};

// Where is the picker, and what are the counters, at time t?
export function sampleTimeline(model: WarehouseModel, tl: Timeline, t: number): ReplayState {
  const dock = model.grid.nodes[0];
  if (tl.steps.length === 0) return { x: dock.x, y: dock.y, distance: 0, ordersDone: 0, orderIdx: 0, kind: 'done' };
  if (t >= tl.duration) {
    return { x: dock.x, y: dock.y, distance: tl.totalDistance, ordersDone: tl.orders.length, orderIdx: tl.orders.length - 1, kind: 'done' };
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
  const common = { ordersDone: step.ordersDoneBefore, orderIdx: step.orderIdx, kind: step.kind };

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
