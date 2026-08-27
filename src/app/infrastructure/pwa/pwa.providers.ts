import { DOCUMENT, inject, type Provider } from '@angular/core';
import { APP_RELOAD, APP_UPDATE_CHECKER } from '../../domain/platform/app-update.port';
import { SHARED_PACKAGE_INBOX } from '../../domain/platform/shared-package-inbox.port';
import { CLOCK } from '../../application/shared/repository-tokens';
import { CacheStorageSharedPackageInbox } from './cache-storage-shared-inbox.adapter';
import { ServiceWorkerUpdateAdapter } from './service-worker-update.adapter';

export function providePwa(): Provider[] {
  return [
    { provide: APP_UPDATE_CHECKER, useClass: ServiceWorkerUpdateAdapter },
    {
      provide: SHARED_PACKAGE_INBOX,
      useFactory: () => {
        const documentRef = inject(DOCUMENT);
        const clock = inject(CLOCK);
        return new CacheStorageSharedPackageInbox(
          documentRef.defaultView?.caches,
          documentRef.baseURI,
          () => clock.now(),
        );
      },
    },
    {
      provide: APP_RELOAD,
      useFactory: () => {
        const documentRef = inject(DOCUMENT);
        return () => {
          documentRef.defaultView?.location.reload();
        };
      },
    },
  ];
}
