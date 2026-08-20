import { describe, expect, it } from 'vitest';
import { ALL_PROMPT_TASK_NAMES, PROMPT_VERSIONS, promptVersionRecord } from './prompt-versions';

describe('PROMPT_VERSIONS', () => {
  it('names every prompt asset generation records in provenance', () => {
    expect(Object.keys(PROMPT_VERSIONS).sort()).toEqual([
      'exception-review',
      'grammar',
      'repair',
      'story',
      'translation',
    ]);
  });

  it('lists every task exactly once as a value', () => {
    expect([...ALL_PROMPT_TASK_NAMES].sort()).toEqual(Object.keys(PROMPT_VERSIONS).sort());
    expect(new Set(ALL_PROMPT_TASK_NAMES).size).toBe(ALL_PROMPT_TASK_NAMES.length);
  });

  it('gives every version a nonempty identifier the row schema accepts', () => {
    for (const version of Object.values(promptVersionRecord())) {
      expect(version.length).toBeGreaterThan(0);
    }
  });
});
