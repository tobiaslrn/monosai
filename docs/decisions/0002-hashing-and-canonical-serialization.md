# 0002 — Hashing algorithm and canonical serialization

Date: 2026-08-17
Status: Accepted

## Context

Cache keys, content hashes, and configuration fingerprints must use "a single
documented algorithm and canonical UTF-8 serialization". They are computed
inside pure domain functions, worker loops, and Dexie transaction callbacks,
where an asynchronous API cannot be awaited without restructuring the call
sites or breaking transaction scope.

`crypto.subtle.digest` is asynchronous only, and `crypto.subtle` is unavailable
on insecure origins.

## Decision

- The documented algorithm is SHA-256, exposed through the `Hasher` port.
- The implementation is a dependency-free synchronous SHA-256 in
  `web/src/app/infrastructure/hashing/sha256.ts`, verified against published
  FIPS 180-4 vectors and Node's `crypto` output, including multi-block,
  non-ASCII, and surrogate-pair input.
- Canonical serialization (`canonicalJson`) sorts object keys, omits
  `undefined` properties, preserves explicit `null`, normalizes CRLF/CR to LF
  inside strings, and rejects non-finite numbers.
- Every hash is namespaced by a task prefix (`translation`, `grammar`, `tts`,
  `validation`, …) so identical payloads for different tasks cannot collide.

## Consequences

- Hashing stays usable in domain code and workers with no async plumbing.
- Replacing the algorithm later means changing one adapter plus the documented
  cache-key versions; the port does not change.
