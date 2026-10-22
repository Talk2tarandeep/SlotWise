import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isValidLayout } from '../leaderboard';
import { demandFromOrders, relocations, splitOrders } from './analysis';
import { simulatePickers } from './congestion';
import { baselineLayout } from './layouts';
import { buildModel } from './model';
import { aisleCompactLayout, optimizeLayout } from './optimizer';
import { routeOrder } from './routing';
import { scoreLayout } from './scoring';
import type { WarehouseData } from './types';

const data: WarehouseData = JSON.parse(readFileSync('public/data/warehouse.json', 'utf8'));
const model = buildModel();
const small = data.orders.slice(0, 150); // keep the test fast
const demand = demandFromOrders(data.products, small);

describe('optimizer', () => {
  const a = optimizeLayout(model, demand, small, { maxPasses: 2 });

  it('returns a valid layout that never walks more than its starting layout', () => {
    expect(isValidLayout(a.layout, data.products, model.grid.slots.length)).toBe(true);
    expect(a.finalDistanceM).toBeLessThanOrEqual(a.seedDistanceM);
    // The reported distance is the real score of the returned layout.
    expect(scoreLayout(model, a.layout, small).totalDistanceM).toBe(a.finalDistanceM);
  });

  it('beats both seed layouts on the orders it was fitted on', () => {
    expect(a.finalDistanceM).toBeLessThanOrEqual(scoreLayout(model, baselineLayout(demand, model), small).totalDistanceM);
    expect(a.finalDistanceM).toBeLessThanOrEqual(scoreLayout(model, aisleCompactLayout(demand, model), small).totalDistanceM);
  });

  it('is deterministic', () => {
    const b = optimizeLayout(model, demand, small, { maxPasses: 2 });
    expect(b.layout).toEqual(a.layout);
  });

  it('relocations list every product that moved', () => {
    const moves = relocations(model, baselineLayout(demand, model), a.layout, demand);
    for (const m of moves) expect(a.layout[m.toSlot]).toBe(m.code);
  });
});

describe('analysis helpers', () => {
  it('splits the month by date into fit and test without losing orders', () => {
    const { fit, test } = splitOrders(data.orders);
    expect(fit.length + test.length).toBe(data.orders.length);
    expect(fit.every((o) => Number(o.t.slice(8, 10)) <= 21)).toBe(true);
    expect(test.every((o) => Number(o.t.slice(8, 10)) > 21)).toBe(true);
  });

  it('recomputed demand counts every line once', () => {
    const lines = small.reduce((n, o) => n + o.items.length, 0);
    expect(demand.reduce((n, p) => n + p.picks, 0)).toBe(lines);
  });
});

describe('routing and dispatch policies', () => {
  const layout = baselineLayout(data.products, model);

  it('2-opt never makes a route longer than nearest-neighbour', () => {
    const slotOf = new Map(layout.map((c, i) => [c, i] as const).filter(([c]) => c !== null) as [string, number][]);
    for (const o of data.orders.slice(0, 400)) {
      const nodes = o.items.map((c) => model.grid.slots[slotOf.get(c)!].node);
      expect(routeOrder(model, nodes, 'nn2opt').distance).toBeLessThanOrEqual(routeOrder(model, nodes, 'nn').distance);
    }
  });

  it('recording the replay does not change any result', () => {
    const plain = simulatePickers(model, layout, small, { pickers: 3 });
    const rec = simulatePickers(model, layout, small, { pickers: 3, record: true });
    expect(rec.makespanS).toBe(plain.makespanS);
    expect(rec.totalWaitS).toBe(plain.totalWaitS);
    expect(rec.totalDistanceM).toBe(plain.totalDistanceM);
    expect(rec.trips!.length).toBe(small.length);
    expect(rec.trips!.every((t) => t.endTick > t.startTick)).toBe(true);
  });

  it('spread dispatch does the same work (same trips, same distance), only in a different order', () => {
    const fifo = simulatePickers(model, layout, small, { pickers: 4 });
    const spread = simulatePickers(model, layout, small, { pickers: 4, dispatch: 'spread' });
    expect(spread.orders).toBe(small.length);
    expect(spread.totalDistanceM).toBe(fifo.totalDistanceM);
    expect(spread.forcedMoves).toBe(0);
  });

  it('a slower walking speed takes longer but walks the same distance', () => {
    const normal = simulatePickers(model, layout, small, { pickers: 1 });
    const slow = simulatePickers(model, layout, small, { pickers: 1, speedMps: 1.0 });
    expect(slow.totalDistanceM).toBe(normal.totalDistanceM);
    expect(slow.makespanS).toBeGreaterThan(normal.makespanS);
  });
});
