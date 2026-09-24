import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PolicyFinding } from '../../api/models';
import { LocaleService } from '../../core/i18n/locale.service';
import { formatMoney } from '../format/money';

/** Finding parameters that carry money amounts. */
const AMOUNT_PARAMS = ['limit', 'threshold'];

/**
 * Policy findings computed by the backend. BLOCKING ones prevent submission; warnings go to the
 * reviewer. Messages come from translations keyed by finding code, with line numbers added.
 */
@Component({
  selector: 'app-claim-findings',
  imports: [TranslocoPipe],
  template: `
    @if (sorted().length > 0) {
      <section class="findings" aria-labelledby="findings-heading" data-testid="findings">
        <h2 id="findings-heading">{{ 'claims.findings.title' | transloco }}</h2>
        <ul>
          @for (finding of sorted(); track $index) {
            <li [class]="finding.severity.toLowerCase()" [attr.data-severity]="finding.severity">
              <span class="severity">{{
                'claims.findings.severity.' + finding.severity | transloco
              }}</span>
              @if (finding.itemIndex !== null && finding.itemIndex !== undefined) {
                <span class="line">{{
                  'claims.findings.line' | transloco: { line: finding.itemIndex + 1 }
                }}</span>
              }
              <span>{{
                'claims.findings.codes.' + finding.code | transloco: params(finding)
              }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    .findings {
      margin-block: 1rem;
      h2 {
        font-size: 1rem;
        margin: 0 0 0.5rem;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.375rem;
      }
      li {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: var(--mat-sys-corner-small);
        border-inline-start: 4px solid;
      }
    }
    .blocking {
      border-color: var(--mat-sys-error);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .warning {
      border-color: #b26a00;
      background: #fff0c9;
      color: #4a3300;
    }
    .info {
      border-color: var(--mat-sys-tertiary);
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .severity {
      font-weight: 600;
    }
    .line {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ClaimFindings {
  private readonly locale = inject(LocaleService);

  readonly findings = input.required<PolicyFinding[]>();
  /** Currency for amount parameters (limit, threshold) so they read "KWD 3.000", not "3.000". */
  readonly currency = input.required<string>();

  protected params(finding: PolicyFinding): Record<string, string> {
    const params = { ...(finding.params ?? {}) };
    for (const key of AMOUNT_PARAMS) {
      if (params[key])
        params[key] = formatMoney(params[key], this.currency(), this.locale.locale());
    }
    return params;
  }

  private static readonly ORDER = { BLOCKING: 0, WARNING: 1, INFO: 2 } as const;
  protected readonly sorted = computed(() =>
    [...this.findings()].sort(
      (a, b) =>
        ClaimFindings.ORDER[a.severity] - ClaimFindings.ORDER[b.severity] ||
        (a.itemIndex ?? -1) - (b.itemIndex ?? -1),
    ),
  );
}
