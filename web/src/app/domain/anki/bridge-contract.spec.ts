import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareBridgeContract,
  KNOWN_BRIDGE_CONTRACT,
  MINIMUM_BRIDGE_CONTRACT,
  outdatedBridgeMessage,
} from './bridge-contract';

describe('the declared contract', () => {
  it('is the one both sides build against', () => {
    const declared = readFileSync(resolve(process.cwd(), '../protocol/contract.txt'), 'utf8');
    expect(declared).toBe(`${String(KNOWN_BRIDGE_CONTRACT)}\n`);
  });

  it('never demands more than this build knows', () => {
    expect(MINIMUM_BRIDGE_CONTRACT).toBeLessThanOrEqual(KNOWN_BRIDGE_CONTRACT);
  });
});

describe('compareBridgeContract', () => {
  const identity = (contract: number) => ({ version: '1.2.3', contract });

  it('leaves an endpoint that claims no contract to the capability probe', () => {
    // A third-party AnkiConnect-compatible bridge has no Monosai contract to
    // report, and must not be refused for staying silent about one.
    expect(compareBridgeContract(undefined)).toEqual({ kind: 'unidentified' });
  });

  it('refuses a bridge below the floor', () => {
    expect(compareBridgeContract(identity(MINIMUM_BRIDGE_CONTRACT - 1)).kind).toBe('too-old');
  });

  it('accepts the floor itself', () => {
    expect(compareBridgeContract(identity(MINIMUM_BRIDGE_CONTRACT)).kind).not.toBe('too-old');
  });

  it('names a usable bridge older than this build', () => {
    // Unreachable while the floor and the known contract are the same number,
    // and the middle of the ladder the moment the contract moves.
    const behind = compareBridgeContract({ version: '0.9.0', contract: KNOWN_BRIDGE_CONTRACT - 1 });
    expect(behind.kind).toBe(
      MINIMUM_BRIDGE_CONTRACT <= KNOWN_BRIDGE_CONTRACT - 1 ? 'behind' : 'too-old',
    );
  });

  it('is content with the contract it knows', () => {
    expect(compareBridgeContract(identity(KNOWN_BRIDGE_CONTRACT)).kind).toBe('current');
  });

  it('says nothing about a newer bridge, which may only have added to the contract', () => {
    expect(compareBridgeContract(identity(KNOWN_BRIDGE_CONTRACT + 1)).kind).toBe('ahead');
  });
});

describe('outdatedBridgeMessage', () => {
  it('names the build and promises the collection still reads', () => {
    const message = outdatedBridgeMessage({ version: '0.9.0', contract: 1 });
    expect(message).toContain('0.9.0');
    expect(message).toContain('still works');
  });
});
