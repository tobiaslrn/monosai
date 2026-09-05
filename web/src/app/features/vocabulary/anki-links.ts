/**
 * The five links the vocabulary screens may point at.
 *
 * One rule decides where each of them appears: a link lives beside the thing it
 * unblocks, and nowhere else. There is no help section here and no list of
 * further reading — a source that is working needs no reading material, so a
 * link is a symptom of something the learner cannot do yet.
 *
 * They live together in one table so that rule stays checkable: a link added
 * without a place to live shows up as an unused export.
 */
export const ANKI_LINKS = {
  /** The install standing between a desktop learner and a working connection. */
  ankiConnectAddon: 'https://ankiweb.net/shared/info/2055492159',
  /** The APK that plays the add-on's part on Android. */
  bridgeReleases: 'https://github.com/tobiaslrn/monosai/releases?q=bridge-v',
  /**
   * An app asking for a collection should be inspectable. This is the one link
   * that earns its place on a screen where nothing is broken.
   */
  bridgeSource: 'https://github.com/tobiaslrn/monosai/tree/main/bridge',
  /** iOS has no other route, and package failures already ask for a re-export. */
  ankiExporting: 'https://docs.ankiweb.net/exporting.html',
  /** The doc is keyed by the `anki/*` codes the failure panels print. */
  troubleshooting: 'https://github.com/tobiaslrn/monosai/blob/main/docs/troubleshooting.md',
} as const;
