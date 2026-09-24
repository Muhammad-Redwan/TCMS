import { http, HttpResponse } from 'msw';
import { FieldError, PolicyWrite } from '../../app/api/models';
import { currencyDigits } from '../../app/shared/format/money';
import { policyFor, todayIn, toMinor } from '../claims-engine';
import { MockPolicy } from '../claims-seed';
import { db, nextId, save } from '../db';
import { denyUnless, etagOf, idempotent, latency, problem, staleUnless } from '../http-helpers';

const MONEY = /^\d+(\.\d+)?$/;
const MODES = ['TAXI', 'RIDE_HAILING', 'BUS', 'METRO', 'PERSONAL_CAR', 'OTHER'];

/** Policies use `rev` for concurrency; `version` is the number people see. */
const withRev = (policy: MockPolicy, status = 200) =>
  HttpResponse.json(policy, { status, headers: { ETag: etagOf(policy.rev) } });

export const policyHandlers = [
  http.get('/api/v1/policies', async () => {
    await latency();
    const denied = denyUnless('policies.read');
    if (denied) return denied;
    const summaries = [...db().policies]
      .sort((a, b) => b.version - a.version)
      .map(({ id, name, status, version, effectiveFrom }) => ({
        id,
        name,
        status,
        version,
        effectiveFrom,
      }));
    return HttpResponse.json(summaries);
  }),

  http.get('/api/v1/policies/current', async () => {
    await latency();
    const denied = denyUnless('claims.create', 'policies.read');
    if (denied) return denied;
    const store = db();
    const policy = policyFor(todayIn(store.organization.timezone).slice(0, 7), store.policies);
    return policy ? HttpResponse.json(policy) : problem(404, 'NO_POLICY_IN_FORCE');
  }),

  http.post('/api/v1/policies', async ({ request }) => {
    await latency();
    const denied = denyUnless('policies.write');
    if (denied) return denied;
    return idempotent(request, async () => {
      const body = (await request.json()) as PolicyWrite;
      const errors = validate(body);
      if (errors.length) return problem(422, 'VALIDATION_FAILED', errors);
      const store = db();
      const policy: MockPolicy = {
        ...body,
        id: nextId('pol'),
        status: 'DRAFT',
        version: Math.max(0, ...store.policies.map((p) => p.version)) + 1,
        rev: 1,
        publishedAt: null,
      };
      store.policies.push(policy);
      save();
      return { status: 201, body: policy };
    });
  }),

  http.get('/api/v1/policies/:policyId', async ({ params }) => {
    await latency();
    const denied = denyUnless('policies.read');
    if (denied) return denied;
    const policy = db().policies.find((p) => p.id === params['policyId']);
    return policy ? withRev(policy) : problem(404, 'NOT_FOUND');
  }),

  http.put('/api/v1/policies/:policyId', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('policies.write');
    if (denied) return denied;
    const policy = db().policies.find((p) => p.id === params['policyId']);
    if (!policy) return problem(404, 'NOT_FOUND');
    const stale = staleUnless(request, policy.rev);
    if (stale) return stale;
    if (policy.status !== 'DRAFT') return problem(409, 'POLICY_NOT_EDITABLE');
    const body = (await request.json()) as PolicyWrite;
    const errors = validate(body);
    if (errors.length) return problem(422, 'VALIDATION_FAILED', errors);
    Object.assign(policy, body, { rev: policy.rev + 1 });
    save();
    return withRev(policy);
  }),

  http.post('/api/v1/policies/:policyId/publish', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('policies.write');
    if (denied) return denied;
    const store = db();
    const policy = store.policies.find((p) => p.id === params['policyId']);
    if (!policy) return problem(404, 'NOT_FOUND');
    const stale = staleUnless(request, policy.rev);
    if (stale) return stale;
    if (policy.status !== 'DRAFT') return problem(409, 'POLICY_NOT_EDITABLE');
    const overlap = store.policies.some(
      (p) => p.status === 'PUBLISHED' && p.effectiveFrom === policy.effectiveFrom,
    );
    if (overlap) {
      return problem(422, 'VALIDATION_FAILED', [
        { field: 'effectiveFrom', code: 'EFFECTIVE_DATE_TAKEN' },
      ]);
    }
    if (policy.effectiveFrom < todayIn(store.organization.timezone)) {
      return problem(422, 'VALIDATION_FAILED', [
        { field: 'effectiveFrom', code: 'EFFECTIVE_DATE_IN_PAST' },
      ]);
    }
    Object.assign(policy, {
      status: 'PUBLISHED',
      rev: policy.rev + 1,
      publishedAt: new Date().toISOString(),
    });
    save();
    return withRev(policy);
  }),

  http.post('/api/v1/policies/:policyId/new-version', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('policies.write');
    if (denied) return denied;
    return idempotent(request, async () => {
      const store = db();
      const source = store.policies.find((p) => p.id === params['policyId']);
      if (!source) return problem(404, 'NOT_FOUND');
      const draft: MockPolicy = {
        ...structuredClone(source),
        id: nextId('pol'),
        status: 'DRAFT',
        version: Math.max(...store.policies.map((p) => p.version)) + 1,
        rev: 1,
        effectiveFrom: todayIn(store.organization.timezone),
        publishedAt: null,
      };
      store.policies.push(draft);
      save();
      return { status: 201, body: draft };
    });
  }),
];

/** Backend-owned rules from guide §5 "Policy". */
function validate(body: PolicyWrite): FieldError[] {
  const errors: FieldError[] = [];
  if (!body.name?.trim()) errors.push({ field: 'name', code: 'REQUIRED' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom ?? '')) {
    errors.push({ field: 'effectiveFrom', code: 'REQUIRED' });
  }
  const digits = currencyDigits(body.currency ?? 'KWD');
  for (const field of ['monthlyLimit', 'perTripLimit', 'receiptRequiredAbove'] as const) {
    const value = body[field] ?? '';
    if (!MONEY.test(value)) errors.push({ field, code: 'INVALID_AMOUNT' });
    else if ((value.split('.')[1] ?? '').length > digits)
      errors.push({ field, code: 'TOO_MANY_DECIMALS' });
  }
  if (!errors.some((e) => e.field === 'perTripLimit' || e.field === 'monthlyLimit')) {
    if (toMinor(body.perTripLimit, digits) > toMinor(body.monthlyLimit, digits)) {
      errors.push({ field: 'perTripLimit', code: 'ABOVE_MONTHLY_LIMIT' });
    }
  }
  if (!body.allowedModes?.length || body.allowedModes.some((m) => !MODES.includes(m))) {
    errors.push({ field: 'allowedModes', code: 'REQUIRED' });
  }
  if (!Number.isInteger(body.submissionDeadlineDays) || body.submissionDeadlineDays < 0) {
    errors.push({ field: 'submissionDeadlineDays', code: 'INVALID_NUMBER' });
  }
  return errors;
}
