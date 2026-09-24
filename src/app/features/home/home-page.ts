import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SessionService } from '../../core/session/session.service';

/** Signed-in landing page. Shows the session context returned by /me. */
@Component({
  selector: 'app-home-page',
  imports: [TranslocoPipe],
  template: `
    @if (session.me(); as me) {
      <h1 data-testid="welcome">{{ 'home.welcome' | transloco: { name: me.displayName } }}</h1>
      <dl>
        <dt>{{ 'home.tenant' | transloco }}</dt>
        <dd>
          <bdi>{{ me.tenant.displayName }}</bdi>
        </dd>
        <dt>{{ 'home.timezone' | transloco }}</dt>
        <dd>
          <span dir="ltr">{{ me.tenant.timezone }}</span>
        </dd>
        <dt>{{ 'home.currency' | transloco }}</dt>
        <dd>
          <span dir="ltr">{{ me.tenant.currency }}</span>
        </dd>
        <dt>{{ 'home.permissions' | transloco }}</dt>
        <dd>
          <ul>
            @for (permission of me.permissions; track permission) {
              <li>
                <code dir="ltr">{{ permission }}</code>
              </li>
            }
          </ul>
        </dd>
      </dl>
    }
  `,
  styles: `
    h1 {
      font-size: 1.5rem;
      margin-block: 0 1rem;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.5rem 1.5rem;
      margin: 0;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    dd,
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class HomePage {
  protected readonly session = inject(SessionService);
}
