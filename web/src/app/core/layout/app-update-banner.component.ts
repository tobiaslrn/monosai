import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
} from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { confirmLater } from '../../shared-ui/confirm-dialog/confirm-later';
import { BannerComponent } from '../../shared-ui/banner/banner.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { busyWorkLine, unsavedStoryReload } from '../../shared-ui/busy-work/busy-work-copy';

/**
 * A non-modal notice for the two states only a reload ends: a broken service worker and a lost
 * database. A new version never shows here; the next launch picks it up (ADR 0094).
 *
 * Deliberately never a dialog: it must not steal focus from a form the learner is in the middle
 * of. While busy work is in progress a broken worker's reload says so and is disabled rather
 * than hidden. A story whose save failed never finishes, so it does not hold the reload: once
 * nothing else does, the reload asks first whether to lose it, as Story options' Reload does.
 */
@Component({
  selector: 'mn-app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BannerComponent, ButtonDirective],
  template: `
    @let status = store.status();
    @if (status.kind === 'superseded' || (!supersededOnly() && status.kind === 'failed')) {
      <mn-banner
        class="banner"
        tone="danger"
        icon="warning"
        [attr.role]="status.kind === 'superseded' ? 'alert' : 'status'"
        [attr.aria-live]="status.kind === 'superseded' ? null : 'polite'"
      >
        <p>{{ status.message }}</p>
        @if (status.kind === 'failed' && holding()) {
          <p class="mn-hint">Finishing current work…</p>
        }
        <ng-container ngProjectAs="[mn-banner-action]">
          @if (status.kind === 'superseded') {
            <button mnButton="primary" type="button" (click)="reloadSuperseded()">Reload</button>
          } @else {
            <button mnButton type="button" [disabled]="holding()" (click)="reload()">
              Reload to recover
            </button>
          }
        </ng-container>
      </mn-banner>
    }
  `,
})
export class AppUpdateBannerComponent {
  protected readonly store = inject(AppUpdateStore);
  private readonly injector = inject(Injector);

  /** The reader carries no application chrome, so it shows only a lost database. */
  readonly supersededOnly = input(false);

  /**
   * Saving can never succeed in this tab, so busy work is not worth waiting for; the learner is
   * told what a reload discards and decides.
   */
  protected async reloadSuperseded(): Promise<void> {
    // Agreeing also silences the browser's own leave prompt, so every piece of work is named.
    const work = this.store.work();
    if (work.length > 0) {
      const confirmed = await confirmLater(this.injector, {
        title: 'Reload and lose unsaved work?',
        message: 'Reloading discards:',
        details: work.map(busyWorkLine),
        confirmLabel: 'Reload',
        cancelLabel: 'Cancel',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
    }
    this.store.reloadSuperseded();
  }

  protected readonly holding = computed(() => this.store.holdingWork().length > 0);

  protected async reload(): Promise<void> {
    const unsaved = this.store.unsavedStories();
    if (unsaved > 0 && !(await confirmLater(this.injector, unsavedStoryReload(unsaved)))) {
      return;
    }
    this.store.reloadNow(unsaved);
  }
}
