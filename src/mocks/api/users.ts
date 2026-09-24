import { http, HttpResponse } from 'msw';
import { UserRolesUpdate } from '../../app/api/models';
import { db, ROLES, save } from '../db';
import {
  denyUnless,
  latency,
  matches,
  paged,
  problem,
  staleUnless,
  withEtag,
} from '../http-helpers';

export const userHandlers = [
  http.get('/api/v1/users', async ({ request }) => {
    await latency();
    const denied = denyUnless('users.read');
    if (denied) return denied;
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const status = url.searchParams.get('status');
    const items = db().users.filter(
      (u) => (matches(u.displayName, q) || matches(u.email, q)) && (!status || u.status === status),
    );
    return HttpResponse.json(paged(items, url));
  }),

  http.get('/api/v1/users/:userId', async ({ params }) => {
    await latency();
    const denied = denyUnless('users.read');
    if (denied) return denied;
    const user = db().users.find((u) => u.id === params['userId']);
    return user ? withEtag(user) : problem(404, 'NOT_FOUND');
  }),

  http.put('/api/v1/users/:userId/roles', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('roles.manage');
    if (denied) return denied;
    const user = db().users.find((u) => u.id === params['userId']);
    if (!user) return problem(404, 'NOT_FOUND');
    const stale = staleUnless(request, user.version);
    if (stale) return stale;
    const body = (await request.json()) as UserRolesUpdate;
    const known = new Set(ROLES.map((r) => r.key));
    if (body.roles.some((r) => !known.has(r))) {
      return problem(422, 'VALIDATION_FAILED', [{ field: 'roles', code: 'UNKNOWN_ROLE' }]);
    }
    // Backend rule example: a tenant must keep at least one company admin.
    const admins = db().users.filter((u) => u.id !== user.id && u.roles.includes('COMPANY_ADMIN'));
    if (
      !body.roles.includes('COMPANY_ADMIN') &&
      user.roles.includes('COMPANY_ADMIN') &&
      admins.length === 0
    ) {
      return problem(422, 'VALIDATION_FAILED', [{ field: 'roles', code: 'LAST_ADMIN' }]);
    }
    Object.assign(user, { roles: [...body.roles], version: user.version + 1 });
    save();
    return withEtag(user);
  }),

  http.get('/api/v1/roles', async () => {
    await latency();
    return denyUnless('users.read') ?? HttpResponse.json(ROLES);
  }),
];
