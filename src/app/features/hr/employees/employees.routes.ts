import { Routes } from '@angular/router';
import { permissionGuard } from '../../../core/session/guards';
import { unsavedChangesGuard } from '../../../shared/forms/unsaved-changes.guard';

export const EMPLOYEE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./employee-list.page').then((m) => m.EmployeeListPage),
  },
  {
    path: 'new',
    canActivate: [permissionGuard('employees.write')],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./employee-form.page').then((m) => m.EmployeeFormPage),
  },
  {
    path: ':employeeId',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./employee-form.page').then((m) => m.EmployeeFormPage),
  },
];
