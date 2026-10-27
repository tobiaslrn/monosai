# 0085 — The synchronous SHA-256 pads correctly

Date: 2026-10-27
Status: Accepted

Corrects the verification claim in
[ADR 0002](0002-hashing-and-canonical-serialization.md); the algorithm and the port are unchanged.

## Context

`sha256Bytes` computed the padded length as `(((length + 9) >> 6) + 1) << 6`. The 0x80 marker and
the 8-byte bit length need `length + 9` bytes, but the block count must come from `length + 8`: the
formula added a block whenever `length % 64 === 55`, so for those inputs (55, 119, 183, ...) the
digest differed from standard SHA-256. The spec compared only a few lengths and none of them was
55 modulo 64, so ADR 0002's claim of agreement with Node's `crypto` was true of the vectors tried
and false of the algorithm.

## Decision

- The padded length is `(((length + 8) >> 6) + 1) << 6`. `sha256Bytes` and `sha256Hex` equal
  standard SHA-256 for every length. The spec covers the NIST vectors, the lengths around each block
  boundary, and every length from 0 to 300 against Node's `crypto.createHash`.
- Correctness is chosen over compatibility. About one input in 64 hashes differently than before,
  and nothing migrates the old values. Stored data is never deleted by this change.
- The `Hasher` port stays synchronous. WebCrypto is asynchronous only and absent on insecure
  origins, so it cannot serve domain code, workers, or Dexie transactions. Asset integrity
  (`digestHex`) still prefers WebCrypto for multi-megabyte inputs and falls back to this
  implementation, now correct, where `crypto.subtle` is unavailable. Language asset digests are
  produced by Node's `createHash` at build time and did not change.

## Consequences

Each hash that changes is one whose input length is 55 modulo 64, so roughly 1 in 64 of its inputs.

- **Grammar profile hash.** If a learner's profile hash changes (about 1 in 64 learners),
  `isStaleAgainstProfile` marks the grammar analysis of every imported reading stale. The reader
  offers "Grammar again", and every key misses because `grammarCacheKey` includes `profileHash`, so
  re-running costs one paid model call per sentence, not for 1 in 64 sentences. Generated stories are
  exempt: they are judged against the profile in their own provenance.
- **Tested-configuration fingerprints.** An affected text or TTS configuration reads as `stale`, not
  untested, so generation stays blocked until the learner tests again, which costs one request. The
  "changed since the last successful test" wording is inaccurate for this case, and `isPresetReady`
  drops the preset from `compatiblePresets` until then. Stored `failedTests` marks are matched by
  fingerprint and lapse the same way.
- **Cache keys.** About 1 in 64 sentences miss for translation, grammar, and audio, and are
  regenerated at paid-call cost, roughly 1.6% overhead with audio dominating it. The old rows and
  audio blobs are orphaned: there is no purge path, and they go only when their reading is deleted.
- **Content hashes.** Stored `contentHash`, `sourceContentHash`, and `sourceTextHash` values are
  never recomputed, so existing readings and their clips keep working. A hash computed now for an
  affected text differs, so importing an already imported text misses the duplicate-source warning,
  and cache reuse between an old and a new reading of the same sentence is lost.
- **Job stores.** A `configFingerprint` mismatch cancels the old job and creates a new one for the
  remaining work. A paused job loses its paused state; its completed work is kept.
- **Vocabulary.** An affected expression hash makes the next Anki sync report a changed vocabulary
  once. Snapshots are rebuilt whole, so nothing is orphaned.
- **Benefit.** The insecure-origin fallback in `asset-integrity.ts` failed the integrity check for
  about 1 in 64 assets, by length. It now verifies them.
