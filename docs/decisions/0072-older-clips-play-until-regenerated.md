# 0072 — Older clips play until they are regenerated

Date: 2026-09-12
Status: Accepted

Supersedes the playback part of [ADR 0043](0043-voice-changes-hide-clips-and-say-so.md).
The cache remains configuration-keyed and current-settings coverage remains
strict; what changes is whether an older row may be used when no current row
exists.

## Context

Audio is cached per sentence and configuration. A model or voice change
therefore makes the current cache key miss even though the clip the learner
paid for is still in IndexedDB. Treating that miss as silence makes the player
look broken and forces regeneration before the learner can hear anything.

The old row is not safe for an edited sentence, however. A sentence's content
hash is the identity of the spoken text, and a cache key alone is not enough to
establish that a stored row belongs to the current sentence after editing.

## Decision

Playback resolves one clip per sentence in this order:

1. use the current cache key when it has a stored row;
2. otherwise use the newest row by `createdAt` whose `sourceContentHash`
   matches the current sentence;
3. otherwise leave the sentence unavailable.

The fallback is also used when the current TTS configuration is not ready, so
an old reading does not become silent while Settings asks for a new preview.
The selected fallback is marked stale in the playback store, and the player
prints one line: “Some audio is from older settings.” It links to Audio
settings only when the configuration is not ready. When the configuration is
ready, the existing Generate action regenerates the current-settings misses.

Current-settings coverage, completeness, reading summaries, and generation
offers never count a fallback. They continue to answer the question “what is
ready under the settings in force?” Playability answers the separate question
“is there safe audio for this sentence right now?”

Continuous resources use one configuration and one fallback kind throughout a
run. A fallback may therefore be appended to a resource made from the same
fallback settings. If a sentence changes from stale to current while the
resource is open, the resource is sealed rather than mixing configurations;
the next playable run can start separately. A stale row is never selected for
an edited sentence because the content-hash comparison is mandatory.

## Consequences

Changing a voice or model no longer makes an existing reading silent. The
learner can continue listening immediately, while the current coverage figure
still makes the cost and scope of regeneration visible. Storage remains
reversible: changing back to the previous configuration restores its exact
current coverage, and only explicit cache deletion removes old rows.

The player has a bounded standing notice in the one slot reserved for apparent
loss and paid work. The notice is also in the live region, including that old
audio remains playable and regeneration replaces it.
