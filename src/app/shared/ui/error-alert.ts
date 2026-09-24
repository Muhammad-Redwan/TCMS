import { Component, computed, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiError, errorMessageKey, isApiError } from '../../core/errors/api-error';

/**
 * Inline, recoverable error with the translated message, the support trace ID and an optional
 * retry. Never shows server-provided text (guide §4).
 */
@Component({
  selector: 'app-error-alert',
  imports: [TranslocoPipe, MatButton],
  template: `
    <div class="alert" role="alert">
      <p class="message">{{ messageKey() | transloco }}</p>
      @if (apiError()?.outcomeUnknown) {
        <p>{{ 'errors.outcomeUnknown' | transloco }}</p>
      }
      @if (apiError()?.traceId; as traceId) {
        <p class="trace">
          {{ 'errors.traceLabel' | transloco }}
          <bdi
            ><code>{{ traceId }}</code></bdi
          >
        </p>
      }
      @if (retryable()) {
        <button matButton="outlined" type="button" (click)="retry.emit()">
          {{ 'status.retry' | transloco }}
        </button>
      }
    </div>
  `,
  styles: `
    .alert {
      padding: 0.75rem 1rem;
      margin-block: 0 1rem;
      border-radius: var(--mat-sys-corner-small);
      border-inline-start: 4px solid var(--mat-sys-error);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    p {
      margin: 0 0 0.5rem;
    }
    .trace {
      font-size: 0.875rem;
    }
  `,
})
export class ErrorAlert {
  readonly error = input.required<unknown>();
  readonly retryable = input(false);
  readonly retry = output<void>();

  protected readonly apiError = computed<ApiError | null>(() => {
    const error = this.error();
    return isApiError(error) ? error : null;
  });

  protected readonly messageKey = computed(() => {
    const error = this.apiError();
    return error ? errorMessageKey(error) : 'errors.UNKNOWN_ERROR';
  });
}
