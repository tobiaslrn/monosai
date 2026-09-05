# 0056: A first-party read-only AnkiDroid bridge

Status: accepted.

The third-party Android bridge lacks three required actions, including card review
evidence, and has incompatible origin, preflight and unknown-action behavior.
The Android provider also existed behind selection and draft paths forcing desktop.

Ship fresh Kotlin in `android-bridge/`, with a nested `app/` Gradle module, beside
the unchanged `web/` PWA artifact. `protocol/` owns the eight-action contract and
golden fixtures. Ktor CIO serves loopback HTTP; query classes use AnkiDroid's public
ContentProvider. AnkiDroid 2.24+ is required and review support is probed. The
router allowlist and provider port expose no writes despite the combined database
permission. Both first-party artifacts use the root ISC LICENSE.

Do not fork or copy AnkiconnectAndroid's GPL-3.0 implementation. AnkiDroid stays a
separate installation. Its public API contract is explicitly non-GPL; we record
URI/column protocol constants directly and bundle no AnkiDroid implementation.
Transitive production Maven dependencies pass the permissive licence gate.

A Capacitor shell removes browser transport restrictions but adds native/web
version binding, a fixed WebView origin, live-update hosting and rollback. Keep
one PWA deployment and its service-worker updates. If physical-device testing
proves loopback unusable, move the portable query port into a shell. Browser
transport remains a device-test release criterion, not an assumed capability.

Android kind survives selection, draft, persistence and reconnect using the
existing schema. Its fixed port 8765 is independent of desktop settings. Both
adapters share bounded field samples, and capability warnings are displayed.
Recognized bridge errors retain their code; unknown errors after a validated
version become unsupported actions. Readable denial envelopes identify refused
origins; Android opaque failures name the unavailable bridge. Desktop's transport
policy is unchanged. No data migration is needed.

Support Android 16+ (API 36). A user-enabled special-use foreground service owns
the listener, with sticky restart and optional boot restart. No timers, wake
locks, periodic jobs or collection polling. Notification permission is not
requested: Android's mandatory notification object is supplied to the service,
but is absent from the drawer by default. Android retains its Active apps entry
and may stop the service; Force stop needs a launch. OEM battery behavior and
idle consumption require device verification.

Signed APKs use a separate `bridge-vMAJOR.MINOR.PATCH` release lane. Bounded
version components map to major × 1,000,000 + minor × 1,000 + patch. The bridge
checks releases once on launch; bounded HTTPS downloads must match its installed
package signer before reaching the system installer. The user confirms updates.

Setup still needs AnkiDroid, the bridge, the PWA, and a database permission grant.
Packages remain the recommended simple path and the only Anki path on iOS.
