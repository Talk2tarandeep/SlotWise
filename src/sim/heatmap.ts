// Visit / traffic heatmap: replay every order on a layout and count
//   * how many times the picker stops at each pick point, and
//   * how many times the picker steps onto each floor cell.
//
// Each step of a path enters exactly one cell, so the sum of all cell
// counts equals the total walking distance in metres (checked by a test).

import { DOCK_NODE } from './grid';
import { slotOfProduct, type Layout } from './layouts';
import { pathBetweenNodes, type WarehouseModel } from './model';
import { routeForOrder } from './scoring';
import type { Order } from './types';

export type Heatmap = {
  cellPasses: number[]; // indexed like grid.walkable (y * width + x)
  stopsPerNode: number[]; // indexed like grid.nodes
  stopsPerAisle: number[]; // stops summed per aisle
  maxCellPasses: number;
};

export function buildHeatmap(model: WarehouseModel, layout: Layout, orders: Order[]): Heatmap {
  const { grid } = model;
  const cellPasses = new Array<number>(grid.width * grid.height).fill(0);
  const stopsPerNode = new Array<number>(grid.nodes.length).fill(0);
  const slotOf = slotOfProduct(layout);

  // Paths between the same two nodes repeat a lot, so cache them.
  const pathCache = new Map<number, number[]>();
  const legCells = (from: number, to: number) => {
    const key = from * grid.nodes.length + to;
    let cells = pathCache.get(key);
    if (!cells) {
      // Skip the first cell: the picker is already standing there.
      cells = pathBetweenNodes(model, from, to)
        .slice(1)
        .map((c) => c.y * grid.width + c.x);
      pathCache.set(key, cells);
    }
    return cells;
  };

  for (const order of orders) {
    const { stops } = routeForOrder(model, slotOf, order);
    for (let i = 1; i < stops.length; i++) {
      for (const cell of legCells(stops[i - 1], stops[i])) cellPasses[cell]++;
      if (stops[i] !== DOCK_NODE) stopsPerNode[stops[i]]++;
    }
  }

  // Every slot of an aisle points at that aisle's pick nodes.
  const stopsPerAisle = new Array<number>(grid.config.aisles).fill(0);
  const nodeAisle = new Map<number, number>();
  for (const slot of grid.slots) nodeAisle.set(slot.node, slot.aisle);
  stopsPerNode.forEach((count, node) => {
    const aisle = nodeAisle.get(node);
    if (aisle !== undefined) stopsPerAisle[aisle] += count;
  });

  return { cellPasses, stopsPerNode, stopsPerAisle, maxCellPasses: Math.max(...cellPasses) };
}
