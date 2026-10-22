// A layout says which product sits in which slot.
// layout[slotId] = product code, or null for an empty slot.

import { DOCK_NODE } from './grid';
import type { WarehouseModel } from './model';
import type { Product } from './types';

export type Layout = (string | null)[];

function emptyLayout(slotCount: number, productCount: number): Layout {
  if (productCount > slotCount) throw new Error(`${productCount} products do not fit in ${slotCount} slots`);
  return new Array<string | null>(slotCount).fill(null);
}

// Original: products in StockCode order, filling slots 0, 1, 2, ...
// This stands in for an arbitrary "as-received" slotting.
export function originalLayout(products: Product[], slotCount: number): Layout {
  const layout = emptyLayout(slotCount, products.length);
  const byCode = [...products].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  byCode.forEach((p, i) => (layout[i] = p.code));
  return layout;
}

// Auto baseline: most-picked products go to the slots closest to the dock
// (by walking distance). Ties: lower product rank / lower slot id first.
export function baselineLayout(products: Product[], model: WarehouseModel): Layout {
  const slots = model.grid.slots;
  const layout = emptyLayout(slots.length, products.length);
  const slotsByDistance = [...slots].sort(
    (a, b) => model.dist[DOCK_NODE][a.node] - model.dist[DOCK_NODE][b.node] || a.id - b.id,
  );
  const productsByPicks = [...products].sort((a, b) => a.rank - b.rank);
  productsByPicks.forEach((p, i) => (layout[slotsByDistance[i].id] = p.code));
  return layout;
}

// Swap the contents of two slots (either may be empty). Returns a new layout.
export function swapSlots(layout: Layout, a: number, b: number): Layout {
  const next = [...layout];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

// product code -> slot id, for fast lookups while scoring.
export function slotOfProduct(layout: Layout): Map<string, number> {
  const map = new Map<string, number>();
  layout.forEach((code, slotId) => {
    if (code !== null) map.set(code, slotId);
  });
  return map;
}
