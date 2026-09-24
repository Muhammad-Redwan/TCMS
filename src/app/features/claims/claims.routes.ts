import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/session/guards';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const CLAIM_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./claim-list.page').then((m) => m.ClaimListPage),
  },
  {
    path: 'new',
    canActivate: [permissionGuard('claims.create')],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./claim-editor.page').then((m) => m.ClaimEditorPage),
  },
  {
    path: ':claimId',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./claim-editor.page').then((m) => m.ClaimEditorPage),
  },
  {
    path: ':claimId/receipts/:receiptId',
    loadComponent: () => import('./receipt-detail.page').then((m) => m.ReceiptDetailPage),
  },
];
