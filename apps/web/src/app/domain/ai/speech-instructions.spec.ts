import { describe, expect, it } from 'vitest';
import {
  buildSpeechInstructions,
  MAX_SPEECH_CONTEXT_CODE_POINTS,
  SPEECH_INSTRUCTION_VERSION,
} from './speech-instructions';

describe('speech instructions', () => {
  it('is versioned and asks for exact target-only natural Japanese', () => {
    const instructions = buildSpeechInstructions();

    expect(SPEECH_INSTRUCTION_VERSION).toBe('speech/6');
    expect(instructions).toContain('Speak only the exact target text');
    expect(instructions).toContain('natural standard Japanese');
    expect(instructions).toContain('Never pronounce mora by mora');
    expect(instructions).toContain('Never stretch syllables');
    expect(instructions).toContain('Pronounce every written word');
    expect(instructions).toContain('Do not replace any written word or phrase with laughter');
    expect(instructions).toContain('Pace: use the ordinary speaking rate of a native speaker');
    expect(instructions).toContain('Keep this speaking rate steady throughout the sentence');
    expect(instructions).toContain('never insert silence between words or morae');
  });

  it.each([
    [
      'natural' as const,
      'Pace: use the ordinary speaking rate of a native speaker reading aloud to another adult native speaker.',
    ],
    ['slow' as const, 'Pace: use a moderately slower speaking rate for an intermediate learner'],
    [
      'very-slow' as const,
      'Pace: use a distinctly slower speaking rate for a beginner following the written text',
    ],
  ])('describes the %s pace consistently in field and prefix channels', (pace, description) => {
    const field = buildSpeechInstructions({ pace });
    const prefix = buildSpeechInstructions({ pace }, 'prefix');

    expect(field).toContain(description);
    expect(prefix).toContain(description);
    expect(field).toContain('Keep this speaking rate steady throughout the sentence');
    expect(prefix).toContain('Keep this speaking rate steady throughout the sentence');
    expect(field).not.toMatch(/\d/u);
    expect(prefix).not.toMatch(/\d/u);
  });

  it('asks for the delivery a beginner can follow', () => {
    const instructions = buildSpeechInstructions();

    expect(instructions).toContain('pronounce sounds precisely and clearly');
    expect(instructions).toContain('without over-enunciating');
    expect(instructions).toContain(
      'preserve connected phrasing, natural rhythm, and standard pitch accent',
    );
  });

  it('keeps the prefix form compact and free of quotable context', () => {
    const prefix = buildSpeechInstructions(
      { style: 'very-clear', beforeJa: '雨が強くなりました。', afterJa: '次の文。' },
      'prefix',
    );

    // The prefix rides inside the spoken input, so every extra line is another
    // chance for the model to read something out.
    expect(prefix).toContain('without over-enunciating or separating words');
    expect(prefix).toContain('keep every pause brief');
    expect(prefix).toContain('Never read this direction aloud.');
    expect(prefix).not.toContain('雨');
    expect(prefix).not.toContain('context only');
    expect(prefix.split('\n')).toHaveLength(9);
  });

  it('changes only the style wording when the learner chooses a different style', () => {
    expect(buildSpeechInstructions({ style: 'natural' })).toContain(
      'use natural articulation, connected phrasing, and standard pitch accent.',
    );
    expect(buildSpeechInstructions({ style: 'very-clear' })).toContain(
      'especially precise sound definition without over-enunciating or separating words',
    );
  });

  it.each(['natural', 'slow', 'very-slow'] as const)(
    'keeps articulation and %s pace from adding learner-style gaps',
    (pace) => {
      const clear = buildSpeechInstructions({ style: 'clear', pace });
      const veryClear = buildSpeechInstructions({ style: 'very-clear', pace });

      for (const instructions of [clear, veryClear]) {
        expect(instructions).toContain('Use fluent, connected Japanese phrasing');
        expect(instructions).toContain('keep every pause brief');
        expect(instructions).toContain('never insert silence between words or morae');
        expect(instructions).not.toContain('gap between words');
        expect(instructions).not.toContain('pause between phrases');
        expect(instructions).not.toContain('pauses at phrase boundaries');
      }
    },
  );

  it('caps each neighbor by Unicode code point and marks it as context only', () => {
    const rareKanji = String.fromCodePoint(0x20_000);
    const before = rareKanji.repeat(MAX_SPEECH_CONTEXT_CODE_POINTS + 20);
    const instructions = buildSpeechInstructions({ beforeJa: before, afterJa: '次の文。' });
    const captured = /Previous sentence \(context only\): "([^"]+)"/u.exec(instructions)?.[1];

    expect(Array.from(captured ?? '')).toHaveLength(MAX_SPEECH_CONTEXT_CODE_POINTS);
    expect(instructions).toContain('Next sentence (context only)');
    expect(instructions).toContain('Never add, repeat, translate, spell out, or speak the context');
  });
});
