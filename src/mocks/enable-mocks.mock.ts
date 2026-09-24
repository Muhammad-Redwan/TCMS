import { Routes } from '@angular/router';
import { setupWorker } from 'msw/browser';
import { handlers, MOCK_LOGIN_PATH } from './handlers';

/** Mock configuration only (see angular.json fileReplacements). */
export async function enableMocks(): Promise<void> {
  await setupWorker(...handlers).start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
}

export const mockRoutes: Routes = [
  {
    path: MOCK_LOGIN_PATH.slice(1),
    loadComponent: () => import('./mock-sign-in-page').then((m) => m.MockSignInPage),
  },
];
