import { http, HttpResponse } from 'msw';
import { Department, DepartmentWrite, OrganizationUpdate, SetupStatus } from '../../app/api/models';
import { db, nextId, save } from '../db';
import { denyUnless, idempotent, latency, problem, staleUnless, withEtag } from '../http-helpers';

const TIMEZONE = /^[A-Za-z_]+\/[A-Za-z_]+$/;
const CURRENCY = /^[A-Z]{3}$/;

export const organizationHandlers = [
  http.get('/api/v1/organization', async () => {
    await latency();
    return denyUnless('org.settings.read') ?? withEtag(db().organization);
  }),

  http.patch('/api/v1/organization', async ({ request }) => {
    await latency();
    const denied = denyUnless('org.settings.write');
    if (denied) return denied;
    const store = db();
    const stale = staleUnless(request, store.organization.version);
    if (stale) return stale;
    const body = (await request.json()) as OrganizationUpdate;
    const fieldErrors = [];
    if (!body.legalName?.trim()) fieldErrors.push({ field: 'legalName', code: 'REQUIRED' });
    if (!body.displayName?.trim()) fieldErrors.push({ field: 'displayName', code: 'REQUIRED' });
    if (!TIMEZONE.test(body.timezone ?? ''))
      fieldErrors.push({ field: 'timezone', code: 'INVALID_TIMEZONE' });
    if (!CURRENCY.test(body.currency ?? ''))
      fieldErrors.push({ field: 'currency', code: 'INVALID_CURRENCY' });
    if (fieldErrors.length) return problem(422, 'VALIDATION_FAILED', fieldErrors);
    store.organization = { ...body, version: store.organization.version + 1 };
    save();
    return withEtag(store.organization);
  }),

  http.get('/api/v1/organization/setup', async () => {
    await latency();
    const denied = denyUnless('org.settings.read');
    if (denied) return denied;
    const store = db();
    const assignedAccess = store.users.some((u) => u.roles.some((r) => r !== 'EMPLOYEE'));
    const steps: SetupStatus['steps'] = [
      { key: 'ORGANIZATION', status: store.organization.version > 1 ? 'DONE' : 'PENDING' },
      { key: 'ACCESS', status: assignedAccess ? 'DONE' : 'PENDING' },
      { key: 'EMPLOYEE_SOURCE', status: store.employees.length > 0 ? 'DONE' : 'PENDING' },
      { key: 'POLICY', status: 'NOT_AVAILABLE' },
    ];
    const ready = steps.every((s) => s.status !== 'PENDING');
    return HttpResponse.json({ ready, steps } satisfies SetupStatus);
  }),

  http.get('/api/v1/departments', async () => {
    await latency();
    return (
      denyUnless('org.settings.read', 'employees.read') ??
      HttpResponse.json([...db().departments].sort((a, b) => a.name.localeCompare(b.name)))
    );
  }),

  http.post('/api/v1/departments', async ({ request }) => {
    await latency();
    const denied = denyUnless('org.settings.write');
    if (denied) return denied;
    return idempotent(request, async () => {
      const body = (await request.json()) as DepartmentWrite;
      const invalid = validateDepartment(body);
      if (invalid) return invalid;
      const department: Department = {
        id: nextId('dep'),
        name: body.name.trim(),
        managerId: body.managerId ?? null,
        managerName: null,
        employeeCount: 0,
        version: 1,
      };
      db().departments.push(department);
      save();
      return { status: 201, body: department };
    });
  }),

  http.patch('/api/v1/departments/:departmentId', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('org.settings.write');
    if (denied) return denied;
    const department = db().departments.find((d) => d.id === params['departmentId']);
    if (!department) return problem(404, 'NOT_FOUND');
    const stale = staleUnless(request, department.version);
    if (stale) return stale;
    const body = (await request.json()) as DepartmentWrite;
    const invalid = validateDepartment(body, department.id);
    if (invalid) return invalid;
    Object.assign(department, {
      name: body.name.trim(),
      managerId: body.managerId ?? null,
      version: department.version + 1,
    });
    save();
    return HttpResponse.json(department);
  }),
];

function validateDepartment(body: DepartmentWrite, selfId?: string) {
  const store = db();
  const name = body.name?.trim() ?? '';
  if (!name) return problem(422, 'VALIDATION_FAILED', [{ field: 'name', code: 'REQUIRED' }]);
  const duplicate = store.departments.some(
    (d) => d.id !== selfId && d.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (duplicate) return problem(422, 'VALIDATION_FAILED', [{ field: 'name', code: 'DUPLICATE' }]);
  if (body.managerId) {
    const manager = store.employees.find((e) => e.id === body.managerId);
    if (!manager || manager.status !== 'ACTIVE') {
      return problem(422, 'VALIDATION_FAILED', [{ field: 'managerId', code: 'MANAGER_INACTIVE' }]);
    }
  }
  return null;
}
