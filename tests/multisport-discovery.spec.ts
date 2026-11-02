import { test, expect, api, discoveryFixtures } from './support/harness';
import { chooseLocation } from './support/ui';

test('real multideporte discovery preserves filters, pagination, URL history and compact mobile controls', async ({ page }) => {
  const fixture = await discoveryFixtures();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/partidos');
    await chooseLocation(page, 'Localidad seleccionada', 'Tolosa');
    const sports = page.getByRole('group', { name: '¿Qué querés jugar?', exact: true });
    const formats = page.getByRole('group', { name: 'Formato', exact: true });
    const dates = page.getByRole('group', { name: 'Fecha', exact: true });
    await sports.getByRole('button', { name: 'Fútbol', exact: true }).click();
    await formats.getByRole('button', { name: 'Fútbol 5', exact: true }).click();
    await dates.getByRole('button', { name: 'Elegir fecha', exact: true }).click();
    const response = page.waitForResponse(value => value.url().includes('/matches?') && new URL(value.url()).searchParams.get('date') === fixture.day && new URL(value.url()).searchParams.get('sportFormatId') !== null && value.status() === 200);
    await page.getByLabel('Fecha del partido', { exact: true }).fill(fixture.day);
    const firstPage = await (await response).json();
    expect(firstPage.total).toBe(10);
    expect(firstPage.pageSize).toBe(9);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items.every((match: { sport: { slug: string }; sportFormat: { slug: string } }) => match.sport.slug === 'futbol' && match.sportFormat.slug === 'futbol-5')).toBe(true);
    await expect(page.locator('article.match')).toHaveCount(9);
    await page.getByRole('button', { name: 'Cargar más partidos', exact: true }).click();
    await expect(page.locator('article.match')).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Cargar más partidos', exact: true })).toHaveCount(0);

    await sports.getByRole('button', { name: 'Pádel', exact: true }).click();
    await expect(page.locator('article.match')).toHaveCount(1);
    await expect(page.getByText(`${fixture.prefix} Pádel`, { exact: true })).toBeVisible();
    await expect(formats.getByRole('button', { name: 'Todos los formatos', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).searchParams.has('format')).toBe(false);
    await page.goBack();
    await expect(sports.getByRole('button', { name: 'Fútbol', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(formats.getByRole('button', { name: 'Fútbol 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('article.match')).toHaveCount(9);
    await page.goForward();
    await expect(page.getByText(`${fixture.prefix} Pádel`, { exact: true })).toBeVisible();

    await chooseLocation(page, 'Localidad seleccionada', 'City Bell');
    await expect(page.getByText('No encontramos partidos con estos filtros.', { exact: true })).toBeVisible();
    await expect(sports.getByRole('button', { name: 'Pádel', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await chooseLocation(page, 'Localidad seleccionada', 'Tolosa');
    await expect(page.getByText(`${fixture.prefix} Pádel`, { exact: true })).toBeVisible();
    await sports.getByRole('button', { name: 'Vóley', exact: true }).click();
    await expect(formats).toHaveCount(0);
    await expect(page.getByText(`${fixture.prefix} Vóley`, { exact: true })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.runtime/mvp02-discovery-mobile.png', fullPage: true, animations: 'disabled' });
    await expect(page.locator('article.match').first()).toBeInViewport();
    await expect(page.locator('article.match time').first()).toBeInViewport();
    const metrics = await sports.evaluate(element => {
      const buttons = [...element.querySelectorAll('button')];
      return { heights: buttons.map(button => button.getBoundingClientRect().height), documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth, groupHeight: element.getBoundingClientRect().height };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.heights.every(height => height >= 44)).toBe(true);
    expect(metrics.groupHeight).toBeLessThan(80);
    const all = sports.getByRole('button', { name: 'Todos los deportes', exact: true });
    await all.focus();
    await expect(all).toBeFocused();
    await all.press('Enter');
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('article.match')).toHaveCount(9);
    await dates.getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(page.getByText('No encontramos partidos con estos filtros.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    await expect(dates.getByRole('button', { name: 'Todas las fechas', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('article.match')).toHaveCount(9);
    expect(new URL(page.url()).searchParams.has('date')).toBe(false);
    const catalog = await page.request.get(`${api}/sports`);
    expect((await catalog.json()).items.map((sport: { name: string }) => sport.name)).toContain('Pádel');
  } finally {
    await fixture.cleanup();
  }
});
