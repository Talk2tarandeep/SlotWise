import { describe, expect, it } from 'vitest';
import { FLOOR, type FloorConfig } from './config';
import { DOCK_NODE, isWalkable } from './grid';
import { baselineLayout, originalLayout, swapSlots } from './layouts';
import { buildModel, pathBetweenNodes } from './model';
import { routeOrder } from './routing';
import { orderTimeSeconds, scoreLayout } from './scoring';
import type { Product } from './types';

const model = buildModel(FLOOR);
const { grid } = model;

describe('(a) paths stay on walkable floor', () => {
  it('every node-to-node path avoids rack cells and moves one cell at a time', () => {
    for (let a = 0; a < grid.nodes.length; a++) {
      for (let b = 0; b < grid.nodes.length; b++) {
        const path = pathBetweenNodes(model, a, b);
        expect(path.length - 1).toBe(model.dist[a][b]); // path length matches the matrix
        for (let i = 0; i < path.length; i++) {
          expect(isWalkable(grid, path[i])).toBe(true);
          if (i > 0) {
            const step = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
            expect(step).toBe(1);
          }
        }
      }
    }
  });

  it('rack cells are not walkable', () => {
    for (const slot of grid.slots) expect(isWalkable(grid, slot.rackCell)).toBe(false);
  });
});

describe('(b) distances are symmetric and respect racks', () => {
  it('dist[a][b] === dist[b][a] for all nodes', () => {
    for (let a = 0; a < grid.nodes.length; a++)
      for (let b = 0; b < grid.nodes.length; b++) expect(model.dist[a][b]).toBe(model.dist[b][a]);
  });

  it('dock-to-slot walking distance is never shorter than straight line', () => {
    const dock = grid.nodes[DOCK_NODE];
    for (const slot of grid.slots) {
      const p = grid.nodes[slot.node];
      expect(model.dist[DOCK_NODE][slot.node]).toBeGreaterThanOrEqual(Math.hypot(p.x - dock.x, p.y - dock.y));
    }
  });

  it('going to the neighbouring aisle mid-rack means walking around the rack', () => {
    // Middle row (pos 5) of aisle 0 and aisle 1: 5 m apart in a straight line,
    // but the picker must go out to a cross-aisle and back in.
    const a = grid.slots.find((s) => s.aisle === 0 && s.pos === 5)!.node;
    const b = grid.slots.find((s) => s.aisle === 1 && s.pos === 5)!.node;
    const straight = Math.hypot(grid.nodes[a].x - grid.nodes[b].x, grid.nodes[a].y - grid.nodes[b].y);
    expect(straight).toBe(5);
    // Rows 3..12 are racks; pos 5 is row 8. Front cross-aisle edge is row 2
    // (6 m away), back cross-aisle edge is row 13 (5 m away). Shortest is via
    // the back: 5 m out, 5 m across, 5 m back in = 15 m.
    expect(model.dist[a][b]).toBe(15);
  });
});

describe('(c) tiny hand-checkable warehouse', () => {
  // 2 aisles, 2 slots per face, 1 m aisles and cross-aisles. Grid 6 x 4:
  //   y=3  . . . . . .      (back cross-aisle)
  //   y=2  R . R R . R
  //   y=1  R . R R . R
  //   y=0  D . . . . .      (front cross-aisle, D = dock)
  //        0 1 2 3 4 5  = x
  const tiny: FloorConfig = { aisles: 2, slotsPerFace: 2, aisleWidth: 1, rackDepth: 1, crossAisleWidth: 1, dock: { x: 0, y: 0 } };
  const m = buildModel(tiny);

  it('has the expected grid and nodes', () => {
    expect(m.grid.width).toBe(6);
    expect(m.grid.height).toBe(4);
    expect(m.grid.slots.length).toBe(8);
    // node 0 = dock, aisle 0 pick points at x=1, aisle 1 at x=4
    expect(m.grid.nodes).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
    ]);
  });

  it('dock distances match hand counting', () => {
    expect(m.dist[0]).toEqual([0, 2, 3, 5, 6]);
  });

  it('routes an order with nearest-neighbour and computes its time', () => {
    // Slot 0 = aisle 0 left, pos 0 (node 1). Slot 7 = aisle 1 right, pos 1 (node 4).
    const products: Product[] = [
      { code: 'A', desc: '', picks: 1, rank: 1 },
      { code: 'B', desc: '', picks: 1, rank: 2 },
    ];
    let layout = originalLayout(products, 8); // A in slot 0, B in slot 1
    layout = swapSlots(layout, 1, 7); // move B to slot 7

    // Dock -> node 1 (2 m) -> node 4 (out to y=0, across 3, up 2 = 6 m) -> dock (6 m) = 14 m
    const route = routeOrder(m, [m.grid.slots[7].node, m.grid.slots[0].node]);
    expect(route.stops).toEqual([0, 1, 4, 0]);
    expect(route.distance).toBe(14);

    const score = scoreLayout(m, layout, [{ id: 'x', t: '', items: ['B', 'A'] }]);
    expect(score.totalDistanceM).toBe(14);
    // 14 m / 1.2 m/s + 2 lines * 10 s + 30 s packing
    expect(score.avgPickTimeS).toBeCloseTo(14 / 1.2 + 20 + 30, 6);
    expect(orderTimeSeconds(14, 2)).toBeCloseTo(61.6667, 3);
  });

  it('baseline puts the most-picked product nearest the dock', () => {
    const products: Product[] = [
      { code: 'SLOW', desc: '', picks: 1, rank: 2 },
      { code: 'FAST', desc: '', picks: 9, rank: 1 },
    ];
    const layout = baselineLayout(products, m);
    // Slots 0 and 2 (aisle 0, pos 0, both sides) are 2 m from the dock; lowest id wins.
    expect(layout[0]).toBe('FAST');
    expect(layout[2]).toBe('SLOW');
  });
});
