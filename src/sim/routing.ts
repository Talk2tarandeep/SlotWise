// Route for one order: dock -> pick points -> dock.
//
// Rule (same for every layout, so comparisons are fair):
// nearest-neighbour by walking distance. From where the picker stands, go to
// the closest pick point not yet visited; ties go to the lower node index.
// When everything is picked, walk back to the dock.

import { DOCK_NODE } from './grid';
import type { WarehouseModel } from './model';

export type Route = {
  stops: number[]; // node sequence, starts and ends with the dock
  distance: number; // metres
};

export function routeOrder(model: WarehouseModel, pickNodes: number[]): Route {
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
  return { stops, distance };
}
