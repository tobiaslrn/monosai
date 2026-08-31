# 0041 — A reading session ends when the reader is left

Date: 2026-08-31
Status: Accepted

Settles the lifetime question left open by
[ADR 0024](0024-audio-cache-and-playback-ownership.md)'s application-wide
playback store, [ADR 0037](0037-audio-transport-recovery-and-one-track.md)'s
"closing the player is not a stop", and
[ADR 0039](0039-continuous-android-audio.md)'s background audio.

## Context

Three earlier decisions each moved playback further from the surface that
started it, and none of them said where it ends.

The store is a root singleton because sound outlives the component that started
it (ADR 0024). Closing the player stopped being a stop, because hiding a card to
read the text underneath is not "stop reading to me" (ADR 0037). A complete
reading became one native media resource so Android can keep playing it with the
screen locked (ADR 0039).

Together they produced a state with no way out. Pressing **Back to library**
during playback left the audio running: the element kept playing, the position
kept advancing, and the Library — which has no player, no banner, and no control
whose name matches play, pause, or stop — offered nothing to stop it with. The
only remedy was to remember which reading it had been, open it, open the player,
and press Pause. Deleting that reading from the Library made it worse: the
reading was gone, so there was nothing left to open, and only a reload silenced
the tab.

Two answers were available. A mini-player in the application shell would keep
the session and give it a control everywhere — but Monosai has no persistent
chrome by deliberate decision (ADR 0025: the reading is the application), and a
bar that appears on every other screen is exactly the furniture that decision
removed. Ending the session is the other.

## Decision

**Playback ends when the reader is left.** The reader page stops the playback
store as it is destroyed, which is the moment the route carrying the only
transport in the application goes away. The cursor is cleared, the media session
is emptied, and reopening the reading finds a session that ended rather than one
paused at an unremembered place.

**Being backgrounded is not leaving.** Nothing stops a session because the
document was hidden, the screen was locked, or another application came forward.
The reader is still open, the media notification is the control there, and ADR
0039's continuous resource exists precisely so that this keeps working. The
policy is about the route, never about visibility.

The rest of the lifetime is unchanged: closing the player through the header
toggle still silences nothing, stopping generation still stops no sound, and
deleting a reading or clearing its clips still stops playback of that reading —
now from the Library's delete path as well as the reader's.

## Consequences

- There is no route in the application on which audio can play with no control
  for it. The reader has the player; every other route has no session.
- A learner who wants to keep listening while browsing the Library cannot. That
  is the cost, and it is accepted: the alternative is permanent chrome on every
  screen for a case that a reading application does not centre on.
- Android background playback, lock-screen transport, and position are unchanged
  and remain what ADR 0039 verified.
- The stop is in the reader's teardown rather than in a router guard, so it
  cannot be forgotten by a new route and does not need a list of routes to
  compare against.
