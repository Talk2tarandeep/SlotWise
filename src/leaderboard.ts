// Local leaderboard: saved player layouts in this browser's localStorage.
//
// We store only the layout (which product is in which slot), never a score.
// Scores are recomputed from the real orders every time the board is shown,
// so a saved entry can't carry a stale or edited number.

import type { Layout } from './sim/layouts';
import type { Product } from './sim/types';

const STORAGE_KEY = 'slotwise.leaderboard.v1';
export const MAX_ENTRIES = 20;

export type LeaderboardEntry = {
  id: string;
  name: string;
  savedAt: string; // ISO timestamp
  month: string; // data month the layout was made for
  layout: Layout;
};

// A layout is usable only if it places exactly the current products,
// each once, in a floor with the same number of slots.
export function isValidLayout(layout: unknown, products: Product[], slotCount: number): layout is Layout {
  if (!Array.isArray(layout) || layout.length !== slotCount) return false;
  const placed = layout.filter((c) => c !== null);
  if (placed.some((c) => typeof c !== 'string')) return false;
  const codes = new Set(products.map((p) => p.code));
  return placed.length === codes.size && new Set(placed).size === placed.length && placed.every((c) => codes.has(c));
}

// Read entries for this month; silently drops anything malformed.
// localStorage can be unavailable (private mode, blocked storage): treat as empty.
export function loadEntries(month: string, products: Product[], slotCount: number): LeaderboardEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is LeaderboardEntry =>
        e && typeof e.name === 'string' && e.month === month && isValidLayout(e.layout, products, slotCount),
    );
  } catch {
    return [];
  }
}

// Returns false if the browser refused to store it.
export function saveEntries(entries: LeaderboardEntry[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    return true;
  } catch {
    return false;
  }
}

export function sameLayout(a: Layout, b: Layout): boolean {
  return a.length === b.length && a.every((code, i) => code === b[i]);
}
