import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ImportStore } from '../../application/reading/import.store';
import { formatCount, formatCountOf } from '../../domain/shared/locale';
import { MAXIMUM_IMPORT_CHARACTERS } from '../../domain/reading/import-text';

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
  template: `
    <div class="mn-field">
      <label for="mn-import-text">Japanese text</label>
      <textarea
        id="mn-import-text"
        rows="12"
        lang="ja"
        required
        [attr.aria-invalid]="store.rejection() !== null || isOverLimit() ? 'true' : null"
        [attr.aria-describedby]="descriptionIds()"
        [value]="store.rawText()"
        (input)="onPaste($event)"
      ></textarea>
      <p id="mn-import-count" class="count" [class.is-over]="isOverLimit()">
        {{ formatCount(store.characterCount()) }} of {{ formatCount(limit) }} characters
      </p>
      @if (isOverLimit()) {
        <p id="mn-import-limit-hint" class="limit-hint" role="alert">{{ overLimitMessage() }}</p>
      }
      @if (store.advisories().length > 0) {
        <div id="mn-import-advisories" class="advisories" role="status">
          @for (advisory of store.advisories(); track advisory.code) {
            <p>{{ advisory.message }}</p>
          }
        </div>
      }
    </div>

    @if (store.rejection(); as rejection) {
      <p class="mn-error" role="alert">{{ rejection.message }}</p>
    }

    <div class="mn-field">
      <label for="mn-import-title">Title (optional)</label>
      <input
        id="mn-import-title"
        type="text"
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

    .count {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .count.is-over {
      color: var(--status-danger);
      font-weight: 600;
    }

    .limit-hint {
      margin: calc(var(--space-1) * -1) 0 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }

    .advisories {
      display: grid;
      gap: var(--space-1);
      color: var(--status-warning);
      font-size: var(--text-sm);
    }

    .advisories p {
      margin: 0;
    }

    .mn-error {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class TextInputStepComponent {
  protected readonly store = inject(ImportStore);
  protected readonly limit = MAXIMUM_IMPORT_CHARACTERS;
  protected readonly formatCount = formatCount;
  protected readonly overLimitMessage = computed(
    () =>
      `Remove ${formatCountOf(this.store.characterCount() - this.limit, 'character')} to continue.`,
  );
  protected readonly descriptionIds = computed(() => {
    const ids = ['mn-import-count'];
    if (this.isOverLimit()) {
      ids.push('mn-import-limit-hint');
    }
    if (this.store.advisories().length > 0) {
      ids.push('mn-import-advisories');
    }
    return ids.join(' ');
  });

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
