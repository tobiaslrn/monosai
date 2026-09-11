/**
 * Every figure Home shows that Monosai cannot measure yet.
 *
 * Monosai records when a story was last opened and nothing else about reading,
 * so these stand in until sessions and a finished date are recorded. Each
 * group that shows one carries a Sample pill. See ADR 0070.
 */
export const SAMPLE_READING_FIGURES = {
  storiesRead: 14,
  thisWeek: 3,
  charactersRead: 12_500,
  streakDays: 5,
} as const;

/** Where the learner stands in the story Continue reading names. */
export const SAMPLE_READING_POSITION = { paragraph: 3, of: 5 } as const;

/** How far the streak calendar looks back. */
export const SAMPLE_CALENDAR_WEEKS = 16;

/** How much was read on one day, from nothing to the most. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * One level per day, oldest first and today last.
 *
 * Generated rather than listed, from a fixed seed, so the calendar looks the
 * same on every visit: sparse long ago, denser lately, and the last
 * `streakDays` days read, with the day before them empty so the streak the
 * calendar shows is the one its heading states.
 */
export function sampleHeatLevels(): readonly HeatLevel[] {
  const days = SAMPLE_CALENDAR_WEEKS * 7;
  const streakStart = days - SAMPLE_READING_FIGURES.streakDays;
  let seed = 7;
  const random = (): number => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const levels: HeatLevel[] = [];
  for (let day = 0; day < days; day += 1) {
    const recency = day / days;
    let level =
      random() < 0.25 + recency * 0.5 ? 1 + Math.floor(random() * (1 + recency * 3.2)) : 0;
    if (day === streakStart - 1) {
      level = 0;
    } else if (day >= streakStart) {
      level = Math.max(level, 2);
    }
    levels.push(Math.min(level, 4) as HeatLevel);
  }
  return levels;
}
