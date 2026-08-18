# 0010 — Sentence text drops the line breaks and padding that end a segment

Date: 2026-08-18
Status: Accepted

## Context

`buildImportDraft` (`domain/reading/import-structure.ts`) turns segmented
source text into paragraphs and sentences for import review. A paragraph keeps
its `sourceText` as an exact slice of the imported text — `splitIntoParagraphs`
never trims it. A sentence's text is `segment.text.trim()`.

Every other stored Japanese string in the domain is a verbatim slice of what
the learner imported: paragraphs, and the tokens within a sentence, are offsets
into text that round-trips exactly. Sentence text is the one place this
milestone deliberately breaks that rule, so it needs its own justification and
a stated bound on what it is allowed to remove.

The segmenter's boundary regex (`boundary` in `segmentation.ts`) absorbs
trailing terminator runs, closers, and inline spaces into the segment so that
splitting is unambiguous and re-tiles the input exactly — `segment.endUtf16` for
one sentence equals `startUtf16` for the next. That absorption is correct for
segmentation, but it means a raw segment carries trailing whitespace and,
between paragraphs, the newlines that separate them. If sentence text stored
that trailing whitespace verbatim, every stored sentence, every dictionary
lookup key, and — once Milestones 6–9 exist — every translation and audio cache
key derived from that text would carry a trailing `\n\n` or a run of spaces
that has no meaning to a learner reading the sentence.

## Decision

`buildImportDraft` trims each segment's text before storing it as
`DraftSentence.text`. This is the only transformation applied to sentence text
beyond slicing; nothing is trimmed from the interior of a sentence, and nothing
is trimmed from paragraph text.

What this removes is bounded precisely to what the segmenter's boundary
absorption added: leading/trailing whitespace and the blank-line runs between
paragraphs. It never removes user-typed interior whitespace (full-width or
half-width spaces inside a sentence are Japanese punctuation-adjacent content,
not segment padding) and it never touches a paragraph's `sourceText`, which
stays the exact slice `splitIntoParagraphs` produced — a learner who pasted a
paragraph with unusual internal spacing sees that spacing preserved in the
paragraph view.

A sentence with nothing left after trimming — a blank line the segmenter
absorbed into an otherwise-empty segment — is dropped rather than stored:
`buildImportDraft` skips it, and a paragraph left with zero sentences after
that is dropped too, matching the existing rule that a paragraph of nothing
but blank lines has no reason to exist in a saved reading.

## Consequences

- Sentence text, dictionary lookup keys derived from it, and any future
  translation/audio cache key are stable and free of structural noise that
  carries no meaning.
- The paragraph is the only place that guarantees a verbatim reconstruction of
  the learner's exact input; the reader already renders paragraphs, not raw
  sentence concatenation, so nothing observable regresses.
- `import-structure.spec.ts` asserts the bound directly: a segment with
  interior full-width spaces keeps them, and a segment that is only trailing
  whitespace produces no sentence at all.
- If a later milestone needs the untrimmed sentence span for some purpose (for
  example, highlighting exactly what the tokenizer saw), it is still
  recoverable from the paragraph's source text plus the sentence's known
  paragraph-relative position, so trimming loses no information permanently.

## Alternatives considered

**Store the untrimmed segment and trim only for display.** Rejected: it moves
the same trimming decision into every consumer (the reader, dictionary lookup,
and every future cache-key computation) instead of making it once at the one
point sentence text is created, and it means two sentences that a learner would
call identical could hash to different cache keys depending on incidental
trailing whitespace.

**Trim paragraph text too, for consistency.** Rejected: paragraph text has no
segmenter-boundary padding problem to fix — `splitIntoParagraphs` slices
paragraphs on the blank-line boundary itself, not on a token-level regex that
absorbs trailing space — and trimming it would give up the one place the
learner's exact input is guaranteed to survive verbatim.
