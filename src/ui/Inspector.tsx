// Floating card (bottom-left of the 3D view) describing whatever was clicked:
// a picker, an aisle, a rack slot, or the packing dock.

import { useMemo } from 'react';
import { PACK_SECONDS_PER_ORDER } from '../sim/config';
import { STATUS } from '../sim/congestion';
import { abcClasses, slotLabel } from '../sim/analysis';
import { DOCK_NODE } from '../sim/grid';
import { slotOfProduct } from '../sim/layouts';
import { aisleOccupancy, pickerInfo } from '../replay/queries';
import { aisleOfCell, pickerColor, useReplayOrders, useReplaySim } from '../scene/helpers';
import { useStore } from '../store';
import { formatTime } from './format';

export function Inspector() {
  const inspect = useStore((s) => s.inspect);
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layouts = useStore((s) => s.layouts);
  const active = useStore((s) => s.active);
  const tick = useStore((s) => s.tick);
  const { setInspect, setCamera } = useStore.getState();
  const sim = useReplaySim();
  const orders = useReplayOrders();
  const abc = useMemo(() => (data ? abcClasses(data.products) : new Map()), [data]);
  if (!inspect || !model || !data || !sim) return null;

  const layout = layouts[active];
  const close = (
    <button className="close" onClick={() => setInspect(null)} aria-label="Close">
      ×
    </button>
  );

  if (inspect.kind === 'picker') {
    const info = pickerInfo(sim, inspect.id, tick);
    const nextNode = info.trip && info.nextStop !== null ? info.trip.stops[info.nextStop] : null;
    return (
      <div className="inspector" style={{ ['--chip' as string]: pickerColor(inspect.id) }}>
        {close}
        <div className="inspector-title">
          <span className="dot" /> Picker {inspect.id + 1} · {info.status}
        </div>
        {info.trip ? (
          <p>
            {nextNode === DOCK_NODE ? 'Heading to / at the packing dock' : `Next: ${info.targetSkus.join(', ')}`} · stop {Math.min(info.stopsDone + 1, info.stopsTotal)} of{' '}
            {info.stopsTotal}
          </p>
        ) : (
          <p>Waiting at the dock for the next order.</p>
        )}
        <p className="muted">
          {info.distanceM} m walked · {formatTime(info.waitS)} waiting · {info.ordersDone} orders packed
        </p>
        <button className="link" onClick={() => setCamera('follow')}>
          Follow with camera
        </button>
      </div>
    );
  }

  if (inspect.kind === 'aisle') {
    const a = inspect.id;
    const occupancy = aisleOccupancy(model, sim, tick)[a];
    const slots = model.grid.slots.filter((s) => s.aisle === a);
    const products = slots.map((s) => layout[s.id]).filter((c): c is string => c !== null);
    const picks = products.reduce((n, c) => n + (data.products.find((p) => p.code === c)?.picks ?? 0), 0);
    const totalPicks = data.products.reduce((n, p) => n + p.picks, 0);
    let waitTicks = 0;
    sim.frames!.forEach((f, p) => {
      for (let t = 0; t < Math.min(tick, sim.ticks); t++) if (sim.status![p][t] === STATUS.waiting && aisleOfCell(model.grid, f[t]) === a) waitTicks++;
    });
    return (
      <div className="inspector">
        {close}
        <div className="inspector-title">Aisle {a + 1}</div>
        <p>
          <b>{occupancy}</b> picker{occupancy === 1 ? '' : 's'} in the aisle now · {formatTime(waitTicks * sim.tickS)} waiting here so far
        </p>
        <p className="muted">
          {products.length} products · {products.filter((c) => abc.get(c) === 'A').length} A-class · {picks.toLocaleString()} picks this month (
          {((picks / totalPicks) * 100).toFixed(0)}% of all picks)
        </p>
      </div>
    );
  }

  if (inspect.kind === 'slot') {
    const slot = model.grid.slots[inspect.id];
    const code = layout[slot.id];
    const product = code ? data.products.find((p) => p.code === code) : undefined;
    const suggested = code && layouts.optimized.length ? slotOfProduct(layouts.optimized).get(code) : undefined;
    return (
      <div className="inspector">
        {close}
        <div className="inspector-title">Slot {slotLabel(model, slot.id)}</div>
        {product ? (
          <>
            <p>
              <b>{product.code}</b> {product.desc}
            </p>
            <p className="muted">
              {product.picks} picks · rank #{product.rank} · class {abc.get(product.code)} · {model.dist[DOCK_NODE][slot.node]} m walk from the dock
            </p>
            {suggested !== undefined && suggested !== slot.id && (
              <p className="muted">Optimizer suggests slot {slotLabel(model, suggested)} ({model.dist[DOCK_NODE][model.grid.slots[suggested].node]} m from the dock).</p>
            )}
          </>
        ) : (
          <p className="muted">Empty slot · {model.dist[DOCK_NODE][slot.node]} m walk from the dock</p>
        )}
      </div>
    );
  }

  // Packing dock
  const t = Math.min(tick, sim.ticks);
  const started = sim.trips!.filter((tr) => tr.startTick <= t).reduce((n, tr) => n + tr.orders.length, 0);
  const atDock = sim.status!.filter((st) => st[t] === STATUS.packing).length;
  return (
    <div className="inspector">
      {close}
      <div className="inspector-title">Packing dock</div>
      <p>
        <b>{sim.ordersDoneByTick![t]}</b> of {orders.length} orders packed · {atDock} picker{atDock === 1 ? '' : 's'} packing now
      </p>
      <p className="muted">
        {orders.length - started} orders still queued · packing takes {PACK_SECONDS_PER_ORDER} s per order
      </p>
    </div>
  );
}
