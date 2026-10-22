import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { originalLayout } from './layouts';
import { buildModel } from './model';
import { scoreLayout } from './scoring';
import { buildTimeline, sampleTimeline } from './timeline';
import type { WarehouseData } from './types';

const data: WarehouseData = JSON.parse(readFileSync('public/data/warehouse.json', 'utf8'));
const model = buildModel();
const layout = originalLayout(data.products, model.grid.slots.length);
const sample = data.orders.slice(0, 20);

describe('replay timeline', () => {
  const tl = buildTimeline(model, layout, sample);
  const score = scoreLayout(model, layout, sample);

  it('matches the scoring engine for the same orders', () => {
    expect(tl.totalDistance).toBe(score.totalDistanceM);
    expect(tl.duration).toBeCloseTo(score.totalTimeS, 6);
  });

  it('counters at the end equal the totals and the picker is back at the dock', () => {
    const end = sampleTimeline(model, tl, tl.duration);
    expect(end.distance).toBe(tl.totalDistance);
    expect(end.ordersDone).toBe(sample.length);
    expect({ x: end.x, y: end.y }).toEqual(model.grid.nodes[0]);
  });

  it('distance walked never decreases over time', () => {
    let last = 0;
    for (let t = 0; t < tl.duration; t += 7) {
      const s = sampleTimeline(model, tl, t);
      expect(s.distance).toBeGreaterThanOrEqual(last);
      last = s.distance;
    }
  });
});
