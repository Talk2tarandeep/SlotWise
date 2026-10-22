// Congestion results (shown with 2+ pickers): all orders of the month
// worked by N pickers at once, per layout. Numbers come from simulatePickers().

import { congestionFor } from '../scene/helpers';
import { InSampleNote } from './InSampleNote';
import { pctChange } from '../sim/scoring';
import { batchSizeFor, LAYOUT_NAMES, LAYOUT_ORDER, useStore, type LayoutKey } from '../store';


function hours(s: number) {
  return `${(s / 3600).toFixed(1)} h`;
}

export function CongestionCard() {
  const model = useStore((s) => s.model)!;
  const data = useStore((s) => s.data)!;
  const layouts = useStore((s) => s.layouts);
  const pickers = useStore((s) => s.pickers);
  const mode = useStore((s) => s.mode);
  const active = useStore((s) => s.active);
  if (pickers < 2) return null;

  const batchSize = batchSizeFor(mode);
  // Optimized appears once the optimizer has finished.
  const ROWS = LAYOUT_ORDER.filter((k) => layouts[k].length > 0);
  const results = Object.fromEntries(
    ROWS.map((key) => [key, congestionFor(model, layouts[key], data.orders, pickers, batchSize)]),
  ) as Partial<Record<LayoutKey, ReturnType<typeof congestionFor>>>;
  // Original, Auto baseline and My layout always exist.
  const ref = results.original!;
  const baselineRes = results.baseline!;
  const playerRes = results.player!;

  return (
    <section>
      <h2>
        Congestion · {pickers} pickers · {mode === 'batch' ? `batch of ${batchSize}` : 'single order'}
      </h2>
      <table className="results">
        <thead>
          <tr>
            <th>Layout</th>
            <th>All done</th>
            <th>Waiting</th>
            <th>Avg s/order</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((key) => {
            const r = results[key]!;
            const d = pctChange(r.totalWaitS, ref.totalWaitS);
            return (
              <tr key={key} className={key === active ? 'active' : ''}>
                <td>{LAYOUT_NAMES[key]}</td>
                <td>{hours(r.makespanS)}</td>
                <td>
                  {(r.totalWaitS / 60).toFixed(0)} min
                  {key !== 'original' && (
                    <span className={d < -0.5 ? 'good' : d > 0.5 ? 'bad' : 'muted'}>
                      {' '}
                      ({d > 0 ? '+' : ''}
                      {d.toFixed(0)}%)
                    </span>
                  )}
                </td>
                <td>{r.avgOrderTimeS.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {layouts.optimized.length > 0 && <InSampleNote />}
      <p className="muted">
        All {ref.orders.toLocaleString()} orders, shared queue. A picker waits when the next aisle cell is occupied (cross-aisles never block).
        "Waiting" is time lost to congestion, summed over pickers; avg s/order includes it.
      </p>
      {ref.forcedMoves + baselineRes.forcedMoves + playerRes.forcedMoves > 0 && (
        <p className="muted bad">Deadlock safety valve fired; results include forced moves.</p>
      )}
    </section>
  );
}
