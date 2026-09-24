import { Component, inject, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { getSetupStatus } from '../../api/functions';
import { SetupStep } from '../../api/models';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { BadgeTone, StatusBadge } from '../../shared/ui/status-badge';

/** Where each onboarding step is done in the app. POLICY arrives in Sprint 3 (P01). */
const STEP_LINKS: Record<SetupStep['key'], string | null> = {
  ORGANIZATION: '/organization',
  ACCESS: '/identity/users',
  EMPLOYEE_SOURCE: '/hr/employees',
  POLICY: null,
};

const TONES: Record<SetupStep['status'], BadgeTone> = {
  DONE: 'success',
  PENDING: 'warning',
  NOT_AVAILABLE: 'neutral',
};

/**
 * Company onboarding checklist (T03). Completion is computed by the backend, so the page
 * never marks a step done on its own.
 */
@Component({
  selector: 'app-setup-page',
  imports: [RouterLink, TranslocoPipe, MatButton, MatProgressBar, ErrorAlert, StatusBadge],
  template: `
    <h1>{{ 'setup.title' | transloco }}</h1>

    @if (status.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="status.reload()" />
    } @else if (status.value(); as s) {
      <p [class.ready]="s.ready" data-testid="setup-summary">
        {{ (s.ready ? 'setup.ready' : 'setup.intro') | transloco }}
      </p>
      <ol class="steps">
        @for (step of s.steps; track step.key) {
          <li [attr.data-testid]="'step-' + step.key">
            <div class="text">
              <h2>{{ 'setup.steps.' + step.key + '.title' | transloco }}</h2>
              <p>{{ 'setup.steps.' + step.key + '.body' | transloco }}</p>
            </div>
            <app-status-badge namespace="status.setup" [value]="step.status" [tones]="tones" />
            @if (links[step.key]; as link) {
              <a matButton="outlined" [routerLink]="link">{{ 'common.open' | transloco }}</a>
            }
          </li>
        }
      </ol>
    } @else {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }
  `,
  styles: `
    .ready {
      font-weight: 500;
      color: #0b5b2e;
    }
    .steps {
      list-style: none;
      padding: 0;
      margin: 1rem 0;
      max-width: 48rem;
      display: grid;
      gap: 0.75rem;
      li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1rem;
        padding: 1rem;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: var(--mat-sys-corner-medium);
        background: var(--mat-sys-surface);
      }
      .text {
        flex: 1 1 16rem;
      }
      h2 {
        font-size: 1rem;
        margin: 0 0 0.25rem;
      }
      p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
    }
  `,
})
export class SetupPage {
  private readonly api = inject(Api);
  protected readonly links = STEP_LINKS;
  protected readonly tones = TONES;
  protected readonly status = resource({ loader: () => this.api.invoke(getSetupStatus) });
}
