import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ButtonDirective } from '../../../shared-ui/button/button';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { CheckboxComponent } from '../../../shared-ui/checkbox/checkbox.component';
import { DisclosureComponent } from '../../../shared-ui/disclosure/disclosure.component';
import { DividerComponent } from '../../../shared-ui/divider/divider.component';
import { FactsComponent, type Fact } from '../../../shared-ui/facts/facts.component';
import { PageComponent, StackComponent } from '../../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import {
  RadioListComponent,
  type RadioListOption,
} from '../../../shared-ui/radio-list/radio-list.component';
import { RangeFieldComponent } from '../../../shared-ui/range-field/range-field.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';
import {
  SegmentedControlComponent,
  type SegmentedOption,
} from '../../../shared-ui/segmented-control/segmented-control.component';
import { SelectComponent, type SelectOption } from '../../../shared-ui/select/select.component';
import { SettingsRowComponent } from '../../../shared-ui/settings-row/settings-row.component';
import { SettingsSectionComponent } from '../../../shared-ui/settings-section/settings-section.component';
import { StatusLineComponent } from '../../../shared-ui/status-line/status-line.component';
import { SwitchRowComponent } from '../../../shared-ui/switch-row/switch-row.component';

/** The row in every trailing end and state, and the controls that live in a card of rows. */
@Component({
  selector: 'mn-gallery-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    CardComponent,
    CheckboxComponent,
    DisclosureComponent,
    DividerComponent,
    FactsComponent,
    PageComponent,
    PageHeaderComponent,
    RadioListComponent,
    RangeFieldComponent,
    SectionComponent,
    SegmentedControlComponent,
    SelectComponent,
    SettingsRowComponent,
    SettingsSectionComponent,
    StackComponent,
    StatusLineComponent,
    SwitchRowComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Rows and settings" backTo="/gallery" backLabel="Back to gallery" />

      <mn-section heading="Trailing ends" [rows]="true">
        <mn-settings-row
          label="Text models"
          end="nav"
          link="/gallery/rows"
          status="success"
          statusText="Ready"
          summary="Gemini 2.5 Flash"
        />
        <mn-settings-row label="Pace" labelId="mn-gallery-rows-pace" end="choice">
          <mn-select
            label="Pace"
            labelledBy="mn-gallery-rows-pace"
            [options]="paces"
            [value]="pace()"
            (valueChange)="setPace($event)"
          />
        </mn-settings-row>
        <mn-switch-row [(checked)]="furigana">Furigana</mn-switch-row>
        <mn-settings-row label="Theme" end="control">
          <mn-segmented-control label="Theme" [options]="themes" [(value)]="theme" />
        </mn-settings-row>
        <mn-settings-row label="Space used" value="12 MB" />
        <mn-settings-row label="Protect storage" action="accent" summary="Not protected yet" />
        <mn-settings-row label="Delete saved audio" action="danger" summary="38 clips · 4 MB" />
      </mn-section>

      <mn-section heading="Summaries" [rows]="true">
        <mn-settings-row
          label="Voice"
          end="nav"
          status="warning"
          statusText="Not tested"
          summary="Kore"
        />
        <mn-settings-row
          label="OpenRouter key"
          end="nav"
          opens="dialog"
          status="danger"
          statusText="Key refused"
        />
        <mn-settings-row
          label="Reading level"
          end="nav"
          status="info"
          statusText="Changed"
          summary="Plain"
        />
        <mn-settings-row label="Build" summary="Pages" code="1a2b3c4" />
        <mn-settings-row label="Translation" end="nav" summary="Needs a key" [disabled]="true" />
        <mn-settings-row
          label="Refresh words"
          action="accent"
          summary="Reading Anki"
          [busy]="true"
        />
        <mn-status-line mn-section-footer tone="success">Words refreshed</mn-status-line>
      </mn-section>

      <mn-section heading="Switches" [rows]="true">
        <mn-switch-row [checked]="true" description="Shown above each word">Readings</mn-switch-row>
        <mn-switch-row [disabled]="true" description="Set up a voice first">Audio</mn-switch-row>
      </mn-section>

      <mn-section heading="Pace" [rows]="true">
        <mn-radio-list
          label="Pace"
          [options]="paceOptions"
          [value]="pace()"
          (valueChange)="setPace($event)"
        />
      </mn-section>

      <mn-section heading="Sliders" [rows]="true">
        <mn-range-field
          label="Text size"
          valueLabel="Medium"
          [max]="4"
          [value]="size()"
          (valueChange)="size.set($event)"
        />
        <mn-range-field
          label="Difficulty"
          valueLabel="20–80%"
          [max]="100"
          [value]="low()"
          [high]="high()"
          lowLabel="Lowest difficulty"
          highLabel="Highest difficulty"
          (valueChange)="low.set($event)"
          (highChange)="high.set($event)"
        />
        <mn-range-field label="Speed" valueLabel="Normal" [max]="4" [value]="2" [disabled]="true" />
      </mn-section>

      <mn-section heading="Disclosures" [rows]="true">
        <mn-disclosure heading="Technical details" value="Build 1a2b3c4">
          <mn-facts [facts]="facts" />
        </mn-disclosure>
        <mn-disclosure heading="Storage details" value="12 MB" [open]="true">
          <mn-facts [facts]="facts" />
        </mn-disclosure>
        <mn-disclosure heading="Older options" tone="quiet">
          <mn-facts [facts]="facts" />
        </mn-disclosure>
        <mn-disclosure heading="Delete everything" tone="danger">
          <mn-facts [facts]="facts" />
        </mn-disclosure>
      </mn-section>

      <mn-settings-section heading="Word sources">
        <button mn-settings-section-action mnButton type="button">Add words</button>
        <mn-card>
          <mn-stack>
            <mn-checkbox [checked]="true">Include subdecks</mn-checkbox>
            <mn-divider />
            <mn-checkbox>Include suspended cards</mn-checkbox>
          </mn-stack>
        </mn-card>
      </mn-settings-section>
    </mn-page>
  `,
})
export class GalleryRowsComponent {
  protected readonly paces: readonly SelectOption[] = [
    { value: 'gentle', label: 'Gentle' },
    { value: 'steady', label: 'Steady' },
    { value: 'brisk', label: 'Brisk' },
  ];
  protected readonly paceOptions: readonly RadioListOption[] = [
    { value: 'gentle', label: 'Gentle', description: 'One new word per paragraph' },
    { value: 'steady', label: 'Steady', description: 'A few new words per paragraph' },
    { value: 'brisk', label: 'Brisk' },
  ];
  protected readonly themes: readonly SegmentedOption<string>[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  protected readonly facts: readonly Fact[] = [
    { label: 'Version', value: '0.1.0' },
    { label: 'Stories', value: '14' },
    { label: 'Saved audio', value: '4 MB' },
  ];
  protected readonly pace = signal('steady');
  protected readonly furigana = signal(true);
  protected readonly theme = signal('system');
  protected readonly size = signal(2);
  protected readonly low = signal(20);
  protected readonly high = signal(80);

  protected setPace(value: string | number): void {
    this.pace.set(String(value));
  }
}
