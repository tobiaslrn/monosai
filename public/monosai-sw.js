/**
 * Monosai's service worker.
 *
 * Angular's worker owns caching and updates and is loaded unchanged below. The
 * only thing handled here is the Android share target: receiving a file needs a
 * `POST` the page cannot see, so the worker has to take it, park it, and send
 * the browser to the Vocabulary screen to pick it up.
 *
 * The listener is registered before `ngsw-worker.js` is imported so it runs
 * first, and it answers nothing but that one POST — every other request,
 * including every navigation, reaches Angular's worker exactly as before.
 */

/** Where the manifest's `share_target.action` points, resolved inside the scope. */
const SHARE_TARGET_URL = new URL('share-target', self.registration.scope);

/** The one shared package waiting to be claimed, replaced by each new share. */
const INBOX_CACHE = 'monosai-shared-inbox';
const INBOX_URL = new URL('shared-package', self.registration.scope);

/** The same ceiling the package parser refuses above. */
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ['.apkg', '.colpkg'];

/** The form field the manifest declares. */
const SHARE_FIELD = 'package';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== SHARE_TARGET_URL.origin || url.pathname !== SHARE_TARGET_URL.pathname) {
    return;
  }
  event.respondWith(receiveSharedPackage(request));
});

/**
 * Parks a shared package and redirects to the screen that imports it.
 *
 * Everything that can go wrong redirects too, with a reason: a share that
 * silently led to a screen with nothing on it would be indistinguishable from
 * Monosai losing the file. Nothing about the file's contents or its name is
 * logged anywhere.
 */
async function receiveSharedPackage(request) {
  let file;
  try {
    const form = await request.formData();
    const shared = form.getAll(SHARE_FIELD).filter((value) => typeof value === 'object');
    if (shared.length === 0) {
      return redirectTo('anki-package-failed', 'no-file');
    }
    if (shared.length > 1) {
      return redirectTo('anki-package-failed', 'too-many-files');
    }
    file = shared[0];
  } catch {
    return redirectTo('anki-package-failed', 'unreadable');
  }

  const name = typeof file.name === 'string' ? file.name : '';
  if (!ALLOWED_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))) {
    return redirectTo('anki-package-failed', 'wrong-type');
  }
  if (file.size > MAX_PACKAGE_BYTES) {
    return redirectTo('anki-package-failed', 'too-large');
  }

  try {
    const cache = await caches.open(INBOX_CACHE);
    // One slot: a second share replaces the first rather than queueing behind
    // it, so nothing can accumulate unclaimed storage.
    await cache.delete(INBOX_URL);
    await cache.put(
      INBOX_URL,
      new Response(file, {
        headers: {
          'content-type': 'application/octet-stream',
          // Encoded, because a header may only carry Latin-1 and deck exports
          // are routinely named in Japanese.
          'x-monosai-file-name': encodeURIComponent(name),
          'x-monosai-received-at': String(Date.now()),
        },
      }),
    );
  } catch {
    return redirectTo('anki-package-failed', 'storage-full');
  }

  return redirectTo('anki-package');
}

/**
 * Sends the browser into the app, always inside the deployed base path.
 *
 * `303 See Other` turns the multipart POST into a fresh GET navigation. That
 * GET passes through Angular's worker, which can answer it from the app shell
 * while offline, and Back never tries to repeat the share POST.
 */
async function redirectTo(marker, reason) {
  const target = new URL(self.registration.scope);
  target.hash = `/vocabulary?shared=${marker}${reason === undefined ? '' : `&reason=${reason}`}`;
  if (self.navigator.onLine === false) {
    const shell = await caches.match(new URL('index.html', self.registration.scope));
    if (shell !== undefined) {
      const headers = new Headers(shell.headers);
      headers.delete('content-length');
      headers.set('cache-control', 'no-store');
      const targetLiteral = JSON.stringify(target.href).replaceAll('<', '\\u003c');
      const html = (await shell.text()).replace(
        '<head>',
        `<head><script>history.replaceState(null,'',${targetLiteral})</script>`,
      );
      return new Response(html, { status: 200, headers });
    }
  }
  return Response.redirect(target.href, 303);
}

importScripts('ngsw-worker.js');
