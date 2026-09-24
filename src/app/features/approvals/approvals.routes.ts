import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const APPROVAL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./approval-queue.page').then((m) => m.ApprovalQueuePage),
  },
  {
    path: ':claimId',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./approval-decision.page').then((m) => m.ApprovalDecisionPage),
  },
];
