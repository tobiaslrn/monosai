# Monosai Bridge

Optional live vocabulary access from the Monosai PWA to AnkiDroid. This is a small
native listener, not a WebView or a second web build. All first-party code is ISC
under the [root licence](../LICENSE). No source from AnkiconnectAndroid or
AnkiDroid's GPL implementation is included. URI/column names follow AnkiDroid's
[public API contract](https://github.com/ankidroid/Anki-Android/blob/9f579c10bb151146728220729c510acbbd8faba7/api/src/main/java/com/ichi2/anki/FlashCardsContract.kt),
pinned to 2.24.1. That contract publishes column names of its own, which are not
the names of the fields behind them, so the projection is checked against it
rather than against a collection's schema.

## Requirements and setup

- Android 16+ (API 36), AnkiDroid 2.24+, and Chrome with the Monosai PWA.
- Install AnkiDroid and a signed bridge APK from a `bridge-v*`
  [release](https://github.com/tobiaslrn/monosai/releases?q=bridge-v). Every published
  version is there; no build artifact has to be dug out of a CI run.
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

`version.txt` holds one bounded `MAJOR.MINOR.PATCH` and is the source of truth. Gradle
reads it, so a debug APK on a bench reports the same version a published one would.
Version codes are `major * 1,000,000 + minor * 1,000 + patch`: major 0–2099,
minor/patch 0–999, excluding 0.0.0. Use increasing versions.

Publishing is a version bump, not a tag push. `bridge-release.yml` runs on every push to
`main`: if the committed version has no release, it verifies, signs, creates
`bridge-v<version>` from that commit and uploads `monosai-bridge.apk`. If the release
exists but the APK's own sources or `protocol/` have changed since its tag, the run fails
and names the files — a Releases page that quietly serves an older bridge than `main` is
the failure the lane exists to prevent. Bundled licence notices are excluded from that
comparison, because they follow the PWA's dependencies rather than the bridge's behaviour.

### Which number to raise

`protocol/contract.txt` is the loopback contract version, and it is the only number the web
app compares against. It is deliberately not the release version: comparing that would give
the web app opinions about release numbering, and a fix release would read as a change in
what the bridge can do.

Raise the contract by one when a caller could not have discovered the change by trying it:

- a new action;
- a result field the web app will *require*;
- a change to a limit the web app relies on (500 IDs, 8,192 characters, 64 KiB);
- a change in what an error code means.

Do not raise it for a new *optional* key. The web app reads each one where it exists and
does without it where it does not, which is how the scheduling columns already work, and
`AndroidConnectAdapter.probe()` establishes the rest against real rows. Keeping the contract
slow-moving is the point.

Then raise `version.txt`:

| Bump  | When                                                                    |
| ----- | ----------------------------------------------------------------------- |
| PATCH | A fix that never reaches the wire — a crash, a wrong name, this screen.  |
| MINOR | A contract bump, any additive wire change, or a new capability.          |
| MAJOR | A breaking wire change. It strands everyone who does not update.         |

A contract bump needs at least a minor bump, because a patch release is a promise that the
wire did not move; the release lane checks this against the last published release and
fails otherwise. A major bump is for correctness or security, never for convenience, and
has to raise `MINIMUM_BRIDGE_CONTRACT` in the web app in the same commit.

The bridge never breaks an older web app within a major version: add actions, add optional
keys, relax limits — never remove an action, change what a key means, or narrow a limit.
That rule is what lets a newer bridge answering an older web app pass without a word.

Configure repository secrets `BRIDGE_KEYSTORE_BASE64`, `BRIDGE_STORE_PASSWORD`,
`BRIDGE_KEY_ALIAS`, and `BRIDGE_KEY_PASSWORD`, and keep the signing key backed up. Until
they exist, a run that would publish warns and publishes nothing rather than failing the
branch; add the secrets and re-run the workflow. Create the key once with, for example:

```sh
keytool -genkeypair -v -keystore bridge-release.jks -alias monosai-bridge \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 bridge-release.jks   # the value for BRIDGE_KEYSTORE_BASE64
```

Losing that key means no installed bridge can ever be updated again, because Android
refuses an update signed by another key. Local signed builds take the four signing
environment variables, with the keystore as a path named `BRIDGE_KEYSTORE`.

The Activity checks GitHub releases once on launch and offers an explicit
download. HTTPS host, size, package, version and signer are validated before
FileProvider hands the APK to Android. Allow installs from this app if asked,
then confirm installation. Silent updates are not possible for this app. A debug
APK cannot update to a release signed with another key. The PWA keeps its own
existing service-worker update lifecycle.

## Physical-device release checks

Automated fixture, cursor-mapping and HTTP tests cannot establish browser/OS
transport compatibility or energy consumption. These checks gate the version bump in
`version.txt`, since that bump is what publishes. Before raising it to the first
released version:

- Connect from the deployed PWA to AnkiDroid 2.24+, inspect real decks and note
  types, build a snapshot and compare reviewed (`reps > 0`) results with a desktop
  package export of that collection, including subdecks and multiple templates.
- Confirm the scheduling columns against the collection itself, on a disposable
  profile: `interval` matches the card's real interval; `fsrsDifficulty` and
  `lastReviewedAt` are present where Anki has them and null where it does not;
  a card studied from a filtered deck reports its home deck. A fake cannot
  establish which columns this installed AnkiDroid actually publishes.
- Answer known cards, then compare `rated:1`, `rated:3`, `rated:7`, `rated:7:1`
  and `rated:7:2` with the same searches in AnkiDroid's own browser, including a
  deck that was reset and restudied and a card answered across the study-day
  rollover. Read only; never answer or reschedule the learner's cards to produce
  evidence.
- Compare `cid:<id> introduced:N` with AnkiDroid's browser for cards first
  answered today, before and after the rollover, and years after creation. Confirm
  the smallest matching N agrees and manual reschedules do not count as answers.
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

## Brand resources

`scripts/bridge/icons.mjs` owns every brand resource under `app/src/main/res`: the
launcher and themed bitmaps, the notification mark, the app name and the icon colour.
The bridge wears the Monosai mascot with a paper badge carrying a suspension-bridge
mark, so a launcher never offers two identical Monosai icons. Run `npm run bridge:icons`
from the repository root after changing the mascot or the composition, and commit what it
writes; `npm run bridge:verify` and CI check the committed resources against
`scripts/bridge/icons.lock.json` without opening a browser.

The screen is `docs/design-system.md` applied natively. `res/values/colors.xml`,
`dimens.xml` and `styles.xml` transcribe the PWA's tokens under the same role names, with
`values-night/` carrying the dark palette; a change to a token belongs in both places.
Every line of the screen is a label with its current value or its one control on the
right. The AnkiDroid grant is requested on launch rather than offered as a button, since
nothing works without it; an Allow control appears only after Android has refused, and
falls back to the app's system settings once Android stops asking.
