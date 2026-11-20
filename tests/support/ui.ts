import { expect, type Page } from '@playwright/test';

export async function chooseLocation(page: Page, label: string, location: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  const search = page.getByPlaceholder('Buscar localidad…');
  await search.fill(location);
  await expect(page.getByRole('option', { name: location, exact: true })).toBeVisible();
  // Exercise cmdk keyboard navigation as well as persistent selection.
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByRole('combobox', { name: label, exact: true })).toContainText(location);
}

export async function openAccountMenu(page: Page) {
  // UI-02 deliberately exposes account navigation only at the desktop breakpoint.
  if ((page.viewportSize()?.width ?? 1024) < 640) {
    await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toBeHidden();
    await page.setViewportSize({ width: 1024, height: 812 });
  }
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
}

export async function logout(page: Page) {
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
}

export async function expectHomeLocation(page: Page, location: string) {
  await expect(page.getByRole('heading', { name: 'Partidos disponibles', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Localidad seleccionada', exact: true })).toContainText(location);
}
