// Runs the layout optimizer off the main thread so the 3D view stays smooth.
// Fits on orders from days 1-21 only (the app evaluates on days 22-30).

import { demandFromOrders, splitOrders } from '../sim/analysis';
import { buildModel } from '../sim/model';
import { optimizeLayout, type OptimizeProgress, type OptimizeResult } from '../sim/optimizer';
import type { Order, Product } from '../sim/types';

export type OptimizerRequest = { products: Product[]; orders: Order[]; batchSize: number };
export type OptimizerMessage =
  | { type: 'progress'; progress: OptimizeProgress }
  | { type: 'done'; result: OptimizeResult; fitDemand: Product[] }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<OptimizerRequest>) => {
  try {
    const { products, orders, batchSize } = e.data;
    const model = buildModel();
    const { fit } = splitOrders(orders);
    const fitDemand = demandFromOrders(products, fit);
    let last = 0;
    const result = optimizeLayout(model, fitDemand, fit, {
      batchSize,
      timeBudgetMs: 60_000,
      onProgress: (progress) => {
        // Throttle progress messages to ~5 per second.
        const now = Date.now();
        if (now - last > 200) {
          last = now;
          postMessage({ type: 'progress', progress } satisfies OptimizerMessage);
        }
      },
    });
    postMessage({ type: 'done', result, fitDemand } satisfies OptimizerMessage);
  } catch (err) {
    postMessage({ type: 'error', message: String(err) } satisfies OptimizerMessage);
  }
};
