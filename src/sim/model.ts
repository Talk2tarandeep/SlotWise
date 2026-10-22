// The warehouse model: grid + a precomputed node-to-node distance matrix.
//
// We run one BFS from every node (dock + 60 pick points) once at start-up.
// After that, any distance lookup during routing/scoring is just dist[a][b].

import { CELL_SIZE_M, FLOOR, type FloorConfig } from './config';
import { buildGrid, cellIndex, type Cell, type Grid } from './grid';
import { bfs, reconstructPath, type BfsResult } from './pathfinding';

export type WarehouseModel = {
  grid: Grid;
  dist: number[][]; // dist[a][b] = walking distance in metres between nodes a and b
  bfsFromNode: BfsResult[]; // kept so we can rebuild the actual path for animation
};

export function buildModel(cfg: FloorConfig = FLOOR): WarehouseModel {
  const grid = buildGrid(cfg);
  const bfsFromNode = grid.nodes.map((node) => bfs(grid, node));
  const dist = bfsFromNode.map((result) =>
    grid.nodes.map((target) => {
      const steps = result.dist[cellIndex(grid, target)];
      if (steps < 0) throw new Error('Unreachable node: check the floor layout');
      return steps * CELL_SIZE_M;
    }),
  );
  return { grid, dist, bfsFromNode };
}

// The cell-by-cell path between two nodes (used by the 3D picker animation).
export function pathBetweenNodes(model: WarehouseModel, from: number, to: number): Cell[] {
  return reconstructPath(model.grid, model.bfsFromNode[from], model.grid.nodes[to]);
}
