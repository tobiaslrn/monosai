import { describe, expect, it } from 'vitest';
import { mappingFor } from '../../../../testing/anki-provider-contract';
import { batched, searchFor } from './connect-search';

describe('searchFor', () => {
  it('asks for the deck and the note type', () => {
    expect(searchFor(mappingFor())).toBe(
      '"deck:Core Japanese" "note:Basic" -"deck:Core Japanese::*"',
    );
  });

  it('drops the subdeck subtraction when subdecks are wanted', () => {
    expect(searchFor(mappingFor({ deckScope: 'deck-and-subdecks' }))).toBe(
      '"deck:Core Japanese" "note:Basic"',
    );
  });

  it('escapes quotes and backslashes in a deck name', () => {
    const query = searchFor(mappingFor({ deckName: 'Grammar "notes"\\old' }));
    expect(query).toContain('"deck:Grammar \\"notes\\"\\\\old"');
  });

  it('never asks Anki to filter by queue state', () => {
    // Eligibility is review evidence, not the current queue: a card that was
    // studied and later forgotten is new again but still reviewed.
    const query = searchFor(mappingFor());
    expect(query).not.toContain('is:new');
    expect(query).not.toContain('is:review');
    expect(query).not.toContain('-is:');
  });
});

describe('batched', () => {
  it('splits into whole batches', () => {
    expect(batched([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('keeps the remainder as a final short batch', () => {
    expect(batched([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it('produces nothing for an empty list', () => {
    expect(batched([], 10)).toEqual([]);
  });
});
