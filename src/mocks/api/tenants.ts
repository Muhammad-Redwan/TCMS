import { http, HttpResponse } from 'msw';
import { Tenant, TenantCreate } from '../../app/api/models';
import { db, MockDb, nextId, save } from '../db';
import { denyUnless, EMAIL, idempotent, latency, matches, paged, problem } from '../http-helpers';
import { advanceJobs, onJobFinished, startJob } from '../jobs';

/** Provisioning steps shown as progress in mock mode. */
const STEPS = 4;

export const tenantHandlers = [
  http.get('/api/v1/platform/tenants', async ({ request }) => {
    await latency();
    const denied = denyUnless('platform.tenants.read');
    if (denied) return denied;
    advanceJobs(db());
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const status = url.searchParams.get('status');
    const items = db().tenants.filter(
      (t) =>
        (matches(t.displayName, q) || matches(t.adminEmail, q)) && (!status || t.status === status),
    );
    return HttpResponse.json(paged(items, url));
  }),

  http.post('/api/v1/platform/tenants', async ({ request }) => {
    await latency();
    const denied = denyUnless('platform.tenants.write');
    if (denied) return denied;
    return idempotent(request, async () => {
      const body = (await request.json()) as TenantCreate;
      const store = db();
      const fieldErrors = [];
      const name = body.displayName?.trim() ?? '';
      if (!name) fieldErrors.push({ field: 'displayName', code: 'REQUIRED' });
      else if (
        store.tenants.some((t) => t.displayName.toLocaleLowerCase() === name.toLocaleLowerCase())
      ) {
        fieldErrors.push({ field: 'displayName', code: 'DUPLICATE' });
      }
      if (!body.legalName?.trim()) fieldErrors.push({ field: 'legalName', code: 'REQUIRED' });
      if (!EMAIL.test(body.adminEmail ?? ''))
        fieldErrors.push({ field: 'adminEmail', code: 'INVALID_EMAIL' });
      if (fieldErrors.length) return problem(422, 'VALIDATION_FAILED', fieldErrors);

      const tenant: Tenant = {
        id: nextId('ten'),
        displayName: name,
        legalName: body.legalName.trim(),
        adminEmail: body.adminEmail,
        timezone: body.timezone,
        currency: body.currency,
        status: 'PROVISIONING',
        provisioningJobId: null,
        failureReference: null,
        createdAt: new Date().toISOString(),
      };
      startProvisioning(store, tenant);
      store.tenants.unshift(tenant);
      save();
      return { status: 202, body: tenant };
    });
  }),

  http.get('/api/v1/platform/tenants/:tenantId', async ({ params }) => {
    await latency();
    const denied = denyUnless('platform.tenants.read');
    if (denied) return denied;
    advanceJobs(db());
    const tenant = db().tenants.find((t) => t.id === params['tenantId']);
    return tenant ? HttpResponse.json(tenant) : problem(404, 'NOT_FOUND');
  }),

  http.post(
    '/api/v1/platform/tenants/:tenantId/provisioning/retry',
    async ({ request, params }) => {
      await latency();
      const denied = denyUnless('platform.tenants.write');
      if (denied) return denied;
      return idempotent(request, async () => {
        const store = db();
        const tenant = store.tenants.find((t) => t.id === params['tenantId']);
        if (!tenant) return problem(404, 'NOT_FOUND');
        if (tenant.status !== 'FAILED') return problem(409, 'CONFLICT');
        // Mock rule: a retry succeeds, even for names that failed the first time.
        startProvisioning(store, tenant, false);
        save();
        return { status: 202, body: tenant };
      });
    },
  ),
];

/** Mock rule: a tenant whose name contains "fail" fails provisioning, to demo the FAILED state. */
function startProvisioning(
  store: MockDb,
  tenant: Tenant,
  fails = /fail/i.test(tenant.displayName),
) {
  const job = startJob(store, 'TENANT_PROVISIONING', tenant.id, { total: STEPS, fails });
  Object.assign(tenant, {
    status: 'PROVISIONING',
    provisioningJobId: job.id,
    failureReference: null,
  });
}

onJobFinished('TENANT_PROVISIONING', (store, job, succeeded) => {
  const tenant = store.tenants.find((t) => t.id === job.subjectId);
  if (!tenant) return;
  if (succeeded) tenant.status = 'READY';
  else
    Object.assign(tenant, {
      status: 'FAILED',
      failureReference: `PRV-${job.id.slice(-4).toUpperCase()}`,
    });
});
