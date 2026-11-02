import type { Hasher } from '../../domain/shared/hashing';
import { sha256Hex } from './sha256';

/** The application-wide `Hasher` implementation. */
export const sha256Hasher: Hasher = {
  algorithm: 'sha-256',
  hashText: sha256Hex,
};
