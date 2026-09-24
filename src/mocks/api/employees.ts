import { http, HttpResponse } from 'msw';
import { Employee, EmployeeCreate, EmployeeUpdate, FieldError } from '../../app/api/models';
import { db, nextId, save } from '../db';
import {
  denyUnless,
  EMAIL,
  idempotent,
  latency,
  matches,
  paged,
  problem,
  staleUnless,
  withEtag,
} from '../http-helpers';

export const employeeHandlers = [
  http.get('/api/v1/employees', async ({ request }) => {
    await latency();
    const denied = denyUnless('employees.read');
    if (denied) return denied;
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const status = url.searchParams.get('status');
    const departmentId = url.searchParams.get('departmentId');
    const items = db().employees.filter(
      (e) =>
        (matches(e.fullName, q) || matches(e.employeeNumber, q) || matches(e.email, q)) &&
        (!status || e.status === status) &&
        (!departmentId || e.departmentId === departmentId),
    );
    return HttpResponse.json(paged(items, url));
  }),

  http.post('/api/v1/employees', async ({ request }) => {
    await latency();
    const denied = denyUnless('employees.write');
    if (denied) return denied;
    return idempotent(request, async () => {
      const body = (await request.json()) as EmployeeCreate;
      const errors = validate(body);
      if (errors.length) return problem(422, 'VALIDATION_FAILED', errors);
      const employee: Employee = {
        id: nextId('emp'),
        employeeNumber: body.employeeNumber.trim(),
        fullName: body.fullName.trim(),
        email: body.email || null,
        phone: body.phone || null,
        departmentId: body.departmentId || null,
        departmentName: null,
        managerId: body.managerId || null,
        managerName: null,
        status: 'ACTIVE',
        userId: null,
        version: 1,
      };
      db().employees.push(employee);
      save();
      return { status: 201, body: employee };
    });
  }),

  http.get('/api/v1/employees/:employeeId', async ({ params }) => {
    await latency();
    const denied = denyUnless('employees.read');
    if (denied) return denied;
    const employee = db().employees.find((e) => e.id === params['employeeId']);
    return employee ? withEtag(employee) : problem(404, 'NOT_FOUND');
  }),

  http.patch('/api/v1/employees/:employeeId', async ({ request, params }) => {
    await latency();
    const denied = denyUnless('employees.write');
    if (denied) return denied;
    const employee = db().employees.find((e) => e.id === params['employeeId']);
    if (!employee) return problem(404, 'NOT_FOUND');
    const stale = staleUnless(request, employee.version);
    if (stale) return stale;
    const body = (await request.json()) as EmployeeUpdate;
    const errors = validate(body, employee.id);
    if (errors.length) return problem(422, 'VALIDATION_FAILED', errors);
    Object.assign(employee, {
      employeeNumber: body.employeeNumber.trim(),
      fullName: body.fullName.trim(),
      email: body.email || null,
      phone: body.phone || null,
      departmentId: body.departmentId || null,
      managerId: body.managerId || null,
      status: body.status,
      version: employee.version + 1,
    });
    save();
    return withEtag(db().employees.find((e) => e.id === employee.id)!);
  }),
];

/** Backend-owned rules from guide §5 "Employee": uniqueness within tenant, valid manager. */
function validate(body: EmployeeCreate, selfId?: string): FieldError[] {
  const store = db();
  const errors: FieldError[] = [];
  const number = body.employeeNumber?.trim() ?? '';
  if (!number) errors.push({ field: 'employeeNumber', code: 'REQUIRED' });
  else if (store.employees.some((e) => e.id !== selfId && e.employeeNumber === number)) {
    errors.push({ field: 'employeeNumber', code: 'DUPLICATE' });
  }
  if (!body.fullName?.trim()) errors.push({ field: 'fullName', code: 'REQUIRED' });
  if (body.email && !EMAIL.test(body.email)) errors.push({ field: 'email', code: 'INVALID_EMAIL' });
  if (body.departmentId && !store.departments.some((d) => d.id === body.departmentId)) {
    errors.push({ field: 'departmentId', code: 'NOT_FOUND' });
  }
  if (body.managerId) {
    const manager = store.employees.find((e) => e.id === body.managerId);
    if (body.managerId === selfId) errors.push({ field: 'managerId', code: 'SELF_MANAGER' });
    else if (!manager || manager.status !== 'ACTIVE') {
      errors.push({ field: 'managerId', code: 'MANAGER_INACTIVE' });
    }
  }
  return errors;
}
