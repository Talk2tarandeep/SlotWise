// Route for one order: dock -> pick points -> dock.
//
// Default rule (same for every layout, so comparisons are fair):
// nearest-neighbour by walking distance. From where the picker stands, go to
// the closest pick point not yet visited; ties go to the lower node index.
// When everything is picked, walk back to the dock.
//
// Optional policy 'nn2opt': start from the nearest-neighbour route, then apply
// 2-opt: keep reversing a stretch of the route whenever that makes it shorter.
// This removes most backtracking (e.g. going deep into an aisle, leaving, and
// coming back later). It is applied to ALL layouts when selected.

import { DOCK_NODE } from './grid';
import type { WarehouseModel } from './model';

export type RoutingPolicy = 'nn' | 'nn2opt';

export type Route = {
  stops: number[]; // node sequence, starts and ends with the dock
  distance: number; // metres
};

export function routeOrder(model: WarehouseModel, pickNodes: number[], policy: RoutingPolicy = 'nn'): Route {
  // Two lines at the same pick point = one stop (picker is already there).
  const remaining = [...new Set(pickNodes)].sort((a, b) => a - b);
  const stops = [DOCK_NODE];
  let distance = 0;
  let here = DOCK_NODE;

  while (remaining.length > 0) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (model.dist[here][remaining[i]] < model.dist[here][remaining[best]]) best = i;
    }
    const next = remaining.splice(best, 1)[0];
    distance += model.dist[here][next];
    stops.push(next);
    here = next;
  }

  distance += model.dist[here][DOCK_NODE];
  stops.push(DOCK_NODE);
  return policy === 'nn2opt' ? twoOpt(model, { stops, distance }) : { stops, distance };
}

// 2-opt: for every pair of edges (a-b, c-d), check if reconnecting as (a-c, b-d)
// (i.e. reversing the stops between them) is shorter. Repeat until no change.
// Deterministic: always scans in the same order and takes the first improvement.
function twoOpt(model: WarehouseModel, route: Route): Route {
  const s = [...route.stops];
  const d = model.dist;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < s.length - 2; i++) {
      for (let k = i + 1; k < s.length - 1; k++) {
        const delta = d[s[i - 1]][s[k]] + d[s[i]][s[k + 1]] - d[s[i - 1]][s[i]] - d[s[k]][s[k + 1]];
        if (delta < 0) {
          // reverse s[i..k]
          for (let a = i, b = k; a < b; a++, b--) [s[a], s[b]] = [s[b], s[a]];
          improved = true;
        }
      }
    }
  }
  let distance = 0;
  for (let i = 1; i < s.length; i++) distance += d[s[i - 1]][s[i]];
  return { stops: s, distance };
}
