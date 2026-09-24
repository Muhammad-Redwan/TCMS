import { http, HttpResponse } from 'msw';
import { Job, Tenant, TenantCreate } from '../../app/api/models';
import { db, MockDb, nextId, save } from '../db';
import { denyUnless, EMAIL, idempotent, latency, matches, paged, problem } from '../http-helpers';

/** Provisioning timeline in mock mode: queued 1.5 s, then running with progress until 6 s. */
const QUEUED_MS = 1500;
const DONE_MS = 6000;
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

  http.get('/api/v1/jobs/:jobId', async ({ params }) => {
    await latency();
    const store = db();
    advanceJobs(store);
    const job = store.jobs.find((j) => j.id === params['jobId']);
    if (!job) return problem(404, 'NOT_FOUND');
    // Only the contract fields leave the mock; timing internals stay private.
    const publicJob: Job = {
      id: job.id,
      type: job.type,
      status: job.status,
      processed: job.processed,
      total: job.total,
      errorCode: job.errorCode,
      updatedAt: job.updatedAt,
    };
    return HttpResponse.json(publicJob);
  }),
];

/** Mock rule: a tenant whose name contains "fail" fails provisioning, to demo the FAILED state. */
function startProvisioning(
  store: MockDb,
  tenant: Tenant,
  fails = /fail/i.test(tenant.displayName),
) {
  const job = {
    id: nextId('job'),
    type: 'TENANT_PROVISIONING' as const,
    status: 'QUEUED' as Job['status'],
    processed: 0,
    total: STEPS,
    errorCode: null,
    updatedAt: new Date().toISOString(),
    startedAt: Date.now(),
    fails,
    tenantId: tenant.id,
  };
  store.jobs.push(job);
  Object.assign(tenant, {
    status: 'PROVISIONING',
    provisioningJobId: job.id,
    failureReference: null,
  });
}

/** Moves jobs (and their tenants) forward according to elapsed time. */
function advanceJobs(store: MockDb) {
  let changed = false;
  for (const job of store.jobs) {
    if (job.status === 'SUCCEEDED' || job.status === 'FAILED') continue;
    const elapsed = Date.now() - job.startedAt;
    const tenant = store.tenants.find((t) => t.id === job.tenantId);
    if (elapsed < QUEUED_MS) continue;
    if (elapsed < DONE_MS) {
      const processed = Math.min(
        STEPS - 1,
        Math.floor(((elapsed - QUEUED_MS) / (DONE_MS - QUEUED_MS)) * STEPS),
      );
      if (job.status !== 'RUNNING' || job.processed !== processed) {
        Object.assign(job, { status: 'RUNNING', processed, updatedAt: new Date().toISOString() });
        changed = true;
      }
      continue;
    }
    changed = true;
    if (job.fails) {
      Object.assign(job, {
        status: 'FAILED',
        errorCode: 'PROVISIONING_FAILED',
        updatedAt: new Date().toISOString(),
      });
      if (tenant)
        Object.assign(tenant, {
          status: 'FAILED',
          failureReference: `PRV-${job.id.slice(-4).toUpperCase()}`,
        });
    } else {
      Object.assign(job, {
        status: 'SUCCEEDED',
        processed: STEPS,
        updatedAt: new Date().toISOString(),
      });
      if (tenant) tenant.status = 'READY';
    }
  }
  if (changed) save();
}
