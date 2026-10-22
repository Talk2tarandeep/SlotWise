import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellIndex } from './grid';
import { buildHeatmap } from './heatmap';
import { baselineLayout, originalLayout } from './layouts';
import { buildModel } from './model';
import { scoreLayout } from './scoring';
import type { WarehouseData } from './types';

const data: WarehouseData = JSON.parse(readFileSync('public/data/warehouse.json', 'utf8'));
const model = buildModel();

describe('traffic heatmap', () => {
  for (const [name, layout] of [
    ['original', originalLayout(data.products, model.grid.slots.length)],
    ['baseline', baselineLayout(data.products, model)],
  ] as const) {
    const heat = buildHeatmap(model, layout, data.orders);

    it(`${name}: cell steps add up to the total walking distance`, () => {
      const steps = heat.cellPasses.reduce((a, b) => a + b, 0);
      expect(steps).toBe(scoreLayout(model, layout, data.orders).totalDistanceM);
    });

    it(`${name}: no traffic on rack cells`, () => {
      for (const slot of model.grid.slots) expect(heat.cellPasses[cellIndex(model.grid, slot.rackCell)]).toBe(0);
    });

    it(`${name}: per-aisle stops add up to per-node stops`, () => {
      const total = heat.stopsPerNode.reduce((a, b) => a + b, 0);
      expect(heat.stopsPerAisle.reduce((a, b) => a + b, 0)).toBe(total);
    });
  }
});
