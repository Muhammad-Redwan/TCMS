import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';
import { takeReturnUrl } from './return-url';

/**
 * Requires a signed-in session. Anonymous users go to /login with the requested URL,
 * and after the gateway sends them back the stored URL is restored once.
 * Hiding UI is for usability only; the backend remains the authority (README §1).
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  try {
    const me = await session.load();
    if (!me) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
  } catch {
    return router.createUrlTree(['/error']);
  }
  // The gateway lands users on "/" after sign-in; only then does the stored URL apply.
  // Any other first navigation is an explicit link and wins, discarding the stale value.
  const returnUrl = takeReturnUrl();
  return state.url === '/' && returnUrl && returnUrl !== '/' ? router.parseUrl(returnUrl) : true;
};

/** Requires every listed permission; otherwise shows the forbidden page (A04). */
export function permissionGuard(...permissions: string[]): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    return permissions.every((p) => session.hasPermission(p))
      ? true
      : router.createUrlTree(['/403']);
  };
}
