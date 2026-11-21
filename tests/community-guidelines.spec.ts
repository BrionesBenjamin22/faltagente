import { expect, test } from '@playwright/test';

test('public community guidelines are reachable from the footer with the keyboard', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('contentinfo').getByRole('link', { name: 'Normas comunitarias' });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/normas$/);
  await expect(page.getByRole('heading', { name: 'Normas comunitarias', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quejas y sugerencias', exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/Normas comunitarias/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL(/\/$/);
});
