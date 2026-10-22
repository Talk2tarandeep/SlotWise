// Several pickers working at the same time, with simple aisle congestion.
//
// Time moves in ticks. One tick = time to walk one 1 m cell (1 / 1.2 s),
// so a 10 s pick is 12 ticks and 30 s packing is 36 ticks (whole numbers).
//
// Rules:
//   * Orders wait in one queue (time order). A picker that is free at the
//     dock takes the next trip (1 order, or a batch of orders).
//   * Each trip follows the same nearest-neighbour route as scoring.ts.
//   * Congestion: a picker may not step into an AISLE cell that another
//     picker is standing in; it waits a tick and tries again. Cross-aisles
//     and the dock are wide open areas and never block.
//   * Two pickers walking straight at each other may pass (aisles are 3 m wide).
//
// With 1 picker nobody ever waits, and the result equals scoreLayout()
// exactly (checked by a test).

import { PACK_SECONDS_PER_ORDER, PICK_SECONDS_PER_LINE, WALK_SPEED_MPS, CELL_SIZE_M } from './config';
import { cellIndex } from './grid';
import { slotOfProduct, type Layout } from './layouts';
import { pathBetweenNodes, type WarehouseModel } from './model';
import { groupIntoTrips, routeForTrip } from './scoring';
import type { Order } from './types';

export const TICK_S = CELL_SIZE_M / WALK_SPEED_MPS;
const PICK_TICKS = Math.round(PICK_SECONDS_PER_LINE / TICK_S); // 12
const PACK_TICKS = Math.round(PACK_SECONDS_PER_ORDER / TICK_S); // 36
const MAX_WAIT_TICKS = 600; // safety valve against deadlock (never hit on the real data; counted if it is)

// One tick of a picker's plan: step into a cell, or stay put (picking/packing).
// `ordersDone` > 0 marks the tick on which a trip's packing finishes.
type PlanStep = { move: number | null; ordersDone: number };

type PickerState = {
  cell: number;
  plan: PlanStep[];
  i: number; // next step in plan
  waitStreak: number;
  waitTicks: number;
  tripStartTick: number;
};

export type MultiPickerResult = {
  pickers: number;
  ticks: number; // total ticks until the last order is packed
  makespanS: number; // same, in seconds
  totalDistanceM: number;
  totalWaitS: number; // time spent blocked by other pickers, summed over pickers
  waitPerPickerS: number[];
  orders: number;
  avgOrderTimeS: number; // total trip time (incl. waiting) / orders, same definition as scoring
  forcedMoves: number; // times the safety valve fired (should be 0)
  // Recorded only when asked (for the 3D replay):
  frames?: Int32Array[]; // frames[p][tick] = cell index of picker p
  distanceByTick?: Int32Array; // cumulative metres walked by all pickers
  waitByTick?: Int32Array; // cumulative waiting ticks of all pickers
  ordersDoneByTick?: Int32Array; // cumulative orders packed
  tripStops?: number[][][]; // tripStops[p] = route stops of each trip picker p did
};

export function simulatePickers(
  model: WarehouseModel,
  layout: Layout,
  orders: Order[],
  options: { pickers: number; batchSize?: number; record?: boolean },
): MultiPickerResult {
  const { grid } = model;
  const { pickers, batchSize = 1, record = false } = options;
  const slotOf = slotOfProduct(layout);
  const trips = groupIntoTrips(orders, batchSize);
  const dockCell = cellIndex(grid, grid.nodes[0]);

  // Aisle cells = walkable cells between the front and back cross-aisles.
  const firstRow = grid.config.crossAisleWidth;
  const lastRow = firstRow + grid.config.slotsPerFace - 1;
  const isAisleCell = (cell: number) => {
    const y = Math.floor(cell / grid.width);
    return y >= firstRow && y <= lastRow;
  };

  // Turn one trip into a tick-by-tick plan.
  const planTrip = (trip: Order[]) => {
    const route = routeForTrip(model, slotOf, trip);
    const linesAt = new Map<number, number>();
    for (const code of trip.flatMap((o) => o.items)) {
      const node = grid.slots[slotOf.get(code)!].node;
      linesAt.set(node, (linesAt.get(node) ?? 0) + 1);
    }
    const plan: PlanStep[] = [];
    for (let s = 1; s < route.stops.length; s++) {
      const path = pathBetweenNodes(model, route.stops[s - 1], route.stops[s]);
      for (const c of path.slice(1)) plan.push({ move: cellIndex(grid, c), ordersDone: 0 });
      const isLast = s === route.stops.length - 1;
      const dwell = isLast ? trip.length * PACK_TICKS : linesAt.get(route.stops[s])! * PICK_TICKS;
      for (let k = 0; k < dwell; k++) plan.push({ move: null, ordersDone: 0 });
    }
    plan[plan.length - 1].ordersDone = trip.length;
    return { plan, stops: route.stops };
  };

  const state: PickerState[] = Array.from({ length: pickers }, () => ({
    cell: dockCell,
    plan: [],
    i: 0,
    waitStreak: 0,
    waitTicks: 0,
    tripStartTick: 0,
  }));

  let nextTrip = 0;
  let tick = 0;
  let distance = 0;
  let waits = 0;
  let ordersDone = 0;
  let tripTimeTicks = 0; // sum of trip durations, including waiting
  let forcedMoves = 0;

  const frames = record ? state.map(() => [] as number[]) : null;
  const distLog: number[] = [];
  const waitLog: number[] = [];
  const doneLog: number[] = [];
  const tripStops: number[][][] = state.map(() => []);
  const snapshot = () => {
    if (!frames) return;
    state.forEach((p, k) => frames[k].push(p.cell));
    distLog.push(distance);
    waitLog.push(waits);
    doneLog.push(ordersDone);
  };

  snapshot();
  for (;;) {
    // Free pickers (plan finished) take the next trip from the queue.
    for (const p of state) {
      if (p.i >= p.plan.length && nextTrip < trips.length) {
        const { plan, stops } = planTrip(trips[nextTrip++]);
        p.plan = plan;
        p.i = 0;
        p.tripStartTick = tick;
        if (record) tripStops[state.indexOf(p)].push(stops);
      }
    }
    if (state.every((p) => p.i >= p.plan.length)) break;

    // Where everyone stands and wants to go at the start of this tick.
    const startCell = state.map((p) => p.cell);
    const wants = state.map((p) => (p.i < p.plan.length ? p.plan[p.i].move : null));
    const moved = state.map(() => false);

    state.forEach((p, k) => {
      if (p.i >= p.plan.length) return; // idle at the dock, nothing left to do
      const target = wants[k];
      if (target !== null && isAisleCell(target)) {
        const blocked = state.some(
          (q, j) =>
            j !== k &&
            // someone already moved into that cell this tick, or
            ((moved[j] && q.cell === target) ||
              // someone stands there and is not simply passing me head-on
              (!moved[j] && startCell[j] === target && wants[j] !== startCell[k])),
        );
        if (blocked && p.waitStreak < MAX_WAIT_TICKS) {
          p.waitStreak++;
          p.waitTicks++;
          waits++;
          return;
        }
        if (blocked) forcedMoves++;
      }
      if (target !== null) {
        p.cell = target;
        distance++;
        moved[k] = true;
      }
      p.waitStreak = 0;
      const step = p.plan[p.i++];
      if (step.ordersDone > 0) {
        ordersDone += step.ordersDone;
        tripTimeTicks += tick + 1 - p.tripStartTick;
      }
    });

    tick++;
    snapshot();
  }

  const result: MultiPickerResult = {
    pickers,
    ticks: tick,
    makespanS: tick * TICK_S,
    totalDistanceM: distance * CELL_SIZE_M,
    totalWaitS: waits * TICK_S,
    waitPerPickerS: state.map((p) => p.waitTicks * TICK_S),
    orders: ordersDone,
    avgOrderTimeS: ordersDone ? (tripTimeTicks * TICK_S) / ordersDone : 0,
    forcedMoves,
  };
  if (frames) {
    result.frames = frames.map((f) => Int32Array.from(f));
    result.distanceByTick = Int32Array.from(distLog);
    result.waitByTick = Int32Array.from(waitLog);
    result.ordersDoneByTick = Int32Array.from(doneLog);
    result.tripStops = tripStops;
  }
  return result;
}
