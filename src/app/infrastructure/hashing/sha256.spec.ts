import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
  it('matches published FIPS 180-4 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('hashes input spanning multiple 64-byte blocks', () => {
    expect(sha256Hex('a'.repeat(200))).toBe(
      'c2a908d98f5df987ade41b5fce213067efbcc21ef2240212a41e54b5e7c28ae5',
    );
    expect(sha256Hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('encodes non-ASCII input as UTF-8', () => {
    expect(sha256Hex('日本語')).toBe(
      '77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5',
    );
  });

  it('handles surrogate pairs deterministically', () => {
    expect(sha256Hex('𠮷野家🍣')).toBe(
      '54056c6a3b242c3a67b5efa8e0fdaf000f5bd048070730b31e00ca6dc55ef139',
    );
    expect(sha256Hex('𠮷野家🍣')).not.toBe(sha256Hex('𠮷野家'));
  });
});
