// "Local leaderboard": player layouts saved in this browser only.
// Each entry's score is recomputed from the real orders when shown.

import { useMemo, useState } from 'react';
import { loadEntries, sameLayout, saveEntries, type LeaderboardEntry } from '../leaderboard';
import { pctChange, scoreLayout } from '../sim/scoring';
import { useStore } from '../store';

export function Leaderboard() {
  const data = useStore((s) => s.data)!;
  const model = useStore((s) => s.model)!;
  const scores = useStore((s) => s.scores)!;
  const layouts = useStore((s) => s.layouts);
  const loadPlayerLayout = useStore((s) => s.loadPlayerLayout);
  const slotCount = model.grid.slots.length;

  const [entries, setEntries] = useState<LeaderboardEntry[]>(() => loadEntries(data.month, data.products, slotCount));
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Re-score every saved layout on all orders, best (shortest walk) first.
  const ranked = useMemo(
    () =>
      entries
        .map((entry) => ({ entry, score: scoreLayout(model, entry.layout, data.orders) }))
        .sort((a, b) => a.score.totalDistanceM - b.score.totalDistanceM),
    [entries, model, data.orders],
  );

  const isUnchanged = sameLayout(layouts.player, layouts.original) || sameLayout(layouts.player, layouts.baseline);
  const alreadySaved = entries.some((e) => sameLayout(e.layout, layouts.player));

  function persist(next: LeaderboardEntry[]) {
    setEntries(next);
    if (!saveEntries(next)) setMessage('This browser blocked local storage, so the entry is kept only until you reload.');
  }

  function save() {
    const entry: LeaderboardEntry = {
      id: `${Date.now()}`,
      name: name.trim().slice(0, 24) || 'Anonymous',
      savedAt: new Date().toISOString(),
      month: data.month,
      layout: [...layouts.player],
    };
    persist([...entries, entry]);
    setName('');
    setMessage(null);
  }

  return (
    <section>
      <h2>Local leaderboard</h2>
      <p className="muted">Saved in this browser only. Scores are recomputed from all {data.orders.length.toLocaleString()} orders.</p>

      <div className="row">
        <input
          className="text"
          placeholder="Your name"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isUnchanged && !alreadySaved && save()}
        />
        <button className="primary" onClick={save} disabled={isUnchanged || alreadySaved}>
          Save my layout
        </button>
      </div>
      {isUnchanged && <p className="muted">Make at least one swap in My layout to save it.</p>}
      {alreadySaved && !isUnchanged && <p className="muted">This exact layout is already on the board.</p>}
      {message && <p className="muted bad">{message}</p>}

      {ranked.length > 0 ? (
        <table className="results board">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>km</th>
              <th>vs base</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ entry, score }, i) => {
              const vsBase = pctChange(score.totalDistanceM, scores.baseline.totalDistanceM);
              return (
                <tr key={entry.id} className={score.totalDistanceM < scores.baseline.totalDistanceM ? 'win' : ''}>
                  <td>{i + 1}</td>
                  <td title={new Date(entry.savedAt).toLocaleString()}>{entry.name}</td>
                  <td>{(score.totalDistanceM / 1000).toFixed(2)}</td>
                  <td className={vsBase < -0.005 ? 'good' : 'bad'}>
                    {vsBase > 0 ? '+' : ''}
                    {vsBase.toFixed(2)}%
                  </td>
                  <td className="actions">
                    <button className="link" onClick={() => loadPlayerLayout(entry.layout)}>
                      load
                    </button>{' '}
                    <button className="link" onClick={() => persist(entries.filter((e) => e.id !== entry.id))} title="Delete">
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted">No saved layouts yet.</p>
      )}
      <p className="muted">
        Auto baseline to beat: {(scores.baseline.totalDistanceM / 1000).toFixed(2)} km
      </p>
    </section>
  );
}
