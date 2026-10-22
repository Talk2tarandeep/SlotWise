// Honesty note shown wherever the Optimized layout is scored on the whole
// month: two thirds of those orders (1-21 Nov) are the ones it was fitted on,
// so the whole-month gain is optimistic. The fair, held-out figure is shown too.

import { pctChange } from '../sim/scoring';
import { useStore } from '../store';
import { heldOutComparison } from './evaluation';
import { signedPct } from './format';

export function InSampleNote() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layouts = useStore((s) => s.layouts);
  const optimizer = useStore((s) => s.optimizer);
  if (!model || !data || optimizer.status !== 'done' || !optimizer.fitDemand) return null;
  const rows = heldOutComparison(model, data, layouts.original, layouts.optimized, optimizer.fitDemand, optimizer.batchSize);
  const base = rows.find((r) => r.key === 'baseline')!;
  const opt = rows.find((r) => r.key === 'optimized')!;
  return (
    <p className="tiny-note">
      ⚠ Optimized is scored here on the whole month, which includes the days it was fitted on (1–21 Nov), so its gain looks bigger. On the
      unseen 22–30 Nov orders it walks <b>{signedPct(pctChange(opt.score.totalDistanceM, base.score.totalDistanceM))}</b> vs the auto baseline (see the
      Optimize tab).
    </p>
  );
}
