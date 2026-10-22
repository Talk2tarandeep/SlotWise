// Control-room side panel: layout selector + swap game, results, replay
// controls, live counters and heat legend.

import { useHeatmaps, useMultiSim, useTimeline } from '../scene/helpers';
import { TICK_S } from '../sim/congestion';
import { LAYOUT_NAMES, PICKER_COUNTS, SAMPLE_SIZE, SPEEDS, useStore, type LayoutKey } from '../store';
import { CongestionCard } from './CongestionCard';
import { Leaderboard } from './Leaderboard';
import { ResultsCard } from './ResultsCard';

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s % 60)}`;
}

export function SidePanel() {
  const data = useStore((s) => s.data)!;
  const active = useStore((s) => s.active);
  const speed = useStore((s) => s.speed);
  const playing = useStore((s) => s.playing);
  const live = useStore((s) => s.live);
  const sampleStart = useStore((s) => s.sampleStart);
  const pickers = useStore((s) => s.pickers);
  const { setActive, setSpeed, setPlaying, replay, setSampleStart, setPickers } = useStore.getState();
  const timeline = useTimeline();
  const multiSim = useMultiSim();

  const sampleEnd = Math.min(data.orders.length, sampleStart + SAMPLE_SIZE);
  const trip = multiSim ? undefined : timeline?.trips[live.tripIdx];
  const replayDuration = multiSim ? multiSim.ticks * TICK_S : (timeline?.duration ?? 0);

  return (
    <aside className="panel">
      <header>
        <h1>Picking Floor Twin</h1>
        <p className="muted">
          {data.month} · {data.orders.length.toLocaleString()} orders · {data.products.length} products
        </p>
      </header>

      <section>
        <h2>Layout</h2>
        <div className="segmented">
          {(Object.keys(LAYOUT_NAMES) as LayoutKey[]).map((key) => (
            <button key={key} className={key === active ? 'on' : ''} onClick={() => setActive(key)}>
              {LAYOUT_NAMES[key]}
            </button>
          ))}
        </div>
        <GameControls />
      </section>

      <ResultsCard />
      <CongestionCard />
      <Leaderboard />

      <section>
        <h2>Replay</h2>
        <p className="muted">
          Orders {sampleStart + 1}–{sampleEnd} of {data.orders.length.toLocaleString()}
        </p>
        <div className="row">
          <button className="primary" onClick={replay}>
            ▶ Replay
          </button>
          <button onClick={() => setPlaying(!playing)} disabled={!timeline || live.elapsed >= replayDuration}>
            {playing ? 'Pause' : 'Resume'}
          </button>
          <button onClick={() => setSampleStart(sampleStart + SAMPLE_SIZE)} disabled={sampleEnd >= data.orders.length}>
            Next {SAMPLE_SIZE}
          </button>
        </div>
        <div className="segmented small">
          {SPEEDS.map((s) => (
            <button key={s} className={s === speed ? 'on' : ''} onClick={() => setSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
        <div className="row labelled">
          <span className="muted">Pickers</span>
          <div className="segmented small" style={{ flex: 1 }}>
            {PICKER_COUNTS.map((n) => (
              <button key={n} className={n === pickers ? 'on' : ''} onClick={() => setPickers(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2>Live</h2>
        <div className="counters">
          <div>
            <span className="value">{live.distance.toFixed(0)}</span>
            <span className="unit">m walked</span>
          </div>
          <div>
            <span className="value">{formatTime(live.elapsed)}</span>
            <span className="unit">elapsed</span>
          </div>
          <div>
            <span className="value">
              {live.ordersDone}/{timeline?.orders.length ?? 0}
            </span>
            <span className="unit">orders done</span>
          </div>
          {multiSim && (
            <div>
              <span className="value warn">{formatTime(live.waitS)}</span>
              <span className="unit">waiting (all pickers)</span>
            </div>
          )}
        </div>
        {trip && (
          <p className="muted">
            {trip.length === 1
              ? `Current order #${trip[0].id} · ${trip[0].items.length} lines · ${trip[0].t.replace('T', ' ')}`
              : `Current trip: ${trip.length} orders (#${trip.map((o) => o.id).join(', #')}) · ${trip.reduce((n, o) => n + o.items.length, 0)} lines`}
          </p>
        )}
        {multiSim ? (
          <p className="muted">
            This sample with {multiSim.pickers} pickers: {multiSim.totalDistanceM.toFixed(0)} m, done in {formatTime(replayDuration)}, {formatTime(multiSim.totalWaitS)}{' '}
            spent waiting in aisles
          </p>
        ) : (
          timeline && (
            <p className="muted">
              This sample in total: {timeline.totalDistance.toFixed(0)} m, {formatTime(timeline.duration)}
            </p>
          )
        )}
      </section>

      <HeatSection />
    </aside>
  );
}

// Swap game controls (only in My layout).
function GameControls() {
  const active = useStore((s) => s.active);
  const selected = useStore((s) => s.selected);
  const swaps = useStore((s) => s.swaps);
  const lastSwapDeltaM = useStore((s) => s.lastSwapDeltaM);
  const model = useStore((s) => s.model);
  const playerLayout = useStore((s) => s.layouts.player);
  const { setActive, clearSelection, resetPlayer } = useStore.getState();

  if (active !== 'player') {
    return (
      <p className="muted">
        Pick <button className="link" onClick={() => setActive('player')}>My layout</button> to rearrange products.
      </p>
    );
  }

  const slot = selected !== null && model ? model.grid.slots[selected] : null;
  return (
    <div className="game">
      <p className="muted">
        Click a slot to pick up its product, then click another slot to swap. Every swap re-scores all orders of the month.
      </p>
      {slot && (
        <p className="selected-info">
          Holding <b>{playerLayout[slot.id] ?? 'empty slot'}</b> from A{slot.aisle + 1}-{slot.side}
          {slot.pos + 1}{' '}
          <button className="link" onClick={clearSelection}>
            cancel
          </button>
        </p>
      )}
      <div className="row">
        <span className="muted">
          Swaps: <b>{swaps}</b>
          {lastSwapDeltaM !== null && (
            <>
              {' · last swap '}
              <b className={lastSwapDeltaM < 0 ? 'good' : lastSwapDeltaM > 0 ? 'bad' : ''}>
                {lastSwapDeltaM > 0 ? '+' : ''}
                {lastSwapDeltaM.toFixed(0)} m
              </b>
            </>
          )}
        </span>
      </div>
      <div className="row">
        <button onClick={() => resetPlayer('original')}>Reset to original</button>
        <button onClick={() => resetPlayer('baseline')}>Start from baseline</button>
      </div>
    </div>
  );
}

// Heat legend + traffic heatmap toggle with per-aisle stop counts.
function HeatSection() {
  const show = useStore((s) => s.showHeatmap);
  const toggleHeatmap = useStore((s) => s.toggleHeatmap);
  const { current, reference } = useHeatmaps();
  const maxAisle = current ? Math.max(...current.stopsPerAisle) : 0;
  const totalStops = current ? current.stopsPerAisle.reduce((a, b) => a + b, 0) : 0;

  return (
    <section>
      <h2>Heat</h2>
      <div className="legend">
        <span>slow mover</span>
        <div className="legend-bar" />
        <span>fast mover</span>
      </div>
      <p className="muted">Box colour = product pick count. Hover a slot to see its product.</p>

      <div className="row">
        <button className={show ? 'on toggle' : 'toggle'} onClick={toggleHeatmap}>
          {show ? '✓ ' : ''}Floor traffic heatmap
        </button>
      </div>

      {current && reference && (
        <>
          <div className="legend">
            <span>quiet</span>
            <div className="legend-bar traffic" />
            <span>busy</span>
          </div>
          <p className="muted">
            Steps per floor cell over all orders (sqrt scale, fixed to Original's busiest cell: {reference.maxCellPasses.toLocaleString()}). Busiest
            cell in this layout: {current.maxCellPasses.toLocaleString()}.
          </p>
          <h2 style={{ marginTop: 12 }}>Pick stops per aisle</h2>
          <div className="bars">
            {current.stopsPerAisle.map((n, a) => (
              <div key={a} className="bar-row">
                <span>A{a + 1}</span>
                <div className="bar">
                  <div style={{ width: `${(n / Math.max(1, maxAisle)) * 100}%` }} />
                </div>
                <span className="num">{((n / Math.max(1, totalStops)) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
