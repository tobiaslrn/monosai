import { Directive, input } from '@angular/core';

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
  },
})
export class ButtonDirective {
  /** An empty attribute (`mnButton`) is the default, reversible action. */
  readonly mnButton = input<ButtonVariant | ''>('');

  protected variant(): ButtonVariant {
    return this.mnButton() || 'default';
  }

  protected isIcon(): boolean {
    const variant = this.variant();
    return variant === 'icon' || variant === 'icon-primary';
  }
}
