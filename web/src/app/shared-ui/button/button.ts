import { Directive, ElementRef, HostAttributeToken, inject, input } from '@angular/core';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'icon' | 'icon-primary';

/**
 * The one way to draw an action. It stays a native `<button>` or `<a>`, so its
 * semantics, focus, and keyboard behaviour are the platform's; the look comes
 * from the variant.
 *
 *   <button type="button" mnButton="primary">Save</button>
 *   <a mnButton="ghost" routerLink="/help">Help</a>
 *   <button type="button" mnButton="icon" aria-label="More"><mn-icon name="overflow" /></button>
 *
 * A variant written as a plain attribute is drawn from the moment the element
 * exists, not one pass later: a button that first painted unstyled would fade
 * from the browser's grey to its own colour.
 *
 * The silhouettes are defined once in `styles/components/_button.scss`, which
 * the screens not yet built from primitives still use directly.
 */
@Directive({
  selector: 'button[mnButton], a[mnButton]',
  host: {
    '[class.mn-button]': '!isIcon()',
    '[class.mn-button--primary]': "variant() === 'primary'",
    '[class.mn-button--ghost]': "variant() === 'ghost'",
    '[class.mn-button--danger]': "variant() === 'danger'",
    '[class.mn-icon-button]': 'isIcon()',
    '[class.mn-icon-button--primary]': "variant() === 'icon-primary'",
    '[class.mn-button--edge-start]': "edge() === 'start'",
    '[class.mn-button--edge-end]': "edge() === 'end'",
  },
})
export class ButtonDirective {
  /** An empty attribute (`mnButton`) is the default, reversible action. */
  readonly mnButton = input<ButtonVariant | ''>('');
  /**
   * For a borderless button at a column's edge that no primitive's trailing
   * slot holds: it gives up its padding on that side, so its label, not its
   * hit area, lines up with the edge.
   */
  readonly edge = input<'start' | 'end' | null>(null);

  constructor() {
    const written = inject(new HostAttributeToken('mnButton'), { optional: true });
    if (written !== null) {
      const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
      element.classList.add(...classesOf((written as ButtonVariant | '') || 'default'));
    }
  }

  protected variant(): ButtonVariant {
    return this.mnButton() || 'default';
  }

  protected isIcon(): boolean {
    return isIconVariant(this.variant());
  }
}

function isIconVariant(variant: ButtonVariant): boolean {
  return variant === 'icon' || variant === 'icon-primary';
}

function classesOf(variant: ButtonVariant): readonly string[] {
  const base = isIconVariant(variant) ? 'mn-icon-button' : 'mn-button';
  const modifier = {
    default: null,
    primary: 'mn-button--primary',
    ghost: 'mn-button--ghost',
    danger: 'mn-button--danger',
    icon: null,
    'icon-primary': 'mn-icon-button--primary',
  }[variant];
  return modifier === null ? [base] : [base, modifier];
}
