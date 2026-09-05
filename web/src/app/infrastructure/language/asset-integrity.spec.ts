import { afterEach, describe, expect, it, vi } from 'vitest';
import { digestHex } from './asset-integrity';

describe('digestHex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hashes bytes with WebCrypto when it is available', async () => {
    const hex = await digestHex(new Uint8Array([1, 2, 3]));

    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to the synchronous implementation when crypto.subtle is unavailable', async () => {
    vi.stubGlobal('crypto', {});

    const hex = await digestHex(new Uint8Array([1, 2, 3]));

    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('agrees with WebCrypto on the digest for the same bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    const viaSubtle = await digestHex(bytes);
    vi.stubGlobal('crypto', {});
    const viaFallback = await digestHex(bytes);

    expect(viaFallback).toBe(viaSubtle);
  });
});
