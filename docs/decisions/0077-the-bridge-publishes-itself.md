# 0077 — The bridge publishes itself from a committed version

Date: 2026-09-17
Status: Accepted

Amends the release lane and the bridge's identity in
[ADR 0056](0056-first-party-ankidroid-bridge.md). Its listener, query port, licence
position and support window stand.

## Context

The bridge's only way out of this repository was a hand-pushed `bridge-v*` tag. Nothing
in the repository recorded which version the working tree was, so the tag was the version,
`versionCode` came from environment variables CI set from the tag, and a debug APK built on
a bench reported `0.1.0-dev` no matter what it contained. Nothing noticed when the bridge
changed and no tag followed, and because the main pipeline only ever uploaded a debug APK as
a build artifact, the way to get the current bridge onto a phone was to open a CI run and
dig the artifact out of it. That is not an install path to offer a learner.

The bridge also looked like its neighbours. It shipped the PWA's own launcher icon, so a
launcher offered two identical Monosai marks and the learner had to remember which was
which, and its screen was a column of platform-default buttons on a platform-default
background, which is what every small Android listener utility looks like — including
AnkiconnectAndroid, the app it exists to replace. Two apps that are installed together,
solve one task between them, and cannot be told apart is a setup problem, not a taste
problem.

The third-party AnkiconnectAndroid bridge is not a design source. Nothing may be taken
from it, its GPL implementation included, so the bridge's screen has to be built from
somewhere else.

## Decision

`android-bridge/version.txt` holds one bounded `MAJOR.MINOR.PATCH` and is the source of
truth. Gradle reads it for `versionCode` and `versionName`, so every build — debug,
release, on a bench or in CI — reports the version it actually is. The tag is derived from
the file rather than the file from the tag.

`bridge-release.yml` runs on every push to `main`. When the committed version has no
release, it verifies, signs, creates the tag from that commit and publishes the APK as
`monosai-bridge.apk`. When the release exists, it compares the APK's own sources with that
tag and fails if they moved without the version moving, because a published release that is
no longer the bridge in `main` is the failure the lane exists to prevent. The bundled
licence notices are excluded from that comparison: they follow the PWA's dependencies rather
than the bridge's behaviour. With no signing key configured the run warns and publishes
nothing rather than failing the branch, so a repository setting never holds `main` red.

The bridge is named **Monosai Bridge** and wears the Monosai mascot with a paper badge
carrying a suspension-bridge mark at its upper right. `scripts/bridge/icons.mjs` composes
the launcher and themed bitmaps from the same mascot the PWA icons use, and its geometry
is documented there.

Its screen is the design system applied natively: the canvas, one bar, cards, the pill
control silhouette, the three text ranks, and the palette, transcribed into Android
resources under the same token names. Framework widgets keep their platform semantics;
only their appearance is Monosai's.

## Consequences

- Publishing is a version bump. The physical-device release checks in the bridge's README
  gate that bump rather than a tag push, and they are still a human's job.
- A change to the APK's sources without a version bump turns `main` red. That is deliberate:
  the alternative is a Releases page quietly serving an older bridge than the one in `main`.
- The repository's Releases page carries the bridge and is where a learner is sent.
  `web/src/app/features/vocabulary/anki-links.ts` already points there.
- The bridge carries no design dependency on the PWA build: its resources are its own
  transcription, and `docs/design-system.md` remains the one authority for both.
- Two Monosai icons can be told apart in a launcher, in the themed icon set, and on the
  splash screen, which is the only place the badge had to survive a mask.
