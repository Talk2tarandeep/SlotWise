// Small pop-ups when an order is packed during the replay, with the game
// points it earned (game points only; see game.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import { replayPoints } from '../game';
import { pickerColor, useReplayOrders, useReplaySim } from '../scene/helpers';
import { useStore } from '../store';

type Toast = { id: number; text: string; color: string };
const SHOW_MS = 2600;

export function Toasts() {
  const sim = useReplaySim();
  const orders = useReplayOrders();
  const model = useStore((s) => s.model);
  const baseline = useStore((s) => s.layouts.baseline);
  const tick = useStore((s) => s.tick);
  const playing = useStore((s) => s.playing);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastTick = useRef(0);
  const nextId = useRef(0);
  const points = useMemo(() => (model && sim ? replayPoints(model, sim, orders, baseline) : []), [model, sim, orders, baseline]);

  useEffect(() => {
    const prev = lastTick.current;
    lastTick.current = tick;
    if (!sim || !playing || tick <= prev) return; // only while playing forwards (not when scrubbing back)
    const done = points.filter((p) => p.endTick > prev && p.endTick <= tick).slice(-3);
    if (done.length === 0) return;
    const fresh = done.map((p) => ({
      id: nextId.current++,
      color: pickerColor(p.picker),
      text: `Picker ${p.picker + 1} packed ${sim.trips![p.trip].orders.map((i) => '#' + orders[i].id).join(', ')} · +${p.points} pts`,
    }));
    setToasts((t) => [...t, ...fresh].slice(-4));
    const ids = new Set(fresh.map((f) => f.id));
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), SHOW_MS);
  }, [tick, sim, playing, points, orders]);

  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ ['--chip' as string]: t.color }}>
          ✓ {t.text}
        </div>
      ))}
    </div>
  );
}
