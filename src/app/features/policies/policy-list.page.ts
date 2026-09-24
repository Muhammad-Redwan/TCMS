import { Component, computed, inject, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { listPolicies } from '../../api/functions';
import { SessionService } from '../../core/session/session.service';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { StatusBadge } from '../../shared/ui/status-badge';
import { POLICY_STATUS_TONES } from './policy-status';

/** Policy versions (P01 list). */
@Component({
  selector: 'app-policy-list-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatTableModule,
    MatProgressBar,
    ErrorAlert,
    StatusBadge,
    TenantDatePipe,
  ],
  template: `
    <header class="page-header">
      <h1>{{ 'policies.title' | transloco }}</h1>
      @if (canWrite()) {
        <a matButton="filled" routerLink="new" data-testid="create-policy">
          {{ 'policies.create' | transloco }}
        </a>
      }
    </header>
    <p class="muted">{{ 'policies.intro' | transloco }}</p>

    @if (policies.isLoading()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }
    @if (policies.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="policies.reload()" />
    } @else if (policies.value(); as rows) {
      @if (rows.length === 0) {
        <p class="muted">{{ 'policies.empty' | transloco }}</p>
      } @else {
        <div class="table-scroll">
          <table mat-table [dataSource]="rows" data-testid="policies-table">
            <caption class="visually-hidden">
              {{
                'policies.title' | transloco
              }}
            </caption>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>{{ 'policies.fields.name' | transloco }}</th>
              <td mat-cell *matCellDef="let p">
                <a [routerLink]="p.id"
                  ><bdi>{{ p.name }}</bdi></a
                >
              </td>
            </ng-container>
            <ng-container matColumnDef="version">
              <th mat-header-cell *matHeaderCellDef>{{ 'policies.fields.version' | transloco }}</th>
              <td mat-cell *matCellDef="let p">{{ p.version }}</td>
            </ng-container>
            <ng-container matColumnDef="effectiveFrom">
              <th mat-header-cell *matHeaderCellDef>
                {{ 'policies.fields.effectiveFrom' | transloco }}
              </th>
              <td mat-cell *matCellDef="let p">{{ p.effectiveFrom | tenantDate: 'date' }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'policies.fields.status' | transloco }}</th>
              <td mat-cell *matCellDef="let p">
                <app-status-badge namespace="status.policy" [value]="p.status" [tones]="tones" />
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
      }
    }
  `,
  styles: `
    .muted {
      color: var(--mat-sys-on-surface-variant);
      max-width: 48rem;
    }
  `,
})
export class PolicyListPage {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  protected readonly columns = ['name', 'version', 'effectiveFrom', 'status'];
  protected readonly tones = POLICY_STATUS_TONES;
  protected readonly canWrite = computed(() => this.session.permissions().has('policies.write'));
  protected readonly policies = resource({ loader: () => this.api.invoke(listPolicies) });
}
