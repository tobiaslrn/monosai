import { describe, expect, it } from 'vitest';
import { mappingFor } from '../../../../testing/anki-provider-contract';
import {
  ACTIVITY_SEARCHES,
  activitySearchFor,
  batched,
  filteredByNameFor,
  searchFor,
} from './connect-search';

describe('searchFor', () => {
  it('asks for the deck and the note type', () => {
    expect(searchFor(mappingFor())).toBe(
      '"deck:Core Japanese" "note:Basic" (-"deck:Core Japanese::*" OR deck:filtered)',
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

  it('escapes the wildcards in deck and note type names, keeping the subdeck one', () => {
    // Unescaped, Anki reads `_` as any one character and `*` as any run of them.
    expect(searchFor(mappingFor({ deckName: 'N5_vocab*', noteTypeName: 'JP_Basic' }))).toBe(
      '"deck:N5\\_vocab\\*" "note:JP\\_Basic" (-"deck:N5\\_vocab\\*::*" OR deck:filtered)',
    );
  });

  it('never asks Anki to filter by queue state', () => {
    // Eligibility is checked from cardsInfo: a card can be newly queued after
    // being forgotten, while a suspended card must be excluded.
    const query = searchFor(mappingFor());
    expect(query).not.toContain('is:new');
    expect(query).not.toContain('is:review');
    expect(query).not.toContain('-is:');
  });
});

describe('filteredByNameFor', () => {
  it('asks for the filtered cards under the deck but not under its subdecks', () => {
    expect(filteredByNameFor(mappingFor({ deckName: 'N5_vocab' }))).toBe(
      '"deck:N5\\_vocab" "note:Basic" -"deck:N5\\_vocab::*" deck:filtered',
    );
  });

  it('asks for every filtered card in the tree when subdecks are wanted', () => {
    expect(filteredByNameFor(mappingFor({ deckScope: 'deck-and-subdecks' }))).toBe(
      '"deck:Core Japanese" "note:Basic" deck:filtered',
    );
  });
});

describe('activity searches', () => {
  it('groups the mapping scope so the rated term applies to it', () => {
    // Without the parentheses the search reads as "this deck, or anything rated
    // today", which would pull the learner's whole collection into the mapping.
    expect(activitySearchFor(mappingFor({ deckScope: 'deck-and-subdecks' }), 'rated:1')).toBe(
      '("deck:Core Japanese" "note:Basic") rated:1',
    );
  });

  it('keeps the mapping scope escaped inside the group', () => {
    const query = activitySearchFor(mappingFor({ deckName: 'Grammar "notes"' }), 'rated:7:1');
    expect(query).toBe(
      '("deck:Grammar \\"notes\\"" "note:Basic" (-"deck:Grammar \\"notes\\"::*" OR deck:filtered)) rated:7:1',
    );
  });

  it('asks Anki the five questions the practice modes rest on', () => {
    expect(ACTIVITY_SEARCHES.map((search) => search.term)).toEqual([
      'rated:1',
      'rated:3',
      'rated:7',
      'rated:7:1',
      'rated:7:2',
    ]);
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
