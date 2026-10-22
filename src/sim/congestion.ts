// Several pickers working at the same time, with simple aisle congestion.
// This is also the engine behind the 3D replay (for any number of pickers).
//
// Time moves in ticks. One tick = time to walk one 1 m cell (1 / walk speed),
// so at 1.2 m/s a 10 s pick is 12 ticks and 30 s packing is 36 ticks.
//
// Rules:
//   * Orders wait in one queue (time order). A picker that is free at the
//     dock takes the next trip (1 order, or a batch of orders).
//     Optional 'spread' dispatch: look a few trips ahead and take the one
//     that shares the fewest aisles with the other pickers' current trips.
//   * Each trip follows the same route rule as scoring.ts.
//   * Congestion: a picker may not step into an AISLE cell that another
//     picker is standing in; it waits a tick and tries again. Cross-aisles
//     and the dock are wide open areas and never block.
//   * Two pickers walking straight at each other may pass (aisles are 3 m wide).
//
// With 1 picker nobody ever waits, and the result equals scoreLayout()
// exactly (checked by a test).

import { CELL_SIZE_M, PACK_SECONDS_PER_ORDER, PICK_SECONDS_PER_LINE, WALK_SPEED_MPS } from './config';
import { cellIndex } from './grid';
import { slotOfProduct, type Layout } from './layouts';
import { pathBetweenNodes, type WarehouseModel } from './model';
import type { RoutingPolicy } from './routing';
import { groupIntoTrips, routeForTrip } from './scoring';
import type { Order } from './types';

// Tick length at the default walking speed (kept for existing callers/tests).
export const TICK_S = CELL_SIZE_M / WALK_SPEED_MPS;
const MAX_WAIT_TICKS = 600; // safety valve against deadlock (never hit on the real data; counted if it is)
const SPREAD_LOOKAHEAD = 6; // 'spread' dispatch: how many queued trips to consider
const SPREAD_MAX_SKIPS = 3; // ...and how often the oldest trip may be passed over

export type DispatchPolicy = 'fifo' | 'spread';

// What a picker is doing during a tick (recorded for the replay).
export const STATUS = { idle: 0, walking: 1, waiting: 2, picking: 3, packing: 4 } as const;
export const STATUS_NAMES = ['Idle', 'Walking', 'Waiting', 'Picking', 'Packing'] as const;

// One tick of a picker's plan.
type PlanStep = {
  move: number | null; // cell to step into, or null = stay (pick/pack)
  kind: 'walk' | 'pick' | 'pack';
  arriveStop: number; // >0: this step arrives at stop number arriveStop of the trip
  ordersDone: number; // >0: this tick finishes packing that many orders
};

// One trip as it actually happened (recorded for the replay).
export type TripRecord = {
  picker: number;
  orders: number[]; // indices into the orders array given to the simulation
  stops: number[]; // route nodes: dock, pick points..., dock
  skusAtStop: string[][]; // product codes picked at each stop (empty for the dock)
  startTick: number;
  arriveTicks: number[]; // tick the picker reached each stop (arriveTicks[0] = startTick)
  endTick: number; // tick packing finished (-1 if the simulation was cut short)
};

export type WaitEvent = { tick: number; picker: number; cell: number; blockedBy: number };

export type SimOptions = {
  pickers: number;
  batchSize?: number; // orders per trip (1 = single-order picking)
  record?: boolean; // keep per-tick data for the 3D replay
  speedMps?: number; // walking speed (default from config)
  routing?: RoutingPolicy; // default 'nn'
  dispatch?: DispatchPolicy; // default 'fifo'
};

export type MultiPickerResult = {
  pickers: number;
  tickS: number; // seconds per tick for this run
  ticks: number; // total ticks until the last order is packed
  makespanS: number; // same, in seconds
  totalDistanceM: number;
  totalWaitS: number; // time spent blocked by other pickers, summed over pickers
  waitPerPickerS: number[];
  busyS: number; // picker time spent on trips (walking, waiting, picking, packing), summed
  orders: number;
  avgOrderTimeS: number; // total trip time (incl. waiting) / orders, same definition as scoring
  forcedMoves: number; // times the safety valve fired (should be 0)
  // Recorded only when asked (for the 3D replay):
  frames?: Int32Array[]; // frames[p][tick] = cell index of picker p
  status?: Uint8Array[]; // status[p][tick] = STATUS value during tick -> tick+1
  tripAt?: Int32Array[]; // tripAt[p][tick] = index into trips, or -1
  trips?: TripRecord[];
  waitEvents?: WaitEvent[];
  distanceByTick?: Int32Array; // cumulative metres walked by all pickers
  waitByTick?: Int32Array; // cumulative waiting ticks of all pickers
  ordersDoneByTick?: Int32Array; // cumulative orders packed
};

type PickerState = {
  cell: number;
  plan: PlanStep[];
  i: number; // next step in plan
  trip: number; // index into tripRecords, or -1
  stopsReached: number; // how many stops of the current trip have been reached
  waitStreak: number;
  waitTicks: number;
  tripStartTick: number;
};

export function simulatePickers(model: WarehouseModel, layout: Layout, orders: Order[], options: SimOptions): MultiPickerResult {
  const { grid } = model;
  const { pickers, batchSize = 1, record = false, speedMps = WALK_SPEED_MPS, routing = 'nn', dispatch = 'fifo' } = options;
  const tickS = CELL_SIZE_M / speedMps;
  const pickTicks = Math.round(PICK_SECONDS_PER_LINE / tickS); // 12 at 1.2 m/s
  const packTicks = Math.round(PACK_SECONDS_PER_ORDER / tickS); // 36 at 1.2 m/s

  const slotOf = slotOfProduct(layout);
  const trips = groupIntoTrips(orders, batchSize);
  const orderIndex = new Map(orders.map((o, i) => [o, i]));
  const dockCell = cellIndex(grid, grid.nodes[0]);
  const nodeAisle = new Map(grid.slots.map((s) => [s.node, s.aisle]));

  // Aisle cells = walkable cells between the front and back cross-aisles.
  const firstRow = grid.config.crossAisleWidth;
  const lastRow = firstRow + grid.config.slotsPerFace - 1;
  const isAisleCell = (cell: number) => {
    const y = Math.floor(cell / grid.width);
    return y >= firstRow && y <= lastRow;
  };

  // Route every trip up front (needed by 'spread' dispatch, cheap anyway).
  const routes = trips.map((trip) => routeForTrip(model, slotOf, trip, routing));

  // Turn one trip into a tick-by-tick plan.
  const planTrip = (t: number) => {
    const trip = trips[t];
    const route = routes[t];
    const skusAt = new Map<number, string[]>();
    for (const code of trip.flatMap((o) => o.items)) {
      const node = grid.slots[slotOf.get(code)!].node;
      if (!skusAt.has(node)) skusAt.set(node, []);
      skusAt.get(node)!.push(code);
    }
    const plan: PlanStep[] = [];
    for (let s = 1; s < route.stops.length; s++) {
      const path = pathBetweenNodes(model, route.stops[s - 1], route.stops[s]);
      path.slice(1).forEach((c, k, arr) =>
        plan.push({ move: cellIndex(grid, c), kind: 'walk', arriveStop: k === arr.length - 1 ? s : 0, ordersDone: 0 }),
      );
      const isLast = s === route.stops.length - 1;
      const dwell = isLast ? trip.length * packTicks : skusAt.get(route.stops[s])!.length * pickTicks;
      for (let k = 0; k < dwell; k++) plan.push({ move: null, kind: isLast ? 'pack' : 'pick', arriveStop: 0, ordersDone: 0 });
    }
    plan[plan.length - 1].ordersDone = trip.length;
    const skusAtStop = route.stops.map((node, s) => (s === 0 || s === route.stops.length - 1 ? [] : skusAt.get(node)!));
    return { plan, stops: route.stops, skusAtStop };
  };

  const state: PickerState[] = Array.from({ length: pickers }, () => ({
    cell: dockCell,
    plan: [],
    i: 0,
    trip: -1,
    stopsReached: 0,
    waitStreak: 0,
    waitTicks: 0,
    tripStartTick: 0,
  }));

  // Queue of trips not yet started (indices into `trips`), oldest first.
  const queue = trips.map((_, i) => i);
  let headSkips = 0;
  const tripRecords: TripRecord[] = [];
  const recordedTrip: number[] = []; // tripRecords index -> trips index

  // Aisles a picker still has to visit on its current trip.
  const remainingAisles = (p: PickerState) => {
    const aisles = new Set<number>();
    if (p.trip < 0) return aisles;
    const stops = routes[recordedTrip[p.trip]].stops;
    for (let s = Math.max(1, p.stopsReached); s < stops.length - 1; s++) aisles.add(nodeAisle.get(stops[s])!);
    return aisles;
  };

  const takeNextTrip = (k: number): number => {
    if (dispatch === 'fifo' || queue.length === 1 || headSkips >= SPREAD_MAX_SKIPS) {
      headSkips = 0;
      return queue.shift()!;
    }
    // 'spread': prefer the queued trip that overlaps least with where others are working.
    const busy = new Set<number>();
    state.forEach((q, j) => j !== k && remainingAisles(q).forEach((a) => busy.add(a)));
    let best = 0;
    let bestOverlap = Infinity;
    for (let c = 0; c < Math.min(SPREAD_LOOKAHEAD, queue.length); c++) {
      const stops = routes[queue[c]].stops;
      let overlap = 0;
      for (let s = 1; s < stops.length - 1; s++) if (busy.has(nodeAisle.get(stops[s])!)) overlap++;
      if (overlap < bestOverlap) {
        best = c;
        bestOverlap = overlap;
      }
    }
    headSkips = best === 0 ? 0 : headSkips + 1;
    return queue.splice(best, 1)[0];
  };

  let tick = 0;
  let distance = 0;
  let waits = 0;
  let busyTicks = 0;
  let ordersDone = 0;
  let tripTimeTicks = 0; // sum of trip durations, including waiting
  let forcedMoves = 0;

  const frames = record ? state.map(() => [] as number[]) : null;
  const statusLog = state.map(() => [] as number[]);
  const tripLog = state.map(() => [] as number[]);
  const waitEvents: WaitEvent[] = [];
  const distLog: number[] = [];
  const waitLog: number[] = [];
  const doneLog: number[] = [];
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
    state.forEach((p, k) => {
      if (p.i >= p.plan.length && queue.length > 0) {
        const t = takeNextTrip(k);
        const { plan, stops, skusAtStop } = planTrip(t);
        p.plan = plan;
        p.i = 0;
        p.tripStartTick = tick;
        p.stopsReached = 0;
        p.trip = tripRecords.length;
        recordedTrip.push(t);
        tripRecords.push({
          picker: k,
          orders: trips[t].map((o) => orderIndex.get(o)!),
          stops,
          skusAtStop,
          startTick: tick,
          arriveTicks: [tick],
          endTick: -1,
        });
      }
    });
    if (state.every((p) => p.i >= p.plan.length)) break;

    // Where everyone stands and wants to go at the start of this tick.
    const startCell = state.map((p) => p.cell);
    const wants = state.map((p) => (p.i < p.plan.length ? p.plan[p.i].move : null));
    const moved = state.map(() => false);
    const statusNow = state.map(() => STATUS.idle as number);

    state.forEach((p, k) => {
      if (p.i >= p.plan.length) return; // idle at the dock, nothing left to do
      busyTicks++;
      const target = wants[k];
      if (target !== null && isAisleCell(target)) {
        const blocker = state.findIndex(
          (q, j) =>
            j !== k &&
            // someone already moved into that cell this tick, or
            ((moved[j] && q.cell === target) ||
              // someone stands there and is not simply passing me head-on
              (!moved[j] && startCell[j] === target && wants[j] !== startCell[k])),
        );
        if (blocker >= 0 && p.waitStreak < MAX_WAIT_TICKS) {
          if (p.waitStreak === 0 && record) waitEvents.push({ tick, picker: k, cell: p.cell, blockedBy: blocker });
          p.waitStreak++;
          p.waitTicks++;
          waits++;
          statusNow[k] = STATUS.waiting;
          return;
        }
        if (blocker >= 0) forcedMoves++;
      }
      const step = p.plan[p.i++];
      if (target !== null) {
        p.cell = target;
        distance++;
        moved[k] = true;
      }
      statusNow[k] = step.kind === 'walk' ? STATUS.walking : step.kind === 'pick' ? STATUS.picking : STATUS.packing;
      p.waitStreak = 0;
      if (step.arriveStop > 0) {
        p.stopsReached = step.arriveStop;
        tripRecords[p.trip].arriveTicks[step.arriveStop] = tick + 1;
      }
      if (step.ordersDone > 0) {
        ordersDone += step.ordersDone;
        tripTimeTicks += tick + 1 - p.tripStartTick;
        tripRecords[p.trip].endTick = tick + 1;
      }
    });

    if (record) {
      state.forEach((p, k) => {
        statusLog[k].push(statusNow[k]);
        tripLog[k].push(p.trip);
      });
    }
    // Once a trip's packing is done the picker is free again.
    state.forEach((p) => {
      if (p.i >= p.plan.length) p.trip = -1;
    });

    tick++;
    snapshot();
  }

  const result: MultiPickerResult = {
    pickers,
    tickS,
    ticks: tick,
    makespanS: tick * tickS,
    totalDistanceM: distance * CELL_SIZE_M,
    totalWaitS: waits * tickS,
    waitPerPickerS: state.map((p) => p.waitTicks * tickS),
    busyS: busyTicks * tickS,
    orders: ordersDone,
    avgOrderTimeS: ordersDone ? (tripTimeTicks * tickS) / ordersDone : 0,
    forcedMoves,
  };
  if (frames) {
    // Pad the per-tick logs so every array has one entry per frame (ticks + 1).
    result.frames = frames.map((f) => Int32Array.from(f));
    result.status = statusLog.map((s) => Uint8Array.from([...s, STATUS.idle]));
    result.tripAt = tripLog.map((t) => Int32Array.from([...t, -1]));
    result.trips = tripRecords;
    result.waitEvents = waitEvents;
    result.distanceByTick = Int32Array.from(distLog);
    result.waitByTick = Int32Array.from(waitLog);
    result.ordersDoneByTick = Int32Array.from(doneLog);
  }
  return result;
}
