# 0043 — Changing the voice hides clips, and both screens say so

Date: 2026-09-01
Status: Accepted, partly superseded by [ADR 0072](0072-older-clips-play-until-regenerated.md)

Settles what a configuration change does to audio already paid for, left
implicit by [ADR 0024](0024-audio-cache-and-playback-ownership.md)'s
configuration-keyed cache and
[ADR 0034](0034-progressive-four-way-audio.md)'s coverage figure.

## Context

Every clip is stored under a cache key derived from the sentence and from the
configuration that produced it — model, voice, and the options fingerprint that
carries speed. That is what makes the cache honest: a clip made in one voice is
never served as if it were another, and two readings sharing a sentence share
one clip.

The consequence was never shown to the learner. Changing the voice in Settings
produced this, reproduced end to end:

| step | Settings readiness | reader player |
| --- | --- | --- |
| audio generated in `sakura` | `ready` | 5 sentences ready, generated **100%** |
| Voice changed to `Kore` | `stale` | audio can be generated, generated **0%**, Play disabled |
| Voice changed back to `sakura` | `ready` | 5 sentences ready, generated **100%** |

No row was ever deleted. But the Audio panel's header slot was hard-wired to the
Preview button, so the `stale` state was computed, stored, and never rendered;
and the player prints nothing by design (ADR 0038), so coverage fell from full to
empty in silence. Neither screen said "voice", "settings", or "still stored". The
obvious response is to regenerate — paying a second time for clips that are
sitting in the database.

Three answers were available.

1. **Delete the clips on a configuration change.** Honest about the display, and
   the worst outcome: it turns an experiment with a voice into permanent,
   unrecoverable spending, and setting the voice back would no longer restore
   anything.
2. **Play the old clips in the new configuration.** Cheap and wrong. It mixes
   voices inside one reading, and coverage would stop meaning anything.
3. **Keep them, and say what happened.** The clips stay exactly where they are,
   the current configuration keeps seeing only its own, and the two screens that
   go quiet are made to speak.

## Decision

**Clips are retained, keyed by the configuration that made them, and never
invalidated by a settings change.** Changing model or voice changes current
coverage, never what is stored; setting the previous configuration back
restores the previous coverage exactly, with no request. The player may still
use the newest stored clip for the same sentence content while the current
configuration has no row, but that fallback never counts toward current
coverage.

**Both screens disclose it, at the moment it applies.**

- Settings renders audio readiness beside the Preview, in the place the text
  panel already renders its own: no model, not tested, playing, stopped, ready,
  failed, settings changed. The changed state says in one sentence that audio
  saved with the previous settings is kept and needs to be generated again.
- The player prints one line — its only printed line — when a playable fallback
  exists: that some audio is from older settings. The hidden live region says
  that it can still play and that generating again replaces it. A link to
  Settings appears only when the configuration is not ready; otherwise the
  existing Generate action is the one recovery control.

**Deletion stays an explicit act.** The only things that remove clips are Delete
audio for a reading and the storage action that clears the cache. A settings
change is not one of them, and no confirmation dialog is put in front of a voice
change: the change is reversible and destroys nothing, so a dialog there would
be a warning about a loss that does not happen.

## Consequences

- Storage grows with the number of configurations a learner tries. That is the
  accepted price of reversibility; the storage section already reports audio
  size and offers the deletion.
- Coverage, the completeness figure, and the Play gate keep meaning "under the
  configuration in force", which is what makes them safe to act on.
- A fallback is selected only when its `sourceContentHash` matches the current
  sentence, so editing a sentence cannot make old speech playable for the new
  text.
- The player is no longer strictly printless. The exception is bounded to this
  one state, and the design system's prose budget already reserves standing text
  for money and apparent data loss.
- The player's height changes when that line appears. It publishes its height,
  and the reading's bottom clearance follows it, so nothing beneath it assumes a
  fixed card.
- A learner who wants the old audio back has a free way to get it — restore the
  voice — and the screens now name it.
