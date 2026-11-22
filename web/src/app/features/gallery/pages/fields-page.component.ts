import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CheckboxComponent } from '../../../shared-ui/checkbox/checkbox.component';
import { CountComponent } from '../../../shared-ui/count/count.component';
import { FieldComponent } from '../../../shared-ui/field/field.component';
import { GridComponent, PageComponent, StackComponent } from '../../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { RadioCardGroupComponent } from '../../../shared-ui/radio-card/radio-card-group.component';
import { RadioCardComponent } from '../../../shared-ui/radio-card/radio-card.component';
import { SearchFieldComponent } from '../../../shared-ui/search-field/search-field.component';
import { SecretFieldComponent } from '../../../shared-ui/secret-field/secret-field.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';
import {
  SegmentedControlComponent,
  type SegmentedOption,
} from '../../../shared-ui/segmented-control/segmented-control.component';
import { SelectComponent, type SelectOption } from '../../../shared-ui/select/select.component';

/** Every field and choice control of a form, in its resting, filled, and wrong states. */
@Component({
  selector: 'mn-gallery-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CheckboxComponent,
    CountComponent,
    FieldComponent,
    GridComponent,
    PageComponent,
    PageHeaderComponent,
    RadioCardComponent,
    RadioCardGroupComponent,
    SearchFieldComponent,
    SecretFieldComponent,
    SectionComponent,
    SegmentedControlComponent,
    SelectComponent,
    StackComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Fields and choices" backTo="/gallery" backLabel="Back to gallery" />

      <mn-section heading="Fields">
        <mn-field label="List name" hint="Shown in your word sources">
          <input type="text" value="Genki vocabulary" />
        </mn-field>
        <mn-field label="Title (optional)">
          <input type="text" placeholder="A walk in the park" />
        </mn-field>
        <mn-field
          label="Tokens"
          error="Enter a number up to 65,536"
          errorId="mn-gallery-tokens-error"
        >
          <input
            type="text"
            value="90000"
            aria-invalid="true"
            aria-describedby="mn-gallery-tokens-error"
          />
        </mn-field>
        <mn-field label="Instructions (optional)">
          <textarea rows="3">Set it in a small seaside town.</textarea>
        </mn-field>
        <mn-count>31 of 200 characters</mn-count>
        <mn-count [over]="true">212 of 200 characters</mn-count>
        <mn-grid min="9rem">
          <mn-field label="From"><input type="text" value="1" /></mn-field>
          <mn-field label="To"><input type="text" value="20" /></mn-field>
        </mn-grid>
      </mn-section>

      <mn-section heading="Search and secrets">
        <mn-search-field label="Search Japanese or English" placeholder="Search words" />
        <mn-search-field label="Search stories" [(value)]="query" />
        <mn-secret-field label="API key" hint="Starts with sk-or-" />
        <mn-secret-field label="API key" value="sk-or-v1-0000" error="Wrong key" />
      </mn-section>

      <mn-section heading="Choices">
        <mn-stack align="start">
          <mn-select label="Voice" [options]="voices" value="kore" />
          <mn-select label="Deck" [options]="voices" [value]="null" placeholder="Choose a deck" />
          <mn-select label="Model" [options]="voices" value="kore" [disabled]="true" />
          <mn-segmented-control label="Theme" [options]="themes" [(value)]="theme" />
          <mn-segmented-control label="Order" [options]="orders" />
          <mn-checkbox [(checked)]="subdecks">Include subdecks</mn-checkbox>
          <mn-checkbox>Include suspended cards</mn-checkbox>
          <mn-checkbox [disabled]="true">Include new cards</mn-checkbox>
        </mn-stack>
      </mn-section>

      <mn-radio-card-group label="Reading level" [(value)]="level">
        <mn-radio-card value="starter">
          <mn-stack [gap]="1">
            <strong>Starter</strong>
            <span>Short sentences in plain form</span>
          </mn-stack>
        </mn-radio-card>
        <mn-radio-card value="plain">
          <mn-stack [gap]="1">
            <strong>Plain</strong>
            <span>Everyday grammar, polite and plain</span>
          </mn-stack>
        </mn-radio-card>
        <mn-radio-card value="rich">
          <mn-stack [gap]="1">
            <strong>Rich</strong>
            <span>Longer sentences and more forms</span>
          </mn-stack>
        </mn-radio-card>
      </mn-radio-card-group>
    </mn-page>
  `,
})
export class GalleryFieldsComponent {
  protected readonly voices: readonly SelectOption[] = [
    { value: 'kore', label: 'Kore' },
    { value: 'puck', label: 'Puck', description: 'Brighter and faster' },
    { value: 'charon', label: 'Charon', disabled: true },
  ];
  protected readonly themes: readonly SegmentedOption<string>[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  protected readonly orders: readonly SegmentedOption<string>[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
  ];
  protected readonly query = signal('park');
  protected readonly theme = signal('light');
  protected readonly subdecks = signal(true);
  protected readonly level = signal<string | undefined>('plain');
}
