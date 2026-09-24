import { Component } from '@angular/core';
import { MatTabLink, MatTabNav, MatTabNavPanel } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet, Routes } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

/** Finance area: claims ready to settle (F01) and settlement batches (F02). */
@Component({
  selector: 'app-finance-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatTabNav,
    MatTabLink,
    MatTabNavPanel,
    TranslocoPipe,
  ],
  template: `
    <h1>{{ 'finance.title' | transloco }}</h1>
    <nav
      mat-tab-nav-bar
      mat-stretch-tabs="false"
      [tabPanel]="panel"
      [attr.aria-label]="'finance.title' | transloco"
    >
      <a
        mat-tab-link
        routerLink="."
        routerLinkActive
        #queue="routerLinkActive"
        [routerLinkActiveOptions]="{ exact: true }"
        [active]="queue.isActive"
      >
        {{ 'finance.queue' | transloco }}
      </a>
      <a
        mat-tab-link
        routerLink="batches"
        routerLinkActive
        #batches="routerLinkActive"
        [active]="batches.isActive"
      >
        {{ 'finance.batches' | transloco }}
      </a>
    </nav>
    <mat-tab-nav-panel #panel>
      <div class="panel"><router-outlet /></div>
    </mat-tab-nav-panel>
  `,
  styles: `
    .panel {
      padding-block-start: 1.25rem;
    }
  `,
})
export class FinanceLayout {}

export const FINANCE_ROUTES: Routes = [
  {
    path: '',
    component: FinanceLayout,
    children: [
      {
        path: '',
        loadComponent: () => import('./settlement-queue.page').then((m) => m.SettlementQueuePage),
      },
      {
        path: 'batches',
        loadComponent: () => import('./batch-list.page').then((m) => m.BatchListPage),
      },
      {
        path: 'batches/:batchId',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./batch-detail.page').then((m) => m.BatchDetailPage),
      },
    ],
  },
];
