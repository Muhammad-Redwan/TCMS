import { Department, Employee, Job, Organization, Role, Tenant, User } from '../app/api/models';

/**
 * In-browser fake backend state for mock mode. All names and identifiers are fabricated.
 * Saved to localStorage so reloads keep changes, like a real server would.
 */
export interface MockDb {
  organization: Organization;
  departments: Department[];
  employees: Employee[];
  tenants: Tenant[];
  /** Jobs store their start time so status advances with the clock. */
  jobs: (Job & { startedAt: number; fails: boolean; tenantId?: string })[];
  users: User[];
  idempotency: Record<string, { status: number; body: unknown }>;
  seq: number;
}

const STORAGE_KEY = 'tcms.mock.db';

export const ROLES: Role[] = [
  { key: 'EMPLOYEE', permissions: ['claims.create', 'claims.own.read'] },
  { key: 'APPROVER', permissions: ['approvals.read', 'approvals.decide'] },
  { key: 'FINANCE', permissions: ['settlements.read', 'settlements.export', 'settlements.update'] },
  { key: 'HR', permissions: ['employees.read', 'employees.write', 'employees.import'] },
  {
    key: 'COMPANY_ADMIN',
    permissions: [
      'org.settings.read',
      'org.settings.write',
      'users.read',
      'users.write',
      'roles.manage',
    ],
  },
];

const FIRST_NAMES = [
  'Sara',
  'Omar',
  'Layla',
  'Yousef',
  'Noura',
  'Khalid',
  'Maryam',
  'Fahad',
  'Huda',
  'Ali',
  'Reem',
  'Hamad',
  'Dana',
  'Saad',
  'Aisha',
  'Talal',
  'Mona',
  'Bader',
  'Lulwa',
  'Nasser',
  'Priya',
  'Jose',
  'Anna',
  'Rahul',
  'Grace',
  'Mark',
  'Fatima',
  'Ahmed',
  'Hessa',
  'Ibrahim',
];
const LAST_NAMES = ['Demo', 'Sample', 'Example', 'Test', 'Placeholder', 'Mock'];
/** A few Arabic-script names so RTL/bidi handling is exercised in lists and forms. */
const ARABIC_NAMES = ['سارة التجريبية', 'عمر النموذجي', 'ليلى المثال', 'يوسف الافتراضي'];

function seed(): MockDb {
  const departments: Department[] = [
    {
      id: 'dep_ops',
      name: 'Operations',
      managerId: 'emp_001',
      managerName: null,
      employeeCount: 0,
      version: 1,
    },
    {
      id: 'dep_fin',
      name: 'Finance',
      managerId: 'emp_002',
      managerName: null,
      employeeCount: 0,
      version: 1,
    },
    {
      id: 'dep_hr',
      name: 'Human Resources',
      managerId: 'emp_003',
      managerName: null,
      employeeCount: 0,
      version: 1,
    },
    {
      id: 'dep_sales',
      name: 'Sales',
      managerId: null,
      managerName: null,
      employeeCount: 0,
      version: 1,
    },
    { id: 'dep_it', name: 'IT', managerId: null, managerName: null, employeeCount: 0, version: 1 },
  ];

  const employees: Employee[] = [];
  for (let i = 1; i <= 42; i++) {
    const dep = departments[i % departments.length];
    const fullName =
      i % 11 === 0
        ? ARABIC_NAMES[(i / 11 - 1) % ARABIC_NAMES.length]
        : `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
    const id = `emp_${String(i).padStart(3, '0')}`;
    employees.push({
      id,
      employeeNumber: `E-${String(1000 + i)}`,
      fullName,
      email: `employee${i}@demo.invalid`,
      phone: i % 3 === 0 ? null : `+965 5000 ${String(1000 + i)}`,
      departmentId: dep.id,
      departmentName: dep.name,
      managerId: i > 3 ? `emp_00${(i % 3) + 1}` : null,
      managerName: null,
      status: i % 9 === 0 ? 'INACTIVE' : 'ACTIVE',
      userId: i % 4 === 0 ? null : `usr_${id}`,
      version: 1,
    });
  }

  const users: User[] = employees
    .filter((e) => e.userId)
    .slice(0, 25)
    .map((e, index) => ({
      id: e.userId!,
      displayName: e.fullName,
      email: e.email!,
      status: e.status === 'INACTIVE' ? 'DISABLED' : index % 7 === 6 ? 'INVITED' : 'ACTIVE',
      employeeId: e.id,
      roles:
        index === 0
          ? ['EMPLOYEE', 'COMPANY_ADMIN']
          : index < 3
            ? ['EMPLOYEE', 'APPROVER']
            : ['EMPLOYEE'],
      version: 1,
    }));

  const now = Date.now();
  const tenants: Tenant[] = [
    tenant('ten_demo', 'Demo Logistics Co.', 'READY', now - 90 * 864e5),
    tenant('ten_gulf', 'Gulf Freight Demo', 'READY', now - 60 * 864e5),
    tenant('ten_desert', 'شركة الصحراء التجريبية', 'READY', now - 30 * 864e5),
    {
      ...tenant('ten_broken', 'Broken Setup Demo', 'FAILED', now - 2 * 864e5),
      failureReference: 'PRV-7F3A',
    },
  ];

  const db: MockDb = {
    organization: {
      legalName: 'Demo Logistics Company W.L.L.',
      displayName: 'Demo Logistics Co.',
      timezone: 'Asia/Kuwait',
      currency: 'KWD',
      defaultLocale: 'en',
      version: 1,
    },
    departments,
    employees,
    tenants,
    jobs: [],
    users,
    idempotency: {},
    seq: 1000,
  };
  refreshDerived(db);
  return db;
}

function tenant(
  id: string,
  displayName: string,
  status: Tenant['status'],
  createdAt: number,
): Tenant {
  return {
    id,
    displayName,
    legalName: `${displayName} (legal)`,
    adminEmail: `admin@${id}.demo.invalid`,
    timezone: 'Asia/Kuwait',
    currency: 'KWD',
    status,
    provisioningJobId: null,
    failureReference: null,
    createdAt: new Date(createdAt).toISOString(),
  };
}

/** Recomputes denormalized names and counts after any write. */
export function refreshDerived(db: MockDb): void {
  const byId = new Map(db.employees.map((e) => [e.id, e]));
  const deps = new Map(db.departments.map((d) => [d.id, d]));
  for (const e of db.employees) {
    e.departmentName = e.departmentId ? (deps.get(e.departmentId)?.name ?? null) : null;
    e.managerName = e.managerId ? (byId.get(e.managerId)?.fullName ?? null) : null;
  }
  for (const d of db.departments) {
    d.managerName = d.managerId ? (byId.get(d.managerId)?.fullName ?? null) : null;
    d.employeeCount = db.employees.filter((e) => e.departmentId === d.id).length;
  }
}

const REVISION_KEY = 'tcms.mock.db.rev';
let cache: MockDb | null = null;
let cachedRevision: string | null = null;

/**
 * Current state. Every tab runs its own handlers, so like a real shared server the state is
 * re-read whenever another tab has written since (otherwise stale-edit checks would pass).
 */
export function db(): MockDb {
  const revision = readRevision();
  if (cache && revision === cachedRevision) return cache;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    cache = stored ? (JSON.parse(stored) as MockDb) : seed();
  } catch {
    cache = seed();
  }
  cachedRevision = revision;
  return cache;
}

export function save(): void {
  if (!cache) return;
  refreshDerived(cache);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    cachedRevision = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(REVISION_KEY, cachedRevision);
  } catch {
    // Storage full or blocked: keep in memory only.
  }
}

function readRevision(): string | null {
  try {
    return localStorage.getItem(REVISION_KEY);
  } catch {
    return null;
  }
}

export function resetDb(): void {
  cache = seed();
  save();
}

export function nextId(prefix: string): string {
  const store = db();
  store.seq += 1;
  return `${prefix}_${store.seq}`;
}
