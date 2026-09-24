import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Placeholder for a routed screen that a later sprint delivers. Replace per feature. */
@Component({
  selector: 'app-planned-page',
  imports: [TranslocoPipe],
  template: `
    <h1 [attr.data-testid]="'screen-' + screenId()">
      {{
        'planned.title' | transloco: { screen: (titleKey() | transloco) + ' (' + screenId() + ')' }
      }}
    </h1>
    <p>{{ 'planned.body' | transloco: { sprint: sprint() } }}</p>
  `,
  styles: `
    h1 {
      font-size: 1.5rem;
      margin-block: 0 0.5rem;
    }
  `,
})
export class PlannedPage {
  readonly screenId = input.required<string>();
  readonly titleKey = input.required<string>();
  readonly sprint = input.required<number>();
}
