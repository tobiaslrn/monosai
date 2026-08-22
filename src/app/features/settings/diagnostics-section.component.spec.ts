import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DATABASE_SCHEMA_VERSION } from '../../application/shared/repository-tokens';
import type { Logger } from '../../application/shared/diagnostics';
import { LOGGER } from '../../application/shared/diagnostics';
import { DiagnosticsSectionComponent } from './diagnostics-section.component';

function loggerFake(entries = 1): {
  readonly logger: Logger;
  readonly info: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly clear: ReturnType<typeof vi.fn>;
} {
  const info = vi.fn();
  const warn = vi.fn();
  const clear = vi.fn();
  let current = Array.from({ length: entries }, (_, index) => ({
    level: 'info' as const,
    event: 'app.initialization.succeeded' as const,
    timestamp: '2026-08-22T00:00:00.000Z',
    appVersion: '0.1.0',
    buildCommit: 'test',
    fields: { count: index },
  }));
  const logger: Logger = {
    debug: vi.fn(),
    info,
    warn,
    error: vi.fn(),
    snapshot: () => current,
    clear: clear.mockImplementation(() => {
      current = [];
    }),
  };
  return { logger, info, warn, clear };
}

describe('DiagnosticsSectionComponent', () => {
  it('copies the current log buffer and reports success', async () => {
    const fake = loggerFake();
    const writeText = vi.fn(() => Promise.resolve());

    TestBed.configureTestingModule({
      imports: [DiagnosticsSectionComponent],
      providers: [
        { provide: LOGGER, useValue: fake.logger },
        { provide: DATABASE_SCHEMA_VERSION, useValue: 5 },
      ],
    });
    const documentRef = TestBed.inject(DOCUMENT);
    Object.defineProperty(documentRef.defaultView?.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fixture = TestBed.createComponent(DiagnosticsSectionComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as unknown as HTMLElement;
    root.querySelectorAll('button')[0].click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Diagnostics copied.');
    expect(fake.info).toHaveBeenCalledWith('diagnostics.copy.succeeded', { count: 1 });
  });

  it('reports clipboard failures without exposing a raw error', async () => {
    const fake = loggerFake();
    const writeText = vi.fn(() => Promise.reject(new Error('clipboard secret')));

    TestBed.configureTestingModule({
      imports: [DiagnosticsSectionComponent],
      providers: [
        { provide: LOGGER, useValue: fake.logger },
        { provide: DATABASE_SCHEMA_VERSION, useValue: 5 },
      ],
    });
    const documentRef = TestBed.inject(DOCUMENT);
    Object.defineProperty(documentRef.defaultView?.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fixture = TestBed.createComponent(DiagnosticsSectionComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as unknown as HTMLElement;
    root.querySelectorAll('button')[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.textContent).toContain('Diagnostics could not be copied on this browser.');
    expect(fake.warn).toHaveBeenCalledWith('diagnostics.copy.failed');
    expect(fake.warn).not.toHaveBeenCalledWith('diagnostics.copy.failed', expect.anything());
  });

  it('clears the buffer without persisting a log table', () => {
    const fake = loggerFake();
    TestBed.configureTestingModule({
      imports: [DiagnosticsSectionComponent],
      providers: [
        { provide: LOGGER, useValue: fake.logger },
        { provide: DATABASE_SCHEMA_VERSION, useValue: 5 },
      ],
    });
    const fixture = TestBed.createComponent(DiagnosticsSectionComponent);

    const root = fixture.nativeElement as unknown as HTMLElement;
    root.querySelectorAll('button')[1].click();

    expect(fake.clear).toHaveBeenCalledOnce();
  });
});
