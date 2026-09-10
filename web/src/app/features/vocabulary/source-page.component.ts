import { Dialog } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ManualSourceSyncStore } from '../../application/vocabulary/manual-source-sync.store';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { SourceStandingStore } from '../../application/vocabulary/source-standing.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { VocabularySyncService } from '../../application/vocabulary/vocabulary-sync.service';
import { ANKI_PROVIDER_FACTORY } from '../../application/shared/anki-tokens';
import { CLOCK } from '../../application/shared/repository-tokens';
import type { StaleReason } from '../../domain/anki/mapping-validation';
import type { VocabularySourceId } from '../../domain/shared/ids';
import { vocabularySourceId } from '../../domain/shared/ids';
import {
  formatCount,
  formatDate,
  formatList,
  formatRelativeDay,
  startSentence,
} from '../../domain/shared/locale';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import { describeSourceRemoval } from '../../domain/vocabulary/source-removal';
import type {
  AnkiVocabularySource,
  TextListVocabularySource,
  VocabularySource,
} from '../../domain/vocabulary/vocabulary-source';
import { isIncludedInVocabulary } from '../../domain/vocabulary/vocabulary-source';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { PackageImportComponent } from './package-import.component';
import { TextListSourceComponent } from './text-list-source.component';

const STALE_REASONS: Record<StaleReason, string> = {
  'deck-missing': 'That deck is no longer in your collection.',
  'note-type-missing': 'That note type is no longer in your collection.',
  'field-missing': 'That field is no longer part of the note type.',
};

/**
 * One page per source, ordered by how often a setting is touched.
 *
 * Whether the source counts comes first, because it is the only control here
 * that changes the vocabulary the moment it is flipped. How fresh it is comes
 * second, and only where freshness is a question the source can answer — a file
 * does not show a disabled refresh, it says what it does instead. What the
 * source reads is a disclosure that states its own answer, because it is right
 * nine times in ten. Removing it is last, after a rule, and names what is lost.
 */
@Component({
  selector: 'mn-source-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Page-scoped, so leaving discards any connection this page opened.
  providers: [VocabularyRefreshStore, PackageImportStore],
  imports: [
    FormsModule,
    IconComponent,
    PageHeaderComponent,
    PackageImportComponent,
    TextListSourceComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header
        [heading]="heading()"
        backTo="/reading-level"
        backLabel="Back to words"
        [help]="true"
      />

      <p class="mn-visually-hidden" role="status" aria-live="polite">{{ announcement() }}</p>

      @if (source(); as source) {
        <section class="mn-panel" [attr.aria-label]="source.label">
          <p class="mn-hint" data-testid="source-summary">{{ summary(source) }}</p>

          @if (attention(); as message) {
            <p class="flag" role="status" data-testid="source-attention">
              <span>{{ message }}</span>
              @if (source.kind === 'anki-connect') {
                <button
                  type="button"
                  class="mn-button"
                  [disabled]="manual.isSyncing()"
                  (click)="syncNow(source)"
                >
                  Try now
                </button>
              }
            </p>
          }

          <label class="setting">
            <span class="label">
              <strong>Count these words</strong>
              <span class="mn-hint">Monosai writes using them.</span>
            </span>
            <input
              type="checkbox"
              class="mn-switch"
              role="switch"
              [checked]="included(source)"
              [disabled]="busy()"
              (change)="setIncluded(source.id, $event)"
              data-testid="include-source"
            />
          </label>

          <div class="rule"></div>

          @if (source.kind === 'anki-connect') {
            <label class="setting">
              <span class="label">
                <strong>Keep it up to date</strong>
                <span class="mn-hint">Re-reads Anki while Monosai is open.</span>
              </span>
              <input
                type="checkbox"
                class="mn-switch"
                role="switch"
                [checked]="source.automaticSync"
                [disabled]="busy()"
                (change)="setAutomaticSync(source.id, $event)"
                data-testid="automatic-sync"
              />
            </label>
            <div class="footline">
              @if (manual.isSyncingSource(source.id)) {
                <span class="mn-hint">Reading…</span>
                <button type="button" class="mn-button" (click)="manual.cancel()">Cancel</button>
              } @else {
                <button
                  type="button"
                  class="mn-button"
                  [disabled]="busy()"
                  (click)="syncNow(source)"
                  data-testid="sync-now"
                >
                  Refresh now
                </button>
                <span class="mn-hint">{{ lastReadLine(source.id) }}</span>
              }
            </div>
          } @else if (source.kind === 'anki-package') {
            <div class="footline">
              <span class="label">
                <strong>A file never changes</strong>
                <span class="mn-hint">Import a newer export to replace these words.</span>
              </span>
              <button
                type="button"
                class="mn-button"
                [disabled]="packageBusy()"
                (click)="packageInput.click()"
                data-testid="replace-package"
              >
                Replace…
              </button>
            </div>
            <input
              #packageInput
              class="file-input"
              type="file"
              aria-label="Choose a replacement Anki package"
              aria-hidden="true"
              tabindex="-1"
              accept=".apkg,.colpkg"
              [disabled]="packageBusy()"
              (change)="replacePackage($event)"
              data-testid="package-input"
            />
            <mn-package-import />
          } @else {
            <div class="footline">
              <span class="label">
                <strong>Your own words</strong>
              </span>
              <button
                type="button"
                class="mn-button"
                [disabled]="editing()"
                (click)="editing.set(true)"
                data-testid="edit-text-list"
              >
                Edit list
              </button>
            </div>
            @if (editing() && source.kind === 'text-list') {
              <mn-text-list-source
                [source]="textList(source)"
                (saved)="finishEdit()"
                (cancelled)="editing.set(false)"
              />
            }
          }

          <div class="rule"></div>

          @if (source.kind !== 'text-list') {
            <details class="mn-disclosure" (toggle)="onMappingToggle($event, source)">
              <summary>
                <span class="summary-label">{{ mappingSummary(source) }}</span>
              </summary>
              @if (source.kind === 'anki-package') {
                <p class="mn-hint fold">
                  A file's mapping is fixed at import. Replace it with a fresh export to read a
                  different field.
                </p>
              } @else if (configurable(source)) {
                <div class="fieldgrid">
                  <label class="mn-field">
                    <span>Deck</span>
                    <select
                      aria-label="Deck"
                      [disabled]="refresh.isBusy()"
                      [ngModel]="source.deckName"
                      (change)="setDeck(source, $event)"
                    >
                      @for (deck of deckNames(); track deck) {
                        <option [value]="deck">{{ deck }}</option>
                      }
                    </select>
                  </label>
                  <label class="mn-field">
                    <span>Note type</span>
                    <select
                      aria-label="Note type"
                      [disabled]="refresh.isBusy()"
                      [ngModel]="source.noteTypeName"
                      (change)="setNoteType(source, $event)"
                    >
                      @for (noteType of noteTypeNames(); track noteType) {
                        <option [value]="noteType">{{ noteType }}</option>
                      }
                    </select>
                  </label>
                  <label class="mn-field">
                    <span>Field</span>
                    <select
                      aria-label="Expression field"
                      [disabled]="refresh.isBusy()"
                      [ngModel]="source.expressionFieldName"
                      (change)="setField(source, $event)"
                    >
                      @for (field of fieldsFor(source.noteTypeName); track field) {
                        <option [value]="field">{{ field }}</option>
                      }
                    </select>
                  </label>
                  <label class="mn-field">
                    <span>Meaning</span>
                    <select
                      class="mn-control"
                      aria-label="Meaning field"
                      [disabled]="refresh.isBusy()"
                      [ngModel]="source.meaningFieldName ?? ''"
                      (change)="setMeaningField(source, $event)"
                    >
                      <option value="">Not mapped</option>
                      @for (field of fieldsFor(source.noteTypeName); track field) {
                        <option [value]="field">{{ field }}</option>
                      }
                    </select>
                  </label>
                </div>
                @if (hasChildren(source.deckName)) {
                  <label class="check">
                    <input
                      type="checkbox"
                      [disabled]="refresh.isBusy()"
                      [checked]="source.deckScope === 'deck-and-subdecks'"
                      (change)="setScope(source, $event)"
                    />
                    <span>Include the subdecks</span>
                  </label>
                }
              } @else {
                <p class="mn-hint fold" role="status">
                  {{
                    refresh.isBusy()
                      ? 'Asking Anki what it has…'
                      : 'Anki has to be answering before these can be changed.'
                  }}
                </p>
              }
            </details>

            @if (staleReason(source); as reason) {
              <p class="stale" role="alert" data-testid="source-stale">
                {{ staleMessage(reason) }} Add this source again to repair it.
              </p>
            }

            <div class="rule"></div>
          }

          @if (changeError(); as error) {
            <p class="stale" role="alert">{{ error }}</p>
          }

          <div class="footline">
            <button
              type="button"
              class="mn-button mn-button--danger"
              [disabled]="busy()"
              (click)="confirmRemove(source)"
              [attr.aria-label]="'Remove ' + source.label"
              data-testid="remove-source"
            >
              <mn-icon name="delete" /> Remove source
            </button>
          </div>
        </section>
      } @else if (store.loaded()) {
        <section class="mn-panel">
          <p>This source is no longer here.</p>
        </section>
      }
    </div>
  `,
  styles: `
    .setting {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
      cursor: pointer;
    }

    .label {
      display: grid;
      gap: 1px;
      min-width: 0;
    }

    .label strong {
      font-weight: 600;
    }

    /* A rule, not decoration: it is what stops two settings reading as one. */
    .rule {
      height: 1px;
      background: var(--border-subtle);
    }

    .footline {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
      justify-content: space-between;
    }

    .fieldgrid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: var(--space-3);
      margin-top: var(--space-3);
    }

    .fold {
      margin: var(--space-2) 0 0;
    }

    .check {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      font-size: var(--text-sm);
    }

    .flag {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
      justify-content: space-between;
      margin: 0;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
      background: var(--status-warning-soft);
      color: var(--status-warning);
      font-size: var(--text-sm);
    }

    .flag .mn-button {
      min-height: var(--touch-target);
      padding: 0 var(--space-3);
      border-color: currentcolor;
      color: inherit;
    }

    .stale {
      margin: 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }

    .file-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
  `,
})
export class SourcePageComponent {
  protected readonly store = inject(SourceMappingStore);
  protected readonly refresh = inject(VocabularyRefreshStore);
  protected readonly manual = inject(ManualSourceSyncStore);
  private readonly standings = inject(SourceStandingStore);
  private readonly packageImport = inject(PackageImportStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly clock = inject(CLOCK);
  private readonly createConnection = inject(ANKI_PROVIDER_FACTORY);
  protected readonly formatDate = formatDate;

  /** The route parameter, bound as an input by the router. */
  readonly sourceId = input.required<string>();

  protected readonly editing = signal(false);
  protected readonly changeError = signal<string | null>(null);
  private readonly localAnnouncement = signal('');

  protected readonly source = computed<VocabularySource | null>(() => {
    const id = vocabularySourceId(this.sourceId());
    return this.store.sources().find((candidate) => candidate.id === id) ?? null;
  });

  protected readonly heading = computed(() => this.source()?.label ?? 'Source');

  protected readonly announcement = computed(() =>
    this.manual.state().kind === 'idle' ? this.localAnnouncement() : this.manual.announcement(),
  );

  protected readonly packageBusy = this.packageImport.isActive;

  protected readonly busy = computed(() => this.refresh.isBusy() || this.manual.isSyncing());

  protected readonly deckNames = computed(
    () => this.refresh.catalog()?.decks.map((deck) => deck.name) ?? [],
  );
  protected readonly noteTypeNames = computed(
    () => this.refresh.catalog()?.noteTypes.map((noteType) => noteType.name) ?? [],
  );
  private readonly staleById = computed(
    () =>
      new Map(
        (this.refresh.resolution()?.stale ?? []).map((entry) => [entry.mapping.id, entry.reason]),
      ),
  );

  /** The one line a failed read gets, beside the control that would retry it. */
  protected readonly attention = computed(() => {
    const source = this.source();
    if (source === null) {
      return null;
    }
    const failure = this.manual.failureFor(source.id);
    return failure === null ? null : `${failure.message} Your previous vocabulary is unchanged.`;
  });

  constructor() {
    void this.store.load().then(() => this.loadStandings());
    void this.history.load();

    // A package import commits on its own, so what the page shows is reloaded
    // the same way a manual read's result is.
    effect(() => {
      if (this.packageImport.state().kind === 'complete') {
        void this.reload();
      }
    });
  }

  protected included(source: VocabularySource): boolean {
    return isIncludedInVocabulary(source);
  }

  protected textList(source: VocabularySource): TextListVocabularySource | null {
    return source.kind === 'text-list' ? source : null;
  }

  protected summary(source: VocabularySource): string {
    const standing = this.standings.standingFor(source.id);
    const words = standing === null ? 'not read yet' : `${formatCount(standing.entryCount)} words`;
    return `${this.origin(source)} · ${words}`;
  }

  private origin(source: VocabularySource): string {
    switch (source.kind) {
      case 'anki-connect':
        return source.providerKind === 'android-connect'
          ? 'Anki on this device'
          : 'Anki on this computer';
      case 'anki-package':
        return `From a file, imported ${formatDate(source.createdAt)}`;
      case 'text-list':
        return 'A list you typed';
    }
  }

  protected lastReadLine(id: VocabularySourceId): string {
    const standing = this.standings.standingFor(id);
    return standing === null
      ? 'Not read yet'
      : `Last read ${formatRelativeDay(standing.readAt, this.clock.now())}`;
  }

  /** A closed disclosure answers the question its label asks. */
  protected mappingSummary(source: VocabularySource): string {
    if (source.kind === 'text-list') {
      return '';
    }
    return `Reading the ${source.expressionFieldName} field of ${source.noteTypeName}; meaning ${source.meaningFieldName ?? 'not mapped'}`;
  }

  /** Whether the mapping controls have a live catalog to offer values from. */
  protected configurable(source: VocabularySource): boolean {
    return (
      source.kind !== 'text-list' &&
      this.refresh.providerKind() === source.providerKind &&
      this.refresh.mappingEditorEnabled()
    );
  }

  protected staleReason(source: VocabularySource): StaleReason | null {
    return source.kind === 'text-list' ? null : (this.staleById().get(source.id) ?? null);
  }

  protected staleMessage(reason: StaleReason): string {
    return STALE_REASONS[reason];
  }

  protected fieldsFor(noteTypeName: string): readonly string[] {
    return (
      this.refresh.catalog()?.noteTypes.find((noteType) => noteType.name === noteTypeName)
        ?.fieldNames ?? []
    );
  }

  protected hasChildren(deckName: string): boolean {
    return (
      this.refresh.catalog()?.decks.find((deck) => deck.name === deckName)?.hasChildren === true
    );
  }

  /**
   * Opens the connection the mapping controls need, and only then.
   *
   * The fold is closed nine times out of ten because its summary already
   * answers the question; connecting on arrival would ask Anki for a catalog
   * nobody was going to look at.
   */
  protected async onMappingToggle(event: Event, source: VocabularySource): Promise<void> {
    const open = (event.target as HTMLDetailsElement).open;
    if (!open || source.kind !== 'anki-connect' || this.configurable(source)) {
      return;
    }
    await this.refresh.connect(
      this.createConnection(
        source.providerKind === 'android-connect' ? 'android-connect' : 'desktop-connect',
      ),
    );
  }

  protected async setDeck(source: SourceMapping, event: Event): Promise<void> {
    await this.store.update(source.id, { deckName: readValue(event) });
    await this.applyConnectedSourceChange();
  }

  protected async setNoteType(source: SourceMapping, event: Event): Promise<void> {
    const noteTypeName = readValue(event);
    const fields = this.fieldsFor(noteTypeName);
    await this.store.update(source.id, {
      noteTypeName,
      expressionFieldName: fields.includes(source.expressionFieldName)
        ? source.expressionFieldName
        : (fields[0] ?? ''),
      meaningFieldName:
        source.meaningFieldName !== undefined && fields.includes(source.meaningFieldName)
          ? source.meaningFieldName
          : undefined,
    });
    await this.applyConnectedSourceChange();
  }

  protected async setField(source: SourceMapping, event: Event): Promise<void> {
    await this.store.update(source.id, { expressionFieldName: readValue(event) });
    await this.applyConnectedSourceChange();
  }

  protected async setMeaningField(source: SourceMapping, event: Event): Promise<void> {
    const meaningFieldName = readValue(event);
    await this.store.update(source.id, {
      meaningFieldName: meaningFieldName === '' ? undefined : meaningFieldName,
    });
    await this.applyConnectedSourceChange();
  }

  protected async setScope(source: SourceMapping, event: Event): Promise<void> {
    await this.store.update(source.id, {
      deckScope: readChecked(event) ? 'deck-and-subdecks' : 'deck-only',
    });
    await this.applyConnectedSourceChange();
  }

  protected async setIncluded(id: VocabularySourceId, event: Event): Promise<void> {
    const included = readChecked(event);
    await this.store.setIncluded(id, included);
    await this.rebuildAfterSourceChange(
      included
        ? 'These words are counted again.'
        : 'These words are no longer counted. The source stays, and its words come back when you count it again.',
    );
  }

  protected async setAutomaticSync(id: VocabularySourceId, event: Event): Promise<void> {
    const automatic = readChecked(event);
    await this.store.setAutomaticSync(id, automatic);
    this.localAnnouncement.set(
      automatic
        ? 'Monosai will read this source on its own.'
        : 'Monosai will not read this source on its own. Its words stay in your vocabulary.',
    );
  }

  protected async syncNow(source: AnkiVocabularySource): Promise<void> {
    await this.manual.syncNow(source);
    if (this.manual.state().kind === 'complete') {
      await this.reload();
    }
  }

  protected async replacePackage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file === null || file === undefined) {
      return;
    }
    // Cleared so choosing the same file twice in a row still raises `change`.
    input.value = '';
    await this.packageImport.start({ fileName: file.name, bytes: () => file.arrayBuffer() });
  }

  protected finishEdit(): void {
    this.editing.set(false);
    void this.reload();
  }

  /**
   * Asks before removing a source, naming what goes with it.
   *
   * Removing is the one action here that cannot be undone: the stored read goes
   * with the source, and rebuilding it means adding the source again. The
   * dialog opens with the safe answer focused, so the press that opened it
   * cannot carry through into confirming it.
   */
  protected async confirmRemove(source: VocabularySource): Promise<void> {
    const plan = describeSourceRemoval(source, {
      sources: this.store.sources(),
      storyCount: this.history.activeEntry()?.storyCount ?? 0,
    });
    const confirmed = await openConfirmDialog(this.dialog, {
      title: plan.title,
      message: 'This cannot be undone. It permanently removes:',
      details: plan.removes,
      footnote: `${startSentence(formatList(plan.preserves))} are not affected. To keep the source but leave its words out, turn off "Count these words" instead.`,
      confirmLabel: 'Remove permanently',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    await this.store.remove(source.id);
    const rebuilt = await this.sync.rebuild();
    if (!rebuilt.ok) {
      this.changeError.set(`${rebuilt.error.message} The previous vocabulary is unchanged.`);
      return;
    }
    await this.reload();
    await this.router.navigate(['/reading-level'], { fragment: 'words' });
  }

  private async applyConnectedSourceChange(): Promise<void> {
    await this.refresh.refreshAndCommit();
    if (this.refresh.state().kind === 'complete') {
      this.changeError.set(null);
      this.localAnnouncement.set('Updated what this source reads.');
      await this.reload();
    }
  }

  private async rebuildAfterSourceChange(successMessage: string): Promise<void> {
    const rebuilt = await this.sync.rebuild();
    if (!rebuilt.ok) {
      this.changeError.set(`${rebuilt.error.message} The previous vocabulary is unchanged.`);
      return;
    }
    this.changeError.set(null);
    this.localAnnouncement.set(successMessage);
    await this.reload();
  }

  private async reload(): Promise<void> {
    await this.history.load();
    await this.loadStandings();
  }

  private async loadStandings(): Promise<void> {
    await this.standings.load(this.store.sources().map((source) => source.id));
  }
}

function readValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function readChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}
