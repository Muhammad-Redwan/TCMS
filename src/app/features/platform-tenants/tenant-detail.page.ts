import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Api } from '../../api/api';
import { getTenant, retryTenantProvisioning } from '../../api/functions';
import { Job } from '../../api/models';
import { ApiError, isApiError } from '../../core/errors/api-error';
import { newIdempotencyKey } from '../../core/http/versioned';
import { SessionService } from '../../core/session/session.service';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';
import { JobPoller } from '../../shared/jobs/job-polling';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { StatusBadge } from '../../shared/ui/status-badge';
import { TENANT_STATUS_TONES } from './tenant-status';

/**
 * Tenant detail (T02). While PROVISIONING, polls the job with backoff and shows real progress.
 * READY is shown only when the backend says so (FE-001); FAILED shows the support reference.
 */
@Component({
  selector: 'app-tenant-detail-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MatButton,
    MatProgressBar,
    ErrorAlert,
    StatusBadge,
    TenantDatePipe,
  ],
  template: `
    <nav class="breadcrumb">
      <a routerLink="/platform/tenants">{{ 'tenants.title' | transloco }}</a>
    </nav>

    @if (tenant.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="tenant.reload()" />
    } @else if (tenant.value(); as t) {
      <header class="page-header">
        <h1>
          <bdi>{{ t.displayName }}</bdi>
        </h1>
        <app-status-badge
          namespace="status.tenant"
          [value]="t.status"
          [tones]="tones"
          data-testid="tenant-status"
        />
      </header>

      <section class="provisioning" aria-live="polite" data-testid="provisioning">
        <h2>{{ 'tenants.provisioning.title' | transloco }}</h2>
        @switch (t.status) {
          @case ('PROVISIONING') {
            <p>{{ 'tenants.provisioning.pending' | transloco }}</p>
            @if (job(); as j) {
              @if (j.total) {
                <mat-progress-bar
                  mode="determinate"
                  [value]="((j.processed ?? 0) / j.total) * 100"
                  [attr.aria-label]="'tenants.provisioning.title' | transloco"
                />
                <p class="muted">
                  {{ 'status.job.' + j.status | transloco }} ·
                  {{
                    'tenants.provisioning.progress'
                      | transloco: { processed: j.processed ?? 0, total: j.total }
                  }}
                </p>
              }
            } @else {
              <mat-progress-bar
                mode="indeterminate"
                [attr.aria-label]="'tenants.provisioning.title' | transloco"
              />
            }
            @if (pollingStopped()) {
              <p class="muted" role="status">{{ 'tenants.provisioning.stale' | transloco }}</p>
            }
          }
          @case ('READY') {
            <p>{{ 'tenants.provisioning.ready' | transloco: { email: t.adminEmail } }}</p>
          }
          @case ('FAILED') {
            <p>{{ 'tenants.provisioning.failed' | transloco }}</p>
            @if (t.failureReference) {
              <p>
                {{ 'errors.traceLabel' | transloco }}
                <bdi
                  ><code data-testid="failure-reference">{{ t.failureReference }}</code></bdi
                >
              </p>
            }
            @if (retryError(); as error) {
              <app-error-alert [error]="error" />
            }
            @if (canWrite()) {
              <button
                matButton="filled"
                type="button"
                [disabled]="retrying()"
                (click)="retry()"
                data-testid="retry-provisioning"
              >
                {{ 'tenants.provisioning.retry' | transloco }}
              </button>
            }
          }
        }
      </section>

      <dl class="details">
        <dt>{{ 'tenants.fields.legalName' | transloco }}</dt>
        <dd>
          <bdi>{{ t.legalName }}</bdi>
        </dd>
        <dt>{{ 'tenants.fields.adminEmail' | transloco }}</dt>
        <dd>
          <bdi>{{ t.adminEmail }}</bdi>
        </dd>
        <dt>{{ 'tenants.fields.timezone' | transloco }}</dt>
        <dd>
          <span dir="ltr">{{ t.timezone }}</span>
        </dd>
        <dt>{{ 'tenants.fields.currency' | transloco }}</dt>
        <dd>
          <span dir="ltr">{{ t.currency }}</span>
        </dd>
        <dt>{{ 'tenants.fields.createdAt' | transloco }}</dt>
        <dd>{{ t.createdAt | tenantDate }}</dd>
      </dl>
    } @else {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }
  `,
  styles: `
    .provisioning {
      max-width: 40rem;
      padding: 1rem;
      margin-block-end: 1.5rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-medium);
      background: var(--mat-sys-surface);
      h2 {
        font-size: 1.125rem;
        margin: 0 0 0.5rem;
      }
      mat-progress-bar {
        margin-block: 0.75rem 0.25rem;
      }
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }
    .details {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.5rem 1.5rem;
      dt {
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 0;
      }
    }
  `,
})
export class TenantDetailPage {
  private readonly api = inject(Api);
  private readonly poller = inject(JobPoller);
  private readonly session = inject(SessionService);

  readonly tenantId = input.required<string>();

  protected readonly tones = TENANT_STATUS_TONES;
  protected readonly canWrite = computed(() =>
    this.session.permissions().has('platform.tenants.write'),
  );
  protected readonly tenant = resource({
    params: () => this.tenantId(),
    loader: ({ params: tenantId }) => this.api.invoke(getTenant, { tenantId }),
  });

  protected readonly job = signal<Job | null>(null);
  protected readonly pollingStopped = signal(false);
  protected readonly retrying = signal(false);
  protected readonly retryError = signal<ApiError | null>(null);
  private retryKey = newIdempotencyKey();
  private polling: Subscription | null = null;
  private pollingJobId: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.polling?.unsubscribe());
    effect(() => {
      const t = this.tenant.value();
      const jobId = t?.status === 'PROVISIONING' ? (t.provisioningJobId ?? null) : null;
      if (jobId !== this.pollingJobId) this.watch(jobId);
    });
  }

  protected async retry(): Promise<void> {
    if (this.retrying()) return;
    this.retrying.set(true);
    this.retryError.set(null);
    try {
      const updated = await this.api.invoke(retryTenantProvisioning, {
        tenantId: this.tenantId(),
        'Idempotency-Key': this.retryKey,
      });
      this.retryKey = newIdempotencyKey();
      this.tenant.set(updated);
    } catch (error) {
      if (!isApiError(error)) throw error;
      this.retryError.set(error);
    } finally {
      this.retrying.set(false);
    }
  }

  /** Polls one job; when it ends, the tenant is re-read so its status comes from the server. */
  private watch(jobId: string | null): void {
    this.polling?.unsubscribe();
    this.polling = null;
    this.pollingJobId = jobId;
    this.job.set(null);
    this.pollingStopped.set(false);
    if (!jobId) return;
    this.polling = this.poller.watch(jobId).subscribe({
      next: (job) => this.job.set(job),
      complete: () => this.tenant.reload(),
      error: () => this.pollingStopped.set(true),
    });
  }
}
