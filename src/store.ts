// App state (zustand). The sim engine stays pure; this file only holds
// which layout is active, replay controls, live counters, hover state and
// the swap game (selected slot, player layout, scores).

import { create } from 'zustand';
import { baselineLayout, originalLayout, swapSlots, type Layout } from './sim/layouts';
import { buildModel, type WarehouseModel } from './sim/model';
import { scoreLayout, type Score } from './sim/scoring';
import type { WarehouseData } from './sim/types';

export type LayoutKey = 'original' | 'baseline' | 'player';
export const LAYOUT_NAMES: Record<LayoutKey, string> = {
  original: 'Original',
  baseline: 'Auto baseline',
  player: 'My layout',
};

export const SAMPLE_SIZE = 20; // orders shown in one animated replay
export const SPEEDS = [1, 5, 20, 60];

export type LiveCounters = { distance: number; elapsed: number; ordersDone: number; orderIdx: number };

type State = {
  data: WarehouseData | null;
  model: WarehouseModel | null;
  layouts: Record<LayoutKey, Layout>;
  scores: Record<LayoutKey, Score> | null; // all orders of the month, per layout
  active: LayoutKey;

  sampleStart: number; // index of the first order in the replay sample
  speed: number;
  playing: boolean;
  replayId: number; // bumped to restart the replay from t = 0
  live: LiveCounters;
  hovered: number | null; // slot id under the mouse
  showHeatmap: boolean; // floor traffic heatmap overlay

  selected: number | null; // first slot clicked in swap mode
  swaps: number; // swaps made in My layout since the last reset
  lastSwapDeltaM: number | null; // change in total distance from the last swap

  init: (data: WarehouseData) => void;
  setActive: (key: LayoutKey) => void;
  setSpeed: (speed: number) => void;
  setPlaying: (playing: boolean) => void;
  replay: () => void;
  setSampleStart: (index: number) => void;
  setLive: (live: LiveCounters) => void;
  setHovered: (slot: number | null) => void;
  toggleHeatmap: () => void;
  clickSlot: (slot: number) => void;
  clearSelection: () => void;
  resetPlayer: (from?: 'original' | 'baseline') => void;
};

const ZERO: LiveCounters = { distance: 0, elapsed: 0, ordersDone: 0, orderIdx: 0 };

export const useStore = create<State>((set, get) => ({
  data: null,
  model: null,
  layouts: { original: [], baseline: [], player: [] },
  scores: null,
  active: 'original',
  sampleStart: 0,
  speed: 20,
  playing: false,
  replayId: 0,
  live: ZERO,
  hovered: null,
  showHeatmap: false,
  selected: null,
  swaps: 0,
  lastSwapDeltaM: null,

  init: (data) => {
    const model = buildModel();
    const original = originalLayout(data.products, model.grid.slots.length);
    const baseline = baselineLayout(data.products, model);
    const originalScore = scoreLayout(model, original, data.orders);
    set({
      data,
      model,
      layouts: { original, baseline, player: [...original] },
      scores: {
        original: originalScore,
        baseline: scoreLayout(model, baseline, data.orders),
        player: originalScore, // My layout starts as a copy of Original
      },
    });
  },
  // Changing layout or sample restarts the replay (paused) so runs are comparable.
  setActive: (active) => set({ active, selected: null, playing: false, replayId: get().replayId + 1, live: ZERO }),
  setSpeed: (speed) => set({ speed }),
  setPlaying: (playing) => set({ playing }),
  replay: () => set({ playing: true, replayId: get().replayId + 1, live: ZERO }),
  setSampleStart: (index) => {
    const max = Math.max(0, (get().data?.orders.length ?? 0) - SAMPLE_SIZE);
    set({ sampleStart: Math.min(Math.max(0, index), max), playing: false, replayId: get().replayId + 1, live: ZERO });
  },
  setLive: (live) => set({ live }),
  setHovered: (hovered) => set({ hovered }),
  toggleHeatmap: () => set({ showHeatmap: !get().showHeatmap }),

  // Swap game: first click selects a slot, second click swaps the two slots
  // and re-scores My layout on every order of the month.
  clickSlot: (slot) => {
    const { active, selected, layouts, scores, model, data, swaps, replayId } = get();
    if (active !== 'player' || !model || !data || !scores) return;
    if (selected === null) return set({ selected: slot });
    if (selected === slot) return set({ selected: null });

    const player = swapSlots(layouts.player, selected, slot);
    const score = scoreLayout(model, player, data.orders);
    set({
      layouts: { ...layouts, player },
      scores: { ...scores, player: score },
      selected: null,
      swaps: swaps + 1,
      lastSwapDeltaM: score.totalDistanceM - scores.player.totalDistanceM,
      playing: false,
      replayId: replayId + 1,
      live: ZERO,
    });
  },
  clearSelection: () => set({ selected: null }),
  // Reset My layout to a copy of Original (default) or of the auto baseline,
  // so a player can also try to improve on the baseline directly.
  resetPlayer: (from = 'original') => {
    const { layouts, scores, replayId } = get();
    if (!scores) return;
    set({
      layouts: { ...layouts, player: [...layouts[from]] },
      scores: { ...scores, player: scores[from] },
      selected: null,
      swaps: 0,
      lastSwapDeltaM: null,
      playing: false,
      replayId: replayId + 1,
      live: ZERO,
    });
  },
}));

// Dev-only: expose the store in the browser console for debugging.
if (import.meta.env.DEV) (window as unknown as { store: typeof useStore }).store = useStore;
