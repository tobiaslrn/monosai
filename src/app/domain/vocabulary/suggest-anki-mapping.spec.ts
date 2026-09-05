import { describe, expect, it } from 'vitest';
import { suggestAnkiMapping } from './suggest-anki-mapping';

const catalog = {
  decks: [
    { name: 'Default', hasChildren: false },
    { name: 'Japanese', hasChildren: false },
  ],
  noteTypes: [
    { name: 'Radicals', fieldNames: ['Number'] },
    { name: 'Words', fieldNames: ['Number', 'Meaning', 'Expression'] },
  ],
};

describe('suggestAnkiMapping', () => {
  it('chooses Japanese samples across decks, types, and fields instead of the first entries', () => {
    expect(
      suggestAnkiMapping(catalog, [
        { deckName: 'Default', noteTypeName: 'Radicals', fields: { Number: '123' } },
        {
          deckName: 'Japanese',
          noteTypeName: 'Words',
          fields: { Number: '42', Meaning: 'cat', Expression: 'ねこ' },
        },
      ]),
    ).toEqual({ deckName: 'Japanese', noteTypeName: 'Words', expressionFieldName: 'Expression' });
  });

  it('asks when samples are missing or contain no Japanese', () => {
    expect(suggestAnkiMapping(catalog, [])).toBeNull();
    expect(
      suggestAnkiMapping(catalog, [
        {
          deckName: 'Japanese',
          noteTypeName: 'Words',
          fields: { Number: '42', Meaning: 'cat', Expression: 'cat' },
        },
      ]),
    ).toBeNull();
  });
});
