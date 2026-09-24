import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/session/guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const TENANT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./tenant-list.page').then((m) => m.TenantListPage),
  },
  {
    path: 'new',
    canActivate: [permissionGuard('platform.tenants.write')],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./tenant-create.page').then((m) => m.TenantCreatePage),
  },
  {
    path: ':tenantId',
    loadComponent: () => import('./tenant-detail.page').then((m) => m.TenantDetailPage),
  },
];
