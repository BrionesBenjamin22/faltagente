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
  // The mobile icon and desktop trigger share the same accessible name.
  const trigger = page.getByRole('button', { name: 'Mi cuenta', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Perfil', exact: true })).toBeVisible();
}

export async function logout(page: Page) {
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
}

export async function expectHomeLocation(page: Page, location: string) {
  await expect(page.getByRole('heading', { name: 'Partidos disponibles', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Localidad seleccionada', exact: true })).toContainText(location);
  await expect(page.getByRole('button', { name: 'Todas las localidades', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => new URL(page.url()).searchParams.has('location')).toBe(true);
}

export async function expectHomeDiscovery(page: Page) {
  await expect(page.getByRole('heading', { name: 'Partidos disponibles', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Todas las localidades', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => new URL(page.url()).searchParams.has('location')).toBe(false);
}
