import { expect, Page } from '@playwright/test';

/** Signs in through the mock sign-in page and waits until the app shell is ready. */
export async function signInAs(page: Page, persona: string, startUrl = '/'): Promise<void> {
  await page.goto(startUrl);
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId('sign-in').click();
  await page.getByTestId(`persona-${persona}`).click();
  // Wait for the post-login page load to finish before the test navigates again.
  await expect(page.getByTestId('sign-out')).toBeVisible();
}
