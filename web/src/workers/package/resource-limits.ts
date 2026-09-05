/**
 * Bounds on what a package is allowed to make this worker do.
 *
 * An Anki export is a ZIP the learner supplies, so every size in it is
 * attacker-controlled. These limits are what stop a crafted archive from
 * exhausting memory before anything has been parsed; they are deliberately
 * generous compared to real collections — a 1,500-note deck decompresses to
 * about 3.5 MB — so a legitimate package never meets one.
 */
export interface PackageResourceLimits {
  /** Largest archive accepted at all. */
  readonly maxArchiveBytes: number;
  /** Largest central directory, so a huge media collection is still listable. */
  readonly maxEntries: number;
  /** Largest single member this worker will decompress. */
  readonly maxMemberBytes: number;
  /**
   * Largest uncompressed-to-compressed ratio for one member.
   *
   * A SQLite database of mostly text compresses well, so the bar has to sit
   * well above the roughly 3.4x the real collections reach.
   */
  readonly maxCompressionRatio: number;
}

export const DEFAULT_PACKAGE_LIMITS: PackageResourceLimits = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntries: 200_000,
  maxMemberBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 250,
};
