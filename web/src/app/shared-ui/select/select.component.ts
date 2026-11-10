import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DropdownComponent } from '../dropdown/dropdown.component';
import { IconComponent } from '../icon/icon.component';

/** What a choice is made of: the value it stands for, and the words that name it. */
export type SelectValue = string | number;

export interface SelectOption<T extends SelectValue = SelectValue> {
  readonly value: T;
  readonly label: string;
  /** One muted line under the label that says what choosing it does. */
  readonly description?: string;
  readonly disabled?: boolean;
}

/** Options that are just their own names, behind an optional first option such as "Not mapped". */
export function optionsFromNames(
  names: readonly string[],
  first?: SelectOption<string>,
): readonly SelectOption<string>[] {
  return [
    ...(first === undefined ? [] : [first]),
    ...names.map((name) => ({ value: name, label: name })),
  ];
}

let nextSelectId = 0;

/** How long a pause ends a typed prefix, so the next letter starts a new one. */
const TYPE_AHEAD_RESET_MS = 600;

/**
 * Every choice of one value from a short list. It is the app's own select: the
 * field is the one the model picker's trigger is, and the list is the app's one
 * dropdown (`mn-dropdown`), hung under the field on every screen size. Native
 * selects are not used, because their popup is the platform's and matches
 * nothing else in the app.
 *
 *   <mn-select label="Voice" labelledBy="voice-label" [options]="voices" [(value)]="voice" />
 *
 * It is also a form control, so `[(ngModel)]` and reactive forms work, and it
 * emits the option's own value, so a number stays a number.
 *
 * It follows the select-only combobox pattern: the field is the combobox and
 * the list a listbox of options. Enter, Space, or an arrow opens it; the arrow
 * keys, Home, End, and typing move through the options; Enter or Space chooses;
 * Escape closes it and focus returns to the field.
 */
@Component({
  selector: 'mn-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DropdownComponent, IconComponent],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true },
  ],
  template: `
    <button
      type="button"
      class="mn-control mn-control--select trigger"
      role="combobox"
      aria-haspopup="listbox"
      [class.trigger--unset]="selected() === null"
      [attr.aria-label]="labelledBy() === null ? label() : null"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-expanded]="panel.isOpen()"
      [attr.aria-controls]="listId"
      [attr.popovertarget]="panel.id"
      [attr.data-testid]="testId()"
      [disabled]="isDisabled()"
      (keydown)="onTriggerKeydown($event)"
    >
      {{ shown() }}
    </button>
    <mn-icon class="mn-select-caret" name="chevron-down" [size]="18" />

    <mn-dropdown
      #panel="mnDropdown"
      [label]="title()"
      (opened)="onOpened()"
      (closed)="onClosed()"
      (click)="keepFromLabel($event)"
    >
      <div
        class="list"
        role="listbox"
        tabindex="0"
        data-overlay-focus
        [id]="listId"
        [attr.aria-label]="labelledBy() === null ? label() || null : null"
        [attr.aria-labelledby]="labelledBy()"
        [attr.aria-activedescendant]="activeId()"
        (keydown)="onListKeydown($event)"
      >
        @for (option of options(); track option.value; let index = $index) {
          <!--
            An option is never in the tab order: focus stays on the listbox, which
            names the active option, and its keys choose. The click is the pointer's.
          -->
          <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
          <div
            class="mn-dropdown-row"
            role="option"
            [id]="optionId(index)"
            [class.is-active]="index === active()"
            [attr.aria-selected]="index === selectedIndex()"
            [attr.aria-disabled]="option.disabled === true ? 'true' : null"
            [attr.data-value]="option.value"
            (click)="choose(index)"
          >
            <span class="mn-dropdown-row__words">
              <span class="mn-dropdown-row__label">{{ option.label }}</span>
              @if (option.description) {
                <small class="mn-dropdown-row__description">{{ option.description }}</small>
              }
            </span>
            @if (index === selectedIndex()) {
              <mn-icon class="mn-dropdown-row__check" name="check" [size]="18" tone="accent" />
            }
          </div>
        }
      </div>
    </mn-dropdown>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      min-width: 0;
    }

    /*
     * The field is the model picker's trigger: the same border, height, radius,
     * and chevron, with the value cut at the field's edge.
     */
    .trigger {
      display: block;
      overflow: hidden;
      text-align: start;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    /* Nothing chosen is not a choice; it should not read as one. */
    .trigger--unset {
      color: var(--text-secondary);
    }

    /* On a line of its own, a long value wraps rather than being cut. */
    @container (max-width: 16em) {
      .trigger {
        overflow-wrap: anywhere;
        white-space: normal;
      }
    }

    /* The listbox holds the keys; the row they are on wears the ring. */
    .list {
      display: flex;
      flex-direction: column;
      min-height: var(--touch-target);
      outline: none;
    }
  `,
})
export class SelectComponent implements ControlValueAccessor {
  /** What is being chosen: the field's name when no label names it, and the list's. */
  readonly label = input('');
  /** The id of the visible label that names the field, as a settings row gives it. */
  readonly labelledBy = input<string | null>(null);
  readonly options = input.required<readonly SelectOption[]>();
  readonly value = input<SelectValue | null>('');
  /** What the field says while no option matches the value. */
  readonly placeholder = input('Choose');
  readonly disabled = input(false);
  /** For durable tests: on the field. */
  readonly testId = input<string | null>(null);
  /** The learner chose an option; the value is the option's own, string or number. */
  readonly valueChange = output<SelectValue>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly instance = nextSelectId++;
  private readonly panel = viewChild.required<DropdownComponent>('panel');
  protected readonly listId = `mn-select-${String(this.instance)}-list`;
  protected readonly title = computed(() => this.label() || 'Choose');

  /** The value in force: what was given, until the learner or a form changes it. */
  private readonly current = linkedSignal<SelectValue | null>(() => this.value());
  protected readonly selectedIndex = computed(() =>
    this.options().findIndex((option) => option.value === this.current()),
  );
  protected readonly selected = computed(() => this.options()[this.selectedIndex()] ?? null);
  protected readonly shown = computed(() => this.selected()?.label ?? this.placeholder());
  /** The option the arrow keys are on while the list is open. */
  protected readonly active = signal(-1);
  protected readonly activeId = computed(() =>
    this.active() < 0 ? null : this.optionId(this.active()),
  );

  private typed = '';
  private typedAt = 0;
  private onChange: (value: SelectValue) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  protected optionId(index: number): string {
    return `mn-select-${String(this.instance)}-option-${String(index)}`;
  }

  writeValue(value: SelectValue | null): void {
    this.current.set(value);
  }
  registerOnChange(fn: (value: SelectValue) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  /**
   * A select inside a `<label>` lives in it, popup included: a press on an option
   * would otherwise be taken as a press on the label and press the field again.
   */
  protected keepFromLabel(event: Event): void {
    event.preventDefault();
  }

  protected onOpened(): void {
    const selected = this.selectedIndex();
    this.move(selected >= 0 && !this.optionDisabled(selected) ? selected : this.next(-1, 1));
  }

  protected onClosed(): void {
    this.active.set(-1);
    this.onTouched();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !this.panel().isOpen()) {
      event.preventDefault();
      this.panel().show();
    }
  }

  protected onListKeydown(event: KeyboardEvent): void {
    const from = this.active();
    switch (event.key) {
      case 'ArrowDown':
        this.move(this.next(from, 1));
        break;
      case 'ArrowUp':
        this.move(this.next(from, -1));
        break;
      case 'Home':
        this.move(this.next(-1, 1));
        break;
      case 'End':
        this.move(this.next(this.options().length, -1));
        break;
      case 'Enter':
      case ' ':
        this.choose(from);
        break;
      case 'Escape':
        // Closing this must not also close a dialog the select sits in.
        event.stopPropagation();
        this.panel().hide();
        break;
      case 'Tab':
        this.panel().hide();
        return;
      default:
        if (!this.typeAhead(event)) {
          return;
        }
    }
    event.preventDefault();
  }

  protected choose(index: number): void {
    const option = this.options()[index];
    if (option === undefined || option.disabled === true) {
      return;
    }
    this.current.set(option.value);
    this.onChange(option.value);
    this.valueChange.emit(option.value);
    this.panel().hide();
  }

  /** The next enabled option after `from` in `direction`, or -1 when there is none. */
  private next(from: number, direction: 1 | -1): number {
    const count = this.options().length;
    for (let index = from + direction; index >= 0 && index < count; index += direction) {
      if (!this.optionDisabled(index)) {
        return index;
      }
    }
    return -1;
  }

  private optionDisabled(index: number): boolean {
    return this.options()[index]?.disabled === true;
  }

  private move(index: number): void {
    if (index < 0 || index >= this.options().length) {
      return;
    }
    this.active.set(index);
    // Not every environment lays out (a test DOM has no scrolling to do).
    const row: Partial<HTMLElement> | null = this.host.nativeElement.querySelector<HTMLElement>(
      `#${this.optionId(index)}`,
    );
    row?.scrollIntoView?.({ block: 'nearest' });
  }

  /** A printable key moves to the next option whose label starts with what was typed. */
  private typeAhead(event: KeyboardEvent): boolean {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const now = Date.now();
    this.typed = now - this.typedAt > TYPE_AHEAD_RESET_MS ? event.key : this.typed + event.key;
    this.typedAt = now;
    const prefix = this.typed.toLocaleLowerCase();
    const options = this.options();
    // The same letter pressed again walks the options that begin with it.
    const first = prefix.charAt(0);
    const repeated = prefix.replaceAll(first, '') === '';
    const needle = repeated ? first : prefix;
    const start = this.active() + (repeated || options.length === 0 ? 1 : 0);
    for (let offset = 0; offset < options.length; offset++) {
      const index = (start + offset) % options.length;
      const option = options[index];
      if (
        option !== undefined &&
        option.disabled !== true &&
        option.label.toLocaleLowerCase().startsWith(needle)
      ) {
        this.move(index);
        break;
      }
    }
    return true;
  }
}
