import { test, expect, discoveryFixtures, prismaFixture, hashFixturePassword } from './support/harness';

test('visitor shares a public match with a clean URL and external composers on mobile', async ({ page, context }) => {
  const fixture = await discoveryFixtures();
  const db = prismaFixture();
  try {
    const match = await db.match.findFirstOrThrow({ where: { venueName: `${fixture.prefix} Pádel` } });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (value: string) => { document.documentElement.dataset.copiedUrl = value; },
      } });
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/partidos/${match.id}?success=created&tracking=private#section`);
    const toggle = page.getByRole('button', { name: 'Compartir partido', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await toggle.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Compartir partido' })).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('button', { name: 'Otras aplicaciones', exact: true })).toHaveCount(0);
    const cleanUrl = `${new URL(page.url()).origin}/partidos/${match.id}`;
    await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
    await expect(page.getByText('Enlace copiado correctamente', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.copiedUrl)).toBe(cleanUrl);

    for (const [name, host] of [['WhatsApp', 'wa.me'], ['Telegram', 't.me'], ['X', 'x.com']]) {
      const link = page.getByRole('link', { name: new RegExp('^' + name + ' \\(') });
      const destination = new URL((await link.getAttribute('href'))!);
      expect(destination.protocol).toBe('https:');
      expect(destination.hostname).toBe(host);
      expect(destination.searchParams.get('text')).toContain('Pádel · Dobles en Tolosa');
      expect(destination.searchParams.get('text')).not.toContain('tracking=');
      expect(name === 'WhatsApp' ? destination.searchParams.get('text') : destination.searchParams.get('url')).toContain(cleanUrl);
      await expect(link).toHaveAttribute('rel', /noopener/);
      await expect(link).toHaveAttribute('rel', /noreferrer/);
      await context.route(`${destination.origin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<title>Share composer test</title>' }));
      const popupPromise = page.waitForEvent('popup');
      await link.click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      expect(new URL(popup.url()).hostname).toBe(host);
      await popup.close();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '.runtime/match-sharing-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Cerrar opciones para compartir' }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Copiar enlace', exact: true })).toBeHidden();
  } finally {
    await db.$disconnect();
    await fixture.cleanup();
  }
});

test('full future matches keep sharing available with manual copy fallback', async ({ page }) => {
  const fixture = await discoveryFixtures();
  const db = prismaFixture();
  try {
    const match = await db.match.findFirstOrThrow({ where: { venueName: `${fixture.prefix} Vóley` } });
    await db.match.update({ where: { id: match.id }, data: { status: 'CLOSED', availablePlaces: 0 } });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await page.goto(`/partidos/${match.id}?tracking=private`);
    await page.getByRole('button', { name: 'Compartir partido', exact: true }).click();
    await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
    const url = page.getByRole('textbox', { name: /enlace/i });
    await expect(url).toBeVisible();
    await expect(url).toHaveValue(`${new URL(page.url()).origin}/partidos/${match.id}`);
    await expect(url).toHaveAttribute('readonly', '');
    await url.focus();
    await expect(url).toBeFocused();
    await expect(page.getByText('Enlace copiado correctamente', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Telegram / })).toBeVisible();
  } finally {
    await db.$disconnect();
    await fixture.cleanup();
  }
});

test('authenticated organizer opens native sharing with only public text and URL', async ({ page }) => {
  const fixture = await discoveryFixtures();
  const db = prismaFixture();
  try {
    const match = await db.match.findFirstOrThrow({ where: { venueName: `${fixture.prefix} Pádel` } });
    const password = 'Sharing browser test 123!';
    const organizer = await db.user.update({ where: { id: match.organizerId }, data: {
      passwordHash: await hashFixturePassword(password), primaryLocationId: fixture.location.id,
    } });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
        document.documentElement.dataset.nativeShare = JSON.stringify(data);
      } });
    });
    await page.goto('/auth/login');
    await page.getByLabel('Email', { exact: true }).fill(organizer.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Partidos disponibles', exact: true })).toBeVisible();
    await page.goto(`/partidos/${match.id}?tracking=private`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Compartir partido', exact: true }).click();
    await page.getByRole('button', { name: 'Otras aplicaciones', exact: true }).click();
    const shared = await page.evaluate(() => JSON.parse(document.documentElement.dataset.nativeShare!));
    expect(shared).toEqual({
      url: `${new URL(page.url()).origin}/partidos/${match.id}`,
      text: expect.stringContaining('Pádel · Dobles en Tolosa'),
    });
    expect(shared.text).not.toContain(organizer.email);
    expect(shared.text).not.toContain(organizer.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '.runtime/match-sharing-desktop.png', fullPage: true });
  } finally {
    await db.$disconnect();
    await fixture.cleanup();
  }
});
