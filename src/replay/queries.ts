// Read-only questions about a recorded replay at a given tick:
// "what is picker 2 doing?", "how many orders are done?", "what happened so far?".
// Pure functions of (recording, tick), so scrubbing back and forth is always consistent.

import { STATUS, STATUS_NAMES, type MultiPickerResult, type TripRecord } from '../sim/congestion';
import { PICK_SECONDS_PER_LINE } from '../sim/config';
import type { WarehouseModel } from '../sim/model';
import type { Order } from '../sim/types';
import { aisleOfCell } from '../scene/helpers';

const clampTick = (sim: MultiPickerResult, tick: number) => Math.max(0, Math.min(Math.floor(tick), sim.ticks));

export type PickerInfo = {
  picker: number;
  status: (typeof STATUS_NAMES)[number];
  cell: number;
  aisle: number; // -1 = not in an aisle
  trip: TripRecord | null;
  nextStop: number | null; // index into trip.stops the picker is heading to / working at
  targetSkus: string[]; // products to pick at the next stop
  stopsDone: number; // pick stops completed in the current trip
  stopsTotal: number;
  distanceM: number; // walked so far
  waitS: number; // waited so far
  ordersDone: number; // orders this picker has packed so far
};

export function pickerInfo(sim: MultiPickerResult, p: number, tickIn: number): PickerInfo {
  const tick = clampTick(sim, tickIn);
  const frames = sim.frames![p];
  const status = sim.status![p];
  const tripIdx = sim.tripAt![p][tick];
  const trip = tripIdx >= 0 ? sim.trips![tripIdx] : null;
  const pickTicks = Math.round(PICK_SECONDS_PER_LINE / sim.tickS);

  let distance = 0;
  let waits = 0;
  for (let t = 0; t < tick; t++) {
    if (frames[t + 1] !== frames[t]) distance++;
    if (status[t] === STATUS.waiting) waits++;
  }
  let ordersDone = 0;
  for (const tr of sim.trips!) if (tr.picker === p && tr.endTick >= 0 && tr.endTick <= tick) ordersDone += tr.orders.length;

  let nextStop: number | null = null;
  let stopsDone = 0;
  if (trip) {
    // Stops reached so far; a pick stop counts as done once its picking time is over.
    for (let s = 1; s < trip.stops.length - 1; s++) {
      const arrived = trip.arriveTicks[s];
      const leaves = arrived === undefined ? Infinity : arrived + trip.skusAtStop[s].length * pickTicks;
      if (tick >= leaves) stopsDone++;
      else if (nextStop === null) nextStop = s;
    }
    if (nextStop === null) nextStop = trip.stops.length - 1; // heading back to / packing at the dock
  }

  return {
    picker: p,
    status: STATUS_NAMES[status[tick]],
    cell: frames[tick],
    aisle: -1, // filled by the caller that has the grid (see withAisle)
    trip,
    nextStop,
    targetSkus: trip && nextStop !== null ? trip.skusAtStop[nextStop] : [],
    stopsDone,
    stopsTotal: trip ? trip.stops.length - 2 : 0,
    distanceM: distance,
    waitS: waits * sim.tickS,
    ordersDone,
  };
}

export function withAisle(model: WarehouseModel, info: PickerInfo): PickerInfo {
  return { ...info, aisle: aisleOfCell(model.grid, info.cell) };
}

export type LiveKpis = {
  elapsedS: number;
  ordersDone: number;
  ordersTotal: number;
  distanceM: number;
  waitS: number;
  avgOrderTimeS: number | null; // completed trips only (incl. waiting), per order
  utilization: number | null; // share of picker time spent on trips
  throughputPerH: number | null; // orders packed per hour of elapsed time
};

export function liveKpis(sim: MultiPickerResult, tickIn: number): LiveKpis {
  const tick = clampTick(sim, tickIn);
  let tripTicks = 0;
  let tripOrders = 0;
  for (const tr of sim.trips!) {
    if (tr.endTick >= 0 && tr.endTick <= tick) {
      tripTicks += tr.endTick - tr.startTick;
      tripOrders += tr.orders.length;
    }
  }
  let busy = 0;
  for (const st of sim.status!) for (let t = 0; t < tick; t++) if (st[t] !== STATUS.idle) busy++;
  const elapsedS = tick * sim.tickS;
  const ordersDone = sim.ordersDoneByTick![tick];
  return {
    elapsedS,
    ordersDone,
    ordersTotal: sim.orders,
    distanceM: sim.distanceByTick![tick],
    waitS: sim.waitByTick![tick] * sim.tickS,
    avgOrderTimeS: tripOrders ? (tripTicks * sim.tickS) / tripOrders : null,
    utilization: tick > 0 ? busy / (sim.pickers * tick) : null,
    throughputPerH: elapsedS > 0 ? ordersDone / (elapsedS / 3600) : null,
  };
}

// How many pickers stand in each aisle at a tick.
export function aisleOccupancy(model: WarehouseModel, sim: MultiPickerResult, tickIn: number): number[] {
  const tick = clampTick(sim, tickIn);
  const counts = new Array<number>(model.grid.config.aisles).fill(0);
  for (const f of sim.frames!) {
    const a = aisleOfCell(model.grid, f[tick]);
    if (a >= 0) counts[a]++;
  }
  return counts;
}

export type ReplayEvent = { tick: number; picker: number; kind: 'start' | 'wait' | 'packed'; text: string };

// Everything notable that happens in a replay, in time order.
export function replayEvents(model: WarehouseModel, sim: MultiPickerResult, orders: Order[]): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const ids = (tr: TripRecord) => tr.orders.map((i) => `#${orders[i].id}`).join(', ');
  const lines = (tr: TripRecord) => tr.orders.reduce((n, i) => n + orders[i].items.length, 0);
  for (const tr of sim.trips!) {
    events.push({ tick: tr.startTick, picker: tr.picker, kind: 'start', text: `started ${ids(tr)} (${lines(tr)} lines, ${tr.stops.length - 2} stops)` });
    if (tr.endTick >= 0) events.push({ tick: tr.endTick, picker: tr.picker, kind: 'packed', text: `packed ${ids(tr)}` });
  }
  for (const w of sim.waitEvents!) {
    const aisle = aisleOfCell(model.grid, w.cell);
    const where = aisle >= 0 ? `in aisle ${aisle + 1}` : 'at an aisle entrance';
    events.push({ tick: w.tick, picker: w.picker, kind: 'wait', text: `waiting ${where}, blocked by Picker ${w.blockedBy + 1}` });
  }
  const order = { start: 0, wait: 1, packed: 2 };
  return events.sort((a, b) => a.tick - b.tick || order[a.kind] - order[b.kind] || a.picker - b.picker);
}

// Next tick after `tick` where something changes (trip start, arrival at a stop, end of picking, packed).
// Used by the "step forward" button. Optionally only for one picker.
export function nextEventTick(sim: MultiPickerResult, tickIn: number, picker: number | null): number {
  const tick = clampTick(sim, tickIn);
  const pickTicks = Math.round(PICK_SECONDS_PER_LINE / sim.tickS);
  let best = sim.ticks;
  for (const tr of sim.trips!) {
    if (picker !== null && tr.picker !== picker) continue;
    const candidates = [tr.startTick, tr.endTick];
    tr.arriveTicks.forEach((a, s) => {
      if (a === undefined) return;
      candidates.push(a);
      if (s > 0 && s < tr.stops.length - 1) candidates.push(a + tr.skusAtStop[s].length * pickTicks);
    });
    for (const c of candidates) if (c > tick && c < best) best = c;
  }
  return best;
}
