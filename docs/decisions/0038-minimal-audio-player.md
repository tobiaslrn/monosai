# 0038 — A player that says nothing and shows its state

Date: 2026-08-28
Status: Accepted

Supersedes the **One track** subsection of
[ADR 0037](0037-audio-transport-recovery-and-one-track.md) in its presentation,
and the transport **Stop** that ADR added under *The session never dead-ends*.
Every other behaviour that ADR established is kept.

## Context

ADR 0037 left the card correct and legible: three permanent rows and one
contextual band, everything named in words. Read next to any media player a
learner already uses, it is a form. Every capability is spelled out as a
labelled button — **Generate audio**, **Try again**, **Dismiss**, **Start from
this sentence** — the mode is an underlined text toggle in a row of its own, and
a position line reports "Sentence 4 of 13" beside a reading the learner is
trying to read in Japanese.

Two things follow from that. The card is 149px of a 412px viewport for two rows
of controls, and it changes height whenever the band under the divider gains or
loses a button — which is what publishing `--mn-docked-player-height` and
reflowing the reading was built to absorb rather than avoid. And the English
prose sits in the corner of the eye of someone doing the one task the whole
application exists for.

The track was also a `progressbar`: a reading could be moved through only one
sentence at a time, through Back and Next, even though the position of every
sentence in the reading was already drawn on screen.

## Decision

### Two rows, and no prose

The player is one row of controls over a track. Nothing is printed: the position,
the coverage, what a stopped run managed, and why playback stopped are said by
the state of a control and by its tooltip.

Nothing is taken from a screen reader. Every string the card used to render is
unchanged and lives in a `.mn-visually-hidden` `role="status"` region, joined
into one announcement — the position first, then whatever the card would have
said beneath the controls — with playback failures repeated in a hidden
`role="alert"`. The wording is the contract; printing it was not.

### One line, ranged left, over the track

Six slots on one line above the track, ranged to the leading edge:
`[back][primary][next]`, then `[mode]`, then
`[start from this sentence][context]`. The transport comes first because it is
where a thumb already is on a docked card, and the two contextual slots close
the line, where an empty one is simply where the line stops. The track
underneath spans the full width it is measuring. A slot with nothing to do is
held open rather than collapsed, so the line never re-flows under a thumb
reaching for it and the card is one fixed height in every state. It no
longer needs a bounded height or internal scrolling, because nothing inside it
can grow.

### No Stop

A media player has none, and this one no longer does either. A session ends by
being paused, and a paused session keeps its cursor, its highlight and its place
on the track — which is what a learner who stopped listening mid-reading wants
when they come back to it, rather than a reading reset to the top.

ADR 0037 added Stop because `waiting` had no live control at all. It has one:
Back's first meaning is replaying the sentence just heard, which leaves the wait
and starts playing again. Closing the player has not silenced anything since
ADR 0037 either, so the reason the control was introduced no longer holds.

### The centre is the primary verb

The big button is **Generate audio** when the reading has no audio at all, and
play, pause, resume, read on, or play again once it has. A learner who opens the
player for a reading with no audio wants the audio; a dead Play with the real
action in a band underneath made them look for it.

### One contextual control

The band became a slot. It is **Stop generating audio** while a run is going,
with the coverage drawn as a ring around it; **Generate audio** for a partial
set; **Try again** after a run stopped; **Dismiss** for a playback failure; and
**Set up audio model** with no model configured. What it is about is its
tooltip. Stopping a run is now possible from the player as well as from the
reader menu, where it stays beside **Delete audio**.

A separate **Dismiss** for a stopped run is gone: pressing **Try again** puts the
card back the way dismissing it did, and did the work as well. A run that
stopped after its last outstanding sentence landed reports nothing at all, since
a complete reading has nothing to retry.

### The track is a slider

A native `input[type="range"]` over the sentences of the reading, so dragging,
tapping, touch and the arrow keys are the browser's behaviour rather than ours.
It snaps sentence to sentence — there is nothing between sentence 4 and
sentence 5 to land on — and a position with no clip snaps to the nearest one
that has, so a hole is somewhere the drag passes over rather than a dead spot.
The generation fill stays painted behind it, and still breathes while a run is
open.

`AudioPlaybackStore.seekTo()` jumps a live session and keeps reading; while
nothing is playing it only moves the cursor. Scrubbing is an explicit act, but
it is an act of aiming, and starting a reading is still the press of Play — the
no-autoplay rule is untouched.

### The mode is a cycle

`stepMode` becomes `PlaybackMode`, one of the ordered `PLAYBACK_MODES`, cycled by
one control in the media-player idiom: the same glyph always, lit with a dot
beneath it when it is on. There are two postures today, `continuous` and
`sentence`, so the control keeps `aria-pressed` and the name **One sentence at a
time**. Repeating a single sentence is the posture still to come, and adding it
is one entry in that list plus a state-named label.

## Consequences

- The docked card measures two rows on every viewport and in every state. The
  reading's bottom clearance is a constant rather than an estimate, and
  `--mn-docked-player-height` stops changing mid-run.
- A learner who cannot read English icons has tooltips and accessible names, but
  no visible sentence. The hidden live region keeps assistive technology exactly
  where it was; a sighted learner who wants the numbers hovers the control.
- Component and end-to-end tests assert accessible names and the hidden region's
  text rather than what is painted. The names themselves were kept deliberately,
  so most of both suites survived the redesign unchanged.
