import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Bytes, sha256Hex } from './sha256';

function nodeSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('sha256Hex', () => {
  it('matches published FIPS 180-4 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(
      sha256Hex(
        'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      ),
    ).toBe('cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');
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

  it.each([
    [54, 'a3f01b6939256127582ac8ae9fb47a382a244680806a3f613a118851c1ca1d47'],
    [55, '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
    [56, 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'],
    [63, '7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34'],
    [64, 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
    [65, '635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0'],
    [119, '31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb'],
  ])('pads a %i-byte message across the one-block boundary correctly', (length, expected) => {
    expect(sha256Hex('a'.repeat(length))).toBe(expected);
  });

  it('equals Node SHA-256 for every length from 0 to 300 bytes', () => {
    for (let length = 0; length <= 300; length += 1) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = (i * 31 + length) & 0xff;
      }
      expect(Buffer.from(sha256Bytes(bytes)).toString('hex'), `length ${length}`).toBe(
        nodeSha256(bytes),
      );
    }
  });
});
