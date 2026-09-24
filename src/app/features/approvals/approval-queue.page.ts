import { Component, computed, inject, resource } from '@angular/core';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabLink, MatTabNav, MatTabNavPanel } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { listMyApprovals } from '../../api/functions';
import { LocaleService } from '../../core/i18n/locale.service';
import { CLAIM_STATUS_TONES, formatPeriod } from '../../shared/claims/claim-status';
import { MoneyPipe } from '../../shared/format/money';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { ListQueryState, PAGE_SIZES } from '../../shared/table/list-query';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { StatusBadge } from '../../shared/ui/status-badge';

/** My approval queue (V01): pending work oldest first, and what I already decided. */
@Component({
  selector: 'app-approval-queue-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MatTabNav,
    MatTabLink,
    MatTabNavPanel,
    MatTableModule,
    MatPaginator,
    MatProgressBar,
    ErrorAlert,
    StatusBadge,
    MoneyPipe,
    TenantDatePipe,
  ],
  template: `
    <h1>{{ 'approvals.title' | transloco }}</h1>

    <nav
      mat-tab-nav-bar
      mat-stretch-tabs="false"
      [tabPanel]="panel"
      [attr.aria-label]="'approvals.title' | transloco"
    >
      <a
        mat-tab-link
        [routerLink]="[]"
        [queryParams]="{ state: null }"
        [active]="!decided()"
        data-testid="tab-pending"
      >
        {{ 'approvals.pending' | transloco }}
      </a>
      <a
        mat-tab-link
        [routerLink]="[]"
        [queryParams]="{ state: 'DECIDED' }"
        [active]="decided()"
        data-testid="tab-decided"
      >
        {{ 'approvals.decided' | transloco }}
      </a>
    </nav>

    <mat-tab-nav-panel #panel>
      <div class="panel">
        @if (tasks.isLoading()) {
          <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
        }
        @if (tasks.error(); as error) {
          <app-error-alert [error]="error" [retryable]="true" (retry)="tasks.reload()" />
        } @else if (tasks.value(); as page) {
          @if (page.content.length === 0) {
            <p class="empty" data-testid="approvals-empty">
              {{ (decided() ? 'approvals.emptyDecided' : 'approvals.empty') | transloco }}
            </p>
          } @else {
            <div class="table-scroll">
              <table mat-table [dataSource]="page.content" data-testid="approvals-table">
                <caption class="visually-hidden">
                  {{
                    'approvals.title' | transloco
                  }}
                </caption>
                <ng-container matColumnDef="claim">
                  <th mat-header-cell *matHeaderCellDef>
                    {{ 'claims.fields.number' | transloco }}
                  </th>
                  <td mat-cell *matCellDef="let t">
                    <a [routerLink]="t.claimId"
                      ><bdi>{{ t.claimNumber }}</bdi></a
                    >
                  </td>
                </ng-container>
                <ng-container matColumnDef="claimant">
                  <th mat-header-cell *matHeaderCellDef>{{ 'approvals.claimant' | transloco }}</th>
                  <td mat-cell *matCellDef="let t">
                    <bdi>{{ t.claimantName }}</bdi>
                    @if (t.departmentName) {
                      <span class="muted">
                        · <bdi>{{ t.departmentName }}</bdi></span
                      >
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="period">
                  <th mat-header-cell *matHeaderCellDef>
                    {{ 'claims.fields.period' | transloco }}
                  </th>
                  <td mat-cell *matCellDef="let t">{{ period(t.period) }}</td>
                </ng-container>
                <ng-container matColumnDef="total">
                  <th mat-header-cell *matHeaderCellDef>{{ 'claims.fields.total' | transloco }}</th>
                  <td mat-cell *matCellDef="let t" class="amount">
                    <bdi>{{ t.totalAmount | money: t.currency }}</bdi>
                  </td>
                </ng-container>
                <ng-container matColumnDef="review">
                  <th mat-header-cell *matHeaderCellDef>{{ 'approvals.forReview' | transloco }}</th>
                  <td mat-cell *matCellDef="let t">
                    @if (t.warningCount > 0) {
                      <span class="warnings">{{
                        'approvals.warnings' | transloco: { count: t.warningCount }
                      }}</span>
                    } @else {
                      —
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="step">
                  <th mat-header-cell *matHeaderCellDef>{{ 'approvals.step' | transloco }}</th>
                  <td mat-cell *matCellDef="let t">
                    {{ 'approvals.stepOf' | transloco: { step: t.step, total: t.totalSteps } }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="submittedAt">
                  <th mat-header-cell *matHeaderCellDef>
                    {{ 'approvals.submittedAt' | transloco }}
                  </th>
                  <td mat-cell *matCellDef="let t">{{ t.submittedAt | tenantDate }}</td>
                </ng-container>
                <ng-container matColumnDef="decision">
                  <th mat-header-cell *matHeaderCellDef>
                    {{ 'approvals.yourDecision' | transloco }}
                  </th>
                  <td mat-cell *matCellDef="let t">
                    @if (t.decision) {
                      {{ 'approvals.decisions.' + t.decision | transloco }} ·
                      {{ t.decidedAt | tenantDate }}
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>
                    {{ 'claims.fields.status' | transloco }}
                  </th>
                  <td mat-cell *matCellDef="let t">
                    <app-status-badge namespace="status.claim" [value]="t.status" [tones]="tones" />
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="columns()"></tr>
                <tr mat-row *matRowDef="let row; columns: columns()"></tr>
              </table>
            </div>
            <mat-paginator
              [length]="page.page.totalElements"
              [pageIndex]="page.page.number"
              [pageSize]="page.page.size"
              [pageSizeOptions]="pageSizes"
              (page)="onPage($event)"
            />
          }
        }
      </div>
    </mat-tab-nav-panel>
  `,
  styles: `
    .panel {
      padding-block-start: 1rem;
    }
    .empty,
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .amount {
      font-variant-numeric: tabular-nums;
    }
    .warnings {
      color: #6b4a00;
      font-weight: 500;
    }
  `,
})
export class ApprovalQueuePage {
  private readonly api = inject(Api);
  private readonly locale = inject(LocaleService);
  protected readonly list = new ListQueryState(['state']);
  protected readonly tones = CLAIM_STATUS_TONES;
  protected readonly pageSizes = PAGE_SIZES;

  protected readonly decided = computed(() => this.list.query().filters['state'] === 'DECIDED');
  protected readonly columns = computed(() =>
    this.decided()
      ? ['claim', 'claimant', 'period', 'total', 'decision', 'status']
      : ['claim', 'claimant', 'period', 'total', 'review', 'step', 'submittedAt'],
  );

  protected readonly tasks = resource({
    params: () => this.list.query(),
    loader: ({ params }) =>
      this.api.invoke(listMyApprovals, {
        page: params.page,
        size: params.size,
        state: this.decided() ? 'DECIDED' : 'PENDING',
      }),
  });

  protected period(value: string): string {
    return formatPeriod(value, this.locale.locale());
  }

  protected onPage(event: PageEvent): void {
    this.list.setPage(event.pageIndex, event.pageSize);
  }
}
