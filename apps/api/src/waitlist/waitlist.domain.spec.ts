import { describe, expect, it } from 'vitest';
import { bestFit } from './waitlist.domain.js';
const entry = (id: string, places: number, time = 1) => ({
  id,
  places,
  createdAt: new Date(time),
});
describe('waitlist best fit', () => {
  it('prefers the largest compatible request over older smaller requests', () =>
    expect(
      bestFit([entry('a', 1), entry('b', 2, 2), entry('c', 3)], 2)?.id,
    ).toBe('b'));
  it('uses age then stable identity to break ties', () =>
    expect(
      bestFit([entry('c', 2, 2), entry('b', 2), entry('a', 2)], 2)?.id,
    ).toBe('a'));
  it('never splits a request or allocates unavailable capacity', () => {
    expect(bestFit([entry('a', 2)], 1)).toBeUndefined();
    expect(bestFit([entry('a', 1)], 0)).toBeUndefined();
  });
  it('fills remaining capacity with several independent requests', () => {
    const entries = [entry('a', 2), entry('b', 1), entry('c', 3)];
    let remaining = 4;
    const selected: string[] = [];
    for (;;) {
      const choice = bestFit(
        entries.filter((e) => !selected.includes(e.id)),
        remaining,
      );
      if (!choice) break;
      remaining -= choice.places;
      selected.push(choice.id);
    }
    expect(selected).toEqual(['c', 'b']);
    expect(remaining).toBe(0);
  });
});
