export interface NavItem {
  /** Screen ID from the frontend guide §3. */
  screenId: string;
  path: string;
  labelKey: string;
  /** Required permission; omitted means any signed-in user. Proposed names, backend authoritative. */
  permission?: string;
  /** Sprint that delivers the screen (strategy §3); shown on the placeholder page. */
  sprint: number;
}

/** MVP navigation in the order users meet it. Feature routes are generated from this list. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    screenId: 'T01',
    path: 'platform/tenants',
    labelKey: 'nav.tenants',
    permission: 'platform.tenants.read',
    sprint: 1,
  },
  {
    screenId: 'O01',
    path: 'organization',
    labelKey: 'nav.organization',
    permission: 'org.settings.read',
    sprint: 1,
  },
  {
    screenId: 'H01',
    path: 'hr/employees',
    labelKey: 'nav.employees',
    permission: 'employees.read',
    sprint: 1,
  },
  {
    screenId: 'I01',
    path: 'identity/users',
    labelKey: 'nav.users',
    permission: 'users.read',
    sprint: 2,
  },
  {
    screenId: 'P01',
    path: 'policies',
    labelKey: 'nav.policies',
    permission: 'org.settings.read',
    sprint: 3,
  },
  {
    screenId: 'C01',
    path: 'claims',
    labelKey: 'nav.claims',
    permission: 'claims.own.read',
    sprint: 3,
  },
  {
    screenId: 'V01',
    path: 'approvals',
    labelKey: 'nav.approvals',
    permission: 'approvals.read',
    sprint: 5,
  },
  {
    screenId: 'F01',
    path: 'finance/settlements',
    labelKey: 'nav.settlements',
    permission: 'settlements.read',
    sprint: 5,
  },
];
