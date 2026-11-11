import { Dialog } from '@angular/cdk/dialog';
import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  Injector,
  afterNextRender,
  resource,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  LOGGER,
  NOOP_LOGGER,
  reportRejection,
  type Logger,
} from '../../application/shared/diagnostics';
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
  formatCountOf,
  formatDate,
  formatList,
  formatRelativeDay,
  startSentence,
} from '../../domain/shared/locale';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import {
  SelectComponent,
  optionsFromNames,
  type SelectOption,
  type SelectValue,
} from '../../shared-ui/select/select.component';
import { describeSourceRemoval } from '../../domain/vocabulary/source-removal';
import type {
  AnkiVocabularySource,
  TextListVocabularySource,
  VocabularySource,
} from '../../domain/vocabulary/vocabulary-source';
import { isIncludedInVocabulary } from '../../domain/vocabulary/vocabulary-source';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { StatusLineComponent } from '../../shared-ui/status-line/status-line.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { SwitchRowComponent } from '../../shared-ui/switch-row/switch-row.component';
import { PackageImportComponent } from './package-import.component';
import { TextListSourceComponent } from './text-list-source.component';
import { DisclosureComponent } from '../../shared-ui/disclosure/disclosure.component';
import { PageComponent } from '../../shared-ui/layout/layout';

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
    DisclosureComponent,
    PageComponent,
    PageHeaderComponent,
    PackageImportComponent,
    SectionComponent,
    SelectComponent,
    SettingsRowComponent,
    StatusLineComponent,
    SwitchRowComponent,
    TextListSourceComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header [heading]="heading()" backTo="/reading-level" backLabel="Back to words" />

      <p class="mn-visually-hidden" role="status" aria-live="polite">{{ announcement() }}</p>

      @if (source(); as source) {
        <mn-section [label]="source.label" [rows]="true">
          <mn-settings-row label="Source" [value]="origin(source)" />
          <mn-settings-row label="Words" [value]="words(source)" testId="source-summary" />

          <mn-switch-row
            testId="include-source"
            [checked]="included(source)"
            [disabled]="busy()"
            (checkedChange)="setIncluded(source.id, $event)"
          >
            Count these words
          </mn-switch-row>

          @if (source.kind === 'anki-connect') {
            <mn-switch-row
              testId="automatic-sync"
              [checked]="source.automaticSync"
              [disabled]="busy()"
              (checkedChange)="setAutomaticSync(source.id, $event)"
            >
              Keep it up to date
            </mn-switch-row>
            <mn-settings-row
              action="accent"
              glyph="sync"
              label="Refresh now"
              testId="sync-now"
              [summary]="manual.isSyncingSource(source.id) ? 'Reading…' : lastReadLine(source.id)"
              [disabled]="busy() && !manual.isSyncingSource(source.id)"
              [busy]="manual.isSyncingSource(source.id)"
              (pressed)="syncNow(source)"
            />
            @if (manual.isSyncingSource(source.id)) {
              <mn-settings-row action="accent" label="Cancel" (pressed)="manual.cancel()" />
            }
          } @else if (source.kind === 'anki-package') {
            <mn-settings-row
              action="accent"
              label="Replace file"
              testId="replace-package"
              [disabled]="packageBusy()"
              (pressed)="choosePackage()"
            />
          } @else {
            <mn-settings-row
              action="accent"
              label="Edit list"
              testId="edit-text-list"
              [disabled]="editing()"
              (pressed)="editing.set(true)"
            />
          }

          @if (attention(); as message) {
            <mn-status-line mn-section-footer tone="warning" data-testid="source-attention">
              {{ message }}
              @if (source.kind === 'anki-connect') {
                <button
                  mn-status-line-action
                  type="button"
                  [attr.aria-busy]="manual.isSyncing() ? 'true' : null"
                  (click)="syncNow(source)"
                >
                  Try now
                </button>
              }
            </mn-status-line>
          }
        </mn-section>

        @if (source.kind === 'anki-package') {
          <input
            #packageInput
            class="mn-visually-hidden"
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
        }

        @if (editing() && source.kind === 'text-list') {
          <mn-text-list-source
            [source]="textList(source)"
            (saved)="finishEdit()"
            (cancelled)="closeEditor()"
          />
        }

        @if (source.kind === 'anki-package') {
          <mn-section label="What it reads" [rows]="true">
            <mn-settings-row label="What it reads" [summary]="mappingSummary(source)" />
          </mn-section>
        } @else if (source.kind !== 'text-list') {
          <mn-section label="What it reads" [rows]="true">
            <mn-disclosure
              heading="What it reads"
              [value]="mappingSummary(source)"
              (openChange)="onMappingOpen($event, source)"
            >
              @if (configurable(source)) {
                <div class="mn-settings-group mn-settings-bleed">
                  <mn-settings-row label="Deck" labelId="mn-source-map-1-label">
                    <mn-select
                      labelledBy="mn-source-map-1-label"
                      label="Deck"
                      [options]="deckOptions()"
                      [disabled]="refresh.isBusy()"
                      [value]="source.deckName"
                      (valueChange)="setDeck(source, $event)"
                    />
                  </mn-settings-row>
                  <mn-settings-row label="Note type" labelId="mn-source-map-2-label">
                    <mn-select
                      labelledBy="mn-source-map-2-label"
                      label="Note type"
                      [options]="noteTypeOptions()"
                      [disabled]="refresh.isBusy()"
                      [value]="source.noteTypeName"
                      (valueChange)="setNoteType(source, $event)"
                    />
                  </mn-settings-row>
                  <mn-settings-row label="Expression field" labelId="mn-source-map-3-label">
                    <mn-select
                      labelledBy="mn-source-map-3-label"
                      label="Expression field"
                      [options]="fieldOptions(source.noteTypeName)"
                      [disabled]="refresh.isBusy()"
                      [value]="source.expressionFieldName"
                      (valueChange)="setField(source, $event)"
                    />
                  </mn-settings-row>
                  <mn-settings-row label="Meaning field" labelId="mn-source-map-4-label">
                    <mn-select
                      labelledBy="mn-source-map-4-label"
                      label="Meaning field"
                      [options]="meaningOptions(source.noteTypeName)"
                      [disabled]="refresh.isBusy()"
                      [value]="source.meaningFieldName ?? ''"
                      (valueChange)="setMeaningField(source, $event)"
                    />
                  </mn-settings-row>
                  @if (hasChildren(source.deckName)) {
                    <mn-switch-row
                      [disabled]="refresh.isBusy()"
                      [checked]="source.deckScope === 'deck-and-subdecks'"
                      (checkedChange)="setScope(source, $event)"
                    >
                      Include the subdecks
                    </mn-switch-row>
                  }
                </div>
              } @else if (source.kind === 'anki-connect') {
                <p class="mn-hint" role="status">
                  {{
                    refresh.isBusy()
                      ? 'Asking Anki what it has…'
                      : 'Anki has to be answering before these can be changed.'
                  }}
                </p>
              }
            </mn-disclosure>
            @if (staleReason(source); as reason) {
              <mn-status-line mn-section-footer tone="danger" data-testid="source-stale">
                {{ staleMessage(reason) }} Add this source again to repair it.
              </mn-status-line>
            }
          </mn-section>
        }

        <mn-section label="Remove source" [rows]="true">
          <mn-settings-row
            action="danger"
            label="Remove source"
            testId="remove-source"
            [disabled]="busy()"
            (pressed)="confirmRemove(source)"
          />
          @if (changeError(); as error) {
            <mn-status-line mn-section-footer tone="danger">{{ error }}</mn-status-line>
          }
        </mn-section>
      } @else if (store.loaded()) {
        <mn-section label="Source" [rows]="true">
          <mn-settings-row label="This source is no longer here." />
        </mn-section>
      }
    </mn-page>
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
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;
  private readonly router = inject(Router);
  private readonly clock = inject(CLOCK);
  private readonly createConnection = inject(ANKI_PROVIDER_FACTORY);
  protected readonly formatDate = formatDate;

  private readonly packageInput = viewChild<ElementRef<HTMLInputElement>>('packageInput');

  /** The route parameter, bound as an input by the router. */
  readonly sourceId = input.required<string>();

  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
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

  protected readonly deckOptions = computed(() =>
    optionsFromNames(this.refresh.catalog()?.decks.map((deck) => deck.name) ?? []),
  );
  protected readonly noteTypeOptions = computed(() =>
    optionsFromNames(this.refresh.catalog()?.noteTypes.map((noteType) => noteType.name) ?? []),
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

    // A package import commits on its own, outside anything this page awaits,
    // so what the page shows is reloaded the same way a manual read's result
    // is. The completed state is the key, so each import reloads once, and the
    // loader runs untracked.
    resource({
      params: () => {
        const state = this.packageImport.state();
        return state.kind === 'complete' ? state : undefined;
      },
      loader: () =>
        this.reload().catch((error: unknown) => {
          reportRejection(this.logger, error);
        }),
    });
  }

  protected included(source: VocabularySource): boolean {
    return isIncludedInVocabulary(source);
  }

  protected textList(source: VocabularySource): TextListVocabularySource | null {
    return source.kind === 'text-list' ? source : null;
  }

  protected words(source: VocabularySource): string {
    const standing = this.standings.standingFor(source.id);
    return standing === null ? 'Not read yet' : formatCountOf(standing.entryCount, 'word');
  }

  protected origin(source: VocabularySource): string {
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

  /** The row answers the question its label asks, so it is never a fold with the answer inside. */
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

  protected fieldOptions(noteTypeName: string): readonly SelectOption<string>[] {
    return optionsFromNames(this.fieldsFor(noteTypeName));
  }

  protected meaningOptions(noteTypeName: string): readonly SelectOption<string>[] {
    return optionsFromNames(this.fieldsFor(noteTypeName), { value: '', label: 'Not mapped' });
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
  protected async onMappingOpen(open: boolean, source: VocabularySource): Promise<void> {
    if (!open || source.kind !== 'anki-connect' || this.configurable(source)) {
      return;
    }
    await this.refresh.connect(
      this.createConnection(
        source.providerKind === 'android-connect' ? 'android-connect' : 'desktop-connect',
      ),
    );
  }

  protected async setDeck(source: SourceMapping, value: SelectValue): Promise<void> {
    await this.store.update(source.id, { deckName: String(value) });
    await this.applyConnectedSourceChange();
  }

  protected async setNoteType(source: SourceMapping, value: SelectValue): Promise<void> {
    const noteTypeName = String(value);
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

  protected async setField(source: SourceMapping, value: SelectValue): Promise<void> {
    await this.store.update(source.id, { expressionFieldName: String(value) });
    await this.applyConnectedSourceChange();
  }

  protected async setMeaningField(source: SourceMapping, value: SelectValue): Promise<void> {
    const meaningFieldName = String(value);
    await this.store.update(source.id, {
      meaningFieldName: meaningFieldName === '' ? undefined : meaningFieldName,
    });
    await this.applyConnectedSourceChange();
  }

  protected async setScope(source: SourceMapping, includeSubdecks: boolean): Promise<void> {
    await this.store.update(source.id, {
      deckScope: includeSubdecks ? 'deck-and-subdecks' : 'deck-only',
    });
    await this.applyConnectedSourceChange();
  }

  protected async setIncluded(id: VocabularySourceId, included: boolean): Promise<void> {
    await this.store.setIncluded(id, included);
    await this.rebuildAfterSourceChange(
      included
        ? 'These words are counted again.'
        : 'These words are no longer counted. The source stays, and its words come back when you count it again.',
    );
  }

  protected async setAutomaticSync(id: VocabularySourceId, automatic: boolean): Promise<void> {
    await this.store.setAutomaticSync(id, automatic);
    this.localAnnouncement.set(
      automatic
        ? 'Monosai will read this source on its own.'
        : 'Monosai will not read this source on its own. Its words stay in your vocabulary.',
    );
  }

  protected async syncNow(source: AnkiVocabularySource): Promise<void> {
    if (this.manual.isSyncing()) {
      return;
    }
    await this.manual.syncNow(source);
    if (this.manual.state().kind === 'complete') {
      await this.reload();
    }
  }

  protected choosePackage(): void {
    this.packageInput()?.nativeElement.click();
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
    this.closeEditor();
    void this.reload();
  }

  /** The editor and its buttons go away, so focus returns to the control that opened it. */
  protected closeEditor(): void {
    this.editing.set(false);
    afterNextRender(
      () => {
        this.document.querySelector<HTMLElement>('[data-testid="edit-text-list"]')?.focus();
      },
      { injector: this.injector },
    );
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
