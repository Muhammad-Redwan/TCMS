import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MatButton } from '@angular/material/button';
import { LocaleService } from '../../core/i18n/locale.service';
import { isSafeReturnUrl } from '../../core/session/return-url';
import { SessionService } from '../../core/session/session.service';

/**
 * Sign-in landing (A01). Credentials are never entered in the SPA: the button hands off
 * to the gateway, which runs OIDC with Keycloak (D5). Already signed-in users skip ahead.
 */
@Component({
  selector: 'app-login-page',
  imports: [TranslocoPipe, MatButton],
  template: `
    <main class="login" id="main">
      <div class="panel">
        <p class="app-name">{{ 'app.fullName' | transloco }}</p>
        <h1>{{ 'login.title' | transloco }}</h1>
        <p>{{ 'login.body' | transloco }}</p>
        <button matButton="filled" type="button" (click)="signIn()" data-testid="sign-in">
          {{ 'login.action' | transloco }}
        </button>
        <button
          matButton
          type="button"
          [attr.aria-label]="'shell.switchLanguageLabel' | transloco"
          (click)="switchLanguage()"
        >
          {{ 'shell.switchLanguage' | transloco }}
        </button>
      </div>
    </main>
  `,
  styles: `
    .login {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 1rem;
    }
    .panel {
      width: min(28rem, 100%);
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
      background: var(--mat-sys-surface);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-medium);
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
    }
    p {
      margin: 0;
    }
    .app-name {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
  `,
})
export class LoginPage implements OnInit {
  private readonly session = inject(SessionService);
  private readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  private readonly returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl');

  async ngOnInit(): Promise<void> {
    try {
      if (await this.session.load()) {
        await this.router.navigateByUrl(isSafeReturnUrl(this.returnUrl) ? this.returnUrl : '/');
      }
    } catch {
      // Backend unreachable: stay here; signing in will surface the problem.
    }
  }

  protected signIn(): void {
    this.session.redirectToLogin(isSafeReturnUrl(this.returnUrl) ? this.returnUrl : undefined);
  }

  protected switchLanguage(): void {
    void this.locale.toggle();
  }
}
