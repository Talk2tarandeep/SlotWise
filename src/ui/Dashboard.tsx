// Dashboard tab: scenario settings, live KPIs of the replay, the selected
// picker, live events, and whole-month KPIs vs the auto baseline.

import { useMemo } from 'react';
import { liveKpis, pickerInfo, replayEvents } from '../replay/queries';
import { monthSim, pickerColor, useReplayOrders, useReplaySim } from '../scene/helpers';
import { BATCH_SIZE } from '../sim/config';
import { slotLabel } from '../sim/analysis';
import { slotOfProduct } from '../sim/layouts';
import { pctChange } from '../sim/scoring';
import { batchSizeFor, LAYOUT_NAMES, LAYOUT_ORDER, PICKER_COUNTS, useStore, type PickingMode } from '../store';
import { CongestionCard } from './CongestionCard';
import { changeClass, formatTime, hours, km, minutes, pct, signedPct } from './format';
import { InSampleNote } from './InSampleNote';
import { ResultsCard } from './ResultsCard';

export function Dashboard() {
  return (
    <>
      <ScenarioCard />
      <LiveKpiCard />
      <SelectedPickerCard />
      <EventsCard />
      <MonthKpiCard />
      <ResultsCard />
      <CongestionCard />
    </>
  );
}

// ---------- Scenario: what is being simulated ----------
function ScenarioCard() {
  const active = useStore((s) => s.active);
  const mode = useStore((s) => s.mode);
  const pickers = useStore((s) => s.pickers);
  const optimizer = useStore((s) => s.optimizer);
  const { setActive, setMode, setPickers } = useStore.getState();
  const modes: [PickingMode, string][] = [
    ['single', 'Single order'],
    ['batch', `Batch of ${BATCH_SIZE}`],
  ];
  const optLabel =
    optimizer.status === 'running'
      ? `Optimizing… ${optimizer.progress ? Math.round((100 * optimizer.progress.slot) / optimizer.progress.slots) : 0}%`
      : LAYOUT_NAMES.optimized;

  return (
    <section>
      <h2>Scenario</h2>
      <div className="field">
        <label>Layout</label>
        <div className="segmented small wrap">
          {LAYOUT_ORDER.map((key) => (
            <button
              key={key}
              className={key === active ? 'on' : ''}
              onClick={() => setActive(key)}
              disabled={key === 'optimized' && optimizer.status !== 'done'}
              title={key === 'optimized' ? 'Layout found by the optimizer (fitted on 1–21 Nov)' : undefined}
            >
              {key === 'optimized' ? optLabel : LAYOUT_NAMES[key]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Picking</label>
        <div className="segmented small">
          {modes.map(([k, label]) => (
            <button key={k} className={k === mode ? 'on' : ''} onClick={() => setMode(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Pickers</label>
        <div className="segmented small">
          {PICKER_COUNTS.map((n) => (
            <button key={n} className={n === pickers ? 'on' : ''} onClick={() => setPickers(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Live KPIs of the replay at the current tick ----------
function LiveKpiCard() {
  const sim = useReplaySim();
  const tick = useStore((s) => s.tick);
  if (!sim) return null;
  const k = liveKpis(sim, tick);
  return (
    <section>
      <h2 title="Computed from the recorded replay at the current point on the timeline">
        This replay · {k.ordersTotal} orders · {sim.pickers} picker{sim.pickers > 1 ? 's' : ''} · {formatTime(k.elapsedS)}
      </h2>
      <div className="kpis">
        <Kpi label="Orders completed" value={`${k.ordersDone} / ${k.ordersTotal}`} />
        <Kpi label="Distance walked" value={`${k.distanceM.toLocaleString()} m`} />
        <Kpi label="Avg time / order" value={k.avgOrderTimeS === null ? '—' : `${k.avgOrderTimeS.toFixed(0)} s`} hint="Completed trips only; includes walking, picking, packing and waiting." />
        <Kpi label="Congestion waiting" value={formatTime(k.waitS)} tone={k.waitS > 0 ? 'warn' : undefined} />
        <Kpi label="Picker utilization" value={k.utilization === null ? '—' : pct(k.utilization)} hint="Share of picker time spent on trips. All orders are queued from the start, so pickers are rarely idle until the queue runs out." />
        <Kpi label="Throughput" value={k.throughputPerH === null ? '—' : `${k.throughputPerH.toFixed(1)} /h`} hint="Orders packed per hour of replay time (capacity, not real demand)." />
      </div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' | 'good' | 'bad' }) {
  return (
    <div className="kpi" title={hint}>
      <span className={`kpi-value ${tone ?? ''}`}>{value}</span>
      <span className="kpi-label">
        {label}
        {hint && <span className="hint-dot">?</span>}
      </span>
    </div>
  );
}

// ---------- Selected picker + active orders ----------
function SelectedPickerCard() {
  const inspect = useStore((s) => s.inspect);
  const sim = useReplaySim();
  if (!sim) return null;
  const p = inspect?.kind === 'picker' ? inspect.id : null;
  return (
    <section>
      <h2>Selected picker</h2>
      {p === null ? (
        <p className="muted">Click a picker in the 3D view (or a P1… chip under it) to see its status, orders and next pick.</p>
      ) : (
        <PickerDetails picker={p} />
      )}
    </section>
  );
}

export function PickerDetails({ picker }: { picker: number }) {
  const sim = useReplaySim();
  const orders = useReplayOrders();
  const model = useStore((s) => s.model);
  const layout = useStore((s) => s.layouts[s.active]);
  const tick = useStore((s) => s.tick);
  const slotOf = useMemo(() => slotOfProduct(layout), [layout]);
  if (!sim || !model || picker >= sim.pickers) return null;
  const info = pickerInfo(sim, picker, tick);
  const trip = info.trip;

  // Which products of the trip have been picked already (their stop is done).
  const pickedSkus = new Set<string>();
  if (trip) for (let s = 1; s <= info.stopsDone; s++) trip.skusAtStop[s].forEach((c) => pickedSkus.add(c));

  return (
    <div className="picker-details" style={{ ['--chip' as string]: pickerColor(picker) }}>
      <div className="picker-head">
        <span className="dot" /> <b>Picker {picker + 1}</b> <span className={`status status-${info.status.toLowerCase()}`}>{info.status}</span>
      </div>
      {trip ? (
        <>
          <div className="progress" title={`${info.stopsDone} of ${info.stopsTotal} pick stops done`}>
            <div style={{ width: `${(100 * info.stopsDone) / Math.max(1, info.stopsTotal)}%` }} />
          </div>
          <p className="muted">
            {info.targetSkus.length > 0
              ? `Next pick: ${info.targetSkus.map((c) => `${c} @ ${slotLabel(model, slotOf.get(c)!)}`).join(', ')}`
              : 'All items picked, returning to / packing at the dock'}
          </p>
          <ul className="order-list">
            {trip.orders.map((i) => (
              <li key={i}>
                <div className="order-id">Order #{orders[i].id}</div>
                <div className="items">
                  {orders[i].items.map((code) => (
                    <span key={code} className={`item ${pickedSkus.has(code) ? 'done' : info.targetSkus.includes(code) ? 'next' : ''}`}>
                      {pickedSkus.has(code) ? '✓ ' : ''}
                      {code}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">No active order (waiting for work or finished).</p>
      )}
      <p className="muted">
        So far: {info.distanceM} m walked · {formatTime(info.waitS)} waiting · {info.ordersDone} orders packed
      </p>
    </div>
  );
}

// ---------- Live event feed ----------
function EventsCard() {
  const sim = useReplaySim();
  const orders = useReplayOrders();
  const model = useStore((s) => s.model);
  const tick = useStore((s) => s.tick);
  const events = useMemo(() => (sim && model ? replayEvents(model, sim, orders) : []), [sim, model, orders]);
  if (!sim) return null;
  // Latest 8 events up to now, newest first.
  let end = 0;
  while (end < events.length && events[end].tick <= tick) end++;
  const recent = events.slice(Math.max(0, end - 8), end).reverse();
  return (
    <section>
      <h2>Live events</h2>
      {recent.length === 0 ? (
        <p className="muted">Press ▶ to start the replay.</p>
      ) : (
        <ul className="events">
          {recent.map((e, i) => (
            <li key={`${e.tick}-${e.picker}-${e.kind}-${i}`} className={`event ${e.kind}`}>
              <span className="event-time">{formatTime(e.tick * sim.tickS)}</span>
              <span className="dot" style={{ background: pickerColor(e.picker) }} />
              <span>
                <b>P{e.picker + 1}</b> {e.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Whole month, N pickers, vs auto baseline ----------
function MonthKpiCard() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layouts = useStore((s) => s.layouts);
  const active = useStore((s) => s.active);
  const pickers = useStore((s) => s.pickers);
  const mode = useStore((s) => s.mode);
  if (!model || !data || layouts[active].length === 0) return null;
  const options = { pickers, batchSize: batchSizeFor(mode) };
  const r = monthSim(model, layouts[active], data.orders, options);
  const b = monthSim(model, layouts.baseline, data.orders, options);
  const util = r.busyS / (r.pickers * r.makespanS);
  const vsDist = pctChange(r.totalDistanceM, b.totalDistanceM);
  const vsTime = pctChange(r.avgOrderTimeS, b.avgOrderTimeS);
  const vsWait = pctChange(r.totalWaitS, b.totalWaitS);
  return (
    <section>
      <h2 title="All orders of the month queued at once and worked by the chosen number of pickers">
        Whole month · {LAYOUT_NAMES[active]} · {pickers} picker{pickers > 1 ? 's' : ''}
      </h2>
      <div className="kpis">
        <Kpi label="Orders completed" value={r.orders.toLocaleString()} />
        <Kpi label="Distance travelled" value={km(r.totalDistanceM)} />
        <Kpi label="Avg time / order" value={`${r.avgOrderTimeS.toFixed(1)} s`} hint="Includes walking, 10 s per line, 30 s packing and congestion waiting." />
        <Kpi label="Congestion waiting" value={minutes(r.totalWaitS)} tone={r.totalWaitS > 0 ? 'warn' : undefined} />
        <Kpi label="Picker utilization" value={pct(util)} hint="Busy time / (pickers × time to finish all orders). Orders are all queued at the start, so this stays high." />
        <Kpi label="Throughput" value={`${(r.orders / (r.makespanS / 3600)).toFixed(1)} /h`} hint={`All orders done in ${hours(r.makespanS)}.`} />
      </div>
      {active !== 'baseline' ? (
        <p className="muted">
          vs Auto baseline: distance <b className={changeClass(vsDist)}>{signedPct(vsDist)}</b> · time/order <b className={changeClass(vsTime)}>{signedPct(vsTime)}</b> · waiting{' '}
          <b className={changeClass(vsWait)}>{signedPct(vsWait, 0)}</b>
        </p>
      ) : (
        <p className="muted">This is the auto baseline (fast movers nearest the dock).</p>
      )}
      {active === 'optimized' && <InSampleNote />}
    </section>
  );
}
