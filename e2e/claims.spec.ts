import { expect, Page, test } from '@playwright/test';
import { signInAs } from './support';

/** Today in the tenant's time zone, so trips are never "in the future" for the mock rules. */
function tenantToday(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait' }).format(date);
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function uploadReceipt(page: Page, name: string, buffer = PNG, mimeType = 'image/png') {
  await page.getByTestId('receipt-input').setInputFiles({ name, mimeType, buffer });
}

async function chooseReceipt(page: Page, line: number, fileName: string) {
  await page.getByTestId(`trip-receipt-${line}`).click();
  await page.getByRole('option', { name: fileName }).click();
}

test('employee drafts, attaches a receipt, reloads and submits; server state persists (FE-004)', async ({
  page,
}) => {
  test.slow();
  await signInAs(page, 'employee', '/claims');
  await page.getByTestId('create-claim').click();
  await expect(page.getByRole('heading', { name: 'New claim' })).toBeVisible();

  await page.getByTestId('trip-date-0').fill(tenantToday());
  await page.getByTestId('trip-from-0').fill('Head office');
  await page.getByTestId('trip-to-0').fill('Customs office');
  await page.getByTestId('trip-amount-0').fill('5.5');
  await page.getByTestId('trip-amount-0').blur();
  await expect(page.getByTestId('trip-amount-0')).toHaveValue('5.500');
  await page.getByTestId('save-claim').click();

  await expect(page).toHaveURL(/\/claims\/clm_/);
  await expect(page.getByTestId('claim-status')).toHaveText('Draft');
  await expect(page.getByTestId('findings')).toContainText('A receipt is required');
  await expect(page.getByTestId('submit-claim')).toBeDisabled();

  await uploadReceipt(page, 'customs-taxi.png');
  const receipts = page.getByTestId('receipts-list');
  await expect(receipts).toContainText('Scanning');
  await expect(receipts).toContainText('Ready', { timeout: 15_000 });

  await chooseReceipt(page, 0, 'customs-taxi.png');
  await page.getByTestId('save-claim').click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await expect(page.getByTestId('findings')).toHaveCount(0);

  // Reload: everything shown comes back from the server.
  await page.reload();
  await expect(page.getByTestId('claim-total')).toContainText('KWD 5.500');
  await expect(page.getByTestId('trip-receipt-0')).toContainText('customs-taxi.png');

  await page.getByTestId('submit-claim').click();
  await expect(page.getByRole('dialog')).toContainText('Total KWD 5.500');
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('claim-status')).toHaveText('Submitted');
  await expect(page.getByTestId('save-claim')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('claim-status')).toHaveText('Submitted');
  await expect(page.getByTestId('timeline')).toContainText('Submitted');
});

test('unsupported and oversize files are refused and never attached (FE-005)', async ({ page }) => {
  await signInAs(page, 'employee', '/claims/clm_120');
  await expect(page.getByTestId('claim-status')).toHaveText('Draft');

  await page.getByTestId('receipt-input').setInputFiles([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    { name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024, 1) },
    { name: 'photo.pdf', mimeType: 'image/png', buffer: PNG },
  ]);

  await expect(page.getByTestId('pending-notes.txt')).toContainText('file type is not accepted');
  await expect(page.getByTestId('pending-huge.png')).toContainText('too large');
  // Extension and declared type disagree: refused before upload.
  await expect(page.getByTestId('pending-photo.pdf')).toContainText('file type is not accepted');
  await expect(page.getByText('No receipts attached.')).toBeVisible();
});

test('a file whose bytes do not match its type is rejected by the scan', async ({ page }) => {
  await signInAs(page, 'employee', '/claims/clm_120');
  await uploadReceipt(page, 'fake.png', Buffer.from('%PDF-1.7 not really a png'));
  await expect(page.getByTestId('receipts-list')).toContainText('does not match its type', {
    timeout: 15_000,
  });
});

test('employee answers a change request and resubmits (FE-007, employee side)', async ({
  page,
}) => {
  test.slow();
  await signInAs(page, 'employee', '/claims/clm_117');
  await expect(page.getByTestId('reviewer-note')).toContainText(
    'attach the receipt for the 12 August taxi',
  );
  await expect(page.getByTestId('submit-claim')).toBeDisabled();
  await expect(page.getByTestId('findings')).toContainText('Trip 1');

  await uploadReceipt(page, 'taxi-12-aug.png');
  await expect(page.getByTestId('receipts-list')).toContainText('Ready', { timeout: 15_000 });
  await chooseReceipt(page, 0, 'taxi-12-aug.png');
  await page.getByTestId('save-claim').click();
  await expect(page.getByTestId('submit-claim')).toBeEnabled();

  await page.getByTestId('submit-claim').click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('claim-status')).toHaveText('Submitted');
  await expect(page.getByTestId('timeline')).toContainText('Resubmitted');
});

test('Arabic digits and decimal separator are accepted in amounts', async ({ page }) => {
  await signInAs(page, 'employee', '/claims/clm_120');
  const amount = page.getByTestId('trip-amount-0');
  await amount.fill('٤٫٢٥');
  await amount.blur();
  await expect(amount).toHaveValue('4.250');
});

test.describe('policies', () => {
  test('a published version is locked; changes go through a new version (guide §5)', async ({
    page,
  }) => {
    await signInAs(page, 'admin', '/policies/pol_1');
    await expect(page.getByTestId('policy-immutable')).toBeVisible();
    await expect(page.getByTestId('policy-name')).toBeDisabled();
    await expect(page.getByTestId('save-policy')).toHaveCount(0);

    await page.getByTestId('new-version').click();
    await expect(page.getByTestId('policy-status')).toHaveText('Draft');
    await expect(page.getByTestId('policy-name')).toBeEnabled();

    // Server rule: per-trip limit cannot exceed the monthly limit.
    await page.getByTestId('policy-per-trip-limit').fill('99');
    await page.getByTestId('save-policy').click();
    await expect(page.getByText('cannot be higher than the monthly limit')).toBeVisible();

    await page.getByTestId('policy-per-trip-limit').fill('12');
    await page.getByTestId('policy-effective-from').fill(tenantToday(7));
    await page.getByTestId('save-policy').click();
    await expect(page.getByText('Policy draft saved.')).toBeVisible();

    await page.getByTestId('publish-policy').click();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('policy-status')).toHaveText('Published');
    await expect(page.getByTestId('policy-name')).toBeDisabled();
  });

  test('employees cannot open policy administration (FE-012)', async ({ page }) => {
    await signInAs(page, 'employee', '/policies');
    await expect(page.getByTestId('status-forbidden')).toBeVisible();
  });
});
