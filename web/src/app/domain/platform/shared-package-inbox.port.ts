import { InjectionToken } from '@angular/core';

/** One Anki package handed to Monosai from outside, waiting to be imported. */
export interface SharedPackage {
  readonly fileName: string;
  readonly receivedAt: number;
  bytes(): Promise<ArrayBuffer>;
}

/**
 * Where a package shared into Monosai waits between the service worker
 * receiving it and the Vocabulary screen importing it.
 *
 * Claiming is one-shot: the entry is removed as it is handed over, so a share
 * can never be imported twice, and a reload cannot resurrect one that was
 * already dealt with.
 */
export interface SharedPackageInbox {
  claim(): Promise<SharedPackage | null>;
  /** Drops anything waiting, whether or not it was claimed. */
  clear(): Promise<void>;
}

export const SHARED_PACKAGE_INBOX = new InjectionToken<SharedPackageInbox>(
  'monosai.shared-package-inbox',
);
