import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

export type StatusKind = 'forbidden' | 'notFound' | 'error';

/** Forbidden, not-found and unavailable states (A04). `kind` comes from route data. */
@Component({
  selector: 'app-status-page',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <section class="status" [attr.data-testid]="'status-' + kind()">
      <h1>{{ 'status.' + kind() + '.title' | transloco }}</h1>
      <p>{{ 'status.' + kind() + '.body' | transloco }}</p>
      @if (kind() === 'error') {
        <a href="./">{{ 'status.retry' | transloco }}</a>
      } @else {
        <a routerLink="/">{{ 'status.goHome' | transloco }}</a>
      }
    </section>
  `,
  styles: `
    .status {
      max-width: 40rem;
      padding: 2rem 1rem;
      margin-inline: auto;
    }
    h1 {
      font-size: 1.5rem;
      margin-block: 0 0.5rem;
    }
    a {
      color: var(--mat-sys-primary);
    }
  `,
})
export class StatusPage {
  readonly kind = input<StatusKind>('notFound');
}
