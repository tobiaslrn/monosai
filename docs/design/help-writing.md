# Help writing guide

How to write Help: the guide at `/help` and every topic under it. [The design rules](rules.md)
are binding everywhere; R55 points here for Help prose. Every other string in the interface,
from a button to an error, follows R48 to R54 and stays as short as they say.

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
  be for the reader. Never blame: "The key wasn't accepted", not "You entered a wrong key".
- **Honest.** Say plainly what Monosai can't do and what costs money. One honest sentence
  builds more trust than a paragraph of reassurance.

## 2. Sentences

- **Write whole sentences.** Every sentence has a subject and a verb and keeps its articles.
  No telegraphic fragments, no colon-led labels in running text.
  - Not: "Orange wavy underline: a word not in your lists."
  - But: "An orange wavy underline marks a word that isn't in your word list."
- **Talk to the reader as "you".** Monosai is "Monosai" or "it", never "we".
- **Use the active voice and the present tense.** "Monosai saves the story when it's
  finished", not "The story will be saved". Use "will" only for something that happens
  later as a consequence: "OpenRouter will charge your account for each attempt."
- **Use common contractions:** don't, doesn't, isn't, aren't, can't, won't, you're, it's,
  you'll. Avoid the awkward ones (it'd, should've, there'll).
- **"You can" introduces a real option**, not a step. Use it when the reader may choose;
  use the imperative when they must act.
- **One idea per sentence; one to four sentences per paragraph.** Aim for sentences under
  25 words. Two short sentences beat one long one joined with a semicolon.
- **Front-load.** Put the condition or the place before the action, and the point before
  the reason: "To refresh a package, export it again", "In **Settings**, open
  **Storage**".
- **Plain words at about grade 8.** "use" not "utilise", "help" not "facilitate", "about"
  not "approximately", "for example" not "e.g.".

## 3. Words

**One term per idea**, used the same way on every page. Define a term the first time a page
uses it, in an ordinary sentence, then keep to it.

| Say            | Meaning                                                              | Don't say                     |
| -------------- | -------------------------------------------------------------------- | ----------------------------- |
| known word     | a word Monosai counts as one you can read                            | learned word, vocab item      |
| word source    | one place your known words come from: Anki, a package file or a list | deck (unless it is one), feed |
| story          | a text Monosai writes for you                                        | generation, output            |
| reading        | any text in your library, written by Monosai or pasted               | document, item                |
| text model     | the AI model that writes and checks stories, translations and notes  | LLM, flagship                 |
| speech model   | the AI model that reads a story aloud                                | TTS                           |
| OpenRouter key | the API key from your OpenRouter account                             | token, secret                 |
| credit         | prepaid money in your OpenRouter account                             | balance, tokens               |
| package file   | an `.apkg` or `.colpkg` file exported from Anki                      | deck file, export             |
| Monosai Bridge | the companion Android app that reads AnkiDroid                       | the APK, the helper           |

Name products the way their makers do: Anki, AnkiDroid, AnkiMobile, AnkiConnect, OpenRouter,
Chrome, Android, iPhone, iPad. Spell British English ("recognise", "colour"), as the rest of
the interface does. Leave out the serial comma ("text, audio and notes") unless a list would
be ambiguous without it.

**Japanese terms** that a beginner may not know (furigana, kanji, JLPT) get a short
definition on first use on a page. Japanese text is wrapped in `<span lang="ja">`.

## 4. The interface in prose

- **Name a control exactly as the screen shows it, in bold:** **Save level**,
  **Refresh automatically**. Copy the label character for character, in the screen's
  sentence case.
- **Give a path with ">"** between bold names: **Settings** > **Storage** > **Protect
  storage**. Start from a place the reader can find: the Library, **Settings** or **What you
  can read**.
- **A path that is also a link** is the link text, without bold: "Open
  [Settings > Text models](…)". Link the place where the reader acts, once per section.
- **Add the kind of control only when it helps:** "the **Connect** button", "the
  **Refresh automatically** switch".
- **Gestures are device-neutral.** "Select" a row, option or button. Say "tap" only for
  something phone-only and "click" only for something computer-only. A long press is "touch
  and hold".
- **Text the learner types or copies exactly** (an add-on code, a web address, a model ID,
  an error code) is code: `2055492159`.
- **Versions say "or later":** "Android 16 or later".

## 5. Pages

Help has three kinds of page, and a page is mostly one kind.

- **Task pages** help the reader do something: get started, add words, write a story. Their
  titles start with a verb: "Add your words", "Choose a text model".
- **Concept pages and sections** explain how something works: what counts as a known word,
  how strictness works. Their headings are noun phrases: "What counts as a known word".
- **Reference pages** are for looking things up: Common questions, Fix a problem. Their
  titles are noun phrases or a task, and their entries are short.

Every topic page:

1. **Opens with one lead sentence** (`<p mn-lead>`) that says what the page helps the reader
   do or know. It never repeats the title word for word.
2. **Is a series of sections**, each with an `h2`. A section answers one question. Use an
   `h3` only to split a long section into parallel parts, such as one per device.
3. **Keeps headings parallel.** Within one page, the headings share a grammatical form.
   Never start a heading with an "-ing" verb. Questions are for Common questions only.
4. **Links instead of repeating.** A fact lives on one page; other pages link to it.
5. **Is short enough to read in about three minutes.** If it is longer, it is two topics.

Topic titles are 1 to 5 words and are the same on the hub row, the page header and the
pager. The summary on a hub row is a noun phrase of at most five words that names what the
reader will find, including the words they would search for ("Anki, AnkiDroid, iPhone,
lists").

## 6. Steps

- **Number the steps** when order matters and there is more than one action. A sentence
  introduces the list unless the heading already says what it achieves.
- **One action per step**, starting with an imperative verb, ending with a full stop:
  "Open **Settings** > **OpenRouter key**." Put where before what.
- **Say what happens** after a step when the reader needs to recognise it: "Monosai sends
  a short test request, and the row shows whether the model works."
- **Seven steps at most.** A longer procedure is split into named stages.
- **Requirements come first**, in a sentence before the steps: "You need Anki on the same
  computer, with the AnkiConnect add-on installed."
- **Optional steps** start with "Optional:".

## 7. Notices

A notice (`mn-notice`) stops the reader. Use one only when reading past it would cost them
something.

- **Warning** for money, lost data or something that can't be undone.
- **Info** for a caveat that changes what the reader does, such as a platform limit.
- At most one notice per section, never a step inside one and never a reassurance where
  nothing is at risk.

## 8. Numbers, prices and dates

- Numerals for all numbers: "3 stories", "50 words". Group thousands: "1,000".
- Prices in US dollars with the sign: "$0.25 per million tokens", "about 20 cents".
- Facts that age (model names, prices, versions) carry a date line (`<p mn-checked>`):
  "Prices and names checked on Sep 17, 2026." Revise them, don't leave them.
- Approximate honestly: "about", "under a cent", "a few cents".

## 9. Accuracy

A help page is only as good as its least accurate sentence.

- **Check every label against the screen** and every behaviour against the code before you
  write it down. If the screen changes, the page changes in the same commit.
- **Write what the learner sees on the screen**, not internal names. A failure is looked
  up by the heading the screen shows; the code is the secondary reference.
- **Write for every platform Monosai supports**: computer, Android, iPhone and iPad. When
  something works on only some of them, say which at the start of the section.

## 10. Before you commit

- [ ] Every sentence is a whole sentence and reads naturally aloud.
- [ ] "You" throughout, contractions where natural, no "we".
- [ ] Every control is bold and matches the screen exactly; paths use ">".
- [ ] The page opens with one lead sentence; headings are parallel and not "-ing" first.
- [ ] Each term is the one in section 3 and is defined on first use.
- [ ] Steps are numbered, one action each, imperative.
- [ ] Notices only for money, data or a real limit.
- [ ] Facts that age carry a date; every claim has been checked against the app.
- [ ] Nothing is said twice; the other page is linked instead.
- [ ] British spelling; no serial comma unless a list would be ambiguous ("text, audio and notes").
