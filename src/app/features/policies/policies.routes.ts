import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/session/guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const POLICY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./policy-list.page').then((m) => m.PolicyListPage),
  },
  {
    // Before :policyId so it is not read as a policy id.
    path: 'approval-route',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./approval-route.page').then((m) => m.ApprovalRoutePage),
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
