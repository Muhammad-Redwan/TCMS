import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const IDENTITY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./user-list.page').then((m) => m.UserListPage),
  },
  {
    path: ':userId',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./user-detail.page').then((m) => m.UserDetailPage),
  },
];
