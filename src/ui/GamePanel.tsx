// Game tab: rearrange products (swap game), earn game points in the replay,
// follow the active orders, and complete challenges. Game points are kept
// apart from the operational metrics on the Dashboard.

import { useMemo } from 'react';
import { challenges, POINTS_PER_LINE, replayPoints } from '../game';
import { congestionFor, useReplayOrders, useReplaySim } from '../scene/helpers';
import { slotLabel } from '../sim/analysis';
import { useStore } from '../store';
import { PickerDetails } from './Dashboard';
import { isOwnLayout } from './evaluation';
import { Leaderboard } from './Leaderboard';

const CHALLENGE_PICKERS = 4;

export function GamePanel() {
  return (
    <>
      <SwapCard />
      <PointsCard />
      <ActiveOrdersCard />
      <ChallengesCard />
      <Leaderboard />
    </>
  );
}

// The swap game (unchanged rules): click a slot, click another, they swap.
function SwapCard() {
  const active = useStore((s) => s.active);
  const selected = useStore((s) => s.selected);
  const swaps = useStore((s) => s.swaps);
  const lastSwapDeltaM = useStore((s) => s.lastSwapDeltaM);
  const model = useStore((s) => s.model);
  const playerLayout = useStore((s) => s.layouts.player);
  const optimizerDone = useStore((s) => s.optimizer.status === 'done');
  const optimized = useStore((s) => s.layouts.optimized);
  const { setActive, clearSelection, resetPlayer, loadPlayerLayout } = useStore.getState();

  return (
    <section>
      <h2>Rearrange the warehouse</h2>
      {active !== 'player' ? (
        <>
          <p className="muted">Move products between slots to cut walking. Your changes go into "My layout".</p>
          <button className="primary" onClick={() => setActive('player')}>
            Edit My layout
          </button>
        </>
      ) : (
        <div className="game">
          <p className="muted">Click a slot to pick up its product, then click another slot to swap. Every swap re-scores all orders of the month.</p>
          {selected !== null && model && (
            <p className="selected-info">
              Holding <b>{playerLayout[selected] ?? 'empty slot'}</b> from {slotLabel(model, selected)}{' '}
              <button className="link" onClick={clearSelection}>
                cancel
              </button>
            </p>
          )}
          <p className="muted">
            Swaps: <b>{swaps}</b>
            {lastSwapDeltaM !== null && (
              <>
                {' · last swap '}
                <b className={lastSwapDeltaM < 0 ? 'good' : lastSwapDeltaM > 0 ? 'bad' : ''}>
                  {lastSwapDeltaM > 0 ? '+' : ''}
                  {lastSwapDeltaM.toFixed(0)} m
                </b>{' '}
                walking (whole month)
              </>
            )}
          </p>
          <div className="row">
            <button onClick={() => resetPlayer('original')}>Reset to Original</button>
            <button onClick={() => resetPlayer('baseline')}>Start from baseline</button>
            {optimizerDone && <button onClick={() => loadPlayerLayout(optimized, 'optimized')}>Start from optimized</button>}
          </div>
        </div>
      )}
    </section>
  );
}

// Points earned in the current replay so far.
function PointsCard() {
  const sim = useReplaySim();
  const orders = useReplayOrders();
  const model = useStore((s) => s.model);
  const baseline = useStore((s) => s.layouts.baseline);
  const tick = useStore((s) => s.tick);
  const points = useMemo(() => (model && sim ? replayPoints(model, sim, orders, baseline) : []), [model, sim, orders, baseline]);
  const done = points.filter((p) => p.endTick <= tick);
  const total = done.reduce((n, p) => n + p.points, 0);
  const lines = done.reduce((n, p) => n + p.lines, 0);
  const bonus = done.reduce((n, p) => n + p.bonus, 0);
  const penalty = done.reduce((n, p) => n + p.penalty, 0);
  return (
    <section>
      <h2>Game points · this replay</h2>
      <div className="points">
        <span className="points-value">{total.toLocaleString()}</span>
        <span className="muted-inline">pts from {done.length} completed trips</span>
      </div>
      <p className="muted">
        +{POINTS_PER_LINE} per line picked ({(lines * POINTS_PER_LINE).toLocaleString()}) · +1 per second faster than par ({bonus}) · −1 per 5 s stuck in
        congestion (−{penalty}). Par = the same orders on the auto baseline with no congestion.
      </p>
      <p className="tiny-note">Game points are for fun only and are not an operational metric. See the Dashboard for real distance, time and waiting.</p>
    </section>
  );
}

// The selected picker's (or Picker 1's) current orders with a pick checklist.
function ActiveOrdersCard() {
  const inspect = useStore((s) => s.inspect);
  const p = inspect?.kind === 'picker' ? inspect.id : 0;
  return (
    <section>
      <h2>Active orders · Picker {p + 1}</h2>
      <PickerDetails picker={p} />
      <p className="tiny-note">The pulsing ring in the 3D view marks this picker's next destination.</p>
    </section>
  );
}

function ChallengesCard() {
  const scores = useStore((s) => s.scores);
  const batchScores = useStore((s) => s.batchScores);
  const playerStart = useStore((s) => s.playerStart);
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layouts = useStore((s) => s.layouts);
  if (!scores || !batchScores || !model || !data) return null;
  const congestion = {
    player: congestionFor(model, layouts.player, data.orders, CHALLENGE_PICKERS, 1).totalWaitS,
    baseline: congestionFor(model, layouts.baseline, data.orders, CHALLENGE_PICKERS, 1).totalWaitS,
    pickers: CHALLENGE_PICKERS,
  };
  const list = challenges({
    player: scores.player,
    baseline: scores.baseline,
    playerBatch: batchScores.player,
    baselineBatch: batchScores.baseline,
    optimized: scores.optimized,
    playerStart,
    ownLayout: isOwnLayout(layouts),
    congestion,
  });
  const doneCount = list.filter((c) => c.done).length;
  return (
    <section>
      <h2>
        Challenges · {doneCount}/{list.length}
      </h2>
      <ul className="challenges">
        {list.map((c) => (
          <li key={c.id} className={c.done ? 'done' : ''} title={c.detail}>
            <span className="check">{c.done ? '✓' : '○'}</span>
            <div>
              <div className="challenge-title">{c.title}</div>
              <div className="sub">{c.status}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="tiny-note">
        Measured on My layout over all orders of the month ("Match the optimizer" compares on the whole month, including its fit days). Hover a
        challenge for details.
      </p>
    </section>
  );
}
