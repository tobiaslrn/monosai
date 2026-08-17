import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { NavigationItem } from './navigation-items';

export interface MoreSheetData {
  readonly items: readonly NavigationItem[];
}

/** Full-height mobile sheet holding secondary destinations. */
@Component({
  selector: 'mn-more-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="sheet">
      <header>
        <h2 id="mn-more-sheet-title">More</h2>
        <button type="button" class="close" (click)="close()" aria-label="Close menu">
          <mn-icon name="close" />
        </button>
      </header>
      <ul>
        @for (item of data.items; track item.path) {
          <li>
            <a [routerLink]="item.path" (click)="close()">
              <mn-icon [name]="item.icon" />
              <span>{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </div>
  `,
  styleUrl: './more-sheet.component.scss',
})
export class MoreSheetComponent {
  private readonly dialogRef = inject<DialogRef<void>>(DialogRef);
  protected readonly data = inject<MoreSheetData>(DIALOG_DATA);

  protected close(): void {
    this.dialogRef.close();
  }
}
