import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FloorConfig } from './config';
import { simulatePickers, TICK_S } from './congestion';
import { baselineLayout, originalLayout, swapSlots } from './layouts';
import { buildModel } from './model';
import { scoreLayout } from './scoring';
import type { Product, WarehouseData } from './types';

const data: WarehouseData = JSON.parse(readFileSync('public/data/warehouse.json', 'utf8'));
const model = buildModel();
const layout = baselineLayout(data.products, model);

describe('multiple pickers with congestion', () => {
  for (const batchSize of [1, 4]) {
    it(`1 picker (batch ${batchSize}) never waits and matches scoreLayout exactly`, () => {
      const sim = simulatePickers(model, layout, data.orders, { pickers: 1, batchSize });
      const score = scoreLayout(model, layout, data.orders, batchSize);
      expect(sim.totalWaitS).toBe(0);
      expect(sim.totalDistanceM).toBe(score.totalDistanceM);
      expect(sim.makespanS).toBeCloseTo(score.totalTimeS, 3);
      expect(sim.avgOrderTimeS).toBeCloseTo(score.avgPickTimeS, 6);
      expect(sim.orders).toBe(data.orders.length);
    });
  }

  it('3 pickers walk the same distance, finish sooner, and never deadlock', () => {
    const one = simulatePickers(model, layout, data.orders, { pickers: 1 });
    const three = simulatePickers(model, layout, data.orders, { pickers: 3 });
    expect(three.totalDistanceM).toBe(one.totalDistanceM);
    expect(three.makespanS).toBeLessThan(one.makespanS);
    expect(three.orders).toBe(data.orders.length);
    expect(three.forcedMoves).toBe(0);
  });

  it('two pickers never stand in the same aisle cell', () => {
    const sim = simulatePickers(model, layout, data.orders.slice(0, 60), { pickers: 4, record: true });
    const firstRow = model.grid.config.crossAisleWidth;
    const lastRow = firstRow + model.grid.config.slotsPerFace - 1;
    for (let t = 0; t < sim.frames![0].length; t++) {
      const aisleCells = sim.frames!.map((f) => f[t]).filter((c) => {
        const y = Math.floor(c / model.grid.width);
        return y >= firstRow && y <= lastRow;
      });
      expect(new Set(aisleCells).size).toBe(aisleCells.length);
    }
  });

  it('tiny warehouse: second picker waits while the first picks in the same aisle', () => {
    // 1 aisle, 3 slots deep. Order A picks at the front pick point (y=1);
    // order B picks at the back one (y=3) and must walk past A, who is picking.
    const tiny: FloorConfig = { aisles: 1, slotsPerFace: 3, aisleWidth: 1, rackDepth: 1, crossAisleWidth: 1, dock: { x: 1, y: 0 } };
    const m = buildModel(tiny);
    const products: Product[] = ['A', 'B'].map((code, i) => ({ code, desc: '', picks: 1, rank: i + 1 }));
    const lay = swapSlots(originalLayout(products, m.grid.slots.length), 1, 2); // A: pos 0, B: pos 2
    const orders = [
      { id: '1', t: '', items: ['A'] },
      { id: '2', t: '', items: ['B'] },
    ];
    const sim = simulatePickers(m, lay, orders, { pickers: 2 });
    // Both start at the dock. Tick 0: picker 1 steps into (1,1), so picker 2
    // is blocked. Ticks 1-12: picker 1 picks there, picker 2 still blocked.
    // Tick 13: picker 1 walks back to the dock while picker 2 walks in:
    // a head-on pass, allowed. So picker 2 waited exactly 13 ticks.
    expect(sim.waitPerPickerS[0]).toBe(0);
    expect(sim.waitPerPickerS[1]).toBeCloseTo(13 * TICK_S, 9);
    expect(sim.totalDistanceM).toBe(scoreLayout(m, lay, orders).totalDistanceM);
  });
});
