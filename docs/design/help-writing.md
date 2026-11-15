# Help writing guide

How to write Help: the guide at `/help` and every topic under it. [The design rules](rules.md)
are binding everywhere. R55 points here for Help prose, and the form rules of R54 (sentence
case, British spelling, no "&", no em dashes) apply to it too. Every other string in the
interface, from a button to an error, follows R48 to R54 and stays as short as they say.

Help is the one place where a learner sits down to read. They come with a question,
often in the middle of a task and sometimes after something has gone wrong. A good page
answers it in the first lines, in sentences a person would say out loud, and then gets out of
the way.

## 1. Voice

Write like a calm, knowledgeable friend who has used Monosai for a long time and respects
the reader's time.

- **Clear before clever.** No idioms, wordplay or rhetorical questions. "Free models make
  too many mistakes to be worth the savings", not "Free models are a false economy".
- **Confident, not chatty.** State what is true. Don't hedge with "might", "should
  probably" or "try to", and don't cheer with exclamation marks or "Great!".
- **Respectful.** Never "simply", "just", "easy" or "obviously": what is easy for us may not
  be for the reader. Never blame: "OpenRouter didn't accept the key", not "You entered a
  wrong key".
- **Honest.** Say plainly what Monosai can't do and what costs money. One honest sentence
  builds more trust than a paragraph of reassurance.
- **No promises.** Describe Monosai as it is today. No "yet", "soon" or "coming".
- **No history, motivation or philosophy.** Say what to do and why it matters to the
  reader, not how Monosai came to be this way.

## 2. Sentences

- **Write whole sentences.** Every sentence is complete: an imperative, or a subject and a
  verb, with its articles. No telegraphic fragments, no colon-led labels in running text.
  - Not: "Orange wavy underline: a word not in your lists."
  - But: "An orange wavy underline marks a word that isn't among your known words."
- **Talk to the reader as "you".** Monosai is "Monosai" or "it", never "we".
- **Use the active voice and the present tense.** "Monosai saves the story when it's
  finished", not "The story will be saved". Use "will" only for something that happens
  later as a consequence: "OpenRouter will charge your credit for each attempt."
- **Use common contractions:** don't, doesn't, isn't, aren't, can't, won't, you're, it's,
  you'll. Avoid the awkward ones (it'd, should've, there'll).
- **"You can" introduces a real option**, not a step. Use it when the reader may choose;
  use the imperative when they must act.
- **One idea per sentence; one to four sentences per paragraph.** Aim for sentences under
  25 words. Two short sentences beat one long one joined with a semicolon.
- **Front-load.** Put the condition or the place before the action, and the point before
  the reason: "To update an Anki package, export it again", "In **Settings**, under
  **Storage**, select **Protect storage**".
- **Plain words at about grade 7**, as R49 asks of the interface. "use" not "utilise", "help"
  not "facilitate", "about" not "approximately", "for example" not "e.g.".
- **No serial comma** ("text, audio and notes") unless a list would be ambiguous without it.

## 3. Words

**One term per idea**, used the same way on every page, and the same as the screen. Define a
term the first time a page uses it, in an ordinary sentence, then keep to it.

| Say            | Meaning                                                               | Don't say                     |
| -------------- | --------------------------------------------------------------------- | ----------------------------- |
| known word     | a word Monosai counts as one you can read                             | learned word, vocab item      |
| your words     | all your known words, from every word source together                 | vocabulary, snapshot          |
| word source    | one place your known words come from: Anki, an Anki package or a list | deck (unless it is one), feed |
| word list      | a word source you type or paste, one word per line                    | text list                     |
| story          | any text in your library, written by Monosai or pasted                | reading, document, item       |
| reading level  | the grammar Monosai assumes you know, set in **Settings** > **Grammar** | grammar level, profile      |
| text model     | the AI model that writes stories, translations and grammar notes      | LLM, flagship                 |
| speech model   | the AI model that reads a story aloud                                 | TTS, voice model              |
| OpenRouter key | the API key from your OpenRouter account                              | token, secret                 |
| credit         | prepaid money in your OpenRouter account                              | balance, tokens               |
| Anki package   | an `.apkg` or `.colpkg` file exported from Anki                       | package file, export file     |
| Monosai Bridge | the companion Android app that reads AnkiDroid                        | the APK, the helper           |

Say "pasted text" only when the difference from a written story matters. Name products the
way their makers do: Anki, AnkiDroid, AnkiMobile, AnkiConnect, OpenRouter, Chrome, Safari,
Android, iPhone, iPad.

**Japanese terms** that a beginner may not know (furigana, kanji, JLPT, the て-form) get a
short definition on first use on a page. Japanese text is wrapped in `<span lang="ja">`.

## 4. The interface in prose

- **Name a control exactly as the screen shows it, in bold:** **Save level**,
  **Refresh automatically**. Copy the label character for character, in the screen's
  sentence case. A control in another app (Anki, Safari, openrouter.ai) is bold too, spelt
  as that app spells it.
- **An icon-only control** is named by its accessible name, in bold, with its icon when that
  helps: "the **Audio** button (the speaker icon)".
- **Give a path with ">"** between places you open: **Settings** > **Text models**. Name a
  section heading with "under", because it isn't something you open: "In **Settings**, under
  **Storage**, select **Protect storage**." Start from a place the reader can find: the
  Library, **Settings** or **Words**.
- **A path that is also a link** is the link text, without bold: "Open
  [Settings > Text models](…)". Link the place where the reader acts, once per section.
- **Add the kind of control only when it helps:** "the **Connect** button", "the
  **Refresh automatically** switch".
- **Use one verb per kind of control.** "Select" a row, button or option; "turn on" or "turn
  off" a switch; "enter" text you type; "choose" from a list.
- **Gestures are device-neutral.** Say "tap" only for something phone-only and "click" only
  for something computer-only. A long press is "touch and hold".
- **Never place a control by direction** ("on the right", "above"): the layout changes
  between phone and computer. Name it instead, and never by colour alone.
- **Text the learner types or copies exactly** (an add-on code, a web address, a model ID,
  an error code) is code: `2055492159`.
- **Versions say "or later":** "Android 12 or later".
- **Link text is the destination's title**, such as [Choose a text model](…); never "here",
  "this page" or a bare address.

## 5. Pages

Help has three kinds of page, and a page is mostly one kind.

- **Task pages** help the reader do something: get started, add words, write a story. Their
  titles start with a verb: "Add your words", "Choose a text model".
- **Concept pages and sections** explain how something works: what counts as a known word,
  how strictness works.
- **Reference pages** are for looking things up: Common questions, Fix a problem. Their
  titles are noun phrases or a task, and their entries are short.

Every topic page:

1. **Opens with a lead** (`<p mn-lead>`) of one or two sentences that says what the page
   helps the reader do or know. It never repeats the title word for word.
2. **Is a series of sections**, each with an `h2`. A section answers one question. Use an
   `h3` only to split a long section into parallel parts, such as one per device.
3. **Uses headings a person would say.** A task section starts with an imperative verb
   ("Connect your key"). A concept section is a noun phrase ("Two kinds of speech model") or
   a clause that starts with How, What, Why, When, If, Before or After ("How the levels
   compare", "If a word sounds wrong"). Never start a heading with an "-ing" verb, and end one
   with a question mark only on Common questions. Read the headings of a page in a row: they
   should sound like a table of contents, not a list of labels.
4. **Links instead of repeating.** A fact lives on one page; other pages link to it.
5. **Is short enough to read in about three minutes.** If it is longer, it is two topics.
   Reference pages are scanned rather than read, so this limit is for task and concept
   pages.

Topic titles are 1 to 4 words and are the same on the hub row, the page header and the
pager. The summary on a hub row lists up to five words the reader would look for ("Anki,
AnkiDroid, iPhone, lists").

The hub opens with a lead of one or two sentences that says what Monosai does and where a
newcomer starts, and the topic shelf follows straight after, so it is in view on a phone.

**Common questions.** A question is in the learner's voice ("Can I use Monosai without
AI?"); the answer is in yours. Answer a yes-or-no question with "Yes." or "No." first, then
one or two sentences and a link to the topic that explains more.

**Fix a problem.** Each entry starts with the failure's heading exactly as the screen shows
it, in bold. Then the cause in one sentence, what to do as an imperative, and the code in
`code` for a bug report. Entries are plain strings, so only a control can be marked, with
`**`; write an identifier such as an add-on code where the page's own prose can set it as
code.

## 6. Steps

- **Number the steps** when order matters and there is more than one action. A sentence
  introduces the list unless the heading already says what it achieves.
- **One action per step**, starting with an imperative verb, ending with a full stop:
  "Select **OpenRouter key**." Put where before what.
- **Say what happens** after a step when the reader needs to recognise it: "Monosai sends
  a short test request, and the status shows whether the model works."
- **Seven steps at most.** A longer procedure is split into named stages ("Then, in
  Monosai:").
- **Requirements come first**, in a sentence before the steps: "You need Anki on the same
  computer as your browser."
- **Optional steps** start with "Optional:", the one colon label allowed.

## 7. Notices

A notice (`mn-notice`) stops the reader. Use one only when reading past it would cost them
something, and use only two tones in Help.

- `tone="warning"` for money, lost data or something that can't be undone.
- `tone="info"` for a caveat that changes what the reader does, such as a platform limit.
- At most one notice per section, never a step inside one and never a reassurance where
  nothing is at risk.

## 8. Numbers, prices and dates

- Spell out zero to nine in prose ("two kinds", "three plots"). Use numerals for 10 and
  above, and for prices, measurements, versions, step numbers and anything the screen shows
  as a number ("50 words", "1× speed"). Group thousands: "1,000".
- Prices are in US dollars: "$0.25 per million tokens". Below a dollar, "about 20 cents"
  reads more easily.
- Facts that age (model names, prices, versions) carry a date line (`<p mn-checked>`):
  "Prices and names checked on Sep 17, 2026." When you change a page, recheck every dated
  fact on it and update the date.
- Approximate honestly: "about", "under a cent", "a few cents".

## 9. Accuracy

A help page is only as good as its least accurate sentence.

- **Check every label against the screen** and every behaviour against the code before you
  write it down. If the screen changes, the page changes in the same commit.
- **Write what the learner sees on the screen**, not internal names. A failure is looked
  up by the heading the screen shows; the code is the secondary reference.
- **Write for every device a learner may use:** a computer, an Android phone, and an iPhone
  or iPad. Monosai is tested only in Chrome on Windows and Android; say so where it matters.
  When a section applies to only some devices, say which at its start.

## 10. Before you commit

- [ ] Every sentence is complete and reads naturally aloud.
- [ ] "You" throughout, contractions where natural, no "we".
- [ ] Every control is bold and matches the screen exactly; paths use ">" and "under".
- [ ] The page opens with a lead; headings read like a table of contents, never "-ing" first.
- [ ] Each term is the one in section 3 and is defined on first use.
- [ ] Steps are numbered, one action each, imperative.
- [ ] Notices only for money, data or a real limit.
- [ ] Facts that age carry a date; every claim has been checked against the app.
- [ ] Nothing is said twice; the other page is linked instead.
- [ ] British spelling; numbers as section 8 says; no serial comma.
