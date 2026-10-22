// `npm run score`: replay every order in public/data/warehouse.json on the
// Original and Auto-baseline layouts, in single-order and batch picking,
// and print the results.

import { readFileSync } from 'node:fs';
import { BATCH_SIZE, FLOOR } from '../src/sim/config';
import { baselineLayout, originalLayout } from '../src/sim/layouts';
import { buildModel } from '../src/sim/model';
import { pctChange, scoreLayout, type Score } from '../src/sim/scoring';
import type { WarehouseData } from '../src/sim/types';

const data: WarehouseData = JSON.parse(readFileSync('public/data/warehouse.json', 'utf8'));
const model = buildModel(FLOOR);
const layouts = {
  Original: originalLayout(data.products, model.grid.slots.length),
  'Auto baseline': baselineLayout(data.products, model),
};

console.log(`Month ${data.month}: ${data.orders.length} orders, ${data.products.length} products`);
console.log(`Floor: ${FLOOR.aisles} aisles, ${model.grid.slots.length} slots, grid ${model.grid.width} x ${model.grid.height} m`);

for (const [title, batchSize] of [
  ['Single-order picking (1 order per trip)', 1],
  [`Batch picking (${BATCH_SIZE} orders per trip)`, BATCH_SIZE],
] as const) {
  const scores = Object.entries(layouts).map(([name, layout]) => [name, scoreLayout(model, layout, data.orders, batchSize)] as const);
  const reference = scores[0][1];
  console.log(`\n${title}: ${reference.trips} trips, ${reference.lines} order lines`);
  console.log(`${'Layout'.padEnd(14)}${'Total km'.padStart(9)}${'m/order'.padStart(9)}${'s/order'.padStart(9)}${'dDist'.padStart(8)}${'dTime'.padStart(8)}`);
  for (const [name, s] of scores) row(name, s, reference);
}

function row(name: string, s: Score, ref: Score) {
  console.log(
    name.padEnd(14) +
      (s.totalDistanceM / 1000).toFixed(2).padStart(9) +
      s.avgDistanceM.toFixed(1).padStart(9) +
      s.avgPickTimeS.toFixed(1).padStart(9) +
      `${pctChange(s.totalDistanceM, ref.totalDistanceM).toFixed(1)}%`.padStart(8) +
      `${pctChange(s.avgPickTimeS, ref.avgPickTimeS).toFixed(1)}%`.padStart(8),
  );
}
