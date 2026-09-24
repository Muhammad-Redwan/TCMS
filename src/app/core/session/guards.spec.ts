import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { authGuard, permissionGuard } from './guards';
import { rememberReturnUrl } from './return-url';
import { SessionService } from './session.service';

describe('route guards', () => {
  let session: { load: ReturnType<typeof vi.fn>; hasPermission: (p: string) => boolean };
  let granted: Set<string>;

  beforeEach(() => {
    sessionStorage.clear();
    granted = new Set();
    session = { load: vi.fn(), hasPermission: (p) => granted.has(p) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SessionService, useValue: session }],
    });
  });

  const run = (guard: typeof authGuard, url: string) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree> | boolean | UrlTree;

  const serialize = (result: boolean | UrlTree) =>
    result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;

  it('sends anonymous users to /login with the requested URL', async () => {
    session.load.mockResolvedValue(null);
    expect(serialize(await run(authGuard, '/claims'))).toBe('/login?returnUrl=%2Fclaims');
  });

  it('shows the error page when the session cannot be loaded', async () => {
    session.load.mockRejectedValue({ status: 503 });
    expect(serialize(await run(authGuard, '/claims'))).toBe('/error');
  });

  it('restores the stored return URL once after sign-in', async () => {
    session.load.mockResolvedValue({ userId: 'u1' });
    rememberReturnUrl('/approvals');
    expect(serialize(await run(authGuard, '/'))).toBe('/approvals');
    expect(await run(authGuard, '/')).toBe(true);
  });

  it('lets an explicit deep link win over a stale stored return URL', async () => {
    session.load.mockResolvedValue({ userId: 'u1' });
    rememberReturnUrl('/approvals');
    expect(await run(authGuard, '/claims')).toBe(true);
    expect(await run(authGuard, '/')).toBe(true);
  });

  it('routes to /403 when a permission is missing, even for a direct URL (FE-012)', () => {
    const guard = permissionGuard('approvals.read');
    expect(serialize(run(guard, '/approvals') as UrlTree)).toBe('/403');
    granted.add('approvals.read');
    expect(run(guard, '/approvals')).toBe(true);
  });
});
