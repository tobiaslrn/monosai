# 1. Introduction and Goals

Monosai is a Japanese reading application for beginners. It runs in the browser and keeps all
learner data on the device.

## 1.1 Requirements Overview

Monosai helps a learner read Japanese that is close to their level. It adds hiragana readings above
kanji, spaces between words, dictionary glosses, and markers for words the learner has probably not
met yet. It reads the reviewed vocabulary from the learner's Anki collection to decide which words
those are. It never writes to Anki.

There are two ways to put a reading into the library. Both end in the same reader.

| Use case | Actor and input | Preconditions | Result |
| --- | --- | --- | --- |
| **Import a text** | The learner pastes Japanese, or opens a UTF-8 `.txt` file | None. No Anki, no key, no network after the first visit | A saved reading, segmented into paragraphs and sentences, with tokens |
| **Generate a story** | The learner writes a premise | An OpenRouter key, and about 50 reviewed expressions | A saved story that uses only known words, plus the evidence it was judged against |
| **Refresh vocabulary** | The learner connects Anki, or opens a package file | Anki running with AnkiConnect, an Android bridge, or an `.apkg` / `.colpkg` file | One current vocabulary snapshot, which replaces the previous one |
| **Read with aids** | The learner opens a saved reading | The reading exists | Furigana, glosses, and word markers. Translation, grammar review, and speech on request |

The reader is the centre of the product. Import needs nothing. Everything that uses the network is
optional: story generation, translation, grammar review, and speech.

The primary learner is a beginner with roughly 50 to 1,800 reviewed expressions. Such a learner
cannot yet read ordinary material but wants to practise reading now. The reader stays useful above
that range, because a learner who pastes their own text still gets segmentation, furigana, and the
dictionary.

Monosai does not schedule reviews and does not manage cards. Anki stays the source of review
history.

## 1.2 Quality Goals

These are the three qualities that drive the architecture, in priority order. When two qualities
conflict, the higher one wins. [Chapter 10](10-quality-requirements.md) turns them into measurable
scenarios and names the gate that holds each one.

| Priority | Quality goal | Scenario |
| --- | --- | --- |
| 1 | **Local-first and offline-capable** (#reliable, #operable) | The learner opens Monosai on a train with no network. The application shell loads from Cache Storage, saved readings load from IndexedDB, and the dictionary answers lookups. Only new AI requests and a live Anki connection report that they need a network |
| 2 | **Honest about what the learner knows** (#safe, #usable) | A generated story contains a word that no repair could replace. Monosai saves the story and marks that word as unknown in the reader, instead of hiding it or claiming the model approved it. See [ADR 0033](../decisions/0033-unresolved-unknown-words-are-marked-not-rejected.md) |
| 3 | **No unrequested spend and no telemetry** (#secure) | The learner opens a reading that has no translation. Monosai shows the reading and requests nothing. A paid request starts only after the learner asks for one. The API key never appears in a log, an error report, or an export |

Two further qualities rank below these three but still shape the code. **Maintainability** matters
because most of this codebase is written by agents, so the layer rule in
[ADR 0003](../decisions/0003-architectural-boundary-enforcement.md) is enforced by the linter rather
than by review. **Performance efficiency** matters at the reader, because a 50,000 character import
must stay responsive; the reader therefore mounts a bounded paragraph window
([ADR 0011](../decisions/0011-paragraph-window-bounds.md)).

## 1.3 Stakeholders

| Role | Contact | Expectation of the architecture and this documentation |
| --- | --- | --- |
| **Learner** | The end user. Not a contributor | The reader is fast and quiet. Saved readings work offline. The Anki collection stays untouched. Cost stays under their control. They read [the setup guide](../setup.md), never this directory |
| **Maintainer** | Repository owner | Change stays safe. Layers, typed errors, and tests catch mistakes before merge. This directory tells them how the system is shaped today |
| **Coding agent** | Any agent working under [AGENTS.md](../../AGENTS.md) | Needs one authoritative description of the structure before it changes architecture. That description is this directory, plus [the ADRs](../decisions/) for the reasons and [the design system](../design-system.md) for the user interface |
| **Anki project** | External. Not consulted | Monosai is a read-only client. It must not corrupt a collection or change review history. The action allowlist makes this a property of the code |
| **OpenRouter** | External service, paid by the learner | Monosai is a bring-your-own-key client. It must respect rate limits, cap response sizes, and retry politely |
