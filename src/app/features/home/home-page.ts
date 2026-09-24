import { Component, computed, inject, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api/api';
import { getSetupStatus } from '../../api/functions';
import { SessionService } from '../../core/session/session.service';

/** Signed-in landing page. Shows the session context returned by /me. */
@Component({
  selector: 'app-home-page',
  imports: [TranslocoPipe, RouterLink, MatButton],
  template: `
    @if (session.me(); as me) {
      <h1 data-testid="welcome">{{ 'home.welcome' | transloco: { name: me.displayName } }}</h1>
      @if (setup.value()?.ready === false) {
        <div class="setup-banner" role="status" data-testid="setup-banner">
          <p>{{ 'home.setupPending' | transloco }}</p>
          <a matButton="filled" routerLink="/setup">{{ 'home.setupLink' | transloco }}</a>
        </div>
      }
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
    .setup-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      max-width: 48rem;
      padding: 0.75rem 1rem;
      margin-block-end: 1.5rem;
      border-radius: var(--mat-sys-corner-medium);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      p {
        margin: 0;
      }
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
  private readonly api = inject(Api);
  protected readonly session = inject(SessionService);
  private readonly isAdmin = computed(() => this.session.permissions().has('org.settings.write'));

  /** Only company admins see setup progress; others never call the endpoint. */
  protected readonly setup = resource({
    params: () => (this.isAdmin() ? true : undefined),
    loader: () => this.api.invoke(getSetupStatus),
  });
}
