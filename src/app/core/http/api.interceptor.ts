import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { toApiError } from '../errors/api-error';
import { SessionService } from '../session/session.service';
import { SKIP_LOGIN_REDIRECT } from './http-context';

/**
 * Applies to same-origin API calls only:
 * - marks them as XHR so the gateway answers 401 instead of redirecting to the login page;
 * - turns every failure into an ApiError (ProblemDetail, D8);
 * - on 401, ends the local session and redirects once to the gateway login.
 * CSRF is handled by Angular's built-in XSRF support (cookie XSRF-TOKEN -> header X-XSRF-TOKEN),
 * which matches Spring Security's CookieCsrfTokenRepository defaults.
 */
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(APP_CONFIG);
  if (!request.url.startsWith(config.apiBasePath)) {
    return next(request);
  }

  const session = inject(SessionService);
  const router = inject(Router);

  return next(request.clone({ setHeaders: { 'X-Requested-With': 'XMLHttpRequest' } })).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }
      if (error.status === 401 && !request.context.get(SKIP_LOGIN_REDIRECT)) {
        session.markExpired();
        session.redirectToLogin(router.url);
      }
      return throwError(() => toApiError(error));
    }),
  );
};
