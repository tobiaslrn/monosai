import { describe, expect, it } from 'vitest';
import { mappingFor } from '../../../testing/anki-provider-contract';
import type { AnkiCatalog } from './catalog';
import { canRefreshMappings, resolveMappings } from './mapping-validation';

const CATALOG: AnkiCatalog = {
  decks: [
    { name: 'Core Japanese', hasChildren: true },
    { name: 'Core Japanese::Verbs', hasChildren: false },
  ],
  noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
};

describe('resolveMappings', () => {
  it('resolves a mapping whose deck, note type, and field all exist', () => {
    const resolution = resolveMappings([mappingFor()], CATALOG);
    expect(resolution.resolved).toHaveLength(1);
    expect(resolution.stale).toHaveLength(0);
  });

  it('marks a vanished deck stale', () => {
    const resolution = resolveMappings([mappingFor({ deckName: 'Gone' })], CATALOG);
    expect(resolution.stale[0].reason).toBe('deck-missing');
  });

  it('marks a vanished note type stale', () => {
    const resolution = resolveMappings([mappingFor({ noteTypeName: 'Gone' })], CATALOG);
    expect(resolution.stale[0].reason).toBe('note-type-missing');
  });

  it('marks a vanished field stale', () => {
    const resolution = resolveMappings([mappingFor({ expressionFieldName: 'Gone' })], CATALOG);
    expect(resolution.stale[0].reason).toBe('field-missing');
  });

  it('ignores disabled mappings entirely', () => {
    const resolution = resolveMappings([mappingFor({ deckName: 'Gone', enabled: false })], CATALOG);
    expect(resolution.resolved).toHaveLength(0);
    expect(resolution.stale).toHaveLength(0);
  });
});

describe('canRefreshMappings', () => {
  it('allows a refresh when every enabled mapping resolves', () => {
    expect(canRefreshMappings(resolveMappings([mappingFor()], CATALOG))).toBe(true);
  });

  it('blocks a refresh while any enabled mapping is stale', () => {
    const resolution = resolveMappings([mappingFor(), mappingFor({ deckName: 'Gone' })], CATALOG);
    expect(canRefreshMappings(resolution)).toBe(false);
  });

  it('blocks a refresh with nothing enabled', () => {
    expect(canRefreshMappings(resolveMappings([], CATALOG))).toBe(false);
  });
});
