// Demo Mode: a ~50 second guided tour for judges.
//   1. Original layout, 4 pickers, live congestion overlay.
//   2. Follow one picker: dashed = planned route, dots = path walked.
//   3. Auto baseline: less walking, but more congestion (numbers from the sim).
//   4. Optimized layout: results on held-out days it never saw (if ready).
//   5. Summary, then everything the user had set is restored.
// Captions are computed from simulation results at run time, never typed in.
// The demo only changes view settings; it never edits My layout.

import { useEffect } from 'react';
import { monthSim } from '../scene/helpers';
import { pctChange } from '../sim/scoring';
import { useStore, type LayoutKey } from '../store';
import { EVAL_PICKERS, heldOutComparison } from './evaluation';
import { signedPct } from './format';

type Snapshot = Pick<
  ReturnType<typeof useStore.getState>,
  'active' | 'pickers' | 'mode' | 'overlay' | 'camera' | 'speed' | 'sampleStart' | 'sampleSize' | 'inspect' | 'tab'
>;
let snapshot: Snapshot | null = null;
let activePlan: Step[] = []; // the running demo's steps (shared by director and caption)

type Step = { ms: number; enter: () => void; caption: () => string };

function steps(): Step[] {
  const s = useStore.getState;
  const month = (key: LayoutKey) => {
    const { model, data, layouts } = s();
    return monthSim(model!, layouts[key], data!.orders, { pickers: EVAL_PICKERS, batchSize: 1 });
  };
  const show = (key: LayoutKey) => {
    s().setActive(key);
    s().replay();
  };

  const list: Step[] = [
    {
      ms: 11000,
      enter: () => {
        const st = s();
        st.setMode('single');
        st.setPickers(EVAL_PICKERS);
        st.setSampleSize(50);
        st.setSampleStart(0);
        st.setOverlay('congestion');
        st.setCamera('overview');
        st.setSpeed(60);
        st.setInspect(null);
        show('original');
      },
      caption: () =>
        `Original layout · ${EVAL_PICKERS} pickers · 50 real orders (Nov 2010). Floor colours show waiting: green = flowing, red = pickers blocked by each other.`,
    },
    {
      ms: 8000,
      enter: () => {
        s().setInspect({ kind: 'picker', id: 0 });
        s().setCamera('follow');
      },
      caption: () => 'Following Picker 1: dashed line = planned route for this order, dots = the path actually walked (pauses = picking or waiting).',
    },
    {
      ms: 11000,
      enter: () => {
        s().setInspect(null);
        s().setCamera('overview');
        show('baseline');
      },
      caption: () => {
        const { scores } = s();
        const d = pctChange(scores!.baseline.totalDistanceM, scores!.original.totalDistanceM);
        const w = pctChange(month('baseline').totalWaitS, month('original').totalWaitS);
        return `Auto baseline (fast movers nearest the dock): whole month ${signedPct(d)} walking vs Original, but ${signedPct(w, 0)} congestion waiting with ${EVAL_PICKERS} pickers. Fast movers crowd the same aisles.`;
      },
    },
  ];

  const { optimizer, layouts, model, data } = s();
  if (optimizer.status === 'done' && optimizer.fitDemand && model && data) {
    const rows = heldOutComparison(model, data, layouts.original, layouts.optimized, optimizer.fitDemand, optimizer.batchSize);
    const base = rows.find((r) => r.key === 'baseline')!;
    const opt = rows.find((r) => r.key === 'optimized')!;
    list.push({
      ms: 12000,
      enter: () => show('optimized'),
      caption: () =>
        `Optimized layout (local search, fitted on 1–21 Nov). On the unseen 22–30 Nov orders: ${signedPct(pctChange(opt.score.totalDistanceM, base.score.totalDistanceM))} walking and ${signedPct(pctChange(opt.waitS, base.waitS), 0)} congestion waiting vs the baseline.`,
    });
  }
  list.push({
    ms: 8000,
    enter: () => s().setOverlay('none'),
    caption: () =>
      optimizer.status === 'done'
        ? 'Same orders, same routing rule, same pickers. Only the slotting changed. Open the Optimize tab for the suggested SKU moves.'
        : 'Same orders, same routing rule, same pickers. Only the slotting changed. (The optimizer is still running; try the demo again in a moment.)',
  });
  return list;
}

// Mounted once in App: runs the demo while store.demo.active is true.
export function DemoDirector() {
  const demo = useStore((s) => s.demo);

  useEffect(() => {
    if (!demo.active) return;
    if (demo.step === 0) activePlan = steps();
    const step = activePlan[demo.step];
    if (!step) return stopDemo();
    step.enter();
    const timer = setTimeout(() => useStore.getState().setDemo({ active: true, step: demo.step + 1 }), step.ms);
    return () => clearTimeout(timer);
  }, [demo]);

  return null;
}

export function DemoCaption() {
  const demo = useStore((s) => s.demo);
  // Re-render when the tick changes so captions stay in sync with the replay.
  useStore((s) => s.tick);
  if (!demo.active) return null;
  const list = activePlan;
  const step = list[demo.step];
  if (!step) return null;
  return (
    <div className="demo-caption">
      <span className="demo-step">
        Demo {demo.step + 1}/{list.length}
      </span>
      {step.caption()}
    </div>
  );
}

export function startDemo() {
  const s = useStore.getState();
  snapshot = {
    active: s.active,
    pickers: s.pickers,
    mode: s.mode,
    overlay: s.overlay,
    camera: s.camera,
    speed: s.speed,
    sampleStart: s.sampleStart,
    sampleSize: s.sampleSize,
    inspect: s.inspect,
    tab: s.tab,
  };
  s.setDemo({ active: true, step: 0 });
}

export function stopDemo() {
  const s = useStore.getState();
  s.setDemo({ active: false, step: 0 });
  if (!snapshot) return;
  const snap = snapshot;
  snapshot = null;
  s.setMode(snap.mode);
  s.setPickers(snap.pickers);
  s.setSampleSize(snap.sampleSize);
  s.setSampleStart(snap.sampleStart);
  s.setActive(snap.active);
  s.setOverlay(snap.overlay);
  s.setCamera(snap.camera);
  s.setSpeed(snap.speed);
  s.setInspect(snap.inspect);
  s.setTab(snap.tab);
  s.setPlaying(false);
}
