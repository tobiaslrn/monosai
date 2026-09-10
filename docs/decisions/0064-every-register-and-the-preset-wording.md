# 0064 — Every register is allowed, and the preset's wording is what is sent

Date: 2026-09-10
Status: Accepted; amends [ADR 0008](0008-grammar-profile-presets.md)

## Context

ADR 0008 gave the grammar profile three parts: a preset, a register preference
(everyday spoken, polite written, or either), and an optional edited copy of the
preset's prose — the wording sent to the model. After What you can read was
recomposed ([ADR 0063](0063-what-you-can-read-is-composed-like-the-library.md)),
the last two were the only settings left in a fold of their own.

Neither earned that place. The register asked a beginner to decide something
they cannot yet judge, and stories written in one register hid the other from
them. The edited wording was an escape hatch into prompt text: a learner who
used it replaced prose written against the preset ladder with their own, and
the ladder then described a level the stories were no longer written at.

## Decision

The grammar profile is the preset alone.

- **Every register is allowed.** The profile always applies `either`.
- **The preset's prose is what is sent.** Edited guidance is no longer offered
  or applied.
- The Register & wording fold, its component, and the store's register and
  custom-guidance mutations are removed.

A record saved before this keeps its register and edited guidance in storage.
They are read and ignored, not deleted: the stored shape is unchanged, so no
schema version or upgrade is needed, and the next saved reading level writes
the record back without them. Captures taken for stories generated before this
keep the register and wording they were generated with, because a capture is the
history of what was sent.

## Consequences

- The profile hash of a learner who had chosen a register or edited wording
  changes, so their existing grammar analyses read as out of date, exactly as a
  change of level would make them.
- Translation and grammar analysis read the applied profile, so they follow the
  same rule without changes of their own.
- `resolveGuidance` still accepts edited guidance, because captures record
  whether they were taken with it.
