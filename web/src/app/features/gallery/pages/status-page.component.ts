import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BannerComponent } from '../../../shared-ui/banner/banner.component';
import {
  BlockerComponent,
  BlockerListComponent,
} from '../../../shared-ui/blocker/blocker.component';
import { ButtonDirective } from '../../../shared-ui/button/button';
import { PageComponent, StackComponent } from '../../../shared-ui/layout/layout';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';
import { SettingsRowComponent } from '../../../shared-ui/settings-row/settings-row.component';
import { StatusLeadComponent } from '../../../shared-ui/status-lead/status-lead.component';
import { StatusLineComponent } from '../../../shared-ui/status-line/status-line.component';

/** Every tone of every status surface: notices, banners, status lines and leads, blockers. */
@Component({
  selector: 'mn-gallery-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BannerComponent,
    BlockerComponent,
    BlockerListComponent,
    ButtonDirective,
    NoticeComponent,
    PageComponent,
    PageHeaderComponent,
    RouterLink,
    SectionComponent,
    SettingsRowComponent,
    StackComponent,
    StatusLeadComponent,
    StatusLineComponent,
  ],
  template: `
    <mn-banner tone="info" icon="info" role="status">
      <p>A new version of Monosai is ready</p>
      <button mn-banner-action mnButton="primary" type="button">Reload</button>
      <button mn-banner-action mnButton="ghost" type="button">Later</button>
    </mn-banner>
    <mn-banner tone="warning" icon="alert" role="status">
      <p>Anki could not be reached</p>
      <button mn-banner-action mnButton type="button">Try again</button>
    </mn-banner>
    <mn-banner tone="danger" icon="warning" role="alert">
      <p>This tab lost its database</p>
    </mn-banner>

    <mn-page>
      <mn-page-header heading="Status and notices" backTo="/gallery" backLabel="Back to gallery" />

      <mn-section heading="Notices">
        <mn-stack>
          <mn-notice>
            <p>Stories stay on this device</p>
          </mn-notice>
          <mn-notice tone="info">
            <p>OpenRouter bills your account per request.</p>
          </mn-notice>
          <mn-notice tone="setup">
            <p>Add an OpenRouter key</p>
            <a mn-notice-action mnButton routerLink="/gallery">Open settings</a>
          </mn-notice>
          <mn-notice tone="success">
            <p>Key saved</p>
          </mn-notice>
          <mn-notice tone="warning">
            <p>Some words are not in your list</p>
            <button mn-notice-action mnButton type="button">Show words</button>
          </mn-notice>
          <mn-notice tone="danger" role="alert">
            <p>Could not save. Your text is still here.</p>
            <button mn-notice-action mnButton type="button">Try again</button>
            <button mn-notice-action mnButton="ghost" type="button">Dismiss</button>
          </mn-notice>
          <mn-notice icon="help">
            <p>New here?</p>
            <button mn-notice-action mnButton type="button">Open Help</button>
            <button mn-notice-action mnButton="ghost" type="button">Dismiss</button>
          </mn-notice>
        </mn-stack>
      </mn-section>

      <mn-section heading="Status lines" [rows]="true">
        <mn-settings-row label="Text model" summary="Gemini 2.5 Flash" />
        <mn-status-line mn-section-footer tone="success">Test passed</mn-status-line>
      </mn-section>
      <mn-stack>
        <mn-status-line tone="info">Words refresh every hour</mn-status-line>
        <mn-status-line tone="setup">
          Needs a key
          <a mn-status-line-action routerLink="/gallery">Add key</a>
        </mn-status-line>
        <mn-status-line tone="warning">Not tested since the last change</mn-status-line>
        <mn-status-line tone="danger">
          Test failed. The model returned no text.
          <button mn-status-line-action type="button">Test again</button>
        </mn-status-line>
      </mn-stack>

      <mn-section heading="Status leads">
        <mn-stack [gap]="2">
          <mn-status-lead tone="success" text="Ready" />
          <mn-status-lead tone="info" text="Changed" />
          <mn-status-lead tone="warning" text="Not tested" />
          <mn-status-lead tone="danger" text="Key refused" />
        </mn-stack>
      </mn-section>

      <mn-blocker-list heading="Before you can write">
        <mn-blocker>
          <strong>Text model: </strong>Choose a model.
          <a mn-blocker-action mnButton routerLink="/gallery">Open settings</a>
        </mn-blocker>
        <mn-blocker>
          <strong>Words: </strong>Add at least 50 words.
          <a mn-blocker-action mnButton routerLink="/gallery">Add words</a>
        </mn-blocker>
      </mn-blocker-list>
    </mn-page>
  `,
})
export class GalleryStatusComponent {}
