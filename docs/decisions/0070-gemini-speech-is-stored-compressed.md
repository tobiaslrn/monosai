# 0070 — Gemini speech is stored compressed, and old clips are re-encoded

Date: 2026-09-12
Status: Accepted

Settles what Monosai stores when a speech model answers with raw PCM, left open by
[ADR 0024](0024-audio-cache-and-playback-ownership.md)'s cache, which says what a clip
is keyed by but never what it costs.

## Context

Gemini is the one speech family that returns headerless 24 kHz mono PCM rather than a
compressed file. Monosai wrapped it in a WAV header and stored it as it arrived: about
48 KB a second, 2.8 MB a minute, roughly ten times what the OpenAI-compatible MP3 path
stores for the same sentence. A learner with a library of readings pays for that
difference in disk, and nothing in the application ever said so.

Re-compressing the MP3 path would gain nothing — it is already compressed. The WAV path
was the whole of the problem.

Measured on three seconds of 24 kHz mono speech, against the 144,044-byte WAV stored
today:

| stored as | bytes | of the WAV | per minute | dependency | duration |
| --- | --- | --- | --- | --- | --- |
| WAV, as before | 144,044 | 1× | 2,813 kB | — | yes |
| MP3 32 kbit/s, lamejs | 12,225 | 11.8× | 239 kB | LGPL-3.0 | yes |
| Opus/WebM, general muxer | 18,166 | 7.9× | 355 kB | MIT | yes |
| Opus/WebM, that muxer streaming | 9,894 | 14.6× | 193 kB | MIT | **no** |
| **Opus/WebM, written here** | **9,655** | **14.9×** | **189 kB** | **none** | yes |

Three things decided it.

**MP3 costs a copyleft dependency.** Every MP3 encoder is derived from LAME, so
LGPL-3.0 comes with the format. Every other runtime dependency Monosai has is MIT or
Apache-2.0, and the application is licensed PolyForm-Noncommercial.

**Opus is better at this than MP3.** At the bitrates speech wants, Opus is stronger on a
single voice, and the platform already has an encoder for it: `AudioEncoder` needs no
dependency at all.

**The container had to be written.** Opus needs one to be stored and to be appended
through MediaSource, and the widely used muxer reserves 8 KiB per track for a
codec-private element that Opus fills with 19 bytes. On a three-second sentence that is
most of the file. Its streaming mode avoids the padding only by dropping the `Duration`
element that single-clip playback reads.

## Decision

**Gemini speech is compressed to Opus at 24 kbit/s mono before it is stored**, in a WebM
container Monosai writes itself. Sixty-millisecond frames: they do not change the audio,
they change how many packets carry it, and at 20 ms the container overhead is twice what
it is at 60 ms. A clip ends up about 6% over its Opus payload.

**The container is written here** (`domain/audio/webm-opus.ts`) rather than taken. Only
what a browser needs to decode and to append is written — no SeekHead, no Cues; a clip is
seconds long and always loaded whole. This also leaves Monosai with no encoder and no
muxer dependency.

**The encode sits in one function both the configuration test and sentence synthesis
call**, for the reason [ADR 0018](0018-openrouter-request-boundary.md) gives for the
request body: a test that proved a clip synthesis would not store proves nothing. Because
the test runs first, a browser whose encoder is broken says so in Settings, with the
sample, rather than part-way through a reading.

**A browser with no encoder stores the WAV as before** rather than failing. An expensive
clip beats no clip, so `audio/wav` stays a producible, playable, supported format and the
WAV concatenation path in the player stays with it.

**Every clip is still decoded before it is stored.** `verifyAudio` now guards against a
bad encode as well as a bad provider, and the two are reported separately: telling a
learner the provider returned something undecodable would send them to change a model
that is working.

**Clips stored before this are re-encoded in place, automatically, in the background.**
That is where a learner's existing space actually went, and asking about it would be
asking them to approve a thing they cannot evaluate. It is deliberately not a schema
migration: a migration that has to encode hundreds of clips before the application opens
is a migration that can leave it unopenable. It is a maintenance pass, started after
startup succeeds, which stands aside the moment the learner plays something.

The safety of that pass is structural, not procedural:

- A clip is replaced only while it is still exactly the clip that was read — the write
  compares the stored format and length and answers `skipped` otherwise — so a sentence
  regenerated mid-pass is never overwritten.
- Nothing is ever deleted, and a clip that cannot be read, cannot be encoded, or would not
  get smaller is left exactly as it is. None of those is a failure of the pass.
- The re-encoded bytes are decoded before they replace anything.
- Resumability needs no bookkeeping: the work is whatever is still uncompressed next time.

**Settings says what happened.** The Storage card names a real count while the pass runs,
offers a Stop, and afterwards states what was compressed, what was reclaimed, and what was
left alone — work the learner did not start is not allowed to be invisible.

## Consequences

- A Gemini library costs about a fifteenth of what it did. A learner who had 8 MB of
  clips keeps roughly 0.6 MB of them.
- Re-encoding is lossy and cannot be undone. The clips are first-generation lossy from
  PCM, at a bitrate chosen well clear of where Opus strains on one voice, and the
  alternative — leaving the library uncompressed — is the problem this solves.
- `audio/wav` rows survive a stopped or never-run pass indefinitely, so
  `combineWaveClips` stays. Its removal is recorded in
  [chapter 11](../arc42/11-risks-and-technical-debt.md), conditioned on WAV rows no longer
  being producible rather than on a date.
- A reading part-way through the pass holds both formats. `playSequence` refuses a mixed
  sequence, which the playback store already catches by falling back to per-sentence
  playback; the window is short and closes on its own.
- Each clip carries about 57 ms of encoder padding, so sentence boundaries in a joined
  sequence are no longer sample-exact. The MP3 path has always had this.
- [ADR 0043](0043-voice-changes-hide-clips-and-say-so.md) is untouched. Cache keys do not
  change, so nothing becomes unreachable and no clip is hidden.
- Monosai now depends on WebCodecs for compression. Where it is absent, storage is as
  expensive as it was before and nothing else changes.
