import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterOutlet } from '@angular/router';
import { ViewportService } from '../platform/viewport.service';
import { BottomNavComponent } from './bottom-nav.component';
import { MoreSheetComponent, type MoreSheetData } from './more-sheet.component';
import { routeChromeSignal } from '../routing/route-chrome';
import { NAVIGATION_ITEMS, barItems, moreItems } from './navigation-items';
import { SidebarNavComponent } from './sidebar-nav.component';

/** Responsive application frame: desktop sidebar or mobile bottom navigation. */
@Component({
  selector: 'mn-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SidebarNavComponent, BottomNavComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly dialog = inject(Dialog);
  protected readonly viewport = inject(ViewportService);

  protected readonly chrome = routeChromeSignal();
  protected readonly items = NAVIGATION_ITEMS;

  /** The reader is a focused route: it hides bottom navigation on a phone. */
  protected readonly showBottomNav = computed(
    () => !this.viewport.isDesktop() && this.chrome() !== 'focused',
  );
  protected readonly barItems = computed(() => barItems(this.items));
  protected readonly moreItems = computed(() => moreItems(this.items));

  protected openMore(): void {
    this.dialog.open<void, MoreSheetData>(MoreSheetComponent, {
      data: { items: this.moreItems() },
      ariaLabelledBy: 'mn-more-sheet-title',
      panelClass: 'mn-sheet-panel',
      hasBackdrop: true,
    });
  }
}
