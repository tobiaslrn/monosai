import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ImportStore } from '../../application/reading/import.store';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import { MAXIMUM_IMPORT_CHARACTERS } from '../../domain/reading/import-text';
import { MAXIMUM_TITLE_LENGTH } from '../../domain/reading/import-title';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';

/**
 * The pasted-text field of Add text, with its title and its character counter.
 *
 * It was once step 1 of a stepper and still carried that shape's `tabpanel`
 * role, with no tablist and no tab anywhere on the page: a screen reader
 * announced "tab panel" over a plain form field and offered a tab to move to
 * that did not exist. Add text is one form, and this is one field group in it.
 */
@Component({
  selector: 'mn-text-input-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, NoticeComponent],
  template: `
    <div class="mn-field">
      <label for="mn-import-text">Japanese text</label>
      <textarea
        id="mn-import-text"
        [rows]="editorRows()"
        lang="ja"
        required
        [attr.aria-invalid]="store.rejection() !== null || isOverLimit() ? 'true' : null"
        [attr.aria-describedby]="descriptionIds()"
        [value]="store.rawText()"
        (input)="onPaste($event)"
      ></textarea>
      @if (isOverLimit()) {
        <!-- Over the limit, the count and what to do about it are one message. -->
        <p id="mn-import-count" class="mn-field-error" role="alert">
          <mn-icon name="warning" [size]="16" />
          <span>{{ overLimitMessage() }}</span>
        </p>
      } @else if (counterVisible()) {
        <p id="mn-import-count" class="mn-hint">
          {{ formatCount(store.characterCount()) }} of {{ formatCount(limit) }} characters
        </p>
      }
      @if (store.advisories().length > 0) {
        <mn-notice id="mn-import-advisories" tone="warning" role="status">
          @for (advisory of store.advisories(); track advisory.code) {
            <p>{{ advisory.message }}</p>
          }
        </mn-notice>
      }
    </div>

    @if (store.rejection(); as rejection) {
      <mn-notice tone="error" role="alert">{{ rejection.message }}</mn-notice>
    }

    <div class="mn-field">
      <label for="mn-import-title">Title (optional)</label>
      <input
        id="mn-import-title"
        type="text"
        [attr.maxlength]="maximumTitleLength"
        [value]="store.titleInput()"
        [attr.placeholder]="store.derivedTitle()"
        (input)="onTitle($event)"
      />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    textarea {
      width: 100%;
      font: inherit;
      font-family: var(--font-japanese);
      font-size: var(--text-lg);
      line-height: 1.8;
      resize: vertical;
    }
  `,
})
export class TextInputStepComponent {
  protected readonly store = inject(ImportStore);
  protected readonly limit = MAXIMUM_IMPORT_CHARACTERS;
  protected readonly maximumTitleLength = MAXIMUM_TITLE_LENGTH;
  protected readonly formatCount = formatCount;
  protected readonly overLimitMessage = computed(
    () =>
      `${formatCount(this.store.characterCount())} of ${formatCount(this.limit)} characters. ` +
      `Remove ${formatCountOf(this.store.characterCount() - this.limit, 'character')} to continue.`,
  );
  /** Like every counter: out of the way until the field is roughly 80% full. */
  protected readonly counterVisible = computed(
    () => this.store.characterCount() >= Math.ceil(MAXIMUM_IMPORT_CHARACTERS * 0.8),
  );
  protected readonly descriptionIds = computed(() => {
    const ids: string[] = [];
    if (this.counterVisible() || this.isOverLimit()) {
      ids.push('mn-import-count');
    }
    if (this.store.advisories().length > 0) {
      ids.push('mn-import-advisories');
    }
    return ids.length > 0 ? ids.join(' ') : null;
  });
  /** Keep the empty form and its action together; grow once there is real prose to work with. */
  protected readonly editorRows = computed(() => (this.store.characterCount() >= 500 ? 12 : 4));

  protected isOverLimit(): boolean {
    return this.store.characterCount() > MAXIMUM_IMPORT_CHARACTERS;
  }

  protected onPaste(event: Event): void {
    this.store.setPastedText((event.target as HTMLTextAreaElement).value);
  }

  protected onTitle(event: Event): void {
    this.store.setTitle((event.target as HTMLInputElement).value);
  }
}
