// Builds the warehouse floor grid: which cells are walkable, where each slot
// is, and the "nodes" the picker travels between (dock + aisle pick points).

import { FLOOR, type FloorConfig } from './config';

export type Cell = { x: number; y: number };

export type Slot = {
  id: number; // 0..slotCount-1
  aisle: number; // 0..aisles-1
  side: 'L' | 'R'; // rack on the left or right of the aisle
  pos: number; // 0 = nearest the front cross-aisle
  rackCell: Cell; // the rack cell holding the product (not walkable)
  node: number; // index into grid.nodes where the picker stands to pick it
};

export type Grid = {
  config: FloorConfig;
  width: number;
  height: number;
  walkable: boolean[]; // indexed by y * width + x
  slots: Slot[];
  // nodes[0] is the dock. nodes[1..] are pick points in the middle of each
  // aisle, one per slot row. The left and right slot of the same row share
  // one pick point: the picker stands in the aisle and reaches either side.
  nodes: Cell[];
};

export const DOCK_NODE = 0;

export function cellIndex(grid: Grid, c: Cell): number {
  return c.y * grid.width + c.x;
}

export function isWalkable(grid: Grid, c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < grid.width && c.y < grid.height && grid.walkable[cellIndex(grid, c)];
}

export function buildGrid(cfg: FloorConfig = FLOOR): Grid {
  const blockWidth = 2 * cfg.rackDepth + cfg.aisleWidth; // rack + aisle + rack
  const width = cfg.aisles * blockWidth;
  const height = 2 * cfg.crossAisleWidth + cfg.slotsPerFace;
  const walkable = new Array<boolean>(width * height).fill(true);

  const firstSlotRow = cfg.crossAisleWidth;
  const nodes: Cell[] = [{ ...cfg.dock }];
  const slots: Slot[] = [];

  for (let a = 0; a < cfg.aisles; a++) {
    const x0 = a * blockWidth;
    const leftRackFace = x0 + cfg.rackDepth - 1; // rack column touching the aisle
    const rightRackFace = x0 + cfg.rackDepth + cfg.aisleWidth;
    const aisleCentre = x0 + cfg.rackDepth + Math.floor(cfg.aisleWidth / 2);

    // Mark both racks (full depth) as blocked along the slot rows.
    for (let p = 0; p < cfg.slotsPerFace; p++) {
      const y = firstSlotRow + p;
      for (let d = 0; d < cfg.rackDepth; d++) {
        walkable[y * width + (x0 + d)] = false;
        walkable[y * width + (rightRackFace + d)] = false;
      }
    }

    // One pick point per slot row, in the middle of the aisle.
    const firstNode = nodes.length;
    for (let p = 0; p < cfg.slotsPerFace; p++) {
      nodes.push({ x: aisleCentre, y: firstSlotRow + p });
    }

    // Slot ids: aisle by aisle, left face first, then right face, front to back.
    for (const side of ['L', 'R'] as const) {
      for (let p = 0; p < cfg.slotsPerFace; p++) {
        slots.push({
          id: slots.length,
          aisle: a,
          side,
          pos: p,
          rackCell: { x: side === 'L' ? leftRackFace : rightRackFace, y: firstSlotRow + p },
          node: firstNode + p,
        });
      }
    }
  }

  const grid: Grid = { config: cfg, width, height, walkable, slots, nodes };
  if (!isWalkable(grid, cfg.dock)) throw new Error('Dock must be on a walkable cell');
  return grid;
}
