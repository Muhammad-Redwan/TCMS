import { Me } from '../app/api/models';

/** Fabricated users for mock mode and E2E tests. Never use real employee data here. */
const tenant = {
  id: 'ten_demo',
  displayName: 'Demo Logistics Co.',
  timezone: 'Asia/Kuwait',
  currency: 'KWD',
};

function persona(userId: string, displayName: string, permissions: string[]): Me {
  return {
    userId,
    displayName,
    email: `${userId}@demo.invalid`,
    locale: 'en',
    tenant,
    memberships: [{ id: tenant.id, displayName: tenant.displayName }],
    permissions,
  };
}

export const PERSONAS: Record<string, Me> = {
  employee: persona('usr_employee', 'Employee Demo', ['claims.create', 'claims.own.read']),
  approver: persona('usr_approver', 'Approver Demo', [
    'claims.create',
    'claims.own.read',
    'approvals.read',
    'approvals.decide',
  ]),
  finance: persona('usr_finance', 'Finance Demo', [
    'settlements.read',
    'settlements.export',
    'settlements.update',
  ]),
  hr: persona('usr_hr', 'HR Demo', ['employees.read', 'employees.write', 'employees.import']),
  admin: persona('usr_admin', 'Company Admin Demo', [
    'org.settings.read',
    'org.settings.write',
    'users.read',
    'users.write',
    'roles.manage',
    'employees.read',
    'policies.read',
    'policies.write',
  ]),
  platform: persona('usr_platform', 'Platform Operator Demo', [
    'platform.tenants.read',
    'platform.tenants.write',
  ]),
};

export const PERSONA_STORAGE_KEY = 'tcms.mock.persona';
