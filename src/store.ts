// App state (zustand). The sim engine stays pure; this file holds the user's
// choices (layout, picking mode, pickers, view), the replay controls, the swap
// game, and the background layout optimizer.

import { create } from 'zustand';
import { replayClock } from './replay/clock';
import { BATCH_SIZE } from './sim/config';
import { baselineLayout, originalLayout, swapSlots, type Layout } from './sim/layouts';
import { buildModel, type WarehouseModel } from './sim/model';
import type { OptimizeProgress, OptimizeResult } from './sim/optimizer';
import { scoreLayout, type Score } from './sim/scoring';
import type { Product, WarehouseData } from './sim/types';
import type { OptimizerMessage, OptimizerRequest } from './workers/optimizer.worker';

export type LayoutKey = 'original' | 'baseline' | 'optimized' | 'player';
export const LAYOUT_NAMES: Record<LayoutKey, string> = {
  original: 'Original',
  baseline: 'Auto baseline',
  optimized: 'Optimized',
  player: 'My layout',
};
export const LAYOUT_ORDER: LayoutKey[] = ['original', 'baseline', 'optimized', 'player'];

export const SAMPLE_SIZES = [20, 50, 100]; // orders in one animated replay
export const SPEEDS = [1, 5, 20, 60, 120];
export const PICKER_COUNTS = [1, 2, 3, 4, 5, 6];

// Picking mode: one order per trip, or BATCH_SIZE orders per trip.
export type PickingMode = 'single' | 'batch';
export const batchSizeFor = (mode: PickingMode) => (mode === 'batch' ? BATCH_SIZE : 1);

// Scores over all orders of the month. 'optimized' exists once the optimizer has finished.
export type LayoutScores = Record<Exclude<LayoutKey, 'optimized'>, Score> & { optimized?: Score };

// Floor overlay in the 3D view.
export type Overlay = 'none' | 'traffic' | 'congestion';
export type CameraPreset = 'overview' | 'top' | 'follow';
export type PanelTab = 'dashboard' | 'optimize' | 'game';
// What the user clicked on in the 3D view.
export type Inspect =
  | { kind: 'picker'; id: number }
  | { kind: 'aisle'; id: number }
  | { kind: 'slot'; id: number }
  | { kind: 'dock' }
  | null;

export type OptimizerState = {
  status: 'idle' | 'running' | 'done' | 'error';
  batchSize: number; // picking mode the layout was optimized for
  progress: OptimizeProgress | null;
  result: OptimizeResult | null;
  fitDemand: Product[] | null; // pick counts on the fit days (1-21 Nov)
  error: string | null;
};

type State = {
  data: WarehouseData | null;
  model: WarehouseModel | null;
  layouts: Record<LayoutKey, Layout>; // optimized = [] until the optimizer finishes
  scores: LayoutScores | null; // single-order picking
  batchScores: LayoutScores | null; // batch picking
  optimizer: OptimizerState;

  active: LayoutKey;
  mode: PickingMode;
  pickers: number;

  // Replay
  sampleStart: number;
  sampleSize: number;
  speed: number;
  playing: boolean;
  tick: number; // current replay tick (updated ~10x per second by the 3D loop)
  replayKey: number; // bumped whenever the replay should restart from 0

  // View
  overlay: Overlay;
  camera: CameraPreset;
  tab: PanelTab;
  hovered: number | null; // slot id under the mouse
  inspect: Inspect;
  demo: { active: boolean; step: number };

  // Swap game
  selected: number | null; // first slot clicked in swap mode
  swaps: number;
  lastSwapDeltaM: number | null;
  playerStart: 'original' | 'baseline' | 'optimized' | 'saved';

  init: (data: WarehouseData) => void;
  setActive: (key: LayoutKey) => void;
  setMode: (mode: PickingMode) => void;
  setPickers: (pickers: number) => void;
  setSpeed: (speed: number) => void;
  setPlaying: (playing: boolean) => void;
  replay: () => void;
  seek: (tick: number, tickS: number) => void;
  setTick: (tick: number) => void;
  setSampleStart: (index: number) => void;
  setSampleSize: (size: number) => void;
  setOverlay: (overlay: Overlay) => void;
  setCamera: (camera: CameraPreset) => void;
  setTab: (tab: PanelTab) => void;
  setHovered: (slot: number | null) => void;
  setInspect: (inspect: Inspect) => void;
  setDemo: (demo: { active: boolean; step: number }) => void;
  clickSlot: (slot: number) => void;
  clearSelection: () => void;
  resetPlayer: (from?: 'original' | 'baseline') => void;
  loadPlayerLayout: (layout: Layout, start?: State['playerStart']) => void;
  runOptimizer: (batchSize: number) => void;
};

// Score one layout in both picking modes.
function scoreBoth(model: WarehouseModel, layout: Layout, orders: WarehouseData['orders']) {
  return { single: scoreLayout(model, layout, orders, 1), batch: scoreLayout(model, layout, orders, BATCH_SIZE) };
}

// Restart the replay from t = 0 (paused unless `play`).
function restart(get: () => State, play = false): Partial<State> {
  replayClock.seconds = 0;
  return { playing: play, tick: 0, replayKey: get().replayKey + 1 };
}

let worker: Worker | null = null;

export const useStore = create<State>((set, get) => ({
  data: null,
  model: null,
  layouts: { original: [], baseline: [], optimized: [], player: [] },
  scores: null,
  batchScores: null,
  optimizer: { status: 'idle', batchSize: 1, progress: null, result: null, fitDemand: null, error: null },

  active: 'original',
  mode: 'single',
  pickers: 2,

  sampleStart: 0,
  sampleSize: 20,
  speed: 20,
  playing: false,
  tick: 0,
  replayKey: 0,

  overlay: 'none',
  camera: 'overview',
  tab: 'dashboard',
  hovered: null,
  inspect: null,
  demo: { active: false, step: 0 },

  selected: null,
  swaps: 0,
  lastSwapDeltaM: null,
  playerStart: 'original',

  init: (data) => {
    const model = buildModel();
    const original = originalLayout(data.products, model.grid.slots.length);
    const baseline = baselineLayout(data.products, model);
    const o = scoreBoth(model, original, data.orders);
    const b = scoreBoth(model, baseline, data.orders);
    set({
      data,
      model,
      layouts: { original, baseline, optimized: [], player: [...original] },
      // My layout starts as a copy of Original, so it starts with the same scores.
      scores: { original: o.single, baseline: b.single, player: o.single },
      batchScores: { original: o.batch, baseline: b.batch, player: o.batch },
    });
    get().runOptimizer(1); // start the optimizer in the background straight away
  },

  // Changing what is replayed restarts the replay so runs stay comparable.
  setActive: (active) => {
    if (active === 'optimized' && get().layouts.optimized.length === 0) return;
    set({ active, selected: null, ...restart(get) });
  },
  setMode: (mode) => set({ mode, ...restart(get) }),
  setPickers: (pickers) => set({ pickers, inspect: null, ...restart(get) }),
  setSpeed: (speed) => set({ speed }),
  setPlaying: (playing) => set({ playing }),
  replay: () => set(restart(get, true)),
  seek: (tick, tickS) => {
    replayClock.seconds = tick * tickS;
    set({ tick });
  },
  setTick: (tick) => set({ tick }),
  setSampleStart: (index) => {
    const max = Math.max(0, (get().data?.orders.length ?? 0) - get().sampleSize);
    set({ sampleStart: Math.min(Math.max(0, index), max), ...restart(get) });
  },
  setSampleSize: (sampleSize) => {
    set({ sampleSize });
    get().setSampleStart(get().sampleStart); // re-clamp the start
  },
  setOverlay: (overlay) => set({ overlay }),
  setCamera: (camera) => set({ camera }),
  setTab: (tab) => set({ tab }),
  setHovered: (hovered) => set({ hovered }),
  setInspect: (inspect) => set({ inspect }),
  setDemo: (demo) => set({ demo }),

  // Swap game: first click selects a slot, second click swaps the two slots
  // and re-scores My layout on every order of the month.
  clickSlot: (slot) => {
    const { active, selected, layouts, scores, batchScores, model, data, swaps } = get();
    if (active !== 'player' || !model || !data || !scores || !batchScores) return;
    if (selected === null) return set({ selected: slot });
    if (selected === slot) return set({ selected: null });

    const player = swapSlots(layouts.player, selected, slot);
    const score = scoreBoth(model, player, data.orders);
    set({
      layouts: { ...layouts, player },
      scores: { ...scores, player: score.single },
      batchScores: { ...batchScores, player: score.batch },
      selected: null,
      swaps: swaps + 1,
      lastSwapDeltaM: score.single.totalDistanceM - scores.player.totalDistanceM, // single-order mode
      ...restart(get),
    });
  },
  clearSelection: () => set({ selected: null }),

  // Load a layout (saved on the leaderboard, or the optimizer's) into My layout and re-score it.
  loadPlayerLayout: (layout, start = 'saved') => {
    const { layouts, scores, batchScores, model, data } = get();
    if (!scores || !batchScores || !model || !data) return;
    const score = scoreBoth(model, layout, data.orders);
    set({
      layouts: { ...layouts, player: [...layout] },
      scores: { ...scores, player: score.single },
      batchScores: { ...batchScores, player: score.batch },
      active: 'player',
      selected: null,
      swaps: 0,
      lastSwapDeltaM: null,
      playerStart: start,
      ...restart(get),
    });
  },
  // Reset My layout to a copy of Original (default) or of the auto baseline.
  resetPlayer: (from = 'original') => {
    const { layouts, scores, batchScores } = get();
    if (!scores || !batchScores) return;
    set({
      layouts: { ...layouts, player: [...layouts[from]] },
      scores: { ...scores, player: scores[from] },
      batchScores: { ...batchScores, player: batchScores[from] },
      selected: null,
      swaps: 0,
      lastSwapDeltaM: null,
      playerStart: from,
      ...restart(get),
    });
  },

  // Optimize in a Web Worker (fits on days 1-21). When done, the layout becomes
  // the 'Optimized' option and is scored on all orders like every other layout.
  runOptimizer: (batchSize) => {
    const { data, model } = get();
    if (!data || !model) return;
    worker?.terminate();
    worker = new Worker(new URL('./workers/optimizer.worker.ts', import.meta.url), { type: 'module' });
    set({ optimizer: { status: 'running', batchSize, progress: null, result: null, fitDemand: null, error: null } });
    worker.onmessage = (e: MessageEvent<OptimizerMessage>) => {
      const msg = e.data;
      const opt = get().optimizer;
      if (msg.type === 'progress') return set({ optimizer: { ...opt, progress: msg.progress } });
      if (msg.type === 'error') return set({ optimizer: { ...opt, status: 'error', error: msg.message } });
      const { scores, batchScores, layouts, active } = get();
      if (!scores || !batchScores) return;
      const s = scoreBoth(model, msg.result.layout, data.orders);
      set({
        optimizer: { ...opt, status: 'done', result: msg.result, fitDemand: msg.fitDemand },
        layouts: { ...layouts, optimized: msg.result.layout },
        scores: { ...scores, optimized: s.single },
        batchScores: { ...batchScores, optimized: s.batch },
        // If the old optimized layout was on screen, restart the replay with the new one.
        ...(active === 'optimized' ? restart(get) : {}),
      });
      worker?.terminate();
      worker = null;
    };
    const request: OptimizerRequest = { products: data.products, orders: data.orders, batchSize };
    worker.postMessage(request);
  },
}));

// Dev-only: expose the store in the browser console for debugging.
if (import.meta.env.DEV) (window as unknown as { store: typeof useStore }).store = useStore;
