/**
 * Global unit-test setup.
 *
 * `fake-indexeddb` provides a specification-compliant IndexedDB implementation
 * so repository integration tests exercise real Dexie transactions in the
 * jsdom environment. Real-browser storage behaviour is covered by Playwright.
 */
import 'fake-indexeddb/auto';
