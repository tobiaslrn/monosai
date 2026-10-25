# 0081 — The story direction has six distinct axes

Date: 2026-10-25
Status: Accepted; amends the axes part of [ADR 0080](0080-the-plot-is-chosen-before-the-story.md)

## Context

The Direction step of [ADR 0080](0080-the-plot-is-chosen-before-the-story.md) offered
seven axes and 132 chips. The structure held up; the contents did not:

- Axes overlapped. Comedy sat in genre and Funny in mood. Bittersweet, Hopeful, Funny,
  Sad, and Warm appeared in both mood and ending. Misunderstanding and Lost and found
  were genres and turning points.
- Genre mixed four things: the way a story is told (Mystery, Romance), its subject
  (Food, Sports, Work life), its motive (Rivalry, Helping others), and the relationship
  at its centre (Friendship, Family).
- Time was detail with no learning value, and part of format (Postcard, Monologue,
  Interview) was the same kind of detail.
- Setting was a list of everyday places with no other worlds, eras, or countries.

The cause was the beginner rule as it was applied. It asked which genres could be told
with everyday words, and so removed whole genres. The question that matters is whether
the unusual part of a story can be described with the learner's words. Folk tales already
pass that test, and so does a place abroad or in old Japan.

## Decision

The Direction step has **six axes**. Each answers one question:

| Axis (key) | Question | Options |
|---|---|---|
| Genre (`genre`) | What kind of story? | Slice of life, Comedy, Mystery, Adventure, Romance, Drama, Folk tale |
| Topic (`topic`, new) | What is it about? A word field for the focus words. | Food, Work, School, Travel, Shopping, Sports, Music and art, Animals, Nature and weather, Festivals and seasons, Health |
| Setting (`setting`) | Where, on a large scale? | Home, Neighbourhood, Big city, Countryside, Seaside, Mountains and forest, Old Japan, Abroad |
| Mood (`mood`) | How does it feel, and how does it end? | Heartwarming, Funny, Cozy, Exciting, Tense, Mysterious, Bittersweet, Sad, Hopeful, Twist ending |
| Cast (`cast`) | Who, in what relationship? | One person, Friends, Couple, Family, Parent and child, Siblings, Grandparent and grandchild, Classmates, Coworkers, Teacher and student, Strangers, Animal |
| Format (`format`) | How is it told? | Narrated, Mostly dialogue, Diary, Chat messages, Letter or email |

That is 53 options in place of 132.

- **Ending is part of mood.** The ending options that were not already moods are kept as
  moods (Twist ending), so no separate ending axis remains. The writer is told that the
  mood says how the story feels and ends.
- **Time is removed.** A seasonal occasion belongs to Topic (Festivals and seasons); the
  time of day is the writer's choice.
- **Motives become turning points.** Misunderstanding, Lost and found, and Helping others
  are already turning points (Misunderstanding, Found item, Asking for help). Rivalry
  becomes Contest, and Strange discovery is added as a turning point.
- **The beginner rule stays as written.** Fantasy, science fiction, ghost stories, space,
  and other worlds remain out. Folk tale, Old Japan, and Abroad are in because they can be
  told with words a learner already has: むかし, 村, 川 for a folk tale, and travel words
  for a trip. The header comment of the options file gives these reasons.

Rolling works as before, with the rule applied to the new axes. Code rolls genre, topic,
setting, and cast on Any, one per card, distinct across the three cards where the lists
allow. Mood and format are left unsaid when the learner did not choose them, because they
change how a story is told, not what it is. Topic allows one choice, like every axis but
genre.

**Persistence.** The provenance schema `storyAxisSchema` gains `topic` and keeps `ending`
and `time`, so records written under ADR 0080 still parse. New records never name the two
retired axes. Dexie indexes are unchanged and no version is added, because the record is
optional and only extended. The draft is not persisted, as before.

**Prompts.** The story and blueprint prompts name the six axes in their direction
sentence, and the story version increases to `story/8`. The plot prompt's sentence about
frames changes with it, so `plots` increases to `plots/2`. The segment prompt already
speaks of mood and format and does not change. The direction section is rendered from
`STORY_AXES`, so it lists the new axes without code changes.

## Consequences

- Fewer, separate choices. A learner who wants an ending picks a mood; the writer ends the
  story to fit it.
- Stories chosen before this ADR keep their provenance and still read. Their mood, ending,
  or time values are shown as recorded.
- Learners can no longer steer a story's time of day. This is accepted, as the writer
  decides it.
- The option lists and turning points remain reviewable data. The specs keep a value from
  appearing on two axes, or as both an option and a turning point.
- Levelling the option lists by deck size, and the question of a separate plot model, are
  still open, as in ADR 0080.
