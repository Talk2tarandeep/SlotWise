// App state (zustand). The sim engine stays pure; this file only holds
// which layout is active, replay controls, live counters and hover state.

import { create } from 'zustand';
import { baselineLayout, originalLayout, type Layout } from './sim/layouts';
import { buildModel, type WarehouseModel } from './sim/model';
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
  active: LayoutKey;

  sampleStart: number; // index of the first order in the replay sample
  speed: number;
  playing: boolean;
  replayId: number; // bumped to restart the replay from t = 0
  live: LiveCounters;
  hovered: number | null; // slot id under the mouse

  init: (data: WarehouseData) => void;
  setActive: (key: LayoutKey) => void;
  setSpeed: (speed: number) => void;
  setPlaying: (playing: boolean) => void;
  replay: () => void;
  setSampleStart: (index: number) => void;
  setLive: (live: LiveCounters) => void;
  setHovered: (slot: number | null) => void;
};

const ZERO: LiveCounters = { distance: 0, elapsed: 0, ordersDone: 0, orderIdx: 0 };

export const useStore = create<State>((set, get) => ({
  data: null,
  model: null,
  layouts: { original: [], baseline: [], player: [] },
  active: 'original',
  sampleStart: 0,
  speed: 20,
  playing: false,
  replayId: 0,
  live: ZERO,
  hovered: null,

  init: (data) => {
    const model = buildModel();
    const original = originalLayout(data.products, model.grid.slots.length);
    set({
      data,
      model,
      layouts: { original, baseline: baselineLayout(data.products, model), player: [...original] },
    });
  },
  // Changing layout or sample restarts the replay (paused) so runs are comparable.
  setActive: (active) => set({ active, playing: false, replayId: get().replayId + 1, live: ZERO }),
  setSpeed: (speed) => set({ speed }),
  setPlaying: (playing) => set({ playing }),
  replay: () => set({ playing: true, replayId: get().replayId + 1, live: ZERO }),
  setSampleStart: (index) => {
    const max = Math.max(0, (get().data?.orders.length ?? 0) - SAMPLE_SIZE);
    set({ sampleStart: Math.min(Math.max(0, index), max), playing: false, replayId: get().replayId + 1, live: ZERO });
  },
  setLive: (live) => set({ live }),
  setHovered: (hovered) => set({ hovered }),
}));
