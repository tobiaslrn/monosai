import { Directive, NO_ERRORS_SCHEMA, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterLink } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ReaderAudioStore } from '../../application/reading/reader-audio.store';
import { ReaderPreparationStore } from '../../application/reading/reader-preparation.store';
import { ReaderSelectionStore } from '../../application/reading/reader-selection.store';
import { ReaderStore } from '../../application/reading/reader.store';
import { SentenceAidsStore } from '../../application/enrichment/sentence-aids.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import { configureVocabularyTestBed } from '../../../testing/vocabulary-fakes';
import { ReaderContentActionsService } from './reader-content-actions.service';
import { ReaderGeometryService } from './reader-geometry.service';
import { ReaderMenuComponent } from './reader-menu.component';
import { ReaderPageComponent } from './reader-page.component';
import { ReaderSurfacesService } from './reader-surfaces.service';
import { ReaderWordPreviewService } from './reader-word-preview.service';

/** Stands in for the paragraph window, whose measuring needs a real layout. */
@Directive({ selector: '[mnReaderParagraphWindow]', exportAs: 'paragraphWindow' })
class StubParagraphWindow {
  readonly mnReaderParagraphWindow = input<unknown>();
  readonly spacers = signal({ before: 0, after: 0 });
}

const READING = { id: 'reading-1', title: '物語', kind: 'imported' };

/**
 * The page with Story options real and everything else around it stubbed: what
 * is under test is only how the page wires the menu to its actions.
 */
function render() {
  configureVocabularyTestBed();
  const reloadAsks = signal(false);
  const confirmReload = vi.fn(() => Promise.resolve());
  const off = () => false;
  const none = () => null;
  const noop = () => undefined;
  const actions = {
    rows: () => [],
    savedTextLayers: () => [],
    pending: none,
    error: none,
    reloadWaitingFor: none,
    reloadAsks,
    confirmReload,
    menuShown: noop,
  };
  const providers = [
    {
      provide: ReaderStore,
      useValue: {
        status: () => 'ready',
        reading: () => READING,
        paragraphs: () => [],
        hasMoreBelow: off,
        loadingMore: off,
        lastError: none,
        open: () => Promise.resolve(),
        close: noop,
      },
    },
    { provide: SentenceAidsStore, useValue: { aids: () => new Map() } },
    { provide: ReaderContentActionsService, useValue: actions },
    { provide: ReaderSurfacesService, useValue: { connect: noop, closeAll: noop } },
    { provide: ReaderSelectionStore, useValue: { sentenceId: none, inspectedWord: none } },
    {
      provide: ReaderAudioStore,
      useValue: {
        running: off,
        playerOpen: off,
        buttonLabel: () => 'Story audio',
        hasSavedAudio: off,
        maintenanceState: none,
        maintenanceError: none,
        setReading: noop,
        endPlayback: noop,
        playingSentenceId: none,
        playback: { isActive: off, currentSentenceId: none, stop: noop },
      },
    },
    {
      provide: ReaderGeometryService,
      useValue: { connect: noop, sheetScrollReserve: () => 0, titleTucked: off },
    },
    { provide: ReaderWordPreviewService, useValue: { word: none, end: noop } },
    {
      provide: ReaderPreparationStore,
      useValue: {
        hasTextModel: off,
        hasTranslationModel: off,
        hasGrammarModel: off,
        openedReading: () => Promise.resolve(),
        leftReader: noop,
      },
    },
  ];
  TestBed.configureTestingModule({
    providers: [
      { provide: PopoverService, useValue: { close: noop } },
      { provide: NavigationHistoryService, useValue: { backOrNavigate: noop } },
      {
        provide: AppSettingsStore,
        useValue: {
          readerPreferences: () => ({
            textScale: 1,
            furigana: 'unknown',
            tokenSpacing: false,
            sentencePerLine: false,
            warningMarkers: true,
          }),
        },
      },
    ],
  });
  TestBed.overrideComponent(ReaderPageComponent, {
    set: {
      providers,
      imports: [RouterLink, ReaderMenuComponent, StubParagraphWindow],
      schemas: [NO_ERRORS_SCHEMA],
    },
  });
  const fixture = TestBed.createComponent(ReaderPageComponent);
  fixture.componentRef.setInput('id', READING.id);
  fixture.detectChanges();
  return { fixture, reloadAsks, confirmReload };
}

describe('ReaderPageComponent', () => {
  // Story options only says the question is due; the page is what asks it.
  // Without this link a Reload that has to ask would stay asking, and every
  // later Reload would do nothing.
  it('asks the reload question when Story options says Reload asks', async () => {
    const { fixture, reloadAsks, confirmReload } = render();
    expect((fixture.nativeElement as HTMLElement).querySelector('mn-reader-menu')).not.toBeNull();
    expect(confirmReload).not.toHaveBeenCalled();

    reloadAsks.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(confirmReload).toHaveBeenCalledOnce();
  });
});
