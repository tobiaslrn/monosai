# 0001 — Angular 21 toolchain and unit-test environment

Date: 2026-08-17
Status: Accepted; the Angular version amended below

> Amended on 2026-10-25. The application is on Angular 22 (`web/package.json` pins
> `@angular/core` `^22.2.3`, with `"node": ">=24"`). The move this record anticipated
> under Consequences happened as a version bump, as predicted. The title and the sentences
> below that name Angular 21.2 are kept as the record of what was decided on 2026-08-17.
> Everything else in this decision still stands.

## Context

The specification requires "current stable Angular". At implementation time the
current release line is Angular 22, whose CLI requires Node `^22.22.3 ||
^24.15.0 || >=26.0.0`. The development environment runs Node 24.4.1, which
Angular 22 refuses to run on. Upgrading the developer's Node installation is a
change outside the repository.

Angular 21.2 is the newest release line that supports the installed Node
version and provides every capability the specification names: standalone
components, signals, strict TypeScript, the application builder, the service
worker, and the CDK.

## Decision

- Target Angular 21.2 with the `@angular/build:application` builder.
- Use the Angular unit-test builder with Vitest in a jsdom environment.
- Provide IndexedDB in unit/integration tests through `fake-indexeddb`, a
  specification-compliant implementation, and cover real browser storage
  behaviour with Playwright end-to-end tests.
- Use hash-based routing and a `/monosai/` base href for GitHub Pages.
- Compute build identity from a source constant (kept in sync with
  `web/package.json` by a unit test) plus a `--define MONOSAI_BUILD_COMMIT` value
  supplied by CI.

## Consequences

- Moving to Angular 22 later is a version bump once the toolchain's Node
  requirement is met; no application code depends on the version choice.
- jsdom cannot measure layout, so responsive and rendering behaviour is
  verified in Playwright at desktop and Android viewports instead.
