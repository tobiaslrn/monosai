# 0078 — The bridge announces a contract the web app negotiates against

Date: 2026-09-17
Status: Accepted

Extends the loopback contract in [ADR 0056](0056-first-party-ankidroid-bridge.md) and the
release identity in [ADR 0077](0077-the-bridge-publishes-itself.md). The listener, the read
allowlist, the origin policy and the publishing rule all stand.

## Context

The PWA and the bridge have deliberately separate lifecycles. ADR 0056 rejected a Capacitor
shell partly because it "adds native/web version binding", and the deployment view still
says the PWA deploys one artifact "with no native/web version binding". The PWA updates
itself through its service worker; the bridge is an APK the learner installs and updates by
consenting to an install. They drift, and that is by design.

What was missing is any way for the web app to know which bridge it is talking to.

- `version` answers `6`. That is AnkiConnect's request-format version — a constant
  describing the wire shape — and AnkiConnect puts its own add-on version on the wire
  nowhere at all. It cannot say whether a build is current.
- `requestPermission` answered `{permission, requireApiKey, version}`, which is the same
  constant again.
- `AndroidConnectAdapter.probe()` does establish ground truth by calling each action it
  needs and recording what fails. That is the right mechanism and it stays. But it only
  reports *that* something is missing; it can say nothing about *why*, and nothing about
  what the learner could do. An outdated bridge was indistinguishable from a broken one.

The moment to open an identity channel is before there is anything installed that lacks
one. At this decision no `bridge-v*` release exists, so no bridge in the world predates the
handshake, and the floor can be set without stranding anyone. That will never be true again.

## Decision

**Three version identities, and only one is negotiated.**

`protocol/contract.txt` holds a single integer: the loopback contract version. Gradle reads
it into `BuildConfig.CONTRACT_VERSION` the same way it reads `version.txt`, and the web app
declares the same number as `KNOWN_BRIDGE_CONTRACT`, kept equal by a test. It is not the
release version: comparing `android-bridge/version.txt` here would give the web app opinions
about release numbering, and a patch release would read as a change in what the bridge can
do. It is not AnkiConnect's `6`, which belongs to a protocol Monosai does not own.

**The bridge announces itself on `requestPermission`**, as
`monosaiBridge: {version, contract}` beside the standard keys. The probe already asks for
that before anything else, so a build the learner may need to update is named without a
second round trip and without a tenth entry on the read allowlist. A separate `bridgeInfo`
action was rejected: it would need `unsupported action` to stop being a hard signal for one
name, and that signal is what the `getReviewsOfCards` fallback rests on. A response header
was rejected because `protocol/fixtures/` are wire bytes of JSON bodies that both suites
compare directly, and a header sits outside that machinery.

**The bridge never breaks an older web app within a major version.** It may add actions, add
optional keys and relax limits; it may not remove an action, change what a key means, or
narrow a limit. This is what lets a newer bridge answering an older web app be uneventful.

**A silent endpoint is not an old endpoint.** Monosai talks to any AnkiConnect-compatible
listener on the Android loopback port, and a third-party bridge has no Monosai contract to
report. Only an endpoint that claims one is held to it; everything else goes to the
capability probe exactly as before. This is the difference between a version check and a
lock-out.

**Three outcomes for an endpoint that did claim a contract.** Below
`MINIMUM_BRIDGE_CONTRACT` the connection fails with `bridge-too-old`, which carries the
bridge release link and the package fallback, and whose cause names the build. Between the
floor and `KNOWN_BRIDGE_CONTRACT` the connection works and records a `CapabilityLimitation`,
which reaches the learner through the same warning path every other provider limitation
already uses. At or above it, nothing is said; the identity stays in the advanced
disclosure.

**When the numbers move.** The contract rises by one only when the web app could not have
discovered the change by probing — a new action, a field it will require, a limit it relies
on, a changed error meaning. Another optional card column does not move it, because
per-field optionality and the probe already cover that. A contract bump requires at least a
minor bump of `version.txt`, since a patch release is a promise that the wire did not
change; `bridge-release.yml` compares against the last published release and fails
otherwise. `MINIMUM_BRIDGE_CONTRACT` rises only when a lower contract would make Monosai
show something *wrong*, never to encourage an update — the same posture as the
`review-evidence-unsupported` refusal.

## Consequences

- `protocol/` joins the release lane's drift comparison. A contract the published APK does
  not speak is the same failure as an APK whose sources moved, so it turns `main` red the
  same way.
- The first contract is `1` and the floor is `1`, so `behind` and `too-old` are unreachable
  today. That is the point: the channel has to exist before the first contract that needs
  it, and it cannot be added to bridges already installed.
- No feature-to-contract table exists yet. At contract 1 it would have no entries. When a
  later contract adds something the web app depends on, the name of that thing belongs in
  `outdatedBridgeMessage`, so the sentence says what is missing rather than a number.
- The shared `requestPermission` fixture now carries an identity, recorded with a version
  that is deliberately not a release so a patch bump does not rewrite golden files. Its
  contract is the real one, so moving the contract turns the byte comparison red until the
  fixture records the new wire — which is the reminder that wants to exist.
- The connect sheet's advanced disclosure now prints a failure's cause as well as its code.
  Which origin was refused, which action was missing, which bridge answered: detail that
  decides a bug report and is noise on the surface.
- The web app is still not bound to a bridge version. It negotiates one number and degrades
  around it.
