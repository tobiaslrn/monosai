import { expect, type Page } from '@playwright/test';
import { stubAnkiConnect } from './anki';
import {
  expectReadiness,
  saveApiKey,
  stubOpenRouter,
  textModelReadiness,
  ttsReadiness,
  type StubOptions,
} from './openrouter';

/**
 * Shared setup for the generation journeys.
 *
 * Every prerequisite is satisfied through the real application: the key is
 * typed into Settings, the model passes its real compatibility test against the
 * routed stub, and the vocabulary snapshot is built by an actual refresh. No
 * test writes into IndexedDB directly, so what these tests exercise is the same
 * path a learner walks.
 */

export const TEXT_MODEL = 'vendor/text-model';
export const TTS_MODEL = 'vendor/tts-model';
export const TTS_VOICE = 'sakura';

/**
 * Reviewed expressions, comfortably over the fifty the specification requires.
 *
 * Written the way Japanese actually is, with kanji: an all-kana sentence is
 * genuinely ambiguous to segment, and a fixture that avoided kanji would be
 * testing the tokenizer's worst case rather than the generation pipeline.
 */
export const REVIEWED_EXPRESSIONS: readonly string[] = [
  '猫',
  '犬',
  '鳥',
  '魚',
  '水',
  'ご飯',
  '朝',
  '昼',
  '夜',
  '家',
  '庭',
  '町',
  '山',
  '川',
  '海',
  '空',
  '花',
  '本',
  '学校',
  '先生',
  '学生',
  '駅',
  '手紙',
  '時間',
  '言葉',
  '友',
  '家族',
  '車',
  '電車',
  '店',
  '公園',
  '部屋',
  '窓',
  '雨',
  '雪',
  '風',
  '光',
  '食べる',
  '飲む',
  '寝る',
  '起きる',
  '歩く',
  '走る',
  '見る',
  '聞く',
  '読む',
  '書く',
  '行く',
  '帰る',
  '遊ぶ',
  '待つ',
  '座る',
  '話す',
  '買う',
  '作る',
  '思う',
  '住む',
  '洗う',
  '働く',
  '休む',
  '楽しい',
  '嬉しい',
  '大きい',
  '小さい',
  '新しい',
  '古い',
  '静か',
];

/** A four-sentence story built only from reviewed words and function words. */
export const STRICT_STORY = {
  titleJa: '猫の朝',
  sentences: [
    '猫は庭で遊びます。',
    '先生は公園を歩きます。',
    '猫は魚を食べます。',
    '夜に猫は寝ます。',
  ],
} as const;

/**
 * A thirteen-sentence story, still built only from reviewed words.
 *
 * A `short` story is the only form long enough to need more than one
 * translation batch, which is what makes a genuinely partial translation —
 * some sentences translated, some not — reachable at all.
 */
export const LONG_STRICT_STORY = {
  titleJa: '猫の一日',
  sentences: [
    '猫は庭で遊びます。',
    '先生は公園を歩きます。',
    '猫は魚を食べます。',
    '夜に猫は寝ます。',
    '犬は町を走ります。',
    '学生は本を読みます。',
    '友は手紙を書きます。',
    '家族は電車で駅へ行きます。',
    '鳥は空を見ます。',
    '猫は水を飲みます。',
    '学生は店で花を買います。',
    '朝に犬は起きます。',
    '家族は家へ帰ります。',
  ],
} as const;

/** The same story with one word that is not in the snapshot. */
export const STORY_WITH_UNKNOWN = {
  titleJa: '猫の朝',
  sentences: [
    '猫は庭で遊びます。',
    '猫は図書館へ行きます。',
    '猫は魚を食べます。',
    '夜に猫は寝ます。',
  ],
} as const;

/** Scripts AnkiConnect with one reviewed note per expression. */
export async function stubReviewedCollection(page: Page): Promise<void> {
  await stubAnkiConnect(page, {
    version: 6,
    requestPermission: { permission: 'granted', requireApiKey: false, version: 6 },
    deckNames: ['Core Japanese'],
    modelNames: ['Basic'],
    modelFieldNames: ['Expression', 'Meaning'],
    findCards: REVIEWED_EXPRESSIONS.map((_expression, index) => index + 1),
    cardsInfo: REVIEWED_EXPRESSIONS.map((_expression, index) => ({
      cardId: index + 1,
      note: 1_000 + index,
      reps: 3,
      deckName: 'Core Japanese',
    })),
    notesInfo: REVIEWED_EXPRESSIONS.map((expression, index) => ({
      noteId: 1_000 + index,
      modelName: 'Basic',
      fields: {
        Expression: { value: expression, order: 0 },
        Meaning: { value: `meaning ${String(index)}`, order: 1 },
      },
    })),
  });
}

/** Saves a key and puts the text model through its real compatibility test. */
export async function configureTextModel(page: Page): Promise<void> {
  await page.goto('/#/settings');
  await saveApiKey(page);
  await page.getByTestId('text-model-input').fill(TEXT_MODEL);
  await page.getByTestId('test-text-model').click();
  await expectReadiness(textModelReadiness(page), 'ready');
}

/**
 * Configures and tests a speech model and voice.
 *
 * Nothing may be synthesized until the exact saved configuration has passed its
 * own test (`ai-pipelines.md` section 11 step 1), so every audio journey starts
 * here rather than by writing a settings row.
 */
export async function configureTts(page: Page): Promise<void> {
  await page.goto('/#/settings');
  await page.getByTestId('tts-model-input').fill(TTS_MODEL);
  await page.getByTestId('tts-voice-input').fill(TTS_VOICE);
  await page.getByTestId('test-tts').click();
  await expectReadiness(ttsReadiness(page), 'ready');
}

/** Builds a real snapshot from the scripted collection. */
export async function buildSnapshot(page: Page): Promise<void> {
  await page.goto('/#/vocabulary');
  await page.getByRole('button', { name: 'Test AnkiConnect access' }).click();
  await expect(page.getByTestId('add-mapping')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('add-mapping').click();
  await page.getByTestId('start-refresh').click();
  await expect(page.getByTestId('confirm-refresh')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('confirm-refresh').click();
  await expect(page.getByTestId('snapshot-history')).toContainText('Active', { timeout: 60_000 });
}

/** Everything a story needs, in the order a learner would set it up. */
export async function prepareGeneration(page: Page, options: StubOptions): Promise<void> {
  await stubOpenRouter(page, options);
  await stubReviewedCollection(page);
  await configureTextModel(page);
  await buildSnapshot(page);
}

export async function openGenerate(page: Page): Promise<void> {
  await page.goto('/#/generate');
  await expect(page.getByRole('heading', { name: 'Write with AI', level: 1 })).toBeVisible();
}
