// Control-room side panel: layout selector, replay controls, live counters.

import { useTimeline } from '../scene/helpers';
import { LAYOUT_NAMES, SAMPLE_SIZE, SPEEDS, useStore, type LayoutKey } from '../store';

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
  const { setActive, setSpeed, setPlaying, replay, setSampleStart } = useStore.getState();
  const timeline = useTimeline();

  const sampleEnd = Math.min(data.orders.length, sampleStart + SAMPLE_SIZE);
  const current = timeline?.orders[live.orderIdx];

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
      </section>

      <section>
        <h2>Replay</h2>
        <p className="muted">
          Orders {sampleStart + 1}–{sampleEnd} of {data.orders.length.toLocaleString()}
        </p>
        <div className="row">
          <button className="primary" onClick={replay}>
            ▶ Replay
          </button>
          <button onClick={() => setPlaying(!playing)} disabled={!timeline || live.elapsed >= timeline.duration}>
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
        </div>
        {current && (
          <p className="muted">
            Current order #{current.id} · {current.items.length} lines · {current.t.replace('T', ' ')}
          </p>
        )}
        {timeline && (
          <p className="muted">
            This sample in total: {timeline.totalDistance.toFixed(0)} m, {formatTime(timeline.duration)}
          </p>
        )}
      </section>

      <section>
        <h2>Heat</h2>
        <div className="legend">
          <span>slow mover</span>
          <div className="legend-bar" />
          <span>fast mover</span>
        </div>
        <p className="muted">Hover a slot to see its product.</p>
      </section>
    </aside>
  );
}
