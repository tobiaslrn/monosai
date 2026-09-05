# 0057: One Anki entry, chosen by platform, and a page per source

Status: accepted. Amends [0055](0055-anki-mapping-is-suggested-then-confirmed.md) and
[0056](0056-first-party-ankidroid-bridge.md) on where their controls and copy live.

The Words section asked the learner to answer a question they had no way to
answer. "Anki" and "AnkiDroid bridge" were offered as alternatives, but they are
the same destination reached by two adapters, and which one works is decided by
the device, not by preference. The AnkiConnect port was asked for before any
connection was attempted, on a screen where nothing had failed yet. Every
setting a source has — whether it counts, whether it is re-read, what it reads,
and removing it — sat in one list row, so a list of four sources was four
stacked control panels and no list. Three separate surfaces reported that a
source was stale.

**One Anki entry.** `HOST_PLATFORM` is decided once at the shell edge from the
user agent and injected as a port
([`domain/platform/host-platform.ts`](../../web/src/app/domain/platform/host-platform.ts)),
so a test pins it instead of pretending to be a browser. Desktop and Android get
the adapter that can work there and the sentence naming what has to be
installed; iOS gets the row disabled, saying so, beside a link to Anki's export
documentation, because a file is the only Anki path iOS has. Pressing Anki
connects immediately rather than opening a form first.

**A page per source.** A row carries the name, where the words came from, and
how many — and opens `/reading-level/source/:sourceId`. That page orders the
settings by how often each is touched and by what it changes: whether the words
count, then how fresh they are, then a disclosure whose summary states the
mapping it hides, then removal after a rule. A source that cannot answer a
question is not shown a disabled control: a file says "A file never changes"
where a live connection shows a switch.

**Failures say the one thing to fix, where it failed.** Connection failures are
told in the sheet the learner just pressed Anki in, with per-platform words and
exactly one link each: the AnkiConnect add-on on desktop, the bridge release on
Android, and the bridge source beside the read-only claim. The port moved out of
Settings and into that panel, behind "Different port" — it is only ever touched
when a connection fails, and that is where the learner is standing when it does.
Every failure prints its `anki/*` code beside a link to
[troubleshooting](../troubleshooting.md), which is already keyed by those codes.
One warning line replaces the three stale-source surfaces; a source that is
merely out of date still counts, from its last read, and the line says so.

Consequences. `HostPlatform` is user-agent detection, which is the wrong tool
for capabilities and the only tool for this one: whether a local Anki exists is
a property of the operating system and cannot be feature-detected from a page.
iPadOS reports itself as a Macintosh, so a Mac with several touch points is
treated as an iPad rather than offered a connection that can never succeed. The
Android bridge journeys now only exist on the Android browser project, because
there is no second row to select on a desktop.

Per-row counts come from the stored source caches rather than from a new
selector over `VocabularyProvenance`: a cache is exactly the last complete read
of one source, so the number is available for a source that is currently left
out of the vocabulary too. No stored data changes shape.
