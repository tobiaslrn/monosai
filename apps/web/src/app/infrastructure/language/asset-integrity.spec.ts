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

  it('falls back correctly for a length that needs an extra padding block', async () => {
    const bytes = new Uint8Array(55).fill(97);
    const viaSubtle = await digestHex(bytes);
    vi.stubGlobal('crypto', {});

    expect(await digestHex(bytes)).toBe(viaSubtle);
    expect(viaSubtle).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
  });
});
