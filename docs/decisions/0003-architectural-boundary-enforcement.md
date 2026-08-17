# 0003 — Architectural boundary enforcement

Date: 2026-08-17
Status: Accepted

## Context

The architecture requires that presentation depends on application use cases and
never directly on Dexie, workers, OpenRouter, or Anki, that the domain depends on
nothing, and that no import cycles exist. `eslint-plugin-boundaries` was the
first candidate, but it pulls in a `handlebars` version with a critical
advisory, which would violate the dependency-audit gate for a rule that
`eslint-plugin-import` already provides.

## Decision

Enforce layering with `eslint-plugin-import`:

- `import/no-restricted-paths` declares the forbidden zone pairs (domain may not
  import application/infrastructure/features/core/shared-ui; application may not
  import infrastructure/features/core/shared-ui; features may not import
  infrastructure; shared-ui may not import features/application/infrastructure;
  infrastructure may not import features/core).
- `import/no-cycle` forbids cycles at any depth.
- Test files are exempt from the zone rule so adapter tests can assemble real
  implementations against domain ports.

## Consequences

- No additional dependency and a clean production dependency audit.
- New layers or feature folders require an explicit zone entry, which keeps the
  dependency rules reviewable in one file.
