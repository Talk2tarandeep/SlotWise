// Shortest paths on the walkable grid using breadth-first search (BFS).
//
// Moves are 4-directional (up/down/left/right), each move = 1 cell = 1 m.
// With equal step costs BFS gives the same result as Dijkstra, and it can
// only ever step onto walkable cells, so paths never cut through racks.

import { cellIndex, isWalkable, type Cell, type Grid } from './grid';

// Fixed neighbour order keeps paths deterministic.
const STEPS: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export type BfsResult = {
  dist: Int32Array; // steps from the start to each cell, -1 = unreachable
  prev: Int32Array; // previous cell index on the shortest path, -1 = none
};

export function bfs(grid: Grid, start: Cell): BfsResult {
  const n = grid.width * grid.height;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const queue: number[] = [];

  const s = cellIndex(grid, start);
  dist[s] = 0;
  queue.push(s);

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % grid.width;
    const cy = Math.floor(cur / grid.width);
    for (const step of STEPS) {
      const next = { x: cx + step.x, y: cy + step.y };
      if (!isWalkable(grid, next)) continue;
      const ni = cellIndex(grid, next);
      if (dist[ni] !== -1) continue; // already reached by a shorter path
      dist[ni] = dist[cur] + 1;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  return { dist, prev };
}

// Walk the prev pointers back from the target to rebuild the path.
// Returns cells from start to target (inclusive).
export function reconstructPath(grid: Grid, result: BfsResult, target: Cell): Cell[] {
  let i = cellIndex(grid, target);
  if (result.dist[i] === -1) throw new Error(`Cell (${target.x},${target.y}) is unreachable`);
  const path: Cell[] = [];
  while (i !== -1) {
    path.push({ x: i % grid.width, y: Math.floor(i / grid.width) });
    i = result.prev[i];
  }
  return path.reverse();
}
