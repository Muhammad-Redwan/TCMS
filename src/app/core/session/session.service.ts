import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api/api';
import { getMe } from '../../api/functions';
import { Me } from '../../api/models';
import { APP_CONFIG } from '../config/app-config';
import { isApiError } from '../errors/api-error';
import { SKIP_LOGIN_REDIRECT } from '../http/http-context';
import { rememberReturnUrl } from './return-url';

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Browser view of the BFF session (D5). The SPA never sees tokens: it only knows
 * whether `/api/v1/me` succeeds, and redirects to the gateway to sign in or out.
 */
@Service()
export class SessionService {
  private readonly api = inject(Api);
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly window = inject(DOCUMENT).defaultView!;

  private readonly meState = signal<Me | null>(null);
  private readonly statusState = signal<SessionStatus>('unknown');
  private pending: Promise<Me | null> | null = null;
  private redirecting = false;

  readonly me = this.meState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly permissions = computed(() => new Set(this.meState()?.permissions ?? []));
  /** Prefix for any client-side cache key so data never crosses tenants or users. */
  readonly cacheScope = computed(() => {
    const me = this.meState();
    return me ? `${me.tenant.id}:${me.userId}` : null;
  });

  /** Loads the session once; concurrent callers share the same request. */
  load(): Promise<Me | null> {
    if (this.statusState() !== 'unknown') {
      return Promise.resolve(this.meState());
    }
    this.pending ??= this.api
      .invoke(getMe, undefined, new HttpContext().set(SKIP_LOGIN_REDIRECT, true))
      .then((me) => {
        this.meState.set(me);
        this.statusState.set('authenticated');
        return me;
      })
      .catch((error: unknown) => {
        if (isApiError(error) && error.status === 401) {
          this.statusState.set('anonymous');
          return null;
        }
        throw error;
      })
      .finally(() => (this.pending = null));
    return this.pending;
  }

  hasPermission(permission: string): boolean {
    return this.permissions().has(permission);
  }

  /** Full-page redirect to the gateway login; runs at most once per page load. */
  redirectToLogin(returnUrl?: string): void {
    if (this.redirecting) return;
    this.redirecting = true;
    if (returnUrl) rememberReturnUrl(returnUrl);
    this.window.location.assign(this.config.loginPath);
  }

  /** Marks the session as gone after the server reported 401 on any call. */
  markExpired(): void {
    this.clear();
    this.statusState.set('anonymous');
  }

  async logout(): Promise<void> {
    let destination = 'login';
    try {
      // Contract OPEN: the gateway is expected to answer 2xx with a Location header
      // (e.g. the Keycloak end-session URL) instead of a 302, which XHR cannot follow cross-origin.
      const response = await firstValueFrom(
        this.http.post(this.config.logoutPath, null, { observe: 'response', responseType: 'text' }),
      );
      destination = response.headers.get('Location') ?? destination;
    } catch (error) {
      if (!(error instanceof HttpErrorResponse) && !isApiError(error)) throw error;
      // Session already gone on the server: continue to clear local state.
    } finally {
      this.clear();
      this.statusState.set('anonymous');
    }
    this.window.location.assign(destination);
  }

  private clear(): void {
    this.meState.set(null);
    this.pending = null;
  }
}
