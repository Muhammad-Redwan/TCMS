import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { ApiError } from '../errors/api-error';
import { SessionService } from '../session/session.service';
import { apiInterceptor } from './api.interceptor';
import { SKIP_LOGIN_REDIRECT } from './http-context';

const config: AppConfig = {
  apiBasePath: '/api',
  loginPath: '/oauth2/authorization/keycloak',
  logoutPath: '/logout',
  defaultLocale: 'en',
  supportedLocales: ['en', 'ar'],
  featureFlags: {},
};

describe('apiInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: { markExpired: ReturnType<typeof vi.fn>; redirectToLogin: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    session = { markExpired: vi.fn(), redirectToLogin: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: config },
        { provide: SessionService, useValue: session },
        { provide: Router, useValue: { url: '/claims/clm_1' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function failWith(
    status: number,
    body: object | null,
    context?: HttpContext,
  ): Promise<ApiError> {
    const result = firstValueFrom(http.get('/api/v1/claims', { context })).catch(
      (e: ApiError) => e,
    );
    backend.expectOne('/api/v1/claims').flush(body, { status, statusText: 'x' });
    return result as Promise<ApiError>;
  }

  it('marks API requests as XHR so the gateway answers 401 instead of redirecting', () => {
    http.get('/api/v1/me').subscribe();
    const request = backend.expectOne('/api/v1/me');
    expect(request.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    request.flush({});
  });

  it('leaves non-API requests untouched', () => {
    http.get('i18n/en.json').subscribe();
    const request = backend.expectOne('i18n/en.json');
    expect(request.request.headers.has('X-Requested-With')).toBe(false);
    request.flush({});
  });

  it('on 401 ends the session and redirects once to login with the current URL (FE-009)', async () => {
    const error = await failWith(401, { status: 401, code: 'UNAUTHENTICATED' });
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(session.markExpired).toHaveBeenCalledOnce();
    expect(session.redirectToLogin).toHaveBeenCalledWith('/claims/clm_1');
  });

  it('does not redirect when the caller expects 401', async () => {
    await failWith(401, null, new HttpContext().set(SKIP_LOGIN_REDIRECT, true));
    expect(session.redirectToLogin).not.toHaveBeenCalled();
  });

  it('on 403 returns FORBIDDEN without redirecting to login', async () => {
    const error = await failWith(403, { status: 403, code: 'FORBIDDEN', traceId: 't1' });
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', traceId: 't1' });
    expect(session.redirectToLogin).not.toHaveBeenCalled();
  });
});
