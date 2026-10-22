// Results card: every order of the month replayed on each layout.
// All numbers come from scoreLayout() in the sim engine.

import { pctChange } from '../sim/scoring';
import { LAYOUT_NAMES, useStore, type LayoutKey } from '../store';

const ROWS: LayoutKey[] = ['original', 'baseline', 'player'];

function signedPct(value: number): string {
  if (Math.abs(value) < 0.05) return '0.0%';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
}

export function ResultsCard() {
  const scores = useStore((s) => s.scores);
  const active = useStore((s) => s.active);
  const swaps = useStore((s) => s.swaps);
  if (!scores) return null;

  const original = scores.original;
  const beatsBaseline = scores.player.totalDistanceM < scores.baseline.totalDistanceM;
  const gapM = scores.player.totalDistanceM - scores.baseline.totalDistanceM;

  return (
    <section>
      <h2>Results · all {original.orders.toLocaleString()} orders</h2>
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
      <p className="muted">"vs Original" is the change in total walking distance. Avg pick time includes walking, 10 s per line and 30 s packing.</p>

      {beatsBaseline ? (
        <div className="banner win">🏆 My layout beats the auto baseline by {Math.abs(gapM).toFixed(0)} m!</div>
      ) : swaps > 0 ? (
        <div className="banner">{gapM.toFixed(0)} m more walking than the baseline. Keep swapping.</div>
      ) : null}
    </section>
  );
}
