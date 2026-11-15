# 0094 — Updates apply on the next launch

Date: 2026-11-15
Status: Accepted. Supersedes the update activation of
[0027](0027-pwa-caching-and-update-activation.md); amends the update hold of
[0048](0048-the-preparation-lane-yields.md).

## Context

[ADR 0027](0027-pwa-caching-and-update-activation.md) made update activation learner-driven: a
banner said **Update ready**, **Reload to update** activated the new version unless work was
in progress, and **Settings** > **About** had **Check for updates**.

In use, the check mostly said **Up to date** while an older build was running. Angular's
service worker already looks for a new version on every navigation and downloads it in the
background. It announces `VERSION_READY` once, to the pages open at that moment, and Monosai
registers the worker only after the app is stable, so the page is often not listening yet.
After that the worker holds the newest build, so `checkForUpdate()` reports no new version, and
a failed or offline check reports the same. The banner therefore rarely appeared, and the
manual check answered a question nobody could act on.

The worker also serves the newest build it holds to every navigation. A launch, or any reload,
already gets the downloaded version without activation.

## Decision

- No update is announced or activated in a running page. A new version is downloaded in the
  background and used from the next page load.
- `AppUpdateStore` still checks after start, every 30 minutes and whenever the tab becomes
  visible, silently, so the download is usually finished before the next launch.
- **Check for updates**, the **Update ready** banner and its **Later** are removed. The banner
  remains for the two states only a reload ends: a broken worker (**Reload to recover**, still
  refused while work is busy) and a lost database ([ADR 0027](0027-pwa-caching-and-update-activation.md)
  and chapter 6 describe the latter).
- The startup recovery screen's **Reload** still checks first, so a database from a newer
  build reloads into that build.
- The preparation lane no longer holds for an update: there is no waiting update to hold for.

## Consequences

- An update can never take a page over mid-form or mid-job, more strictly than before: nothing
  reloads a running page for one.
- A learner sees a new version one launch, sometimes two, after it is released. An installed
  app that stays open in the background keeps its build until it is closed and opened again.
  Help says so.
- The `VERSION_*` events are ignored, and the port no longer has `activate()`.
