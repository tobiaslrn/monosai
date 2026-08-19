import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_ACTIONS, MUTATING_VERBS } from './allowed-actions';

const CLIENT_SOURCE = readFileSync(
  join(process.cwd(), 'src', 'app', 'infrastructure', 'anki', 'connect', 'connect-client.ts'),
  'utf8',
);

/**
 * The release blocker this file guards is "an Anki adapter can issue a write
 * action". These checks are deliberately blunt and source-level, because the
 * failure they are protecting against is somebody adding a plausible-looking
 * action later without noticing what it does.
 */
describe('AnkiConnect action allowlist', () => {
  it('is exactly the eight read actions Monosai needs', () => {
    expect([...ALLOWED_ACTIONS]).toEqual([
      'version',
      'requestPermission',
      'deckNames',
      'modelNames',
      'modelFieldNames',
      'findCards',
      'cardsInfo',
      'notesInfo',
    ]);
  });

  it('contains no action naming a mutating verb', () => {
    for (const action of ALLOWED_ACTIONS) {
      const lowered = action.toLowerCase();
      const offending = MUTATING_VERBS.filter((verb) => lowered.includes(verb));
      expect(offending, `${action} looks like it mutates`).toEqual([]);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(ALLOWED_ACTIONS).size).toBe(ALLOWED_ACTIONS.length);
  });

  it('exposes no public method that takes an action name', () => {
    // `invoke` is the only place an action reaches the wire, and it is private.
    expect(CLIENT_SOURCE).toContain('private async invoke<TValue>(');
    expect(CLIENT_SOURCE).not.toMatch(/^\s{2}(?:async\s+)?invoke\s*[(<]/mu);
  });

  it('sends no action string the allowlist does not contain', () => {
    // Every literal passed as the first argument of `this.invoke(...)`.
    const invoked = [...CLIENT_SOURCE.matchAll(/this\.invoke\(\s*'([^']+)'/gu)].map(
      (match) => match[1],
    );
    expect(invoked.length).toBe(ALLOWED_ACTIONS.length);
    for (const action of invoked) {
      expect(ALLOWED_ACTIONS).toContain(action);
    }
  });
});
