// Game layer: points and challenges.
// These are GAME scores for fun and motivation. They are deliberately kept
// separate from the operational metrics (distance, time, waiting), which are
// shown on their own and never mixed with points.

import { STATUS, type MultiPickerResult } from './sim/congestion';
import { slotOfProduct, type Layout } from './sim/layouts';
import type { WarehouseModel } from './sim/model';
import { routeForTrip, tripTimeSeconds, type Score } from './sim/scoring';
import type { Order } from './sim/types';

// Points per completed trip in a replay:
//   +10 per order line picked,
//   +1 per second the trip beats "par" (the same orders on the Auto baseline, no congestion),
//   -1 per 5 seconds spent waiting in congestion.
export const POINTS_PER_LINE = 10;

export type TripPoints = { trip: number; picker: number; endTick: number; points: number; lines: number; bonus: number; penalty: number };

export function replayPoints(model: WarehouseModel, sim: MultiPickerResult, orders: Order[], baseline: Layout): TripPoints[] {
  const baseSlots = slotOfProduct(baseline);
  return sim.trips!.flatMap((tr, idx) => {
    if (tr.endTick < 0) return [];
    const tripOrders = tr.orders.map((i) => orders[i]);
    const lines = tripOrders.reduce((n, o) => n + o.items.length, 0);
    const par = tripTimeSeconds(routeForTrip(model, baseSlots, tripOrders).distance, lines, tripOrders.length);
    const actual = (tr.endTick - tr.startTick) * sim.tickS;
    let waitTicks = 0;
    for (let t = tr.startTick; t < tr.endTick; t++) if (sim.status![tr.picker][t] === STATUS.waiting) waitTicks++;
    const bonus = Math.max(0, Math.round(par - actual));
    const penalty = Math.round((waitTicks * sim.tickS) / 5);
    return [{ trip: idx, picker: tr.picker, endTick: tr.endTick, lines, bonus, penalty, points: Math.max(0, POINTS_PER_LINE * lines + bonus - penalty) }];
  });
}

export type Challenge = { id: string; title: string; detail: string; done: boolean; status: string };

type ChallengeInput = {
  player: Score;
  baseline: Score;
  playerBatch: Score;
  baselineBatch: Score;
  optimized?: Score;
  playerStart: string;
  ownLayout: boolean; // false = an untouched copy of Original / baseline / optimizer
  congestion: { player: number; baseline: number; pickers: number } | null; // waiting seconds, full month
};

const m = (x: number) => `${Math.abs(x).toFixed(0)} m`;

export function challenges(c: ChallengeInput): Challenge[] {
  const gap = c.player.totalDistanceM - c.baseline.totalDistanceM;
  const batchGap = c.playerBatch.totalDistanceM - c.baselineBatch.totalDistanceM;
  const copied = 'Untouched copy, make a swap of your own';
  const list: Challenge[] = [
    {
      id: 'beat-baseline',
      title: 'Beat the auto baseline',
      detail: 'My layout walks less than "fast movers nearest the dock" (single-order picking, all orders).',
      done: c.ownLayout && gap < 0,
      status: !c.ownLayout ? copied : gap < 0 ? `Beaten by ${m(gap)}` : `${m(gap)} to go`,
    },
    {
      id: 'from-scratch',
      title: 'Start from scratch',
      detail: 'Beat the baseline starting from the Original layout (not from a copy of the baseline or optimizer).',
      done: gap < 0 && c.playerStart === 'original',
      status: c.playerStart === 'original' ? (gap < 0 ? 'Done' : `${m(gap)} to go`) : 'Reset to Original to attempt',
    },
    {
      id: 'batch',
      title: 'Batch master',
      detail: 'Also beat the baseline when orders are picked in batches of 4.',
      done: c.ownLayout && batchGap < 0,
      status: !c.ownLayout ? copied : batchGap < 0 ? `Beaten by ${m(batchGap)}` : `${m(batchGap)} to go`,
    },
  ];
  if (c.optimized) {
    const optGap = c.player.totalDistanceM - c.optimized.totalDistanceM;
    const within = optGap <= c.optimized.totalDistanceM * 0.01;
    list.push({
      id: 'optimizer',
      title: 'Match the optimizer',
      detail: 'Get within 1% of the Optimized layout (all orders, single-order picking).',
      done: c.ownLayout && within,
      status: !c.ownLayout ? copied : optGap < 0 ? `Better by ${m(optGap)}!` : within ? 'Within 1%' : `${m(optGap)} behind`,
    });
  }
  if (c.congestion) {
    const w = c.congestion.player - c.congestion.baseline;
    list.push({
      id: 'congestion',
      title: 'Clear the aisles',
      detail: `Less congestion waiting than the baseline with ${c.congestion.pickers} pickers (all orders).`,
      done: c.ownLayout && w < 0,
      status: !c.ownLayout ? copied : w < 0 ? `${(-w / 60).toFixed(0)} min less waiting` : `${(w / 60).toFixed(0)} min more waiting`,
    });
  }
  return list;
}
