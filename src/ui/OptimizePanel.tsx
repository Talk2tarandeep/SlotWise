// Optimize tab: the layout optimizer, a fair before/after comparison on
// held-out orders, a data-driven explanation, suggested SKU moves, demand
// (ABC) analysis, and routing / dispatch policy experiments.
// Every number here is computed; nothing is claimed without a measurement.

import { useMemo, useState } from 'react';
import { monthSim } from '../scene/helpers';
import { abcClasses, relocations, shareOfPicksNearDock, slotLabel, splitOrders } from '../sim/analysis';
import { DOCK_NODE } from '../sim/grid';
import { slotOfProduct } from '../sim/layouts';
import { pctChange } from '../sim/scoring';
import { batchSizeFor, LAYOUT_NAMES, useStore } from '../store';
import { EVAL_PICKERS, heldOutComparison, type EvalRow } from './evaluation';
import { changeClass, km, minutes, signedPct } from './format';

const NEAR_DOCK_M = 12; // "near the dock" threshold for the explanation

export function OptimizePanel() {
  const optimizer = useStore((s) => s.optimizer);
  const mode = useStore((s) => s.mode);
  const runOptimizer = useStore((s) => s.runOptimizer);
  const batchSize = batchSizeFor(mode);

  return (
    <>
      <section>
        <h2>Layout optimizer</h2>
        <p className="muted">
          Swap-based local search: start from the better of two demand-based layouts (fast movers nearest the dock, or packed into the fewest
          aisles), then keep any slot swap that shortens total walking. It learns from <b>1–21 Nov</b> only and is judged on <b>22–30 Nov</b>,
          which it never saw.
        </p>
        {optimizer.status === 'running' && (
          <>
            <div className="progress">
              <div style={{ width: `${optimizer.progress ? (100 * optimizer.progress.slot) / optimizer.progress.slots : 0}%` }} />
            </div>
            <p className="muted">
              {optimizer.progress
                ? `Pass ${optimizer.progress.pass} · ${optimizer.progress.acceptedSwaps} improving swaps so far · fit-period walk ${km(optimizer.progress.distanceM)}`
                : 'Starting…'}
            </p>
          </>
        )}
        {optimizer.status === 'error' && <p className="muted bad">Optimizer failed: {optimizer.error}</p>}
        {optimizer.status === 'done' && optimizer.result && (
          <p className="muted">
            Started from <b>{optimizer.result.seed}</b>, {optimizer.result.passes} passes, {optimizer.result.acceptedSwaps} improving swaps (
            {optimizer.result.stoppedBy === 'converged' ? 'no further swap helps' : optimizer.result.stoppedBy}), {(optimizer.result.ms / 1000).toFixed(1)} s.
            Fit-period walking: {km(optimizer.result.seedDistanceM)} → {km(optimizer.result.finalDistanceM)}. Optimized for{' '}
            {optimizer.batchSize > 1 ? `batches of ${optimizer.batchSize}` : 'single-order picking'}.
          </p>
        )}
        <div className="row">
          <button onClick={() => runOptimizer(batchSize)} disabled={optimizer.status === 'running'}>
            {optimizer.status === 'running' ? 'Running…' : `Re-optimize for ${mode === 'batch' ? 'batch' : 'single-order'} picking`}
          </button>
        </div>
      </section>
      {optimizer.status === 'done' && <OptimizerResults />}
      <PolicyExperiments />
    </>
  );
}

function OptimizerResults() {
  const model = useStore((s) => s.model)!;
  const data = useStore((s) => s.data)!;
  const layouts = useStore((s) => s.layouts);
  const optimizer = useStore((s) => s.optimizer);
  const { setActive, loadPlayerLayout } = useStore.getState();
  const rows = heldOutComparison(model, data, layouts.original, layouts.optimized, optimizer.fitDemand!, optimizer.batchSize);
  const base = rows.find((r) => r.key === 'baseline')!;
  const opt = rows.find((r) => r.key === 'optimized')!;
  const orig = rows.find((r) => r.key === 'original')!;
  const test = useMemo(() => splitOrders(data.orders).test, [data]);

  return (
    <>
      <section>
        <h2>
          Before / after · held-out 22–30 Nov ({test.length} orders, {optimizer.batchSize > 1 ? `batch of ${optimizer.batchSize}` : 'single order'})
        </h2>
        <table className="results">
          <thead>
            <tr>
              <th>Layout</th>
              <th>Walk</th>
              <th>s/order</th>
              <th>Aisles/trip</th>
              <th title={`Congestion waiting with ${EVAL_PICKERS} pickers`}>Wait ({EVAL_PICKERS}p)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <EvalTableRow key={r.key} row={r} base={base} />
            ))}
          </tbody>
        </table>
        <p className="muted">Same orders, same routing rule and timing for every row. % = change vs the auto baseline built from the same 1–21 Nov demand.</p>
        <Explanation orig={orig} base={base} opt={opt} />
        <div className="row">
          <button onClick={() => setActive('optimized')}>View in 3D</button>
          <button className="primary" onClick={() => loadPlayerLayout(layouts.optimized, 'optimized')}>
            Copy to My layout
          </button>
        </div>
      </section>
      <AbcCard />
      <RelocationsCard />
    </>
  );
}

function EvalTableRow({ row, base }: { row: EvalRow; base: EvalRow }) {
  const d = pctChange(row.score.totalDistanceM, base.score.totalDistanceM);
  const w = pctChange(row.waitS, base.waitS);
  const isBase = row.key === 'baseline';
  return (
    <tr className={row.key === 'optimized' ? 'active' : ''}>
      <td>{row.name}</td>
      <td>
        {km(row.score.totalDistanceM)}
        {!isBase && <div className={`delta ${changeClass(d)}`}>{signedPct(d)}</div>}
      </td>
      <td>{row.score.avgPickTimeS.toFixed(1)}</td>
      <td>{row.aislesPerTrip.toFixed(2)}</td>
      <td>
        {minutes(row.waitS)}
        {!isBase && <div className={`delta ${changeClass(w)}`}>{signedPct(w, 0)}</div>}
      </td>
    </tr>
  );
}

// "Why is it better?" Each statement is a measured comparison; worse results are said plainly.
function Explanation({ orig, base, opt }: { orig: EvalRow; base: EvalRow; opt: EvalRow }) {
  const model = useStore((s) => s.model)!;
  const data = useStore((s) => s.data)!;
  const test = useMemo(() => splitOrders(data.orders).test, [data]);
  const near = (r: EvalRow) => shareOfPicksNearDock(model, r.layout, test, NEAR_DOCK_M);
  const dDist = pctChange(opt.score.totalDistanceM, base.score.totalDistanceM);
  const dWait = pctChange(opt.waitS, base.waitS);
  const better = (x: number) => (x < 0 ? 'less' : 'more');
  const items = [
    `Walking: ${Math.abs(dDist).toFixed(1)}% ${better(dDist)} than the auto baseline and ${Math.abs(pctChange(opt.score.totalDistanceM, orig.score.totalDistanceM)).toFixed(1)}% ${better(pctChange(opt.score.totalDistanceM, orig.score.totalDistanceM))} than Original, on orders it never saw.`,
    opt.aislesPerTrip < base.aislesPerTrip
      ? `Fewer aisle visits: a trip enters ${opt.aislesPerTrip.toFixed(2)} aisles on average (baseline ${base.aislesPerTrip.toFixed(2)}), so less walking into and back out of aisles.`
      : `Aisle visits: a trip enters ${opt.aislesPerTrip.toFixed(2)} aisles on average (baseline ${base.aislesPerTrip.toFixed(2)}); the saving comes from shorter walks, not fewer aisles.`,
    near(opt) < near(base)
      ? `Only ${(near(opt) * 100).toFixed(0)}% of picks are within ${NEAR_DOCK_M} m of the dock (baseline ${(near(base) * 100).toFixed(0)}%): it gives up some closeness to the dock and still walks less overall.`
      : `${(near(opt) * 100).toFixed(0)}% of picks are within ${NEAR_DOCK_M} m of the dock (baseline ${(near(base) * 100).toFixed(0)}%).`,
    dWait <= 0
      ? `Congestion: ${Math.abs(dWait).toFixed(0)}% less waiting with ${EVAL_PICKERS} pickers. It was not optimized for congestion; this was measured afterwards.`
      : `Congestion: ${dWait.toFixed(0)}% MORE waiting with ${EVAL_PICKERS} pickers. It was optimized for walking only; this trade-off was measured afterwards.`,
  ];
  return (
    <ul className="explain">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

// Demand-based slotting: how far each ABC class sits from the dock, before and after.
function AbcCard() {
  const model = useStore((s) => s.model)!;
  const data = useStore((s) => s.data)!;
  const layouts = useStore((s) => s.layouts);
  const optimizer = useStore((s) => s.optimizer);
  const demand = optimizer.fitDemand!;
  const abc = abcClasses(demand);
  const total = demand.reduce((n, p) => n + p.picks, 0);
  const avgDock = (layout: typeof layouts.original, cls: string) => {
    const slotOf = slotOfProduct(layout);
    const ps = demand.filter((p) => abc.get(p.code) === cls);
    return ps.reduce((n, p) => n + model.dist[DOCK_NODE][model.grid.slots[slotOf.get(p.code)!].node], 0) / Math.max(1, ps.length);
  };
  return (
    <section>
      <h2>Demand classes (ABC, 1–21 Nov)</h2>
      <table className="results">
        <thead>
          <tr>
            <th>Class</th>
            <th>Products</th>
            <th>Share of picks</th>
            <th>Avg dock walk: Original</th>
            <th>Optimized</th>
          </tr>
        </thead>
        <tbody>
          {(['A', 'B', 'C'] as const).map((cls) => {
            const ps = demand.filter((p) => abc.get(p.code) === cls);
            return (
              <tr key={cls}>
                <td>{cls}</td>
                <td>{ps.length}</td>
                <td>{((100 * ps.reduce((n, p) => n + p.picks, 0)) / total).toFixed(0)}%</td>
                <td>{avgDock(layouts.original, cls).toFixed(1)} m</td>
                <td>{avgDock(layouts.optimized, cls).toFixed(1)} m</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">A = top 20% of products by picks, B = next 30%, C = the rest. Data: {data.month}.</p>
    </section>
  );
}

// Suggested SKU moves: Original (today's slotting) -> Optimized.
function RelocationsCard() {
  const model = useStore((s) => s.model)!;
  const layouts = useStore((s) => s.layouts);
  const optimizer = useStore((s) => s.optimizer);
  const [showAll, setShowAll] = useState(false);
  const moves = useMemo(() => relocations(model, layouts.original, layouts.optimized, optimizer.fitDemand!), [model, layouts, optimizer.fitDemand]);
  const shown = showAll ? moves : moves.slice(0, 10);
  return (
    <section>
      <h2>Suggested SKU moves · {moves.length} of 100 products</h2>
      <p className="muted">From today's slotting (Original) to the optimized layout, busiest products first (picks on 1–21 Nov).</p>
      <table className="results moves">
        <thead>
          <tr>
            <th>Product</th>
            <th>Picks</th>
            <th>From → to</th>
            <th>Dock walk</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((m) => (
            <tr key={m.code} title={m.desc}>
              <td>
                <b>{m.code}</b>
                <div className="sub">{m.desc}</div>
              </td>
              <td>{m.picks}</td>
              <td>
                {m.fromSlot === null ? '—' : slotLabel(model, m.fromSlot)} → {slotLabel(model, m.toSlot)}
              </td>
              <td className={m.fromDockM !== null ? changeClass(m.toDockM - m.fromDockM) : ''}>
                {m.fromDockM ?? '—'} → {m.toDockM} m
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {moves.length > 10 && (
        <button className="link" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${moves.length}`}
        </button>
      )}
    </section>
  );
}

// Routing and dispatch policies, measured on the whole month with the active layout.
function PolicyExperiments() {
  const model = useStore((s) => s.model)!;
  const data = useStore((s) => s.data)!;
  const layouts = useStore((s) => s.layouts);
  const active = useStore((s) => s.active);
  const mode = useStore((s) => s.mode);
  const [run, setRun] = useState<{ key: string; layout: unknown; rows: { name: string; dist: number; wait: number; makespan: number }[] } | null>(null);
  const key = `${active}|${mode}`; // plus the layout array itself (it changes on every swap)
  const batchSize = batchSizeFor(mode);

  const compute = () => {
    const layout = layouts[active];
    const base = { pickers: EVAL_PICKERS, batchSize };
    const rows = [
      { name: 'Nearest-neighbour + FIFO (default)', opts: { ...base } },
      { name: '+ 2-opt routing', opts: { ...base, routing: 'nn2opt' as const } },
      { name: '+ spread dispatch', opts: { ...base, dispatch: 'spread' as const } },
      { name: '+ both', opts: { ...base, routing: 'nn2opt' as const, dispatch: 'spread' as const } },
    ].map(({ name, opts }) => {
      const r = monthSim(model, layout, data.orders, opts);
      return { name, dist: r.totalDistanceM, wait: r.totalWaitS, makespan: r.makespanS };
    });
    setRun({ key, layout, rows });
  };
  const rows = run?.key === key && run.layout === layouts[active] ? run.rows : null;
  const ref = rows?.[0];

  return (
    <section>
      <h2>Routing &amp; coordination experiments</h2>
      <p className="muted">
        Same layout ({LAYOUT_NAMES[active]}), all {data.orders.length.toLocaleString()} orders, {EVAL_PICKERS} pickers. <b>2-opt</b> reorders each route
        to remove backtracking. <b>Spread dispatch</b> lets a free picker take one of the next 6 queued orders that overlaps least with aisles
        other pickers are working in (the oldest order can be passed over at most 3 times).
      </p>
      {!rows ? (
        <button onClick={compute}>Run comparison</button>
      ) : (
        <table className="results">
          <thead>
            <tr>
              <th>Policy</th>
              <th>Walk</th>
              <th>Waiting</th>
              <th>All done</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>
                  {km(r.dist)}
                  {r !== ref && <div className={`delta ${changeClass(pctChange(r.dist, ref!.dist))}`}>{signedPct(pctChange(r.dist, ref!.dist))}</div>}
                </td>
                <td>
                  {minutes(r.wait)}
                  {r !== ref && <div className={`delta ${changeClass(pctChange(r.wait, ref!.wait))}`}>{signedPct(pctChange(r.wait, ref!.wait), 0)}</div>}
                </td>
                <td>
                  {(r.makespan / 3600).toFixed(2)} h
                  {r !== ref && <div className={`delta ${changeClass(pctChange(r.makespan, ref!.makespan))}`}>{signedPct(pctChange(r.makespan, ref!.makespan))}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">The rest of the app (scores, replay, leaderboard) uses the default policy, so all layouts are compared under one rule.</p>
    </section>
  );
}

