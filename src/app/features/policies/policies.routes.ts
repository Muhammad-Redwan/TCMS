import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/session/guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const POLICY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./policy-list.page').then((m) => m.PolicyListPage),
  },
  {
    path: 'new',
    canActivate: [permissionGuard('policies.write')],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./policy-form.page').then((m) => m.PolicyFormPage),
  },
  {
    path: ':policyId',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./policy-form.page').then((m) => m.PolicyFormPage),
  },
];
