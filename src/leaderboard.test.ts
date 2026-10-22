import { describe, expect, it } from 'vitest';
import { isValidLayout, sameLayout } from './leaderboard';
import { originalLayout, swapSlots } from './sim/layouts';
import type { Product } from './sim/types';

const products: Product[] = ['A', 'B', 'C'].map((code, i) => ({ code, desc: '', picks: 3 - i, rank: i + 1 }));
const layout = originalLayout(products, 5); // ['A','B','C',null,null]

describe('leaderboard layout validation', () => {
  it('accepts a real layout and a swapped one', () => {
    expect(isValidLayout(layout, products, 5)).toBe(true);
    expect(isValidLayout(swapSlots(layout, 0, 4), products, 5)).toBe(true);
  });

  it('rejects wrong length, duplicates, missing or unknown products', () => {
    expect(isValidLayout(layout.slice(0, 4), products, 5)).toBe(false);
    expect(isValidLayout(['A', 'A', 'C', null, null], products, 5)).toBe(false);
    expect(isValidLayout(['A', 'B', null, null, null], products, 5)).toBe(false);
    expect(isValidLayout(['A', 'B', 'Z', null, null], products, 5)).toBe(false);
    expect(isValidLayout('not a layout', products, 5)).toBe(false);
  });

  it('compares layouts slot by slot', () => {
    expect(sameLayout(layout, [...layout])).toBe(true);
    expect(sameLayout(layout, swapSlots(layout, 0, 1))).toBe(false);
  });
});
