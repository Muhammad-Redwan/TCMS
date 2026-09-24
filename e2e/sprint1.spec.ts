import { expect, test } from '@playwright/test';
import { signInAs } from './support';

test.describe('tenants', () => {
  test('provisioning stays pending until the backend reports READY (FE-001)', async ({ page }) => {
    test.slow();
    await signInAs(page, 'platform', '/platform/tenants/new');

    await page.getByTestId('tenant-display-name').fill('Harbor Demo');
    await page.getByTestId('tenant-legal-name').fill('Harbor Demo W.L.L.');
    await page.getByTestId('tenant-admin-email').fill('admin@harbor.demo.invalid');
    await page.getByTestId('submit-tenant').click();

    await expect(page).toHaveURL(/\/platform\/tenants\/ten_/);
    await expect(page.getByTestId('tenant-status')).toHaveText('Provisioning');
    await expect(page.getByTestId('provisioning')).toContainText('Setting up the tenant');

    await expect(page.getByTestId('tenant-status')).toHaveText('Ready', { timeout: 20_000 });
    await expect(page.getByTestId('provisioning')).toContainText('admin@harbor.demo.invalid');
  });

  test('failed provisioning shows a support reference and can be retried', async ({ page }) => {
    test.slow();
    await signInAs(page, 'platform', '/platform/tenants/new');

    await page.getByTestId('tenant-display-name').fill('Mirage Fail Demo');
    await page.getByTestId('tenant-legal-name').fill('Mirage Demo W.L.L.');
    await page.getByTestId('tenant-admin-email').fill('admin@mirage.demo.invalid');
    await page.getByTestId('submit-tenant').click();

    await expect(page.getByTestId('tenant-status')).toHaveText('Failed', { timeout: 20_000 });
    await expect(page.getByTestId('failure-reference')).toHaveText(/^PRV-/);

    await page.getByTestId('retry-provisioning').click();
    await expect(page.getByTestId('tenant-status')).toHaveText('Provisioning');
    await expect(page.getByTestId('tenant-status')).toHaveText('Ready', { timeout: 20_000 });
  });

  test('status survives a reload mid-provisioning (FE-016)', async ({ page }) => {
    await signInAs(page, 'platform', '/platform/tenants/new');
    await page.getByTestId('tenant-display-name').fill('Reload Demo');
    await page.getByTestId('tenant-legal-name').fill('Reload Demo W.L.L.');
    await page.getByTestId('tenant-admin-email').fill('admin@reload.demo.invalid');
    await page.getByTestId('submit-tenant').click();
    await expect(page.getByTestId('tenant-status')).toHaveText('Provisioning');

    await page.reload();
    await expect(page.getByTestId('tenant-status')).toHaveText(/Provisioning|Ready/);
    await expect(page.getByTestId('tenant-status')).toHaveText('Ready', { timeout: 20_000 });
  });
});

test.describe('employees', () => {
  test('HR adds an employee who is then findable in the list (FE-002)', async ({ page }) => {
    await signInAs(page, 'hr', '/hr/employees');
    await page.getByTestId('create-employee').click();
    await expect(page.getByRole('heading', { name: 'New employee' })).toBeVisible();

    await page.getByLabel('Employee ID', { exact: true }).fill('E-9001');
    await page.getByLabel('Full name', { exact: true }).fill('Nadia Newhire');
    await page.getByLabel('Email', { exact: true }).fill('nadia@demo.invalid');
    await page.getByTestId('save-employee').click();

    await expect(page).toHaveURL(/\/hr\/employees\/emp_/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nadia Newhire');
    await expect(page.getByTestId('account-link')).toContainText('no sign-in account yet');

    await page.getByRole('link', { name: 'Employees' }).first().click();
    await page.getByTestId('employee-search').fill('Newhire');
    await expect(page).toHaveURL(/q=Newhire/);
    await expect(page.getByTestId('employees-table')).toContainText('E-9001');

    // The search lives in the URL, so a reload restores the same view.
    await page.reload();
    await expect(page.getByTestId('employee-search')).toHaveValue('Newhire');
    await expect(page.getByTestId('employees-table')).toContainText('Nadia Newhire');
  });

  test('a duplicate employee ID is shown on the field and input is kept (FE-013)', async ({
    page,
  }) => {
    await signInAs(page, 'hr', '/hr/employees/new');

    await page.getByLabel('Employee ID', { exact: true }).fill('E-1001');
    await page.getByLabel('Full name', { exact: true }).fill('Duplicate Person');
    await page.getByTestId('save-employee').click();

    await expect(page.getByText('This value is already in use.')).toBeVisible();
    await expect(page.getByLabel('Employee ID', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Duplicate Person');
    await expect(page).toHaveURL(/\/hr\/employees\/new$/);
  });

  test('a stale edit is rejected and never shown as saved (FE-010)', async ({ page, context }) => {
    await signInAs(page, 'hr', '/hr/employees/emp_005');
    const other = await context.newPage();
    await other.goto('/hr/employees/emp_005');

    await expect(page.getByLabel('Full name', { exact: true })).not.toHaveValue('');
    await expect(other.getByLabel('Full name', { exact: true })).not.toHaveValue('');

    await other.getByLabel('Phone', { exact: true }).fill('+965 1111 2222');
    await other.getByTestId('save-employee').click();
    await expect(other.getByText('Changes saved.')).toBeVisible();

    await page.getByLabel('Phone', { exact: true }).fill('+965 3333 4444');
    await page.getByTestId('save-employee').click();
    await expect(page.getByTestId('conflict')).toBeVisible();
    await expect(page.getByText('Changes saved.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Load latest version' }).click();
    await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('+965 1111 2222');
  });

  test('leaving a form with unsaved edits asks first', async ({ page }) => {
    await signInAs(page, 'hr', '/hr/employees/emp_006');
    await expect(page.getByLabel('Full name', { exact: true })).not.toHaveValue('');
    await page.getByLabel('Phone', { exact: true }).fill('+965 9999 0000');

    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page.getByRole('dialog')).toContainText('Leave without saving?');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/hr\/employees\/emp_006$/);
    await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('+965 9999 0000');
  });
});

test.describe('company admin', () => {
  test('setup checklist reflects backend state and profile save completes it', async ({ page }) => {
    await signInAs(page, 'admin');
    await expect(page.getByTestId('setup-banner')).toBeVisible();

    await page.goto('/setup');
    await expect(page.getByTestId('step-ORGANIZATION')).toContainText('To do');
    await expect(page.getByTestId('step-POLICY')).toContainText('Coming later');

    await page.goto('/organization');
    await page.getByLabel('Display name', { exact: true }).fill('Demo Logistics');
    await page.getByTestId('save-organization').click();
    await expect(page.getByText('Company profile saved.')).toBeVisible();

    await page.goto('/setup');
    await expect(page.getByTestId('step-ORGANIZATION')).toContainText('Done');
    await expect(page.getByTestId('setup-summary')).toContainText('Setup is complete');
  });

  test('backend role rules are shown to the admin', async ({ page }) => {
    await signInAs(page, 'admin', '/identity/users/usr_emp_001');
    await page.getByTestId('role-COMPANY_ADMIN').getByRole('checkbox').uncheck();
    await page.getByTestId('save-roles').click();
    await expect(page.getByTestId('roles-error')).toContainText('at least one company admin');
  });

  test('admin adds a department with a manager', async ({ page }) => {
    await signInAs(page, 'admin', '/organization/departments');
    await page.getByTestId('add-department').click();
    // The dialog focuses its first field once opened; typing earlier would be interrupted.
    await expect(page.getByTestId('department-name')).toBeFocused();
    await page.getByTestId('department-name').fill('Logistics');
    await page.getByRole('dialog').getByLabel('Manager', { exact: true }).fill('Omar');
    await page
      .getByRole('option', { name: /Omar Sample/ })
      .first()
      .click();
    await page.getByTestId('save-department').click();

    await expect(page.getByText('Department added.')).toBeVisible();
    const row = page.getByTestId('departments-table').getByRole('row', { name: /Logistics/ });
    await expect(row).toContainText('Omar Sample');
  });
});

test('HR cannot open user administration, even by URL (FE-012)', async ({ page }) => {
  await signInAs(page, 'hr', '/identity/users');
  await expect(page.getByTestId('status-forbidden')).toBeVisible();
});
