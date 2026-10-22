// What-if tab: build a scenario, run it, and compare scenarios side by side.
// Each row is a full simulation of the whole workload with N pickers.
// Real data unless marked synthetic: volumes above 100% repeat real orders,
// and the "flatter" / "more skewed" demand shapes are synthetic redraws.

import { useState } from 'react';
import { monthSim } from '../scene/helpers';
import { reshapeDemand, scaleVolume } from '../sim/analysis';
import { BATCH_SIZE, WALK_SPEED_MPS } from '../sim/config';
import type { DispatchPolicy } from '../sim/congestion';
import type { RoutingPolicy } from '../sim/routing';
import type { Order, WarehouseData } from '../sim/types';
import { LAYOUT_NAMES, LAYOUT_ORDER, PICKER_COUNTS, useStore, type LayoutKey, type PickingMode } from '../store';
import { formatTime, km, minutes, pct } from './format';

type Demand = 'real' | 'flat' | 'skewed';
const DEMANDS: [Demand, string, number][] = [
  ['real', 'Real (Nov 2010)', 1],
  ['flat', 'Flatter (synthetic)', 0],
  ['skewed', 'More skewed (synthetic)', 2],
];
const VOLUMES = [0.25, 0.5, 1, 2];
const SPEEDS_MPS = [0.8, 1.0, 1.2, 1.4, 1.6]; // all give whole-tick pick/pack times

type Scenario = { layout: LayoutKey; pickers: number; volume: number; speed: number; demand: Demand; mode: PickingMode; routing: RoutingPolicy; dispatch: DispatchPolicy };
type Row = { id: number; scenario: Scenario; orders: number; distanceM: number; makespanS: number; avgOrderS: number; waitS: number; util: number; perHour: number };

// Workloads are cached so the same scenario always reuses the same order array.
const workloads = new Map<string, Order[]>();
function workload(data: WarehouseData, demand: Demand, volume: number): { key: string; orders: Order[] } {
  const key = `whatif:${demand}:${volume}`;
  if (!workloads.has(key)) {
    const alpha = DEMANDS.find((d) => d[0] === demand)![2];
    const base = demand === 'real' ? data.orders : reshapeDemand(data.orders, data.products, alpha);
    workloads.set(key, scaleVolume(base, volume));
  }
  return { key, orders: workloads.get(key)! };
}

let savedRows: Row[] = []; // kept while switching tabs
let nextId = 1;

function label(s: Scenario) {
  const demand = DEMANDS.find((d) => d[0] === s.demand)![1].replace(' (synthetic)', '*');
  return `${LAYOUT_NAMES[s.layout]} · ${s.pickers}p · ${s.volume * 100}% · ${s.speed} m/s · ${demand} · ${s.mode === 'batch' ? `batch ${BATCH_SIZE}` : 'single'}${s.routing === 'nn2opt' ? ' · 2-opt' : ''}${s.dispatch === 'spread' ? ' · spread' : ''}`;
}

export function WhatIf() {
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const layouts = useStore((s) => s.layouts);
  const pickers = useStore((s) => s.pickers);
  const mode = useStore((s) => s.mode);
  const active = useStore((s) => s.active);
  const [s, setS] = useState<Scenario>({ layout: active, pickers: Math.max(2, pickers), volume: 1, speed: WALK_SPEED_MPS, demand: 'real', mode, routing: 'nn', dispatch: 'fifo' });
  const [rows, setRows] = useState<Row[]>(savedRows);
  const [busy, setBusy] = useState(false);
  if (!model || !data) return null;

  const update = <K extends keyof Scenario>(k: K, v: Scenario[K]) => setS({ ...s, [k]: v });
  const available = LAYOUT_ORDER.filter((k) => layouts[k].length > 0);

  const run = () => {
    setBusy(true);
    // Let the "Running…" state paint before the (sub-second) simulation.
    setTimeout(() => {
      const { key, orders } = workload(data, s.demand, s.volume);
      const r = monthSim(
        model,
        layouts[s.layout],
        orders,
        { pickers: s.pickers, batchSize: s.mode === 'batch' ? BATCH_SIZE : 1, speedMps: s.speed, routing: s.routing, dispatch: s.dispatch },
        key,
      );
      const row: Row = {
        id: nextId++,
        scenario: { ...s },
        orders: r.orders,
        distanceM: r.totalDistanceM,
        makespanS: r.makespanS,
        avgOrderS: r.avgOrderTimeS,
        waitS: r.totalWaitS,
        util: r.busyS / (r.pickers * r.makespanS),
        perHour: r.orders / (r.makespanS / 3600),
      };
      savedRows = [...rows, row];
      setRows(savedRows);
      setBusy(false);
    }, 20);
  };

  // Best value per column (lower is better, except throughput).
  const best = (f: (r: Row) => number, higher = false) => (rows.length ? (higher ? Math.max(...rows.map(f)) : Math.min(...rows.map(f))) : NaN);
  const bestDist = best((r) => r.distanceM / r.orders);
  const bestTime = best((r) => r.avgOrderS);
  const bestWait = best((r) => r.waitS / r.orders);
  const bestRate = best((r) => r.perHour, true);

  return (
    <>
      <section>
        <h2>Build a scenario</h2>
        <div className="form-grid">
          <label>Layout</label>
          <select value={s.layout} onChange={(e) => update('layout', e.target.value as LayoutKey)}>
            {available.map((k) => (
              <option key={k} value={k}>
                {LAYOUT_NAMES[k]}
              </option>
            ))}
          </select>
          <label>Pickers</label>
          <select value={s.pickers} onChange={(e) => update('pickers', Number(e.target.value))}>
            {PICKER_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <label>Order volume</label>
          <select value={s.volume} onChange={(e) => update('volume', Number(e.target.value))}>
            {VOLUMES.map((v) => (
              <option key={v} value={v}>
                {v * 100}% {v > 1 ? '(real orders repeated)' : v < 1 ? '(every ' + Math.round(1 / v) + 'th order)' : '(real month)'}
              </option>
            ))}
          </select>
          <label>Walking speed</label>
          <select value={s.speed} onChange={(e) => update('speed', Number(e.target.value))}>
            {SPEEDS_MPS.map((v) => (
              <option key={v} value={v}>
                {v.toFixed(1)} m/s{v === WALK_SPEED_MPS ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <label>Demand</label>
          <select value={s.demand} onChange={(e) => update('demand', e.target.value as Demand)}>
            {DEMANDS.map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
          <label>Picking</label>
          <select value={s.mode} onChange={(e) => update('mode', e.target.value as PickingMode)}>
            <option value="single">Single order</option>
            <option value="batch">Batch of {BATCH_SIZE}</option>
          </select>
          <label>Routing</label>
          <select value={s.routing} onChange={(e) => update('routing', e.target.value as RoutingPolicy)}>
            <option value="nn">Nearest-neighbour (default)</option>
            <option value="nn2opt">Nearest-neighbour + 2-opt</option>
          </select>
          <label>Dispatch</label>
          <select value={s.dispatch} onChange={(e) => update('dispatch', e.target.value as DispatchPolicy)}>
            <option value="fifo">First in, first out (default)</option>
            <option value="spread">Spread pickers across aisles</option>
          </select>
        </div>
        <div className="row">
          <button className="primary" onClick={run} disabled={busy}>
            {busy ? 'Running…' : 'Run & add to comparison'}
          </button>
          {rows.length > 0 && (
            <button
              onClick={() => {
                savedRows = [];
                setRows([]);
              }}
            >
              Clear
            </button>
          )}
        </div>
        <p className="tiny-note">* Synthetic: each order keeps its size but its products are redrawn (seeded, repeatable). Use to stress-test, not as real demand.</p>
      </section>

      <section>
        <h2>Scenario comparison</h2>
        {rows.length === 0 ? (
          <p className="muted">No scenarios yet. Run one above; add a second to compare.</p>
        ) : (
          <div className="scenario-list">
            {rows.map((r) => (
              <div key={r.id} className="scenario">
                <div className="scenario-head">
                  <span>{label(r.scenario)}</span>
                  <button
                    className="close"
                    aria-label="Remove scenario"
                    onClick={() => {
                      savedRows = rows.filter((x) => x.id !== r.id);
                      setRows(savedRows);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="scenario-metrics">
                  <Metric label="Orders" value={r.orders.toLocaleString()} />
                  <Metric label="All done in" value={formatTime(r.makespanS)} />
                  <Metric label="Throughput" value={`${r.perHour.toFixed(1)}/h`} best={rows.length > 1 && r.perHour === bestRate} />
                  <Metric label="Walk / order" value={`${(r.distanceM / r.orders).toFixed(1)} m`} best={rows.length > 1 && r.distanceM / r.orders === bestDist} />
                  <Metric label="Time / order" value={`${r.avgOrderS.toFixed(1)} s`} best={rows.length > 1 && r.avgOrderS === bestTime} />
                  <Metric label="Waiting" value={minutes(r.waitS)} best={rows.length > 1 && r.waitS / r.orders === bestWait} />
                  <Metric label="Utilization" value={pct(r.util)} />
                  <Metric label="Total walk" value={km(r.distanceM)} />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="tiny-note">Per-order values are compared so scenarios with different volumes are fair. ★ = best among the scenarios shown.</p>
      </section>
    </>
  );
}

function Metric({ label, value, best }: { label: string; value: string; best?: boolean }) {
  return (
    <div className={`metric ${best ? 'best' : ''}`}>
      <span className="metric-value">
        {best ? '★ ' : ''}
        {value}
      </span>
      <span className="metric-label">{label}</span>
    </div>
  );
}
