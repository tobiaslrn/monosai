# Monosai Anki bridge

Optional live vocabulary access from the Monosai PWA to AnkiDroid. This is a small
native listener, not a WebView or a second web build. All first-party code is ISC
under the [root licence](../LICENSE). No source from AnkiconnectAndroid or
AnkiDroid's GPL implementation is included. URI/column names follow AnkiDroid's
[public API contract](https://github.com/ankidroid/Anki-Android/blob/v2.24.0/api/src/main/java/com/ichi2/anki/FlashCardsContract.kt).

## Requirements and setup

- Android 16+ (API 36), AnkiDroid 2.24+, and Chrome with the Monosai PWA.
- Install AnkiDroid and a signed bridge APK from a `bridge-v*`
  [release](https://github.com/tobiaslrn/monosai/releases?q=bridge-v).
- Open your collection in AnkiDroid, then use **Grant AnkiDroid access** and
  **Start bridge**. The permission says read/write because AnkiDroid has no
  read-only grant; the bridge's port and router expose only queries.
- In Monosai: **Add source → AnkiDroid bridge → Connect to AnkiDroid**, review
  the mapping and words, then confirm.

Packages remain the recommended simple path and the only supported Anki path
on iOS. Live Android setup means two native installs, the PWA and a grant.

The listener binds only `127.0.0.1:8765`; the desktop port setting does not change
it. The shipped allowed origins are `https://tobiaslrn.github.io` and
`http://localhost:4200`. Use **Allowed origins** for another exact origin, with
no path or wildcard. No collection read is performed for a refused origin.
See [the protocol](../protocol/actions.md) for preflight and denial semantics.

## Staying available and battery use

After Start, the bridge uses Android's special-use foreground service and sticky
restart. **Restart after reboot while enabled** is on by default; Stop disables
the listener and future automatic starts. No collection polling, wake lock,
alarm, periodic work or idle update check is used. An idle CIO listener waits
for requests; actual battery consumption is a device measurement, not a promise.

Notification permission is deliberately absent. Android's mandatory service
notification is supplied internally, but does not appear in the drawer by
default. Android still shows the service in Active apps. Force stop, Android's
task controls and OEM battery policies can stop it; open the bridge and Start
again. No background service can promise to survive Force stop.

## Build and verify

Use Java 21, Android SDK platform 36 and the committed Gradle wrapper. Android
Studio can open this directory directly. Set `ANDROID_HOME` or an ignored
`local.properties` with `sdk.dir`. From this directory:

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug :app:runtimeLicenses
```

On Windows use `gradlew.bat`. The debug APK is
`app/build/outputs/apk/debug/app-debug.apk`. Install it with Android's installer
or `adb install -r app/build/outputs/apk/debug/app-debug.apk` on a test device.
From the repository root, `npm run bridge:verify` also checks the resolved
licence graph and release-version tests. It is included in `npm run verify`.

The runtime graph is locked in `app/gradle.lockfile`. After an intentional
dependency change, run Gradle with `--write-locks`, run `:app:runtimeLicenses`,
copy `app/build/reports/runtime-dependencies.json` to `runtime-dependencies.json`,
then run root `npm run licenses:build`. The checker rejects unknown/disallowed
licences and CI compares the fresh report to the committed report. Maven parent
licences are followed when an artifact inherits them. No signing secrets enter PRs.

## Signed releases and updates

Configure repository secrets `BRIDGE_KEYSTORE_BASE64`, `BRIDGE_STORE_PASSWORD`,
`BRIDGE_KEY_ALIAS`, and `BRIDGE_KEY_PASSWORD`, and keep the signing key backed up.
Push an explicit `bridge-vMAJOR.MINOR.PATCH` tag when ready to publish. The release
workflow verifies before accessing the keystore, signs the APK, deletes temporary
key material, and uploads `monosai-anki-bridge.apk` to that tag's release.
No tag or release is created by ordinary development or the main CI workflow.

Version codes are `major * 1,000,000 + minor * 1,000 + patch`: major 0–2099,
minor/patch 0–999, excluding 0.0.0. Use increasing versions. Local signed builds
take the four signing environment variables (keystore is a path named
`BRIDGE_KEYSTORE`) plus `BRIDGE_VERSION_CODE` and `BRIDGE_VERSION_NAME`.

The Activity checks GitHub releases once on launch and offers an explicit
download. HTTPS host, size, package, version and signer are validated before
FileProvider hands the APK to Android. Allow installs from this app if asked,
then confirm installation. Silent updates are not possible for this app. A debug
APK cannot update to a release signed with another key. The PWA keeps its own
existing service-worker update lifecycle.

## Physical-device release checks

Automated fixture, cursor-mapping and HTTP tests cannot establish browser/OS
transport compatibility or energy consumption. Before publishing the first APK:

- Connect from the deployed PWA to AnkiDroid 2.24+, inspect real decks and note
  types, build a snapshot and compare reviewed (`reps > 0`) results with a desktop
  package export of that collection, including subdecks and multiple templates.
- Check AnkiDroid absent, permission refused/revoked, and a 2.23 provider. Expect
  the specific installed/access/review-support error, never desktop permission advice.
- Refuse the page origin and confirm `origin-not-allowed`; kill the listener
  during refresh and confirm `bridge-not-running` without changing saved words.
- Verify boot restart, Stop, process recreation, Force stop, notification drawer
  behavior and Active apps. Test idle with the screen off and compare battery
  statistics with the stopped bridge; no wake lock or periodic query should appear.
- Check both native themes, text scaling, scrolling and keyboard focus on Android
  16+. Test signed-update download, cancelled install, wrong signer, offline retry
  and reboot after update. Keep package import available if Chrome blocks loopback.

These physical checks are release criteria; a debug build passing on a workstation
does not mean they have been performed.
