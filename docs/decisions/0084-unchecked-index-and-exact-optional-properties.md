# 0084 — Unchecked index access and exact optional properties

Date: 2026-10-27
Status: Accepted

## Context

`strict` treats `items[i]` as always present and `{ name?: string }` as accepting `name: undefined`.
Both hid real cases: the open-reading check read `.segments` of the primary outlet, which the root
URL does not have, and a cleared Anki meaning field was stored as a property set to `undefined`
rather than removed.
The codebase already wrote optional properties with conditional spreads by convention, but nothing
enforced it, and Zod's `.optional()` produced `?: T | undefined` that the domain types did not
declare.

## Decision

- `tsconfig.json` enables `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; every project
  inherits them.
- An absent index is handled by structure or by a guard with real behaviour. An index the logic
  already proves goes through `defined()` (`domain/shared/invariant`), which throws on a broken
  invariant. `@typescript-eslint/no-non-null-assertion` stays an error outside specs.
- Optional properties are absent rather than `undefined`. `?: T | undefined` is reserved for places
  where `undefined` carries meaning — a `MappingEdit` that clears the meaning field, raw scheduling
  input before normalization.
- Zod schemas use `.exactOptional()`. JSON cannot carry `undefined`, and worker messages are built by
  code the compiler now checks, so neither boundary accepts less than before. Stored rows can carry
  an `undefined` written by an earlier version, so when a row fails validation `parseRecord` drops
  such properties and validates it once more: a row reads exactly as it did, a valid row is neither
  walked nor copied, and no Dexie version or stored shape changes.

## Consequences

- Index-heavy code reads differently: loops over values, destructured heads, and early returns on a
  missing element. Specs keep `!` for fixtures they control.
- Bulk token rows are not validated in production (see `parseBulkRecords`), so they are not
  normalized there either. Every writer of those rows builds tokens with conditional spreads.
- A new optional field on a stored record is declared with `.exactOptional()` in its row schema.
