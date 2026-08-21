import { DOCUMENT, inject, type Provider } from '@angular/core';
import { APP_RELOAD, APP_UPDATE_CHECKER } from '../../domain/platform/app-update.port';
import { ServiceWorkerUpdateAdapter } from './service-worker-update.adapter';

export function providePwa(): Provider[] {
  return [
    { provide: APP_UPDATE_CHECKER, useClass: ServiceWorkerUpdateAdapter },
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
