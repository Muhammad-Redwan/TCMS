import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TimelineEvent } from '../../api/models';
import { TenantDatePipe } from '../../shared/format/tenant-date.pipe';

/** Claim history, newest first. Reviewer notes are shown as written (user content, isolated). */
@Component({
  selector: 'app-claim-timeline',
  imports: [TranslocoPipe, TenantDatePipe],
  template: `
    <section aria-labelledby="timeline-heading" data-testid="timeline">
      <h2 id="timeline-heading">{{ 'claims.timeline.title' | transloco }}</h2>
      <ol>
        @for (event of ordered(); track event.at + event.type) {
          <li>
            <span class="what">{{ 'claims.timeline.types.' + event.type | transloco }}</span>
            @if (event.actorName) {
              <span class="who"
                ><bdi>{{ event.actorName }}</bdi></span
              >
            }
            <time [attr.datetime]="event.at">{{ event.at | tenantDate }}</time>
            @if (event.note) {
              <blockquote dir="auto">{{ event.note }}</blockquote>
            }
          </li>
        }
      </ol>
    </section>
  `,
  styles: `
    h2 {
      font-size: 1rem;
      margin: 1.5rem 0 0.5rem;
    }
    ol {
      list-style: none;
      margin: 0;
      padding: 0;
      border-inline-start: 2px solid var(--mat-sys-outline-variant);
    }
    li {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 0.75rem;
      padding: 0.375rem 0.75rem;
    }
    .what {
      font-weight: 500;
    }
    .who,
    time {
      color: var(--mat-sys-on-surface-variant);
    }
    blockquote {
      flex-basis: 100%;
      margin: 0.25rem 0 0;
      padding: 0.5rem 0.75rem;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-surface-container-high);
    }
  `,
})
export class ClaimTimeline {
  readonly events = input.required<TimelineEvent[]>();
  protected readonly ordered = computed(() =>
    [...this.events()].sort((a, b) => b.at.localeCompare(a.at)),
  );
}
