// Video-player style replay controls along the bottom of the 3D view:
// restart, play/pause, step to the next event, a timeline scrubber, speed,
// and picker chips (click to select / follow a picker).
// The replay is a recording, so scrubbing and stepping never change results.

import { replayClock } from '../replay/clock';
import { nextEventTick } from '../replay/queries';
import { pickerColor, useReplaySim } from '../scene/helpers';
import { SAMPLE_SIZES, SPEEDS, useStore } from '../store';
import { formatTime } from './format';

export function ReplayBar() {
  const sim = useReplaySim();
  const data = useStore((s) => s.data);
  const tick = useStore((s) => s.tick);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const sampleStart = useStore((s) => s.sampleStart);
  const sampleSize = useStore((s) => s.sampleSize);
  const inspect = useStore((s) => s.inspect);
  const selected = inspect?.kind === 'picker' ? inspect.id : null;
  const { setPlaying, replay, seek, setSpeed, setSampleStart, setSampleSize, setInspect } = useStore.getState();
  if (!sim || !data) return null;

  const atEnd = tick >= sim.ticks;
  const togglePlay = () => {
    if (atEnd) return replay(); // play again from the start
    // Resume from wherever the scrubber is.
    replayClock.seconds = tick * sim.tickS;
    setPlaying(!playing);
  };
  const step = () => {
    setPlaying(false);
    seek(nextEventTick(sim, tick, selected), sim.tickS);
  };
  const restart = () => {
    setPlaying(false);
    seek(0, sim.tickS);
  };

  return (
    <div className="replay-bar">
      <div className="replay-row">
        <button className="icon" title="Back to start" onClick={restart} aria-label="Restart">
          ⏮
        </button>
        <button className="icon primary" title={playing ? 'Pause' : atEnd ? 'Replay' : 'Play / resume'} onClick={togglePlay} aria-label="Play or pause">
          {playing ? '⏸' : '▶'}
        </button>
        <button className="icon" title={selected !== null ? `Step to Picker ${selected + 1}'s next event` : 'Step to the next event'} onClick={step} aria-label="Step forward">
          ⏭
        </button>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={sim.ticks}
          value={Math.min(tick, sim.ticks)}
          onChange={(e) => seek(Number(e.target.value), sim.tickS)}
          aria-label="Replay timeline"
        />
        <span className="time">
          {formatTime(tick * sim.tickS)} / {formatTime(sim.makespanS)}
        </span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Replay speed" aria-label="Replay speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
      <div className="replay-row small">
        <span className="muted-inline">Orders</span>
        <button className="icon tiny" onClick={() => setSampleStart(sampleStart - sampleSize)} disabled={sampleStart === 0} aria-label="Previous orders">
          ‹
        </button>
        <span className="muted-inline">
          {sampleStart + 1}–{Math.min(data.orders.length, sampleStart + sampleSize)} of {data.orders.length.toLocaleString()}
        </span>
        <button
          className="icon tiny"
          onClick={() => setSampleStart(sampleStart + sampleSize)}
          disabled={sampleStart + sampleSize >= data.orders.length}
          aria-label="Next orders"
        >
          ›
        </button>
        <select value={sampleSize} onChange={(e) => setSampleSize(Number(e.target.value))} title="Orders per replay" aria-label="Orders per replay">
          {SAMPLE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} orders
            </option>
          ))}
        </select>
        <span className="spacer" />
        {Array.from({ length: sim.pickers }, (_, p) => (
          <button
            key={p}
            className={`chip ${selected === p ? 'on' : ''}`}
            style={{ ['--chip' as string]: pickerColor(p) }}
            onClick={() => setInspect(selected === p ? null : { kind: 'picker', id: p })}
            title={`Select Picker ${p + 1}`}
          >
            P{p + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
