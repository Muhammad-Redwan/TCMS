import { Routes } from '@angular/router';
import { mockRoutes } from '../mocks/enable-mocks';
import { NAV_ITEMS } from './core/navigation';
import { authGuard, permissionGuard } from './core/session/guards';

/** Placeholder routes until each feature ships its own lazy route file. */
const featureRoutes: Routes = NAV_ITEMS.map((item) => ({
  path: item.path,
  canActivate: item.permission ? [permissionGuard(item.permission)] : [],
  loadComponent: () => import('./features/planned/planned-page').then((m) => m.PlannedPage),
  data: { screenId: item.screenId, titleKey: item.labelKey, sprint: item.sprint },
}));

export const routes: Routes = [
  ...mockRoutes,
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'error',
    loadComponent: () => import('./features/system/status-page').then((m) => m.StatusPage),
    data: { kind: 'error' },
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
      },
      ...featureRoutes,
      {
        path: '403',
        loadComponent: () => import('./features/system/status-page').then((m) => m.StatusPage),
        data: { kind: 'forbidden' },
      },
      {
        path: '**',
        loadComponent: () => import('./features/system/status-page').then((m) => m.StatusPage),
        data: { kind: 'notFound' },
      },
    ],
  },
];
