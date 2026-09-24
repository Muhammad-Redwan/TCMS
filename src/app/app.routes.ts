import { LoadChildren, Routes } from '@angular/router';
import { mockRoutes } from '../mocks/enable-mocks';
import { NAV_ITEMS } from './core/navigation';
import { authGuard, permissionGuard } from './core/session/guards';

/** Lazy route files of delivered features, keyed by screen ID. */
const FEATURES: Record<string, LoadChildren> = {
  T01: () => import('./features/platform-tenants/tenants.routes').then((m) => m.TENANT_ROUTES),
  T03: () => import('./features/setup/setup.routes').then((m) => m.SETUP_ROUTES),
  O01: () =>
    import('./features/organization/organization.routes').then((m) => m.ORGANIZATION_ROUTES),
  H01: () => import('./features/hr/employees/employees.routes').then((m) => m.EMPLOYEE_ROUTES),
  I01: () => import('./features/identity/identity.routes').then((m) => m.IDENTITY_ROUTES),
  P01: () => import('./features/policies/policies.routes').then((m) => m.POLICY_ROUTES),
  C01: () => import('./features/claims/claims.routes').then((m) => m.CLAIM_ROUTES),
  V01: () => import('./features/approvals/approvals.routes').then((m) => m.APPROVAL_ROUTES),
  F01: () => import('./features/finance/finance.routes').then((m) => m.FINANCE_ROUTES),
};

/** Every nav item gets its permission guard; undelivered screens show a placeholder. */
const featureRoutes: Routes = NAV_ITEMS.map((item) => ({
  path: item.path,
  canActivate: item.permission ? [permissionGuard(item.permission)] : [],
  ...(FEATURES[item.screenId]
    ? { loadChildren: FEATURES[item.screenId] }
    : {
        loadComponent: () => import('./features/planned/planned-page').then((m) => m.PlannedPage),
        data: { screenId: item.screenId, titleKey: item.labelKey, sprint: item.sprint },
      }),
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
