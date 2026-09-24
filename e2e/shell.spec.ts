import { expect, Page, test } from '@playwright/test';

async function signInAs(page: Page, persona: string, startUrl = '/'): Promise<void> {
  await page.goto(startUrl);
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId('sign-in').click();
  await page.getByTestId(`persona-${persona}`).click();
  // Wait for the post-login page load to finish before the test navigates again.
  await expect(page.getByTestId('sign-out')).toBeVisible();
}

test('anonymous user is sent to sign-in and returns to the requested page', async ({ page }) => {
  await signInAs(page, 'employee', '/claims');

  await expect(page).toHaveURL(/\/claims$/);
  await expect(page.getByTestId('screen-C01')).toBeVisible();
  await expect(page.getByTestId('tenant-name')).toHaveText('Demo Logistics Co.');
});

test('navigation shows only what the persona may use (FE-012)', async ({ page }) => {
  await signInAs(page, 'employee');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });

  await expect(nav.getByRole('link', { name: 'My claims' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settlements' })).toHaveCount(0);
});

test('direct URL to a forbidden screen shows access denied (FE-012)', async ({ page }) => {
  await signInAs(page, 'employee');
  await page.goto('/finance/settlements');

  await expect(page.getByTestId('status-forbidden')).toBeVisible();
});

test('switching to Arabic flips the document to right-to-left (FE-014)', async ({ page }) => {
  await signInAs(page, 'approver');
  await page.getByTestId('switch-language').click();

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('sign out ends the session and protected pages require sign-in again (FE-018)', async ({
  page,
}) => {
  await signInAs(page, 'finance');
  await expect(page.getByTestId('welcome')).toBeVisible();

  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/finance/settlements');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId('welcome')).toHaveCount(0);
});
