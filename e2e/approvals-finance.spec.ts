import { expect, Page, test } from '@playwright/test';
import { signInAs } from './support';

/** Switches persona in the same browser context (mock mode) and opens `url`. */
async function switchTo(page: Page, persona: string, url: string): Promise<void> {
  await page.evaluate((p) => localStorage.setItem('tcms.mock.persona', p), persona);
  await page.goto(url);
  await expect(page.getByTestId('sign-out')).toBeVisible();
}

async function decide(page: Page, decision: string, reason?: string): Promise<void> {
  await page.getByTestId(`decision-${decision}`).locator('input').check();
  if (reason) await page.getByTestId('decision-reason').fill(reason);
  await page.getByTestId('submit-decision').click();
  await page.getByTestId('confirm').click();
}

test.describe('approvals', () => {
  test('employee submits, approver approves, employee sees it after refetch (FE-006)', async ({
    page,
  }) => {
    await signInAs(page, 'employee', '/claims/clm_120');
    await page.getByTestId('submit-claim').click();
    await page.getByTestId('confirm').click();
    await expect(page.getByTestId('claim-status')).toHaveText('Submitted');

    await switchTo(page, 'approver', '/approvals');
    await expect(page.getByTestId('approvals-table')).toContainText('CLM-2026-0120');
    await page.getByRole('link', { name: 'CLM-2026-0120' }).click();
    await expect(page.getByTestId('approval-total')).toContainText('KWD 2.000');
    await decide(page, 'APPROVE');
    await expect(page).toHaveURL(/\/approvals$/);
    await expect(page.getByText('CLM-2026-0120 approved.')).toBeVisible();
    await expect(page.getByTestId('approvals-table')).not.toContainText('CLM-2026-0120');

    await page.getByTestId('tab-decided').click();
    await expect(page.getByTestId('approvals-table')).toContainText('CLM-2026-0120');

    await switchTo(page, 'employee', '/claims/clm_120');
    await expect(page.getByTestId('claim-status')).toHaveText('Approved');
    await expect(page.getByTestId('timeline')).toContainText('Approver Demo');
  });

  test('rejecting or requesting changes needs a reason (FE-007, reviewer side)', async ({
    page,
  }) => {
    await signInAs(page, 'approver', '/approvals/clm_133');
    await expect(page.getByTestId('findings')).toContainText('CLM-2026-0098');

    await page.getByTestId('decision-REQUEST_CHANGES').locator('input').check();
    await page.getByTestId('submit-decision').click();
    await expect(page.getByText('This field is required.')).toBeVisible();
    await expect(page.getByTestId('decision-reason')).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByTestId('decision-reason').fill('Please attach the original taxi receipt.');
    await page.getByTestId('submit-decision').click();
    await page.getByTestId('confirm').click();
    await expect(page.getByText('Changes requested on CLM-2026-0133.')).toBeVisible();

    await page.getByTestId('tab-decided').click();
    await expect(page.getByTestId('approvals-table')).toContainText('Needs changes');
  });

  test('a decision made elsewhere first is never shown as successful (FE-010)', async ({
    page,
    context,
  }) => {
    await signInAs(page, 'approver', '/approvals/clm_132');
    const other = await context.newPage();
    await other.goto('/approvals/clm_132');
    await expect(other.getByTestId('decision-form')).toBeVisible();
    await expect(page.getByTestId('decision-form')).toBeVisible();

    await decide(other, 'APPROVE');
    await expect(other.getByText('CLM-2026-0132 approved.')).toBeVisible();

    await decide(page, 'REJECT', 'Duplicate of an earlier claim.');
    await expect(page.getByTestId('conflict')).toContainText(
      'Someone else decided this claim first',
    );
    await expect(page.getByText('CLM-2026-0132 rejected.')).toHaveCount(0);
    await expect(page.getByTestId('claim-status')).toHaveText('Approved');
    await expect(page.getByTestId('no-decision')).toBeVisible();
  });

  test('users without approval rights cannot open the queue (FE-012)', async ({ page }) => {
    await signInAs(page, 'employee', '/approvals');
    await expect(page.getByTestId('status-forbidden')).toBeVisible();
  });
});

test.describe('settlement', () => {
  test('export is not payment; payment evidence settles the claims (FE-008, FE-016)', async ({
    page,
  }) => {
    test.slow();
    await signInAs(page, 'finance', '/finance/settlements');
    await page.getByTestId('select-CLM-2026-0121').locator('input').check();
    await page.getByTestId('select-CLM-2026-0123').locator('input').check();
    await expect(page.getByTestId('selection-count')).toHaveText('2 selected');
    await page.getByTestId('create-batch').click();
    await page.getByTestId('confirm').click();

    await expect(page).toHaveURL(/\/finance\/settlements\/batches\/bat_/);
    await expect(page.getByTestId('batch-status')).toHaveText('Draft');
    await expect(page.getByTestId('batch-total')).toContainText('KWD 10.250');
    await expect(page.getByTestId('payment-waiting')).toBeVisible();

    await page.getByTestId('export-csv').click();
    await expect(page.getByTestId('batch-status')).toHaveText('Exporting');
    // Reload while the job runs: the page resumes from the batch's job id (FE-016).
    await page.reload();
    await expect(page.getByTestId('batch-status')).toHaveText('Exported, not paid', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('not-paid')).toContainText(
      'not paid until you record the payment',
    );
    await expect(page.getByTestId('exports')).toContainText('Export ID');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('exports').getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^SET-\d{4}-\d+\.csv$/);
    const csv = await (await download.createReadStream()).toArray();
    const text = Buffer.concat(csv).toString('utf8');
    expect(text).toContain('CLM-2026-0121');
    expect(text).toContain('CLM-2026-0123');

    await page.getByTestId('record-payment').click();
    await expect(page.getByText('This field is required.')).toBeVisible();
    await page.getByTestId('payment-reference').fill('NBK-TRX-500321');
    await page.getByTestId('record-payment').click();
    await page.getByTestId('confirm').click();

    await expect(page.getByTestId('batch-status')).toHaveText('Paid');
    await expect(page.getByTestId('payment-evidence')).toContainText('NBK-TRX-500321');
    await expect(page.getByTestId('export-csv')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Ready to settle' }).click();
    await expect(page.getByTestId('queue-table')).not.toContainText('CLM-2026-0121');
  });

  test('claims batched elsewhere meanwhile are refused and the queue refreshes', async ({
    page,
    context,
  }) => {
    await signInAs(page, 'finance', '/finance/settlements');
    const other = await context.newPage();
    await other.goto('/finance/settlements');

    await other.getByTestId('select-CLM-2026-0122').locator('input').check();
    await other.getByTestId('create-batch').click();
    await other.getByTestId('confirm').click();
    await expect(other).toHaveURL(/batches\/bat_/);

    await page.getByTestId('select-CLM-2026-0122').locator('input').check();
    await page.getByTestId('create-batch').click();
    await page.getByTestId('confirm').click();
    await expect(page.getByText('were added to another batch')).toBeVisible();
    await expect(page.getByTestId('queue-table')).not.toContainText('CLM-2026-0122');
  });
});

test.describe('approval routing (P02)', () => {
  test('admin adds a second approval above an amount', async ({ page }) => {
    await signInAs(page, 'admin', '/policies');
    await page.getByTestId('open-routing').click();
    await expect(page.getByRole('heading', { name: 'Approval routing' })).toBeVisible();

    await page.getByTestId('second-enabled').click();
    await page.getByTestId('save-route').click();
    await expect(page.getByText('This field is required.').first()).toBeVisible();

    await page.getByTestId('second-above').fill('25');
    await page.getByRole('combobox', { name: 'Second approver' }).fill('Layla');
    await page.getByRole('option', { name: /Layla/ }).first().click();
    await page.getByTestId('save-route').click();
    await expect(page.getByText('Approval routing saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('second-above')).toHaveValue('25.000');
    await expect(page.getByRole('combobox', { name: 'Second approver' })).toHaveValue(/Layla/);
  });
});
