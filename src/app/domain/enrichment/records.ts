import type { AssetId, ReadingId, SentenceId } from '../shared/ids';

export interface TranslationRecord {
  readonly id: string;
  readonly sentenceId: SentenceId;
  readonly readingId: ReadingId;
  readonly sourceContentHash: string;
  readonly textEn: string;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly cacheKey: string;
  readonly createdAt: number;
}

export type FindingConfidence = 'low' | 'medium' | 'high';

export interface GrammarFinding {
  readonly label: string;
  readonly explanationEn: string;
  readonly confidence: FindingConfidence;
  readonly inProfile: boolean;
  readonly startUtf16?: number;
  readonly endUtf16?: number;
}

export interface GrammarAnalysisRecord {
  readonly id: string;
  readonly sentenceId: SentenceId;
  readonly readingId: ReadingId;
  readonly sourceContentHash: string;
  readonly profileHash: string;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly findings: readonly GrammarFinding[];
  readonly cacheKey: string;
  readonly createdAt: number;
}

export type AudioMimeType = 'audio/mpeg' | 'audio/pcm';

export interface AudioAsset {
  readonly id: AssetId;
  readonly sentenceId: SentenceId;
  readonly readingId: ReadingId;
  readonly sourceContentHash: string;
  readonly modelId: string;
  readonly voiceId: string;
  readonly optionsFingerprint: string;
  readonly mimeType: AudioMimeType;
  readonly byteLength: number;
  readonly blob: Blob;
  readonly cacheKey: string;
  readonly createdAt: number;
}

/** Audio metadata for list and summary queries; never loads the blob. */
export type AudioAssetSummary = Omit<AudioAsset, 'blob'>;
