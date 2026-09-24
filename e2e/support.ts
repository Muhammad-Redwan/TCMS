import { expect, Page } from '@playwright/test';

/** Signs in through the mock sign-in page and waits until the app shell is ready. */
export async function signInAs(page: Page, persona: string, startUrl = '/'): Promise<void> {
  await page.goto(startUrl);
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId('sign-in').click();
  await page.getByTestId(`persona-${persona}`).click();
  // Wait for the post-login page load to finish before the test navigates again. The first
  // visit to a lazy route compiles it in the dev server, which is slow under parallel load.
  await expect(page.getByTestId('sign-out')).toBeVisible({ timeout: 15_000 });
}
