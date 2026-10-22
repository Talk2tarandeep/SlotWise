// `npm run score`: replay every order in public/data/warehouse.json on the
// Original and Auto-baseline layouts and print the results.

import { readFileSync } from 'node:fs';
import { FLOOR } from '../src/sim/config';
import { baselineLayout, originalLayout } from '../src/sim/layouts';
import { buildModel } from '../src/sim/model';
import { pctChange, scoreLayout, type Score } from '../src/sim/scoring';
import type { WarehouseData } from '../src/sim/types';

const data: WarehouseData = JSON.parse(readFileSync('public/data/warehouse.json', 'utf8'));
const model = buildModel(FLOOR);

const original = scoreLayout(model, originalLayout(data.products, model.grid.slots.length), data.orders);
const baseline = scoreLayout(model, baselineLayout(data.products, model), data.orders);

console.log(`Month ${data.month}: ${original.orders} orders, ${original.lines} order lines, ${data.products.length} products`);
console.log(`Floor: ${FLOOR.aisles} aisles, ${model.grid.slots.length} slots, grid ${model.grid.width} x ${model.grid.height} m\n`);

function row(name: string, s: Score) {
  const km = (s.totalDistanceM / 1000).toFixed(2).padStart(8);
  const avgM = s.avgDistanceM.toFixed(1).padStart(8);
  const avgT = s.avgPickTimeS.toFixed(1).padStart(10);
  const dDist = pctChange(s.totalDistanceM, original.totalDistanceM).toFixed(1).padStart(7);
  const dTime = pctChange(s.avgPickTimeS, original.avgPickTimeS).toFixed(1).padStart(7);
  console.log(`${name.padEnd(14)}${km}${avgM}${avgT}${dDist}%${dTime}%`);
}

console.log(`${'Layout'.padEnd(14)}${'Total km'.padStart(8)}${'m/order'.padStart(8)}${'s/order'.padStart(10)}${'dDist'.padStart(8)}${'dTime'.padStart(8)}`);
row('Original', original);
row('Auto baseline', baseline);
