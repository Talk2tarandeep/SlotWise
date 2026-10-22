// Results card: every order of the month replayed on each layout, in the
// chosen picking mode. All numbers come from scoreLayout() in the sim engine.

import { sameLayout } from '../leaderboard';
import { BATCH_SIZE } from '../sim/config';
import { pctChange } from '../sim/scoring';
import { LAYOUT_NAMES, useStore, type LayoutKey, type PickingMode } from '../store';

const ROWS: LayoutKey[] = ['original', 'baseline', 'player'];

function signedPct(value: number): string {
  if (Math.abs(value) < 0.05) return '0.0%';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
}

export function ResultsCard() {
  const singleScores = useStore((s) => s.scores);
  const batchScores = useStore((s) => s.batchScores);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const active = useStore((s) => s.active);
  const layouts = useStore((s) => s.layouts);
  if (!singleScores || !batchScores) return null;

  const scores = mode === 'batch' ? batchScores : singleScores;
  // Effect of batching on the active layout (same layout, same orders).
  const batchSaving = pctChange(batchScores[active].totalDistanceM, singleScores[active].totalDistanceM);
  const modes: [PickingMode, string][] = [
    ['single', 'Single order'],
    ['batch', `Batch of ${BATCH_SIZE}`],
  ];

  const original = scores.original;
  // A win only counts once the player has actually changed the layout.
  const changed = !sameLayout(layouts.player, layouts.original);
  const beatsBaseline = changed && scores.player.totalDistanceM < scores.baseline.totalDistanceM;
  const originalBeatsBaseline = scores.original.totalDistanceM < scores.baseline.totalDistanceM;
  const gapM = scores.player.totalDistanceM - scores.baseline.totalDistanceM;

  return (
    <section>
      <h2>Results · all {original.orders.toLocaleString()} orders</h2>
      <div className="segmented small" style={{ marginBottom: 8 }}>
        {modes.map(([key, label]) => (
          <button key={key} className={key === mode ? 'on' : ''} onClick={() => setMode(key)}>
            {label}
          </button>
        ))}
      </div>
      <table className="results">
        <thead>
          <tr>
            <th>Layout</th>
            <th>Total km</th>
            <th>Avg s/order</th>
            <th>vs Original</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((key) => {
            const s = scores[key];
            const d = pctChange(s.totalDistanceM, original.totalDistanceM);
            const rowClass = [key === active ? 'active' : '', key === 'player' && beatsBaseline ? 'win' : ''].join(' ');
            return (
              <tr key={key} className={rowClass}>
                <td>{LAYOUT_NAMES[key]}</td>
                <td>{(s.totalDistanceM / 1000).toFixed(2)}</td>
                <td>{s.avgPickTimeS.toFixed(1)}</td>
                <td className={d < -0.05 ? 'good' : d > 0.05 ? 'bad' : ''}>{signedPct(d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        {mode === 'batch'
          ? `${original.trips.toLocaleString()} trips of up to ${BATCH_SIZE} consecutive orders. `
          : `${original.trips.toLocaleString()} trips, one order each. `}
        "vs Original" is the change in total walking distance. Avg pick time per order includes walking, 10 s per line and 30 s
        packing per order.
      </p>
      <p className="muted">
        Batching {BATCH_SIZE} orders per trip changes walking on {LAYOUT_NAMES[active]} by{' '}
        <b className={batchSaving < 0 ? 'good' : 'bad'}>{signedPct(batchSaving)}</b> vs single-order picking.
      </p>

      {beatsBaseline ? (
        <div className="banner win">🏆 My layout beats the auto baseline by {Math.abs(gapM).toFixed(0)} m!</div>
      ) : changed ? (
        <div className="banner">{gapM.toFixed(0)} m more walking than the baseline. Keep swapping.</div>
      ) : null}
      {mode === 'batch' && originalBeatsBaseline && (
        <p className="muted">
          Note: with batching, the auto baseline walks <b className="bad">more</b> than Original. The baseline puts a few products at the
          front of aisle 6, which Original leaves empty. A trip of {BATCH_SIZE} orders visits most aisles anyway, so every extra aisle entered
          costs more than being a few metres closer to the dock. Toggle the floor heatmap to see it.
        </p>
      )}
    </section>
  );
}
