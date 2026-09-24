import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Routes } from '@angular/router';
import { MatTabLink, MatTabNav, MatTabNavPanel } from '@angular/material/tabs';
import { TranslocoPipe } from '@jsverse/transloco';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

/** Organization area: company profile (O01) and departments (O02) as tabs. */
@Component({
  selector: 'app-organization-layout',
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
    <h1>{{ 'organization.title' | transloco }}</h1>
    <nav
      mat-tab-nav-bar
      mat-stretch-tabs="false"
      [tabPanel]="panel"
      [attr.aria-label]="'organization.title' | transloco"
    >
      <a
        mat-tab-link
        routerLink="."
        routerLinkActive
        #profile="routerLinkActive"
        [routerLinkActiveOptions]="{ exact: true }"
        [active]="profile.isActive"
      >
        {{ 'organization.profile' | transloco }}
      </a>
      <a
        mat-tab-link
        routerLink="departments"
        routerLinkActive
        #departments="routerLinkActive"
        [active]="departments.isActive"
      >
        {{ 'departments.title' | transloco }}
      </a>
    </nav>
    <mat-tab-nav-panel #panel>
      <div class="panel"><router-outlet /></div>
    </mat-tab-nav-panel>
  `,
  styles: `
    .panel {
      padding-block-start: 1.5rem;
    }
  `,
})
export class OrganizationLayout {}

export const ORGANIZATION_ROUTES: Routes = [
  {
    path: '',
    component: OrganizationLayout,
    children: [
      {
        path: '',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./organization-profile.page').then((m) => m.OrganizationProfilePage),
      },
      {
        path: 'departments',
        loadComponent: () => import('./departments.page').then((m) => m.DepartmentsPage),
      },
    ],
  },
];
