import { inject } from '@angular/core';
import { Api } from '../../api/api';
import { listEmployees, listUsers } from '../../api/functions';
import { PickerSearch } from './search-picker';

/** Active employees by name, number or email. Call in an injection context. */
export function employeeSearch(): PickerSearch {
  const api = inject(Api);
  return async (q) => {
    const page = await api.invoke(listEmployees, {
      q: q || undefined,
      status: 'ACTIVE',
      size: 10,
      sort: 'fullName,asc',
    });
    return page.content.map((e) => ({ id: e.id, label: e.fullName, detail: e.employeeNumber }));
  };
}

/** Active sign-in users by name or email. Call in an injection context. */
export function userSearch(): PickerSearch {
  const api = inject(Api);
  return async (q) => {
    const page = await api.invoke(listUsers, {
      q: q || undefined,
      status: 'ACTIVE',
      size: 10,
      sort: 'displayName,asc',
    });
    return page.content.map((u) => ({ id: u.id, label: u.displayName, detail: u.email }));
  };
}
